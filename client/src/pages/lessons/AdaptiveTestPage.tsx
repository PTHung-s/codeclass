import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import api from "../../lib/api";
import { useAntiCheat } from "../../hooks/useAntiCheat";
import { Hearts, FullscreenModal, ViolationToast, GameOverModal } from "../../components/ui/AntiCheat";
import { useMascot, msgCorrect, msgWrong, msgSolved, msgFail, msgShocked } from "../../components/mascot";
import { Button } from "../../components/ui/button";
import {
  ArrowLeft, ArrowRight, Zap, Target, TrendingUp, CheckCircle2,
  XCircle, Trophy, Sparkles, Star, Lock, BarChart3, BookOpen, ChevronRight,
  Clock, AlertTriangle, History, ChevronDown,
} from "lucide-react";

const TEST_TIME_SECONDS = 25 * 60; // 25 minutes for 25 questions
const LS_KEY = "adaptive_test_session";

/* ── Types ── */
interface SafeQ {
  id: string;
  lessonId: string;
  question: string;
  options: string[];
  difficulty: number;
}
interface StartR {
  sessionId: string;
  question: SafeQ;
  questionIndex: number;
  totalQuestions: number;
  currentAbility: number;
  passThreshold: number;
  partialThreshold: number;
  maxAbility: number;
  expiresAt: number;
}
interface NextR {
  complete: boolean;
  question?: SafeQ;
  questionIndex?: number;
  totalQuestions?: number;
  currentAbility?: number;
  currentAnswer?: {
    isCorrect: boolean;
    correctIndex: number;
    explanation: string | null;
  };
  result?: AdaptiveResult;
}
interface AdaptiveResult {
  sessionId: string;
  abilityStart: number;
  abilityEnd: number;
  confidenceInterval: { lower: number; upper: number };
  totalQuestions: number;
  correctCount: number;
  accuracyPercent: number;
  passed: boolean;
  partialPass: boolean;
  skipableLessonIds: string[];
  requiredLessonIds: string[];
  answers: Array<{
    questionId: string; lessonId: string; difficulty: number;
    question: string; options: string[]; correctIndex: number;
    explanation: string | null; selectedIndex: number; isCorrect: boolean; abilityAfter: number;
  }>;
  lessonBreakdown: Record<string, { correct: number; total: number; percent: number }>;
}
interface LessonInfo {
  id: string;
  title: string;
}

function fixNewlines(text: string): string {
  return text.replace(/(?<!\n)\n(?!\n)/g, "  \n");
}
function round(v: number, d: number): number {
  return Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
}

/* ── Markdown helpers ── */
function MdBlock({ content }: { content: string }) {
  return (
    <div className="quiz-content max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const codeStr = String(children).replace(/\n$/, "");
            if (match) {
              return (
                <div className="my-2 rounded-lg overflow-hidden border border-border dark:border-border">
                  <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div" customStyle={{ margin: 0, borderRadius: 0, fontSize: "0.8rem", padding: "0.75rem 1rem" }}>
                    {codeStr}
                  </SyntaxHighlighter>
                </div>
              );
            }
            return <code className="rounded bg-muted px-1.5 py-0.5 text-[0.82rem] font-mono text-rose-700 dark:bg-muted dark:text-rose-300" {...props}>{children}</code>;
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
function MdInline({ content }: { content: string }) {
  return (
    <span className="min-w-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <>{children}</>,
          code({ children, ...props }) {
            return <code className="rounded bg-muted px-1 py-0.5 text-[0.78rem] font-mono text-rose-700 dark:bg-muted dark:text-rose-300" {...props}>{children}</code>;
          },
        }}
      >
        {fixNewlines(content)}
      </ReactMarkdown>
    </span>
  );
}

/* ── Difficulty stars ── */
function Stars({ difficulty }: { difficulty: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3 w-3 ${n <= difficulty ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40 dark:text-muted-foreground"}`} />
      ))}
    </span>
  );
}

