import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import {
  CheckCircle2,
  ChevronDown,
  Eye,
  Highlighter,
  Play,
  Send,
  Wrench,
} from "lucide-react";
import api from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { ArenaMarkdown } from "../ArenaMarkdown";
import { CodeLines } from "../CodeLines";
import { ARENA_EDITOR_OPTIONS, ARENA_READONLY_OPTIONS, configureArenaEditor, langLabel, langOf } from "../arenaMonaco";
import { StaffPeek } from "./StaffPeek";
import { BlackoutCasterFrame, BlackoutMask, ChaosPowerBar, StaffChaosStatus, readChaos } from "./ChaosLayer";
import type { ArenaPanelState, ArenaState } from "../../../lib/arenaTypes";

type Tab = "lines" | "code";

/**
 * The live debug question.
 *
 * Layout rules that matter: this component never grows the shell. It is a
 * column of `shrink-0` bands around one `min-h-0 flex-1` work area, and the
 * submit bar sits at the bottom of the column rather than `sticky` inside a
 * scroller — so it is on screen at every width instead of needing a long scroll
 * to reach.
 *
 * Below `lg` the two halves of the task become tabs. They used to stack, each
 * with `min-h-[min(68vh,760px)]`, which put ~136vh of panels on a phone.
 */
export function DebugQuestion({
  state,
  arenaId,
  isPlayer,
  isStaff,
  userId,
  panelStates,
  sendMessage,
}: {
  state: ArenaState;
  arenaId: string;
  isPlayer: boolean;
  isStaff: boolean;
  userId: string;
  panelStates: Record<string, ArenaPanelState>;
  sendMessage: (type: string, payload: any) => void;
}) {
  const q = state.question;
  const myAnswer = state.myAnswer;
  const alreadySubmitted = !!myAnswer?.answeredAt;

  const [tab, setTab] = useState<Tab>("lines");
  const [briefOpen, setBriefOpen] = useState(true);
  const [highlighted, setHighlighted] = useState<number[]>([]);
  const [code, setCode] = useState(q?.shownCode || "");
  const [runResult, setRunResult] = useState<{ output: string; matches: boolean; error?: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [chaosMsg, setChaosMsg] = useState<string | null>(null);
  const autoFiredRef = useRef<string | null>(null);

  useEffect(() => {
    setHighlighted([]);
    setCode(q?.shownCode || "");
    setRunResult(null);
    setSubmitMsg(null);
    setChaosMsg(null);
    setLocked(false);
    setTab("lines");
    autoFiredRef.current = null;
  }, [q?.id, q?.shownCode]);

  const effLocked = alreadySubmitted || locked;

  const submitMu = useMutation({
    mutationFn: (vars: { highlightedLines: number[]; submittedCode?: string }) =>
      api.post(`/arenas/${arenaId}/questions/${q!.id}/answer`, vars).then((r) => r.data as { ok: boolean }),
  });
  const runMu = useMutation({
    mutationFn: (codeText: string) =>
      api.post(`/arenas/${arenaId}/questions/${q!.id}/run`, { code: codeText }).then((r) => r.data),
  });
  const chaosMu = useMutation({
    mutationFn: (power: "blackout" | "generator") =>
      api.post(`/arenas/${arenaId}/chaos`, { power, actionId: crypto.randomUUID() }).then((r) => r.data),
    onSuccess: (result) =>
      setChaosMsg(result.effect?.power === "blackout" ? "⚡ Cả sàn đã mất điện!" : "🛡️ Máy phát đã sẵn sàng."),
    onError: (error: any) => setChaosMsg(error?.response?.data?.error || "Không thể dùng phép."),
  });

  // Teacher peek feed, debounced. Server caps the payload and only accepts it
  // from registered players, so this is a no-op for spectators.
  useEffect(() => {
    if (!isPlayer || !q) return;
    const t = setTimeout(() => {
      sendMessage("arena_panel", {
        arenaId,
        hasCode: !!code && code !== q.shownCode,
        language: q.language,
        code,
        highlighted,
      });
    }, 600);
    return () => clearTimeout(t);
  }, [code, highlighted, isPlayer, arenaId, q, sendMessage]);

  // Auto-submit on the last tick. Keyed by question id so it fires exactly once
  // per question even as the timer keeps ticking down past zero.
  useEffect(() => {
    if (!isPlayer || !q || effLocked) return;
    if (state.remainingSeconds > 1) return;
    if (autoFiredRef.current === q.id) return;
    autoFiredRef.current = q.id;
    void (async () => {
      try {
        const edited = code !== q.shownCode;
        const res = await submitMu.mutateAsync({
          highlightedLines: highlighted,
          submittedCode: edited ? code : undefined,
        });
        if (res?.ok) {
          setLocked(true);
          setSubmitMsg("⏰ Hết giờ — hệ thống tự nộp bài của bạn.");
        }
      } catch {
        /* best-effort auto-submit */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.remainingSeconds, q?.id]);

  if (!q) return <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Đang tải câu hỏi...</div>;

  const toggleLine = (ln: number) =>
    setHighlighted((prev) => (prev.includes(ln) ? prev.filter((x) => x !== ln) : [...prev, ln]));

  const handleRun = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await runMu.mutateAsync(code);
      setRunResult({ output: res.output, matches: res.matches, error: res.error });
    } catch (e: any) {
      setRunResult({ output: "", matches: false, error: e?.response?.data?.error || "lỗi chạy" });
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const edited = code !== q.shownCode;
      const res = await submitMu.mutateAsync({
        highlightedLines: highlighted,
        submittedCode: edited ? code : undefined,
      });
      if (!res?.ok) {
        setSubmitMsg("Không ghi nhận — có thể đã hết giờ.");
        return;
      }
      setLocked(true);
      // What was submitted, not how it scored — the verdict is the answer key.
      const parts: string[] = [];
      if (highlighted.length > 0) parts.push(`🎯 ${highlighted.length} dòng`);
      if (edited) parts.push("🔧 code đã sửa");
      setSubmitMsg(
        parts.length > 0
          ? `Đã nộp ${parts.join(" · ")} — kết quả hiện khi hết giờ.`
          : "Đã chốt (chưa làm gì).",
      );
    } catch (e: any) {
      setSubmitMsg("Lỗi: " + (e?.response?.data?.error || "không nộp được"));
    } finally {
      setSubmitting(false);
    }
  };

  const edited = code !== q.shownCode;
  const chaos = readChaos(state, userId, Date.now());
  const shownHighlight = effLocked ? myAnswer?.highlightedLines || highlighted : highlighted;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {isPlayer && chaos.blackedOut && <BlackoutMask endsAt={chaos.blackoutEndsAt} />}
      {isPlayer && chaos.casterEndsAt && <BlackoutCasterFrame endsAt={chaos.casterEndsAt} />}

      {/* Brief: title, statement, I/O. Mobile-only — desktop moves this to the
          right rail (DebugBrief via ArenaShell) so the code panels own the screen. */}
      <div className="shrink-0 border-b border-slate-800 bg-[#0E1728] lg:hidden">
        <div className="flex items-center gap-2 px-3 py-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-extrabold text-slate-50">{q.title}</h2>
          <span className="rounded-md border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {langLabel(q.language)}
          </span>
          <button
            type="button"
            onClick={() => setBriefOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            aria-expanded={briefOpen}
          >
            Đề bài <ChevronDown className={cn("size-3.5 transition-transform", briefOpen && "rotate-180")} />
          </button>
        </div>
        {briefOpen && (
          <div className="max-h-[30vh] space-y-2 overflow-y-auto px-3 pb-3">
            <ArenaMarkdown content={q.statement} className="text-sm leading-relaxed text-slate-300" />
            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
                <p className="font-bold text-sky-300">Input</p>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-slate-300">{q.input || "(trống)"}</pre>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
                <p className="font-bold text-emerald-300">Output mong đợi</p>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-slate-300">{q.expectedOutput || "(trống)"}</pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chaos controls / staff chaos status */}
      {state.match.chaosEnabled && (isPlayer || isStaff) && (
        <div className="shrink-0 border-b border-slate-800 px-3 py-2">
          {isPlayer ? (
            <ChaosPowerBar
              chaos={chaos}
              disabled={effLocked || chaosMu.isPending || state.remainingSeconds < 15}
              onUse={(power) => chaosMu.mutate(power)}
              message={chaosMsg}
            />
          ) : (
            <StaffChaosStatus state={state} effects={chaos.activeEffects} />
          )}
        </div>
      )}

      {/* Work area */}
      {!isPlayer ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {isStaff ? (
            <div className="space-y-3">
              <div className="space-y-2 rounded-2xl border border-slate-800 bg-[#0E1728] p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Đoạn code có bug (đề bài)</p>
                <div className="overflow-hidden rounded-xl border border-slate-800">
                  <Editor
                    height="300px"
                    language={langOf(q.language)}
                    beforeMount={configureArenaEditor}
                    theme="codeclass-arena"
                    value={q.shownCode}
                    options={ARENA_READONLY_OPTIONS}
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Code đúng và dòng lỗi sẽ hiện ở phần đáp án sau khi hết giờ.
                </p>
              </div>
              <StaffPeek state={state} panelStates={panelStates} />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-400">
              <Eye className="h-8 w-8 opacity-40" />
              Bạn đang xem trực tiếp. Chỉ người chơi mới được trả lời.
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Mobile task switch — one panel owns the screen at a time. */}
          <div className="flex shrink-0 gap-1 border-b border-slate-800 px-3 py-1.5 lg:hidden">
            {(
              [
                { id: "lines" as const, label: "🎯 Dòng lỗi", note: highlighted.length ? `${highlighted.length}` : "" },
                { id: "code" as const, label: "🔧 Sửa code", note: edited ? "•" : "" },
              ]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition",
                  tab === t.id ? "bg-slate-800 text-slate-50" : "text-slate-400 hover:text-slate-200",
                )}
              >
                {t.label}
                {t.note && <span className="ml-1 text-amber-300">{t.note}</span>}
              </button>
            ))}
          </div>

          <div
            className={cn(
              "min-h-0 flex-1 gap-3 p-3 lg:grid lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]",
              isPlayer && chaos.blackedOut && "blackout-overlay",
            )}
          >
            {/* Task 1 — highlight the buggy line */}
            <section
              className={cn(
                "arena-code-card min-h-0 flex-col overflow-hidden rounded-2xl border border-amber-500/25 bg-[#0E1728] p-3",
                tab === "lines" ? "flex" : "hidden",
                "lg:flex",
              )}
            >
              <div className="mb-2 flex shrink-0 items-center justify-between">
                <p className="flex items-center gap-1 text-xs font-bold text-amber-300">
                  <Highlighter className="h-3.5 w-3.5" /> Bấm dòng có lỗi
                </p>
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  {shownHighlight.length} đã chọn
                </span>
              </div>
              <CodeLines
                code={q.shownCode}
                highlighted={shownHighlight}
                onToggle={toggleLine}
                disabled={effLocked}
                className="flex-1"
              />
              <p className="mt-2 shrink-0 text-[11px] text-slate-500">
                🎯 Tô đúng dòng lỗi → <b className="text-amber-300">+40đ</b> (tô dư dòng: +20đ)
              </p>
            </section>

            {/* Task 2 — fix the code */}
            <section
              className={cn(
                "arena-code-card min-h-0 flex-col overflow-hidden rounded-2xl border border-emerald-500/20 bg-[#0E1728] p-3",
                tab === "code" ? "flex" : "hidden",
                "lg:flex",
              )}
            >
              <div className="mb-2 flex shrink-0 items-center justify-between">
                <p className="flex items-center gap-1 text-xs font-bold text-emerald-300">
                  <Wrench className="h-3.5 w-3.5" /> Sửa để ra output đúng (tùy chọn)
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRun}
                  disabled={running || effLocked}
                  className="h-7 gap-1 border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 hover:bg-slate-700 hover:text-white"
                >
                  {running ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-current/40 border-t-current" />{" "}
                      Đang chạy
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3" /> Chạy thử
                    </>
                  )}
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-800">
                <Editor
                  height="100%"
                  language={langOf(q.language)}
                  beforeMount={configureArenaEditor}
                  theme="codeclass-arena"
                  value={code}
                  onChange={(v) => setCode(v || "")}
                  options={{ ...ARENA_EDITOR_OPTIONS, readOnly: effLocked, tabSize: 4 }}
                />
              </div>
              {runResult ? (
                <div
                  className={cn(
                    "mt-2 max-h-28 shrink-0 overflow-y-auto rounded-lg border p-2 text-xs",
                    runResult.matches
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-amber-500/40 bg-amber-500/10",
                  )}
                >
                  <p className="font-bold text-slate-100">
                    {runResult.matches ? "✅ Output khớp!" : "❌ Output chưa khớp"}
                  </p>
                  {runResult.error ? (
                    <pre className="mt-1 whitespace-pre-wrap text-red-300">{runResult.error}</pre>
                  ) : (
                    <pre className="mt-1 whitespace-pre-wrap font-mono text-slate-300">
                      {runResult.output || "(không có output)"}
                    </pre>
                  )}
                </div>
              ) : (
                <p className="mt-2 shrink-0 text-[11px] text-slate-500">
                  🔧 Sửa đúng → <b className="text-emerald-300">+60đ</b>
                </p>
              )}
            </section>
          </div>

          {/* Submit bar — anchored to the shell, never scrolled away. */}
          <div className="shrink-0 border-t border-slate-800 bg-[#0E1728] px-3 py-2">
            {effLocked ? (
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                <span className="font-semibold text-slate-100">Đã chốt đáp án</span>
                <span className="min-w-0 flex-1 truncate text-slate-400">
                  {submitMsg || "Chờ hết giờ xem đáp án..."}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 truncate text-xs text-slate-400">
                  {highlighted.length > 0 || edited
                    ? `Đã làm: ${[highlighted.length > 0 && `${highlighted.length} dòng`, edited && "sửa code"]
                        .filter(Boolean)
                        .join(" · ")}`
                    : "Bấm dòng lỗi và/hoặc sửa code rồi chốt."}
                </p>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="shrink-0 gap-1 bg-blue-600 hover:bg-blue-500"
                >
                  {submitting ? (
                    "Đang nộp..."
                  ) : (
                    <>
                      <Send className="h-4 w-4" /> Chốt đáp án
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
