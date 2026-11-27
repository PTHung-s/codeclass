import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { CheckCircle2, Code2, Loader2, Play, RotateCcw, Send, Terminal, XCircle } from "lucide-react";
import { CodeRunResult, runCode, SupportedLanguage, CPP_STARTER } from "../../lib/codeRunner";
import { useDarkMode } from "../../hooks/useDarkMode";
import { clearLiveEditor, publishLiveEditor } from "../../lib/liveEditorBridge";
import { reportRecordingRun } from "../../hooks/useSessionRecorder";

interface PythonCodeWorkspaceProps {
  code: string;
  onCodeChange: (value: string) => void;
  language?: SupportedLanguage;
  onLanguageChange?: (lang: SupportedLanguage) => void;
  starterCode?: string | null;
  sampleInput?: string | null;
  sampleOutput?: string | null;
  /** Kept for call-site compatibility. Grading is the submit endpoint's job now. */
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
}

function normalizeText(value: string) {
  return value.trim().replace(/\r\n/g, "\n");
}

function StatusPill({ status }: { status: CodeRunResult["status"] }) {
  const map: Record<string, string> = {
    success: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    runtime_error: "bg-red-100 text-red-700 border-red-200",
    time_limit: "bg-amber-100 text-amber-700 border-amber-200",
    memory_limit: "bg-purple-100 text-purple-700 border-purple-200",
    output_limit: "bg-orange-100 text-orange-700 border-orange-200",
    blocked: "bg-orange-100 text-orange-700 border-orange-200",
    compile_error: "bg-blue-100 text-blue-700 border-border",
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

  return <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${map[status] || ""}`}>{label[status] || status}</span>;
}

export default function PythonCodeWorkspace({
  code,
  onCodeChange,
  language: controlledLanguage,
  onLanguageChange,
  starterCode,
  sampleInput,
  sampleOutput,
  note,
  onNoteChange,
  onSubmit,
  submitLabel = "Nộp bài",
  submitting = false,
  autosaveLabel = "Tự lưu",
  showSubmit = true,
  height = 420,
  liveLabel,
}: PythonCodeWorkspaceProps) {
  const { dark } = useDarkMode();
  const [internalLanguage, setInternalLanguage] = useState<SupportedLanguage>("python");
  const language = controlledLanguage ?? internalLanguage;
  const setLanguage = onLanguageChange ?? setInternalLanguage;

  const [stdin, setStdin] = useState(sampleInput || "");
  const [runResult, setRunResult] = useState<CodeRunResult | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (code.trim().length > 0) {
      publishLiveEditor({
        code,
        language,
        label: liveLabel || "Bài tập lập trình",
        source: "workspace",
      });
    }
  }, [code, language, liveLabel]);

  useEffect(() => {
    return () => clearLiveEditor("workspace");
  }, []);

  const canRun = code.trim().length > 0;
  const samplePassed = runResult?.status === "success" && sampleOutput !== undefined
    ? normalizeText(runResult.stdout) === normalizeText(sampleOutput || "")
    : null;

  const handleRun = async (input = stdin) => {
    if (!canRun) return;
    setRunning(true);
    const result = await runCode(language, code, input);
    setRunResult(result);
    setRunning(false);
    const hasSample = typeof sampleOutput === "string" && sampleOutput.trim().length > 0;
    const passed =
      result.status === "success"
        ? hasSample
          ? normalizeText(result.stdout) === normalizeText(sampleOutput)
          : null
        : false;
    reportRecordingRun(liveLabel || "Chạy thử bài tập", passed, code);
  };

  const handleRunRef = useRef(handleRun);
  useEffect(() => {
    handleRunRef.current = handleRun;
  });

  const resetStarter = () => {
    if (!starterCode) return;
    onCodeChange(starterCode);
    setRunResult(null);
  };

  const handleLanguageSwitch = (lang: SupportedLanguage) => {
    setLanguage(lang);
    if (lang === "cpp" && (!code || code === "" || code.startsWith("# Viết lời giải Python"))) {
      onCodeChange(CPP_STARTER);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/45 px-3 py-2 dark:bg-[#14171f]">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Terminal className="size-3.5 text-primary" />
            Code
          </span>
          {/* Language selector */}
          <div className="flex h-7 items-center rounded-[6px] border border-border bg-background/80 p-0.5 dark:bg-zinc-900/90">
            <button
              type="button"
              onClick={() => handleLanguageSwitch("python")}
              className={`h-6 rounded-[4px] px-2 text-xs font-medium transition-colors ${
                language === "python" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
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
                language === "cpp" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              C++
            </button>
          </div>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">{autosaveLabel} · Ctrl+↵</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleRun()}
            disabled={!canRun || running}
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

      <div className="grid min-h-[480px] lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
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
              // Ensure Tab always inserts spaces (never jumps to other elements)
              editor.updateOptions({ tabFocusMode: false });
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                void handleRunRef.current();
              });
            }}
          />
        </div>

        <aside className="flex min-h-[380px] flex-col bg-muted/30 dark:bg-[#11151d]">
          <div className="border-b border-border p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Input</label>
              {sampleInput && (
                <button
                  type="button"
                  onClick={() => setStdin(sampleInput)}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  Dùng sample
                </button>
              )}
            </div>
            <textarea
              data-slot="workspace-stdin"
              value={stdin}
              onChange={(event) => setStdin(event.target.value)}
              placeholder="Nhập input để chạy thử..."
              spellCheck={false}
              className="h-24 w-full resize-none rounded-md border border-border bg-card px-2.5 py-2 font-mono text-xs text-foreground outline-none focus:border-primary/60 dark:bg-[#0b0e14]"
            />
          </div>

          {sampleOutput && (
            <div className="border-b border-border p-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Output mong đợi</p>
              <pre className="max-h-24 overflow-auto rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 font-mono text-xs text-amber-900 dark:text-amber-300">{sampleOutput}</pre>
            </div>
          )}

          <div className="flex-1 overflow-auto p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Kết quả</p>
              {runResult && <StatusPill status={runResult.status} />}
            </div>

            {!runResult && (
              <div className="rounded-md border border-dashed border-border bg-card/70 p-3 text-xs text-muted-foreground">
                Chạy code để xem stdout/stderr. Bấm <span className="font-semibold text-foreground">Nộp bài</span> để hệ thống chấm với toàn bộ test.
              </div>
            )}

            {runResult && (
              <div className="space-y-3">
                {runResult.status === "compile_error" ? (
                  <div className="rounded-lg border border-border bg-blue-50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <XCircle className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-semibold text-blue-800">Lỗi biên dịch (compile error)</span>
                    </div>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground dark:bg-card">
                      {runResult.output}
                    </pre>
                    <p className="text-xs text-blue-500 mt-2">💡 Kiểm tra cú pháp C++: thiếu dấu `;`, sai tên biến, hoặc chưa khai báo thư viện.</p>
                  </div>
                ) : (
                  <>
                    {samplePassed !== null && (
                      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${samplePassed ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "border-red-200 bg-red-50 text-red-700"}`}>
                        {samplePassed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        {samplePassed ? "Khớp sample output" : "Chưa khớp sample output"}
                      </div>
                    )}
                    <pre className={`max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border px-3 py-2 font-mono text-xs ${runResult.status === "success" ? "border-slate-700 bg-slate-950 text-green-300" : "border-red-200 bg-red-50 text-red-800"}`}>
                      {runResult.output}
                    </pre>
                    <p className="text-xs text-muted-foreground dark:text-muted-foreground">Thời gian chạy: {runResult.durationMs}ms</p>
                  </>
                )}
              </div>
            )}
          </div>

          {onNoteChange && (
            <div className="border-t border-border p-4 dark:border-border">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">Ghi chú</label>
              <textarea
                value={note || ""}
                onChange={(event) => onNoteChange(event.target.value)}
                rows={3}
                placeholder="Ghi chú cho giáo viên hoặc cho lần nộp này..."
                className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-border"
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
