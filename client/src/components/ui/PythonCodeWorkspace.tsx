import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  CheckCircle2,
  Code2,
  FlaskConical,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Terminal,
  XCircle,
} from "lucide-react";
import { CodeRunResult, runCode, SupportedLanguage, CPP_STARTER } from "../../lib/codeRunner";
import { useDarkMode } from "../../hooks/useDarkMode";
import { clearLiveEditor, publishLiveEditor } from "../../lib/liveEditorBridge";
import { reportRecordingRun } from "../../hooks/useSessionRecorder";

export interface ExternalRunRequest {
  seq: number;
  mode: "single" | "all";
  input?: string;
  expected?: string | null;
  sampleIndex?: number;
}

interface SampleRunItem {
  index: number;
  input: string;
  expected: string;
  actual: string;
  status: CodeRunResult["status"];
  durationMs: number;
  passed: boolean;
  errorText?: string;
}

interface PythonCodeWorkspaceProps {
  code: string;
  onCodeChange: (value: string) => void;
  language?: SupportedLanguage;
  onLanguageChange?: (lang: SupportedLanguage) => void;
  starterCode?: string | null;
  sampleInput?: string | null;
  sampleOutput?: string | null;
  /** Visible sample test cases from `problem.testCases`. */
  visibleTests?: { input: string; output: string }[];
  checkerType?: string;
  testCases?: string | null;
  note?: string;
  onNoteChange?: (value: string) => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitting?: boolean;
  autosaveLabel?: string;
  showSubmit?: boolean;
  height?: number | string;
  liveLabel?: string;
  disableLivePublish?: boolean;
  layout?: "side-by-side" | "stacked";
  externalRunRequest?: ExternalRunRequest | null;
}

const FAST_IO_TEMPLATES: Record<SupportedLanguage, string> = {
  python: `import sys

def solve():
    data = sys.stdin.buffer.read().split()
    if not data:
        return
    # n = int(data[0])

if __name__ == "__main__":
    solve()
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`,
};

function normalizeText(value: string) {
  return value.trim().replace(/\r\n/g, "\n");
}

function compareSampleOutput(actualRaw: string, expectedRaw: string, checkerType?: string): boolean {
  const act = actualRaw.replace(/\r\n/g, "\n").trim();
  const exp = expectedRaw.replace(/\r\n/g, "\n").trim();
  if (checkerType === "tokens") {
    return act.split(/\s+/).filter(Boolean).join(" ") === exp.split(/\s+/).filter(Boolean).join(" ");
  }
  if (checkerType === "ignore_case") {
    return act.toLowerCase() === exp.toLowerCase();
  }
  if (checkerType === "float_1e6" || checkerType === "float_1e4") {
    const tol = checkerType === "float_1e4" ? 1e-4 : 1e-6;
    const aTok = act.split(/\s+/).filter(Boolean);
    const eTok = exp.split(/\s+/).filter(Boolean);
    if (aTok.length !== eTok.length) return false;
    return aTok.every((t, i) => {
      const an = Number(t);
      const en = Number(eTok[i]);
      if (Number.isFinite(an) && Number.isFinite(en)) {
        return Math.abs(an - en) <= tol * Math.max(1, Math.abs(en));
      }
      return t === eTok[i];
    });
  }
  const actLines = act.split("\n").map((l) => l.trimEnd()).join("\n");
  const expLines = exp.split("\n").map((l) => l.trimEnd()).join("\n");
  return actLines === expLines;
}

