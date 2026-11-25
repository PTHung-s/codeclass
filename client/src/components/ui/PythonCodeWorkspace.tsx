import { useState } from "react";
import Editor from "@monaco-editor/react";
import { CheckCircle2, Code2, Loader2, Play, RotateCcw, Send, Terminal, XCircle } from "lucide-react";
import { CodeRunResult, runCode, SupportedLanguage, CPP_STARTER } from "../../lib/codeRunner";

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
}

function normalizeText(value: string) {
  return value.trim().replace(/\r\n/g, "\n");
}

function StatusPill({ status }: { status: CodeRunResult["status"] }) {
  const map: Record<string, string> = {
    success: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    runtime_error: "bg-red-100 text-red-700 border-red-200",
    time_limit: "bg-amber-100 text-amber-700 border-amber-200",
    blocked: "bg-orange-100 text-orange-700 border-orange-200",
    compile_error: "bg-blue-100 text-blue-700 border-border",
  };

  const label: Record<string, string> = {
    success: "Chạy xong",
    runtime_error: "Lỗi chạy code",
    time_limit: "Quá thời gian",
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
}: PythonCodeWorkspaceProps) {
  const [internalLanguage, setInternalLanguage] = useState<SupportedLanguage>("python");
  const language = controlledLanguage ?? internalLanguage;
  const setLanguage = onLanguageChange ?? setInternalLanguage;

  const [stdin, setStdin] = useState(sampleInput || "");
  const [runResult, setRunResult] = useState<CodeRunResult | null>(null);
  const [running, setRunning] = useState(false);

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
  };

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
    <div className="overflow-hidden rounded-lg border border-border bg-card dark:border-border dark:bg-card">
      <div className="flex flex-col gap-2 border-b border-border bg-muted/50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between dark:border-border dark:bg-muted/40">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-emerald-300">
            <Terminal className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground dark:text-foreground">Code workspace</h3>
            <p className="text-xs text-muted-foreground dark:text-muted-foreground">{autosaveLabel} · Ctrl+Enter để chạy</p>
          </div>
          {/* Language selector */}
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5 dark:border-border dark:bg-card">
            <button
              type="button"
              onClick={() => handleLanguageSwitch("python")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                language === "python" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-1">
                <Code2 className="w-3 h-3" /> Python
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleLanguageSwitch("cpp")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                language === "cpp" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              C++
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleRun()}
            disabled={!canRun || running}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Chạy
          </button>
          {starterCode && (
            <button
              type="button"
              onClick={resetStarter}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted dark:border-border dark:bg-card dark:text-muted-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
          {showSubmit && (
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting || !canRun}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {submitLabel}
            </button>
          )}
        </div>
      </div>

      <div className="grid min-h-[520px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 border-b border-border lg:border-b-0 lg:border-r dark:border-border">
          <Editor
            height={typeof height === "number" ? `${height}px` : height}
            language={language === "cpp" ? "cpp" : "python"}
            value={code}
            onChange={(value) => onCodeChange(value || "")}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineHeight: 22,
              tabSize: 4,
              insertSpaces: true,
              detectIndentation: false,
              padding: { top: 16, bottom: 16 },
              scrollBeyondLastLine: false,
              wordWrap: "on",
            }}
            onMount={(editor, monaco) => {
              // Ensure Tab always inserts spaces (never jumps to other elements)
              editor.updateOptions({ tabFocusMode: false });
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                void handleRun();
              });
            }}
          />
        </div>

        <aside className="flex min-h-[420px] flex-col bg-muted/50 dark:bg-card">
          <div className="border-b border-border p-4 dark:border-border">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">Input</label>
              {sampleInput && (
                <button
                  type="button"
                  onClick={() => setStdin(sampleInput)}
                  className="text-xs font-semibold text-primary hover:text-primary"
                >
                  Dùng sample
                </button>
              )}
            </div>
            <textarea
              value={stdin}
              onChange={(event) => setStdin(event.target.value)}
              placeholder="Nhập input để chạy thử..."
              spellCheck={false}
              className="h-28 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-border dark:bg-card"
            />
          </div>

          {sampleOutput && (
            <div className="border-b border-border p-4 dark:border-border">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">Output mong đợi</p>
              <pre className="max-h-24 overflow-auto rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{sampleOutput}</pre>
            </div>
          )}

          <div className="flex-1 overflow-auto p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">Kết quả</p>
              {runResult && <StatusPill status={runResult.status} />}
            </div>

            {!runResult && (
              <div className="rounded-lg border border-dashed border-border bg-card p-4 text-sm text-muted-foreground dark:border-border dark:bg-card dark:text-muted-foreground">
                Chạy code để xem stdout/stderr. Bấm <span className="font-semibold">Nộp bài</span> để hệ thống chấm với toàn bộ test.
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
