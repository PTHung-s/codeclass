import { spawn, ChildProcessWithoutNullStreams, execFile } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type InteractiveLanguage = "python" | "cpp";
export type InteractiveExitStatus =
  | "success"
  | "runtime_error"
  | "time_limit"
  | "blocked"
  | "compile_error"
  | "stopped"
  | "output_limit"
  | "disconnected"
  | "error";

export interface InteractiveSession {
  id: string;
  userId: string;
  language: InteractiveLanguage;
  startedAt: number;
}

type OutputHandler = (sessionId: string, stream: "stdout" | "stderr", data: string) => void;
type ExitHandler = (sessionId: string, info: {
  status: InteractiveExitStatus;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  reason: string;
}) => void;
type StartedHandler = (session: InteractiveSession) => void;

interface SessionRecord {
  id: string;
  userId: string;
  language: InteractiveLanguage;
  startedAt: number;
  workDir: string;
  child: ChildProcessWithoutNullStreams | null;
  timer: ReturnType<typeof setTimeout> | null;
  closeWatchdog: ReturnType<typeof setTimeout> | null;
  bytesOut: number;
  bytesIn: number;
  finalized: boolean;
  startedNotified: boolean;
  pendingOutput: Array<{ stream: "stdout" | "stderr"; data: string }>;
  pendingExit: {
    status: InteractiveExitStatus;
    exitCode: number | null;
    durationMs: number;
    timedOut: boolean;
    reason: string;
  } | null;
  timedOut: boolean;
  reason: InteractiveExitStatus;
  onOutput: OutputHandler;
  onExit: ExitHandler;
  onStarted: StartedHandler;
}

const MAX_CODE_LENGTH = 50_000;
const MAX_INPUT_CHUNK = 4_000;
const MAX_INPUT_BYTES = 20_000;
const MAX_OUTPUT_BYTES = 80_000;
const INTERACTIVE_TIMEOUT_MS = 30_000;
const COMPILE_TIMEOUT_MS = 15_000;
const GLOBAL_MAX_SESSIONS = 20;

const sessions = new Map<string, SessionRecord>();
const userToSession = new Map<string, string>();

