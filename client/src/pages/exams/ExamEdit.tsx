import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import ExamMarkdown from "../../components/ui/ExamMarkdown";
import {
  ArrowLeft, CheckCircle2, Clock, Eye, FlaskConical, Radar, Save, Send, Trophy, XCircle,
} from "lucide-react";

const LOAI_LABEL: Record<string, string> = {
  trac_nghiem: "Trắc nghiệm",
  tra_loi_ngan: "Trả lời ngắn",
  thuc_hanh: "Thực hành",
};

export default function ExamEdit() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const examQ = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => api.get(`/exams/${examId}`).then((r) => r.data),
    enabled: !!examId,
  });

  const exam = examQ.data;
  const [title, setTitle] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [antiCheat, setAntiCheat] = useState<string | null>(null);
  const [showResults, setShowResults] = useState<boolean | null>(null);
  const [showRanking, setShowRanking] = useState<boolean | null>(null);
  const [showReview, setShowReview] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const displayTitle = title ?? exam?.title ?? "";
  const displayDuration = duration ?? exam?.durationMinutes ?? 60;
  const displayAnti = antiCheat ?? exam?.antiCheatMode ?? "nghiem";
  const displayShow = showResults ?? exam?.showResults ?? false;
  const displayRanking = showRanking ?? exam?.showRanking ?? false;
  const displayReview = showReview ?? exam?.showReview ?? false;

  const saveMut = useMutation({
    mutationFn: () =>
      api.patch(`/exams/${examId}`, {
        title: displayTitle,
        durationMinutes: displayDuration,
        antiCheatMode: displayAnti,
        showResults: displayShow,
        showRanking: displayRanking,
        showReview: displayReview,
      }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exam", examId] });
      setMsg("Đã lưu");
    },
  });

  const publishMut = useMutation({
    mutationFn: (force: boolean) => api.post(`/exams/${examId}/publish`, { force }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exam", examId] });
      setMsg("Đã mở đề");
    },
    onError: (err: any) => setMsg(err?.response?.data?.error || "Mở đề thất bại"),
  });

  const closeMut = useMutation({
    mutationFn: () => api.post(`/exams/${examId}/close`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exam", examId] });
      setMsg("Đã đóng đề");
    },
  });

  const codingQs = useMemo(
    () => (exam?.questions || []).filter((q: any) => q.loai === "thuc_hanh"),
    [exam],
  );

  if (examQ.isLoading) return <div className="p-6 text-sm text-muted-foreground">Đang tải…</div>;
  if (!exam) return <div className="p-6 text-sm text-destructive">Không tìm thấy đề</div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <Button variant="ghost" size="sm" className="-ml-2 mb-3" onClick={() => navigate("/exams")}>
        <ArrowLeft className="h-4 w-4" /> Danh sách
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Soạn đề · {exam.status}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{exam.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/exams/${examId}/testcases`)}>
            <FlaskConical className="h-4 w-4" /> Testcase
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/exams/${examId}/monitor`)}>
            <Radar className="h-4 w-4" /> Monitor
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/exams/${examId}/grading`)}>
            <CheckCircle2 className="h-4 w-4" /> Chấm điểm
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/exams/${examId}/ranking`)}>
            <Trophy className="h-4 w-4" /> Xếp hạng
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/exams/${examId}/preview`)}>
            <Eye className="h-4 w-4" /> Preview HS
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/exams/${examId}`)}>
            <Eye className="h-4 w-4" /> Lobby HS
          </Button>
        </div>
      </div>

      {msg && <p className="mt-3 text-sm text-muted-foreground">{msg}</p>}

      <section className="mt-6 space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="font-semibold">Cấu hình</h2>
        <label className="block text-xs text-muted-foreground">Tiêu đề
          <input
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={displayTitle}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs text-muted-foreground">Thời gian (phút)
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={displayDuration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </label>
          <label className="block text-xs text-muted-foreground">Chống gian lận
            <select
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={displayAnti}
              onChange={(e) => setAntiCheat(e.target.value)}
            >
              <option value="nghiem">Nghiêm</option>
              <option value="ghi_log">Chỉ ghi log</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input
              type="checkbox"
              checked={displayShow}
              onChange={(e) => setShowResults(e.target.checked)}
            />
            Cho HS xem điểm
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={displayRanking}
              onChange={(e) => setShowRanking(e.target.checked)}
            />
            Công bố bảng xếp hạng cho HS
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={displayReview}
              onChange={(e) => setShowReview(e.target.checked)}
            />
            Cho HS xem lại bài làm (đúng/sai + giải thích)
          </label>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            <Save className="h-4 w-4" /> Lưu
          </Button>
          <Button size="sm" variant="default" onClick={() => publishMut.mutate(false)} disabled={publishMut.isPending}>
            <Send className="h-4 w-4" /> Mở đề
          </Button>
          <Button size="sm" variant="outline" onClick={() => publishMut.mutate(true)}>
            Mở đề (force)
          </Button>
          <Button size="sm" variant="destructive" onClick={() => closeMut.mutate()}>
            <XCircle className="h-4 w-4" /> Đóng đề
          </Button>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-semibold">Câu hỏi ({exam.questions?.length || 0})</h2>
        <div className="space-y-3">
          {(exam.questions || []).map((q: any, idx: number) => {
            const hiddenApproved = (q.testcase_an || []).filter((t: any) => t.status === "da_duyet").length;
            const hiddenTotal = (q.testcase_an || []).length;
            return (
              <div key={q.id} className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
                {/* Header giống màn hình thi */}
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-sm font-bold text-foreground">Câu {idx + 1}</span>
                  <span className="font-mono text-[10px]">{q.ma_cau}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5">{LOAI_LABEL[q.loai] || q.loai}</span>
                  <span>{q.diem} điểm</span>
                  <span>độ khó {q.do_kho}</span>
                  {q.ngon_ngu && (
                    <span className="rounded-lg border border-border bg-muted px-2 py-1 text-[10px] font-medium uppercase">
                      {q.ngon_ngu}
                    </span>
                  )}
                </div>

                {/* Đề render markdown đúng như HS thấy */}
                <ExamMarkdown content={q.stem} />
                {q.mo_ta_de && (
                  <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
                    <ExamMarkdown content={q.mo_ta_de} compact />
                  </div>
                )}
                {q.rang_buoc && (
                  <p className="mt-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200">
                    <span className="font-semibold uppercase tracking-wide">Giới hạn: </span>
                    {q.rang_buoc}
                  </p>
                )}

                {/* MCQ: hiện đủ phương án, đáp án đúng nổi bật */}
                {q.loai === "trac_nghiem" && (
                  <div className="mt-4 space-y-1.5">
                    {(q.lua_chon || []).map((opt: string, oi: number) => {
                      const isCorrect = q.dap_an_index === oi;
                      return (
                        <div
                          key={oi}
                          className={`flex items-start gap-2.5 rounded-lg border p-2 text-sm ${
                            isCorrect ? "border-emerald-500 bg-emerald-500/10" : "border-border opacity-60"
                          }`}
                        >
                          <span className="mt-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                            {String.fromCharCode(65 + oi)}
                          </span>
                          <span className="flex-1">{opt}</span>
                          {isCorrect && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> Đáp án
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Trả lời ngắn: đáp án tham chiếu */}
                {q.loai === "tra_loi_ngan" && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {(q.dap_an || []).length > 0 ? (
                      <>
                        <span className="font-semibold uppercase tracking-wide">Đáp án tham chiếu: </span>
                        {(q.dap_an || []).join(" · ")}
                      </>
                    ) : (
                      <span className="italic">Chưa khai báo đáp án tham chiếu</span>
                    )}
                  </p>
                )}

                {/* Thực hành: tình trạng testcase */}
                {q.loai === "thuc_hanh" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-muted px-2 py-1">Sample: {q.testcase_mau?.length || 0}</span>
                    <span
                      className={`rounded px-2 py-1 ${
                        hiddenTotal > 0 && hiddenApproved >= hiddenTotal
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : hiddenTotal > 0
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      Testcase ẩn: {hiddenApproved}/{hiddenTotal} đã duyệt
                    </span>
                    {!q.code_dap_an && <span className="rounded bg-destructive/10 px-2 py-1 text-destructive">Thiếu code đáp án</span>}
                  </div>
                )}

                {q.giai_thich && (
                  <details className="mt-3 rounded-lg bg-muted/40 p-2.5 text-xs">
                    <summary className="cursor-pointer select-none font-semibold uppercase tracking-wide text-muted-foreground">
                      Giải thích
                    </summary>
                    <div className="mt-1.5">
                      <ExamMarkdown content={q.giai_thich} compact />
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
        {codingQs.length > 0 && (
          <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Câu thực hành: vào tab Testcase để sinh / duyệt hidden tests trước khi mở đề (hoặc force).
          </p>
        )}
      </section>
    </div>
  );
}
