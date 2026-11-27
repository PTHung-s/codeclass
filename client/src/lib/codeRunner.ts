import api from "./api";

function showQueueToast(position: number): void {
  if (position <= 0) return;
  const secs = position * 0.3; // rough estimate: ~300ms per compile ahead
  const msg = position === 1
    ? `Sắp đến lượt bạn — khoảng ${secs.toFixed(0)}s`
    : `Bạn đứng thứ ${position} — khoảng ${secs.toFixed(0)}s`;
  window.dispatchEvent(
    new CustomEvent("codeclass:toast", {
      detail: {
        id: `run-queue-${Date.now()}`,
        title: "⏳ Đang xếp hàng chạy code",
        message: msg,
        type: "info",
        duration: Math.min(8000, Math.max(3000, position * 1500)),
      },
    }),
  );
}

export type SupportedLanguage = "python" | "cpp";

export interface CodeRunResult {
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

export interface PythonRunResult extends CodeRunResult {}
export interface CppRunResult extends CodeRunResult {}

export interface CodeTestCase {
  input: string;
  output: string;
  hidden?: boolean;
}

export interface PythonTestCase extends CodeTestCase {}

export interface CodeTestResult {
  testNum: number;
  passed: boolean;
  hidden: boolean;
  input?: string;
  expected?: string;
  stdout?: string;
  stderr?: string;
  status: CodeRunResult["status"];
  durationMs: number;
}

export interface PythonTestResult extends CodeTestResult {}

export interface CodeJudgeResult {
  passedCount: number;
  totalTests: number;
  score: number;
  results: CodeTestResult[];
  status: "all_passed" | "partial" | "no_tests";
}

export interface PythonJudgeResult extends CodeJudgeResult {}

// ─── Python ───

export async function runPython(code: string, stdin?: string): Promise<PythonRunResult> {
  try {
    const res = await api.post("/run/python", { code, stdin: stdin || "" });
    showQueueToast(Number(res.headers["x-run-queue-position"]) || 0);
    return res.data;
  } catch (err: any) {
    const message = err.response?.data?.error || err.message || "Không chạy được code";
    return {
      status: "runtime_error",
      stdout: "",
      stderr: message,
      output: message,
      exitCode: null,
      durationMs: 0,
      timedOut: false,
    };
  }
}

export async function runPythonTests(code: string, testCases: PythonTestCase[]): Promise<PythonJudgeResult> {
  const res = await api.post("/run/python/tests", { code, testCases });
  showQueueToast(Number(res.headers["x-run-queue-position"]) || 0);
  return res.data;
}

// ─── C++ ───

export async function runCpp(code: string, stdin?: string): Promise<CppRunResult> {
  try {
    const res = await api.post("/run/cpp", { code, stdin: stdin || "" });
    showQueueToast(Number(res.headers["x-run-queue-position"]) || 0);
    return res.data;
  } catch (err: any) {
    const message = err.response?.data?.error || err.message || "Không chạy được code";
    return {
      status: "runtime_error",
      stdout: "",
      stderr: message,
      output: message,
      exitCode: null,
      durationMs: 0,
      timedOut: false,
    };
  }
}

export async function runCppTests(code: string, testCases: CodeTestCase[]): Promise<CodeJudgeResult> {
  const res = await api.post("/run/cpp/tests", { code, testCases });
  showQueueToast(Number(res.headers["x-run-queue-position"]) || 0);
  return res.data;
}

// ─── Unified by language ───

export async function runCode(language: SupportedLanguage, code: string, stdin?: string): Promise<CodeRunResult> {
  return language === "cpp" ? runCpp(code, stdin) : runPython(code, stdin);
}

export async function runCodeTests(language: SupportedLanguage, code: string, testCases: CodeTestCase[]): Promise<CodeJudgeResult> {
  return language === "cpp" ? runCppTests(code, testCases) : runPythonTests(code, testCases);
}

// ─── C++ starter ───

export const CPP_STARTER = `#include <iostream>
using namespace std;

int main() {
    // Viết lời giải C++ của em ở đây
    return 0;
}`;
