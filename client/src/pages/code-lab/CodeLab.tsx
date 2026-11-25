import { useCallback, useEffect, useRef, useState } from"react";
import Editor, { OnMount } from"@monaco-editor/react";
import {
 ChevronDown,
 ChevronUp,
 Copy,
 Download,
 FileCode2,
 FolderOpen,
 Loader2,
 Play,
 RotateCcw,
 Square,
 Terminal as TerminalIcon,
 Trash2,
} from"lucide-react";
import { useDarkMode } from "../../hooks/useDarkMode";
import {
  CPP_STARTER,
  runCode,
  type CodeRunResult,
  type SupportedLanguage,
} from "../../lib/codeRunner";
import { type TerminalExit, useInteractiveTerminal } from "../../hooks/useInteractiveTerminal";
import { useConfirmContext } from "../../hooks/useConfirm";

type TerminalSegment = {
 id: string;
 kind:"cmd" |"stdout" |"stderr" |"meta" |"stdin" |"system";
 text: string;
};

const PYTHON_STARTER = `# Code Lab — Python
# Bấm Chạy, sau đó nhập trực tiếp trong terminal khi chương trình hỏi.

name = input("Tên em:")
print("Xin chào,", name)
`;

const STORAGE_LANG ="codelab.language";
const STORAGE_CODE = (lang: SupportedLanguage) => `codelab.code.${lang}`;
const STORAGE_TERM_H ="codelab.terminalHeight";

function fileNameFor(lang: SupportedLanguage) {
 return lang ==="cpp" ?"main.cpp" :"main.py";
}

function runCommandFor(lang: SupportedLanguage) {
 return lang ==="cpp" ?"g++ main.cpp -o main && ./main" :"python main.py";
}

function statusLabel(result: TerminalExit | null, phase:"idle" |"starting" |"running" |"stopping"): { text: string; cls: string } {
 if (phase === "starting") return { text: "Đang khởi tạo…", cls: "text-amber-600" };
 if (phase === "running") return { text: "Đang chạy…", cls: "text-emerald-600" };
 if (phase === "stopping") return { text: "Đang dừng…", cls: "text-muted-foreground" };
 if (!result) return { text: "Sẵn sàng", cls: "text-muted-foreground" };
 if (result.status === "success") return { text: `Xong · ${result.durationMs}ms`, cls: "text-emerald-600" };
 if (result.status === "compile_error") return { text: "Lỗi biên dịch", cls: "text-red-600" };
 if (result.status === "time_limit") return { text: "Quá thời gian", cls: "text-amber-600" };
 if (result.status === "blocked") return { text: "Bị chặn", cls: "text-red-600" };
 if (result.status === "stopped") return { text: "Đã dừng", cls: "text-muted-foreground" };
 return { text: "Lỗi runtime", cls: "text-red-600" };
}

let lineId = 0;
function nextId() {
 lineId += 1;
 return `l${lineId}`;
}

