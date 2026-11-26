import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Editor, { type OnMount } from "@monaco-editor/react";
import { motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Cloud,
  Copy,
  CornerDownLeft,
  Download,
  FileCode2,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  PanelLeft,
  Play,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Square,
  Terminal as TerminalIcon,
  Trash2,
  Upload,
  WrapText,
  X,
} from "lucide-react";
import api from "../../lib/api";
import { consumeCodeLabHandoff } from "../../lib/codeLabBridge";
import { useDarkMode } from "../../hooks/useDarkMode";
import {
  CPP_STARTER,
  runCode,
  type CodeRunResult,
  type SupportedLanguage,
} from "../../lib/codeRunner";
import { type TerminalExit, useInteractiveTerminal } from "../../hooks/useInteractiveTerminal";
import { useConfirmContext } from "../../hooks/useConfirm";
import { useToast } from "../../hooks/useToast";

type RunMode = "interactive" | "file";

type TerminalSegment = {
  id: string;
  kind: "cmd" | "stdout" | "stderr" | "meta" | "stdin" | "system";
  text: string;
  errorLine?: number;
};

interface CodeTab {
  id: string;
  name: string;
  code: string;
}

interface CloudSnippet {
  id: string;
  title: string;
  language: SupportedLanguage;
  code: string;
  inputText: string;
  updatedAt: string;
}

const PYTHON_STARTER = `# Code Lab — Python
# Bấm Chạy (Ctrl+Enter), sau đó nhập dữ liệu trực tiếp ở Console bên dưới.

name = input("Tên bạn: ")
print("Xin chào,", name)
`;

const MAX_TABS = 6;
const STORAGE_LANG = "codelab.language";
const STORAGE_LEGACY_CODE = (lang: SupportedLanguage) => `codelab.code.${lang}`;
const STORAGE_TABS = (lang: SupportedLanguage) => `codelab.tabs.v1.${lang}`;
const STORAGE_ACTIVE_TAB = (lang: SupportedLanguage) => `codelab.activeTab.v1.${lang}`;
const STORAGE_FILE_INPUT = "codelab.fileInput.v1";
const STORAGE_TERM_H = "codelab.terminalHeight";
const STORAGE_IO_OPEN = "codelab.ioOpen.v1";
const STORAGE_IO_W = "codelab.ioWidth.v1";
const STORAGE_RUN_MODE = "codelab.runMode.v1";
const STORAGE_FONT_SIZE = "codelab.fontSize.v1";
const STORAGE_WORD_WRAP = "codelab.wordWrap.v1";

function extFor(lang: SupportedLanguage) {
  return lang === "cpp" ? "cpp" : "py";
}

function defaultFileNameFor(lang: SupportedLanguage, index = 1) {
  const ext = extFor(lang);
  return index <= 1 ? `main.${ext}` : `bai_${index}.${ext}`;
}

function starterFor(lang: SupportedLanguage) {
  return lang === "cpp" ? CPP_STARTER : PYTHON_STARTER;
}

function loadTabsForLanguage(lang: SupportedLanguage): CodeTab[] {
  try {
    const raw = localStorage.getItem(STORAGE_TABS(lang));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed
          .filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.code === "string")
          .slice(0, MAX_TABS);
        if (valid.length > 0) return valid;
      }
    }
  } catch {
    // fallback below
  }
  const legacyCode = localStorage.getItem(STORAGE_LEGACY_CODE(lang));
  return [
    {
      id: `${lang}-1`,
      name: defaultFileNameFor(lang, 1),
      code: legacyCode || starterFor(lang),
    },
  ];
}

