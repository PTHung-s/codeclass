import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import {
  acquireSandboxSlot,
  buildSafeEnv,
  releaseSandboxSlot,
  runSandboxedProcess,
  sandboxQueuePosition,
  wrapCommandForSandbox,
  writePythonSandboxBootstrap,
} from "./codeSandbox";
import {
  CheckerType,
  compareOutputs,
  computeJudgeScore,
  SubtaskScoreSummary,
} from "./judgeChecker";

const DEFAULT_TIMEOUT_MS = 4000;
const MAX_OUTPUT_LENGTH = 2_000_000;
const DEFAULT_MEMORY_MB = 256;

export function pythonQueuePosition(): number {
  return sandboxQueuePosition();
}

export interface TestCase {
  input: string;
  output: string;
  hidden?: boolean;
  subtask?: number;
  points?: number;
}

export interface PythonRunResult {
  status:
    | "success"
    | "runtime_error"
    | "time_limit"
    | "memory_limit"
    | "output_limit"
    | "blocked"
    | "skipped";
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
  subtask?: number;
}

export interface PythonJudgeResult {
  passedCount: number;
  totalTests: number;
  score: number;
  results: PythonTestResult[];
  status: "all_passed" | "partial" | "no_tests";
  subtasks?: SubtaskScoreSummary[];
}

