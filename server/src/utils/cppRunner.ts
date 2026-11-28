import { spawn } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  acquireSandboxSlot,
  buildSafeEnv,
  releaseSandboxSlot,
  runSandboxedProcess,
  sandboxQueuePosition,
  wrapCommandForSandbox,
} from "./codeSandbox";
import {
  CheckerType,
  compareOutputs,
  computeJudgeScore,
  SubtaskScoreSummary,
} from "./judgeChecker";

const DEFAULT_TIMEOUT_MS = 2000;
const COMPILE_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_LENGTH = 2_000_000;
const DEFAULT_MEMORY_MB = 256;

export function cppQueuePosition(): number {
  return sandboxQueuePosition();
}

export interface TestCase {
  input: string;
  output: string;
  hidden?: boolean;
  subtask?: number;
  points?: number;
}

export interface CppRunResult {
  status:
    | "success"
    | "runtime_error"
    | "time_limit"
    | "memory_limit"
    | "output_limit"
    | "blocked"
    | "compile_error"
    | "skipped";
  stdout: string;
  stderr: string;
  output: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
}

export interface CppTestResult {
  testNum: number;
  passed: boolean;
  hidden: boolean;
  input?: string;
  expected?: string;
  stdout?: string;
  stderr?: string;
  status: CppRunResult["status"];
  durationMs: number;
  subtask?: number;
}

export interface CppJudgeResult {
  passedCount: number;
  totalTests: number;
  score: number;
  results: CppTestResult[];
  status: "all_passed" | "partial" | "no_tests";
  subtasks?: SubtaskScoreSummary[];
}

