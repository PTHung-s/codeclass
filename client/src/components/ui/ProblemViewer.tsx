import { useState, type ReactNode } from "react";
import Editor from "@monaco-editor/react";
import type { LucideIcon } from "lucide-react";
import {
  Check,
  ChevronRight,
  Clock,
  Copy,
  Database,
  FlaskConical,
  Lightbulb,
  Link2,
  ListChecks,
  Code2,
  Play,
  Scale,
  Star,
  KeyRound,
  BookOpen,
  Terminal,
} from "lucide-react";
import LatexRenderer from "./LatexRenderer";
import { useDarkMode } from "../../hooks/useDarkMode";

export interface TestCaseLike {
  input?: string | null;
  output?: string | null;
  hidden?: boolean;
  subtask?: number;
  points?: number;
}

export interface ProblemData {
  statement?: string | null;
  sampleInput?: string | null;
  sampleOutput?: string | null;
  requirementsText?: string | null;
  starterCode?: string | null;
  rubric?: string | null;
  hints?: string | null;
  teacherSolution?: string | null;
  testCases?: string | TestCaseLike[] | null;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  checkerType?: string;
}

interface Props {
  problem: ProblemData;
  title?: string;
  packLabel?: string | null;
  showContestHeader?: boolean;
  showTeacherSolution?: boolean;
  fontSize?: "sm" | "base" | "lg";
  onRunSample?: (input: string, expected: string | null, index: number) => void;
  onRunAllSamples?: () => void;
}

const PLACEHOLDER = /^\s*\(xem đề bài\)\s*$/;

function clean(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\r\n/g, "\n").trim();
  return trimmed.length && !PLACEHOLDER.test(trimmed) ? value : null;
}

export function parseVisibleTests(raw: ProblemData["testCases"]): { input: string; output: string }[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return (list as TestCaseLike[])
    .filter((t) => t && typeof t.input === "string" && !t.hidden)
    .slice(0, 4)
    .map((t) => ({
      input: String(t.input ?? ""),
      output: String(t.output ?? ""),
    }));
}

function detectCodeLang(code: string): "python" | "cpp" {
  if (!code) return "python";
  return /#\s*include|int\s+main\s*\(|std::|cout\s*<<|cin\s*>>|vector\s*<|printf\s*\(/.test(code)
    ? "cpp"
    : "python";
}

const DUAL_SOLUTION_MARKER = "/* === CODECLASS_PYTHON_SOLUTION === */";

function splitDualSolution(raw?: string | null): { cpp: string | null; python: string | null } {
  if (!raw) return { cpp: null, python: null };
  const idx = raw.indexOf(DUAL_SOLUTION_MARKER);
  if (idx === -1) {
    const lang = detectCodeLang(raw);
    return lang === "cpp" ? { cpp: raw, python: null } : { cpp: null, python: raw };
  }
  const cpp = raw.slice(0, idx).trim() || null;
  const python = raw.slice(idx + DUAL_SOLUTION_MARKER.length).trim() || null;
  return { cpp, python };
}

function editorHeight(code: string, min = 96, max = 360): number {
  const lines = code ? code.replace(/\r\n/g, "\n").split("\n").length : 4;
  return Math.min(Math.max(lines * 20 + 24, min), max);
}

const CHECKER_LABELS: Record<string, string> = {
  exact: "Exact match",
  tokens: "Ignore whitespace",
  ignore_case: "Ignore case",
  float_1e6: "Float tol 1e-6",
  float_1e4: "Float tol 1e-4",
};

function formatTimeLimitLabel(ms?: number): string {
  const val = Number(ms || 2000);
  const sec = val / 1000;
  return Number.isInteger(sec) ? `${sec}.0s` : `${sec.toFixed(1)}s`;
}

function SectionHeading({
  icon: Icon,
  children,
  action,
}: {
  icon: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-1.5">
      <h3 className="flex items-center gap-1.5 text-[13px] font-bold tracking-tight text-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {children}
      </h3>
      {action}
    </div>
  );
}

