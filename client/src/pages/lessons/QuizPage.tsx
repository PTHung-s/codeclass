import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api from "../../lib/api";
import QuizWidget from "../../components/ui/QuizWidget";
import { ArrowLeft, ArrowRight, CheckCircle2, Lock, History } from "lucide-react";
import { Button } from "../../components/ui/button";

export default function QuizPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [passed, setPassed] = useState(false);

  const lessonQ = useQuery({
    queryKey: ["lesson", lessonId],
    queryFn: () => api.get(`/lessons/${lessonId}`).then((r) => r.data),
    enabled: !!lessonId,
  });
  const courseId = lessonQ.data?.courseId;
  const flatQ = useQuery<any[]>({
    queryKey: ["quiz-flat", courseId],
    queryFn: () => api.get(`/courses/${courseId}/lessons/flat`).then((r) => r.data),
    enabled: !!courseId,
  });

  const markRead = useMutation({
    mutationFn: () => api.post(`/lessons/${lessonId}/progress`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey.some((k) => typeof k === "string" && (k.includes("flat") || k === "quizzes")) });
      setPassed(true);
    },
  });

  const lesson = lessonQ.data;
  const current = flatQ.data?.find((l) => l.id === lessonId);
  const isLocked = !!current?.locked;
  const idx = flatQ.data ? flatQ.data.findIndex((l) => l.id === lessonId) : -1;
  const next = idx >= 0 && flatQ.data ? flatQ.data[idx + 1] : null;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm"
            onClick={() => navigate(`/lessons/${lessonId}`)}
            className="-ml-2 px-2 text-muted-foreground hover:bg-transparent hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Quay lại
          </Button>
          {courseId && (
            <Button variant="ghost" size="sm"
              onClick={() => navigate(`/adaptive-history?courseId=${courseId}`)}
              className="ml-auto text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              <History className="h-3 w-3" /> Lịch sử
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Bài kiểm tra</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">{lesson?.title}</h1>
      </div>

      {isLocked ? (
        <section className="rounded-xl border border-border bg-card p-8 text-center shadow-card">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold tracking-tight text-foreground">Bài kiểm tra chưa mở khóa</h3>
          <p className="mt-1 text-sm text-muted-foreground">Bạn cần hoàn thành bài kiểm tra của bài trước trước.</p>
          <Button variant="outline" onClick={() => navigate(`/lessons/${lessonId}`)} className="mt-4">Quay lại bài học</Button>
        </section>
      ) : (
        lessonId && <QuizWidget lessonId={lessonId} onPassed={() => markRead.mutate()} />
      )}

      {passed && (
        <section className="result-in mt-8 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-6 text-center shadow-card">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 ring-4 ring-emerald-500/10">
            <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold tracking-tight text-foreground">Đã hoàn thành bài học!</h3>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => navigate(`/lessons/${lessonId}`)}>Xem lại bài học</Button>
            {next && (
              <Button variant="default" onClick={() => navigate(`/lessons/${next.id}`)}>
                Bài tiếp theo <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
