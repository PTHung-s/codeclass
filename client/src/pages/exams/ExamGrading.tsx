import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import QuestionPaperView, { buildDisplayPaper } from "../../components/exams/QuestionPaperView";
import {
  ArrowLeft, ChevronDown, ChevronUp, Download, Play, Save, Sparkles, Trophy,
} from "lucide-react";

const STYLE_KEY = "cc-exam-ai-style";

export default function ExamGrading() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedAttempt, setSelectedAttempt] = useState<string | null>(null);
  const [scoreDraft, setScoreDraft] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [showStyle, setShowStyle] = useState(false);
  const [style, setStyle] = useState(() => {
    try { return localStorage.getItem(STYLE_KEY) || ""; } catch { return ""; }
  });
  const [suggestingKey, setSuggestingKey] = useState<string | null>(null);
  const [qIdx, setQIdx] = useState(0);
  const [filterNeedsReview, setFilterNeedsReview] = useState(false);
  const [msg, setMsg] = useState("");

  const statusQ = useQuery({
    queryKey: ["exam-grade", examId],
    queryFn: () => api.get(`/exams/${examId}/grade/status`).then((r) => r.data),
    enabled: !!examId,
    refetchInterval: (q) => {
      const jobs = (q.state.data as any)?.jobs || [];
      const running = jobs.some((j: any) => j.status === "running" || j.status === "queued");
      return running ? 2000 : false;
    },
  });

  // Đề gốc (staff) để render đủ câu hỏi kể cả câu HS bỏ trống
  const examQ = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => api.get(`/exams/${examId}`).then((r) => r.data),
    enabled: !!examId,
  });

  const startMut = useMutation({
    mutationFn: () => api.post(`/exams/${examId}/grade/start`).then((r) => r.data),
    onSuccess: () => {
      setMsg("Đã xếp hàng chấm batch");
      qc.invalidateQueries({ queryKey: ["exam-grade", examId] });
    },
    onError: (e: any) => setMsg(e?.response?.data?.error || "Lỗi"),
  });

  const patchMut = useMutation({
    mutationFn: (p: { attemptId: string; questionId: string; finalScore: number; teacherNote?: string }) =>
      api.patch(`/exams/${examId}/grades/${p.attemptId}`, p).then((r) => r.data),
    onSuccess: () => {
      setMsg("Đã chốt điểm câu");
      qc.invalidateQueries({ queryKey: ["exam-grade", examId] });
    },
  });

  const suggestMut = useMutation({
    mutationFn: (p: { attemptId: string; questionId: string; style?: string }) =>
      api.post(`/exams/${examId}/grades/${p.attemptId}/suggest-comment`, p).then((r) => r.data),
    onSuccess: (data: any, vars) => {
      setSuggestingKey(null);
      setNoteDraft((prev) => ({ ...prev, [vars.questionId]: data.comment || "" }));
      setMsg("AI đã viết nhận xét — bạn chỉnh sửa rồi bấm Chốt.");
    },
    onError: (e: any) => {
      setSuggestingKey(null);
      setMsg(e?.response?.data?.error || "AI nhận xét lỗi");
    },
  });

  const acceptLlmMut = useMutation({
    mutationFn: (attemptId: string) =>
      api.post(`/exams/${examId}/grades/${attemptId}/accept-llm-short`).then((r) => r.data),
    onSuccess: (data) => {
      setMsg(`Đã chốt ${data.accepted} câu short theo gợi ý LLM`);
      qc.invalidateQueries({ queryKey: ["exam-grade", examId] });
    },
    onError: (e: any) => setMsg(e?.response?.data?.error || "Không chốt LLM được"),
  });

  const pubMut = useMutation({
    mutationFn: (p: Record<string, boolean>) => api.patch(`/exams/${examId}`, p).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exam", examId] });
      setMsg("Đã cập nhật công bố cho học sinh");
    },
    onError: (e: any) => setMsg(e?.response?.data?.error || "Lỗi"),
  });

  const downloadCsv = async () => {
    try {
      const res = await api.get(`/exams/${examId}/grade/export`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `exam-${examId?.slice(0, 8)}-grades.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("Đã tải CSV");
    } catch {
      setMsg("Xuất CSV thất bại");
    }
  };

  const attemptsAll = statusQ.data?.attempts || [];
  const attempts = filterNeedsReview
    ? attemptsAll.filter((a: any) => a.gradeStatus === "needs_review" || a.pendingShortReview)
    : attemptsAll;
  const jobs = statusQ.data?.jobs || [];
  const current = attempts.find((a: any) => a.id === selectedAttempt) || attempts[0];

  const answersByQid = useMemo(() => {
    const m = new Map<string, any>();
    for (const a of current?.answers || []) m.set(a.questionId, a);
    return m;
  }, [current]);

  const paper = useMemo(
    () => buildDisplayPaper(current?.contentSnapshot, examQ.data?.questions || [], answersByQid),
    [current?.contentSnapshot, current?.id, examQ.data?.questions, answersByQid],
  );

  useEffect(() => {
    setQIdx(0);
  }, [current?.id]);

  const view = paper[Math.min(qIdx, Math.max(0, paper.length - 1))];
  const viewAns = view ? answersByQid.get(view.key) : null;

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-5">
      <Button variant="ghost" size="sm" className="-ml-2 mb-2 h-7 text-xs text-muted-foreground" onClick={() => navigate(`/exams/${examId}/edit`)}>
        <ArrowLeft className="h-3.5 w-3.5" /> Về soạn đề
      </Button>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Chấm điểm sau thi</h1>
          <p className="text-xs text-muted-foreground">
            Xem bài đúng như học sinh làm · trả lời ngắn có AI gợi ý nhận xét, giáo viên sửa rồi chốt.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate(`/exams/${examId}/ranking`)}>
            <Trophy className="h-3.5 w-3.5" /> Bảng xếp hạng
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void downloadCsv()}>
            <Download className="h-3.5 w-3.5" /> Xuất CSV
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
            <Play className="h-3.5 w-3.5" /> {startMut.isPending ? "…" : "Chạy chấm batch"}
          </Button>
        </div>
      </div>

      <label className="mb-2.5 flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={filterNeedsReview} onChange={(e) => setFilterNeedsReview(e.target.checked)} />
        Chỉ hiện bài cần duyệt câu ngắn
      </label>
      {msg && <p className="mb-2.5 text-xs text-primary">{msg}</p>}

      {jobs[0] && (
        <div className="mb-3 rounded-lg border border-border bg-card px-3 py-2 text-xs">
          Job mới nhất: <strong>{jobs[0].status}</strong> — {jobs[0].doneAttempts}/{jobs[0].totalAttempts}
          {jobs[0].error && <span className="text-destructive"> · {jobs[0].error}</span>}
        </div>
      )}

      {/* Công bố cho học sinh */}
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-sm">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Công bố cho HS:
        </span>
        {([
          ["showResults", "Điểm + nhận xét"],
          ["showRanking", "Bảng xếp hạng"],
          ["showReview", "Xem lại bài làm"],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={Boolean(examQ.data?.[key])}
              disabled={pubMut.isPending}
              onChange={(e) => pubMut.mutate({ [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[272px_1fr]">
        {/* Student list */}
        <div className="space-y-1.5 lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto lg:pr-1">
          {attempts.map((a: any) => {
            const gradeLabel =
              a.gradeStatus === "graded" ? "Đã chấm" : a.gradeStatus === "needs_review" ? "Chờ duyệt" : a.gradeStatus === "grading" ? "Đang chấm" : "Chưa chấm";
            return (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelectedAttempt(a.id)}
              className={`w-full rounded-lg border p-2.5 text-left text-xs transition-colors ${
                current?.id === a.id ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold text-foreground">{a.student?.fullName || a.studentId.slice(0, 8)}</span>
                {a.pendingShortReview && (
                  <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400">
                    Chờ duyệt
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                {gradeLabel}
                {a.scaledTotalScore != null && ` · ${a.scaledTotalScore}/${a.scaledMaxScore ?? 100}`}
              </div>
            </button>
          );
          })}
          {attempts.length === 0 && (
            <p className="text-sm text-muted-foreground">Chưa có bài nộp.</p>
          )}
        </div>

        {/* Paper */}
        <div className="space-y-4">
          {!current && <p className="text-sm text-muted-foreground">Chọn bài nộp để xem.</p>}
          {current && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-card">
                <div>
                  <h2 className="font-semibold">{current.student?.fullName}</h2>
                  <p className="text-xs text-muted-foreground">
                    {current.status} · thang {current.scaledTotalScore ?? "—"}/{current.scaledMaxScore ?? 100}
                    {" · "}thô {current.totalScore ?? "—"}/{current.maxScore ?? "—"}
                  </p>
                </div>
                {(current.gradeStatus === "needs_review" || current.pendingShortReview) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={acceptLlmMut.isPending}
                    onClick={() => acceptLlmMut.mutate(current.id)}
                  >
                    <Sparkles className="h-4 w-4" /> Chốt tất cả short theo LLM
                  </Button>
                )}
              </div>

              {/* Nav ô số giống màn hình thi */}
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Câu
                </p>
                <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1 sm:grid sm:grid-cols-12 sm:overflow-visible">
                  {paper.map((p, i) => {
                    const ans = answersByQid.get(p.key);
                    const done =
                      (p.q.loai === "trac_nghiem" && p.answer.selectedIndex != null) ||
                      (p.q.loai === "tra_loi_ngan" && (p.answer.textAnswer || "").trim()) ||
                      (p.q.loai === "thuc_hanh" && (p.answer.codeAnswer || "").trim());
                    const finalized = ans?.finalScore != null;
                    const needs = ans && ans.finalScore == null && (p.q.loai === "tra_loi_ngan" || Boolean(ans.llmSuggestion));
                    return (
                      <button
                        key={p.key}
                        type="button"
                        title={`Câu ${i + 1}${needs ? " — cần duyệt" : ""}`}
                        onClick={() => setQIdx(i)}
                        className={`relative h-8 w-8 shrink-0 rounded-[7px] border text-xs font-semibold tabular-nums transition-colors ${
                          i === qIdx
                            ? "border-primary bg-primary text-primary-foreground"
                            : needs
                              ? "border-amber-500/50 bg-amber-500/10"
                              : finalized || done
                                ? "border-emerald-500/40 bg-emerald-500/10"
                                : "border-border bg-card"
                        }`}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              {view && (
                <QuestionPaperView idx={qIdx} q={view.q} answer={view.answer} correctIndex={view.correctIndex}>
                  {/* Teacher panel */}
                  <div className="mt-4 space-y-3 rounded-xl border border-primary/30 bg-primary/[0.03] p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded bg-muted px-2 py-1 font-mono">
                        Tự động: {viewAns?.autoScore ?? "—"} · Chốt: {viewAns?.finalScore ?? "chưa"} /{" "}
                        {viewAns?.maxScore ?? view.q.diem ?? "?"}
                      </span>
                      {viewAns?.llmSuggestion && (
                        <span className="rounded bg-violet-500/10 px-2 py-1 text-violet-700 dark:text-violet-300">
                          LLM gợi ý {viewAns.llmSuggestion.suggestedScore}đ — {String(viewAns.llmSuggestion.rationale || "").slice(0, 120)}
                        </span>
                      )}
                      {view.q.loai === "trac_nghiem" && viewAns?.autoDetail?.correct != null && (
                        <span
                          className={`rounded px-2 py-1 ${
                            viewAns.autoDetail.correct
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {viewAns.autoDetail.correct ? "Đúng" : "Sai"}
                        </span>
                      )}
                    </div>

                    {view.q.loai !== "trac_nghiem" && (
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="text-xs">
                          Điểm chốt
                          <input
                            data-slot="exam-grade-score"
                            type="number"
                            step="0.5"
                            className="mt-0.5 block h-8 w-24 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                            value={scoreDraft[view.key] ?? String(viewAns?.finalScore ?? viewAns?.autoScore ?? 0)}
                            onChange={(e) => setScoreDraft((p) => ({ ...p, [view.key]: e.target.value }))}
                          />
                        </label>
                        <label className="min-w-[12rem] flex-1 text-xs">
                          Nhận xét của GV (hiện cho học sinh)
                          <textarea
                            data-slot="exam-grade-note"
                            rows={3}
                            className="mt-0.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                            value={noteDraft[view.key] ?? viewAns?.teacherNote ?? ""}
                            onChange={(e) => setNoteDraft((p) => ({ ...p, [view.key]: e.target.value }))}
                            placeholder="Nhận xét sẽ hiển thị trong trang kết quả của học sinh…"
                          />
                        </label>
                        <div className="flex items-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={suggestingKey === view.key}
                            onClick={() => {
                              try { localStorage.setItem(STYLE_KEY, style); } catch { /* ignore */ }
                              setSuggestingKey(view.key);
                              suggestMut.mutate({ attemptId: current.id, questionId: view.key, style: style || undefined });
                            }}
                            title="AI viết nháp nhận xét — bạn chỉnh sửa trước khi chốt"
                          >
                            <Sparkles className="h-4 w-4" />
                            {suggestingKey === view.key ? "Đang viết…" : "AI nhận xét"}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              patchMut.mutate({
                                attemptId: current.id,
                                questionId: view.key,
                                finalScore: Number(scoreDraft[view.key] ?? viewAns?.finalScore ?? viewAns?.autoScore ?? 0),
                                teacherNote: noteDraft[view.key],
                              })
                            }
                            disabled={patchMut.isPending}
                          >
                            <Save className="h-4 w-4" /> Chốt
                          </Button>
                        </div>
                      </div>
                    )}

                    {view.q.loai !== "trac_nghiem" && (
                      <div className="rounded-lg border border-border bg-background/60">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground"
                          onClick={() => setShowStyle((s) => !s)}
                        >
                          <span>Phong cách nhận xét AI (thêm vào prompt)</span>
                          {showStyle ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        {showStyle && (
                          <div className="px-3 pb-3">
                            <textarea
                              data-slot="exam-grade-style"
                              rows={3}
                              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                              placeholder={"Ví dụ: ngắn gọn 2-3 câu, thân thiện với học sinh lớp 10; luôn kèm một lời động viên; tránh từ 'sai' — dùng 'chưa chính xác'…"}
                              value={style}
                              onChange={(e) => setStyle(e.target.value)}
                            />
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              Được lưu trên máy này và dùng chung cho mọi lần bấm “AI nhận xét”.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </QuestionPaperView>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