function CopyButton({ value, light }: { value: string; light?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      data-no-press
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          /* ignore clipboard error */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={
        light
          ? "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          : "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-400 hover:bg-white/10 hover:text-slate-100"
      }
      title="Copy vào clipboard"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      {copied ? "Đã copy" : "Copy"}
    </button>
  );
}

function SourceChip({ source }: { source: string }) {
  const mdLink = source.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
  const href = mdLink ? mdLink[2] : /^https?:\/\//i.test(source.trim()) ? source.trim() : null;
  const label = mdLink ? mdLink[1] : source.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return (
    <span className="inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground">
      <Link2 className="h-3 w-3 shrink-0" />
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="truncate hover:text-foreground hover:underline">
          {label}
        </a>
      ) : (
        <span className="truncate">{label}</span>
      )}
    </span>
  );
}

interface MetaChips {
  time?: string;
  memory?: string;
  source?: string;
  rest?: string[];
}

function extractMetaChips(text: string): MetaChips {
  const lines = text.split("\n");
  const chips: MetaChips = { rest: [] };
  const keptLines: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    let consumed = false;
    const timeMatch = t.match(/^(?:time|giới hạn thời gian|thời gian)\s*[:\-]\s*(.+)$/i);
    const memMatch = t.match(/^(?:memory|giới hạn bộ nhớ|bộ nhớ)\s*[:\-]\s*(.+)$/i);
    const srcMatch = t.match(/^nguồn\s*[:\-]\s*(.+)$/i);
    if (timeMatch && !chips.time && timeMatch[1].length <= 24) {
      chips.time = timeMatch[1].trim();
      consumed = true;
    } else if (memMatch && !chips.memory && memMatch[1].length <= 24) {
      chips.memory = memMatch[1].trim();
      consumed = true;
    } else if (srcMatch && !chips.source && srcMatch[1].length <= 160) {
      chips.source = srcMatch[1].trim();
      consumed = true;
    }
    if (!consumed) keptLines.push(line);
  }
  const rest = keptLines.join("\n").replace(/^\n+|\n+$/g, "");
  return { ...chips, rest: rest.length ? [rest] : [] };
}

function stripRedundantTrailingExamples(statement: string): string {
  const normalized = statement.replace(/\r\n/g, "\n");
  const idx = normalized.search(
    /\n+(?:#{1,3}\s*)?(?:\*\*)?Ví dụ(?:\s*\d+)?\s*:?(?:\*\*)?\s*\n+[\s\S]*?(?:Input|Đầu vào)[\s\S]*?(?:Output|Đầu ra)/i,
  );
  if (idx <= 0) return statement;
  const tail = normalized.slice(idx);
  if (/\n+#{1,3}\s+(?!Ví dụ|Input|Output)/i.test(tail)) return statement;
  return normalized.slice(0, idx).trimEnd();
}

/**
 * Extract trailing "Giải thích (ví dụ)" section from `statement` so it renders
 * immediately BELOW the Sample Input/Output tables rather than above them.
 */
export function splitStatementAndExplanation(statement: string): {
  main: string;
  explanation: string | null;
} {
  const normalized = statement.replace(/\r\n/g, "\n");
  const re =
    /\n{1,2}(?:#{1,3}\s*)?(?:\*\*)?Giải thích(?:\s+ví\s+dụ)?(?:\*\*)?\s*:?(?:\*\*)?\s*(?:\n+|$)/gi;
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    lastMatch = m;
  }
  if (!lastMatch || lastMatch.index <= 0) {
    return { main: normalized, explanation: null };
  }
  const body = normalized.slice(lastMatch.index + lastMatch[0].length).trim();
  if (!body || /\n+#{1,3}\s+/.test(body)) {
    return { main: normalized, explanation: null };
  }
  const main = normalized.slice(0, lastMatch.index).trimEnd();
  if (main.length < 40) return { main: normalized, explanation: null };
  return { main, explanation: body };
}

function parseHintSteps(hints?: string | null): string[] {
  if (!hints || typeof hints !== "string") return [];
  const trimmed = hints.trim();
  if (!trimmed || trimmed === "[]") return [];

  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        const items = arr.map((x) => String(x || "").trim()).filter(Boolean);
        if (items.length > 0) return items;
      }
    } catch {
      /* treat as markdown */
    }
  }

  if (trimmed.includes("```")) return [trimmed];

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length <= 1) return lines;

  return lines.map((l) => l.replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, "").trim()).filter(Boolean);
}

