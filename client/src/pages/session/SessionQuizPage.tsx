import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Info } from "lucide-react";
import { useState } from "react";
import api from "../../lib/api";
import { useAntiCheat } from "../../hooks/useAntiCheat";
import {
  FullscreenModal,
  GameOverModal,
  Hearts,
  ViolationToast,
  AwayCountdownToast,
} from "../../components/ui/AntiCheat";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { cn } from "../../lib/utils";

export default function SessionQuizPage() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();

  const lessonQ = useQuery<any>({
    queryKey: ["session-lesson", lessonId],
    queryFn: () => api.get(`/session-course/lesson/${lessonId}`).then((r) => r.data),
    enabled: !!lessonId,
  });
  const qzQ = useQuery<any>({
    queryKey: ["session-quiz-questions", lessonId],
    queryFn: () => api.get(`/session-course/lesson/${lessonId}/quiz`).then((r) => r.data),
    enabled: !!lessonId,
  });

  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [cur, setCur] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [gameOver, setGameOver] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      api
        .post(`/session-course/lesson/${lessonId}/quiz`, {
          answers: questions.map((_: any, i: number) =>
            answers[i] !== undefined ? answers[i] : null,
          ),
        })
        .then((r) => r.data),
    onSuccess: (res: any) => setResult(res),
    onError: (err: any) => alert(err.response?.data?.error || "Không nộp được quiz"),
  });

  const antiCheat = useAntiCheat({
    enabled: !result && (qzQ.data?.quiz?.length || 0) > 0,
    onZeroHearts: () => {
      setGameOver(true);
      submit.mutate();
    },
  });

  const loading = lessonQ.isLoading || qzQ.isLoading;
  const error = lessonQ.isError || qzQ.isError;
  if (loading || error || !lessonQ.data) {
    return (
      <div className="mx-auto max-w-5xl py-16 text-center text-sm text-muted-foreground">
        {loading ? "Đang tải..." : "Không tải được quiz."}
      </div>
    );
  }

  const { lesson } = lessonQ.data;
  const questions: any[] = qzQ.data?.quiz ?? [];

  const handleSubmit = () => submit.mutate();

  const handleRetry = () => {
    setResult(null);
    setAnswers({});
    setCur(0);
    setGameOver(false);
    antiCheat.resetHearts();
  };

  const renderResult = () => {
    const percent = result.percent ?? 0;
    const passed = result.passed;
    return (
      <div className="result-in mt-6 rounded-xl border border-border bg-card p-10 text-center shadow-sm">
        <div
          className={cn(
            "mx-auto flex h-16 w-16 items-center justify-center rounded-full",
            passed ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          )}
        >
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground">Quiz hoàn thành</h2>
        <p className="mt-2 text-lg tabular-nums text-muted-foreground">
          {result.score} / {result.total} ({percent}%)
        </p>
        <p
          className={cn(
            "mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold sm:text-sm",
            percent >= (result.passScore ?? 70)
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
          )}
        >
          {percent >= (result.passScore ?? 70)
            ? "✓ Buổi học đã được Verified"
            : "Chưa đạt — làm lại để hoàn thành"}
        </p>
        {(result.xpAwarded > 0 || result.tokensAwarded > 0) && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
            {result.xpAwarded > 0 && (
              <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-primary">
                +{result.xpAwarded} XP
              </span>
            )}
            {result.tokensAwarded > 0 && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-amber-700 dark:text-amber-300">
                +{result.tokensAwarded} tokens
              </span>
            )}
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {!passed ? (
            <Button variant="outline" onClick={handleRetry}>
              Làm lại
            </Button>
          ) : null}
          <Button onClick={() => navigate(`/course/${courseId}`)}>
            Tiếp tục <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {!antiCheat.fullscreenActive && !result && !gameOver && questions.length > 0 ? (
        <FullscreenModal onEnter={antiCheat.requestFullscreen} />
      ) : null}
      {antiCheat.lastViolation ? <ViolationToast reason={antiCheat.lastViolation} /> : null}
      {antiCheat.awayCountdown !== null ? (
        <AwayCountdownToast seconds={antiCheat.awayCountdown} />
      ) : null}
      {gameOver ? (
        <GameOverModal
          mode="submit"
          onExit={() => {
            setGameOver(false);
          }}
        />
      ) : null}

      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        onClick={() => navigate(`/course/${courseId}/lesson/${lessonId}`)}
      >
        <ArrowLeft className="h-4 w-4" /> Quay lại buổi học
      </Button>

      <Card>
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Bài kiểm tra · Buổi {String(lesson.orderIndex).padStart(2, "0")}
              </p>
              <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                {lesson.title}
              </h1>
            </div>
            {!result && questions.length > 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2">
                <span className="text-xs font-semibold text-primary">Sinh lực:</span>
                <Hearts hearts={antiCheat.hearts} maxHearts={antiCheat.maxHearts} />
              </div>
            ) : null}
          </div>

          {result ? (
            renderResult()
          ) : questions.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/40 p-10 text-center text-muted-foreground">
              Quiz chưa được giáo viên soạn xong.
            </div>
          ) : (
            <QuizBody
              questions={questions}
              answers={answers}
              setAnswers={setAnswers}
              cur={cur}
              setCur={setCur}
              onSubmit={handleSubmit}
              submitting={submit.isPending}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QuizBody({
  questions,
  answers,
  setAnswers,
  cur,
  setCur,
  onSubmit,
  submitting,
}: any) {
  const q = questions[cur];
  const total = questions.length;
  const answered = Object.values(answers).filter((v) => v !== null && v !== undefined).length;

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3.5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Bài kiểm tra bắt buộc</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {total} câu hỏi · cần hoàn thành để mở khóa buổi tiếp theo
          </p>
        </div>
        <div className="min-w-[200px]">
          <div className="text-right text-xs font-semibold text-foreground tabular-nums">
            Câu {cur + 1} / {total} · đã chọn {answered}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${((cur + 1) / total) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold tabular-nums text-primary-foreground shadow-sm">
            {cur + 1}
          </div>
          <h3 className="pt-0.5 text-base font-semibold tracking-tight text-foreground">{q.question}</h3>
        </div>
        <div className="mt-4 space-y-2">
          {q.options.map((opt: string, i: number) => {
            const selected = answers[cur] === i;
            return (
              <button
                key={i}
                onClick={() => setAnswers((prev: any) => ({ ...prev, [cur]: i }))}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-all duration-150",
                  selected
                    ? "option-selected border-primary bg-primary/10 text-foreground shadow-sm"
                    : "border-border bg-card text-foreground hover:border-primary/30 hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-semibold transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="min-w-0 flex-1 leading-snug">{opt}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3.5 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Chọn đáp án đúng nhất rồi nhấn tiếp tục.
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => setCur((c: number) => Math.max(0, c - 1))}
            disabled={cur === 0}
          >
            <ArrowLeft className="h-4 w-4" />
            Câu trước
          </Button>
          <Button
            onClick={() => (cur < total - 1 ? setCur((c: number) => c + 1) : onSubmit())}
            disabled={answers[cur] === undefined || submitting}
          >
            {submitting ? "Đang nộp..." : cur < total - 1 ? "Tiếp tục" : "Nộp bài"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
