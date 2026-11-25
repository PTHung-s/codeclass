import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { Play, Loader2, CheckCircle2, XCircle, Terminal } from "lucide-react";
import { runCode as executeCode, type SupportedLanguage } from "../../lib/codeRunner";
import { openInCodeLab } from "../../lib/codeLabBridge";
import { useDarkMode } from "../../hooks/useDarkMode";
import api from "../../lib/api";
import { reportRecordingRun } from "../../hooks/useSessionRecorder";

/**
 * Identifies an in-lesson challenge so each Run can be recorded for teachers.
 * `challengeKey` should match the widget's `saveKey` — it is already stable
 * per lesson + block.
 */
export interface ChallengeRecordTarget {
  lessonId: string;
  challengeKey: string;
  title?: string;
}

interface PythonRunnerProps {
  initialCode?: string;
  expectedOutput?: string;
  stdin?: string;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  saveKey?: string;
  onResult?: (passed: boolean) => void;
  /** Fill the parent's height: editor on top, output docked below with a draggable divider. */
  fill?: boolean;
  /** Extra controls rendered in the header (left of the Run button). */
  headerExtra?: React.ReactNode;
  /** Label shown in the header instead of the default. */
  title?: string;
  /** 1-indexed line numbers to highlight with a yellow background stripe. */
  highlightLines?: number[];
  /** When true, hide the output dock until the user clicks Run at least once. */
  revealAfterRun?: boolean;
  /** Programming language hint — python or cpp. */
  language?: string;
  /**
   * When set, every Run is reported to the server so teachers can see what the
   * student wrote. Fire-and-forget: failures never surface to the student.
   */
  recordAs?: ChallengeRecordTarget;
}