function validatePythonCode(code: string): string | null {
  const blockedPatterns = [
    /\bimport\s+os\b/,
    /\bfrom\s+os\s+import\b/,
    /\bimport\s+subprocess\b/,
    /\bfrom\s+subprocess\s+import\b/,
    /\bimport\s+socket\b/,
    /\bfrom\s+socket\s+import\b/,
    /\bimport\s+shutil\b/,
    /\bfrom\s+shutil\s+import\b/,
    /\b__import__\s*\(/,
    /\bopen\s*\(/,
    /\beval\s*\(/,
    /\bexec\s*\(/,
  ];
  if (blockedPatterns.some((pattern) => pattern.test(code))) {
    return "Code dùng thao tác hệ thống/file/network nên chưa được phép chạy trong lớp học.";
  }
  return null;
}

function validateCppCode(code: string): string | null {
  const blockedPatterns = [
    /\b#include\s*<\s*thread\s*>/,
    /\b#include\s*<\s*filesystem\s*>/,
    /\b#include\s*<\s*socket\s*>/,
    /\b#include\s*<\s*net\s*>/,
    /\bsystem\s*\(/,
    /\bpopen\s*\(/,
    /\bfork\s*\(/,
    /\bexec[lvpe]*\s*\(/,
  ];
  if (blockedPatterns.some((pattern) => pattern.test(code))) {
    return "Code dùng thao tác hệ thống/mạng/đa luồng nên chưa được phép chạy trong lớp học.";
  }
  return null;
}

function filterCompilerErrors(rawError: string): string {
  if (!rawError) return "Compilation failed";
  const lines = rawError.split("\n");
  const filtered: string[] = [];
  let errorCount = 0;
  for (const line of lines) {
    if (errorCount >= 6) break;
    const clean = line
      .replace(/[A-Za-z]:\\[^\s:]+\.cpp/gi, "your code")
      .replace(/\/tmp\/[^\s:]+\.cpp/g, "your code")
      .trim();
    if (!clean) continue;
    if (clean.startsWith("In file included from")) continue;
    if (clean.includes("note: ")) continue;
    if (clean.startsWith("compilation terminated")) continue;
    if (clean.includes(": error:") || clean.includes(": fatal error:")) errorCount += 1;
    filtered.push(clean);
  }
  return filtered.join("\n") || "Compilation failed";
}

async function detectPythonCommand() {
  const candidates = process.platform === "win32"
    ? [
        { command: "py", args: ["-3"] },
        { command: "python", args: [] },
        { command: "python3", args: [] },
      ]
    : [
        { command: "python3", args: [] },
        { command: "python", args: [] },
      ];

  for (const candidate of candidates) {
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn(candidate.command, [...candidate.args, "--version"], { windowsHide: true });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });
    if (ok) return candidate;
  }
  return null;
}

let pythonCommandPromise: ReturnType<typeof detectPythonCommand> | null = null;
async function getPythonCommand() {
  pythonCommandPromise ||= detectPythonCommand();
  return pythonCommandPromise;
}

async function killProcessTree(child: ChildProcessWithoutNullStreams | null) {
  if (!child?.pid) return;
  const pid = child.pid;
  try {
    if (process.platform === "win32") {
      await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }).catch(() => {});
    } else {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
      }
      setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
        }
      }, 400);
    }
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
}

function emitOutput(session: SessionRecord, stream: "stdout" | "stderr", data: string) {
  if (session.finalized || !data) return;
  const remaining = MAX_OUTPUT_BYTES - session.bytesOut;
  if (remaining <= 0) {
    void stopSession(session.id, "output_limit");
    return;
  }
  const chunk = data.length > remaining ? data.slice(0, remaining) : data;
  session.bytesOut += chunk.length;
  if (session.startedNotified) {
    session.onOutput(session.id, stream, chunk);
  } else {
    session.pendingOutput.push({ stream, data: chunk });
  }
  if (data.length > remaining) {
    void stopSession(session.id, "output_limit");
  }
}

function notifyStarted(session: SessionRecord): InteractiveSession {
  const publicSession: InteractiveSession = {
    id: session.id,
    userId: session.userId,
    language: session.language,
    startedAt: session.startedAt,
  };
  session.onStarted(publicSession);
  session.startedNotified = true;
  for (const output of session.pendingOutput) {
    session.onOutput(session.id, output.stream, output.data);
  }
  session.pendingOutput = [];
  if (session.pendingExit) {
    session.onExit(session.id, session.pendingExit);
    session.pendingExit = null;
  }
  return publicSession;
}

async function cleanupWorkDir(workDir: string) {
  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
}

async function discardUnstartedSession(session: SessionRecord) {
  session.finalized = true;
  if (session.timer) clearTimeout(session.timer);
  if (session.closeWatchdog) clearTimeout(session.closeWatchdog);
  sessions.delete(session.id);
  if (userToSession.get(session.userId) === session.id) {
    userToSession.delete(session.userId);
  }
  await cleanupWorkDir(session.workDir);
}

async function finalizeSession(
  session: SessionRecord,
  status: InteractiveExitStatus,
  exitCode: number | null,
) {
  if (session.finalized) return;
  session.finalized = true;
  if (session.timer) clearTimeout(session.timer);
  if (session.closeWatchdog) clearTimeout(session.closeWatchdog);
  session.timer = null;
  session.closeWatchdog = null;

  try {
    session.child?.stdin.end();
  } catch {
    /* ignore */
  }
  await killProcessTree(session.child);
  session.child = null;

  sessions.delete(session.id);
  if (userToSession.get(session.userId) === session.id) {
    userToSession.delete(session.userId);
  }

  const durationMs = Date.now() - session.startedAt;
  const timedOut = status === "time_limit" || session.timedOut;
  const reason =
    status === "stopped" ? "stopped"
      : status === "time_limit" ? "timeout"
      : status === "output_limit" ? "output_limit"
      : status === "disconnected" ? "disconnected"
      : status === "compile_error" ? "compile_error"
      : status === "blocked" ? "blocked"
      : status === "success" ? "exit"
      : "error";

  const exitInfo = {
    status,
    exitCode,
    durationMs,
    timedOut,
    reason,
  };
  if (session.startedNotified) {
    session.onExit(session.id, exitInfo);
  } else {
    session.pendingExit = exitInfo;
  }

  await cleanupWorkDir(session.workDir);
}

function attachChild(session: SessionRecord, child: ChildProcessWithoutNullStreams) {
  session.child = child;
  child.stdout.setEncoding("utf-8");
  child.stderr.setEncoding("utf-8");

  child.stdout.on("data", (chunk: string) => emitOutput(session, "stdout", chunk));
  child.stderr.on("data", (chunk: string) => emitOutput(session, "stderr", chunk));

  child.on("error", (error) => {
    emitOutput(session, "stderr", error.message || "Process error");
    void finalizeSession(session, "error", null);
  });

  child.on("close", (code) => {
    if (session.finalized) return;
    const status: InteractiveExitStatus = session.timedOut
      ? "time_limit"
      : session.reason === "stopped"
        ? "stopped"
        : session.reason === "disconnected"
          ? "disconnected"
          : session.reason === "output_limit"
            ? "output_limit"
            : code === 0
              ? "success"
              : "runtime_error";
    void finalizeSession(session, status, code);
  });

  session.timer = setTimeout(() => {
    session.timedOut = true;
    session.reason = "time_limit";
    emitOutput(session, "stderr", "\nTime limit exceeded\n");
    void stopSession(session.id, "time_limit");
  }, INTERACTIVE_TIMEOUT_MS);
}

/**
 * iostream buffers fully when stdout is a pipe (not a TTY). Interactive prompts
 * like `cout << "Nhap: "` never reach the browser until endl/flush — students
 * think input is broken. Force line/unit buffering for Code Lab sessions only.
 */
function ensureCppInteractiveUnbuffered(code: string): string {
  if (/codeclass_unbuf_instance/.test(code)) return code;
  // Always re-include iostream/cstdio — harmless with include guards, and
  // guarantees std::cout / setvbuf are visible even if student code omitted them.
  const hook = [
    "",
    "// codeclass: unbuffered stdout for interactive terminal (pipe is not a TTY)",
    "#include <iostream>",
    "#include <cstdio>",
    "namespace { struct codeclass_unbuf_t { codeclass_unbuf_t() {",
    "  std::cout.setf(std::ios::unitbuf);",
    "  std::cerr.setf(std::ios::unitbuf);",
    "  setvbuf(stdout, nullptr, _IONBF, 0);",
    "  setvbuf(stderr, nullptr, _IONBF, 0);",
    "} } codeclass_unbuf_instance; }",
    "",
  ].join("\n");

  const includeRe = /^\s*#\s*include\b.*$/gm;
  let lastIncludeEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = includeRe.exec(code)) !== null) {
    lastIncludeEnd = m.index + m[0].length;
  }
  if (lastIncludeEnd >= 0) {
    return code.slice(0, lastIncludeEnd) + "\n" + hook + code.slice(lastIncludeEnd);
  }
  return hook + "\n" + code;
}

