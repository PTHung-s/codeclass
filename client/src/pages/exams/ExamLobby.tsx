import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import { ArrowLeft, Clock, Play, Shield, FileQuestion, Eye } from "lucide-react";
import ExamMarkdown from "../../components/ui/ExamMarkdown";

export default function ExamLobby() {
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
    retry: false,
  });

  const startMut = useMutation({
    mutationFn: () => api.post(`/exams/${examId}/attempt/start`).then((r) => r.data),
    onSuccess: () => navigate(`/exams/${examId}/take`),
    onError: (err: any) => alert(err?.response?.data?.error || "Không vào thi được"),
  });

  const exam = examQ.data;
  if (examQ.isLoading) return <div className="p-6 text-muted-foreground">Đang tải…</div>;
  if (!exam) return <div className="p-6 text-destructive">Không tìm thấy đề</div>;

  const attempt = attemptQ.data;
  const done = attempt && (attempt.status === "submitted" || attempt.status === "expired");
  const canResume = attempt && attempt.status === "in_progress";
  const qs = exam.questions || [];
  const counts = {
    mcq: qs.filter((q: any) => q.loai === "trac_nghiem").length,
    short: qs.filter((q: any) => q.loai === "tra_loi_ngan").length,
    code: qs.filter((q: any) => q.loai === "thuc_hanh").length,
  };
  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" className="-ml-2 mb-4" onClick={() => navigate("/exams")}>
        <ArrowLeft className="h-4 w-4" /> Danh sách
      </Button>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Phòng thi · {exam.status}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{exam.title}</h1>
        {exam.description && (
          <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
            <ExamMarkdown content={exam.description} compact />
          </div>
        )}

        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <dt className="text-xs text-muted-foreground">Thời gian làm</dt>
              <dd className="font-medium">{exam.durationMinutes} phút · thang {exam.scale ?? 100}</dd>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <FileQuestion className="h-4 w-4 text-muted-foreground" />
            <div>
              <dt className="text-xs text-muted-foreground">Số câu</dt>
              <dd className="font-medium">
                {qs.length || exam.questionCount || "—"}
                {qs.length > 0 && (
                  <span className="font-normal text-muted-foreground">
                    {" "}({counts.mcq} TN · {counts.short} ngắn · {counts.code} code)
                  </span>
                )}
              </dd>
            </div>
          </div>
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs sm:col-span-2">
            <div>Mở: <strong className="text-foreground">{fmt(exam.openAt)}</strong></div>
            <div className="mt-0.5">Đóng đăng ký: <strong className="text-foreground">{fmt(exam.closeAt)}</strong></div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 sm:col-span-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <div>
              <dt className="text-xs text-muted-foreground">Giám sát</dt>
              <dd className="font-medium">
                {exam.antiCheatMode === "nghiem"
                  ? "Chế độ nghiêm — fullscreen, ghi nhận rời tab / copy; quá vi phạm sẽ nộp bài"
                  : "Ghi nhận sự kiện (không chặn)"}
              </dd>
            </div>
          </div>
        </dl>

        <ul className="mt-6 list-inside list-disc space-y-1 text-sm text-muted-foreground">
          <li>Mỗi học sinh một lượt thi; có thể vào lại trong thời gian còn lại.</li>
          <li>Câu code chỉ chạy được test mẫu; chấm full sau khi nộp.</li>
          <li>Hết giờ hệ thống khóa bài tự động.</li>
        </ul>

        <div className="mt-8 flex flex-wrap gap-2">
          {done ? (
            <>
              <p className="w-full text-sm">Bạn đã nộp bài ({attempt.status}).</p>
              {(exam.showResults || staff) && (
                <Button onClick={() => navigate(`/exams/${examId}/result`)}>Xem kết quả</Button>
              )}
            </>
          ) : canResume ? (
            <Button onClick={() => navigate(`/exams/${examId}/take`)}>
              <Play className="h-4 w-4" /> Tiếp tục làm bài
            </Button>
          ) : (
            <Button onClick={() => startMut.mutate()} disabled={startMut.isPending || (!staff && exam.status !== "published")}>
              <Play className="h-4 w-4" /> {startMut.isPending ? "Đang vào…" : "Bắt đầu làm bài"}
            </Button>
          )}
          {staff && (
            <Button variant="outline" onClick={() => navigate(`/exams/${examId}/preview`)}>
              <Eye className="h-4 w-4" /> Xem trước (góc nhìn học sinh)
            </Button>
          )}
          {staff && (
            <Button variant="outline" onClick={() => navigate(`/exams/${examId}/edit`)}>
              Quản lý đề
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