function StatusPill({ status }: { status: CodeRunResult["status"] }) {
  const map: Record<string, string> = {
    success:
      "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    runtime_error: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
    time_limit: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300",
    memory_limit: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300",
    output_limit: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300",
    blocked: "bg-orange-100 text-orange-700 border-orange-200",
    compile_error: "bg-blue-100 text-blue-700 border-border dark:bg-blue-950/40 dark:text-blue-300",
  };

  const label: Record<string, string> = {
    success: "Chạy xong",
    runtime_error: "Lỗi chạy code",
    time_limit: "Quá thời gian",
    memory_limit: "Quá bộ nhớ",
    output_limit: "Quá giới hạn xuất",
    blocked: "Bị chặn",
    compile_error: "Lỗi biên dịch",
  };

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${map[status] || ""}`}>
      {label[status] || status}
    </span>
  );
}

export default function PythonCodeWorkspace({
  code,
  onCodeChange,
  language: controlledLanguage,
  onLanguageChange,
  starterCode,
  sampleInput,
  sampleOutput,
  visibleTests,
  checkerType,
  note,
  onNoteChange,
  onSubmit,
  submitLabel = "Nộp bài",
  submitting = false,
  autosaveLabel = "Tự lưu",
  showSubmit = true,
  height = 420,
  liveLabel,
  disableLivePublish = false,
  layout = "side-by-side",
  externalRunRequest = null,
}: PythonCodeWorkspaceProps) {
  const { dark } = useDarkMode();
  const [internalLanguage, setInternalLanguage] = useState<SupportedLanguage>("python");
  const language = controlledLanguage ?? internalLanguage;
  const setLanguage = onLanguageChange ?? setInternalLanguage;

  const samplesList =
    visibleTests && visibleTests.length > 0
      ? visibleTests
      : sampleInput || sampleOutput
        ? [{ input: sampleInput || "", output: sampleOutput || "" }]
        : [];

  const [stdin, setStdin] = useState(sampleInput || samplesList[0]?.input || "");
  const [expectedOutput, setExpectedOutput] = useState<string | null>(
    sampleOutput ?? samplesList[0]?.output ?? null,
  );
  const [runResult, setRunResult] = useState<CodeRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [consoleTab, setConsoleTab] = useState<"custom" | "samples">(
    samplesList.length > 0 ? "samples" : "custom",
  );
  const [sampleResults, setSampleResults] = useState<SampleRunItem[] | null>(null);
  const [runningSamples, setRunningSamples] = useState(false);
  const [activeSampleIdx, setActiveSampleIdx] = useState(0);
  const [confirmTemplate, setConfirmTemplate] = useState(false);

  useEffect(() => {
    if (disableLivePublish) return;
    if (code.trim().length > 0) {
      publishLiveEditor({
        code,
        language,
        label: liveLabel || "Bài tập lập trình",
        source: "workspace",
      });
    }
  }, [disableLivePublish, code, language, liveLabel]);

  useEffect(() => {
    if (disableLivePublish) return;
    return () => clearLiveEditor("workspace");
  }, [disableLivePublish]);

  const canRun = code.trim().length > 0;
  const samplePassed =
    runResult?.status === "success" && expectedOutput !== null && expectedOutput !== undefined
      ? compareSampleOutput(runResult.stdout, expectedOutput, checkerType)
      : null;

  const handleRun = useCallback(
    async (customInput?: string, customExpected?: string | null) => {
      if (!code.trim()) return;
      const usedInput = customInput !== undefined ? customInput : stdin;
      const usedExpected = customExpected !== undefined ? customExpected : expectedOutput;
      setConsoleTab("custom");
      setRunning(true);
      const result = await runCode(language, code, usedInput);
      setRunResult(result);
      setRunning(false);

      const hasExpected = typeof usedExpected === "string" && usedExpected.trim().length > 0;
      const passed =
        result.status === "success"
          ? hasExpected
            ? compareSampleOutput(result.stdout, usedExpected, checkerType)
            : null
          : false;
      reportRecordingRun(liveLabel || "Chạy thử bài tập", passed, code);
    },
    [code, stdin, expectedOutput, language, checkerType, liveLabel],
  );

  const handleRunAllSamples = useCallback(async () => {
    if (!code.trim() || samplesList.length === 0) return;
    setConsoleTab("samples");
    setRunningSamples(true);
    setActiveSampleIdx(0);
    const collected: SampleRunItem[] = [];
    for (let i = 0; i < samplesList.length; i++) {
      const tc = samplesList[i];
      const res = await runCode(language, code, tc.input);
      const passed =
        res.status === "success" && compareSampleOutput(res.stdout, tc.output, checkerType);
      collected.push({
        index: i,
        input: tc.input,
        expected: tc.output,
        actual: res.stdout,
        status: res.status,
        durationMs: res.durationMs,
        passed,
        errorText: res.status !== "success" ? res.output : undefined,
      });
      setSampleResults([...collected]);
    }
    setRunningSamples(false);
    const allPass = collected.every((r) => r.passed);
    reportRecordingRun(liveLabel || "Chạy tất cả ví dụ", allPass, code);
  }, [code, samplesList, language, checkerType, liveLabel]);

  const lastSeqRef = useRef(0);
  useEffect(() => {
    if (!externalRunRequest || externalRunRequest.seq === lastSeqRef.current) return;
    lastSeqRef.current = externalRunRequest.seq;
    if (externalRunRequest.mode === "all") {
      void handleRunAllSamples();
    } else if (externalRunRequest.mode === "single") {
      const nextIn = externalRunRequest.input ?? "";
      const nextExp = externalRunRequest.expected ?? null;
      setStdin(nextIn);
      setExpectedOutput(nextExp);
      void handleRun(nextIn, nextExp);
    }
  }, [externalRunRequest, handleRun, handleRunAllSamples]);

  const handleRunRef = useRef(handleRun);
  useEffect(() => {
    handleRunRef.current = handleRun;
  });

  const resetStarter = () => {
    if (!starterCode) return;
    onCodeChange(starterCode);
    setRunResult(null);
    setSampleResults(null);
  };

  const applyFastIoTemplate = () => {
    const trimmed = code.trim();
    const isBoilerplate =
      trimmed.length === 0 ||
      trimmed === (starterCode || "").trim() ||
      trimmed === CPP_STARTER.trim() ||
      trimmed.startsWith("# Viết lời giải Python");

    if (!isBoilerplate && !confirmTemplate) {
      setConfirmTemplate(true);
      setTimeout(() => setConfirmTemplate(false), 3500);
      return;
    }
    onCodeChange(FAST_IO_TEMPLATES[language]);
    setConfirmTemplate(false);
  };

  const handleLanguageSwitch = (lang: SupportedLanguage) => {
    setLanguage(lang);
    if (lang === "cpp" && (!code || code === "" || code.startsWith("# Viết lời giải Python"))) {
      onCodeChange(CPP_STARTER);
    }
  };

  const isStacked = layout === "stacked";

  const consolePanel = (
    <aside
      className={`flex flex-col bg-muted/30 dark:bg-[#11151d] ${
        isStacked ? "border-t border-border" : "min-h-[380px]"
      }`}
    >
      {/* Console mode tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <div className="flex items-center gap-1">
          {samplesList.length > 0 && (
            <button
              type="button"
              onClick={() => setConsoleTab("samples")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                consoleTab === "samples"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FlaskConical className="size-3" />
              Test mẫu ({samplesList.length})
              {sampleResults && (
                <span
                  className={`ml-0.5 rounded-full px-1.5 py-0 text-[10px] ${
                    sampleResults.every((r) => r.passed)
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                      : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {sampleResults.filter((r) => r.passed).length}/{sampleResults.length}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setConsoleTab("custom")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              consoleTab === "custom"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Terminal className="size-3" />
            Input tự nhập
          </button>
        </div>
        {consoleTab === "custom" && runResult && <StatusPill status={runResult.status} />}
      </div>

      {consoleTab === "samples" && samplesList.length > 0 ? (
        <div className="space-y-3 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {samplesList.map((_, idx) => {
              const res = sampleResults?.find((r) => r.index === idx);
              const isSelected = activeSampleIdx === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveSampleIdx(idx)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {res ? (
                    res.passed ? (
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="size-3.5 text-destructive" />
                    )
                  ) : null}
                  <span>Ví dụ {idx + 1}</span>
                </button>
              );
            })}
            {runningSamples && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Đang chạy...
              </span>
            )}
          </div>

          {(() => {
            const tc = samplesList[activeSampleIdx] || samplesList[0];
            const res = sampleResults?.find((r) => r.index === activeSampleIdx);
            return (
              <div className="space-y-2.5">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Input
                  </p>
                  <pre className="max-h-24 overflow-auto rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-xs text-foreground">
                    {tc.input || "(rỗng)"}
                  </pre>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Output mong đợi
                    </p>
                    <pre className="max-h-28 overflow-auto rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-xs text-foreground">
                      {tc.output || "(rỗng)"}
                    </pre>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Kết quả của em
                      </p>
                      {res && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {res.durationMs}ms
                        </span>
                      )}
                    </div>
                    {!res ? (
                      <div className="rounded-md border border-dashed border-border bg-card/60 px-2.5 py-3 text-xs text-muted-foreground">
                        Bấm <span className="font-semibold text-foreground">Chạy mẫu</span> để kiểm tra ngay.
                      </div>
                    ) : res.errorText ? (
                      <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 font-mono text-xs text-destructive">
                        {res.errorText}
                      </pre>
                    ) : (
                      <pre
                        className={`max-h-28 overflow-auto rounded-md border px-2.5 py-1.5 font-mono text-xs ${
                          res.passed
                            ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                            : "border-destructive/35 bg-destructive/10 text-destructive"
                        }`}
                      >
                        {res.actual || "(không có output)"}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="space-y-3 p-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Input
              </label>
              {samplesList.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {samplesList.slice(0, 3).map((tc, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setStdin(tc.input);
                        setExpectedOutput(tc.output);
                      }}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      Dùng VD {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <textarea
              data-slot="workspace-stdin"
              value={stdin}
              onChange={(event) => setStdin(event.target.value)}
              placeholder="Nhập input để chạy thử..."
              spellCheck={false}
              className="h-20 w-full resize-y rounded-md border border-border bg-card px-2.5 py-2 font-mono text-xs text-foreground outline-none focus:border-primary/60 dark:bg-[#0b0e14]"
            />
          </div>

          {expectedOutput && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Output mong đợi
              </p>
              <pre className="max-h-20 overflow-auto rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 font-mono text-xs text-amber-900 dark:text-amber-300">
                {expectedOutput}
              </pre>
            </div>
          )}

          <div>
            {!runResult ? (
              <div className="rounded-md border border-dashed border-border bg-card/70 p-2.5 text-xs text-muted-foreground">
                Chạy code (Ctrl+Enter) để xem stdout/stderr. Bấm{" "}
                <span className="font-semibold text-foreground">{submitLabel}</span> để chấm toàn bộ test.
              </div>
            ) : runResult.status === "compile_error" ? (
              <div className="rounded-lg border border-border bg-blue-50 p-3 dark:bg-blue-950/30">
                <div className="mb-2 flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                    Lỗi biên dịch (compile error)
                  </span>
                </div>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground">
                  {runResult.output}
                </pre>
                <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                  Kiểm tra cú pháp C++: thiếu dấu `;`, sai tên biến, hoặc chưa khai báo thư viện.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {samplePassed !== null && (
                  <div
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                      samplePassed
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                        : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                    }`}
                  >
                    {samplePassed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {samplePassed ? "Khớp output mong đợi" : "Chưa khớp output mong đợi"}
                  </div>
                )}
                <pre
                  className={`max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border px-3 py-2 font-mono text-xs ${
                    runResult.status === "success"
                      ? "border-slate-700 bg-slate-950 text-green-300"
                      : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                  }`}
                >
                  {runResult.output}
                </pre>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  Thời gian chạy: {runResult.durationMs}ms
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {onNoteChange && !isStacked && (
        <div className="border-t border-border p-4">
          <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Ghi chú
          </label>
          <textarea
            value={note || ""}
            onChange={(event) => onNoteChange(event.target.value)}
            rows={3}
            placeholder="Ghi chú cho giáo viên hoặc cho lần nộp này..."
            className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      )}
    </aside>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/45 px-3 py-2 dark:bg-[#14171f]">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Terminal className="size-3.5 text-primary" />
            Code
          </span>
          <div className="flex h-7 items-center rounded-[6px] border border-border bg-background/80 p-0.5 dark:bg-zinc-900/90">
            <button
              type="button"
              onClick={() => handleLanguageSwitch("python")}
              className={`h-6 rounded-[4px] px-2 text-xs font-medium transition-colors ${
                language === "python"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-1">
                <Code2 className="size-3" /> Python
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleLanguageSwitch("cpp")}
              className={`h-6 rounded-[4px] px-2 text-xs font-medium transition-colors ${
                language === "cpp"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              C++17
            </button>
          </div>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            {autosaveLabel} · Ctrl+↵
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={applyFastIoTemplate}
            title="Chèn nhanh mẫu đọc xuất tốc độ cao (Fast I/O)"
            className={`inline-flex h-7 items-center gap-1 rounded-[6px] border px-2 text-xs font-medium transition-colors ${
              confirmTemplate
                ? "border-amber-500/60 bg-amber-500/15 text-amber-800 dark:text-amber-300"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Sparkles className="size-3" />
            {confirmTemplate ? "Bấm lại để ghi đè" : "Fast I/O"}
          </button>

          {samplesList.length > 0 && (
            <button
              type="button"
              onClick={() => void handleRunAllSamples()}
              disabled={!canRun || running || runningSamples}
              className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-emerald-500/40 bg-emerald-500/10 px-2.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-emerald-300"
            >
              {runningSamples ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FlaskConical className="size-3" />
              )}
              Chạy mẫu
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleRun()}
            disabled={!canRun || running || runningSamples}
            className="inline-flex h-7 items-center gap-1.5 rounded-[6px] bg-emerald-600 px-2.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3 fill-current" />}
            Chạy
          </button>

          {starterCode && (
            <button
              type="button"
              onClick={resetStarter}
              className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-border bg-background px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="size-3" />
              Reset
            </button>
          )}

          {showSubmit && (
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting || !canRun}
              className="inline-flex h-7 items-center gap-1.5 rounded-[6px] bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3" />}
              {submitLabel}
            </button>
          )}
        </div>
      </div>

      <div className={isStacked ? "flex flex-col" : "grid min-h-[480px] lg:grid-cols-[minmax(0,1fr)_320px]"}>
        <div className={`min-w-0 ${isStacked ? "" : "border-b border-border lg:border-b-0 lg:border-r"}`}>
          <Editor
            height={typeof height === "number" ? `${height}px` : height}
            language={language === "cpp" ? "cpp" : "python"}
            value={code}
            onChange={(value) => onCodeChange(value || "")}
            theme={dark ? "vs-dark" : "vs"}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineHeight: 20,
              fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
              tabSize: 4,
              insertSpaces: true,
              detectIndentation: false,
              padding: { top: 12, bottom: 12 },
              scrollBeyondLastLine: false,
              wordWrap: "on",
            }}
            onMount={(editor, monaco) => {
              editor.updateOptions({ tabFocusMode: false });
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                void handleRunRef.current();
              });
            }}
          />
        </div>

        {consolePanel}
      </div>
    </div>
  );
}
