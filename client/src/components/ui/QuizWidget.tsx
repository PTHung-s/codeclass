import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SyntaxHighlighter, oneDark } from "./CodeHighlighter";
import api from "../../lib/api";
import { useAuthContext } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { useMascot, msgSolved, msgFail, msgShocked } from "../mascot";
import { ClipboardCheck, CheckCircle2, XCircle, X, RotateCcw, ChevronRight, ChevronLeft, ChevronDown, Trophy, Sparkles, Check, Lock } from "lucide-react";
import { useAntiCheat } from "../../hooks/useAntiCheat";
import { Hearts, FullscreenModal, ViolationToast, GameOverModal, AwayCountdownToast } from "../ui/AntiCheat";

/** Convert literal \n to markdown hard breaks (double-space + newline). */
function fixNewlines(text: string): string {
  // Only affect single newlines, preserve double newlines (paragraph breaks)
  return text.replace(/(?<!\n)\n(?!\n)/g, "  \n");
}

interface Q {
  id: string;
  orderIndex: number;
  question: string;
  /** Already shuffled by the server for this fetch — render in this order. */
  options: string[];
  /**
   * optionOrder[displayPosition] = index of that option in the question bank.
   * We never read it, we only hand it back on submit so the server can grade a
   * letter we picked against the key it stores. Absent on older servers.
   */
  optionOrder?: number[];
}
interface QuizDTO {
  id: string;
  title: string;
  passScore: number;
  questionCount: number;
  bankSize?: number;
  questions: Q[];
  summary?: { attempts: number; bestPercent: number | null; passed: boolean; lastScore: number | null; lastTotal: number | null };
}
interface Detail {
  questionId: string;
  question: string;
  options: string[];
  /** null when the server sealed the key — see redactAnswerKey on the server. */
  correctIndex: number | null;
  explanation: string | null;
  selectedIndex: number;
  isCorrect: boolean;
}
interface Result {
  score: number;
  total: number;
  percent: number;
  passed: boolean;
  passScore: number;
  details: Detail[];
  /** True when the student has not passed yet: wrong answers come back unmarked. */
  reviewLocked?: boolean;
  tokensAwarded?: number;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[*_~#>\[\]()!-]/g, "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function QuizMarkdown({ content, compact = false }: { content: string; compact?: boolean }) {
  return (
    <div className={`quiz-content max-w-none ${compact ? "text-sm" : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const codeStr = String(children).replace(/\n$/, "");
            if (match) {
              return (
                <div className="my-2 rounded-lg overflow-hidden border border-border">
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{ margin: 0, borderRadius: 0, fontSize: "0.8rem", padding: "0.75rem 1rem" }}
                  >
                    {codeStr}
                  </SyntaxHighlighter>
                </div>
              );
            }
            return (
              <code className="whitespace-pre-wrap rounded bg-muted px-1.5 py-0.5 text-[0.82rem] font-mono text-rose-700 dark:text-rose-300" {...props}>
                {children}
              </code>
            );
          },
          p({ children }) {
            return <p className="mb-1 last:mb-0 leading-relaxed">{children}</p>;
          },
        }}
      >
        {fixNewlines(content)}
      </ReactMarkdown>
    </div>
  );
}

/* Inline code must keep its spaces: several quiz options differ only by
   alignment (`setw(5)` printing `   42    7`). Without whitespace-pre-wrap the
   browser collapses runs of spaces and three distinct options render
   identically, which students reported as duplicate answers. */
function QuizMarkdownInline({ content }: { content: string }) {
  return (
    <span className="min-w-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <>{children}</>,
          code({ children, ...props }) {
            return (
              <code className="whitespace-pre-wrap rounded bg-muted px-1 py-0.5 text-[0.78rem] font-mono text-rose-700 dark:bg-muted dark:text-rose-300" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {fixNewlines(content)}
      </ReactMarkdown>
    </span>
  );
}

export default function QuizWidget({ lessonId, onPassed }: { lessonId: string; onPassed?: () => void }) {
  const { user } = useAuthContext();
  const isStaff = user?.role === "teacher" || user?.role === "admin" || user?.role === "teaching_assistant";

  const { data, isLoading, refetch } = useQuery<QuizDTO[]>({
    queryKey: ["quizzes", lessonId],
    queryFn: () => api.get(`/lessons/${lessonId}/quizzes`).then((r) => r.data),
    enabled: !!lessonId,
    staleTime: Infinity, // prevent auto-refetch on window focus — questions are randomized per fetch
  });

  if (isLoading) return null;
  const quiz = data?.[0];
  if (!quiz || quiz.questions.length === 0) return null;

  return <QuizRunner key={quiz.id + "-" + (data?.length ?? 0)} quiz={quiz} isStaff={isStaff} lessonId={lessonId} onPassed={onPassed} redraw={refetch} />;
}

/* ── Option button ── */
function OptionButton({ index, text, selected, disabled, onClick }: { index: number; text: string; selected: boolean; disabled?: boolean; onClick: () => void }) {
  const letter = String.fromCharCode(65 + index);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group flex w-full items-center gap-4 rounded-xl border-2 px-5 py-4 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? "option-selected border-primary bg-primary/10 text-foreground shadow-sm"
          : "border-border bg-card text-foreground hover:border-primary/30 hover:bg-muted/50 hover:shadow-sm"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all duration-200 ${
          selected
            ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30"
            : "border-2 border-border bg-muted text-muted-foreground group-hover:border-primary/40 group-hover:text-primary"
        }`}
      >
        {letter}
      </span>
      <span className="min-w-0 flex-1 leading-relaxed">
        <QuizMarkdownInline content={text} />
      </span>
      {selected && <Check className="h-5 w-5 shrink-0 text-primary" />}
    </button>
  );
}

/* ── Navigator sidebar (desktop) ── */
function NavigatorCard({
  questions, currentIdx, answers, onSelect, total, answeredCount, allAnswered, onSubmit, isPending, locked,
}: {
  questions: Q[];
  currentIdx: number;
  answers: Record<string, number>;
  onSelect: (i: number) => void;
  total: number;
  answeredCount: number;
  allAnswered: boolean;
  onSubmit: () => void;
  isPending: boolean;
  locked?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tiến độ</span>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-primary">
          {answeredCount}/{total}
        </span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${(answeredCount / total) * 100}%` }} />
      </div>
      <div className="scrollbar-none -mx-1 max-h-[50vh] space-y-1 overflow-y-auto px-1">
        {questions.map((q, i) => {
          const isAnswered = answers[q.id] !== undefined;
          const isCurrent = i === currentIdx;
          return (
            <button
              key={q.id}
              onClick={() => onSelect(i)}
              disabled={locked}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                isCurrent
                  ? "bg-primary/10 text-primary ring-1 ring-primary/25"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isAnswered
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs">
                {stripMarkdown(q.question) || `Câu ${i + 1}`}
              </span>
              {isAnswered && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
            </button>
          );
        })}
      </div>
      <div className="mt-4 border-t border-border pt-4">
        <button
          onClick={onSubmit}
          disabled={!allAnswered || isPending || locked}
          className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {isPending ? "Đang chấm..." : "Nộp bài"}
        </button>
        {!allAnswered && (
          <p className="mt-1.5 text-center text-[11px] text-amber-600 dark:text-amber-400">
            Còn {total - answeredCount} câu chưa trả lời
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Mobile nav dots ── */
function MiniNavGrid({ questions, currentIdx, answers, onSelect, locked }: { questions: Q[]; currentIdx: number; answers: Record<string, number>; onSelect: (i: number) => void; locked?: boolean }) {
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {questions.map((q, i) => (
        <button
          key={q.id}
          onClick={() => onSelect(i)}
          disabled={locked}
          className={`h-7 w-7 rounded-md text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
            i === currentIdx
              ? "bg-primary text-primary-foreground shadow-sm"
              : answers[q.id] !== undefined
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}

/* ── Circular score banner ── */
function ScoreBanner({ score, total, percent, passed, onRetry, incorrectCount }: { score: number; total: number; percent: number; passed: boolean; onRetry: () => void; incorrectCount: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const [animatedPercent, setAnimatedPercent] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedPercent(percent), 50);
    return () => clearTimeout(timer);
  }, [percent]);