export default function PythonRunner({
  initialCode = "",
  expectedOutput,
  stdin = "",
  readOnly = false,
  placeholder = "Viết code Python ở đây...",
  className = "",
  saveKey,
  onResult,
  fill = false,
  headerExtra,
  title,
  highlightLines = [],
  revealAfterRun = false,
  language,
  recordAs,
}: PythonRunnerProps) {
  // Auto-save: restore saved code from localStorage, or use initialCode
  const getSavedKey = () => (saveKey ? `lesson_code_${saveKey}` : null);

  const [code, setCode] = useState(() => {
    const key = getSavedKey();
    if (key) {
      const saved = localStorage.getItem(key);
      if (saved) return saved;
    }
    return initialCode;
  });
  const [userInput, setUserInput] = useState(stdin || "");
  const [showInput, setShowInput] = useState(false);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<"pass" | "fail" | null>(null);
  const [editorPct, setEditorPct] = useState(58);
  const [hasRun, setHasRun] = useState(false);
  const { dark } = useDarkMode();
  const navigate = useNavigate();

  // Auto-save code to localStorage on change (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const rootRef = useRef<HTMLDivElement>(null);

  // Detect C++ from explicit language prop or code heuristics
  const isCpp = language === "cpp" || language === "c++" || language === "c"
    || /^\s*#include\s*<.*>/m.test(code || initialCode)
    || /\bcout\s*<</m.test(code || initialCode)
    || /\bstd::/m.test(code || initialCode)
    || /\bint\s+main\s*\(/m.test(code || initialCode);

  const runLanguage: SupportedLanguage = isCpp ? "cpp" : "python";
  const monacoLanguage = isCpp ? "cpp" : "python";

  // Destructured so runCode depends on stable primitives — callers pass
  // `recordAs` as an inline object literal, which changes identity every render.
  const recordLessonId = recordAs?.lessonId;
  const recordChallengeKey = recordAs?.challengeKey;
  const recordTitle = recordAs?.title;

  const codeNeedsInput = useCallback((src: string, lang: SupportedLanguage) => {
    if (lang === "python") return /\binput\s*\(/.test(src);
    return /\b(cin\s*>>|getline\s*\(|scanf\s*\()/.test(src);
  }, []);

  // Keep stdin panel in sync with language/code
  useEffect(() => {
    const needs = Boolean(stdin?.trim()) || codeNeedsInput(code || initialCode, runLanguage);
    setShowInput(needs);
  }, [code, initialCode, runLanguage, stdin, codeNeedsInput]);

  const handleCodeChange = useCallback((value: string | undefined) => {
    const v = value || "";
    setCode(v);
    setResult(null);
    if (codeNeedsInput(v, runLanguage) && !showInput) setShowInput(true);
    if (saveKey) {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        localStorage.setItem(`lesson_code_${saveKey}`, v);
      }, 500);
    }
  }, [saveKey, showInput, runLanguage, codeNeedsInput]);

  const runCode = useCallback(async () => {
    if (!code.trim()) return;
    setRunning(true);
    setResult(null);
    setOutput("");
    if (revealAfterRun) setHasRun(true);

    const effectiveStdin = showInput ? userInput : (stdin || "");
    const res = await executeCode(runLanguage, code.trim(), effectiveStdin);
    const combined = [res.stdout, res.stderr].filter(Boolean).join(res.stdout && res.stderr ? "\n" : "") || res.output;
    setOutput(combined || "(không có output)");

    let graded: boolean | null = null;
    if (expectedOutput !== undefined) {
      const ok = res.status === "success" && res.stdout.trim() === expectedOutput.trim();
      graded = ok;
      setResult(ok ? "pass" : "fail");
      onResult?.(ok);
    }

    // Record for the teacher tracking tab. `graded` stays null when the
    // challenge has no expectedOutput (all C++/Python code_runner blocks) —
    // we still want the code and the run count in that case.
    if (recordLessonId && recordChallengeKey) {
      api
        .post("/challenge-attempts", {
          lessonId: recordLessonId,
          challengeKey: recordChallengeKey,
          title: recordTitle,
          language: runLanguage,
          code: code.trim(),
          passed: graded,
        })
        .catch(() => {});
    }

    // Put the Run on the teacher's session timeline. No-op unless a recording
    // is active — the server ignores events from non-participants.
    reportRecordingRun(title || recordTitle, graded);

    setRunning(false);
  }, [
    code,
    expectedOutput,
    stdin,
    onResult,
    showInput,
    userInput,
    revealAfterRun,
    runLanguage,
    recordLessonId,
    recordChallengeKey,
    recordTitle,
  ]);

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => clearTimeout(saveTimer.current);
  }, []);

  // Drag the divider between editor and output (fill mode only)
  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const root = rootRef.current;
    if (!root) return;
    const onMove = (ev: MouseEvent) => {
      const rect = root.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setEditorPct(Math.min(85, Math.max(20, pct)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const hasChallenge = expectedOutput !== undefined;
  const isErr = /(error|traceback|syntaxerror|nameerror|typeerror|compile_error|undefined reference|time limit|không tìm thấy|không được phép)/i.test(output);
  const showDock = !(revealAfterRun && !hasRun);
  const hasDock = showDock && (showInput || !!stdin.trim() || !!output);

  const editorNode = (
    <Editor
      height={fill ? "100%" : "160px"}
      defaultLanguage={monacoLanguage}
      language={monacoLanguage}
      value={code}
      onChange={handleCodeChange}
      theme={dark ? "vs-dark" : "vs"}
      options={{
        readOnly,
        automaticLayout: fill,
        minimap: { enabled: false },
        fontSize: 13,
        lineHeight: 20,
        tabSize: 4,
        insertSpaces: true,
        scrollBeyondLastLine: false,
        wordWrap: "on",
        padding: { top: 12, bottom: 12 },
        lineNumbers: "on",
        lineNumbersMinChars: 2,
        renderLineHighlight: "line",
        folding: false,
        glyphMargin: false,
      }}
      loading={
        <div className="flex h-full min-h-[160px] items-center justify-center bg-[#0f172a] text-sm text-muted-foreground dark:text-muted-foreground">
          Loading editor...
        </div>
      }
      onMount={(editor, monaco) => {
        editor.updateOptions({ tabFocusMode: false });
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
          runCode();
        });
        // Highlight specific lines with a yellow stripe
        if (highlightLines.length > 0) {
          const decorations = highlightLines.map((line) => ({
            range: new monaco.Range(line, 1, line, 1),
            options: {
              isWholeLine: true,
              className: "highlight-line-yellow",
              glyphMarginClassName: "highlight-glyph-yellow",
            },
          }));
          editor.createDecorationsCollection(decorations);
        }
      }}
    />
  );

  const dockNode = (
    <>
      {showInput && (
        <div className="border-t border-border bg-muted/50 px-4 py-3 dark:border-border dark:bg-background/30">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {isCpp ? "Nhập liệu (stdin)" : "Nhập liệu cho input()"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {isCpp ? "mỗi dòng = 1 lần cin/getline" : "mỗi dòng = 1 lần input()"}
            </span>
          </div>
          <textarea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder={stdin || "Nhập dữ liệu ở đây..."}
            rows={Math.max(2, (userInput || stdin || "").split("\n").length)}
            className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 dark:border-border dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground"
          />
        </div>
      )}

      {!showInput && stdin.trim() && (
        <div className="border-t border-border bg-muted/50 px-4 py-3 dark:border-border dark:bg-background/30">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Input mẫu</div>
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-card px-3 py-2 font-mono text-xs leading-5 text-foreground ring-1 ring-border dark:bg-card dark:text-muted-foreground dark:ring-border">{stdin}</pre>
        </div>
      )}

      {output && (
        <div className={`border-t-2 ${result === "pass" ? "border-green-400" : result === "fail" || isErr ? "border-red-400" : "border-primary"}`}>
          <div className={`flex items-center justify-between px-4 py-2 ${result === "pass" ? "bg-green-50" : result === "fail" || isErr ? "bg-red-50" : "bg-muted/50"}`}>
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${result === "pass" ? "text-emerald-700 dark:text-emerald-400" : result === "fail" || isErr ? "text-red-700" : "text-muted-foreground"}`}>Output</span>
            {result === "pass" && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> PASS</span>}
            {result === "fail" && <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700"><XCircle className="h-3 w-3" /> FAIL</span>}
          </div>
          <pre className={`whitespace-pre-wrap break-words px-5 py-4 font-mono text-sm leading-relaxed ${fill ? "" : "max-h-56 overflow-y-auto"} ${result === "pass" ? "bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200" : result === "fail" || isErr ? "bg-red-50/40 text-red-900 dark:bg-red-950/20 dark:text-red-200" : "bg-muted/40 text-foreground"}`}>{output}</pre>
        </div>
      )}

      {hasChallenge && result === "fail" && (
        <div className="border-t-2 border-amber-300 bg-amber-50 px-5 py-3 text-xs text-amber-800">
          Output mong đợi: <code className="ml-1 rounded border border-amber-200 bg-card px-2 py-1 font-mono text-xs text-amber-900 dark:bg-card">{expectedOutput}</code>
        </div>
      )}
    </>
  );

  const defaultTitle = isCpp
    ? (hasChallenge ? "C++ - Check" : "C++ Runner")
    : (hasChallenge ? "Python - Check" : "Python Runner");

  const headerNode = (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2.5 dark:border-border dark:bg-muted/40">
      <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
        {title || defaultTitle}
        {readOnly && <span className="ml-2 font-medium normal-case tracking-normal text-muted-foreground">(mẫu)</span>}
      </span>
      <div className="flex items-center gap-2">
        {headerExtra}
        {result === "pass" && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Chính xác</span>}
        {result === "fail" && <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500"><XCircle className="h-3.5 w-3.5" /> Chưa đúng</span>}
        <span className="hidden text-[10px] text-muted-foreground sm:inline dark:text-muted-foreground">Ctrl+Enter</span>
        <button
          type="button"
          onClick={() =>
            openInCodeLab(navigate, {
              code,
              language: runLanguage,
              fileName: `vi_du.${runLanguage === "cpp" ? "cpp" : "py"}`,
              inputText: userInput,
              sourceLabel: title || "Bài học",
            })
          }
          title="Mở code này trong Code Lab"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Terminal className="h-3.5 w-3.5 text-primary" />
          <span className="hidden sm:inline">Code Lab</span>
        </button>
        <button
          onClick={runCode}
          disabled={running || !code.trim()}
          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${hasChallenge ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-primary text-white hover:bg-primary"} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {running ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang chạy</>
          ) : hasChallenge ? (
            <><CheckCircle2 className="h-3.5 w-3.5" /> Check</>
          ) : (
            <><Play className="h-3.5 w-3.5" /> Run</>
          )}
        </button>
      </div>
    </div>
  );

  if (fill) {
    return (
      <div ref={rootRef} className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm dark:border-border dark:bg-card ${className}`}>
        {headerNode}
        <div
          className={hasDock ? "min-h-0 shrink-0" : "min-h-0 flex-1"}
          style={hasDock ? { height: `${editorPct}%` } : undefined}
        >
          {editorNode}
        </div>
        {hasDock && (
          <div
            onMouseDown={startDrag}
            role="separator"
            aria-orientation="horizontal"
            title="Kéo để chỉnh chiều cao"
            className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center bg-muted transition-colors hover:bg-primary/30 dark:bg-muted dark:hover:bg-primary"
          >
            <span className="h-0.5 w-8 rounded-full bg-muted-foreground/30 group-hover:bg-card dark:bg-muted" />
          </div>
        )}
        {hasDock && <div className="min-h-0 flex-1 overflow-y-auto">{dockNode}</div>}
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-card shadow-sm ${className} dark:border-border dark:bg-card`}>
      {headerNode}
      <div className="border-b border-border dark:border-border">{editorNode}</div>
      {dockNode}
    </div>
  );
}
