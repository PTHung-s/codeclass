import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import { useAntiCheat } from "../../hooks/useAntiCheat";
import { useConfirmContext } from "../../hooks/useConfirm";
import { useDarkMode } from "../../hooks/useDarkMode";
import { useToast } from "../../hooks/useToast";
import { Hearts, FullscreenModal, ViolationToast } from "../../components/ui/AntiCheat";
import { ARENA_EDITOR_OPTIONS, configureArenaEditor } from "../../components/arena/arenaMonaco";
import ExamMarkdown from "../../components/ui/ExamMarkdown";
import {
  Flag, Send, ChevronLeft, ChevronRight, Play, Clock, ShieldAlert,
} from "lucide-react";

type AnswerDraft = {
  selectedIndex?: number | null;
  textAnswer?: string;
  codeAnswer?: string;
  codeLanguage?: string;
  isFlagged?: boolean;
};

function formatMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

const LOAI_LABEL: Record<string, string> = {
  trac_nghiem: "Trắc nghiệm",
  tra_loi_ngan: "Trả lời ngắn",
  thuc_hanh: "Thực hành",
};

export default function ExamTake({ preview = false }: { preview?: boolean }) {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirmContext();
  const toast = useToast();
  const { dark } = useDarkMode();
  const [idx, setIdx] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [runResult, setRunResult] = useState<any>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0); // serverNow - clientNow
  const [violCount, setViolCount] = useState(0);
  const violationQueue = useRef<{ type: string; detail?: string }[]>([]);
  const lastSave = useRef(0);
  // Các câu đã sửa chưa được lưu — autosave chỉ gửi những câu này
  const dirtyRef = useRef<Set<string>>(new Set());

  const applyServerTime = (serverTime?: string) => {
    if (!serverTime) return;
    const s = Date.parse(serverTime);
    if (!Number.isFinite(s)) return;
    setClockOffsetMs(s - Date.now());
  };

  const examQ = useQuery({
    queryKey: [preview ? "exam-preview" : "exam", examId],
    queryFn: () => api.get(`/exams/${examId}${preview ? "/preview" : ""}`).then((r) => r.data),
    enabled: !!examId,
  });

  const attemptQ = useQuery({
    queryKey: ["exam-attempt", examId],
    queryFn: () => api.get(`/exams/${examId}/attempt/me`).then((r) => r.data),
    enabled: !!examId && !preview,
  });

  const exam = examQ.data;
  // Preview: attempt giả chỉ để render — không có trong DB, không lưu gì.
  const previewExpiresAt = useRef<string | null>(null);
  if (preview && exam && !previewExpiresAt.current) {
    previewExpiresAt.current = new Date(
      Date.now() + (Number(exam.durationMinutes) || 90) * 60_000,
    ).toISOString();
  }
  const previewAttempt = preview && exam
    ? {
        id: "preview",
        examId,
        status: "in_progress",
        startedAt: null,
        expiresAt: previewExpiresAt.current,
        answers: [] as any[],
        contentSnapshot: exam.questions,
      }
    : null;
  const attempt = preview ? previewAttempt : attemptQ.data;
  // Prefer frozen snapshot from attempt start so mid-exam edits don't change the paper.
  const questions: any[] = (Array.isArray(attempt?.contentSnapshot) && attempt.contentSnapshot.length
    ? attempt.contentSnapshot
    : exam?.questions) || [];
  const q = questions[idx];
  // GV tạm dừng bài (trường hợp khẩn cấp) → khóa màn hình đen, tắt anti-cheat
  const [hbPaused, setHbPaused] = useState(false);
  const attemptPaused = !preview && Boolean((attempt as any)?.pause?.paused);
  const paused = attemptPaused || hbPaused;
  const antiEnabled = !preview && !paused && exam?.antiCheatMode === "nghiem" && attempt?.status === "in_progress";

  const finishToResult = useCallback(async () => {
    try {
      await api.post(`/exams/${examId}/attempt/submit`);
    } catch { /* may already be submitted/expired */ }
    if (examId && attemptQ.data?.id) {
      try { localStorage.removeItem(`exam:draft:${examId}:${attemptQ.data.id}`); } catch { /* ignore */ }
    }
    qc.invalidateQueries({ queryKey: ["exam-attempt", examId] });
    navigate(`/exams/${examId}/result`);
  }, [examId, attemptQ.data?.id, navigate, qc]);

  const anti = useAntiCheat({
    enabled: Boolean(antiEnabled),
    maxHearts: 5,
    onZeroHearts: () => {
      violationQueue.current.push({ type: "zero_hearts", detail: "Hết hearts" });
      if (exam?.antiCheatMode === "nghiem") {
        void finishToResult();
      }
    },
  });

  // seed drafts from attempt + merge any newer localStorage backup (anti-loss on network drop)
  useEffect(() => {
    if (!attempt?.answers) return;
    const map: Record<string, AnswerDraft> = {};
    for (const a of attempt.answers) {
      const qq = questions.find((x) => x.id === a.questionId);
      map[a.questionId] = {
        selectedIndex: a.selectedIndex,
        textAnswer: a.textAnswer ?? "",
        codeAnswer: a.codeAnswer ?? "",
        codeLanguage: qq?.ngon_ngu || a.codeLanguage || "python",
        isFlagged: a.isFlagged,
      };
    }
    if (!preview && examId && attempt.id) {
      try {
        const raw = localStorage.getItem(`exam:draft:${examId}:${attempt.id}`);
        if (raw) {
          const parsed = JSON.parse(raw) as { drafts?: Record<string, AnswerDraft> };
          if (parsed?.drafts && typeof parsed.drafts === "object") {
            for (const [qid, localDraft] of Object.entries(parsed.drafts)) {
              const serverDraft = map[qid] || {};
              const merged = { ...serverDraft, ...localDraft };
              map[qid] = merged;
              dirtyRef.current.add(qid);
            }
          }
        }
      } catch { /* ignore */ }
    }
    setDrafts((prev) => ({ ...map, ...prev }));
    if ((attempt as any).serverTime) applyServerTime((attempt as any).serverTime);
  }, [attempt?.id, examId, preview, questions]);

  // Đánh dấu "đang thi" để các widget khác (peer chat) chặn gửi ảnh trong giờ làm bài.
  useEffect(() => {
    if (preview) return;
    try { sessionStorage.setItem("cc-exam-active", "1"); } catch { /* ignore */ }
    return () => {
      try { sessionStorage.removeItem("cc-exam-active"); } catch { /* ignore */ }
    };
  }, [preview]);

  useEffect(() => {
    if (anti.lastViolation) {
      violationQueue.current.push({ type: anti.lastViolation, detail: anti.lastViolation });
    }
  }, [anti.lastViolation]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (preview) return null;
      // Chỉ gửi các câu ĐÃ SỬA chưa lưu — giảm mạnh tải autosave
      const sent = new Set(dirtyRef.current);
      const answers = Array.from(sent)
        .filter((questionId) => drafts[questionId])
        .map((questionId) => {
          const d = drafts[questionId];
          const qq = questions.find((x) => x.id === questionId);
          return {
            questionId,
            selectedIndex: d.selectedIndex ?? null,
            textAnswer: d.textAnswer ?? null,
            codeAnswer: d.codeAnswer ?? null,
            codeLanguage: qq?.ngon_ngu || d.codeLanguage || null,
            isFlagged: Boolean(d.isFlagged),
          };
        });
      return api.put(`/exams/${examId}/attempt/answers`, {
        answers,
        currentQuestionId: q?.id,
        draft: q
          ? {
              [q.id]: drafts[q.id] || {},
            }
          : {},
      }).then((r) => {
        // Chỉ xóa những câu vừa gửi — câu sửa trong lúc gửi vẫn giữ dirty
        for (const id of sent) dirtyRef.current.delete(id);
        return r.data;
      });
    },
    onSuccess: (data) => applyServerTime(data?.serverTime),
  });

  const heartbeat = useCallback(async () => {
    if (!examId || !attempt) return;
    const viols = violationQueue.current.splice(0, 20);
    try {
      const r = await api.post(`/exams/${examId}/attempt/heartbeat`, {
        currentQuestionId: q?.id,
        draft: q ? { [q.id]: drafts[q.id] || {} } : {},
        violations: viols,
      });
      applyServerTime(r.data.serverTime);
      if (typeof r.data.violationCount === "number") setViolCount(r.data.violationCount);
      setRemainingMs(r.data.remainingMs);
      if (typeof r.data.paused === "boolean") {
        if (r.data.paused) setHbPaused(true);
        else {
          setHbPaused(false);
          qc.invalidateQueries({ queryKey: ["exam-attempt", examId] });
        }
      }
      if (
        r.data.forceSubmitted ||
        r.data.status === "expired" ||
        r.data.status === "submitted" ||
        (!r.data.paused && r.data.remainingMs === 0)
      ) {
        await finishToResult();
      }
    } catch { /* ignore transient / 429 */ }
  }, [examId, attempt, q?.id, drafts, finishToResult, qc]);

  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress") return;
    const t0 = Date.parse(attempt.expiresAt);
    const tick = () => setRemainingMs(Math.max(0, t0 - (Date.now() + clockOffsetMs)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [attempt?.expiresAt, attempt?.status, clockOffsetMs]);

  useEffect(() => {
    if (preview) return;
    if (!attempt || attempt.status !== "in_progress") return;
    const id = setInterval(() => {
      void heartbeat();
      if (Date.now() - lastSave.current > 8000) {
        lastSave.current = Date.now();
        saveMut.mutate();
      }
    }, 4000);
    return () => clearInterval(id);
  }, [attempt?.id, attempt?.status, heartbeat]);

  const submitMut = useMutation({
    mutationFn: async () => {
      await saveMut.mutateAsync();
      return api.post(`/exams/${examId}/attempt/submit`).then((r) => r.data);
    },
    onSuccess: () => {
      if (examId && attempt?.id) {
        try { localStorage.removeItem(`exam:draft:${examId}:${attempt.id}`); } catch { /* ignore */ }
      }
      qc.invalidateQueries({ queryKey: ["exam-attempt", examId] });
      navigate(`/exams/${examId}/result`);
    },
  });

  const resumeMut = useMutation({
    mutationFn: () => api.post(`/exams/${examId}/attempt/resume-pause`).then((r) => r.data),
    onSuccess: () => {
      setHbPaused(false);
      qc.invalidateQueries({ queryKey: ["exam-attempt", examId] });
    },
    onError: (e: any) => toast.error({ title: e?.response?.data?.error || "Không tiếp tục được" }),
  });

  const runMut = useMutation({
    mutationFn: () =>
      api.post(`/exams/${examId}/attempt/run-sample`, {
        questionId: q.id,
        code: drafts[q.id]?.codeAnswer || "",
        language: q.ngon_ngu || "python",
      }).then((r) => r.data),
    onSuccess: (data) => {
      setRunResult(data);
      applyServerTime(data?.serverTime);
    },
  });

  const setDraft = (questionId: string, patch: Partial<AnswerDraft>) => {
    dirtyRef.current.add(questionId);
    setDrafts((prev) => {
      const next = {
        ...prev,
        [questionId]: { ...prev[questionId], ...patch },
      };
      if (!preview && examId && attempt?.id) {
        try {
          localStorage.setItem(
            `exam:draft:${examId}:${attempt.id}`,
            JSON.stringify({ drafts: next, updatedAt: Date.now() }),
          );
        } catch { /* quota/private mode */ }
      }
      return next;
    });
  };

  const progress = useMemo(() => {
    let done = 0;
    for (const qq of questions) {
      const d = drafts[qq.id];
      if (!d) continue;
      if (qq.loai === "trac_nghiem" && d.selectedIndex != null) done++;
      else if (qq.loai === "tra_loi_ngan" && (d.textAnswer || "").trim()) done++;
      else if (qq.loai === "thuc_hanh" && (d.codeAnswer || "").trim()) done++;
    }
    return done;
  }, [drafts, questions]);

  useEffect(() => {
    if (!attempt) return;
    if (attempt.status !== "in_progress") {
      navigate(`/exams/${examId}/result`, { replace: true });
    }
  }, [attempt?.status, attempt?.id, examId, navigate]);

  if (examQ.isLoading || attemptQ.isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">Đang tải phòng thi…</div>;
  }
  if (!exam || !attempt) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">Chưa có attempt — về lobby để bắt đầu.</p>
        <Button className="mt-3" onClick={() => navigate(`/exams/${examId}`)}>Về lobby</Button>
      </div>
    );
  }
  if (attempt.status !== "in_progress") {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">Đang chuyển kết quả…</div>;
  }
  if (!q) return <div className="p-6">Đề không có câu hỏi.</div>;

  const d = drafts[q.id] || {};

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-background">
      {paused && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white">
          <ShieldAlert className="h-12 w-12 text-white/50" />
          <p className="text-xl font-bold">Bài thi đang tạm dừng</p>
          <p className="max-w-md text-sm leading-relaxed text-white/70">
            Giáo viên đã tạm dừng bài làm của bạn (trường hợp khẩn cấp). Màn hình bị khóa để đảm bảo
            công bằng — trong lúc này bạn không bị mất tim. Thời gian tạm dừng sẽ được cộng lại khi
            tiếp tục.
          </p>
          {!preview && (
            <Button variant="secondary" onClick={() => resumeMut.mutate()} disabled={resumeMut.isPending}>
              {resumeMut.isPending ? "Đang mở…" : "Tiếp tục làm bài"}
            </Button>
          )}
        </div>
      )}
      {preview && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-center text-xs font-medium text-amber-700 dark:text-amber-300">
          Chế độ xem trước dành cho giáo viên — đây là giao diện học sinh thấy khi thi. Câu trả lời không được lưu.
        </div>
      )}
      {antiEnabled && !anti.fullscreenActive && (
        <FullscreenModal onEnter={anti.requestFullscreen} />
      )}
      {anti.lastViolation && <ViolationToast reason={anti.lastViolation} />}

      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2.5 px-3 py-2 sm:px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {exam.title}
              {preview && (
                <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  Xem trước
                </span>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              Đã làm {progress}/{questions.length}
              {preview ? " · xem trước, không lưu bài" : ""}
              {!preview && saveMut.isPending ? " · Đang lưu…" : ""}
              {!preview && violCount > 0 ? ` · vi phạm ${violCount}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {antiEnabled && <Hearts hearts={anti.hearts} maxHearts={anti.maxHearts} />}
            <div className={`inline-flex h-8 items-center gap-1.5 rounded-[7px] px-2.5 font-mono text-xs font-semibold tabular-nums ${
              remainingMs != null && remainingMs < 60_000
                ? "animate-pulse bg-destructive/15 text-destructive"
                : "border border-border bg-muted/60 text-foreground"
            }`}>
              <Clock className="h-3.5 w-3.5" />
              {remainingMs == null ? "--:--" : formatMs(remainingMs)}
            </div>
            {preview ? (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate(`/exams/${examId}`)}>
                Kết thúc xem trước
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                disabled={submitMut.isPending}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Nộp bài",
                    message: "Nộp bài? Bạn không thể sửa sau khi nộp.",
                    confirmLabel: "Nộp bài",
                  });
                  if (ok) submitMut.mutate();
                }}
              >
                <Send className="h-3.5 w-3.5" /> Nộp bài
              </Button>
            )}
          </div>
        </div>
        <div className="h-0.5 w-full bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${questions.length > 0 ? Math.round((progress / questions.length) * 100) : 0}%` }}
          />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 p-3 sm:flex-row sm:gap-4 sm:p-4">
        {/* Question nav — horizontal strip on mobile, sticky compact grid on sm+ */}
        <aside className="shrink-0 sm:sticky sm:top-16 sm:w-44 sm:self-start">
          <div className="rounded-xl border border-border bg-card p-2.5 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Câu hỏi</span>
              <span className="tabular-nums">{progress}/{questions.length}</span>
            </div>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5 sm:grid sm:grid-cols-5 sm:overflow-visible">
              {questions.map((qq, i) => {
                const dd = drafts[qq.id];
                const answered =
                  (qq.loai === "trac_nghiem" && dd?.selectedIndex != null) ||
                  (qq.loai === "tra_loi_ngan" && (dd?.textAnswer || "").trim()) ||
                  (qq.loai === "thuc_hanh" && (dd?.codeAnswer || "").trim());
                return (
                  <button
                    key={qq.id}
                    type="button"
                    title={`Câu ${i + 1} (${qq.ma_cau})`}
                    onClick={() => {
                      saveMut.mutate();
                      setIdx(i);
                      setRunResult(null);
                    }}
                    className={`relative h-8 w-8 shrink-0 rounded-[7px] border text-xs font-semibold tabular-nums transition-colors ${
                      i === idx
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : answered
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    {i + 1}
                    {dd?.isFlagged && <Flag className="absolute -right-1 -top-1 h-3 w-3 fill-amber-500 text-amber-500" />}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="text-sm font-bold text-foreground">Câu {idx + 1}</span>
            <span className="font-mono text-[10px]">{q.ma_cau}</span>
            <span className="rounded bg-muted px-1.5 py-0.5">{LOAI_LABEL[q.loai] || q.loai}</span>
            <span>{q.diem} điểm</span>
            <span>độ khó {q.do_kho}</span>
            <Button
              size="xs"
              variant="ghost"
              className="ml-auto"
              onClick={() => setDraft(q.id, { isFlagged: !d.isFlagged })}
            >
              <Flag className={`h-3.5 w-3.5 ${d.isFlagged ? "text-amber-500" : ""}`} />
              Đánh dấu
            </Button>
          </div>

          {q.loai !== "thuc_hanh" && (
            <>
              <div className="mt-1">
                <ExamMarkdown content={q.stem} />
              </div>
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
            </>
          )}

          {q.loai === "trac_nghiem" && (
            <div className="mt-4 space-y-2">
              {(q.lua_chon || []).map((opt: string, oi: number) => {
                const selected = d.selectedIndex === oi;
                return (
                  <label
                    key={oi}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-sm transition-colors ${
                      selected
                        ? "border-primary bg-primary/8 text-foreground shadow-sm"
                        : "border-border bg-background/50 hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      checked={selected}
                      onChange={() => setDraft(q.id, { selectedIndex: oi })}
                    />
                    <span
                      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      {String.fromCharCode(65 + oi)}
                    </span>
                    <span className="min-w-0 flex-1 leading-snug">{opt}</span>
                  </label>
                );
              })}
            </div>
          )}

          {q.loai === "tra_loi_ngan" && (
            <textarea
              data-slot="exam-short-answer"
              className="mt-4 min-h-[96px] w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary/60"
              placeholder="Nhập câu trả lời ngắn…"
              value={d.textAnswer || ""}
              onChange={(e) => setDraft(q.id, { textAnswer: e.target.value })}
            />
          )}

          {q.loai === "thuc_hanh" && (
            <div className="mt-2 grid gap-4 lg:grid-cols-2">
              {/* Left pane: Problem statement + samples */}
              <div className="min-w-0 space-y-3">
                <ExamMarkdown content={q.stem} />
                {q.mo_ta_de && (
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <ExamMarkdown content={q.mo_ta_de} compact />
                  </div>
                )}
                {q.rang_buoc && (
                  <p className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200">
                    <span className="font-semibold uppercase tracking-wide">Giới hạn: </span>
                    {q.rang_buoc}
                  </p>
                )}
                {q.testcase_mau?.length > 0 && (
                  <div className="grid gap-2">
                    {q.testcase_mau.map((t: any, i: number) => (
                      <div key={i} className="overflow-hidden rounded-lg border border-border bg-muted/40">
                        <div className="flex items-center justify-between border-b border-border bg-muted/70 px-3 py-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Ví dụ {i + 1}
                          </span>
                          {t.mo_ta && <span className="text-[11px] text-muted-foreground">{t.mo_ta}</span>}
                        </div>
                        <div className="grid grid-cols-2 divide-x divide-border">
                          <div className="px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase text-muted-foreground">Input</div>
                            <pre className="mt-0.5 overflow-x-auto font-mono text-[0.78rem] leading-5">{t.input}</pre>
                          </div>
                          <div className="px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase text-muted-foreground">Output</div>
                            <pre className="mt-0.5 overflow-x-auto font-mono text-[0.78rem] leading-5">{t.output}</pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right pane: Taller Monaco Editor + Run sample */}
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium uppercase">
                    {q.ngon_ngu || "python"}
                  </span>
                  <Button size="sm" variant="secondary" className="h-8 text-xs" disabled={runMut.isPending} onClick={() => runMut.mutate()}>
                    <Play className="h-3.5 w-3.5" /> {runMut.isPending ? "Đang chạy…" : "Chạy sample"}
                  </Button>
                </div>
                <div className="overflow-hidden rounded-xl border border-border">
                  <Editor
                    height="440px"
                    language={q.ngon_ngu === "cpp" ? "cpp" : "python"}
                    theme={dark ? "codeclass-arena" : "vs"}
                    value={d.codeAnswer || ""}
                    onChange={(val) => setDraft(q.id, { codeAnswer: val || "" })}
                    beforeMount={configureArenaEditor}
                    options={{
                      ...ARENA_EDITOR_OPTIONS,
                      fontSize: 14,
                      minimap: { enabled: false },
                      wordWrap: "on",
                    }}
                  />
                </div>
                {runResult && (
                  <div className="rounded-lg border border-border p-2.5 text-xs">
                    <p className="font-semibold">
                      Sample: {runResult.passedCount}/{runResult.totalTests} passed
                    </p>
                    <ul className="mt-1 space-y-1">
                      {(runResult.results || []).map((r: any) => (
                        <li key={r.testNum} className={r.passed ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                          #{r.testNum} {r.passed ? "OK" : r.status}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={idx === 0}
              onClick={() => {
                saveMut.mutate();
                setIdx((i) => i - 1);
                setRunResult(null);
              }}
            >
              <ChevronLeft className="h-4 w-4" /> Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={idx >= questions.length - 1}
              onClick={() => {
                saveMut.mutate();
                setIdx((i) => i + 1);
                setRunResult(null);
              }}
            >
              Sau <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}