function trimOutput(value: string, max = MAX_OUTPUT_LENGTH) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n... output truncated ...`;
}

export function validateCppCode(code: string): string | null {
  const blockedPatterns = [
    /#\s*include\s*<\s*thread\s*>/,
    /#\s*include\s*<\s*filesystem\s*>/,
    /#\s*include\s*<\s*socket\s*>/,
    /#\s*include\s*<\s*net\s*>/,
    /#\s*include\s*<\s*(?:sys\/socket\.h|netinet\/|arpa\/|netdb\.h|dlfcn\.h|sys\/syscall\.h|syscall\.h)/i,
    /#\s*include\s*["<][^">]*(?:\.\.|\/etc\/|\/proc\/|dev\.db)/i,
    /\bsystem\s*\(/,
    /\bpopen\s*\(/,
    /\bfork\s*\(/,
    /\bexec[lvpe]*\s*\(/,
    /\bsyscall\s*\(/,
    /\bdlopen\s*\(/,
    /\b(?:asm|__asm__|__asm)\b/,
  ];

  if (blockedPatterns.some((pattern) => pattern.test(code))) {
    return "Code dùng thao tác hệ thống/mạng/đa luồng nên chưa được phép chạy trong lớp học.";
  }

  return null;
}

function normalizeStdin(stdin: string): string {
  if (!stdin) return "";
  return stdin.endsWith("\n") ? stdin : `${stdin}\n`;
}

function filterCompilerErrors(rawError: string): string {
  if (!rawError) return "Compilation failed (no output)";

  const lines = rawError.split("\n");
  const filtered: string[] = [];
  let errorCount = 0;
  const MAX_ERRORS = 6;

  for (const line of lines) {
    if (errorCount >= MAX_ERRORS) break;

    const clean = line
      .replace(/\/tmp\/codeclass-[^\s:]+\.cpp/g, "your code")
      .replace(/\/tmp\/\S+\.cpp/g, "your code")
      .replace(/codeclass-[^\s:\\/]+[/\\]main\.cpp/g, "your code")
      .trim();

    if (!clean) continue;
    if (clean.startsWith("In file included from")) continue;
    if (clean.startsWith("In member function")) continue;
    if (clean.startsWith("In function")) continue;
    if (clean.includes("note: ")) continue;
    if (clean.startsWith("compilation terminated")) continue;

    if (clean.includes(": error:") || clean.includes(": fatal error:")) {
      errorCount++;
    }

    filtered.push(clean);
  }

  if (filtered.length === 0) return "Compilation failed";
  return filtered.join("\n");
}

async function compileCpp(
  sourcePath: string,
  binaryPath: string,
  workDir: string,
): Promise<{ ok: boolean; error: string }> {
  const compileArgs = [
    "-std=c++17",
    "-O2",
    "-Wall",
    "-fmax-errors=5",
    "-o",
    binaryPath,
    sourcePath,
  ];
  const wrapped = await wrapCommandForSandbox("g++", compileArgs, {
    workDir,
    timeLimitMs: COMPILE_TIMEOUT_MS,
    memoryLimitMb: 512,
    maxFileBytes: 32_000_000,
    maxProcs: 16,
  });

  return new Promise((resolve) => {
    const child = spawn(wrapped.command, wrapped.args, {
      cwd: workDir,
      env: buildSafeEnv(workDir),
      windowsHide: true,
    });

    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform === "win32" && child.pid) {
          spawn("taskkill", ["/pid", child.pid.toString(), "/f", "/t"], { windowsHide: true });
        } else {
          child.kill("SIGKILL");
        }
      } catch { /* ignore */ }
    }, COMPILE_TIMEOUT_MS);

    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < 32_000) stderr += chunk;
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({ ok: false, error: "Quá thời gian biên dịch (Compile Time Limit)" });
      } else if (code === 0) {
        resolve({ ok: true, error: "" });
      } else {
        const clean = filterCompilerErrors(stderr);
        resolve({ ok: false, error: clean || "Compilation failed" });
      }
    });
  });
}

async function verifyCompiler(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("g++", ["--version"], { windowsHide: true });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

let compilerAvailable: boolean | null = null;

async function hasCompiler(): Promise<boolean> {
  if (compilerAvailable !== null) return compilerAvailable;
  compilerAvailable = await verifyCompiler();
  return compilerAvailable;
}

export async function runCppCode(
  code: string,
  stdin = "",
  opts?: { maxOutputLength?: number; timeLimitMs?: number; memoryLimitMb?: number },
): Promise<CppRunResult> {
  const maxOut = Math.max(1024, opts?.maxOutputLength ?? MAX_OUTPUT_LENGTH);
  const timeLimitMs = Math.max(250, Math.min(12_000, opts?.timeLimitMs ?? DEFAULT_TIMEOUT_MS));
  const memoryLimitMb = Math.max(64, Math.min(512, opts?.memoryLimitMb ?? DEFAULT_MEMORY_MB));
  const trim = (value: string) => trimOutput(value, maxOut);

  const blockedReason = validateCppCode(code);
  if (blockedReason) {
    return {
      status: "blocked",
      stdout: "",
      stderr: blockedReason,
      output: blockedReason,
      exitCode: null,
      durationMs: 0,
      timedOut: false,
    };
  }

  if (!(await hasCompiler())) {
    return {
      status: "runtime_error",
      stdout: "",
      stderr: "Không tìm thấy trình biên dịch g++ trên máy chủ.",
      output: "Không tìm thấy trình biên dịch g++ trên máy chủ.",
      exitCode: null,
      durationMs: 0,
      timedOut: false,
    };
  }

  await acquireSandboxSlot();
  const workDir = path.join(os.tmpdir(), `codeclass-cpp-${randomUUID()}`);
  const sourcePath = path.join(workDir, "main.cpp");
  const binaryPath = path.join(workDir, process.platform === "win32" ? "main.exe" : "main");
  const inputPath = path.join(workDir, "input.txt");
  const outputPath = path.join(workDir, "output.txt");
  const normalizedStdin = normalizeStdin(stdin);

  try {
    await fs.mkdir(workDir, { recursive: true });
    await fs.writeFile(sourcePath, code, "utf-8");
    await fs.writeFile(inputPath, normalizedStdin, "utf-8");

    const compileStart = Date.now();
    const compile = await compileCpp(sourcePath, binaryPath, workDir);
    if (!compile.ok) {
      return {
        status: "compile_error",
        stdout: "",
        stderr: compile.error,
        output: compile.error,
        exitCode: 1,
        durationMs: Date.now() - compileStart,
        timedOut: false,
      };
    }

    const wrapped = await wrapCommandForSandbox(binaryPath, [], {
      workDir,
      timeLimitMs,
      memoryLimitMb,
      isNativeBinary: true,
    });

    if (wrapped.dropPrivileges) {
      await fs.chmod(workDir, 0o755);
      await fs.chmod(binaryPath, 0o755);
      await fs.chmod(inputPath, 0o644);
      await fs.chown(workDir, 65534, 65534);
    }

    const extraEnv = wrapped.preloadPath
      ? { LD_PRELOAD: wrapped.preloadPath, SANDBOX_WORK_DIR: workDir }
      : undefined;

    const exec = await runSandboxedProcess({
      command: wrapped.command,
      args: wrapped.args,
      cwd: wrapped.cwd,
      env: buildSafeEnv(workDir, extraEnv),
      stdin: normalizedStdin,
      timeLimitMs,
      maxOutputBytes: maxOut,
      outputFilePath: outputPath,
      ...(wrapped.dropPrivileges ? { uid: 65534, gid: 65534 } : {}),
    });

    const output =
      exec.status === "time_limit" || exec.status === "memory_limit" || exec.status === "output_limit"
        ? exec.stderr
        : [exec.stdout, exec.stderr].filter(Boolean).join("\n").trim() || "(không có output)";

    return {
      status: exec.status,
      stdout: trim(exec.stdout),
      stderr: trim(exec.stderr),
      output: trim(output),
      exitCode: exec.exitCode,
      durationMs: exec.durationMs,
      timedOut: exec.timedOut,
    };
  } catch (err: any) {
    const msg = err?.message || "Không tạo được sandbox C++.";
    const isUnavailable = typeof msg === "string" && msg.includes("SANDBOX_UNAVAILABLE");
    return {
      status: isUnavailable ? "blocked" : "runtime_error",
      stdout: "",
      stderr: msg,
      output: msg,
      exitCode: null,
      durationMs: 0,
      timedOut: false,
    };
  } finally {
    releaseSandboxSlot();
    void fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function judgeCppCode(
  code: string,
  testCases: TestCase[],
  onTestResult?: (r: CppTestResult) => void,
  opts?: {
    timeLimitMs?: number;
    memoryLimitMb?: number;
    checkerType?: CheckerType;
    maxConsecutiveHeavyFails?: number;
  },
): Promise<CppJudgeResult> {
  if (testCases.length === 0) {
    return { passedCount: 0, totalTests: 0, score: 0, results: [], status: "no_tests" };
  }

  const timeLimitMs = Math.max(250, Math.min(12_000, opts?.timeLimitMs ?? DEFAULT_TIMEOUT_MS));
  const memoryLimitMb = Math.max(64, Math.min(512, opts?.memoryLimitMb ?? DEFAULT_MEMORY_MB));
  const checkerType: CheckerType = opts?.checkerType ?? "exact";
  const maxHeavyFails = opts?.maxConsecutiveHeavyFails ?? 3;

  const blockedReason = validateCppCode(code);
  if (blockedReason) {
    const result: CppTestResult = {
      testNum: 1,
      passed: false,
      hidden: false,
      status: "blocked",
      durationMs: 0,
      stderr: blockedReason,
    };
    return {
      passedCount: 0,
      totalTests: testCases.length,
      score: 0,
      results: testCases.map((tc, i) => ({ ...result, testNum: i + 1, hidden: Boolean(tc.hidden), subtask: tc.subtask })),
      status: "partial",
    };
  }

  if (!(await hasCompiler())) {
    const result: CppTestResult = {
      testNum: 1,
      passed: false,
      hidden: false,
      status: "runtime_error",
      durationMs: 0,
      stderr: "Không tìm thấy trình biên dịch g++ trên máy chủ.",
    };
    return {
      passedCount: 0,
      totalTests: testCases.length,
      score: 0,
      results: testCases.map((tc, i) => ({ ...result, testNum: i + 1, hidden: Boolean(tc.hidden), subtask: tc.subtask })),
      status: "partial",
    };
  }

  await acquireSandboxSlot();
  const workDir = path.join(os.tmpdir(), `codeclass-cppj-${randomUUID()}`);
  const sourcePath = path.join(workDir, "main.cpp");
  const binaryPath = path.join(workDir, process.platform === "win32" ? "main.exe" : "main");
  const inputPath = path.join(workDir, "input.txt");
  const outputPath = path.join(workDir, "output.txt");
  const results: CppTestResult[] = [];

  try {
    await fs.mkdir(workDir, { recursive: true });
    await fs.writeFile(sourcePath, code, "utf-8");

    const compileStart = Date.now();
    const compile = await compileCpp(sourcePath, binaryPath, workDir);
    if (!compile.ok) {
      const ceResult: CppTestResult = {
        testNum: 1,
        passed: false,
        hidden: false,
        status: "compile_error",
        durationMs: Date.now() - compileStart,
        stderr: compile.error,
      };
      return {
        passedCount: 0,
        totalTests: testCases.length,
        score: 0,
        results: testCases.map((tc, i) => ({ ...ceResult, testNum: i + 1, hidden: Boolean(tc.hidden), subtask: tc.subtask })),
        status: "partial",
      };
    }

    let wrapped: Awaited<ReturnType<typeof wrapCommandForSandbox>>;
    try {
      wrapped = await wrapCommandForSandbox(binaryPath, [], {
        workDir,
        timeLimitMs,
        memoryLimitMb,
        isNativeBinary: true,
      });
    } catch (err: any) {
      const msg = err?.message || "Sandbox C++ chưa sẵn sàng.";
      return {
        passedCount: 0,
        totalTests: testCases.length,
        score: 0,
        results: testCases.map((tc, i) => ({
          testNum: i + 1,
          passed: false,
          hidden: Boolean(tc.hidden),
          status: "blocked" as const,
          stderr: msg,
          durationMs: 0,
          subtask: tc.subtask,
        })),
        status: "partial",
      };
    }

    if (wrapped.dropPrivileges) {
      await fs.chmod(workDir, 0o755);
      await fs.chmod(binaryPath, 0o755);
      await fs.chown(workDir, 65534, 65534);
    }

    const extraEnv = wrapped.preloadPath
      ? { LD_PRELOAD: wrapped.preloadPath, SANDBOX_WORK_DIR: workDir }
      : undefined;
    const safeEnv = buildSafeEnv(workDir, extraEnv);
    let consecutiveHeavyFails = 0;

    for (let i = 0; i < testCases.length; i += 1) {
      const tc = testCases[i];
      const hidden = Boolean(tc.hidden);

      if (consecutiveHeavyFails >= maxHeavyFails && hidden) {
        const skippedResult: CppTestResult = {
          testNum: i + 1,
          passed: false,
          hidden,
          status: "skipped",
          stderr: "Bỏ qua do quá thời gian/bộ nhớ liên tiếp",
          durationMs: 0,
          subtask: tc.subtask,
        };
        results.push(skippedResult);
        if (onTestResult) {
          try { onTestResult(skippedResult); } catch { /* non-fatal */ }
        }
        continue;
      }

      const normIn = normalizeStdin(tc.input || "");
      await fs.writeFile(inputPath, normIn, "utf-8");
      if (wrapped.dropPrivileges) {
        await fs.chmod(inputPath, 0o644);
      }
      await fs.rm(outputPath, { force: true }).catch(() => {});

      const exec = await runSandboxedProcess({
        command: wrapped.command,
        args: wrapped.args,
        cwd: wrapped.cwd,
        env: safeEnv,
        stdin: normIn,
        timeLimitMs,
        maxOutputBytes: MAX_OUTPUT_LENGTH,
        outputFilePath: outputPath,
        ...(wrapped.dropPrivileges ? { uid: 65534, gid: 65534 } : {}),
      });

      if (
        exec.status === "time_limit" ||
        exec.status === "memory_limit" ||
        exec.status === "output_limit"
      ) {
        consecutiveHeavyFails += 1;
      } else {
        consecutiveHeavyFails = 0;
      }

      const passed =
        exec.status === "success" &&
        compareOutputs(exec.stdout, tc.output || "", checkerType);

      const result: CppTestResult = {
        testNum: i + 1,
        passed,
        hidden,
        input: hidden ? undefined : tc.input,
        expected: hidden ? undefined : tc.output,
        stdout: hidden && !passed ? undefined : trimOutput(exec.stdout),
        stderr: trimOutput(exec.stderr, 16_000),
        status: exec.status,
        durationMs: exec.durationMs,
        subtask: tc.subtask,
      };
      results.push(result);
      if (onTestResult) {
        try { onTestResult(result); } catch { /* non-fatal */ }
      }
    }
  } finally {
    releaseSandboxSlot();
    void fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }

  const passedCount = results.filter((result) => result.passed).length;
  const scoring = computeJudgeScore(testCases, results);

  return {
    passedCount,
    totalTests: testCases.length,
    score: scoring.score,
    results,
    status: passedCount === testCases.length ? "all_passed" : "partial",
    ...(scoring.subtasks ? { subtasks: scoring.subtasks } : {}),
  };
}
