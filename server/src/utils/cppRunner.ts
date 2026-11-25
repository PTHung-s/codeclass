import { spawn } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";

const TIMEOUT_MS = 10000;
const MAX_OUTPUT_LENGTH = 4_000_000;
const MAX_CONCURRENT_EXECUTIONS = 10;

// Global concurrency control
let activeExecutions = 0;

/** 0 = run immediately. 1+ = position in the wait queue. */
export function cppQueuePosition(): number {
  return Math.max(0, activeExecutions - MAX_CONCURRENT_EXECUTIONS + 1);
}

async function waitForSlot(): Promise<void> {
  while (activeExecutions >= MAX_CONCURRENT_EXECUTIONS) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  activeExecutions++;
}

function releaseSlot(): void {
  activeExecutions--;
}

// Re-export same interfaces as pythonRunner for consistency
export interface TestCase {
  input: string;
  output: string;
  hidden?: boolean;
}

export interface CppRunResult {
  status: "success" | "runtime_error" | "time_limit" | "blocked" | "compile_error";
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
}

export interface CppJudgeResult {
  passedCount: number;
  totalTests: number;
  score: number;
  results: CppTestResult[];
  status: "all_passed" | "partial" | "no_tests";
}

function trimOutput(value: string, max = MAX_OUTPUT_LENGTH) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n... output truncated ...`;
}

function normalizeOutput(value: string) {
  return value.trim().replace(/\r\n/g, "\n");
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

/** Ensure batch stdin ends with a newline so cin never hangs on last line. */
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

    // Strip temp file paths: /tmp/codeclass-xxxxxx.cpp → your code
    const clean = line
      .replace(/\/tmp\/codeclass-[a-f0-9-]+\.cpp/g, "your code")
      .replace(/\/tmp\/\S+\.cpp/g, "your code")
      .trim();

    // Skip noisy lines
    if (!clean) continue;
    if (clean.startsWith("In file included from")) continue;
    if (clean.startsWith("In member function")) continue;
    if (clean.startsWith("In function")) continue;
    if (clean.includes("note: ")) continue;
    if (clean.startsWith("compilation terminated")) continue;

    // Count actual error lines
    if (clean.includes(": error:") || clean.includes(": fatal error:")) {
      errorCount++;
    }

    filtered.push(clean);
  }

  if (filtered.length === 0) return "Compilation failed";
  return filtered.join("\n");
}

async function compileCpp(sourcePath: string, binaryPath: string): Promise<{ ok: boolean; error: string }> {
  return new Promise((resolve) => {
    const child = spawn("g++", [
      "-std=c++17",
      "-O2",
      "-Wall",
      "-fmax-errors=5",
      "-o", binaryPath,
      sourcePath,
    ], { windowsHide: true });

    let stderr = "";

    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });

    child.on("close", (code) => {
      if (code === 0) {
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

export async function runCppCode(code: string, stdin = "", opts?: { maxOutputLength?: number }): Promise<CppRunResult> {
  const maxOut = Math.max(1024, opts?.maxOutputLength ?? MAX_OUTPUT_LENGTH);
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

  // Wait for execution slot
  await waitForSlot();

  // Dedicated sandbox dir so freopen("input.txt") / ofstream("output.txt") match Code Lab UI labels.
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
  } catch (err: any) {
    releaseSlot();
    return {
      status: "runtime_error",
      stdout: "",
      stderr: err?.message || "Không tạo được thư mục chạy tạm.",
      output: err?.message || "Không tạo được thư mục chạy tạm.",
      exitCode: null,
      durationMs: 0,
      timedOut: false,
    };
  }

  // Compile
  const compileStart = Date.now();
  const compile = await compileCpp(sourcePath, binaryPath);

  if (!compile.ok) {
    releaseSlot();
    void fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
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

  // Execute
  return new Promise<CppRunResult>((resolve) => {
    const startedAt = Date.now();
    const child = spawn(binaryPath, [], { cwd: workDir, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const cleanup = () => {
      clearTimeout(timer);
      releaseSlot();
      void fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    };

    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === "win32" && child.pid) {
        spawn("taskkill", ["/pid", child.pid.toString(), "/f", "/t"], { windowsHide: true });
      } else {
        child.kill("SIGKILL");
      }
    }, TIMEOUT_MS);

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");

    child.stdout.on("data", (chunk: string) => {
      stdout = trim(stdout + chunk);
    });

    child.stderr.on("data", (chunk: string) => {
      stderr = trim(stderr + chunk);
    });

    // Handle stdin errors (EPIPE when process dies before stdin.end())
    child.stdin.on("error", () => {
      // Ignore EPIPE errors - process already dead
    });

    child.on("error", (error) => {
      cleanup();
      resolve({
        status: "runtime_error",
        stdout: "",
        stderr: error.message,
        output: error.message,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        timedOut: false,
      });
    });

    child.on("close", (exitCode) => {
      const durationMs = Date.now() - startedAt;
      const finish = async () => {
        let fileOut = "";
        try {
          fileOut = await fs.readFile(outputPath, "utf-8");
        } catch {
          /* no output.txt */
        }
        cleanup();
        const status: CppRunResult["status"] = timedOut
          ? "time_limit"
          : exitCode === 0
            ? "success"
            : "runtime_error";
        const effectiveStdout = fileOut.trim().length > 0 ? fileOut : stdout;
        const output = timedOut
          ? "Time limit exceeded"
          : [effectiveStdout, stderr].filter(Boolean).join("\n").trim() || "(không có output)";

        resolve({
          status,
          stdout: trim(effectiveStdout),
          stderr: timedOut ? "Time limit exceeded" : trim(stderr),
          output: trim(output),
          exitCode,
          durationMs,
          timedOut,
        });
      };
      void finish();
    });

    // Also feed stdin so cin works without freopen("input.txt").
    if (normalizedStdin && child.stdin.writable) {
      child.stdin.end(normalizedStdin);
    } else if (child.stdin.writable) {
      child.stdin.end();
    }
  });
}

export async function judgeCppCode(code: string, testCases: TestCase[], onTestResult?: (r: CppTestResult) => void): Promise<CppJudgeResult> {
  if (testCases.length === 0) {
    return { passedCount: 0, totalTests: 0, score: 0, results: [], status: "no_tests" };
  }

  // Compile once, then run the binary for each test case. Before this change,
  // every test case called runCppCode which spawned g++ again — so a 20-test
  // problem compiled 20 times, held 20 slot acquisitions, and every student in
  // the same classroom waited behind each g++ invocation. Now it's 1 compile.

  const blockedReason = validateCppCode(code);
  if (blockedReason) {
    const result: CppTestResult = { testNum: 1, passed: false, hidden: false, status: "blocked", durationMs: 0, stderr: blockedReason };
    return { passedCount: 0, totalTests: testCases.length, score: 0, results: testCases.map((_, i) => ({ ...result, testNum: i + 1 })), status: "partial" };
  }

  if (!(await hasCompiler())) {
    const result: CppTestResult = { testNum: 1, passed: false, hidden: false, status: "runtime_error", durationMs: 0, stderr: "Không tìm thấy trình biên dịch g++ trên máy chủ." };
    return { passedCount: 0, totalTests: testCases.length, score: 0, results: testCases.map((_, i) => ({ ...result, testNum: i + 1 })), status: "partial" };
  }

  await waitForSlot();

  const tmpDir = os.tmpdir();
  const baseName = `codeclass-${randomUUID()}`;
  const sourcePath = path.join(tmpDir, `${baseName}.cpp`);
  const binaryPath = path.join(tmpDir, baseName);

  await fs.writeFile(sourcePath, code, "utf-8");

  const compileStart = Date.now();
  const compile = await compileCpp(sourcePath, binaryPath);

  if (!compile.ok) {
    releaseSlot();
    void fs.unlink(sourcePath).catch(() => {});
    const ceResult: CppTestResult = {
      testNum: 1, passed: false, hidden: false, status: "compile_error",
      durationMs: Date.now() - compileStart, stderr: compile.error,
    };
    return {
      passedCount: 0, totalTests: testCases.length, score: 0,
      results: testCases.map((_, i) => ({ ...ceResult, testNum: i + 1 })),
      status: "partial",
    };
  }

  // Run the same binary against each test case sequentially.
  const results: CppTestResult[] = [];
  for (let i = 0; i < testCases.length; i += 1) {
    const tc = testCases[i];
    const run = await new Promise<CppRunResult>((resolve) => {
      const startedAt = Date.now();
      const child = spawn(binaryPath, [], { windowsHide: true });
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        if (process.platform === "win32" && child.pid) {
          spawn("taskkill", ["/pid", child.pid.toString(), "/f", "/t"], { windowsHide: true });
        } else {
          child.kill("SIGKILL");
        }
      }, TIMEOUT_MS);

      child.stdout.setEncoding("utf-8");
      child.stderr.setEncoding("utf-8");
      child.stdout.on("data", (chunk: string) => {
        stdout = trimOutput(stdout + chunk);
      });
      child.stderr.on("data", (chunk: string) => {
        stderr = trimOutput(stderr + chunk);
      });
      child.stdin.on("error", () => {});
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ status: "runtime_error", stdout: "", stderr: error.message, output: error.message, exitCode: null, durationMs: Date.now() - startedAt, timedOut: false });
      });
      child.on("close", (exitCode) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startedAt;
        const status: CppRunResult["status"] = timedOut ? "time_limit" : exitCode === 0 ? "success" : "runtime_error";
        const output = timedOut ? "Time limit exceeded" : [stdout, stderr].filter(Boolean).join("\n").trim() || "(không có output)";
        resolve({ status, stdout: trimOutput(stdout), stderr: timedOut ? "Time limit exceeded" : trimOutput(stderr), output: trimOutput(output), exitCode, durationMs, timedOut });
      });

      const input = normalizeStdin(tc.input || "");
      if (input && child.stdin.writable) child.stdin.end(input);
      else if (child.stdin.writable) child.stdin.end();
    });

    const passed = run.status === "success" && normalizeOutput(run.stdout) === normalizeOutput(tc.output || "");
    const hidden = Boolean(tc.hidden);
    const result: CppTestResult = {
      testNum: i + 1, passed, hidden,
      input: hidden ? undefined : tc.input,
      expected: hidden ? undefined : tc.output,
      stdout: hidden && !passed ? undefined : run.stdout,
      stderr: run.stderr, status: run.status, durationMs: run.durationMs,
    };
    results.push(result);
    if (onTestResult) { try { onTestResult(result); } catch { /* non-fatal */ } }
  }

  releaseSlot();
  void fs.unlink(sourcePath).catch(() => {});
  void fs.unlink(binaryPath).catch(() => {});

  const passedCount = results.filter((result) => result.passed).length;
  const score = Math.round((passedCount / testCases.length) * 100) / 10;

  return {
    passedCount, totalTests: testCases.length, score, results,
    status: passedCount === testCases.length ? "all_passed" : "partial",
  };
}