async function compileCpp(sourcePath: string, binaryPath: string): Promise<{ ok: boolean; error: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      "g++",
      ["-std=c++17", "-O2", "-Wall", "-fmax-errors=5", "-o", binaryPath, sourcePath],
      {
        windowsHide: true,
        ...(process.platform === "win32" ? {} : { detached: true }),
      },
    );
    let stderr = "";
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      void killProcessTree(child as any);
      resolve({ ok: false, error: "Compilation timed out" });
    }, COMPILE_TIMEOUT_MS);

    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, error: "" });
      else resolve({ ok: false, error: filterCompilerErrors(stderr) });
    });
  });
}

export function getUserInteractiveSessionId(userId: string): string | null {
  return userToSession.get(userId) || null;
}

export async function startInteractiveSession(opts: {
  userId: string;
  language: InteractiveLanguage;
  code: string;
  onOutput: OutputHandler;
  onExit: ExitHandler;
  onStarted?: StartedHandler;
}): Promise<{ session: InteractiveSession } | { error: string; status?: InteractiveExitStatus }> {
  const { userId, language, code, onOutput, onExit, onStarted = () => {} } = opts;
  if (!code.trim()) return { error: "Code is required" };
  if (code.length > MAX_CODE_LENGTH) return { error: "Code is too large" };
  if (language !== "python" && language !== "cpp") return { error: "Unsupported language" };

  if (sessions.size >= GLOBAL_MAX_SESSIONS) {
    return { error: "Hệ thống đang quá tải. Thử lại sau." };
  }

  const existingId = userToSession.get(userId);
  if (existingId) {
    await stopSession(existingId, "stopped");
  }

  const blocked = language === "python" ? validatePythonCode(code) : validateCppCode(code);
  if (blocked) return { error: blocked, status: "blocked" };

  const sessionId = randomUUID();
  let workDir: string;
  try {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), `codeclass-term-${sessionId.slice(0, 8)}-`));
  } catch {
    return { error: "Không thể tạo vùng chạy tạm thời." };
  }

  const session: SessionRecord = {
    id: sessionId,
    userId,
    language,
    startedAt: Date.now(),
    workDir,
    child: null,
    timer: null,
    closeWatchdog: null,
    bytesOut: 0,
    bytesIn: 0,
    finalized: false,
    startedNotified: false,
    pendingOutput: [],
    pendingExit: null,
    timedOut: false,
    reason: "success",
    onOutput,
    onExit,
    onStarted,
  };
  sessions.set(sessionId, session);
  userToSession.set(userId, sessionId);

  try {
    if (language === "python") {
      const python = await getPythonCommand();
      if (!python) {
        await discardUnstartedSession(session);
        return { error: "Không tìm thấy Python trên máy chủ." };
      }
      const filePath = path.join(workDir, "main.py");
      await fs.writeFile(filePath, code, "utf-8");
      const child = spawn(python.command, [...python.args, "-u", filePath], {
        cwd: workDir,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          PYTHONDONTWRITEBYTECODE: "1",
        },
        ...(process.platform === "win32" ? {} : { detached: true }),
      });
      attachChild(session, child);
      notifyStarted(session);
      return { session: { id: sessionId, userId, language, startedAt: session.startedAt } };
    }

    // C++
    const sourcePath = path.join(workDir, "main.cpp");
    const binaryPath = path.join(workDir, process.platform === "win32" ? "main.exe" : "main");
    await fs.writeFile(sourcePath, ensureCppInteractiveUnbuffered(code), "utf-8");
    const compile = await compileCpp(sourcePath, binaryPath);
    if (session.finalized) {
      return { error: "Session ended during compile" };
    }
    if (!compile.ok) {
      const cleanError = compile.error || "Compilation failed";
      await discardUnstartedSession(session);
      return { error: cleanError, status: "compile_error" };
    }

    const child = spawn(binaryPath, [], {
      cwd: workDir,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      ...(process.platform === "win32" ? {} : { detached: true }),
    });
    attachChild(session, child);
    notifyStarted(session);
    return { session: { id: sessionId, userId, language, startedAt: session.startedAt } };
  } catch (err: any) {
    await discardUnstartedSession(session);
    return { error: err?.message || "Failed to start session" };
  }
}

