/**
 * Ultra-Lightweight Code Execution Sandbox (0 MB idle RAM, < 3 ms startup overhead).
 *
 * Security & resource defense-in-depth without spawning heavy Docker containers:
 * 1. Clean Stripped Environment: student processes never inherit JWT_SECRET, DB creds, or AI keys.
 * 2. Concurrency Semaphore: protects 1-2 vCPU VPS servers under classroom bursts.
 * 3. Linux Native Kernel Limits (when present): `prlimit` (AS/CPU/FSIZE/NOFILE/NPROC)
 *    and optional Bubblewrap (`bwrap`) network/PID/IPC/filesystem namespace isolation.
 * 4. Python PEP-578 `sys.addaudithook` + POSIX `resource.setrlimit`: runs inside `python -I`,
 *    blocking `subprocess`, `socket`, `os.system`, unauthorized file writes and sensitive reads
 *    even against dynamic `getattr(__builtins__, "__imp"+"ort__")` bypasses.
 * 5. Hard Wall-Clock Kill + Output Limit Fast-Kill + Process-Group Tree Termination.
 */

import { spawn } from "child_process";
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";

export const MAX_CONCURRENT_SANDBOX = Math.max(
  2,
  Math.min(6, Number(process.env.SANDBOX_MAX_CONCURRENT) || Math.min(4, os.cpus().length || 2)),
);

let activeExecutions = 0;
const slotWaiters: Array<() => void> = [];

export function sandboxQueuePosition(): number {
  return Math.max(0, activeExecutions - MAX_CONCURRENT_SANDBOX + 1);
}

export async function acquireSandboxSlot(): Promise<void> {
  if (activeExecutions < MAX_CONCURRENT_SANDBOX) {
    activeExecutions += 1;
    return;
  }
  await new Promise<void>((resolve) => slotWaiters.push(resolve));
  activeExecutions += 1;
}

export function releaseSandboxSlot(): void {
  activeExecutions = Math.max(0, activeExecutions - 1);
  const next = slotWaiters.shift();
  if (next) next();
}

export type SandboxMode = "bwrap+prlimit" | "prlimit" | "python-audit+rlimit" | "process-guard";

interface SandboxCapabilities {
  checked: boolean;
  hasPrlimit: boolean;
  hasBwrap: boolean;
  bwrapUsable: boolean;
  mode: SandboxMode;
}

const caps: SandboxCapabilities = {
  checked: false,
  hasPrlimit: false,
  hasBwrap: false,
  bwrapUsable: false,
  mode: process.platform === "linux" ? "python-audit+rlimit" : "process-guard",
};

let probePromise: Promise<SandboxCapabilities> | null = null;

function execProbe(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: "ignore" });
    const t = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
      resolve(false);
    }, 1500);
    child.on("error", () => { clearTimeout(t); resolve(false); });
    child.on("close", (code) => { clearTimeout(t); resolve(code === 0); });
  });
}

export async function detectSandboxCapabilities(): Promise<SandboxCapabilities> {
  if (caps.checked) return caps;
  if (probePromise) return probePromise;

  probePromise = (async () => {
    if (process.platform !== "linux") {
      caps.mode = "process-guard";
      caps.checked = true;
      return caps;
    }

    const [hasPrlimit, hasBwrap] = await Promise.all([
      execProbe("prlimit", ["--version"]),
      execProbe("bwrap", ["--version"]),
    ]);

    let bwrapUsable = false;
    if (hasBwrap && process.env.SANDBOX_USE_BWRAP !== "0") {
      bwrapUsable = await execProbe("bwrap", [
        "--unshare-net",
        "--ro-bind", "/usr", "/usr",
        "--dev", "/dev",
        "--proc", "/proc",
        "/bin/true",
      ]);
    }

    caps.hasPrlimit = hasPrlimit;
    caps.hasBwrap = hasBwrap;
    caps.bwrapUsable = bwrapUsable;
    caps.mode =
      bwrapUsable && hasPrlimit
        ? "bwrap+prlimit"
        : hasPrlimit
          ? "prlimit"
          : "python-audit+rlimit";
    caps.checked = true;
    return caps;
  })();

  return probePromise;
}

