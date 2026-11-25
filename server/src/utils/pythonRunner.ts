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
export function pythonQueuePosition(): number {
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

export interface TestCase {
  input: string;
  output: string;
  hidden?: boolean;
}

export interface PythonRunResult {
  status: "success" | "runtime_error" | "time_limit" | "blocked";
  stdout: string;
  stderr: string;
  output: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
}

export interface PythonTestResult {
  testNum: number;
  passed: boolean;
  hidden: boolean;
  input?: string;
  expected?: string;
  stdout?: string;
  stderr?: string;
  status: PythonRunResult["status"];
  durationMs: number;
}

export interface PythonJudgeResult {
  passedCount: number;
  totalTests: number;
  score: number;
  results: PythonTestResult[];
  status: "all_passed" | "partial" | "no_tests";
}

function trimOutput(value: string, max = MAX_OUTPUT_LENGTH) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n... output truncated ...`;
}

function normalizeOutput(value: string) {
  return value.trim().replace(/\r\n/g, "\n").replace(/\n+$/g, "");
}

/** Only allow open() on Code Lab sandbox files input.txt / output.txt. */
function isAllowedPythonOpen(code: string): boolean {
  const opens = code.match(/\bopen\s*\(/g);
  if (!opens) return true;
  // Strip string literals that look like allowed paths, then reject any remaining open(
  // Simpler: every open( must use a literal "input.txt" or "output.txt" as first arg.
  const allowed = /^\s*open\s*\(\s*(['"])(input|output)\.txt\1/;
  const re = /\bopen\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const slice = code.slice(m.index);
    if (!allowed.test(slice)) return false;
  }
  return true;
}

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
    /\beval\s*\(/,
    /\bexec\s*\(/,
  ];

  if (blockedPatterns.some((pattern) => pattern.test(code))) {
    return "Code dùng thao tác hệ thống/file/network nên chưa được phép chạy trong lớp học.";
  }
  if (/\bopen\s*\(/.test(code) && !isAllowedPythonOpen(code)) {
    return "Chỉ được open(\"input.txt\") hoặc open(\"output.txt\") trong Code Lab.";
  }

  return null;
}

/** Ensure batch stdin ends with a newline so input()/cin never hang on last line. */
function normalizeStdin(stdin: string): string {
  if (!stdin) return "";
  return stdin.endsWith("\n") ? stdin : `${stdin}\n`;
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

export async function runPythonCode(code: string, stdin = "", opts?: { maxOutputLength?: number }): Promise<PythonRunResult> {
  const maxOut = Math.max(1024, opts?.maxOutputLength ?? MAX_OUTPUT_LENGTH);
  const trim = (value: string) => trimOutput(value, maxOut);
  const blockedReason = validatePythonCode(code);
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

  const python = await getPythonCommand();
  if (!python) {
    return {
      status: "runtime_error",
      stdout: "",
      stderr: "Không tìm thấy Python trên máy chủ.",
      output: "Không tìm thấy Python trên máy chủ.",
      exitCode: null,
      durationMs: 0,
      timedOut: false,
    };
  }

  // Wait for execution slot
  await waitForSlot();

  // Sandbox dir so open("input.txt") / freopen-style workflows work like Code Lab UI.
  const workDir = path.join(os.tmpdir(), `codeclass-py-${randomUUID()}`);
  const filePath = path.join(workDir, "main.py");
  const inputPath = path.join(workDir, "input.txt");
  const outputPath = path.join(workDir, "output.txt");
  const normalizedStdin = normalizeStdin(stdin);

  try {
    await fs.mkdir(workDir, { recursive: true });
    await fs.writeFile(filePath, code, "utf-8");
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

  return new Promise<PythonRunResult>((resolve) => {
    const startedAt = Date.now();
    const child = spawn(python.command, [...python.args, "-u", filePath], {
      cwd: workDir,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        PYTHONDONTWRITEBYTECODE: "1",
      },
    });
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
        // Prefer output.txt if the program wrote one (competitive-programming style).
        let fileOut = "";
        try {
          fileOut = await fs.readFile(outputPath, "utf-8");
        } catch {
          /* no output.txt */
        }
        cleanup();
        const status: PythonRunResult["status"] = timedOut
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

    // Also feed stdin so input() works without open("input.txt").
    if (normalizedStdin && child.stdin.writable) {
      child.stdin.end(normalizedStdin);
    } else if (child.stdin.writable) {
      child.stdin.end();
    }
  });
}

export async function judgePythonCode(
  code: string,
  testCases: TestCase[],
  onTestResult?: (r: PythonTestResult) => void,
): Promise<PythonJudgeResult> {
  if (testCases.length === 0) {
    return { passedCount: 0, totalTests: 0, score: 0, results: [], status: "no_tests" };
  }

  const results: PythonTestResult[] = [];

  for (let i = 0; i < testCases.length; i += 1) {
    const tc = testCases[i];
    const run = await runPythonCode(code, tc.input || "");
    const passed = run.status === "success" && normalizeOutput(run.stdout) === normalizeOutput(tc.output || "");
    const hidden = Boolean(tc.hidden);

    const r: PythonTestResult = {
      testNum: i + 1,
      passed,
      hidden,
      input: hidden ? undefined : tc.input,
      expected: hidden ? undefined : tc.output,
      stdout: hidden && !passed ? undefined : run.stdout,
      stderr: run.stderr,
      status: run.status,
      durationMs: run.durationMs,
    };
    results.push(r);
    // Fire-and-forget: push this single test's result to the caller (e.g. the
    // submitting student) as soon as it's ready, NOT after the whole batch.
    if (onTestResult) {
      try { onTestResult(r); } catch { /* non-fatal */ }
    }
  }

  const passedCount = results.filter((result) => result.passed).length;
  const score = Math.round((passedCount / testCases.length) * 100) / 10;

  return {
    passedCount,
    totalTests: testCases.length,
    score,
    results,
    status: passedCount === testCases.length ? "all_passed" : "partial",
  };
}

export function parseTestCases(value?: string | null): TestCase[] {
  if (!value) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => ({
      input: typeof item.input === "string" ? item.input : "",
      output: typeof item.output === "string" ? item.output : "",
      hidden: Boolean(item.hidden),
    }))
    .filter((item) => item.output.length > 0);
}

export function formatJudgeFeedback(result: { passedCount: number; totalTests: number; score: number; results: { testNum: number; passed: boolean; hidden: boolean; status: string; stderr?: string }[] }) {
  const lines = result.results.map((test) => {
    const label = test.hidden ? `Test ${test.testNum} (ẩn)` : `Test ${test.testNum}`;
    const mark = test.passed ? "PASS" : "FAIL";
    const extra = test.status === "time_limit"
      ? " - quá thời gian"
      : test.status === "compile_error"
        ? " - lỗi biên dịch"
        : test.status === "runtime_error" || test.status === "blocked"
          ? ` - ${test.stderr || "lỗi chạy code"}`
          : "";
    return `${label}: ${mark}${extra}`;
  });

  return `Auto-judge (${result.passedCount}/${result.totalTests}) - ${result.score}/10\n${lines.join("\n")}`;
}