/* ── Ability meter ── */
function AbilityMeter({ ability, prevAbility, maxAbility = 10 }: { ability: number; prevAbility?: number; maxAbility?: number }) {
  const pct = Math.max(0, Math.min(100, (ability / maxAbility) * 100));
  const delta = prevAbility !== undefined ? ability - prevAbility : 0;
  const mid = round(maxAbility / 2, 1);

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-xs text-muted-foreground dark:text-muted-foreground mb-1">
          <span>Năng lực ước tính</span>
          <span className="tabular-nums font-semibold">
            {ability.toFixed(2)}
            {delta !== 0 && (
              <span className={`ml-1 ${delta > 0 ? "text-emerald-500" : "text-red-500"}`}>
                {delta > 0 ? "+" : ""}{delta.toFixed(2)}
              </span>
            )}
            <span className="ml-1 text-muted-foreground font-normal">/ {maxAbility}</span>
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted dark:bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[9px] text-muted-foreground/40 dark:text-muted-foreground">
          <span>0</span><span>{mid}</span><span>{maxAbility}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ── */
export default function AdaptiveTestPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const moduleId = searchParams.get("moduleId") || "";
  const courseId = searchParams.get("courseId") || "";

  /* Data: module & lessons info */
  const { data: mod } = useQuery<any>({
    queryKey: ["module", moduleId],
    queryFn: () => api.get(`/modules/${moduleId}`).then((r) => r.data),
    enabled: !!moduleId,
  });

  const { data: lessons = [] } = useQuery<LessonInfo[]>({
    queryKey: ["module-lessons", moduleId],
    queryFn: () => api.get(`/modules/${moduleId}/lessons`).then((r) => r.data || []),
    enabled: !!moduleId,
  });

  /* Session state */
  const [phase, setPhase] = useState<"intro" | "taking" | "feedback" | "result">("intro");
  const [sessionId, setSessionId] = useState("");
  const [passThreshold, setPassThreshold] = useState(6.0);
  const [maxAbility, setMaxAbility] = useState(10.0);
  const [question, setQuestion] = useState<SafeQ | null>(null);
  const [qIndex, setQIndex] = useState(1);
  const [totalQ, setTotalQ] = useState(25);
  const [ability, setAbility] = useState(3);
  const [prevAbility, setPrevAbility] = useState<number | undefined>();
  const { say } = useMascot();
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; correctIndex: number; explanation: string | null } | null>(null);
  const [result, setResult] = useState<AdaptiveResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(TEST_TIME_SECONDS);
  const [gameOver, setGameOver] = useState(false);
  const [fullscreenBypassed, setFullscreenBypassed] = useState(false);
  const forceExitRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer — paused when game over
  useEffect(() => {
    if (phase !== "taking" && phase !== "feedback") return;
    if (gameOver) return; // stop timer when hearts depleted
    countdownRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [phase, gameOver]);

  // Auto-submit when time runs out — skip if game over
  useEffect(() => {
    if (timeLeft === 0 && (phase === "taking" || phase === "feedback") && !nextMutation.isPending && question && !gameOver) {
      nextMutation.mutate({ selectedIndex: selectedIndex ?? -1 });
    }
  }, [timeLeft, gameOver]);

  // Resume interrupted test on mount
  const [resuming, setResuming] = useState(false);
  useEffect(() => {
    if (!moduleId || !courseId) return;
    const saved = localStorage.getItem(LS_KEY);
    if (!saved) return;
    let parsed: { sessionId: string; courseId: string; moduleId: string; expiresAt: number };
    try { parsed = JSON.parse(saved); } catch { localStorage.removeItem(LS_KEY); return; }
    // Only resume if same course+module
    if (parsed.courseId !== courseId || parsed.moduleId !== moduleId) return;

    setResuming(true);
    api.get(`/adaptive/${parsed.sessionId}/state`)
      .then((r) => {
        const data = r.data;
        if (data.complete) {
          // Test was already finished — show result
          localStorage.removeItem(LS_KEY);
          setResult(data.result);
          setAbility(data.result.abilityEnd);
          setPhase("result");
          return;
        }
        setSessionId(parsed.sessionId);
        setPassThreshold(data.passThreshold ?? 6);
        setMaxAbility(data.maxAbility ?? 10);
        setQuestion(data.question);
        setQIndex(data.questionIndex);
        setTotalQ(data.totalQuestions);
        setAbility(data.currentAbility);
        // Compute remaining time
        const expiresAt = Number(data.expiresAt || parsed.expiresAt);
        setLocalSessionExpiry(expiresAt);
        const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        setTimeLeft(remaining);
        setPhase("taking");
      })
      .catch(() => {
        // Session expired — clear stale entry
        localStorage.removeItem(LS_KEY);
      })
      .finally(() => setResuming(false));
  }, []); // only on mount

  // The server owns the deadline. Local storage only remembers the latest
  // server-provided expiry so refresh can reconnect to the session.
  function setLocalSessionExpiry(expiresAt: number) {
    const saved = localStorage.getItem(LS_KEY);
    if (!saved) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ ...JSON.parse(saved), expiresAt }));
    } catch { /* ignore malformed cache */ }
  }

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };
  const isTimeLow = timeLeft <= 300;
  const isTimeCritical = timeLeft <= 60;

  // Anti-cheat
  const antiCheat = useAntiCheat({
    enabled: phase === "taking" || phase === "feedback",
    onZeroHearts: () => {
      setGameOver(true);
      say("scared", msgShocked("hearts"));
    },
  });

  function handleGameOverExit() {
    localStorage.removeItem(LS_KEY);
    setGameOver(false);
    // Force-complete the test: submit current progress to server
    forceCompleteMutation.mutate();
  }

  const lessonMap = new Map(lessons.map((l) => [l.id, l.title]));

  const [error, setError] = useState<string | null>(null);

  /* Start */
  const startMutation = useMutation({
    mutationFn: () => api.post("/adaptive/start", { moduleId, courseId }).then((r) => r.data as StartR),
    onSuccess: (data) => {
      setError(null);
      setSessionId(data.sessionId);
      setPassThreshold(data.passThreshold ?? 6);
      setMaxAbility(data.maxAbility ?? 10);
      setQuestion(data.question);
      setQIndex(data.questionIndex);
      setTotalQ(data.totalQuestions);
      setAbility(data.currentAbility);
      const expiresAt = Number(data.expiresAt || Date.now() + TEST_TIME_SECONDS * 1000);
      setTimeLeft(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
      setPhase("taking");
      setTimeout(() => antiCheat.requestFullscreen(), 100);
      // Save session to localStorage so student can resume after refresh
      localStorage.setItem(LS_KEY, JSON.stringify({
        sessionId: data.sessionId,
        courseId,
        moduleId,
        expiresAt,
      }));
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error || err?.message || "Không thể bắt đầu bài test.");
    },
  });

  /* Answer & next */
  const nextMutation = useMutation({
    mutationFn: (payload: { selectedIndex: number }) =>
      api.post("/adaptive/next", { sessionId, questionId: question!.id, selectedIndex: payload.selectedIndex }).then((r) => r.data as NextR),
    onSuccess: (data) => {
      // If game over exit was triggered, don't continue the test
      if (forceExitRef.current) { forceExitRef.current = false; return; }

      setError(null);
      setPrevAbility(ability);

      if (data.currentAnswer) {
        setFeedback(data.currentAnswer);
        setPhase("feedback");

        // Mascot phản ứng từng câu (cheer/sad).
        if (data.currentAnswer.isCorrect) say("cheer", msgCorrect());
        else say("sad", msgWrong());

        // Auto-advance after 2s
        timerRef.current = setTimeout(() => {
          if (data.complete && data.result) {
            localStorage.removeItem(LS_KEY);
            setResult(data.result);
            setAbility(data.result.abilityEnd);
            setPhase("result");
            // Mascot phản ứng kết thúc bài.
            const r = data.result;
            if (r.passed) say("celebrate", msgSolved({ score: r.correctCount, total: r.totalQuestions }));
            else say("sad", msgFail({ score: r.correctCount, total: r.totalQuestions }));
          } else if (data.question) {
            setQuestion(data.question);
            setQIndex(data.questionIndex!);
            if (data.currentAbility !== undefined) setAbility(data.currentAbility);
            setFeedback(null);
            setSelectedIndex(null);
            setPhase("taking");
          }
        }, 2000);
      }
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error || err?.message || "Lỗi khi xử lý câu trả lời.");
    },
  });

  const handleSelect = (index: number) => {
    if (selectedIndex !== null || nextMutation.isPending) return;
    setSelectedIndex(index);
    nextMutation.mutate({ selectedIndex: index });
  };

  const handleSkipFeedback = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (nextMutation.data?.complete && nextMutation.data.result) {
      setResult(nextMutation.data.result);
      setAbility(nextMutation.data.result.abilityEnd);
      setPhase("result");
    } else if (nextMutation.data?.question) {
      setQuestion(nextMutation.data.question);
      setQIndex(nextMutation.data.questionIndex!);
      if (nextMutation.data.currentAbility !== undefined) setAbility(nextMutation.data.currentAbility);
      setFeedback(null);
      setSelectedIndex(null);
      setPhase("taking");
    }
  };

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  /* Force-complete — called when hearts reach 0 */
  const forceCompleteMutation = useMutation({
    mutationFn: () => api.post(`/adaptive/${sessionId}/force-complete`).then((r) => r.data),
    onSuccess: (data: any) => {
      forceExitRef.current = false;
      if (data.result) {
        setResult(data.result);
        setAbility(data.result.abilityEnd);
        setPhase("result");
      } else {
        setPhase("intro");
      }
    },
    onError: () => {
      forceExitRef.current = false;
      setPhase("intro");
    },
  });

  /* Apply skip */
  const applyMutation = useMutation({
    mutationFn: () => api.post(`/adaptive/${sessionId}/apply`).then((r) => r.data),
    onSuccess: () => {
      localStorage.removeItem(LS_KEY);
      // Invalidate all curriculum/flat queries so the course page shows updated progress
      qc.invalidateQueries({ queryKey: ["course-flat-curriculum", courseId] });
      qc.invalidateQueries({ queryKey: ["course-all-lessons", courseId] });
      navigate(`/courses/${courseId}`);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error || "Không thể áp dụng kết quả vượt chương.");
    },
  });

  /* ── RESUMING ── */
  if (resuming) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <div className="animate-spin mx-auto h-10 w-10 rounded-full border-4 border-primary/20 border-t-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Đang khôi phục bài test...</p>
      </div>
    );
  }

  /* ── INTRO ── */
  if (phase === "intro") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <Button variant="ghost" onClick={() => navigate(`/courses/${courseId}`)} className="mb-4 text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Quay lại khóa học
        </Button>

        <div className="rounded-2xl border border-primary/20 bg-primary/10 p-8 sm:p-10 dark:border-primary/30 dark:bg-card">
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
              <Zap className="h-8 w-8" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Test vượt chương</p>
            <h1 className="mt-1 text-xl font-extrabold text-foreground dark:text-foreground">{mod?.title || "Chương"}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground dark:text-muted-foreground/40">
              Bài test thích ứng <span className="font-bold text-primary">25 câu</span> — độ khó tự điều chỉnh theo năng lực của bạn.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-3 text-center text-xs">
              <div className="rounded-xl bg-card/70 p-3 dark:bg-card/50">
                <Target className="mx-auto mb-1 h-5 w-5 text-primary" />
                <p className="font-semibold text-foreground/90 dark:text-foreground/90">Thích ứng</p>
                <p className="text-muted-foreground">Độ khó tăng/giảm theo bạn</p>
              </div>
              <div className="rounded-xl bg-card/70 p-3 dark:bg-card/50">
                <BarChart3 className="mx-auto mb-1 h-5 w-5 text-primary" />
                <p className="font-semibold text-foreground/90 dark:text-foreground/90">Đánh giá</p>
                <p className="text-muted-foreground">Ước tính năng lực thật</p>
              </div>
              <div className="rounded-xl bg-card/70 p-3 dark:bg-card/50">
                <BookOpen className="mx-auto mb-1 h-5 w-5 text-primary" />
                <p className="font-semibold text-foreground/90 dark:text-foreground/90">Vượt chương</p>
                <p className="text-muted-foreground">Đạt ≥ {passThreshold} để vượt · Tối đa {maxAbility}/10</p>
              </div>
            </div>

            {lessons.length > 0 && (
              <div className="mt-5 text-left text-xs text-muted-foreground dark:text-muted-foreground">
                <p className="font-semibold mb-1">Nội dung chương ({lessons.length} bài):</p>
                <ul className="space-y-0.5 pl-4 list-disc">
                  {lessons.map((l) => <li key={l.id}>{l.title}</li>)}
                </ul>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-500/10 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                {error}
              </div>
            )}

            <Button
              onClick={() => { setError(null); startMutation.mutate(); }}
              disabled={startMutation.isPending}
              className="mt-4 h-auto rounded-xl bg-primary px-6 py-3 font-semibold text-white shadow-md hover:bg-primary hover:shadow-lg active:scale-95"
            >
              {startMutation.isPending ? "Đang chuẩn bị..." : "Bắt đầu test"} <ChevronRight className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/adaptive-history?courseId=${courseId}`)}
              className="mt-3 text-xs font-medium text-muted-foreground hover:text-primary dark:text-muted-foreground dark:hover:text-primary"
            >
              <History className="h-3.5 w-3.5" /> Xem lịch sử test
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── TAKING / FEEDBACK ── */
  if ((phase === "taking" || phase === "feedback") && question) {
    const currentDifficulty = question.difficulty;
    return (
      <div className="mx-auto max-w-3xl px-4 py-4 sm:py-6">
        {/* Anti-cheat UI */}
        {!antiCheat.fullscreenActive && !gameOver && !fullscreenBypassed && (
          <FullscreenModal
            onEnter={antiCheat.requestFullscreen}
            onBypass={() => setFullscreenBypassed(true)}
          />
        )}
        {antiCheat.lastViolation && <ViolationToast reason={antiCheat.lastViolation} />}
        {gameOver && <GameOverModal mode="submit" onExit={handleGameOverExit} />}
        {/* Top bar */}
        <div className="mb-4 flex items-center justify-between gap-3 text-xs text-muted-foreground dark:text-muted-foreground">
          <span className="tabular-nums font-semibold">Câu {qIndex} / {totalQ}</span>
          <Hearts hearts={antiCheat.hearts} maxHearts={antiCheat.maxHearts} />
          {/* Timer */}
          <span className={`inline-flex items-center gap-1.5 tabular-nums font-bold ${isTimeCritical ? "animate-pulse text-red-600 dark:text-red-400" : isTimeLow ? "text-amber-600 dark:text-amber-400" : ""}`}>
            <Clock className={`h-3.5 w-3.5 ${isTimeCritical ? "text-red-500" : isTimeLow ? "text-amber-500" : ""}`} />
            {formatTime(timeLeft)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Stars difficulty={currentDifficulty} />
            <span className="text-muted-foreground/40 dark:text-muted-foreground">|</span>
            <span className="tabular-nums font-semibold">MLE {ability.toFixed(2)}</span>
          </span>
        </div>
        <AbilityMeter ability={ability} prevAbility={prevAbility} maxAbility={maxAbility} />

        {/* Question card */}
        <div className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm dark:border-border dark:bg-card sm:p-6">
          <div className="mb-1 flex items-start gap-2 text-base font-semibold leading-relaxed text-foreground dark:text-foreground">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary dark:bg-primary/15 dark:text-primary">
              {qIndex}
            </span>
            <div className="flex-1 min-w-0"><MdBlock content={question.question} /></div>
          </div>

          <div className="mt-5 space-y-2.5">
            {question.options.map((opt, oi) => {
              const isSelected = selectedIndex === oi;
              const isCorrectOption = feedback?.correctIndex === oi;
              let ringClass = "border-border bg-card dark:border-border dark:bg-transparent";
              if (feedback) {
                if (isCorrectOption) ringClass = "border-emerald-500 bg-emerald-500/10 dark:bg-emerald-950/20";
                else if (isSelected && !feedback.isCorrect) ringClass = "border-red-500 bg-red-500/10 dark:bg-red-950/20";
                else ringClass = "opacity-50 border-border";
              } else if (isSelected) {
                ringClass = "border-primary bg-primary/10 dark:bg-primary/15";
              }

              return (
                <Button
                  key={oi}
                  variant="ghost"
                  disabled={!!feedback}
                  onClick={() => handleSelect(oi)}
                  className={`w-full justify-start gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition-all duration-200 ${ringClass} ${!feedback ? "hover:border-primary/30 hover:bg-muted dark:hover:bg-muted/50" : ""}`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${isSelected && !feedback ? "bg-primary text-white" : feedback && isCorrectOption ? "bg-emerald-600 text-white" : feedback && isSelected && !feedback.isCorrect ? "bg-red-500 text-white" : "border-2 border-border text-muted-foreground dark:border-border dark:text-muted-foreground"}`}>
                    {String.fromCharCode(65 + oi)}
                  </span>
                  <span className="flex-1 min-w-0"><MdInline content={opt} /></span>
                  {feedback && isCorrectOption && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />}
                  {feedback && isSelected && !feedback.isCorrect && <XCircle className="h-5 w-5 shrink-0 text-red-500" />}
                </Button>
              );
            })}
          </div>

          {/* Feedback overlay */}
          {feedback && (
            <div className="mt-4 animate-slide-up rounded-xl bg-muted/40 p-4 dark:bg-background/50">
              <div className="flex items-center gap-2 mb-1">
                {feedback.isCorrect ? (
                  <><CheckCircle2 className="h-5 w-5 text-emerald-500" /><span className="font-bold text-emerald-700 dark:text-emerald-400">Chính xác!</span></>
                ) : (
                  <><XCircle className="h-5 w-5 text-red-500" /><span className="font-bold text-red-700 dark:text-red-400">Sai rồi!</span></>
                )}
              </div>
              {feedback.explanation && (
                <div className="text-sm text-muted-foreground dark:text-muted-foreground/40">
                  <MdInline content={feedback.explanation} />
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkipFeedback}
                className="mt-2 text-xs font-medium text-primary hover:text-primary dark:text-primary"
              >
                Tiếp tục ngay →
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── RESULT ── */
  if (phase === "result" && result) {
    const { passed, partialPass, abilityEnd, correctCount, totalQuestions, accuracyPercent, skipableLessonIds, requiredLessonIds, lessonBreakdown } = result;
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        {/* Score banner */}
        <div className={`rounded-2xl border border-border p-6 sm:p-8 ${passed ? "border-emerald-200 bg-emerald-500/10 dark:border-emerald-900/50 dark:bg-card" : partialPass ? "border-amber-200 bg-amber-500/10 dark:border-amber-900/50 dark:bg-card" : "border-red-200 bg-red-500/10 dark:border-red-900/50 dark:bg-card"}`}>
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
            <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
              <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={54} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted dark:text-muted" />
                <circle cx="60" cy="60" r={54} fill="none" stroke={passed ? "#10b981" : partialPass ? "#f59e0b" : "#ef4444"} strokeWidth="8" strokeLinecap="round" strokeDasharray={2 * Math.PI * 54} strokeDashoffset={2 * Math.PI * 54 * (1 - accuracyPercent / 100)} className="transition-all duration-1000 ease-out" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-extrabold tabular-nums ${passed ? "text-emerald-600" : partialPass ? "text-amber-600" : "text-red-600"}`}>{accuracyPercent}%</span>
                <span className="text-xs text-muted-foreground tabular-nums">{correctCount}/{totalQuestions}</span>
              </div>
            </div>
            <div className="text-center sm:text-left">
              <h3 className={`text-xl font-extrabold ${passed ? "text-emerald-700" : partialPass ? "text-amber-700" : "text-red-700"}`}>
                {passed ? "🎉 Xuất sắc! Bạn có thể vượt toàn bộ chương!" : partialPass ? "👍 Khá! Bạn có thể vượt một phần chương." : `💪 Chưa đạt — cần đúng ≥ 22/25 câu (sai tối đa 3 câu).`}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground">
                Đúng {correctCount}/{totalQuestions} câu ({accuracyPercent}%){passed ? " — đủ điều kiện vượt chương (≥88%)" : partialPass ? " — đủ điều kiện vượt một phần (≥60%)" : ` — còn thiếu ${22 - correctCount} câu đúng nữa`}
              </p>
            </div>
          </div>
        </div>

        {/* Lesson breakdown */}
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm dark:border-border dark:bg-card">
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Kết quả từng bài</h4>
          <div className="space-y-1.5">
            {Object.entries(lessonBreakdown).map(([lid, perf]) => {
              const canSkip = skipableLessonIds.includes(lid);
              return (
                <div key={lid} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${canSkip ? "bg-emerald-500/10 dark:bg-emerald-950/20" : "bg-muted/40 dark:bg-background/30"}`}>
                  {canSkip ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="flex-1 font-medium text-foreground/90 dark:text-foreground/90">{lessonMap.get(lid) || lid}</span>
                  <span className={`tabular-nums font-semibold ${canSkip ? "text-emerald-600" : "text-muted-foreground"}`}>{perf.correct}/{perf.total} ({perf.percent}%)</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Answer review — accordion */}
        {result.answers.length > 0 && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm dark:border-border dark:bg-card">
            <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Xem lại câu hỏi</h4>
            <div className="space-y-2">
              {result.answers.map((a: any, i: number) => {
                const isOpen = expandedIdx === i;
                return (
                  <div key={i} className={`rounded-xl border transition-all duration-200 ${a.isCorrect ? "border-emerald-100 dark:border-emerald-900/40" : "border-red-100 dark:border-red-900/40"} ${isOpen ? "shadow-sm" : ""}`}>
                    <Button
                      variant="ghost"
                      onClick={() => setExpandedIdx((prev) => (prev === i ? null : i))}
                      className="w-full justify-start gap-3 px-4 py-3 text-left"
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${a.isCorrect ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>
                        {a.isCorrect ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-medium text-foreground dark:text-foreground">
                        <span className="text-muted-foreground">Câu {i + 1}.</span>{" "}
                        <MdInline content={a.question || `Câu ${i + 1}`} />
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                    </Button>
                    {isOpen && (
                      <div className="animate-slide-up border-t border-border px-4 pb-4 pt-3 dark:border-border">
                        <div className="pl-10 space-y-2">
                          {a.options && a.options.length > 0 && (
                            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                              {a.options.map((opt: string, oi: number) => {
                                const isCorrectOpt = oi === a.correctIndex;
                                const isSelected = oi === a.selectedIndex;
                                let cls = "border-border bg-card text-muted-foreground dark:border-border dark:bg-transparent dark:text-muted-foreground";
                                if (isCorrectOpt) cls = "border-emerald-400 bg-emerald-500/10 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300";
                                else if (isSelected && !a.isCorrect) cls = "border-red-400 bg-red-500/10 text-red-800 dark:bg-red-950/30 dark:text-red-300";
                                return (
                                  <div key={oi} className={`flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs ${cls}`}>
                                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isCorrectOpt ? "bg-emerald-500 text-white" : isSelected ? "bg-red-500 text-white" : "bg-border text-muted-foreground"}`}>
                                      {String.fromCharCode(65 + oi)}
                                    </span>
                                    <span className="flex-1 min-w-0"><MdInline content={opt} /></span>
                                    {isCorrectOpt && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                                    {isSelected && !isCorrectOpt && <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {!a.isCorrect && (
                            <div className="flex items-start gap-2 text-sm">
                              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                              <div>
                                <span className="text-xs font-semibold uppercase text-red-600">Bạn chọn: </span>
                                <span className="text-foreground/90 dark:text-muted-foreground/40"><MdInline content={a.options?.[a.selectedIndex] ?? "—"} /></span>
                              </div>
                            </div>
                          )}
                          <div className="flex items-start gap-2 text-sm">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                            <div>
                              <span className="text-xs font-semibold uppercase text-emerald-600">Đáp án đúng: </span>
                              <span className="text-foreground/90 dark:text-muted-foreground/40"><MdInline content={a.options?.[a.correctIndex] ?? "—"} /></span>
                            </div>
                          </div>
                          {a.explanation && (
                            <div className="mt-2 rounded-lg bg-primary/10 px-3 py-2 text-xs text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
                              <span className="font-semibold">💡 Giải thích: </span>
                              <MdInline content={a.explanation} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {(passed || partialPass) && (
            <Button
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
              className="h-auto rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white shadow-md hover:bg-emerald-700"
            >
              {applyMutation.isPending ? "Đang áp dụng..." : `Vượt ${skipableLessonIds.length} bài`} <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => navigate(`/courses/${courseId}`)}
            className="h-auto gap-2 rounded-xl px-5 py-3 font-semibold"
          >
            <ArrowLeft className="h-4 w-4" /> Về khóa học
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