export function getSandboxStatus() {
  return {
    platform: process.platform,
    mode: caps.mode,
    hasPrlimit: caps.hasPrlimit,
    bwrapUsable: caps.bwrapUsable,
    activeExecutions,
    queuedExecutions: slotWaiters.length,
    maxConcurrent: MAX_CONCURRENT_SANDBOX,
  };
}

/**
 * Strip ALL server secrets (JWT_SECRET, DATABASE_URL, LLM keys, etc.) from child env.
 */
export function buildSafeEnv(workDir: string, extra?: Record<string, string>): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    HOME: workDir,
    TMP: workDir,
    TEMP: workDir,
    TMPDIR: workDir,
    PYTHONUNBUFFERED: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONNOUSERSITE: "1",
    PYTHONUTF8: "1",
  };
  if (process.platform === "win32") {
    if (process.env.SystemRoot) safe.SystemRoot = process.env.SystemRoot;
    if (process.env.WINDIR) safe.WINDIR = process.env.WINDIR;
    if (process.env.PATHEXT) safe.PATHEXT = process.env.PATHEXT;
  }
  if (extra) Object.assign(safe, extra);
  return safe;
}

export interface SandboxWrapOptions {
  workDir: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  maxFileBytes?: number;
  maxProcs?: number;
  isNativeBinary?: boolean;
}

/**
 * Wrap a command with `prlimit` and optional `bwrap` on Linux.
 * Falls back cleanly to raw command on Windows or minimal Linux containers.
 */
export async function wrapCommandForSandbox(
  cmd: string,
  args: string[],
  opts: SandboxWrapOptions,
): Promise<{ command: string; args: string[]; cwd: string; wrappedInBwrap: boolean }> {
  const cap = await detectSandboxCapabilities();
  if (process.platform !== "linux") {
    return { command: cmd, args, cwd: opts.workDir, wrappedInBwrap: false };
  }

  const cpuSec = Math.max(1, Math.ceil(opts.timeLimitMs / 1000) + 1);
  const memMb = Math.max(64, Math.min(512, Math.round(opts.memoryLimitMb)));
  const memBytes = memMb * 1024 * 1024;
  const maxFileBytes = opts.maxFileBytes ?? 10_485_760; // 10MB max output.txt write
  const maxProcs = opts.maxProcs ?? 16;

  let finalCmd = cmd;
  let finalArgs = args;
  let finalCwd = opts.workDir;
  let wrappedInBwrap = false;

  if (cap.hasPrlimit) {
    finalArgs = [
      `--as=${memBytes}`,
      `--cpu=${cpuSec}`,
      `--fsize=${maxFileBytes}`,
      "--nofile=32",
      `--nproc=${maxProcs}`,
      "--",
      cmd,
      ...args,
    ];
    finalCmd = "prlimit";
  }

  // Only wrap native C++ binaries or explicit CLI commands in bwrap (Python already runs inside _runner.py audit hook,
  // and bwrap also works cleanly when /work is mounted if standard /usr & /lib exist).
  if (cap.bwrapUsable && opts.isNativeBinary) {
    const bwrapArgs: string[] = [
      "--unshare-net",
      "--unshare-ipc",
      "--unshare-pid",
      "--die-with-parent",
      "--new-session",
    ];
    for (const ro of ["/usr", "/lib", "/lib64", "/bin", "/etc/ld.so.cache", "/etc/alternatives"]) {
      if (fs.existsSync(ro)) {
        bwrapArgs.push("--ro-bind", ro, ro);
      }
    }
    // Remap binary if it lives inside workDir
    const rewrittenTail = [finalCmd, ...finalArgs].map((tok) =>
      tok.startsWith(opts.workDir) ? "/work" + tok.slice(opts.workDir.length) : tok,
    );
    bwrapArgs.push(
      "--proc", "/proc",
      "--dev", "/dev",
      "--bind", opts.workDir, "/work",
      "--chdir", "/work",
      "--",
      ...rewrittenTail,
    );
    finalCmd = "bwrap";
    finalArgs = bwrapArgs;
    finalCwd = "/work"; // ignored by spawn when using host cwd -> pass opts.workDir on host!
    wrappedInBwrap = true;
  }

  return {
    command: finalCmd,
    args: finalArgs,
    cwd: wrappedInBwrap ? opts.workDir : finalCwd,
    wrappedInBwrap,
  };
}

