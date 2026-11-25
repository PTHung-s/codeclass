import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import { onCentrifugoEvent, startCentrifugo, subscribeCentrifugo } from "../../lib/centrifugo";
import QuestionPaperView, { buildDisplayPaper } from "../../components/exams/QuestionPaperView";
import { ArrowLeft, Pause, Play, Radar, RefreshCw, ShieldAlert } from "lucide-react";

export default function ExamMonitor() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [liveExtra, setLiveExtra] = useState<Record<string, any>>({});
  const [qIdx, setQIdx] = useState(0);

  const monQ = useQuery({
    queryKey: ["exam-monitor", examId],
    queryFn: () => api.get(`/exams/${examId}/monitor`).then((r) => r.data),
    enabled: !!examId,
    refetchInterval: 4000,
  });

  useEffect(() => {
    if (!examId || !monQ.data?.channel) return;
    let unsub = () => {};
    void (async () => {
      try {
        await startCentrifugo();
        await subscribeCentrifugo(monQ.data.channel);
        unsub = onCentrifugoEvent((ev) => {
          if (!ev) return;
          const p = ev.payload || {};
          if (p.examId !== examId) return;
          if (
            ev.type !== "exam_heartbeat" &&
            ev.type !== "exam_live" &&
            ev.type !== "exam_submitted" &&
            ev.type !== "exam_pause"
          ) {
            return;
          }
          if (ev.type === "exam_submitted" || ev.type === "exam_pause") {
            qc.invalidateQueries({ queryKey: ["exam-monitor", examId] });
            return;
          }
          setLiveExtra((prev) => ({
            ...prev,
            [p.studentId]: {
              ...(prev[p.studentId] || {}),
              ...p,
              _ts: Date.now(),
            },
          }));
        });
      } catch {
        /* centrifugo optional — poll fallback */
      }
    })();
    return () => {
      unsub();
    };
  }, [examId, monQ.data?.channel, qc]);

  const pauseMut = useMutation({
    mutationFn: (p: { attemptId: string; paused: boolean }) =>
      api.post(`/exams/${examId}/monitor/${p.attemptId}/pause`, { paused: p.paused }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exam-monitor", examId] }),
  });

  const students = monQ.data?.students || [];
  const allQuestions: any[] = monQ.data?.questions || [];
  const active = students.find((s: any) => s.attempt.studentId === selected) || students[0];
  const activeId = active?.attempt?.studentId;
  const extra = activeId ? liveExtra[activeId] : null;

  // Gộp đáp án đã lưu + draft live (server đã convert về index gốc)
  const mergedAnswers = useMemo(() => {
    const map = new Map<string, any>();
    for (const a of active?.attempt?.answers || []) map.set(a.questionId, a);
    const draft = extra?.draft ?? active?.live?.draft;
    if (draft && typeof draft === "object") {
      for (const [qid, d] of Object.entries(draft as Record<string, any>)) {
        map.set(qid, { ...(map.get(qid) || {}), ...(d as object) });
      }
    }
    return map;
  }, [active, extra]);

  const currentQuestionId =
    extra?.currentQuestionId ?? active?.live?.currentQuestionId ?? null;

  const paper = useMemo(
    () =>
      buildDisplayPaper(active?.attempt?.contentSnapshot, allQuestions, mergedAnswers),
    [active?.attempt?.contentSnapshotJson, active?.attempt?.contentSnapshot, allQuestions, mergedAnswers],
  );

  // Mặc định mở câu HS đang làm
  useEffect(() => {
    if (!paper.length) return;
    const at = paper.findIndex((p) => p.key === currentQuestionId);
    setQIdx(at >= 0 ? at : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, currentQuestionId, paper.length]);

  const view = paper[Math.min(qIdx, Math.max(0, paper.length - 1))];

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-5">
      <Button variant="ghost" size="sm" className="-ml-2 mb-2 h-7 text-xs text-muted-foreground" onClick={() => navigate(`/exams/${examId}/edit`)}>
        <ArrowLeft className="h-3.5 w-3.5" /> Về soạn đề
      </Button>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Radar className="h-5 w-5 text-primary" /> Giám sát phòng thi
          </h1>
          <p className="text-xs text-muted-foreground">
            Xem bài làm realtime đúng như màn hình học sinh · tạm dừng khẩn cấp khi cần hỗ trợ.
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => monQ.refetch()}>
          <RefreshCw className="h-3.5 w-3.5" /> Làm mới
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[272px_1fr]">
        {/* Student list */}
        <div className="space-y-1.5 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-1">
          {students.length === 0 && (
            <p className="text-sm text-muted-foreground">Chưa có học sinh vào thi.</p>
          )}
          {students.map((s: any) => {
            const id = s.attempt.studentId;
            const live = liveExtra[id];
            const name = s.attempt.student?.fullName || id.slice(0, 8);
            const isPaused = Boolean(s.attempt.pause?.paused);
            const statusLabel = s.attempt.status === "in_progress" ? "Đang thi" : s.attempt.status === "submitted" ? "Đã nộp" : "Hết giờ";
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelected(id)}
                className={`w-full rounded-lg border p-2.5 text-left text-xs transition-colors ${
                  activeId === id ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-foreground">{name}</span>
                  {isPaused && (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">
                      <Pause className="h-2.5 w-2.5" /> Tạm dừng
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{statusLabel}</span>
                  {(live?.lastSeenAt || s.live?.lastSeenAt) && (
                    <span>· {new Date(live?.lastSeenAt || s.live.lastSeenAt).toLocaleTimeString()}</span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span>Vi phạm: {live?.violationCount ?? s.live?.violationCount ?? 0}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      pauseMut.mutate({ attemptId: s.attempt.id, paused: !isPaused });
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    className={`rounded-md px-2 py-1 font-semibold ${
                      isPaused
                        ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                        : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
                    }`}
                    title={isPaused ? "Cho học sinh làm tiếp" : "Tạm dừng bài học sinh này"}
                  >
                    {isPaused ? (
                      <span className="inline-flex items-center gap-1"><Play className="h-3 w-3" /> Tiếp tục</span>
                    ) : (
                      <span className="inline-flex items-center gap-1"><Pause className="h-3 w-3" /> Tạm dừng</span>
                    )}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail */}
        <div className="space-y-4">
          {!active && <p className="text-sm text-muted-foreground">Chọn học sinh để xem bài.</p>}
          {active && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-card">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold">
                    {active.attempt.student?.fullName}
                    {Boolean(active.attempt.pause?.paused) && (
                      <span className="inline-flex items-center gap-1 rounded bg-black px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                        <ShieldAlert className="h-3 w-3" /> Màn hình đang khóa
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Bắt đầu {new Date(active.attempt.startedAt).toLocaleString()} · hết hạn{" "}
                    {new Date(active.attempt.expiresAt).toLocaleTimeString()} · vi phạm{" "}
                    {extra?.violationCount ?? active.live?.violationCount ?? 0}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={Boolean(active.attempt.pause?.paused) ? "secondary" : "destructive"}
                  disabled={pauseMut.isPending}
                  onClick={() =>
                    pauseMut.mutate({
                      attemptId: active.attempt.id,
                      paused: !Boolean(active.attempt.pause?.paused),
                    })
                  }
                >
                  {Boolean(active.attempt.pause?.paused) ? (
                    <><Play className="h-4 w-4" /> Cho làm tiếp</>
                  ) : (
                    <><Pause className="h-4 w-4" /> Tạm dừng bài</>
                  )}
                </Button>
              </div>

              {Boolean(active.attempt.pause?.paused) && (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  Bài đang tạm dừng: màn hình học sinh bị khóa đen, anti-cheat ngưng, đồng hồ không trừ
                  thời gian (resume sẽ cộng lại đủ).
                </p>
              )}

              {view ? (
                <>
                  {/* Nav ô số giống màn hình thi */}
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Câu
                    </p>
                    <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1 sm:grid sm:grid-cols-12 sm:overflow-visible">
                      {paper.map((p, i) => {
                        const answered =
                          (p.q.loai === "trac_nghiem" && p.answer.selectedIndex != null) ||
                          (p.q.loai === "tra_loi_ngan" && (p.answer.textAnswer || "").trim()) ||
                          (p.q.loai === "thuc_hanh" && (p.answer.codeAnswer || "").trim());
                        const isCurrent = p.key === currentQuestionId;
                        return (
                          <button
                            key={p.key}
                            type="button"
                            title={`Câu ${i + 1}${isCurrent ? " — HS đang ở đây" : ""}`}
                            onClick={() => setQIdx(i)}
                            className={`relative h-8 w-8 shrink-0 rounded-[7px] border text-xs font-semibold tabular-nums transition-colors ${
                              i === qIdx
                                ? "border-primary bg-primary text-primary-foreground"
                                : answered
                                  ? "border-emerald-500/40 bg-emerald-500/10"
                                  : "border-border bg-card"
                            }`}
                          >
                            {i + 1}
                            {isCurrent && (
                              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-primary ring-2 ring-background" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <QuestionPaperView idx={qIdx} q={view.q} answer={view.answer} correctIndex={view.correctIndex}>
                    {currentQuestionId === view.key && (
                      <p className="mt-4 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                        Học sinh đang ở câu này
                      </p>
                    )}
                  </QuestionPaperView>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Đang tải đề…</p>
              )}

              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold">Vi phạm gần đây</h3>
                <ul className="mt-2 space-y-1 text-xs">
                  {(active.recentViolations || []).map((v: any) => (
                    <li key={v.id} className="rounded bg-amber-500/10 px-2 py-1">
                      {new Date(v.createdAt).toLocaleTimeString()} — {v.type} {v.detail || ""}
                    </li>
                  ))}
                  {(active.recentViolations || []).length === 0 && (
                    <li className="text-muted-foreground">Không có vi phạm nào.</li>
                  )}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
