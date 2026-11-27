import { useState, type ReactNode } from "react";
import Editor from "@monaco-editor/react";
import type { LucideIcon } from "lucide-react";
import { Check, Clock, Copy, Database, FlaskConical, Lightbulb, Link2, ListChecks, Code2, Star, KeyRound } from "lucide-react";
import LatexRenderer from "./LatexRenderer";
import { useDarkMode } from "../../hooks/useDarkMode";

interface TestCaseLike {
  input?: string | null;
  output?: string | null;
  hidden?: boolean;
}

interface ProblemData {
  statement?: string | null;
  sampleInput?: string | null;
  sampleOutput?: string | null;
  requirementsText?: string | null;
  starterCode?: string | null;
  rubric?: string | null;
  hints?: string | null;
  teacherSolution?: string | null;
  testCases?: string | TestCaseLike[] | null;
}

interface Props {
  problem: ProblemData;
  showTeacherSolution?: boolean;
}

const PLACEHOLDER = /^\s*\(xem đề bài\)\s*$/;

function clean(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\r\n/g, "\n").trim();
  return trimmed.length && !PLACEHOLDER.test(trimmed) ? value : null;
}

function parseVisibleTests(raw: ProblemData["testCases"]): TestCaseLike[] {
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
    .slice(0, 3);
}

// Heuristic nhận diện ngôn ngữ starter/teacher solution (đồng bộ logic phía server).
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

function SectionHeading({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </h3>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      data-no-press
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          /* bỏ qua nếu trình duyệt chặn clipboard */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-400 hover:bg-white/10 hover:text-slate-100"
      title="Copy vào clipboard"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      {copied ? "Đã copy" : "Copy"}
    </button>
  );
}

function SamplePanel({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-slate-950">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        {value !== null && <CopyButton value={value} />}
      </div>
      <pre className="max-h-64 overflow-auto p-3 font-mono text-[13px] leading-relaxed text-slate-100 whitespace-pre">
        {value ?? "(rỗng)"}
      </pre>
    </div>
  );
}

// "Nguồn: https://..." hoặc "[Tên](https://...)" → link gọn trong chip.
function SourceChip({ source }: { source: string }) {
  const mdLink = source.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
  const href = mdLink ? mdLink[2] : /^https?:\/\//i.test(source.trim()) ? source.trim() : null;
  const label = mdLink ? mdLink[1] : source.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
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

// Tách Time / Memory / Nguồn khỏi requirementsText thành chip hiển thị gọn.
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
  // Only strip if the example section sits at the end (no later sections like Ràng buộc / Giải thích).
  if (/\n+#{1,3}\s+(?!Ví dụ|Input|Output)/i.test(tail)) return statement;
  return normalized.slice(0, idx).trimEnd();
}

export default function ProblemViewer({ problem, showTeacherSolution }: Props) {
  const { dark } = useDarkMode();
  const [solutionLang, setSolutionLang] = useState<"cpp" | "python">("cpp");
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
  const showRequirements = !!problem.requirementsText && (hasRequirementBody || requirements?.time || requirements?.memory || requirements?.source);

  const starterLang = detectCodeLang(problem.starterCode || "");
  const displayStatement = problem.statement
    ? (examples.length > 0 ? stripRedundantTrailingExamples(problem.statement) : problem.statement)
    : "";

  return (
    <div className="space-y-6">
      {/* Đề bài — render tràn khung, không lồng hộp xám */}
      {displayStatement && <LatexRenderer text={displayStatement} />}

      {/* Ví dụ */}
      {examples.length > 0 && (
        <section>
          <SectionHeading icon={FlaskConical}>Ví dụ</SectionHeading>
          <div className="space-y-3">
            {examples.map((example, index) => (
              <div key={index} className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
                <div className="border-b border-border bg-muted/50 px-4 py-2 text-xs font-semibold text-foreground">
                  Ví dụ {index + 1}
                </div>
                <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2">
                  <SamplePanel label="Input" value={example.input} />
                  <SamplePanel label="Output" value={example.output} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Yêu cầu / ràng buộc + chip Time · Memory · Nguồn */}
      {showRequirements && (
        <section>
          <SectionHeading icon={ListChecks}>Yêu cầu</SectionHeading>
          {(requirements!.time || requirements!.memory || requirements!.source) && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {requirements!.time && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <Clock className="h-3 w-3" /> {requirements!.time}
                </span>
              )}
              {requirements!.memory && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <Database className="h-3 w-3" /> {requirements!.memory}
                </span>
              )}
              {requirements!.source && <SourceChip source={requirements!.source} />}
            </div>
          )}
          {hasRequirementBody && (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3">
              <LatexRenderer text={requirements!.rest!.join("\n")} className="text-[13px]" />
            </div>
          )}
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
          <div className="overflow-hidden rounded-xl border border-border">
            <Editor
              height={`${editorHeight(problem.starterCode)}px`}
              language={starterLang}
              value={problem.starterCode}
              theme={dark ? "vs-dark" : "vs"}
              options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, padding: { top: 12 } }}
            />
          </div>
        </section>
      )}

      {/* Thang điểm */}
      {problem.rubric && (
        <section>
          <SectionHeading icon={Star}>Thang điểm</SectionHeading>
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3">
            <LatexRenderer text={problem.rubric} className="text-[13px]" />
          </div>
        </section>
      )}

      {/* Gợi ý */}
      {problem.hints && (
        <details className="group overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/10 open:bg-amber-500/[0.07] dark:border-amber-400/25 dark:bg-amber-400/10 dark:open:bg-amber-400/[0.06]">
          <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-2.5 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-400/10 [&::-webkit-details-marker]:hidden">
            <Lightbulb className="h-4 w-4 shrink-0 transition-transform group-open:rotate-12" />
            Gợi ý
            <span className="ml-auto text-[11px] font-medium text-amber-600/80 dark:text-amber-300/70 group-open:hidden">mở ra xem</span>
          </summary>
          <div className="border-t border-amber-500/20 px-4 py-3 dark:border-amber-400/15">
            <LatexRenderer text={problem.hints} className="[&_p]:my-1.5 text-sm" />
          </div>
        </details>
      )}

      {/* Lời giải giáo viên */}
      {showTeacherSolution && problem.teacherSolution && (
        <section>
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <KeyRound className="h-3.5 w-3.5" />
              Lời giải
              <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-amber-700 dark:text-amber-300">
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
          <div className="overflow-hidden rounded-xl border border-border">
            <Editor
              height={`${editorHeight(activeSolCode, 140, 500)}px`}
              language={activeSolLang}
              value={activeSolCode}
              theme={dark ? "vs-dark" : "vs"}
              options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, padding: { top: 12 } }}
            />
          </div>
        </section>
      )}
    </div>
  );
}