/**
 * Write a tiny Python PEP-578 audit-hook + POSIX rlimit bootstrap (`_runner.py`).
 * Prevents dynamic `__import__('os')`, `subprocess`, sockets, arbitrary file writes,
 * and sensitive host reads while allowing normal CP stdlib modules (`sys`, `math`, `bisect`, ...).
 */
export async function writePythonSandboxBootstrap(
  workDir: string,
  mainFilename: string,
  opts: { timeLimitMs: number; memoryLimitMb: number },
): Promise<string> {
  const runnerPath = path.join(workDir, "_runner.py");
  const cpuSec = Math.max(1, Math.ceil(opts.timeLimitMs / 1000) + 1);
  const memBytes = Math.max(64, Math.min(512, Math.round(opts.memoryLimitMb))) * 1024 * 1024;

  const pyBootstrap = `import sys, os
WORK_DIR = os.path.realpath(os.getcwd())
ALLOWED_WRITE = os.path.join(WORK_DIR, "output.txt")

try:
    import resource
    try:
        resource.setrlimit(resource.RLIMIT_CPU, (${cpuSec}, ${cpuSec}))
    except Exception:
        pass
    try:
        resource.setrlimit(resource.RLIMIT_FSIZE, (10485760, 10485760))
    except Exception:
        pass
    try:
        resource.setrlimit(resource.RLIMIT_AS, (${memBytes}, ${memBytes}))
    except Exception:
        pass
except Exception:
    pass

BLOCKED_PREFIXES = (
    "subprocess.",
    "os.system",
    "os.popen",
    "os.spawn",
    "os.exec",
    "os.fork",
    "os.kill",
    "os.remove",
    "os.unlink",
    "os.rmdir",
    "os.rename",
    "os.mkdir",
    "os.chmod",
    "os.chown",
    "shutil.",
    "socket.",
    "pty.",
    "fcntl.",
    "ctypes.dlopen",
    "webbrowser.",
)

SENSITIVE_PARTS = ("/.env", "\\\\.env", "prisma", "dev.db", "/etc/shadow", "/etc/passwd")

def _audit_guard(event, args):
    if event.startswith(BLOCKED_PREFIXES):
        raise PermissionError("SANDBOX_BLOCKED: Thao tac bi chan boi sandbox lop hoc")
    if event == "import" and args:
        mod = str(args[0])
        if mod in ("subprocess", "socket", "shutil", "pty", "ctypes", "http", "urllib", "ftplib", "smtplib", "multiprocessing"):
            raise PermissionError("SANDBOX_BLOCKED: Thao tac bi chan boi sandbox lop hoc")
    if event == "open" and args:
        raw_path = args[0]
        if isinstance(raw_path, (str, bytes)):
            try:
                p_str = raw_path.decode("utf-8", "ignore") if isinstance(raw_path, bytes) else raw_path
            except Exception:
                p_str = ""
            mode = str(args[1]) if len(args) > 1 and args[1] is not None else "r"
            real = os.path.realpath(p_str)
            low = real.lower().replace("\\\\", "/")
            if any(s in low for s in SENSITIVE_PARTS):
                raise PermissionError("SANDBOX_BLOCKED: Thao tac bi chan boi sandbox lop hoc")
            if any(m in mode for m in ("w", "a", "x", "+")):
                if real != ALLOWED_WRITE:
                    raise PermissionError("SANDBOX_BLOCKED: Thao tac bi chan boi sandbox lop hoc")

with open(os.path.join(WORK_DIR, ${JSON.stringify(mainFilename)}), "r", encoding="utf-8") as _f:
    _src = _f.read()

sys.addaudithook(_audit_guard)

_ns = {"__name__": "__main__", "__file__": ${JSON.stringify(mainFilename)}, "__builtins__": __builtins__}
try:
    exec(compile(_src, ${JSON.stringify(mainFilename)}, "exec"), _ns)
except MemoryError:
    sys.stderr.write("Memory limit exceeded\\n")
    sys.exit(137)
`;
  await fsp.writeFile(runnerPath, pyBootstrap, "utf-8");
  return runnerPath;
}