export function writeInteractiveInput(sessionId: string, userId: string, data: string): { ok: true } | { error: string } {
  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId) return { error: "Session not found" };
  if (session.finalized || !session.child) return { error: "Session is not running" };
  if (typeof data !== "string") return { error: "Invalid input" };
  // Terminal Enter should always deliver a line. Clients usually append \n, but
  // defend here so cin/input() never hang on a bare chunk without newline.
  const payload = data.endsWith("\n") || data.endsWith("\r") ? data : `${data}\n`;
  const inputBytes = Buffer.byteLength(payload, "utf8");
  if (inputBytes > MAX_INPUT_CHUNK) return { error: "Input chunk too large" };
  if (session.bytesIn + inputBytes > MAX_INPUT_BYTES) return { error: "Input limit exceeded" };
  try {
    session.bytesIn += inputBytes;
    const canWrite = session.child.stdin.write(payload);
    if (!canWrite) {
      // backpressure: wait briefly; drop is acceptable under abuse
      session.child.stdin.once("drain", () => {});
    }
    return { ok: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to write input" };
  }
}

export async function stopSession(
  sessionId: string,
  reason: InteractiveExitStatus = "stopped",
): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session || session.finalized) return;
  session.reason = reason;
  try {
    session.child?.stdin.end();
  } catch {
    /* ignore */
  }
  await killProcessTree(session.child);

  // If close doesn't fire soon, force finalize
  if (!session.closeWatchdog) {
    session.closeWatchdog = setTimeout(() => {
      void finalizeSession(session, reason, null);
    }, 800);
  }
}

export async function stopInteractiveSession(
  sessionId: string,
  userId: string,
  reason: InteractiveExitStatus = "stopped",
): Promise<{ ok: true } | { error: string }> {
  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId) return { error: "Session not found" };
  await stopSession(sessionId, reason);
  return { ok: true };
}

export async function stopUserSessions(userId: string, reason: InteractiveExitStatus = "disconnected") {
  const sessionId = userToSession.get(userId);
  if (sessionId) await stopSession(sessionId, reason);
}

export async function stopAllInteractiveSessions() {
  const ids = [...sessions.keys()];
  await Promise.all(ids.map((id) => stopSession(id, "stopped")));
}