function trimOutput(value: string, max = MAX_OUTPUT_LENGTH) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n... output truncated ...`;
}

/** Only allow open() on Code Lab sandbox files input.txt / output.txt. */
function isAllowedPythonOpen(code: string): boolean {
  const opens = code.match(/\bopen\s*\(/g);
  if (!opens) return true;
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
    return 'Chỉ được open("input.txt") hoặc open("output.txt") trong Code Lab.';
  }

  return null;
}

function normalizeStdin(stdin: string): string {
  if (!stdin) return "";
  return stdin.endsWith("\n") ? stdin : `${stdin}\n`;
}

async function detectPythonCommand() {
  const candidates =
    process.platform === "win32"
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
      const child = spawn(candidate.command, [...candidate.args, "--version"], {
        windowsHide: true,
      });
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

export async function runPythonCode(
  code: string,
  stdin = "",
  opts?: { maxOutputLength?: number; timeLimitMs?: number; memoryLimitMb?: number },
): Promise<PythonRunResult> {
  const maxOut = Math.max(1024, opts?.maxOutputLength ?? MAX_OUTPUT_LENGTH);
  const timeLimitMs = Math.max(250, Math.min(12_000, opts?.timeLimitMs ?? DEFAULT_TIMEOUT_MS));
  const memoryLimitMb = Math.max(64, Math.min(512, opts?.memoryLimitMb ?? DEFAULT_MEMORY_MB));
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

  await acquireSandboxSlot();
  const workDir = path.join(os.tmpdir(), `codeclass-py-${randomUUID()}`);
  const inputPath = path.join(workDir, "input.txt");
  const outputPath = path.join(workDir, "output.txt");
  const normalizedStdin = normalizeStdin(stdin);

  try {
    await fs.mkdir(workDir, { recursive: true });
    await fs.writeFile(path.join(workDir, "main.py"), code, "utf-8");
    await fs.writeFile(inputPath, normalizedStdin, "utf-8");
    const runnerPath = await writePythonSandboxBootstrap(workDir, "main.py", {
      timeLimitMs,
      memoryLimitMb,
    });

    const wrapped = await wrapCommandForSandbox(
      python.command,
      [...python.args, "-I", "-u", runnerPath],
      { workDir, timeLimitMs, memoryLimitMb },
    );

    const exec = await runSandboxedProcess({
      command: wrapped.command,
      args: wrapped.args,
      cwd: wrapped.cwd,
      env: buildSafeEnv(workDir),
      stdin: normalizedStdin,
      timeLimitMs,
      maxOutputBytes: maxOut,
      outputFilePath: outputPath,
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
    const msg = err?.message || "Không khởi chạy được sandbox Python.";
    return {
      status: "runtime_error",
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

export async function judgePythonCode(
  code: string,
  testCases: TestCase[],
  onTestResult?: (r: PythonTestResult) => void,
  opts?: {
    timeLimitMs?: number;
    memoryLimitMb?: number;
    checkerType?: CheckerType;
    maxConsecutiveHeavyFails?: number;
  },
): Promise<PythonJudgeResult> {
  if (testCases.length === 0) {
    return { passedCount: 0, totalTests: 0, score: 0, results: [], status: "no_tests" };
  }

  const timeLimitMs = Math.max(250, Math.min(12_000, opts?.timeLimitMs ?? DEFAULT_TIMEOUT_MS));
  const memoryLimitMb = Math.max(64, Math.min(512, opts?.memoryLimitMb ?? DEFAULT_MEMORY_MB));
  const checkerType: CheckerType = opts?.checkerType ?? "exact";
  const maxHeavyFails = opts?.maxConsecutiveHeavyFails ?? 3;

  const blockedReason = validatePythonCode(code);
  if (blockedReason) {
    const results: PythonTestResult[] = testCases.map((tc, i) => ({
      testNum: i + 1,
      passed: false,
      hidden: Boolean(tc.hidden),
      status: "blocked",
      stderr: blockedReason,
      durationMs: 0,
      subtask: tc.subtask,
    }));
    return { passedCount: 0, totalTests: testCases.length, score: 0, results, status: "partial" };
  }

  const python = await getPythonCommand();
  if (!python) {
    const results: PythonTestResult[] = testCases.map((tc, i) => ({
      testNum: i + 1,
      passed: false,
      hidden: Boolean(tc.hidden),
      status: "runtime_error",
      stderr: "Không tìm thấy Python trên máy chủ.",
      durationMs: 0,
      subtask: tc.subtask,
    }));
    return { passedCount: 0, totalTests: testCases.length, score: 0, results, status: "partial" };
  }

  // Batch Reuse: 1 workDir + 1 main.py + 1 _runner.py across all test cases in the submission.
  await acquireSandboxSlot();
  const workDir = path.join(os.tmpdir(), `codeclass-pyj-${randomUUID()}`);
  const inputPath = path.join(workDir, "input.txt");
  const outputPath = path.join(workDir, "output.txt");
  const results: PythonTestResult[] = [];

  try {
    await fs.mkdir(workDir, { recursive: true });
    await fs.writeFile(path.join(workDir, "main.py"), code, "utf-8");
    const runnerPath = await writePythonSandboxBootstrap(workDir, "main.py", {
      timeLimitMs,
      memoryLimitMb,
    });
    const wrapped = await wrapCommandForSandbox(
      python.command,
      [...python.args, "-I", "-u", runnerPath],
      { workDir, timeLimitMs, memoryLimitMb },
    );
    const safeEnv = buildSafeEnv(workDir);

    let consecutiveHeavyFails = 0;

    for (let i = 0; i < testCases.length; i += 1) {
      const tc = testCases[i];
      const hidden = Boolean(tc.hidden);

      if (consecutiveHeavyFails >= maxHeavyFails && hidden) {
        const skippedResult: PythonTestResult = {
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

      const r: PythonTestResult = {
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
      results.push(r);
      if (onTestResult) {
        try { onTestResult(r); } catch { /* non-fatal */ }
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

export function parseTestCases(value?: string | null): TestCase[] {
  if (!value) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => ({
      input: typeof item.input === "string" ? item.input : "",
      output: typeof item.output === "string" ? item.output : "",
      hidden: Boolean(item.hidden),
      ...(typeof item.subtask === "number" && Number.isFinite(item.subtask) && item.subtask > 0
        ? { subtask: Math.floor(item.subtask) }
        : {}),
      ...(typeof item.points === "number" && Number.isFinite(item.points) && item.points > 0
        ? { points: item.points }
        : {}),
    }))
    .filter((item) => item.output.length > 0);
}

export function formatJudgeFeedback(result: {
  passedCount: number;
  totalTests: number;
  score: number;
  subtasks?: SubtaskScoreSummary[];
  results: { testNum: number; passed: boolean; hidden: boolean; status: string; stderr?: string }[];
}) {
  const lines = result.results.map((test) => {
    const label = test.hidden ? `Test ${test.testNum} (ẩn)` : `Test ${test.testNum}`;
    const mark = test.passed ? "PASS" : "FAIL";
    const extra =
      test.status === "time_limit"
        ? " - quá thời gian"
        : test.status === "memory_limit"
          ? " - quá bộ nhớ"
          : test.status === "output_limit"
            ? " - vượt giới hạn output"
            : test.status === "skipped"
              ? " - bỏ qua (TLE/MLE liên tiếp)"
              : test.status === "compile_error"
                ? " - lỗi biên dịch"
                : test.status === "runtime_error" || test.status === "blocked"
                  ? ` - ${test.stderr || "lỗi chạy code"}`
                  : "";
    return `${label}: ${mark}${extra}`;
  });

  const subtaskHeader =
    result.subtasks && result.subtasks.length > 0
      ? `\nSubtasks: ${result.subtasks
          .map((s) => `S${s.subtask}(${s.passed}/${s.total}: ${s.earned}/${s.points}đ)`)
          .join(" · ")}`
      : "";

  return `Auto-judge (${result.passedCount}/${result.totalTests}) - ${result.score}/10${subtaskHeader}\n${lines.join("\n")}`;
}