export interface SandboxedExecResult {
  status: "success" | "runtime_error" | "time_limit" | "memory_limit" | "output_limit" | "blocked";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
}

function killProcessTree(child: ReturnType<typeof spawn>) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", child.pid.toString(), "/f", "/t"], { windowsHide: true });
    } else {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }
  } catch {
    /* already exited */
  }
}

export async function runSandboxedProcess(opts: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin?: string;
  timeLimitMs: number;
  maxOutputBytes?: number;
  outputFilePath?: string;
}): Promise<SandboxedExecResult> {
  const maxOut = Math.max(4096, opts.maxOutputBytes ?? 2_000_000);
  const timeoutMs = Math.max(250, Math.min(15_000, opts.timeLimitMs));

  return new Promise<SandboxedExecResult>((resolve) => {
    const startedAt = Date.now();
    const child = spawn(opts.command, opts.args, {
      cwd: opts.cwd,
      env: opts.env,
      windowsHide: true,
      detached: process.platform !== "win32",
    });

    let stdout = "";
    let stderr = "";
    let totalBytes = 0;
    let timedOut = false;
    let outputExceeded = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
    }, timeoutMs);

    const checkOverflow = (chunk: string) => {
      totalBytes += Buffer.byteLength(chunk, "utf8");
      if (totalBytes > maxOut && !outputExceeded) {
        outputExceeded = true;
        killProcessTree(child);
      }
    };

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");

    child.stdout.on("data", (chunk: string) => {
      checkOverflow(chunk);
      if (stdout.length < maxOut) {
        stdout += chunk.slice(0, maxOut - stdout.length);
      }
    });

    child.stderr.on("data", (chunk: string) => {
      checkOverflow(chunk);
      if (stderr.length < 64_000) {
        stderr += chunk.slice(0, 64_000 - stderr.length);
      }
    });

    child.stdin.on("error", () => {});

    child.on("error", (err) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({
        status: "runtime_error",
        stdout: "",
        stderr: err.message,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        timedOut: false,
      });
    });

    child.on("close", async (exitCode) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      const durationMs = Date.now() - startedAt;

      let fileOut = "";
      if (opts.outputFilePath && !timedOut && !outputExceeded) {
        try {
          fileOut = await fsp.readFile(opts.outputFilePath, "utf-8");
        } catch {
          /* no output.txt */
        }
      }

      const effectiveStdout = fileOut.trim().length > 0 ? fileOut : stdout;
      const blockedByHook =
        stderr.includes("SANDBOX_BLOCKED") ||
        stderr.includes("Thao tác bị chặn bởi sandbox lớp học");
      const mle =
        !timedOut &&
        !outputExceeded &&
        (stderr.includes("Memory limit exceeded") ||
          stderr.includes("MemoryError") ||
          stderr.includes("std::bad_alloc") ||
          exitCode === 137);

      let status: SandboxedExecResult["status"];
      if (outputExceeded) status = "output_limit";
      else if (timedOut) status = "time_limit";
      else if (blockedByHook) status = "blocked";
      else if (mle) status = "memory_limit";
      else if (exitCode === 0) status = "success";
      else status = "runtime_error";

      resolve({
        status,
        stdout: effectiveStdout.slice(0, maxOut),
        stderr:
          status === "output_limit"
            ? "Output limit exceeded (vượt giới hạn dung lượng xuất)"
            : status === "time_limit"
              ? "Time limit exceeded"
              : status === "memory_limit"
                ? "Memory limit exceeded (vượt giới hạn bộ nhớ)"
                : status === "blocked"
                  ? "Thao tác bị chặn bởi sandbox lớp học"
                  : stderr.trim(),
        exitCode,
        durationMs,
        timedOut,
      });
    });

    const stdin = opts.stdin ?? "";
    if (stdin && child.stdin.writable) {
      child.stdin.end(stdin);
    } else if (child.stdin.writable) {
      child.stdin.end();
    }
  });
}
