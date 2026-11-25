import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import QuestionPaperView, { buildDisplayPaper } from "../../components/exams/QuestionPaperView";
import ExamMarkdown from "../../components/ui/ExamMarkdown";
import { ArrowLeft, Trophy, Eye } from "lucide-react";

export default function ExamResult() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const staff = isStaff(user?.role);

  const examQ = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => api.get(`/exams/${examId}`).then((r) => r.data),
    enabled: !!examId,
  });

  const attemptQ = useQuery({
    queryKey: ["exam-attempt", examId],
    queryFn: () => api.get(`/exams/${examId}/attempt/me`).then((r) => r.data),
    enabled: !!examId,
  });

  const reviewQ = useQuery({
    queryKey: ["exam-review", examId],
    queryFn: () => api.get(`/exams/${examId}/attempt/review`).then((r) => r.data),
    enabled: !!examId && !staff,
  });
  // GV dùng dữ liệu từ attempt/me (đã có grades + teacherNote)
  const exam = examQ.data;
  const attempt = attemptQ.data;
  const review = staff ? null : reviewQ.data;

  const show = staff || exam?.showResults;
  const canSeeAnswers = staff || Boolean(review?.canSeeAnswers);
  const pending = Boolean(attempt?.pendingShortReview || attempt?.gradeStatus === "needs_review");
  const scaled =
    attempt?.scaledTotalScore != null
      ? { total: attempt.scaledTotalScore, max: attempt.scaledMaxScore ?? exam?.scale ?? 100 }
      : null;

  const paperSource = useMemo(() => {
    if (staff) {
      // GV xem bài của chính mình: dùng attempt/me (đã có grades)
      return {
        snapshot: (attempt?.contentSnapshot || []) as any[],
        raws: ((exam?.questions || []) as any[]).map((q) => ({
          id: q.id,
          dap_an_index: q.dap_an_index,
          explanation: q.explanation,
        })),
        answers: (attempt?.answers || []) as any[],
      };
    }
    return {
      snapshot: (review?.snapshot || []) as any[],
      raws: ((review?.questionsMeta || []) as any[]).map((m) => ({
        id: m.id,
        dap_an_index: m.correctIndex,
        explanation: m.explanation,
      })),
      answers: (review?.answers || []) as any[],
    };
  }, [staff, attempt, review, exam]);

  const answersByQid = useMemo(
    () => new Map<string, any>(paperSource.answers.map((a) => [a.questionId, a])),
    [paperSource],
  );

  const paper = useMemo(
    () => buildDisplayPaper(paperSource.snapshot, paperSource.raws, answersByQid),
    [paperSource, answersByQid],
  );

  if (examQ.isLoading || attemptQ.isLoading) {
    return <div className="p-6 text-muted-foreground">Đang tải…</div>;
  }

  const scrollToQ = (i: number) => {
    document.getElementById(`rev-q-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Button variant="ghost" size="sm" className="-ml-2 mb-4" onClick={() => navigate("/exams")}>
        <ArrowLeft className="h-4 w-4" /> Danh sách đề
      </Button>

      {/* Tổng kết */}
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-card">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Trophy className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-xl font-semibold">Đã ghi nhận bài thi</h1>
        <p className="mt-1 text-sm text-muted-foreground">{exam?.title}</p>
        {attempt && (
          <p className="mt-4 text-sm">
            Trạng thái: <strong>{attempt.status}</strong>
            {attempt.submittedAt && <> · nộp {new Date(attempt.submittedAt).toLocaleString()}</>}
          </p>
        )}
        {show && scaled ? (
          <>
            <p className="mt-4 text-3xl font-bold tracking-tight">
              {scaled.total}
              <span className="text-lg font-medium text-muted-foreground">/{scaled.max}</span>
            </p>
            {attempt.totalScore != null && attempt.maxScore != null && exam?.scale && exam.scale !== attempt.maxScore && (
              <p className="mt-1 text-xs text-muted-foreground">
                Điểm thô: {attempt.totalScore}/{attempt.maxScore} (thang {exam.scale})
              </p>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Điểm chi tiết sẽ hiện khi giáo viên mở xem kết quả / hoàn tất chấm.
          </p>
        )}
        {show && pending && (
          <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            Có câu trả lời ngắn đang chờ giáo viên duyệt — tổng điểm có thể còn thay đổi.
          </p>
        )}
        {show && attempt?.gradeStatus && (
          <p className="mt-2 text-xs text-muted-foreground">Chấm: {attempt.gradeStatus}</p>
        )}

        {/* Nhận xét riêng lẻ — chỉ khi chưa mở xem lại bài (nếu mở rồi thì note nằm trong từng câu bên dưới) */}
        {show && !canSeeAnswers && (attempt?.answers || []).some((a: any) => (a.teacherNote || "").trim()) && (
          <div className="mt-5 space-y-2 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Nhận xét của giáo viên
            </p>
            {(attempt.answers || [])
              .filter((a: any) => (a.teacherNote || "").trim())
              .map((a: any) => {
                const q = (exam?.questions || []).find((x: any) => x.id === a.questionId);
                return (
                  <div key={a.questionId} className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                    <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                      {q?.ma_cau || a.questionId.slice(0, 8)}
                    </p>
                    <p className="whitespace-pre-wrap">{a.teacherNote}</p>
                  </div>
                );
              })}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {(staff || exam?.showRanking) && (
            <Button variant="outline" onClick={() => navigate(`/exams/${examId}/ranking`)}>
              <Trophy className="h-4 w-4" /> Bảng xếp hạng
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate(`/exams/${examId}`)}>Lobby</Button>
          <Button onClick={() => navigate("/exams")}>Về danh sách</Button>
        </div>
      </div>

      {/* Xem lại bài làm chi tiết */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Eye className="h-5 w-5" /> Xem lại bài làm
          </h2>
          {!canSeeAnswers && (
            <span className="text-xs italic text-muted-foreground">Giáo viên chưa mở phần này</span>
          )}
        </div>

          {canSeeAnswers && paper.length > 0 ? (
            <>
              <div className="mb-4 grid grid-cols-10 gap-1.5 sm:grid-cols-12">
                {paper.map((p, i) => {
                  const isMcq = p.q.loai === "trac_nghiem";
                  const selOk =
                    isMcq && p.answer.selectedIndex != null && p.answer.selectedIndex === p.correctIndex;
                  const selBad =
                    isMcq && p.answer.selectedIndex != null && p.answer.selectedIndex !== p.correctIndex;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      title={`Câu ${i + 1}`}
                      onClick={() => scrollToQ(i)}
                      className={`relative h-8 w-8 rounded-lg border text-[11px] font-semibold ${
                        selOk
                          ? "border-emerald-500/50 bg-emerald-500/15"
                          : selBad
                            ? "border-destructive/50 bg-destructive/10"
                            : p.answer.selectedIndex != null ||
                                (p.answer.textAnswer || "").trim() ||
                                (p.answer.codeAnswer || "").trim()
                              ? "border-emerald-500/40 bg-emerald-500/10"
                              : "border-border bg-card"
                      }`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              <div className="space-y-4">
                {paper.map((p, i) => (
                  <div key={p.key} id={`rev-q-${i}`}>
                    <QuestionPaperView idx={i} q={p.q} answer={p.answer} correctIndex={p.correctIndex}>
                      <div className="mt-4 space-y-2 rounded-xl border border-primary/20 bg-primary/[0.03] p-3 text-sm">
                        {p.scoreInfo && (
                          <p className="text-xs">
                            Điểm:{" "}
                            <strong>
                              {p.scoreInfo.finalScore ?? p.scoreInfo.autoScore ?? "?"}
                            </strong>{" "}
                            / {p.scoreInfo.maxScore ?? "?"}
                          </p>
                        )}
                        {(answersByQid.get(p.key)?.teacherNote || "").trim() ? (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Nhận xét của giáo viên
                            </p>
                            <p className="whitespace-pre-wrap text-sm">
                              {answersByQid.get(p.key)?.teacherNote}
                            </p>
                          </div>
                        ) : null}
                        {p.explanation ? (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Giải thích
                            </p>
                            <ExamMarkdown content={p.explanation} compact />
                          </div>
                        ) : null}
                      </div>
                    </QuestionPaperView>
                  </div>
                ))}
              </div>
            </>
          ) : (
            paperSource.snapshot.length ? (
              <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                Bài của bạn đã sẵn sàng — điểm và đáp án chi tiết sẽ hiển thị khi giáo viên bật
                “Cho HS xem lại bài làm”.
              </p>
            ) : null
          )}
        </div>
    </div>
  );
}