export default function ProblemViewer({
  problem,
  title,
  packLabel,
  showContestHeader = true,
  showTeacherSolution,
  fontSize = "base",
  onRunSample,
  onRunAllSamples,
}: Props) {
  const { dark } = useDarkMode();
  const [solutionLang, setSolutionLang] = useState<"cpp" | "python">("cpp");
  const [revealedHints, setRevealedHints] = useState(0);

  const dualSol = splitDualSolution(problem.teacherSolution);
  const activeSolLang: "cpp" | "python" =
    dualSol.cpp && dualSol.python
      ? solutionLang
      : dualSol.cpp
        ? "cpp"
        : "python";
  const activeSolCode = (activeSolLang === "cpp" ? dualSol.cpp : dualSol.python) || problem.teacherSolution || "";
  const visibleTests = parseVisibleTests(problem.testCases);
  const fallbackInput = clean(problem.sampleInput);
  const fallbackOutput = clean(problem.sampleOutput);
  const examples: { input: string | null; output: string | null }[] = visibleTests.length
    ? visibleTests.map((t) => ({ input: clean(t.input), output: clean(t.output) }))
    : fallbackInput || fallbackOutput
      ? [{ input: fallbackInput, output: fallbackOutput }]
      : [];

  const requirements = problem.requirementsText ? extractMetaChips(problem.requirementsText) : null;
  const hasRequirementBody = !!requirements?.rest?.join("\n").trim();

  const effectiveTimeChip = problem.timeLimitMs
    ? formatTimeLimitLabel(problem.timeLimitMs)
    : requirements?.time;
  const effectiveMemChip = problem.memoryLimitMb
    ? `${problem.memoryLimitMb} MB`
    : requirements?.memory;
  const checkerLabel = CHECKER_LABELS[problem.checkerType || "exact"] || problem.checkerType || "Exact match";

  const starterLang = detectCodeLang(problem.starterCode || "");
  const rawStatement = problem.statement
    ? examples.length > 0
      ? stripRedundantTrailingExamples(problem.statement)
      : problem.statement
    : "";
  const { main: mainStatement, explanation } = rawStatement
    ? splitStatementAndExplanation(rawStatement)
    : { main: "", explanation: null };

  const textSizeClass =
    fontSize === "sm" ? "text-[13.5px]" : fontSize === "lg" ? "text-[16px] leading-7" : "text-[15px]";

  const hintSteps = parseHintSteps(problem.hints);

  return (
    <div className="space-y-6">
      {/* VNOJ / Codeforces Authoritative Contest Paper Header */}
      {showContestHeader && title ? (
        <header className="border-b border-border pb-4 text-center">
          {packLabel && (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
              {packLabel}
            </p>
          )}
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {effectiveTimeChip && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-muted-foreground/80" />
                <span>Thời gian:</span>
                <strong className="font-semibold text-foreground">{effectiveTimeChip}</strong>
              </span>
            )}
            {effectiveMemChip && (
              <span className="inline-flex items-center gap-1">
                <Database className="h-3.5 w-3.5 text-muted-foreground/80" />
                <span>Bộ nhớ:</span>
                <strong className="font-semibold text-foreground">{effectiveMemChip}</strong>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Terminal className="h-3.5 w-3.5 text-muted-foreground/80" />
              <span>I/O:</span>
              <strong className="font-semibold text-foreground">Standard</strong>
            </span>
            {problem.checkerType && problem.checkerType !== "exact" && (
              <span className="inline-flex items-center gap-1 text-primary">
                <Scale className="h-3.5 w-3.5" />
                <strong className="font-semibold">{checkerLabel}</strong>
              </span>
            )}
            {requirements?.source && <SourceChip source={requirements.source} />}
          </div>
        </header>
      ) : (
        (effectiveTimeChip || effectiveMemChip || (problem.checkerType && problem.checkerType !== "exact") || requirements?.source) && (
          <div className="flex flex-wrap items-center gap-3 border-b border-border/70 pb-3 text-xs text-muted-foreground">
            {effectiveTimeChip && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Thời gian: <strong className="text-foreground">{effectiveTimeChip}</strong>
              </span>
            )}
            {effectiveMemChip && (
              <span className="inline-flex items-center gap-1">
                <Database className="h-3.5 w-3.5" /> Bộ nhớ: <strong className="text-foreground">{effectiveMemChip}</strong>
              </span>
            )}
            {problem.checkerType && problem.checkerType !== "exact" && (
              <span className="inline-flex items-center gap-1 text-primary font-medium">
                <Scale className="h-3.5 w-3.5" /> {checkerLabel}
              </span>
            )}
            {requirements?.source && <SourceChip source={requirements.source} />}
          </div>
        )
      )}

      {/* Đề bài — độ rộng dòng chuẩn đọc (max 78ch) */}
      {mainStatement && (
        <div className="max-w-[78ch]">
          <LatexRenderer text={mainStatement} className={textSizeClass} />
        </div>
      )}

      {/* Ví dụ — Bảng Input/Output sáng sạch chuẩn VNOJ / Codeforces */}
      {examples.length > 0 && (
        <section>
          <SectionHeading
            icon={FlaskConical}
            action={
              onRunAllSamples && examples.length > 1 ? (
                <button
                  type="button"
                  onClick={onRunAllSamples}
                  className="no-print inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300"
                >
                  <Play className="h-3 w-3 fill-current" /> Chạy tất cả ví dụ ({examples.length})
                </button>
              ) : undefined
            }
          >
            Ví dụ
          </SectionHeading>
          <div className="space-y-4">
            {examples.map((example, index) => (
              <div key={index} className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/45 px-3.5 py-1.5">
                  <span className="text-xs font-bold text-foreground">Ví dụ {index + 1}</span>
                  {onRunSample && example.input !== null && (
                    <button
                      type="button"
                      onClick={() => onRunSample(example.input || "", example.output, index)}
                      className="no-print inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-emerald-500"
                    >
                      <Play className="h-2.5 w-2.5 fill-current" /> Chạy thử
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between border-b border-border bg-muted/25 px-3 py-1">
                      <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Input
                      </span>
                      {example.input !== null && <CopyButton value={example.input} light />}
                    </div>
                    <pre className="max-h-60 overflow-auto whitespace-pre bg-muted/10 p-3 font-mono text-[13px] leading-relaxed text-foreground dark:bg-[#0d1117]">
                      {example.input ?? "(rỗng)"}
                    </pre>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between border-b border-border bg-muted/25 px-3 py-1">
                      <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Output
                      </span>
                      {example.output !== null && <CopyButton value={example.output} light />}
                    </div>
                    <pre className="max-h-60 overflow-auto whitespace-pre bg-muted/10 p-3 font-mono text-[13px] leading-relaxed text-foreground dark:bg-[#0d1117]">
                      {example.output ?? "(rỗng)"}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Giải thích ví dụ (đặt ngay sau bảng Ví dụ) */}
      {explanation && (
        <section className="max-w-[78ch]">
          <SectionHeading icon={BookOpen}>Giải thích ví dụ</SectionHeading>
          <div className="rounded-r-lg border-l-2 border-primary/60 bg-muted/25 px-4 py-3">
            <LatexRenderer text={explanation} className={fontSize === "lg" ? "text-sm" : "text-[13.5px]"} />
          </div>
        </section>
      )}

      {/* Yêu cầu / ràng buộc bổ sung */}
      {hasRequirementBody && (
        <section className="max-w-[78ch]">
          <SectionHeading icon={ListChecks}>Ghi chú &amp; Ràng buộc</SectionHeading>
          <div className="rounded-lg border border-dashed border-border bg-muted/25 px-4 py-3">
            <LatexRenderer text={requirements!.rest!.join("\n")} className="text-[13.5px]" />
          </div>
        </section>
      )}

      {/* Code khởi động */}
      {problem.starterCode && (
        <section>
          <SectionHeading icon={Code2}>
            Code khởi động
            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-muted-foreground">
              {starterLang === "cpp" ? "C++" : "Python"}
            </span>
          </SectionHeading>
          <div className="overflow-hidden rounded-lg border border-border">
            <Editor
              height={`${editorHeight(problem.starterCode)}px`}
              language={starterLang}
              value={problem.starterCode}
              theme={dark ? "vs-dark" : "vs"}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                scrollBeyondLastLine: false,
                padding: { top: 12 },
              }}
            />
          </div>
        </section>
      )}

      {/* Thang điểm */}
      {problem.rubric && (
        <section className="max-w-[78ch]">
          <SectionHeading icon={Star}>Thang điểm</SectionHeading>
          <div className="rounded-lg border border-dashed border-border bg-muted/25 px-4 py-3">
            <LatexRenderer text={problem.rubric} className="text-[13.5px]" />
          </div>
        </section>
      )}

      {/* Gợi ý mở từng bước */}
      {hintSteps.length > 0 && (
        <section className="no-print overflow-hidden rounded-lg border border-amber-500/30 bg-amber-500/[0.07] dark:border-amber-400/25 dark:bg-amber-400/[0.06]">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
              <Lightbulb className="h-4 w-4 shrink-0" />
              <span>Gợi ý từng bước ({revealedHints}/{hintSteps.length})</span>
            </div>
            <div className="flex items-center gap-2">
              {revealedHints > 0 && (
                <button
                  type="button"
                  onClick={() => setRevealedHints(0)}
                  className="rounded px-2 py-1 text-[11px] font-medium text-amber-700/80 hover:bg-amber-500/15 dark:text-amber-300/80"
                >
                  Ẩn hết
                </button>
              )}
              {revealedHints < hintSteps.length && (
                <button
                  type="button"
                  onClick={() => setRevealedHints((n) => Math.min(hintSteps.length, n + 1))}
                  className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-900 transition-colors hover:bg-amber-500/30 dark:text-amber-200"
                >
                  <ChevronRight className="h-3 w-3" />
                  {revealedHints === 0 ? "Xem gợi ý 1" : `Mở gợi ý ${revealedHints + 1}`}
                </button>
              )}
              {showTeacherSolution && revealedHints < hintSteps.length && hintSteps.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRevealedHints(hintSteps.length)}
                  className="rounded px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
                >
                  Mở tất cả
                </button>
              )}
            </div>
          </div>
          {revealedHints > 0 && (
            <div className="space-y-2 border-t border-amber-500/20 px-4 py-3 dark:border-amber-400/15">
              {hintSteps.slice(0, revealedHints).map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 rounded-md border border-amber-500/20 bg-card/80 px-3 py-2 text-sm dark:bg-card/40"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <LatexRenderer text={step} className="[&_p]:my-0.5 text-[13.5px]" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Lời giải giáo viên */}
      {showTeacherSolution && problem.teacherSolution && (
        <section>
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-1.5">
            <h3 className="flex items-center gap-1.5 text-[13px] font-bold tracking-tight text-foreground">
              <KeyRound className="h-3.5 w-3.5 text-primary" />
              Lời giải tham khảo
              <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                Chỉ giáo viên
              </span>
            </h3>
            <div className="flex items-center gap-1.5">
              {dualSol.cpp && dualSol.python && (
                <div className="flex items-center rounded-md border border-border bg-muted/50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setSolutionLang("cpp")}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      activeSolLang === "cpp"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    C++17
                  </button>
                  <button
                    type="button"
                    onClick={() => setSolutionLang("python")}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      activeSolLang === "python"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Python 3
                  </button>
                </div>
              )}
              <div className="rounded-md bg-slate-900/90 px-1 py-0.5">
                <CopyButton value={activeSolCode} />
              </div>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <Editor
              height={`${editorHeight(activeSolCode, 140, 500)}px`}
              language={activeSolLang}
              value={activeSolCode}
              theme={dark ? "vs-dark" : "vs"}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                scrollBeyondLastLine: false,
                padding: { top: 12 },
              }}
            />
          </div>
        </section>
      )}
    </div>
  );
}