export default function CodeLab() {
 const confirm = useConfirmContext();
 const { dark } = useDarkMode();
 const [language, setLanguage] = useState<SupportedLanguage>(() => {
 const saved = localStorage.getItem(STORAGE_LANG);
 return saved ==="cpp" ?"cpp" :"python";
 });
 const [code, setCode] = useState(() => {
 const lang = (localStorage.getItem(STORAGE_LANG) ==="cpp" ?"cpp" :"python") as SupportedLanguage;
 return localStorage.getItem(STORAGE_CODE(lang)) || (lang ==="cpp" ? CPP_STARTER : PYTHON_STARTER);
 });
 const [dirty, setDirty] = useState(false);
 const [result, setResult] = useState<TerminalExit | null>(null);
 const [fileInput, setFileInput] = useState("");
 const [fileOutput, setFileOutput] = useState("");
 const [fileRunResult, setFileRunResult] = useState<CodeRunResult | null>(null);
 const [runFileBusy, setRunFileBusy] = useState(false);
 const [lines, setLines] = useState<TerminalSegment[]>([
 { id: nextId(), kind:"system", text:"Code Lab sẵn sàng. Bấm Chạy để mở terminal interactive." },
 ]);
 const [prompt, setPrompt] = useState("");
 const [terminalH, setTerminalH] = useState(() => {
 const n = Number(localStorage.getItem(STORAGE_TERM_H));
 return Number.isFinite(n) && n >= 140 && n <= 480 ? n : 220;
 });
 const [menuOpen, setMenuOpen] = useState(false);
 const [terminalCollapsed, setTerminalCollapsed] = useState(false);

 const termEndRef = useRef<HTMLDivElement>(null);
 const promptRef = useRef<HTMLInputElement>(null);
 const dragRef = useRef<{ startY: number; startH: number } | null>(null);

 const fileName = fileNameFor(language);

 const appendLines = useCallback((items: Omit<TerminalSegment,"id">[]) => {
 setLines((prev) => [...prev, ...items.map((item) => ({ ...item, id: nextId() }))]);
 }, []);

 const appendStream = useCallback((stream:"stdout" |"stderr", data: string) => {
 const kind = stream ==="stderr" ?"stderr" :"stdout";
 const normalized = data.replace(/\r\n/g,"\n");
 if (!normalized) return;
 // Merge program output into a live transcript: text without a trailing
 // newline stays on the same line so the next input echoes right after the
 // prompt (e.g."Tên em:" then the typed name), like a real terminal.
 setLines((prev) => {
 const next = [...prev];
 const chunks = normalized.split("\n");
 chunks.forEach((text, index) => {
 const chunk = text + (index < chunks.length - 1 ?"\n" :"");
 if (!chunk && index === chunks.length - 1) return;
 const last = next[next.length - 1];
 if (index === 0 && last && last.kind === kind) {
 next[next.length - 1] = { ...last, text: last.text + chunk };
 } else {
 next.push({ id: nextId(), kind, text: chunk });
 }
 });
 return next;
 });
 }, []);

 const handleExit = useCallback((exit: TerminalExit) => {
 setResult(exit);
 const exitCode = exit.exitCode ?? (exit.status ==="success" ? 0 : 1);
 appendLines([
 {
 kind:"meta",
 text: `[exit ${exitCode} · ${exit.durationMs}ms${exit.timedOut ?" · timeout" :""} · ${exit.status}]`,
 },
 ]);
 requestAnimationFrame(() => promptRef.current?.focus());
 }, [appendLines]);

 const handleError = useCallback((message: string) => {
 appendLines([{ kind:"stderr", text: message }]);
 setResult(null);
 requestAnimationFrame(() => promptRef.current?.focus());
 }, [appendLines]);

 const terminal = useInteractiveTerminal({
 onOutput: appendStream,
 onExit: handleExit,
 onError: handleError,
 });

 const busy = terminal.phase !=="idle";
 const status = statusLabel(result, terminal.phase);

 useEffect(() => {
 localStorage.setItem(STORAGE_LANG, language);
 }, [language]);

 useEffect(() => {
 localStorage.setItem(STORAGE_CODE(language), code);
 }, [code, language]);

 useEffect(() => {
 localStorage.setItem(STORAGE_TERM_H, String(terminalH));
 }, [terminalH]);

 useEffect(() => {
 termEndRef.current?.scrollIntoView({ behavior:"smooth", block:"end" });
 }, [lines, prompt, terminal.phase]);

 const switchLanguage = (next: SupportedLanguage) => {
 if (next === language || busy) return;
 localStorage.setItem(STORAGE_CODE(language), code);
 const saved = localStorage.getItem(STORAGE_CODE(next));
 setLanguage(next);
 setCode(saved || (next ==="cpp" ? CPP_STARTER : PYTHON_STARTER));
 setDirty(false);
 setResult(null);
 appendLines([
 { kind:"system", text: `Đã chuyển sang ${next ==="cpp" ?"C++" :"Python"} · file ${fileNameFor(next)}` },
 ]);
 };

 const clearTerminal = () => {
 if (busy) {
 appendLines([{ kind:"meta", text:"Không thể xóa terminal khi chương trình đang chạy." }]);
 return;
 }
 setLines([{ id: nextId(), kind:"system", text:"Terminal đã xóa." }]);
 setPrompt("");
 setResult(null);
 };

 const resetCode = async () => {
	 if (busy) return;
	 const ok = await confirm({
	   title: "Reset code",
	   message: "Reset code về template mặc định?",
	   confirmLabel: "Reset",
	   variant: "danger",
	 });
	 if (!ok) return;
 const starter = language ==="cpp" ? CPP_STARTER : PYTHON_STARTER;
 setCode(starter);
 setDirty(false);
 setResult(null);
 appendLines([{ kind:"system", text:"Đã reset code về template." }]);
 };

 const copyCode = async () => {
 try {
 await navigator.clipboard.writeText(code);
 appendLines([{ kind:"system", text:"Đã copy code vào clipboard." }]);
 } catch {
 appendLines([{ kind:"stderr", text:"Không copy được clipboard." }]);
 }
 setMenuOpen(false);
 };

 const downloadCode = () => {
 const blob = new Blob([code], { type:"text/plain;charset=utf-8" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = fileName;
 a.click();
 URL.revokeObjectURL(url);
 setMenuOpen(false);
 };

 const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
 if (e.key ==="Enter") {
 e.preventDefault();
 const value = prompt;
 appendLines([{ kind:"stdin", text: value }]);
 setPrompt("");
 if (busy) {
 const sent = terminal.write(`${value}\n`);
 if (!sent) appendLines([{ kind:"stderr", text:"Không gửi được input. Phiên terminal có thể đã kết thúc." }]);
 } else {
 appendLines([{ kind:"meta", text:"Bấm Chạy trước, rồi nhập khi chương trình hỏi." }]);
 }
 return;
 }
 if (e.key ==="l" && (e.ctrlKey || e.metaKey)) {
 e.preventDefault();
 clearTerminal();
 }
 };

 const run = useCallback(() => {
 if (busy) return;
 setResult(null);
 const cmd = runCommandFor(language);
 appendLines([{ kind:"cmd", text: `$ ${cmd}` }]);
 const started = terminal.start(language, code);
 if (!started) {
 appendLines([{ kind:"stderr", text:"Không khởi chạy được terminal interactive." }]);
 }
 }, [appendLines, busy, code, language, terminal]);

 const stop = () => {
 if (!busy) return;
 const stopped = terminal.stop();
 if (!stopped) {
 appendLines([{ kind:"stderr", text:"Không gửi được lệnh dừng." }]);
 } else {
 appendLines([{ kind:"meta", text:"Đang dừng chương trình…" }]);
 }
 };

 // Nhập/xuất FILE: chạy code với input.txt → kết quả ghi vào output.txt
 // (khác nút Chạy interactive — dùng /run API để đọc toàn bộ stdin).
 const runWithFile = async () => {
 if (runFileBusy) return;
 setRunFileBusy(true);
 setFileRunResult(null);
 try {
 const res = await runCode(language, code, fileInput);
 setFileRunResult(res);
 setFileOutput(
 res.status ==="success"
 ? res.stdout ||"(không có output)"
 : `${res.status}:\n${res.stderr || res.output ||"Lỗi không rõ"}`,
 );
 } finally {
 setRunFileBusy(false);
 }
 };

 const formatDuration = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`);

 // Ctrl+Enter to run
 useEffect(() => {
 const onKey = (e: KeyboardEvent) => {
 if ((e.ctrlKey || e.metaKey) && e.key ==="Enter") {
 e.preventDefault();
 run();
 }
 };
 window.addEventListener("keydown", onKey);
 return () => window.removeEventListener("keydown", onKey);
 }, [run]);

 const onEditorMount: OnMount = (editor, monaco) => {
 editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
 run();
 });
 };

 const onResizeStart = (e: React.MouseEvent) => {
 e.preventDefault();
 dragRef.current = { startY: e.clientY, startH: terminalH };
 const onMove = (ev: MouseEvent) => {
 if (!dragRef.current) return;
 const delta = dragRef.current.startY - ev.clientY;
 const next = Math.min(480, Math.max(140, dragRef.current.startH + delta));
 setTerminalH(next);
 setTerminalCollapsed(false);
 };
 const onUp = () => {
 dragRef.current = null;
 window.removeEventListener("mousemove", onMove);
 window.removeEventListener("mouseup", onUp);
 };
 window.addEventListener("mousemove", onMove);
 window.addEventListener("mouseup", onUp);
 };

 const monacoLang = language ==="cpp" ?"cpp" :"python";
 const effectiveTermH = terminalCollapsed ? 40 : terminalH;
 const lineCount = Math.max(1, code.split("\n").length);
 const characterCount = code.length;

 return (
 <div className="-m-4 md:-m-6 flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-[#101827]">
 {/* Top bar */}
 <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#172236] px-3 py-2 sm:px-4">
 <div className="flex min-w-0 items-center gap-2">
 <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
 <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
 <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
 <span className="ml-1 truncate font-mono text-xs text-white/75">{fileName}{dirty &&" ·"}</span>
 </div>

 <div className="flex items-center gap-2">
 <div className="flex rounded-lg border border-border bg-background p-0.5">
 <button
 type="button"
 onClick={() => switchLanguage("python")}
 className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
 language ==="python"
 ?"bg-primary text-white shadow-sm"
 :"text-muted-foreground hover:text-foreground"
 }`}
 >
 Python
 </button>
 <button
 type="button"
 onClick={() => switchLanguage("cpp")}
 className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
 language ==="cpp"
 ?"bg-primary text-white shadow-sm"
 :"text-muted-foreground hover:text-foreground"
 }`}
 >
 C++
 </button>
 </div>

 {busy ? (
 <button
 type="button"
 onClick={stop}
 disabled={terminal.phase ==="starting" || terminal.phase ==="stopping"}
 className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
 title={terminal.phase ==="starting" ?"Đợi chương trình khởi tạo xong để dừng" :"Dừng chương trình"}
 >
 <Square className="h-3 w-3" /> Dừng
 </button>
 ) : (
 <button
 type="button"
 onClick={run}
 disabled={!terminal.connected}
 className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
 title={terminal.connected ?"Chạy chương trình (Ctrl+Enter)" :"Đang kết nối terminal"}
 >
 <Play className="h-3 w-3" /> Chạy
 </button>
 )}

 <div className="relative">
 <button
 type="button"
 onClick={() => setMenuOpen((v) => !v)}
 className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground text-sm"
 aria-label="Menu"
 >
 ···
 </button>
 {menuOpen && (
 <>
 <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
 <div className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg">
 <button type="button" onClick={clearTerminal} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted">
 <Trash2 className="h-3.5 w-3.5" /> Clear terminal
 </button>
 <button type="button" onClick={resetCode} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted">
 <RotateCcw className="h-3.5 w-3.5" /> Reset code
 </button>
 <button type="button" onClick={() => void copyCode()} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted">
 <Copy className="h-3.5 w-3.5" /> Copy code
 </button>
 <button type="button" onClick={downloadCode} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted">
 <Download className="h-3.5 w-3.5" /> Download
 </button>
 </div>
 </>
 )}
 </div>
 </div>
 </div>

 {/* Main workspace */}
 <div className="flex min-h-0 flex-1">
 {/* Explorer */}
 <aside className="flex w-64 shrink-0 flex-col border-r border-white/10 bg-[#101827]">
 <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
 <FolderOpen className="h-3.5 w-3.5" /> I/O Files
 </div>
 <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-2">
 {/* input.txt */}
 <div>
 <div className="mb-1 flex items-center justify-between">
 <span className="truncate font-mono text-[11px] font-semibold">input.txt</span>
 <button
 type="button"
 onClick={() => setFileInput("")}
 disabled={runFileBusy}
 className="text-[10px] text-muted-foreground disabled:opacity-50"
 >
 Xóa
 </button>
 </div>
 <textarea
 value={fileInput}
 onChange={(e) => setFileInput(e.target.value)}
 spellCheck={false}
 placeholder="Dữ liệu vào (mỗi test / mỗi dòng)…"
 className="w-full resize-y rounded-md border border-white/10 bg-black/40 p-2 font-mono text-[11px] leading-relaxed outline-none placeholder: focus:border-primary/60"
 rows={6}
 />
 </div>

 {/* Run button */}
 <button
 type="button"
 onClick={runWithFile}
 disabled={runFileBusy || busy}
 className="inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
 >
 {runFileBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
 Chạy với file input
 </button>

 {/* output.txt */}
 <div>
 <div className="mb-1 flex items-center justify-between">
 <span className="truncate font-mono text-[11px] font-semibold">output.txt</span>
 {fileRunResult && (
 <span className={`font-mono text-[10px] ${fileRunResult.status ==="success" ?"" :""}`}>
 {fileRunResult.status} · {formatDuration(fileRunResult.durationMs)}
 </span>
 )}
 </div>
 <textarea
 value={fileOutput}
 readOnly
 spellCheck={false}
 placeholder="Kết quả sẽ hiện tại đây…"
 className="w-full resize-y rounded-md border border-white/10 bg-black/60 p-2 font-mono text-[11px] leading-relaxed outline-none placeholder:"
 rows={7}
 />
 </div>

 {/* Example note */}
 <div className="rounded-md border border-white/5 bg-card/5 p-2 text-[10px] leading-relaxed text-muted-foreground">
 <b className="">Chạy với file input</b> nạp ô trên làm stdin
 {language ==="cpp" ?" (cin)" :" (input())"} và cũng ghi ra file{""}
 <span className="font-mono">input.txt</span> trong sandbox.
 Nếu code ghi <span className="font-mono">output.txt</span> thì ô dưới hiện nội dung file đó;
 không thì hiện stdout. Khác nút <b className="">Chạy</b> (terminal gõ tương tác).
 </div>
 </div>
 </aside>

 {/* Editor + terminal column */}
 <div className="flex min-w-0 flex-1 flex-col">
 {/* Editor header */}
 <div className="hidden">
 <div className="flex items-center gap-2 font-medium text-foreground">
 <FileCode2 className="h-3.5 w-3.5" />
 {fileName}
 {dirty && <span className="text-[10px] text-muted-foreground">•</span>}
 </div>
 <div className="tabular-nums">
 {language ==="cpp" ?"C++ · g++" :"Python · UTF-8"}
 </div>
 </div>

 {/* Monaco */}
 <div className="min-h-0 flex-1 bg-[#1e1e1e]">
 <Editor
 height="100%"
 language={monacoLang}
 theme={dark ?"vs-dark" :"vs-dark"}
 value={code}
 onMount={onEditorMount}
 onChange={(v) => {
 setCode(v ||"");
 setDirty(true);
 setResult(null);
 }}
 options={{
 fontSize: 14,
 fontFamily:"JetBrains Mono, Consolas, monospace",
 minimap: { enabled: false },
 scrollBeyondLastLine: false,
 wordWrap:"on",
 automaticLayout: true,
 tabSize: 4,
 renderLineHighlight:"line",
 padding: { top: 12 },
 smoothScrolling: true,
 }}
 />
 </div>

 <div className="flex h-9 shrink-0 items-center gap-3 border-t border-white/10 bg-[#172236] px-4 font-mono text-[11px] text-white/65">
 <span>{language ==="cpp" ?"C++ · g++" :"Python 3"}</span>
 <span className={`ml-auto ${status.cls}`}>{status.text}</span>
 <span>{lineCount} dòng</span>
 <span>{characterCount} ký tự</span>
 </div>

 {/* Resize handle */}
 <div
 onMouseDown={onResizeStart}
 className="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center bg-border/60 hover:bg-primary/100"
 title="Kéo để đổi chiều cao terminal"
 >
 <div className="h-0.5 w-10 rounded bg-muted-foreground/40" />
 </div>

 {/* Terminal */}
 <div className="flex shrink-0 flex-col border-t border-border bg-[#0b0f14]" style={{ height: effectiveTermH }}>
 <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
 <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
 <TerminalIcon className="h-3.5 w-3.5" />
 Terminal
 {busy && <Loader2 className="h-3 w-3 animate-spin" />}
 </div>
 <div className="flex items-center gap-1">
 <button
 type="button"
 onClick={clearTerminal}
 className="rounded px-1.5 py-0.5 text-[10px] hover:bg-card/5"
 >
 Clear
 </button>
 <button
 type="button"
 onClick={() => setTerminalCollapsed((v) => !v)}
 className="rounded p-0.5 hover:bg-card/5"
 aria-label={terminalCollapsed ?"Mở terminal" :"Thu terminal"}
 >
 {terminalCollapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
 </button>
 </div>
 </div>

 {!terminalCollapsed && (
 <div className="flex min-h-0 flex-1 flex-col">
 <div
 className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-5"
 onClick={() => promptRef.current?.focus()}
 >
 {lines.map((line) => (
 <span
 key={line.id}
 className={`whitespace-pre-wrap break-words ${
 line.kind ==="cmd"
 ?""
 : line.kind ==="stderr"
 ?""
 : line.kind ==="stdin"
 ?""
 : line.kind ==="meta"
 ?""
 : line.kind ==="system"
 ?"/90"
 :""
 }`}
 >
 {line.kind ==="cmd" || line.kind ==="stdin" || line.kind ==="meta" || line.kind ==="system"
 ? line.text +"\n"
 : line.text}
 </span>
 ))}
 {(terminal.phase ==="starting" || terminal.phase ==="running") && (
 <input
 ref={promptRef}
 value={prompt}
 onChange={(e) => setPrompt(e.target.value)}
 onKeyDown={handlePromptKeyDown}
 disabled={!terminal.connected}
 autoFocus
 spellCheck={false}
 autoComplete="off"
 aria-label="Nhập dữ liệu cho chương trình"
 className="inline max-w-full flex-none bg-transparent p-0 align-baseline font-mono text-[12px] caret-emerald-300 outline-none"
 style={{ width: (Math.max(prompt.length, 1) + 1) +"ch" }}
 />
 )}
 <div ref={termEndRef} />
 </div>
 </div>
 )}
 </div>
 </div>
 </div>
 </div>
 );
}