function usesFileIoInCode(lang: SupportedLanguage, code: string): boolean {
  if (lang === "python") {
    return /\bopen\s*\(\s*(['"])(input|output)\.txt\1/.test(code);
  }
  return /\bfreopen\s*\(/.test(code) || /\b(ifstream|ofstream|fstream)\s+\w+\s*\(\s*"(input|output)\.txt"/.test(code);
}

function formatDuration(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

function parseErrorDiagnostics(lang: SupportedLanguage, stderrText: string): Array<{ line: number; col: number; message: string }> {
  const results: Array<{ line: number; col: number; message: string }> = [];
  if (!stderrText) return results;

  if (lang === "cpp") {
    const regex = /(?:your code|main\.cpp|<stdin>):(\d+)(?::(\d+))?:\s*(?:fatal\s+)?error:\s*(.+)/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(stderrText)) !== null) {
      const line = Number(match[1]);
      const col = Number(match[2] || "1");
      if (Number.isFinite(line) && line >= 1) {
        results.push({ line, col: Math.max(1, col), message: match[3].trim() });
      }
    }
  } else {
    const lines = stderrText.split("\n");
    let lastLine: number | null = null;
    for (const raw of lines) {
      const m = raw.match(/line\s+(\d+)/i);
      if (m) lastLine = Number(m[1]);
    }
    if (lastLine && Number.isFinite(lastLine) && lastLine >= 1) {
      const errMsg = [...lines].reverse().find((l) => l.trim().length > 0) || "Lỗi Python";
      results.push({ line: lastLine, col: 1, message: errMsg.trim() });
    }
  }
  return results;
}

function firstErrorLineFromText(lang: SupportedLanguage, text: string): number | undefined {
  const found = parseErrorDiagnostics(lang, text);
  return found[0]?.line;
}

function consoleStatusInfo(
  phase: "idle" | "starting" | "running" | "stopping",
  fileBusy: boolean,
  interactiveExit: TerminalExit | null,
  fileResult: CodeRunResult | null,
  lastKind: "interactive" | "file" | null,
): { text: string; dotCls: string; textCls: string } {
  if (phase === "starting") {
    return { text: "Đang khởi tạo…", dotCls: "bg-amber-500 animate-pulse", textCls: "text-amber-600 dark:text-amber-400" };
  }
  if (phase === "running" || fileBusy) {
    return { text: "Đang chạy…", dotCls: "bg-emerald-500 animate-pulse", textCls: "text-emerald-600 dark:text-emerald-400" };
  }
  if (phase === "stopping") {
    return { text: "Đang dừng…", dotCls: "bg-zinc-400", textCls: "text-muted-foreground" };
  }

  const res = lastKind === "file" ? fileResult : interactiveExit;
  if (!res) {
    return { text: "Sẵn sàng", dotCls: "bg-zinc-400/80 dark:bg-zinc-500", textCls: "text-muted-foreground" };
  }
  if (res.status === "success") {
    return {
      text: `Hoàn thành · ${formatDuration(res.durationMs)}`,
      dotCls: "bg-emerald-500",
      textCls: "text-emerald-600 dark:text-emerald-400",
    };
  }
  if (res.status === "compile_error") {
    return { text: "Lỗi biên dịch", dotCls: "bg-rose-500", textCls: "text-rose-600 dark:text-rose-400" };
  }
  if (res.status === "time_limit") {
    return { text: "Quá thời gian (TLE)", dotCls: "bg-amber-500", textCls: "text-amber-600 dark:text-amber-400" };
  }
  if (res.status === "blocked") {
    return { text: "Lệnh bị chặn", dotCls: "bg-rose-500", textCls: "text-rose-600 dark:text-rose-400" };
  }
  if ("status" in res && res.status === "stopped") {
    return { text: "Đã dừng", dotCls: "bg-zinc-400", textCls: "text-muted-foreground" };
  }
  return { text: "Lỗi thực thi", dotCls: "bg-rose-500", textCls: "text-rose-600 dark:text-rose-400" };
}

let segmentSeq = 0;
function nextSegId() {
  segmentSeq += 1;
  return `seg-${segmentSeq}`;
}

export default function CodeLab() {
  const confirm = useConfirmContext();
  const toast = useToast();
  const { dark } = useDarkMode();
  const location = useLocation();
  const qc = useQueryClient();

  const [language, setLanguage] = useState<SupportedLanguage>(() => {
    return localStorage.getItem(STORAGE_LANG) === "cpp" ? "cpp" : "python";
  });

  const [tabsByLang, setTabsByLang] = useState<Record<SupportedLanguage, CodeTab[]>>(() => ({
    python: loadTabsForLanguage("python"),
    cpp: loadTabsForLanguage("cpp"),
  }));

  const [activeTabByLang, setActiveTabByLang] = useState<Record<SupportedLanguage, string>>(() => {
    const pyTabs = loadTabsForLanguage("python");
    const cppTabs = loadTabsForLanguage("cpp");
    const savedPy = localStorage.getItem(STORAGE_ACTIVE_TAB("python"));
    const savedCpp = localStorage.getItem(STORAGE_ACTIVE_TAB("cpp"));
    return {
      python: pyTabs.some((t) => t.id === savedPy) ? savedPy! : pyTabs[0].id,
      cpp: cppTabs.some((t) => t.id === savedCpp) ? savedCpp! : cppTabs[0].id,
    };
  });

  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const [runMode, setRunMode] = useState<RunMode>(() => {
    return localStorage.getItem(STORAGE_RUN_MODE) === "file" ? "file" : "interactive";
  });

  const [ioOpen, setIoOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_IO_OPEN);
    if (saved !== null) return saved === "true";
    return typeof window !== "undefined" ? window.innerWidth >= 1180 : false;
  });

  const [ioWidth, setIoWidth] = useState<number>(() => {
    const n = Number(localStorage.getItem(STORAGE_IO_W));
    return Number.isFinite(n) && n >= 190 && n <= 380 ? n : 236;
  });

  const [terminalH, setTerminalH] = useState<number>(() => {
    const n = Number(localStorage.getItem(STORAGE_TERM_H));
    return Number.isFinite(n) && n >= 120 && n <= 520 ? n : 196;
  });

  const [terminalCollapsed, setTerminalCollapsed] = useState(false);
  const [terminalMaximized, setTerminalMaximized] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [snippetTitle, setSnippetTitle] = useState("");

  const [fontSize, setFontSize] = useState<number>(() => {
    const n = Number(localStorage.getItem(STORAGE_FONT_SIZE));
    return Number.isFinite(n) && n >= 12 && n <= 20 ? n : 13;
  });

  const [wordWrap, setWordWrap] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_WORD_WRAP);
    return saved === null ? true : saved === "true";
  });

  const [fileInput, setFileInput] = useState<string>(() => localStorage.getItem(STORAGE_FILE_INPUT) || "");
  const [fileOutput, setFileOutput] = useState<string>("");
  const [fileRunResult, setFileRunResult] = useState<CodeRunResult | null>(null);
  const [runFileBusy, setRunFileBusy] = useState(false);

  const [interactiveResult, setInteractiveResult] = useState<TerminalExit | null>(null);
  const [lastRunKind, setLastRunKind] = useState<"interactive" | "file" | null>(null);

  const [lines, setLines] = useState<TerminalSegment[]>([
    { id: nextSegId(), kind: "system", text: "Sẵn sàng. Nhấn Chạy (Ctrl+Enter) để biên dịch và thực thi." },
  ]);
  const [prompt, setPrompt] = useState("");
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [savedPulse, setSavedPulse] = useState(false);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const termEndRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<"code" | "stdin">("code");
  const stderrAccumulatorRef = useRef("");

  const currentTabs = tabsByLang[language];
  const activeTabId = activeTabByLang[language];
  const activeTab = useMemo(
    () => currentTabs.find((t) => t.id === activeTabId) || currentTabs[0],
    [currentTabs, activeTabId],
  );
  const code = activeTab.code;
  const fileName = activeTab.name;

  const setCode = useCallback(
    (nextCode: string) => {
      setTabsByLang((prev) => ({
        ...prev,
        [language]: prev[language].map((tab) =>
          tab.id === activeTab.id ? { ...tab, code: nextCode } : tab,
        ),
      }));
    },
    [activeTab.id, language],
  );

  // Clear or set Monaco inline error markers
  const applyDiagnostics = useCallback((lang: SupportedLanguage, stderrText: string) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return;

    const diagnostics = parseErrorDiagnostics(lang, stderrText);
    const maxLine = model.getLineCount();
    const markers = diagnostics.map((d) => {
      const safeLine = Math.min(maxLine, Math.max(1, d.line));
      const lineLen = model.getLineMaxColumn(safeLine);
      return {
        severity: monaco.MarkerSeverity.Error,
        message: d.message,
        startLineNumber: safeLine,
        startColumn: Math.min(d.col, lineLen),
        endLineNumber: safeLine,
        endColumn: lineLen,
      };
    });
    monaco.editor.setModelMarkers(model, "codelab-runner", markers);
  }, []);

  const clearDiagnostics = useCallback(() => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (monaco && model) {
      monaco.editor.setModelMarkers(model, "codelab-runner", []);
    }
  }, []);

  const jumpToLine = useCallback((lineNumber: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    const safeLine = model ? Math.min(model.getLineCount(), Math.max(1, lineNumber)) : lineNumber;
    editor.revealLineInCenter(safeLine);
    editor.setPosition({ lineNumber: safeLine, column: 1 });
    editor.focus();
  }, []);

  const appendLines = useCallback((items: Omit<TerminalSegment, "id">[]) => {
    setLines((prev) => [...prev, ...items.map((item) => ({ ...item, id: nextSegId() }))]);
  }, []);

  const appendStream = useCallback(
    (stream: "stdout" | "stderr", data: string) => {
      const kind = stream === "stderr" ? "stderr" : "stdout";
      const normalized = data.replace(/\r\n/g, "\n");
      if (!normalized) return;

      if (stream === "stderr") {
        stderrAccumulatorRef.current += normalized;
      }

      const errorLine = stream === "stderr" ? firstErrorLineFromText(language, normalized) : undefined;

      setLines((prev) => {
        const next = [...prev];
        const chunks = normalized.split("\n");
        chunks.forEach((text, index) => {
          const chunk = text + (index < chunks.length - 1 ? "\n" : "");
          if (!chunk && index === chunks.length - 1) return;
          const last = next[next.length - 1];
          if (index === 0 && last && last.kind === kind && !errorLine) {
            next[next.length - 1] = { ...last, text: last.text + chunk };
          } else {
            next.push({
              id: nextSegId(),
              kind,
              text: chunk,
              errorLine: stream === "stderr" ? firstErrorLineFromText(language, chunk) ?? errorLine : undefined,
            });
          }
        });
        return next;
      });
    },
    [language],
  );

  const handleExit = useCallback(
    (exit: TerminalExit) => {
      setInteractiveResult(exit);
      if (stderrAccumulatorRef.current) {
        applyDiagnostics(language, stderrAccumulatorRef.current);
      }
      const exitCode = exit.exitCode ?? (exit.status === "success" ? 0 : 1);
      appendLines([
        {
          kind: "meta",
          text: `[Kết thúc: mã ${exitCode} · ${formatDuration(exit.durationMs)}${exit.timedOut ? " · Quá thời gian" : ""}]`,
        },
      ]);
    },
    [appendLines, applyDiagnostics, language],
  );

  const handleError = useCallback(
    (message: string) => {
      appendLines([{ kind: "stderr", text: message, errorLine: firstErrorLineFromText(language, message) }]);
      applyDiagnostics(language, message);
      setInteractiveResult(null);
    },
    [appendLines, applyDiagnostics, language],
  );

  const terminal = useInteractiveTerminal({
    onOutput: appendStream,
    onExit: handleExit,
    onError: handleError,
  });

  const interactiveBusy = terminal.phase !== "idle";
  const busy = interactiveBusy || runFileBusy;
  const status = consoleStatusInfo(terminal.phase, runFileBusy, interactiveResult, fileRunResult, lastRunKind);

  // Persist workspace state & legacy key compatibility
  useEffect(() => {
    localStorage.setItem(STORAGE_LANG, language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TABS("python"), JSON.stringify(tabsByLang.python));
    localStorage.setItem(STORAGE_TABS("cpp"), JSON.stringify(tabsByLang.cpp));
    if (tabsByLang.python[0]) localStorage.setItem(STORAGE_LEGACY_CODE("python"), tabsByLang.python[0].code);
    if (tabsByLang.cpp[0]) localStorage.setItem(STORAGE_LEGACY_CODE("cpp"), tabsByLang.cpp[0].code);
    setSavedPulse(true);
    const t = setTimeout(() => setSavedPulse(false), 900);
    return () => clearTimeout(t);
  }, [tabsByLang]);

  useEffect(() => {
    localStorage.setItem(STORAGE_ACTIVE_TAB("python"), activeTabByLang.python);
    localStorage.setItem(STORAGE_ACTIVE_TAB("cpp"), activeTabByLang.cpp);
  }, [activeTabByLang]);

  useEffect(() => {
    localStorage.setItem(STORAGE_FILE_INPUT, fileInput);
  }, [fileInput]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TERM_H, String(terminalH));
  }, [terminalH]);

  useEffect(() => {
    localStorage.setItem(STORAGE_IO_OPEN, String(ioOpen));
  }, [ioOpen]);

  useEffect(() => {
    localStorage.setItem(STORAGE_IO_W, String(ioWidth));
  }, [ioWidth]);

  useEffect(() => {
    localStorage.setItem(STORAGE_RUN_MODE, runMode);
  }, [runMode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_FONT_SIZE, String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem(STORAGE_WORD_WRAP, String(wordWrap));
  }, [wordWrap]);

  useEffect(() => {
    termEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines, terminal.phase]);

  // Auto-focus terminal input when interactive process starts running
  useEffect(() => {
    if (terminal.phase === "running" && !terminalCollapsed) {
      requestAnimationFrame(() => promptRef.current?.focus());
    }
  }, [terminal.phase, terminalCollapsed]);

  const executeFileMode = useCallback(
    async (autoDetected = false) => {
      if (busy) return;
      clearDiagnostics();
      setTerminalCollapsed(false);
      setRunFileBusy(true);
      setFileRunResult(null);
      setLastRunKind("file");

      const cmdLabel =
        language === "cpp"
          ? `g++ ${fileName} -O2 -o main && ./main < input.txt`
          : `python ${fileName} < input.txt`;

      appendLines([
        {
          kind: "cmd",
          text: `$ ${cmdLabel}${autoDetected ? "  (tự động dùng chế độ File I/O vì phát hiện đọc/ghi file)" : ""}`,
        },
      ]);

      try {
        const res = await runCode(language, code, fileInput);
        setFileRunResult(res);

        if (res.status === "success") {
          const outText = res.stdout || "";
          setFileOutput(outText || "(không có output)");
          if (outText) {
            appendLines([{ kind: "stdout", text: outText.endsWith("\n") ? outText : `${outText}\n` }]);
          } else {
            appendLines([{ kind: "system", text: "(Chương trình không in ra output)" }]);
          }
          if (res.stderr?.trim()) {
            appendLines([{ kind: "stderr", text: res.stderr.endsWith("\n") ? res.stderr : `${res.stderr}\n` }]);
          }
          appendLines([
            {
              kind: "meta",
              text: `[Kết thúc: mã ${res.exitCode ?? 0} · ${formatDuration(res.durationMs)} · đã đồng bộ output.txt]`,
            },
          ]);
        } else {
          const errDetail = res.stderr || res.output || "Lỗi thực thi";
          setFileOutput(`${res.status}:\n${errDetail}`);
          appendLines([
            {
              kind: "stderr",
              text: errDetail.endsWith("\n") ? errDetail : `${errDetail}\n`,
              errorLine: firstErrorLineFromText(language, errDetail),
            },
            {
              kind: "meta",
              text: `[Kết thúc: ${res.status} · ${formatDuration(res.durationMs)}]`,
            },
          ]);
          applyDiagnostics(language, errDetail);
        }
      } finally {
        setRunFileBusy(false);
      }
    },
    [appendLines, applyDiagnostics, busy, clearDiagnostics, code, fileInput, fileName, language],
  );

  const executeInteractiveMode = useCallback(() => {
    if (busy) return;
    // Smart fallback: if student code explicitly opens input.txt / output.txt, run in File I/O sandbox seamlessly
    if (usesFileIoInCode(language, code)) {
      setIoOpen(true);
      void executeFileMode(true);
      return;
    }

    clearDiagnostics();
    stderrAccumulatorRef.current = "";
    setTerminalCollapsed(false);
    setInteractiveResult(null);
    setLastRunKind("interactive");

    const cmd = language === "cpp" ? `g++ ${fileName} -O2 -o main && ./main` : `python ${fileName}`;
    appendLines([{ kind: "cmd", text: `$ ${cmd}` }]);

    const started = terminal.start(language, code);
    if (!started) {
      appendLines([{ kind: "stderr", text: "Không khởi chạy được phiên Terminal. Kiểm tra kết nối mạng.\n" }]);
    }
  }, [appendLines, busy, clearDiagnostics, code, executeFileMode, fileName, language, terminal]);

  const handleRun = useCallback(() => {
    if (busy) return;
    if (runMode === "file") {
      void executeFileMode(false);
    } else {
      executeInteractiveMode();
    }
  }, [busy, executeFileMode, executeInteractiveMode, runMode]);

  const handleStop = useCallback(() => {
    if (!interactiveBusy) return;
    const stopped = terminal.stop();
    if (!stopped) {
      appendLines([{ kind: "stderr", text: "Không gửi được lệnh dừng.\n" }]);
    } else {
      appendLines([{ kind: "meta", text: "Đang dừng tiến trình…" }]);
    }
  }, [appendLines, interactiveBusy, terminal]);

  const switchLanguage = (next: SupportedLanguage) => {
    if (next === language || busy) return;
    clearDiagnostics();
    setLanguage(next);
    setRenamingTabId(null);
  };

  const handleAddTab = () => {
    if (currentTabs.length >= MAX_TABS) {
      toast.info({ title: `Tối đa ${MAX_TABS} tab cho mỗi ngôn ngữ` });
      return;
    }
    const ext = extFor(language);
    let idx = currentTabs.length + 1;
    let candidate = `bai_${idx}.${ext}`;
    const names = new Set(currentTabs.map((t) => t.name));
    while (names.has(candidate)) {
      idx += 1;
      candidate = `bai_${idx}.${ext}`;
    }
    const newTab: CodeTab = {
      id: `${language}-${Date.now()}`,
      name: candidate,
      code: starterFor(language),
    };
    clearDiagnostics();
    setTabsByLang((prev) => ({ ...prev, [language]: [...prev[language], newTab] }));
    setActiveTabByLang((prev) => ({ ...prev, [language]: newTab.id }));
  };

  const handleCloseTab = async (tab: CodeTab, e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentTabs.length <= 1 || busy) return;
    const isStarter = tab.code.trim() === starterFor(language).trim() || !tab.code.trim();
    if (!isStarter) {
      const ok = await confirm({
        title: `Đóng tab ${tab.name}?`,
        message: "Nội dung trong tab này sẽ bị xóa khỏi bộ nhớ trình duyệt.",
        confirmLabel: "Đóng tab",
        variant: "danger",
      });
      if (!ok) return;
    }
    const remaining = currentTabs.filter((t) => t.id !== tab.id);
    setTabsByLang((prev) => ({ ...prev, [language]: remaining }));
    if (activeTab.id === tab.id) {
      clearDiagnostics();
      setActiveTabByLang((prev) => ({ ...prev, [language]: remaining[remaining.length - 1].id }));
    }
  };

  const commitRenameTab = () => {
    if (!renamingTabId) return;
    const ext = `.${extFor(language)}`;
    let cleaned = renameDraft.trim().replace(/[\\/:*?"<>|]/g, "");
    if (!cleaned) {
      setRenamingTabId(null);
      return;
    }
    if (!cleaned.endsWith(ext)) {
      cleaned = cleaned.replace(/\.(py|cpp|cc|cxx|txt)$/i, "") + ext;
    }
    setTabsByLang((prev) => ({
      ...prev,
      [language]: prev[language].map((t) => (t.id === renamingTabId ? { ...t, name: cleaned } : t)),
    }));
    setRenamingTabId(null);
  };

  const clearTerminal = useCallback(() => {
    if (interactiveBusy) return;
    setLines([{ id: nextSegId(), kind: "system", text: "Đã làm mới Console." }]);
    setPrompt("");
  }, [interactiveBusy]);

  const resetCode = async () => {
    if (busy) return;
    setSettingsOpen(false);
    const ok = await confirm({
      title: "Khôi phục code mẫu",
      message: `Đặt lại nội dung ${fileName} về template mặc định?`,
      confirmLabel: "Khôi phục",
      variant: "danger",
    });
    if (!ok) return;
    clearDiagnostics();
    setCode(starterFor(language));
    toast.info({ title: "Đã khôi phục template mặc định" });
  };

  const copyCode = async () => {
    setSettingsOpen(false);
    try {
      await navigator.clipboard.writeText(code);
      toast.success({ title: "Đã sao chép code" });
    } catch {
      toast.error({ title: "Không thể truy cập clipboard" });
    }
  };

  const copyConsoleOutput = async () => {
    const out = lines
      .filter((l) => l.kind === "stdout" || l.kind === "stderr")
      .map((l) => l.text)
      .join("")
      .trim();
    if (!out) {
      toast.info({ title: "Chưa có dữ liệu output để sao chép" });
      return;
    }
    try {
      await navigator.clipboard.writeText(out);
      toast.success({ title: "Đã sao chép kết quả Console" });
    } catch {
      toast.error({ title: "Không thể sao chép" });
    }
  };

  const downloadCode = () => {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Cloud Snippets (save/load to server across devices)
  const snippetsQ = useQuery<CloudSnippet[]>({
    queryKey: ["code-lab-snippets"],
    queryFn: () => api.get("/code-lab/snippets").then((r) => r.data),
    enabled: cloudOpen,
  });

  const saveSnippetMut = useMutation({
    mutationFn: (payload: { title: string; language: SupportedLanguage; code: string; inputText: string }) =>
      api.post("/code-lab/snippets", payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["code-lab-snippets"] });
      toast.success({ title: "Đã lưu lên đám mây" });
    },
    onError: (err: any) => {
      toast.error({ title: "Lưu thất bại", message: err?.response?.data?.error || "Vui lòng thử lại" });
    },
  });

  const deleteSnippetMut = useMutation({
    mutationFn: (id: string) => api.delete(`/code-lab/snippets/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["code-lab-snippets"] });
    },
  });

  const openCodePayloadInTab = useCallback(
    (payload: { code: string; language: SupportedLanguage; fileName?: string; inputText?: string; runMode?: RunMode }) => {
      const targetLang = payload.language;
      const tabName = payload.fileName || defaultFileNameFor(targetLang, 1);
      setLanguage(targetLang);
      setTabsByLang((prev) => {
        const list = prev[targetLang];
        const byName = payload.fileName ? list.find((t) => t.name === tabName) : undefined;
        if (byName) {
          setActiveTabByLang((a) => ({ ...a, [targetLang]: byName.id }));
          return {
            ...prev,
            [targetLang]: list.map((t) => (t.id === byName.id ? { ...t, code: payload.code } : t)),
          };
        }
        if (list.length < MAX_TABS) {
          const nextTab: CodeTab = { id: `${targetLang}-${Date.now()}`, name: tabName, code: payload.code };
          setActiveTabByLang((a) => ({ ...a, [targetLang]: nextTab.id }));
          return { ...prev, [targetLang]: [...list, nextTab] };
        }
        const fallbackTab = list[list.length - 1];
        setActiveTabByLang((a) => ({ ...a, [targetLang]: fallbackTab.id }));
        return {
          ...prev,
          [targetLang]: list.map((t) => (t.id === fallbackTab.id ? { ...t, name: tabName, code: payload.code } : t)),
        };
      });

      if (payload.inputText !== undefined && payload.inputText.trim().length > 0) {
        setFileInput(payload.inputText);
        setIoOpen(true);
      }
      if (payload.runMode) {
        setRunMode(payload.runMode);
      } else if (usesFileIoInCode(targetLang, payload.code)) {
        setRunMode("file");
      }
      clearDiagnostics();
    },
    [clearDiagnostics],
  );

  // Consume cross-feature handoff (từ Bài học, Buổi học, hoặc Đề bài)
  useEffect(() => {
    const handoff = consumeCodeLabHandoff();
    if (!handoff) return;
    openCodePayloadInTab(handoff);
    toast.success({
      title: "Đã mở trong Code Lab",
      message: handoff.sourceLabel || handoff.fileName || "Mã nguồn đã sẵn sàng chạy thử",
    });
  }, [location.key, openCodePayloadInTab, toast]);

  const triggerUpload = (target: "code" | "stdin") => {
    uploadTargetRef.current = target;
    uploadInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1_000_000) {
      toast.error({ title: "File quá lớn (tối đa 1MB)" });
      return;
    }
    const text = await file.text();
    const lower = file.name.toLowerCase();

    if (uploadTargetRef.current === "stdin" || lower.endsWith(".inp") || lower.endsWith(".in") || lower === "input.txt") {
      setFileInput(text);
      setIoOpen(true);
      toast.success({ title: `Đã nạp ${file.name} vào input.txt` });
      return;
    }

    const targetLang: SupportedLanguage = lower.endsWith(".cpp") || lower.endsWith(".cc") || lower.endsWith(".cxx")
      ? "cpp"
      : lower.endsWith(".py")
        ? "python"
        : language;

    if (targetLang !== language && !busy) {
      setLanguage(targetLang);
    }
    setTabsByLang((prev) => {
      const list = prev[targetLang];
      if (list.length < MAX_TABS) {
        const imported: CodeTab = { id: `${targetLang}-${Date.now()}`, name: file.name, code: text };
        setActiveTabByLang((a) => ({ ...a, [targetLang]: imported.id }));
        return { ...prev, [targetLang]: [...list, imported] };
      }
      const activeId = activeTabByLang[targetLang];
      return {
        ...prev,
        [targetLang]: list.map((t) => (t.id === activeId ? { ...t, name: file.name, code: text } : t)),
      };
    });
    clearDiagnostics();
    toast.success({ title: `Đã mở ${file.name}` });
  };

  const sendStdinLine = useCallback(() => {
    const value = prompt;
    appendLines([{ kind: "stdin", text: value }]);
    setPrompt("");
    if (interactiveBusy) {
      const sent = terminal.write(`${value}\n`);
      if (!sent) {
        appendLines([{ kind: "stderr", text: "Không gửi được input — phiên chạy đã kết thúc.\n" }]);
      }
    }
  }, [appendLines, interactiveBusy, prompt, terminal]);

  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendStdinLine();
      return;
    }
    if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      clearTerminal();
    }
  };

  // Global keyboard shortcuts inside Code Lab
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setIoOpen((v) => !v);
        return;
      }
      if (e.altKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setZenMode((v) => !v);
        return;
      }
      if (e.key === "Escape" && zenMode) {
        setZenMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleRun, zenMode]);

  const handleRunRef = useRef(handleRun);
  useEffect(() => {
    handleRunRef.current = handleRun;
  }, [handleRun]);

  const onEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      handleRunRef.current();
    });
    editor.onDidChangeCursorPosition((ev) => {
      setCursorPos({ line: ev.position.lineNumber, col: ev.position.column });
    });
  };

  // Vertical resize for Console
  const onConsoleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = terminalCollapsed ? 180 : terminalH;
    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      const maxAllowed = Math.max(240, Math.floor(window.innerHeight * 0.62));
      const next = Math.min(maxAllowed, Math.max(110, startH + delta));
      setTerminalH(next);
      setTerminalCollapsed(false);
      setTerminalMaximized(false);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Horizontal resize for File I/O sidebar
  const onIoResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = ioWidth;
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(380, Math.max(190, startW + (ev.clientX - startX)));
      setIoWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const monacoLang = language === "cpp" ? "cpp" : "python";
  const lineCount = useMemo(() => Math.max(1, code.split("\n").length), [code]);
  const effectiveTermH = terminalCollapsed ? 28 : terminalMaximized ? "52%" : terminalH;
  const lastSegment = lines[lines.length - 1];
  const promptStartsOnNewLine =
    !lastSegment ||
    lastSegment.kind === "cmd" ||
    lastSegment.kind === "stdin" ||
    lastSegment.kind === "meta" ||
    lastSegment.kind === "system" ||
    lastSegment.text.endsWith("\n");

  return (
    <div
      className={
        zenMode
          ? "fixed inset-0 z-[65] flex flex-col overflow-hidden bg-background text-foreground"
          : "relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground"
      }
    >
      <input
        ref={uploadInputRef}
        type="file"
        accept=".py,.cpp,.cc,.cxx,.txt,.inp,.in"
        onChange={(e) => void handleFileSelected(e)}
        className="hidden"
      />

      {/* ── Compact IDE Toolbar (36px on sm+, wraps cleanly on 390px mobile) ── */}
      <header className="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-border bg-muted/40 px-2.5 py-1 sm:h-9 sm:flex-nowrap sm:py-0 dark:bg-[#14171f]">
        {/* Left: I/O toggle + Language switch + File Tabs */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIoOpen((v) => !v)}
            title="Đóng/mở bảng File I/O (Ctrl+B)"
            className={`relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] border px-2 text-xs font-medium transition-colors ${
              ioOpen
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <PanelLeft className="size-3.5" />
            <span className="hidden sm:inline">I/O</span>
            {fileInput.trim().length > 0 && (
              <span className="size-1.5 rounded-full bg-emerald-500" title="Đang có dữ liệu trong input.txt" />
            )}
          </button>

          <div className="h-4 w-px shrink-0 bg-border" />

          {/* Language Segmented Control */}
          <div className="flex h-7 shrink-0 items-center rounded-[6px] border border-border bg-background/80 p-0.5 dark:bg-zinc-900/90">
            {(["python", "cpp"] as const).map((lang) => {
              const active = language === lang;
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => switchLanguage(lang)}
                  disabled={busy}
                  className={`relative h-6 rounded-[4px] px-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                    active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="codelab-lang-pill"
                      transition={{ type: "spring", stiffness: 450, damping: 35 }}
                      className="absolute inset-0 rounded-[4px] bg-primary shadow-sm"
                    />
                  )}
                  <span className="relative z-10">{lang === "python" ? "Python" : "C++"}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden h-4 w-px shrink-0 bg-border md:block" />

          {/* File Tabs */}
          <div className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto py-0.5">
            {currentTabs.map((tab) => {
              const isActive = tab.id === activeTab.id;
              const isRenaming = renamingTabId === tab.id;
              return (
                <div
                  key={tab.id}
                  onClick={() => {
                    if (tab.id !== activeTab.id) {
                      clearDiagnostics();
                      setActiveTabByLang((prev) => ({ ...prev, [language]: tab.id }));
                    }
                  }}
                  onDoubleClick={() => {
                    setRenamingTabId(tab.id);
                    setRenameDraft(tab.name);
                  }}
                  title="Nhấp đúp để đổi tên file"
                  className={`group inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] border px-2 font-mono text-xs transition-colors ${
                    isActive
                      ? "border-border bg-card text-foreground shadow-sm dark:bg-zinc-800/90"
                      : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  }`}
                >
                  <FileCode2 className={`size-3.5 shrink-0 ${isActive ? "text-primary" : "opacity-65"}`} />
                  {isRenaming ? (
                    <input
                      data-slot="codelab-rename"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={commitRenameTab}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRenameTab();
                        if (e.key === "Escape") setRenamingTabId(null);
                      }}
                      autoFocus
                      className="h-5 w-24 rounded bg-background px-1 font-mono text-xs text-foreground outline-none ring-1 ring-primary"
                    />
                  ) : (
                    <span className="max-w-[120px] truncate">{tab.name}</span>
                  )}
                  {currentTabs.length > 1 && !isRenaming && (
                    <button
                      type="button"
                      onClick={(e) => void handleCloseTab(tab, e)}
                      aria-label={`Đóng ${tab.name}`}
                      className="rounded p-0.5 text-muted-foreground/70 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              );
            })}
            {currentTabs.length < MAX_TABS && (
              <button
                type="button"
                onClick={handleAddTab}
                title="Thêm tab nháp mới"
                aria-label="Thêm file mới"
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Plus className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right: Run Mode + Run CTA + Compact Tools */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Run Mode Toggle */}
          <div
            className="flex h-7 items-center rounded-[6px] border border-border bg-background/80 p-0.5 dark:bg-zinc-900/90"
            title="Chọn kiểu chạy: Nhập tương tác trực tiếp ở Console hoặc đọc sẵn từ input.txt"
          >
            {([
              { id: "interactive", label: "Tương tác" },
              { id: "file", label: "File I/O" },
            ] as const).map((m) => {
              const active = runMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setRunMode(m.id);
                    if (m.id === "file") setIoOpen(true);
                  }}
                  disabled={busy}
                  className={`relative h-6 rounded-[4px] px-2 text-[11px] font-medium transition-colors ${
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="codelab-mode-pill"
                      transition={{ type: "spring", stiffness: 450, damping: 35 }}
                      className="absolute inset-0 rounded-[4px] bg-muted shadow-sm dark:bg-zinc-800"
                    />
                  )}
                  <span className="relative z-10">{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* Primary Run / Stop Button */}
          {interactiveBusy ? (
            <button
              type="button"
              onClick={handleStop}
              disabled={terminal.phase === "starting" || terminal.phase === "stopping"}
              title="Dừng chương trình đang chạy"
              className="inline-flex h-7 items-center gap-1.5 rounded-[6px] bg-rose-600 px-2.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Square className="size-3 fill-current" />
              <span>Dừng</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRun}
              disabled={runFileBusy || (runMode === "interactive" && !terminal.connected && !usesFileIoInCode(language, code))}
              title={
                runMode === "file"
                  ? "Chạy với dữ liệu input.txt (Ctrl+Enter)"
                  : terminal.connected
                    ? "Chạy chương trình (Ctrl+Enter)"
                    : "Đang kết nối máy chủ terminal…"
              }
              className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] bg-emerald-600 px-2.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 active:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {runFileBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3 fill-current" />
              )}
              <span>Chạy</span>
              <kbd className="hidden shrink-0 items-center whitespace-nowrap rounded bg-white/15 px-1.5 py-0.5 font-sans text-[10px] leading-none text-white/90 xl:inline-flex">
                Ctrl+↵
              </kbd>
            </button>
          )}

          <div className="h-4 w-px bg-border" />

          {/* Quick Icon Actions */}
          <button
            type="button"
            onClick={() => triggerUpload("code")}
            title="Mở file từ máy (.py, .cpp, .inp)"
            aria-label="Mở file từ máy"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Upload className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={downloadCode}
            title={`Tải xuống ${fileName}`}
            aria-label="Tải code xuống"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Download className="size-3.5" />
          </button>

          {/* Cloud Snippets Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                setCloudOpen((v) => {
                  const next = !v;
                  if (next) setSnippetTitle(fileName);
                  return next;
                });
              }}
              title="Lưu & mở code trên đám mây"
              className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors ${
                cloudOpen
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Cloud className="size-3.5" />
              <span className="hidden xl:inline">Đám mây</span>
            </button>

            {cloudOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCloudOpen(false)} />
                <div className="dropdown-in fixed inset-x-3 top-24 z-50 mx-auto max-w-sm overflow-hidden rounded-lg border border-border bg-popover p-2.5 text-popover-foreground shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-72 sm:max-w-none">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Snippet đám mây
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const clean = snippetTitle.trim() || fileName;
                      saveSnippetMut.mutate({ title: clean, language, code, inputText: fileInput });
                    }}
                    className="mb-2.5 flex items-center gap-1.5"
                  >
                    <input
                      data-slot="codelab-snippet-title"
                      value={snippetTitle}
                      onChange={(e) => setSnippetTitle(e.target.value)}
                      placeholder="Tên snippet..."
                      maxLength={80}
                      className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary/60"
                    />
                    <button
                      type="submit"
                      disabled={saveSnippetMut.isPending || !code.trim()}
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Save className="size-3" />
                      Lưu
                    </button>
                  </form>

                  <div className="max-h-56 space-y-1 overflow-y-auto border-t border-border pt-2">
                    {snippetsQ.isLoading ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">Đang tải...</p>
                    ) : !snippetsQ.data?.length ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">Chưa có snippet nào được lưu.</p>
                    ) : (
                      snippetsQ.data.map((sn) => (
                        <div
                          key={sn.id}
                          className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/70"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              openCodePayloadInTab({
                                code: sn.code,
                                language: sn.language === "cpp" ? "cpp" : "python",
                                fileName: sn.title,
                                inputText: sn.inputText,
                              });
                              setCloudOpen(false);
                              toast.success({ title: `Đã mở ${sn.title}` });
                            }}
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                          >
                            <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] font-semibold uppercase text-muted-foreground">
                              {sn.language === "cpp" ? "C++" : "PY"}
                            </span>
                            <span className="truncate text-xs font-medium text-foreground">{sn.title}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSnippetMut.mutate(sn.id)}
                            disabled={deleteSnippetMut.isPending}
                            title="Xóa snippet"
                            className="rounded p-1 text-muted-foreground opacity-60 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Compact Editor Preferences Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              title="Tuỳ chỉnh trình soạn thảo"
              aria-label="Tuỳ chỉnh trình soạn thảo"
              className={`inline-flex size-7 items-center justify-center rounded-md transition-colors ${
                settingsOpen
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <SlidersHorizontal className="size-3.5" />
            </button>

            {settingsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSettingsOpen(false)} />
                <div className="dropdown-in absolute right-0 z-50 mt-1.5 w-52 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg">
                  <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                    <span className="font-medium text-popover-foreground">Cỡ chữ</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setFontSize((s) => Math.max(12, s - 1))}
                        className="inline-flex size-6 items-center justify-center rounded border border-border hover:bg-muted"
                        aria-label="Giảm cỡ chữ"
                      >
                        <Minus className="size-3" />
                      </button>
                      <span className="w-9 text-center font-mono text-xs">{fontSize}px</span>
                      <button
                        type="button"
                        onClick={() => setFontSize((s) => Math.min(20, s + 1))}
                        className="inline-flex size-6 items-center justify-center rounded border border-border hover:bg-muted"
                        aria-label="Tăng cỡ chữ"
                      >
                        <Plus className="size-3" />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setWordWrap((w) => !w)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                  >
                    <span className="flex items-center gap-2">
                      <WrapText className="size-3.5 text-muted-foreground" />
                       Tự xuống dòng
                    </span>
                    <span className={`font-mono text-[11px] ${wordWrap ? "text-primary" : "text-muted-foreground"}`}>
                      {wordWrap ? "Bật" : "Tắt"}
                    </span>
                  </button>

                  <div className="my-1 h-px bg-border" />

                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                  >
                    <Copy className="size-3.5 text-muted-foreground" />
                    Sao chép toàn bộ code
                  </button>

                  <button
                    type="button"
                    onClick={() => void resetCode()}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                  >
                    <RotateCcw className="size-3.5" />
                    Khôi phục template gốc
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setZenMode((v) => !v)}
            title={zenMode ? "Thoát toàn màn hình (Esc)" : "Mở rộng toàn màn hình (Alt+Z)"}
            aria-label={zenMode ? "Thu nhỏ" : "Toàn màn hình"}
            className={`inline-flex size-7 items-center justify-center rounded-md transition-colors ${
              zenMode
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {zenMode ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        </div>
      </header>

      {/* ── Main Workspace Body ── */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Mobile backdrop when I/O drawer is open */}
        {ioOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/35 md:hidden"
            onClick={() => setIoOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Collapsible File I/O Panel */}
        {ioOpen && (
          <>
            <aside
              style={{ width: ioWidth }}
              className="panel-in absolute inset-y-0 left-0 z-30 flex max-w-[85vw] shrink-0 flex-col border-r border-border bg-card shadow-lg md:static md:z-0 md:shadow-none dark:bg-[#11151d]"
            >
              {/* Panel Header */}
              <div className="flex h-7 shrink-0 items-center justify-between border-b border-border px-2.5">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/85">
                  <FileText className="size-3 text-muted-foreground" />
                  Dữ liệu File / Test
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void executeFileMode(false)}
                    disabled={busy}
                    title="Chạy code với input.txt"
                    className="inline-flex h-5 items-center gap-1 rounded bg-emerald-600/15 px-1.5 text-[10px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-600/25 disabled:opacity-50 dark:text-emerald-400"
                  >
                    <Play className="size-2.5 fill-current" />
                    Chạy test
                  </button>
                  <button
                    type="button"
                    onClick={() => setIoOpen(false)}
                    aria-label="Đóng bảng I/O"
                    className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              </div>

              {/* Split 50/50: input.txt & output.txt */}
              <div className="flex min-h-0 flex-1 flex-col divide-y divide-border">
                {/* input.txt */}
                <div className="flex min-h-0 flex-1 flex-col p-2">
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <span className="font-mono text-[11px] font-medium text-foreground">input.txt</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => triggerUpload("stdin")}
                        title="Nạp file .inp / .txt"
                        className="rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        Mở file
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const text = await navigator.clipboard.readText();
                            if (text) setFileInput(text);
                          } catch {
                            toast.error({ title: "Trình duyệt chặn đọc clipboard" });
                          }
                        }}
                        title="Dán từ clipboard"
                        className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <ClipboardPaste className="size-2.5" />
                        Dán
                      </button>
                      {fileInput && (
                        <button
                          type="button"
                          onClick={() => setFileInput("")}
                          disabled={runFileBusy}
                          className="rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-rose-500"
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    data-slot="codelab-io"
                    value={fileInput}
                    onChange={(e) => setFileInput(e.target.value)}
                    spellCheck={false}
                    placeholder={`Nhập test mẫu cho ${language === "cpp" ? "cin / input.txt" : "input() / input.txt"}…`}
                    className="min-h-0 flex-1 resize-none rounded-md border border-border bg-muted/40 p-2 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none dark:bg-[#0b0e14]"
                  />
                </div>

                {/* output.txt */}
                <div className="flex min-h-0 flex-1 flex-col p-2">
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <span className="font-mono text-[11px] font-medium text-foreground">output.txt</span>
                    <div className="flex items-center gap-1.5">
                      {fileRunResult && (
                        <span
                          className={`font-mono text-[10px] font-medium ${
                            fileRunResult.status === "success"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {fileRunResult.status === "success" ? "OK" : fileRunResult.status} ·{" "}
                          {formatDuration(fileRunResult.durationMs)}
                        </span>
                      )}
                      {fileOutput && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(fileOutput);
                              toast.success({ title: "Đã sao chép output.txt" });
                            } catch {
                              // ignore
                            }
                          }}
                          title="Sao chép kết quả"
                          className="rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          Copy
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    data-slot="codelab-io"
                    value={fileOutput}
                    readOnly
                    spellCheck={false}
                    placeholder="Kết quả stdout hoặc file output.txt hiển thị tại đây…"
                    className="min-h-0 flex-1 resize-none rounded-md border border-border bg-muted/25 p-2 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none dark:bg-[#090c11]"
                  />
                </div>
              </div>
            </aside>

            {/* Horizontal Resize Handle (Desktop) */}
            <div
              onMouseDown={onIoResizeStart}
              title="Kéo để chỉnh độ rộng cột I/O"
              className="hidden w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-primary/50 md:block"
            />
          </>
        )}

        {/* ── Editor + Console Column ── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Monaco Editor */}
          <div className="min-h-0 flex-1">
            <Editor
              height="100%"
              path={activeTab.id}
              language={monacoLang}
              theme={dark ? "vs-dark" : "vs"}
              value={code}
              onMount={onEditorMount}
              onChange={(v) => {
                setCode(v ?? "");
                clearDiagnostics();
              }}
              options={{
                fontSize,
                lineHeight: Math.round(fontSize * 1.55),
                fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: wordWrap ? "on" : "off",
                automaticLayout: true,
                tabSize: 4,
                renderLineHighlight: "line",
                cursorSmoothCaretAnimation: "on",
                bracketPairColorization: { enabled: true },
                padding: { top: 10, bottom: 10 },
                smoothScrolling: true,
                overviewRulerBorder: false,
                scrollbar: {
                  verticalScrollbarSize: 8,
                  horizontalScrollbarSize: 8,
                },
              }}
            />
          </div>

          {/* Vertical Resize Handle */}
          <div
            onMouseDown={onConsoleResizeStart}
            title="Kéo để thay đổi chiều cao Console"
            className="group flex h-1 shrink-0 cursor-row-resize items-center justify-center border-t border-border bg-muted/40 transition-colors hover:bg-primary/40 dark:bg-[#14171f]"
          />

          {/* ── Bottom Console / Terminal ── */}
          <section
            style={{ height: effectiveTermH }}
            className="flex shrink-0 flex-col overflow-hidden bg-zinc-50/90 dark:bg-[#0d1117]"
          >
            {/* Slim Console Header (28px) */}
            <div className="flex h-7 shrink-0 items-center justify-between border-b border-border bg-muted/45 px-2.5 dark:bg-[#14171f]">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-foreground/90">
                  <TerminalIcon className="size-3.5 text-muted-foreground" />
                  Console
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/70 px-2 py-0.5 text-[10px] font-medium dark:bg-zinc-900/80">
                  <span className={`size-1.5 rounded-full ${status.dotCls}`} />
                  <span className={status.textCls}>{status.text}</span>
                </span>
                {terminal.phase === "running" && (
                  <span className="hidden truncate text-[11px] text-emerald-600 sm:inline dark:text-emerald-400">
                    Nhập dữ liệu trực tiếp bên dưới rồi nhấn Enter
                  </span>
                )}
              </div>

              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => void copyConsoleOutput()}
                  title="Sao chép kết quả Console"
                  aria-label="Sao chép output"
                  className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Copy className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={clearTerminal}
                  disabled={interactiveBusy}
                  title="Xóa lịch sử Console (Ctrl+L)"
                  aria-label="Xóa Console"
                  className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                >
                  <Trash2 className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (terminalCollapsed) setTerminalCollapsed(false);
                    setTerminalMaximized((m) => !m);
                  }}
                  title={terminalMaximized ? "Khôi phục chiều cao Console" : "Mở rộng Console"}
                  aria-label="Mở rộng Console"
                  className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {terminalMaximized ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => setTerminalCollapsed((v) => !v)}
                  title={terminalCollapsed ? "Mở Console" : "Thu gọn Console"}
                  aria-label={terminalCollapsed ? "Mở Console" : "Thu gọn Console"}
                  className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {terminalCollapsed ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                </button>
              </div>
            </div>

            {/* Console Transcript */}
            {!terminalCollapsed && (
              <div
                onClick={() => {
                  if (interactiveBusy) promptRef.current?.focus();
                }}
                className="min-h-0 flex-1 cursor-text overflow-y-auto px-3 py-2 font-mono text-xs leading-5"
              >
                {lines.map((line) => {
                  const toneCls =
                    line.kind === "cmd"
                      ? "font-medium text-sky-600 dark:text-sky-400"
                      : line.kind === "stderr"
                        ? "text-rose-600 dark:text-rose-400"
                        : line.kind === "stdin"
                          ? "font-medium text-emerald-700 dark:text-emerald-400"
                          : line.kind === "meta"
                            ? "text-[11px] text-zinc-400 dark:text-zinc-500"
                            : line.kind === "system"
                              ? "italic text-zinc-500 dark:text-zinc-400"
                              : "text-zinc-900 dark:text-zinc-100";

                  const content =
                    line.kind === "cmd" || line.kind === "stdin" || line.kind === "meta" || line.kind === "system"
                      ? `${line.text}\n`
                      : line.text;

                  if (line.errorLine) {
                    return (
                      <span
                        key={line.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          jumpToLine(line.errorLine!);
                        }}
                        title={`Nhấn để nhảy tới dòng ${line.errorLine}`}
                        className={`cursor-pointer whitespace-pre-wrap break-words underline decoration-rose-500/40 underline-offset-2 hover:decoration-rose-500 ${toneCls}`}
                      >
                        {content}
                      </span>
                    );
                  }

                  return (
                    <span key={line.id} className={`whitespace-pre-wrap break-words ${toneCls}`}>
                      {content}
                    </span>
                  );
                })}

                {(terminal.phase === "starting" || terminal.phase === "running") && (
                  <span className="inline-flex max-w-full items-center gap-1 align-baseline">
                    {promptStartsOnNewLine && (
                      <span className="select-none text-emerald-600 dark:text-emerald-400">›</span>
                    )}
                    <input
                      ref={promptRef}
                      data-slot="codelab-stdin"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={handlePromptKeyDown}
                      disabled={!terminal.connected}
                      autoFocus
                      spellCheck={false}
                      autoComplete="off"
                      placeholder={promptStartsOnNewLine ? "Nhập stdin rồi nhấn Enter…" : ""}
                      aria-label="Nhập dữ liệu cho chương trình"
                      style={{ width: prompt ? `${Math.min(Math.max(prompt.length + 1, 2), 64)}ch` : "26ch" }}
                      className="max-w-full bg-transparent p-0 font-mono text-xs text-emerald-700 caret-emerald-500 outline-none placeholder:text-zinc-400/75 dark:text-emerald-300 dark:placeholder:text-zinc-500"
                    />
                    {prompt.length > 0 && (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          sendStdinLine();
                        }}
                        title="Gửi dòng vừa nhập (Enter)"
                        className="inline-flex h-4 items-center gap-0.5 rounded bg-emerald-600/15 px-1 font-sans text-[10px] text-emerald-700 hover:bg-emerald-600/25 dark:text-emerald-300"
                      >
                        <CornerDownLeft className="size-2.5" />
                      </button>
                    )}
                  </span>
                )}
                <div ref={termEndRef} />
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ── Ultra-slim Status Footer (24px) ── */}
      <footer className="flex h-6 shrink-0 select-none items-center justify-between gap-3 border-t border-border bg-muted/40 px-3 text-[11px] text-muted-foreground dark:bg-[#14171f]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`size-1.5 rounded-full ${
                terminal.connected ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
              }`}
            />
            <span className="truncate">{terminal.connected ? "Máy chủ sẵn sàng" : "Đang kết nối…"}</span>
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden font-mono sm:inline">
            {language === "cpp" ? "C++17 (g++ -O2)" : "Python 3"}
          </span>
          <span className="hidden md:inline">·</span>
          <span className="hidden items-center gap-1 md:inline-flex">
            <Check className={`size-3 transition-colors ${savedPulse ? "text-emerald-500" : "text-muted-foreground/70"}`} />
            <span>Đã lưu tự động</span>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3 font-mono text-[11px] tabular-nums">
          <span>
            Dòng {cursorPos.line}, Cột {cursorPos.col}
          </span>
          <span className="hidden sm:inline">{lineCount} dòng</span>
          <span className="hidden md:inline">{fontSize}px</span>
          <span className="hidden lg:inline">UTF-8</span>
        </div>
      </footer>
    </div>
  );
}