  const offset = circumference - (animatedPercent / 100) * circumference;
  const strokeColor = passed ? "#10b981" : "#f59e0b";

  return (
    <div
      className={`result-in rounded-2xl border p-6 sm:p-8 ${
        passed
          ? "border-emerald-500/25 bg-emerald-500/10 dark:bg-emerald-500/10"
          : "border-amber-500/25 bg-amber-500/10 dark:bg-amber-500/10"
      }`}
    >
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
        {/* Circular score ring */}
        <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
          <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
            <circle
              cx="60" cy="60" r={radius}
              fill="none"
              stroke={strokeColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-extrabold tabular-nums ${passed ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>{percent}%</span>
            <span className="text-xs tabular-nums text-muted-foreground">{score}/{total}</span>
          </div>
        </div>

        {/* Text + buttons */}
        <div className="text-center sm:text-left">
          <h3 className={`text-xl font-extrabold tracking-tight ${passed ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
            {passed ? "Chúc mừng, bạn đã qua bài! 🎉" : "Chưa đạt — cố lên! 💪"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {passed
              ? `Bạn đã trả lời đúng ${score}/${total} câu.`
              : `Bạn mới đúng ${score}/${total} câu (còn ${incorrectCount} câu sai).`}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted"
            >
              <RotateCcw className="h-4 w-4" /> Làm lại
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Accordion review item ── */
function ReviewItem({ detail, index, isExpanded, onToggle }: { detail: Detail; index: number; isExpanded: boolean; onToggle: () => void }) {
  const { isCorrect, question, options, selectedIndex, correctIndex, explanation } = detail;
  return (
    <div className={`rounded-xl border transition-all duration-200 ${isCorrect ? "border-emerald-500/20 dark:border-emerald-500/25" : "border-red-500/20 dark:border-red-500/25"} ${isExpanded ? "shadow-sm" : ""}`}>
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isCorrect ? "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-red-500/15 text-red-700 dark:bg-red-500/15 dark:text-red-400"}`}>
          {isCorrect ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </span>
        <span className="flex-1 min-w-0 text-sm font-medium text-foreground dark:text-foreground">
          <span className="text-muted-foreground">Câu {index + 1}.</span>{" "}
          <QuizMarkdownInline content={question} />
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
      </button>
      {isExpanded && (
        <div className="animate-slide-up border-t border-border px-4 pb-4 pt-3 dark:border-border">
          <div className="space-y-2 pl-10 text-sm">
            {!isCorrect && (
              <div className="flex items-start gap-2">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div>
                  <span className="text-xs font-semibold uppercase text-red-600">Bạn chọn: </span>
                  <span className="text-foreground/90 dark:text-muted-foreground/50"><QuizMarkdownInline content={options[selectedIndex] ?? "—"} /></span>
                </div>
              </div>
            )}
            {correctIndex === null ? (
              /* Sealed by the server until this quiz is passed. Saying so beats
                 rendering options[null] as if A were the answer. */
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="text-muted-foreground dark:text-muted-foreground">
                  <span className="text-xs font-semibold uppercase text-amber-600">Chưa mở đáp án. </span>
                  Xem lại bài học rồi làm lại — đáp án và giải thích sẽ hiện đầy đủ khi bạn qua bài.
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <div>
                    <span className="text-xs font-semibold uppercase text-emerald-600">Đáp án đúng: </span>
                    <span className="text-foreground/90 dark:text-muted-foreground/50"><QuizMarkdownInline content={options[correctIndex] ?? "—"} /></span>
                  </div>
                </div>
                {explanation && (
                  <div className="mt-2 rounded-lg bg-primary/10 p-3 text-xs text-primary dark:bg-primary/15 dark:text-primary">
                    <span className="font-semibold">💡 Giải thích: </span>
                    <QuizMarkdownInline content={explanation} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main quiz runner ── */
function QuizRunner({ quiz, isStaff, lessonId, onPassed, redraw }: { quiz: QuizDTO; isStaff: boolean; lessonId: string; onPassed?: () => void; redraw: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { say } = useMascot();
  const [phase, setPhase] = useState<"intro" | "taking" | "result">(quiz.summary?.passed ? "intro" : "intro");
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [fullscreenBypassed, setFullscreenBypassed] = useState(false);
  const forceExitRef = useRef(false);
  const questionOpenedAtRef = useRef<Record<string, number>>({});
  const questionElapsedRef = useRef<Record<string, number>>({});
  const questionChangesRef = useRef<Record<string, number>>({});

  const submitMutation = useMutation({
    mutationFn: (payload: { answers: { questionId: string; selectedIndex: number; optionOrder?: number[]; responseTimeMs?: number; activeTimeMs?: number; changeCount?: number }[] }) =>
      api.post(`/quizzes/${quiz.id}/attempt`, payload).then((r) => r.data as Result),
    onSuccess: (res) => {
      if (forceExitRef.current) { forceExitRef.current = false; return; }
      setResult(res);
      setPhase("result");
      qc.invalidateQueries({ queryKey: ["quizzes", lessonId] });
      if (res.passed && onPassed) onPassed();
      if ((res.tokensAwarded ?? 0) > 0) {
        toast.success({ title: `+${res.tokensAwarded ?? 0} tokens 🪙`, message: "Đỗ quiz" });
      }
      // Mascot phản ứng theo kết quả (chỉ học sinh thấy dock).
      if (res.passed) {
        say("celebrate", msgSolved({ score: res.score, total: res.total, tokens: res.tokensAwarded ?? 0 }));
      } else {
        say("sad", msgFail({ score: res.score, total: res.total, passScore: quiz.passScore }));
      }
    },
  });

  const questions = quiz.questions;
  const total = questions.length;
  // Only count answers that belong to the CURRENT question set
  // (prevents stale answers from previous refetches causing answeredCount > total)
  const answeredCount = questions.filter(q => answers[q.id] !== undefined).length;
  const allAnswered = answeredCount === total;
  const cur = questions[idx];

  useEffect(() => {
    if (phase !== "taking" || !cur) return undefined;
    const questionId = cur.id;
    questionOpenedAtRef.current[questionId] = performance.now();
    return () => {
      const startedAt = questionOpenedAtRef.current[questionId];
      if (startedAt !== undefined) {
        questionElapsedRef.current[questionId] = (questionElapsedRef.current[questionId] || 0) + Math.max(0, performance.now() - startedAt);
        delete questionOpenedAtRef.current[questionId];
      }
    };
  }, [phase, cur?.id]);

  // Anti-cheat
  const antiCheat = useAntiCheat({
    enabled: phase === "taking",
    onZeroHearts: () => {
      setGameOver(true);
      say("scared", msgShocked("hearts"));
    },
  });

  function start() {
    setAnswers({});
    setIdx(0);
    setResult(null);
    setExpandedId(null);
    setGameOver(false);
    questionOpenedAtRef.current = {};
    questionElapsedRef.current = {};
    questionChangesRef.current = {};
    // Hearts are mount-scoped, and a game-over does not unmount the runner —
    // without this a student who just ran out would start the retake on zero
    // and be locked out before answering anything.
    antiCheat.resetHearts();
    // Pull a fresh draw. The server rotates the subset out of the bank on every
    // fetch, so re-running the identical question ids — whose answer key the
    // previous attempt handed back — stops being the default path.
    redraw();
    setPhase("taking");
    // Request fullscreen after state update
    setTimeout(() => antiCheat.requestFullscreen(), 100);
  }

  /* ── INTRO ── */
  if (phase === "intro") {
    const s = quiz.summary;
    return (
      <section className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-8 sm:p-10">
        <div className="mx-auto max-w-lg text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <ClipboardCheck className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-extrabold tracking-tight text-foreground">Kiểm tra sau bài học</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {total} câu hỏi trắc nghiệm{quiz.bankSize && quiz.bankSize > total ? ` (từ ngân hàng ${quiz.bankSize} câu)` : ""} · Cần đạt{" "}
            <span className="font-bold text-primary">{quiz.passScore}%</span> để hoàn thành bài.
          </p>

          {s && s.attempts > 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {s.passed ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-4 py-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Đã đạt
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-4 py-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">Chưa đạt</span>
              )}
              <span className="rounded-full bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-sm">Cao nhất: {s.bestPercent ?? 0}%</span>
              <span className="rounded-full bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-sm">Đã làm: {s.attempts} lần</span>
            </div>
          )}

          <button
            onClick={start}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg active:scale-95"
          >
            {s && s.attempts > 0 ? "Làm lại bài" : "Bắt đầu làm bài"} <ChevronRight className="h-4 w-4" />
          </button>
          {isStaff && <p className="mt-3 text-xs text-muted-foreground">(Giáo viên làm thử sẽ không lưu kết quả)</p>}
        </div>
      </section>
    );
  }

  /* ── RESULT ── */
  if (phase === "result" && result) {
    const incorrectCount = result.details.filter((d) => !d.isCorrect).length;
    return (
      <section className="mt-10 space-y-6">
        <ScoreBanner
          score={result.score}
          total={result.total}
          percent={result.percent}
          passed={result.passed}
          onRetry={start}
          incorrectCount={incorrectCount}
        />
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:border-border dark:bg-card">
          <h4 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">Đáp án & giải thích</h4>
          <div className="space-y-2">
            {result.details.map((d, i) => (
              <ReviewItem
                key={d.questionId}
                detail={d}
                index={i}
                isExpanded={expandedId === d.questionId}
                onToggle={() => setExpandedId((prev) => (prev === d.questionId ? null : d.questionId))}
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  /* ── TAKING ── */
  const getActiveTimeMs = (questionId: string) => {
    const currentStartedAt = questionOpenedAtRef.current[questionId];
    const currentElapsed = currentStartedAt === undefined ? 0 : Math.max(0, performance.now() - currentStartedAt);
    return Math.round((questionElapsedRef.current[questionId] || 0) + currentElapsed);
  };

  /**
   * Out of hearts: the paper is taken away. Every interactive surface below is
   * gated on this, not just the modal — the modal used to be the only thing
   * that knew about a game-over, so answering and submitting stayed live behind
   * it for anyone who dismissed it or clicked around it.
   */
  const submitAnswers = () => {
    if (gameOver && !forceExitRef.current) return;
    submitMutation.mutate({
      // Built from the current draw, not from `answers`. start() refetches, so
      // for a frame the previous question set is still on screen; anything
      // clicked there is still in this quiz's bank and would be graded, giving
      // a 15-question paper 16 rows.
      answers: questions
        .filter((q) => answers[q.id] !== undefined)
        .map((q) => ({
          questionId: q.id,
          // A position in the shuffled list on screen. optionOrder rides along
          // so the server can turn it back into the index it keys against.
          selectedIndex: answers[q.id],
          optionOrder: q.optionOrder,
          responseTimeMs: getActiveTimeMs(q.id),
          activeTimeMs: getActiveTimeMs(q.id),
          changeCount: questionChangesRef.current[q.id] || 0,
        })),
    });
  };

  return (
    <section className="mt-10">
      {/* Anti-cheat UI — strictly mandatory fullscreen */}
      {!antiCheat.fullscreenActive && !gameOver && (
        <FullscreenModal
          onEnter={antiCheat.requestFullscreen}
        />
      )}
      {antiCheat.lastViolation && <ViolationToast reason={antiCheat.lastViolation} />}
      {antiCheat.awayCountdown !== null && <AwayCountdownToast seconds={antiCheat.awayCountdown} />}
      {gameOver && <GameOverModal mode="submit" onExit={() => { forceExitRef.current = true; submitAnswers(); setGameOver(false); setPhase("intro"); }} />}

      <div className="lg:flex lg:gap-6">
        {/* Desktop sidebar navigator */}
        <aside className="hidden shrink-0 lg:block lg:w-56 xl:w-64">
          <div className="lg:sticky lg:top-20">
            <NavigatorCard
              questions={questions}
              currentIdx={idx}
              answers={answers}
              onSelect={setIdx}
              total={total}
              answeredCount={answeredCount}
              allAnswered={allAnswered}
              onSubmit={submitAnswers}
              isPending={submitMutation.isPending}
              locked={gameOver}
            />
          </div>
        </aside>

        {/* Main question card */}
        <div className="flex-1 min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm dark:border-border dark:bg-card sm:p-6">
          {/* Progress bar */}
          <div className="mb-5">
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground dark:text-muted-foreground">
              <span className="tabular-nums">Câu {idx + 1} / {total}</span>
              <Hearts hearts={antiCheat.hearts} maxHearts={antiCheat.maxHearts} />
              <span className="tabular-nums">Đã trả lời {answeredCount}/{total}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted dark:bg-muted">
              <div
                className="h-full rounded-full bg-primary/100 transition-all duration-300 ease-out"
                style={{ width: `${(answeredCount / total) * 100}%` }}
              />
            </div>
          </div>

          {/* Question */}
          <div key={idx} className="animate-fade-in min-h-[180px]">
            <div className="mb-1 flex items-start gap-2 text-base font-semibold leading-relaxed text-foreground dark:text-foreground">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary dark:bg-primary/15 dark:text-primary">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <QuizMarkdown compact content={cur.question} />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {cur.options.map((opt, oi) => (
                <OptionButton
                  key={oi}
                  index={oi}
                  text={opt}
                  selected={answers[cur.id] === oi}
                  disabled={gameOver}
                  onClick={() => setAnswers((a) => {
                    if (a[cur.id] !== undefined && a[cur.id] !== oi) {
                      questionChangesRef.current[cur.id] = (questionChangesRef.current[cur.id] || 0) + 1;
                    }
                    return { ...a, [cur.id]: oi };
                  })}
                />
              ))}
            </div>
          </div>

          {/* Navigation footer */}
          <div className="mt-6 flex items-center justify-between gap-2 border-t border-border pt-4 dark:border-border">
            <button
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0 || gameOver}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-40 dark:hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" /> Trước
            </button>

            {/* Mobile nav dots */}
            <div className="lg:hidden">
              <MiniNavGrid questions={questions} currentIdx={idx} answers={answers} onSelect={setIdx} locked={gameOver} />
            </div>

            {idx < total - 1 ? (
              <button
                onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
                disabled={gameOver}
                className="inline-flex items-center gap-1 rounded-lg bg-muted px-3 py-2 text-sm font-semibold text-foreground/90 hover:bg-border disabled:cursor-not-allowed disabled:opacity-40 dark:bg-muted dark:text-foreground/90"
              >
                Sau <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={submitAnswers}
                disabled={!allAnswered || submitMutation.isPending || gameOver}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitMutation.isPending ? "Đang chấm..." : "Nộp bài"}
              </button>
            )}
          </div>
          {!allAnswered && idx === total - 1 && (
            <p className="mt-2 text-center text-xs text-amber-600">
              Hãy trả lời tất cả {total} câu trước khi nộp.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
