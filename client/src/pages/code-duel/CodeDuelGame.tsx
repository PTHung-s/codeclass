import { useEffect, useRef, useState } from"react";
import { useParams, Link, useNavigate } from"react-router-dom";
import Editor from"@monaco-editor/react";
import { Loader2, Send, Timer, Swords, Lock, Play, Pause, RotateCw, ShieldCheck, Trophy } from"lucide-react";
import { useCodeDuelMatch } from"../../hooks/useCodeDuelMatch";
import { useAuthContext } from"../../contexts/AuthContext";
import api from"../../lib/api";
import { useToast } from "../../hooks/useToast";
import { useConfirmContext } from "../../hooks/useConfirm";
import { ArenaMarkdown } from "../../components/arena/ArenaMarkdown";
import { CodeDuelJudging } from "../../components/code-duel/CodeDuelJudging";
import { fireACConfetti } from "../../lib/confetti";

function formatClock(sec: number) {
 const m = Math.floor(sec / 60);
 const s = sec % 60;
 return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

/** Full-screen anti-cheat overlay shown after returning from another tab. It
 * counts down and CANNOT be dismissed until it reaches 0 — there is no close
 * button, and the server stores the expiry and re-applies it on reload, so an
 * F5 refresh can't clear the remaining time either. */
function OutTabLockOverlay({ lock, onDone }: { lock: { seconds: number; lockUntil?: number }; onDone: () => void }) {
 const remainingOf = (l: { seconds: number; lockUntil?: number }) =>
 l.lockUntil ? Math.max(0, Math.ceil((l.lockUntil - Date.now()) / 1000)) : Math.max(0, Math.round(l.seconds));
 const [remaining, setRemaining] = useState(() => remainingOf(lock));

 useEffect(() => {
 setRemaining(remainingOf(lock));
 if (remainingOf(lock) <= 0) {
 onDone();
 return;
 }
 const t = setInterval(() => {
 const r = remainingOf(lock);
 setRemaining(r);
 if (r <= 0) {
 clearInterval(t);
 onDone();
 }
 }, 1000);
 return () => clearInterval(t);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [lock, onDone]);

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
 <div className="pointer-events-auto max-w-sm rounded-2xl bg-card p-8 text-center shadow-2xl">
 <Lock className="mx-auto h-10 w-10" />
 <h2 className="mt-3 text-xl font-bold text-foreground">Bạn rời màn hình khỏi trận đấu</h2>
 <p className="mt-2 text-sm text-muted-foreground">
 Cảnh báo sẽ tự đóng khi hết thời gian đếm ngược, không thể tắt trước đó (kể cả F5).
 Không ảnh hưởng điểm, hệ thống chỉ ghi nhận.
 </p>
 <p className="mt-5 font-mono text-xl font-bold tabular-nums text-foreground">{formatClock(remaining)}</p>
 </div>
 </div>
 );
}

interface JudgeInfo {
 passed: number;
 total: number;
 verdict?: string;
 results: Array<{
 testNum: number;
 passed: boolean;
 status?: string;
 durationMs?: number;
 input?: string;
 expected?: string;
 stdout?: string;
 stderr?: string;
 }>;
}

function draftStorageKey(matchId: string, roundId: string, language: string) {
 return `code-duel:draft:${matchId}:${roundId}:${language}`;
}

function readDraft(key: string): { code: string; savedAt: string } | null {
 try {
 const value = localStorage.getItem(key);
 if (!value) return null;
 const parsed = JSON.parse(value);
 return typeof parsed?.code ==="string" && typeof parsed?.savedAt ==="string" ? parsed : null;
 } catch {
 return null;
 }
}

export default function CodeDuelGame() {
 const { id } = useParams<{ id: string }>();
 const navigate = useNavigate();
 const { user } = useAuthContext();
 const toast = useToast();
 const confirm = useConfirmContext();
 const { state, connected, readyStates, sendMessage, sendTransientMessage, lock, clearLock, judgingResults, judgingTotal, liveTestResults, kicked, refresh } = useCodeDuelMatch(id || null, user?.id);
 const isStaffUser = ["teacher","admin","teaching_assistant"].includes(user?.role ||"");

 // A draft is configured in the authoring studio, not played in the arena.
 // This prevents staff who follow an old /game link from landing on an
 // indefinite"synchronizing" screen before the lobby is opened.
 useEffect(() => {
 if (id && isStaffUser && state?.match.status ==="draft") {
 navigate(`/code-duel/${id}/authoring`, { replace: true });
 }
 }, [id, isStaffUser, navigate, state?.match.status]);

 // Automatically fetch role-scoped REST snapshot whenever the match flips
 // into reveal or podium so teachers/admins receive the complete unmasked submissions.
 useEffect(() => {
 if (state?.match.status ==="reveal" || state?.match.status ==="podium") {
 refresh();
 }
 }, [state?.match.status, refresh]);

 const round = state?.round;
 const liveTests = liveTestResults[round?.id ||""] || {};
 const [code, setCode] = useState("");
 const [submitting, setSubmitting] = useState(false);
 const [submitted, setSubmitted] = useState(false);
 const [running, setRunning] = useState(false);
 const [judgeInfo, setJudgeInfo] = useState<JudgeInfo | null>(null);
 const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
 const [mobilePane, setMobilePane] = useState<"problem" |"code">("problem");
 // Student language pick — only used when the match language is 'both'.
 const [lang, setLang] = useState<"python" |"cpp">("python");
 const lastPanelRef = useRef(0);

 const langLocked = state?.match.language ==="cpp" ?"cpp" :"python";
 const effLang = state?.match.language ==="both" ? lang : langLocked;
 const draftKey = round && id ? draftStorageKey(id, round.id, effLang) : null;

 // Restore the latest browser draft for this exact match/round/language. A
 // refresh or short network interruption must not discard a timed solution.
 useEffect(() => {
 if (round) {
 const draft = draftKey ? readDraft(draftKey) : null;
 setCode(draft?.code ?? round.starterCode ??"");
 setDraftSavedAt(draft?.savedAt ?? null);
 }
 setSubmitted(!!state?.mySubmission?.submitted);
 setJudgeInfo(null);
 }, [round?.id, draftKey]);

 // Save locally after typing pauses. The persisted timestamp makes this
 // safety net visible instead of silently implying a server-side save.
 useEffect(() => {
 if (state?.isStaff || !draftKey || !round || state.match.status !=="in_progress") return;
 const timeout = window.setTimeout(() => {
 try {
 const savedAt = new Date().toISOString();
 localStorage.setItem(draftKey, JSON.stringify({ code, savedAt }));
 setDraftSavedAt(savedAt);
 } catch {
 // Private browsing / a full storage quota should never block coding.
 }
 }, 500);
 return () => window.clearTimeout(timeout);
 }, [code, draftKey, round?.id, state?.isStaff, state?.match?.status]);

 // Broadcast current editor code to the teacher live wall (throttled).
 useEffect(() => {
 const effLang = state?.match.language ==="both" ? lang : langLocked;
 if (!isStaffUser && round && state?.match.status ==="in_progress") {
 const now = Date.now();
 if (now - lastPanelRef.current > 600) {
 lastPanelRef.current = now;
 sendTransientMessage("code_duel_panel", { matchId: id, hasCode: !!code, language: effLang, code });
 }
 }
 }, [code, round?.id, state?.match?.status, lang, user?.role]);

 // Out-tab anti-cheat: report tab switches; server returns a lock duration.
 useEffect(() => {
 const onVis = () => {
 if (document.visibilityState ==="hidden") {
 sendMessage("code_duel_tab_out", { matchId: id });
 } else {
 sendMessage("code_duel_tab_back", { matchId: id });
 }
 };
 document.addEventListener("visibilitychange", onVis);
 return () => document.removeEventListener("visibilitychange", onVis);
 }, [id]);

 // Auto clear lock when round transitions to judging/reveal/podium
 useEffect(() => {
 if (["judging","reveal","podium","finished","lobby"].includes(state?.match.status ||"")) {
 clearLock();
 }
 }, [state?.match.status, clearLock]);

 // Local"Run" — test the current code against the public samples only (with 1.5s cooldown).
 const lastRunAtRef = useRef(0);
 const runLocal = async () => {
 if (!round || running) return;
 const now = Date.now();
 if (now - lastRunAtRef.current < 1500) {
 toast.info({ title:"Đang xử lý", message:"Hãy đợi 1-2 giây trước khi chạy thử lại." });
 return;
 }
 lastRunAtRef.current = now;
 setRunning(true);
 setJudgeInfo(null);
 try {
 const path = effLang ==="cpp" ?"/run/cpp/tests" :"/run/python/tests";
 const res = await api.post(path, { code, testCases: round.samples });
 setJudgeInfo({
 passed: res.data.passedCount ?? 0,
 total: res.data.totalTests ?? 0,
 results: res.data.results ?? [],
 });
 } catch (err: any) {
 toast.error({ title:"Không chạy được", message: err?.response?.data?.error ||"Đã có lỗi." });
 } finally {
 setRunning(false);
 }
 };

 const submit = async () => {
 if (submitting || !round) return;
 setSubmitting(true);
 try {
 const res = await api.post(`/code-duel/${id}/rounds/${round.id}/submit`, {
 code,
 outTabCount: 0,
 language: state?.match.language ==="both" ? lang : undefined,
 });
 setSubmitted(true);
 const verdict = res.data?.verdict;
 setJudgeInfo({
 passed: res.data?.passedTests ?? 0,
 total: res.data?.totalTests ?? 0,
 verdict,
 results: res.data?.results ?? [],
 });
 if (verdict ==="AC") {
 toast.success({ title:"AC — Lời giải đúng", message:"Hệ thống giữ lời giải tốt nhất của bạn." });
 } else {
 toast.success({ title:"Đã nộp", message: verdict ? `Kết quả: ${verdict} · ${res.data?.passedTests}/${res.data?.totalTests} test` :"Kết quả công bố khi hết giờ." });
 }
 } catch (err: any) {
 toast.error({ title:"Không nộp được", message: err?.response?.data?.error ||"Đã có lỗi." });
 } finally {
 setSubmitting(false);
 }
 };

 // Auto-submit safety net: when time runs out (remaining === 0 or state flips to judging),
 // automatically submit whatever code the student has typed if not submitted yet.
 const autoSubmittedRef = useRef<string | null>(null);
 useEffect(() => {
 if (isStaffUser || !round) return;
 const shouldAutoSubmit = (state?.match.status ==="in_progress" && state?.remainingSeconds === 0) || state?.match.status ==="judging";
 if (shouldAutoSubmit && code && code.trim() && autoSubmittedRef.current !== round.id) {
 autoSubmittedRef.current = round.id;
 submit();
 }
 }, [state?.remainingSeconds, state?.match?.status, round?.id, code, user?.role]);

 if (!state) return <div className="py-16 text-center text-muted-foreground">Đang tải trận đấu...</div>;

 const startNow = async () => {
 try {
 await api.post(`/code-duel/${id}/start`);
 } catch (err: any) {
 toast.error({ title:"Không bắt đầu được", message: err?.response?.data?.error ||"Đã có lỗi." });
 }
 };

 // Teacher-controlled advance: jump past the reveal/phase immediately.
 const nextQuestion = async () => {
 try {
 await api.post(`/code-duel/${id}/skip`);
 } catch (err: any) {
 toast.error({ title:"Không chuyển được", message: err?.response?.data?.error ||"Đã có lỗi." });
 }
 };

 const kickFromLobby = async (userId: string, fullName: string) => {
	 const ok = await confirm({
	   title: "Loại học sinh",
	   message: `Loại học sinh "${fullName}" ra khỏi phòng chờ?`,
	   confirmLabel: "Loại",
	   variant: "danger",
	 });
	 if (!ok) return;
 try {
 await api.post(`/code-duel/${id}/kick`, { userId });
 toast.success({ title:"Đã loại học sinh", message: `${fullName} đã bị đưa ra khỏi phòng.` });
 refresh();
 } catch (err: any) {
 toast.error({ title:"Không loại được", message: err?.response?.data?.error ||"Đã có lỗi." });
 }
 };

 const status = state.match.status;
 const isStaff = isStaffUser;
 const remaining = state.remainingSeconds;
 const paused = state.match.paused;
 const readyCount = Object.values(readyStates).filter((item) => item.ready).length;
 const viewerReady = Boolean(user?.id && readyStates[user.id]?.ready);
 const toggleReady = () => sendMessage("code_duel_ready", { matchId: id, ready: !viewerReady });

 return (
 <div className="mx-auto max-w-7xl space-y-4 px-4 py-5">
 <Header state={state} status={status} remaining={remaining} paused={paused} />

 {status ==="judging" && (
 <CodeDuelJudging
 results={judgingResults || {}}
 total={judgingTotal}
 players={state.players || []}
 />
 )}

 {status ==="lobby" && (
 <div className="flex min-h-[55vh] flex-col items-center justify-center gap-6 text-center">
 <div className="rounded-full border border-primary/30 bg-primary/10 px-6 py-2">
 <p className="text-sm font-semibold text-primary">
 Đang trong phòng chờ · {state.players.length || 0} học sinh đã vào · {readyCount} sẵn sàng
 </p>
 </div>
 <div>
 <h2 className="text-2xl font-extrabold text-foreground">Chuẩn bị trước khi bắt đầu</h2>
 <p className="mt-2 max-w-md text-sm text-muted-foreground">
 Học sinh đang vào phòng. Khi sẵn sàng, giáo viên bấm <b className="text-foreground">Bắt đầu trận đấu</b> — mọi người cùng
 đếm ngược và bắt đầu vòng 1 trên cùng một đồng hồ.
 </p>
 </div>
 <div className="flex flex-wrap items-center justify-center gap-2">
 {(state.players || []).map((p) => (
 <span key={p.userId} className={`flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs ${readyStates[p.userId]?.ready ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-border bg-card text-foreground"}`}>
 <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-white">
 {p.fullName.charAt(0).toUpperCase()}
 </span>
 <span>{p.fullName}</span>
 {readyStates[p.userId]?.ready && <span className="font-bold" aria-label="Đã sẵn sàng">✓</span>}
 {isStaff && (
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation();
 kickFromLobby(p.userId, p.fullName);
 }}
 className="ml-0.5 grid h-4 w-4 place-items-center rounded-full text-muted-foreground transition"
 title={`Loại ${p.fullName} ra khỏi phòng chờ`}
 >
 ✕
 </button>
 )}
 </span>
 ))}
 </div>
 {!isStaff && (
 <button
 onClick={toggleReady}
 disabled={!connected}
 className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold disabled:opacity-50 ${viewerReady ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
 >
 {viewerReady ?"✓ Bạn đã sẵn sàng" :"Tôi đã sẵn sàng"}
 </button>
 )}
 {!connected && <p className="text-xs">Đang mất kết nối trực tiếp; hãy chờ kết nối lại trước khi báo sẵn sàng.</p>}
 {isStaff && (
 <button
 onClick={startNow}
 className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-white hover:bg-primary"
 >
 <Play className="h-4 w-4" /> Bắt đầu trận đấu
 </button>
 )}
 </div>
 )}

 {status ==="draft" && !isStaff && (
 <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
 <h2 className="text-xl font-bold text-foreground">Phòng chưa được mở</h2>
 <p className="max-w-md text-sm text-muted-foreground">Giáo viên đang chuẩn bị đề bài. Hãy quay lại khi phòng chờ được mở.</p>
 <Link to="/code-duel" className="rounded-lg border border-input px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">Về danh sách trận</Link>
 </div>
 )}

 {status ==="countdown" && (
 <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
 <Timer className="h-10 w-10 text-primary" />
 <p className="text-3xl font-extrabold tracking-widest text-foreground">{formatClock(remaining)}</p>
 <p className="text-muted-foreground">Trận đấu sắp bắt đầu...</p>
 </div>
 )}

 {status ==="in_progress" && round && (
 <>
 <div className="grid grid-cols-2 gap-2 lg:hidden">
 <button onClick={() => setMobilePane("problem")} className={`rounded-lg px-3 py-2 text-sm font-semibold ${mobilePane ==="problem" ?"bg-primary text-white" :"border border-input text-muted-foreground"}`}>Đề bài</button>
 <button onClick={() => setMobilePane("code")} className={`rounded-lg px-3 py-2 text-sm font-semibold ${mobilePane ==="code" ?"bg-primary text-white" :"border border-input text-muted-foreground"}`}>Mã & kết quả</button>
 </div>
 <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
 <div className={`${mobilePane ==="problem" ?"block" :"hidden"} max-h-[calc(100vh-11rem)] overflow-y-auto rounded-xl border border-border bg-card p-5 lg:block`}>
 <div className="mb-2 flex items-center justify-between">
 <h2 className="font-bold text-foreground">{round.title}</h2>
 <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
 {round.difficulty}
 </span>
 </div>
 <ArenaMarkdown content={round.statement} className="text-sm text-foreground/90" />
 {round.samples.length > 0 && (
 <div className="mt-4 space-y-2">
 <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Ví dụ</p>
 {round.samples.map((s, i) => (
 <div key={i} className="grid gap-1 rounded-lg border border-border bg-muted/40 p-3 text-xs">
 <pre className="whitespace-pre-wrap break-words font-mono text-foreground/80">{`Input: ${s.input}`}</pre>
 <pre className="whitespace-pre-wrap break-words font-mono">{`Output: ${s.output}`}</pre>
 </div>
 ))}
 </div>
 )}
 </div>

 <div className={`${mobilePane ==="code" ?"flex" :"hidden"} min-h-[calc(100vh-11rem)] flex-col overflow-hidden rounded-xl border border-border bg-card lg:flex`}>
 <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
 <span className="text-sm font-semibold text-foreground">
 Code workspace · {effLang ==="cpp" ?"C++" :"Python"}
 </span>
 <span className="text-right text-xs text-muted-foreground">{submitted ?"✓ Đã nộp (bản tốt nhất)" : draftSavedAt ? `Đã lưu ${new Date(draftSavedAt).toLocaleTimeString("vi-VN", { hour:"2-digit", minute:"2-digit" })}` :"Chưa lưu"}</span>
 </div>

 {state.match.language ==="both" && !state.isStaff && (
 <div className="flex gap-2 border-b border-border bg-muted/20 px-4 py-2">
 {(["python","cpp"] as const).map((l) => (
 <button
 key={l}
 onClick={() => setLang(l)}
 className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
 lang === l ?"bg-primary text-white" :"border border-border text-muted-foreground hover:bg-muted"
 }`}
 >
 {l ==="python" ?"Python" :"C++"}
 </button>
 ))}
 </div>
 )}

 <div className="min-h-[52vh] flex-1 lg:min-h-[420px]">
 <Editor
 height="100%"
 language={effLang}
 value={code}
 onChange={(v) => setCode(v ||"")}
 theme="vs-dark"
 options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false }}
 />
 </div>

 {judgeInfo && (
 <div className="result-in max-h-48 space-y-1 overflow-y-auto border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
 <div className="flex items-center justify-between">
 <span className={`text-sm font-bold ${judgeInfo.verdict === "AC" ? "text-emerald-400" : judgeInfo.verdict ? "text-amber-300" : "text-foreground"}`}>
 {judgeInfo.verdict ? `Kết quả: ${judgeInfo.verdict}` : judgeInfo.passed === judgeInfo.total && judgeInfo.total > 0 ?"AC" :"Partial"} · {judgeInfo.passed}/{judgeInfo.total} test
 </span>
 <button onClick={() => setJudgeInfo(null)} className="text-xs font-medium text-muted-foreground hover:text-foreground">đóng</button>
 </div>
 {judgeInfo.results.map((r, i) => (
 <div key={i} className="rounded-md bg-black/20 px-2 py-1.5 text-xs">
 <div className="flex items-center gap-2">
 <span className={`font-bold ${r.passed ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{r.passed ? "PASS" : "FAIL"}</span>
	 <span className="text-muted-foreground">Test {r.testNum}</span>
	 {r.durationMs != null && <span className="text-muted-foreground">· {r.durationMs}ms</span>}
	 {!r.passed && r.status === "time_limit" && <span className="text-muted-foreground">· quá thời gian</span>}
	 {!r.passed && r.status === "compile_error" && <span className="text-muted-foreground">· lỗi biên dịch</span>}
	 {!r.passed && (r.status === "runtime_error" || r.status === "blocked") && <span className="text-muted-foreground">· lỗi chạy</span>}
 </div>
 {!r.passed && (r.input !== undefined || r.expected !== undefined || r.stdout !== undefined || r.stderr) && (
 <details className="mt-1">
 <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Xem chi tiết lỗi</summary>
 <div className="mt-1 grid gap-1 font-mono text-[11px]">
 {r.input !== undefined && <pre className="whitespace-pre-wrap rounded bg-muted p-1.5 text-foreground">Input: {r.input}</pre>}
 {r.expected !== undefined && <pre className="whitespace-pre-wrap rounded bg-muted p-1.5 text-foreground">Cần có: {r.expected}</pre>}
 {r.stdout !== undefined && <pre className="whitespace-pre-wrap rounded bg-muted p-1.5 text-foreground">Bạn in: {r.stdout ||"(trống)"}</pre>}
 {r.stderr && <pre className="whitespace-pre-wrap rounded bg-red-500/10 p-1.5 text-red-700 dark:text-red-300">Lỗi: {r.stderr}</pre>}
 </div>
 </details>
 )}
 </div>
 ))}
 </div>
 )}

 {/* Realtime per-test judging: public tests fill in one by one while the
 server judges (hidden tests stay hidden until the reveal). */}
 {submitting && (
 <div className="result-in max-h-48 space-y-1 overflow-y-auto border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
 <div className="flex items-center justify-between">
 <span className="text-sm font-bold">
 Đang chấm từng test… {Object.keys(liveTests).length} xong
 </span>
 <Loader2 className="h-4 w-4 animate-spin" />
 </div>
 {Object.keys(liveTests).length === 0 ? (
 <p className="text-xs text-muted-foreground">Đang chạy test đầu tiên…</p>
 ) : (
 [...Object.values(liveTests)].sort((a: any, b: any) => a.testNum - b.testNum).map((r: any) => (
 <div key={r.testNum} className="flex items-center gap-2 text-xs">
 <span className={`font-bold ${r.passed ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
	 {r.passed ? "PASS" : "FAIL"}
	 </span>
	 <span className="text-muted-foreground">Test {r.testNum}</span>
	 {!r.passed && r.status === "time_limit" && <span className="text-muted-foreground">· quá thời gian</span>}
	 {!r.passed && (r.status === "runtime_error" || r.status === "blocked") && <span className="text-muted-foreground">· lỗi chạy</span>}
 </div>
 ))
 )}
 </div>
 )}

 <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-card px-4 py-3">
 <p className="hidden flex-1 text-xs text-muted-foreground sm:block">
 Chạy thử trên ví dụ hoặc nộp — hệ thống chấm live và giữ bản tốt nhất.
 </p>
 <div className="flex items-center gap-2">
 <button
 onClick={runLocal}
 disabled={running}
 title="Chạy thử code trên các ví dụ công khai"
 className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
 >
 {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
 Chạy thử
 </button>
 <button
 onClick={submit}
 disabled={submitting}
 className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
 >
 {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
 {submitted ?"Nộp lại" :"Nộp bài"}
 </button>
 </div>
 </div>
 </div>
 </div>
 </>
 )}

 {status ==="reveal" && state.reveal && (
 <RevealView reveal={state.reveal} isStaff={isStaff} matchId={id!} viewerUserId={user?.id} onRefreshed={refresh} onSkip={nextQuestion}
 isLastRound={state.match.currentRoundIndex + 1 >= (state.match.roundsCount || 0)} />
 )}

 {/* Fallback: if a phase needs data we don't have yet (e.g. the round
 snapshot hasn't arrived on the socket), show a waiting state instead of
 a blank screen — fixing the"white page until F5" bug. */}
 {(status ==="in_progress" && !round) ||
 (status ==="reveal" && !state.reveal) ||
 (status ==="judging" && !judgingResults) ||
 !["draft","judging","lobby","countdown","in_progress","reveal","podium"].includes(status) ? (
 <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
 <Loader2 className="h-7 w-7 animate-spin text-primary" />
 <p className="text-sm text-muted-foreground">
 Đang đồng bộ trận đấu ({status ==="in_progress" ?"tải câu hỏi…" : status ==="reveal" ?"đang mở kết quả…" :"chờ dữ liệu…"})
 </p>
 <button onClick={refresh} className="rounded-md border border-input px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">Thử đồng bộ lại</button>
 </div>
 ) : null}

 {status ==="podium" && (
 <PodiumView players={state.players} isStaff={isStaff} matchId={id!} />
 )}

 {kicked && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
 <div className="max-w-sm rounded-2xl bg-card p-8 text-center shadow-2xl">
 <div className="mx-auto grid h-12 w-12 place-items-center rounded-full text-2xl">🚫</div>
 <h2 className="mt-3 text-xl font-bold text-foreground">Bạn đã bị loại khỏi trận đấu</h2>
 <p className="mt-2 text-sm text-muted-foreground">
 Giáo viên đã đưa bạn ra khỏi trận. Bạn không thể nộp bài hay vào lại.
 </p>
 </div>
 </div>
 )}

 {lock && <OutTabLockOverlay lock={lock} onDone={clearLock} />}
 </div>
 );
}

function Header({ state, status, remaining, paused }: { state: any; status: string; remaining: number; paused: boolean }) {
 const timed = status ==="in_progress" || status ==="countdown";
 return (
 <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur">
 <div>
 <h1 className="flex items-center gap-2 text-lg font-bold text-foreground">
 <Swords className="h-5 w-5 text-primary" /> {state.match.title}
 </h1>
 <p className="text-xs text-muted-foreground">
 Vòng {state.match.currentRoundIndex + 1 <= 0 ?"—" : state.match.currentRoundIndex + 1} · {statusLabel(status)}
 {state.match.totalRounds ? ` / ${state.match.totalRounds}` :""}
 {status ==="in_progress" && state.match.pointsPerProblem > 1 ? ` · ${state.match.pointsPerProblem}đ/bài` :""}
 </p>
 </div>
 <div className="flex items-center gap-3">
 {timed && (
 <span className={`rounded-full px-4 py-1.5 font-mono text-lg font-bold tracking-widest ${paused ? "bg-muted text-muted-foreground" : remaining <= 60 ? "bg-red-500/10 text-red-600" : "bg-card text-foreground"} flex items-center gap-2`}>
 {paused && <Pause className="h-4 w-4" />}
 {formatClock(remaining)}
 </span>
 )}
 {state.isStaff && (
 <>
 {(["draft","lobby"] as string[]).includes(status) && (
 <Link
 to={`/code-duel/${state.match.id}/authoring`}
 className="rounded-lg border border-input px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted"
 >
 Soạn đề
 </Link>
 )}
 <Link
 to={`/code-duel/${state.match.id}/monitor`}
 className="rounded-lg border border-input px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted"
 >
 Bức tường giám sát
 </Link>
 </>
 )}
 <Link
 to={`/code-duel/${state.match.id}/leaderboard`}
 className="rounded-lg border border-input px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted flex items-center gap-1.5"
 >
 <Trophy className="h-4 w-4" /> Bảng xếp hạng
 </Link>
 </div>
 </div>
 );
}

function RevealView({ reveal, isStaff, matchId, viewerUserId, onRefreshed, onSkip, isLastRound }: { reveal: any; isStaff: boolean; matchId: string; viewerUserId?: string; onRefreshed: () => void; onSkip?: () => void; isLastRound?: boolean }) {
 const [hoverVerified, setHoverVerified] = useState<Record<string, boolean>>({});
 const [comments, setComments] = useState<Record<string, string>>({});
 const [verifying, setVerifying] = useState<string | null>(null);
 const [expanded, setExpanded] = useState<Record<string, boolean>>({});
 const [boardData, setBoardData] = useState<any>(null);

 useEffect(() => {
 if (!matchId) return;
 api.get(`/code-duel/${matchId}/board`)
 .then((res) => setBoardData(res.data))
 .catch(() => {});
 }, [matchId, reveal?.round?.orderIndex]);

 const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));
 const mySubmission = !isStaff && viewerUserId ? reveal.all.find((s: any) => s.userId === viewerUserId) : null;
 const verify = async (submissionId: string) => {
 setVerifying(submissionId);
 try {
 await api.post(`/code-duel/${matchId}/rounds/${reveal.round.id}/verify`, {
 submissionId,
 comment: (comments[submissionId] ||"").trim(),
 });
 fireACConfetti();
 onRefreshed();
 } catch (err: any) {
 alert(err?.response?.data?.error ||"Không xác thực được");
 } finally {
 setVerifying(null);
 }
 };

 return (
 <div className="space-y-6">
 {/* Round-complete header (cyberpunk arena, per stitch_code_duel_arena) */}
 <header className="text-center">
 <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">{reveal.round.algorithm ||"Arena"}</p>
 <h2 className="text-3xl font-extrabold tracking-tight text-foreground drop-shadow-[0_0_12px_rgba(173,198,255,0.3)]">
 KẾT QUẢ VÒNG {reveal.round.orderIndex + 1}
 </h2>
 <p className="mt-1 text-sm text-muted-foreground">{reveal.round.title}</p>
 {isStaff && onSkip && (
 <button
 onClick={onSkip}
 className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-bold text-white shadow-[0_0_12px_rgba(173,198,255,0.4)] hover:bg-primary"
 >
 <Play className="h-4 w-4" /> {isLastRound ?"Kết thúc trận ▶" :"Câu hỏi tiếp theo ▶"}
 </button>
 )}
 </header>

 {/* Podium — top 3 with their code side by side. Students only read the
 verified entry; the teacher reads all three and picks the best. */}
 <section className="flex flex-wrap items-end justify-center gap-4 md:gap-6">
 {[1, 0, 2].map((pos) => {
 const s = reveal.top3[pos];
 if (!s) return <div key={pos} className="max-w-[300px] flex-1" />;
 const rank = pos + 1;
 const isFirst = rank === 1;
 const avatar = (s.fullName ||"?").charAt(0).toUpperCase();
 const showCode = isStaff || s.isVerified;
 return (
 <div
 key={s.id}
 className={`relative flex w-full max-w-[300px] flex-1 flex-col items-center ${isFirst ?"z-10 md:-mt-4" :""}`}
 >
 {/* Trophy + rank */}
 <div className="relative mb-3">
 {isFirst && (
 <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-3xl">🏆</div>
 )}
 <div
 className={`grid h-14 w-14 place-items-center rounded-full border-2 text-lg font-bold ${
 isFirst
 ?"border-primary text-primary shadow-[0_0_18px_rgba(173,198,255,0.5)]"
 :"border-white/20 text-muted-foreground"
 } bg-muted`}
 >
 {avatar}
 </div>
 <span className={`absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-border px-2.5 py-0.5 font-mono text-xs font-bold ${
 isFirst ?"border-primary bg-primary text-white" :"border-white/20 bg-muted text-foreground"
 }`}>#{rank}</span>
 </div>

 <p className="text-sm font-bold text-foreground">{s.fullName}</p>
 <p className="font-mono text-xs text-muted-foreground">{s.passedTests}/{s.totalTests} test · {s.verdict ||"—"}</p>

 {/* Code pane */}
 <div className={`relative mt-3 w-full rounded-lg bg-black/60 p-3 ${
 s.isVerified
 ?"border-2 shadow-[0_0_16px_rgba(139,92,246,0.35)]"
 :"border border-white/10"
 }`} style={{ height: isFirst ? 220 : 170 }}>
 {s.isVerified && (
 <span className="absolute -top-2 right-2 z-20 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-[0_0_10px_rgba(139,92,246,0.5)]">
 <ShieldCheck className="h-3 w-3" /> VERIFIED
 </span>
 )}
 <pre className="h-full overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-primary/80">
 {showCode ? s.code ||"(empty)" :"🔒 Giáo viên chưa xác thực — code được giữ kín."}
 </pre>
 </div>

 {/* Teacher verify control (only on unreviewed entries) */}
 {isStaff && !s.isVerified && (
 <div className="mt-3 w-full space-y-1.5">
 <input
 value={comments[s.id] ||""}
 onChange={(e) => setComments((c) => ({ ...c, [s.id]: e.target.value }))}
 placeholder="Nhận xét ngắn (tùy chọn)..."
 className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-xs outline-none"
 maxLength={500}
 />
 <button
 onClick={() => verify(s.id)}
 disabled={verifying === s.id}
 onMouseEnter={() => setHoverVerified((p) => ({ ...p, [s.id]: true }))}
 onMouseLeave={() => setHoverVerified((p) => ({ ...p, [s.id]: false }))}
 className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold transition-colors ${
 hoverVerified[s.id] ?"text-white" :"border"
 }`}
 >
 {verifying === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
 {isFirst ?"Chọn + Xác thực" :"Xác thực"}
 </button>
 </div>
 )}
 {s.isVerified && s.verifiedComment && (
 <p className="mt-2 w-full rounded-md bg-blue-950/40 px-2 py-1 text-center text-xs italic">
 “{s.verifiedComment}”
 </p>
 )}
 </div>
 );
 })}
 </section>

 {/* Detailed Cumulative Leaderboard (Multi-round Grid for both Students & Teachers) */}
 <div className="space-y-3 rounded-xl border border-border bg-card p-4">
 <div className="flex items-center justify-between">
 <h3 className="flex items-center gap-2 text-sm font-bold text-foreground uppercase tracking-wider">
 <Trophy className="h-4 w-4" /> Bảng xếp hạng toàn trận (Tổng hợp tất cả các bài)
 </h3>
 <Link
 to={`/code-duel/${matchId}/leaderboard`}
 className="text-xs font-semibold text-primary hover:text-primary hover:underline"
 >
 Mở toàn màn hình →
 </Link>
 </div>

 {boardData?.rows ? (
 <div className="overflow-x-auto rounded-lg border border-border">
 <table className="w-full text-left text-xs">
 <thead className="bg-muted/50 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
 <tr>
 <th className="px-3 py-2 text-center w-12">Hạng</th>
 <th className="px-3 py-2">Coder</th>
 <th className="px-3 py-2 text-right">Tổng điểm</th>
 {boardData.rows[0]?.rounds?.map((r: any) => (
 <th key={r.orderIndex} className="px-3 py-2 text-center">Bài {r.orderIndex + 1}</th>
 ))}
 </tr>
 </thead>
 <tbody className="divide-y divide-border font-mono">
 {boardData.rows.map((row: any, idx: number) => {
 const isMe = viewerUserId === row.userId;
 const rank = idx + 1;
 return (
 <tr key={row.userId} className={isMe ?"bg-primary/10 dark:bg-primary/10 font-bold" :"hover:bg-muted/30"}>
 <td className="px-3 py-2 text-center">
 <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
 rank === 1 ?"bg-amber-400 text-amber-950" : rank === 2 ?"bg-slate-300 text-slate-900" : rank === 3 ?"bg-orange-400 text-orange-950" :"bg-muted text-muted-foreground"
 }`}>
 {rank}
 </span>
 </td>
 <td className="px-3 py-2 font-sans font-medium text-foreground">
 {isMe ?"Bạn ·" :""}{row.fullName}
 </td>
 <td className="px-3 py-2 text-right font-bold text-primary">
 {row.totalScore}
 </td>
 {row.rounds?.map((r: any) => (
 <td key={r.orderIndex} className="px-3 py-2 text-center">
 {r.verdict ? (
 <div className="flex flex-col items-center">
 <span className={`text-[11px] font-bold ${r.verdict === "AC" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
 {r.verdict}
 </span>
 <span className="text-[9px] text-muted-foreground">
 {r.acceptedAt ? r.acceptedAt.slice(11, 19) : `${r.passedTests}/${r.totalTests}`}
 </span>
 </div>
 ) : (
 <span className="text-muted-foreground">—</span>
 )}
 </td>
 ))}
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 ) : (
 <p className="py-4 text-center text-xs text-muted-foreground font-mono">Đang tải bảng xếp hạng tổng hợp…</p>
 )}
 </div>

 {/* Student's own result — which tests they passed/failed (per §7 they may
 see their OWN code + per-test detail, not a classmate's). */}
 {mySubmission && (
 <div className="rounded-xl border border-border bg-card p-4">
 <h3 className="text-sm font-bold text-foreground">Kết quả của bạn</h3>
 <p className="mt-0.5 text-xs text-muted-foreground">
 {mySubmission.verdict} · {mySubmission.passedTests}/{mySubmission.totalTests} test · {mySubmission.score}đ
 </p>
 {(mySubmission.testPerTest || []).length > 0 && (
 <div className="mt-3 grid gap-1.5">
 {(mySubmission.testPerTest || []).map((r: any, idx: number) => (
 <div key={idx} className={`flex items-center gap-2 rounded-md px-2.5 py-1 text-xs ${r.passed ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 text-red-700 dark:text-red-400"}`}>
 <span className="font-mono">Test #{r.testNum}</span>
 <span className="font-bold">{r.passed ?"PASS" :"FAIL"}</span>
 {!r.passed && r.status ==="time_limit" && <span className="text-muted-foreground">· quá thời gian</span>}
 {!r.passed && r.status ==="compile_error" && <span className="text-muted-foreground">· lỗi biên dịch</span>}
 {!r.passed && (r.status ==="runtime_error" || r.status ==="blocked") && <span className="text-muted-foreground">· lỗi chạy</span>}
 </div>
 ))}
 </div>
 )}
 {mySubmission.code ? (
 <details className="mt-3">
 <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">Xem code bạn đã nộp</summary>
 <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 font-mono text-xs">{mySubmission.code}</pre>
 </details>
 ) : null}
 </div>
 )}

 {/* Privacy (§7): students may NOT read other students' raw code. Only the
 teacher sees every submission with per-test detail; students only see
 the verified code the teacher has stamped (as the reference gallery). */}
 {isStaff && (
 <div className="space-y-2">
 <h3 className="text-sm font-bold text-foreground">Tất cả bài nộp (giáo viên)</h3>
 {reveal.all.map((s: any) => {
 const per = s.testPerTest || [];
 const open = expanded[s.id];
 return (
 <details key={s.id} className="rounded-xl border border-border bg-card p-4" open={open}>
 <summary className="cursor-pointer font-semibold text-foreground" onClick={() => toggle(s.id)}>
 {s.fullName} · {s.verdict} · {s.passedTests}/{s.totalTests} · {s.score}đ
 {s.isVerified ?" · ✓ Đã xác thực" :""}
 </summary>
 <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 font-mono text-xs">
 {s.code}
 </pre>
 {per.length > 0 && (
 <div className="mt-3 space-y-1 text-xs">
 {per.map((r: any, idx: number) => (
 <div key={idx} className={`flex items-center gap-2 rounded px-2 py-0.5 ${r.passed ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 text-red-700 dark:text-red-400"}`}>
 <span className="font-mono">#{r.testNum}</span>
 <span>{r.passed ?"PASS" :"FAIL"}</span>
 <span className="text-muted-foreground">· {r.status}</span>
 <span className="text-muted-foreground">· {r.durationMs}ms</span>
 </div>
 ))}
 </div>
 )}
 </details>
 );
 })}
 </div>
 )}

 {/* Students + staff share this: the verified-code gallery (the only raw
 code students may see, per §7). */}
 <div className="space-y-2">
 <h3 className="text-sm font-bold text-foreground">Giải bài được xác thực (VERIFIED)</h3>
 {reveal.all.filter((s: any) => s.isVerified).length === 0 ? (
 <p className="text-sm text-muted-foreground">
 Giáo viên chưa xác thực giải nào trong top 3. Code verified sẽ hiện ở đây và trong lịch sử.
 </p>
 ) : (
 reveal.all.filter((s: any) => s.isVerified).map((s: any) => {
 const per = s.testPerTest || [];
 return (
 <details key={s.id} className="rounded-xl border border-border bg-card p-4">
 <summary className="flex items-center justify-between font-semibold text-foreground">
 <span>✓ {s.fullName} · {s.verdict} · {s.passedTests}/{s.totalTests} · {s.score}đ</span>
 </summary>
 <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 font-mono text-xs">
 {s.code}
 </pre>
 {per.length > 0 && (
 <div className="mt-3 space-y-1 text-xs">
 {per.map((r: any, idx: number) => (
 <div key={idx} className={`flex items-center gap-2 rounded px-2 py-0.5 ${r.passed ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 text-red-700 dark:text-red-400"}`}>
 <span className="font-mono">#{r.testNum}</span>
 <span>{r.passed ?"PASS" :"FAIL"}</span>
 <span className="text-muted-foreground">· {r.status}</span>
 </div>
 ))}
 </div>
 )}
 </details>
 );
 })
 )}
 </div>
 </div>
 );
}

function PodiumView({ players, isStaff, matchId }: { players: any[]; isStaff: boolean; matchId: string }) {
 const toast = useToast();
 const confirm = useConfirmContext();
 const [resetting, setResetting] = useState(false);
 const [history, setHistory] = useState<any[]>([]);
 const [historyLoading, setHistoryLoading] = useState(true);
 const [openRounds, setOpenRounds] = useState<Record<string, boolean>>({});

 useEffect(() => {
 if (!matchId) return;
 api.get(`/code-duel/${matchId}/history`)
 .then((res) => setHistory(res.data || []))
 .catch(() => {})
 .finally(() => setHistoryLoading(false));
 }, [matchId]);

 const toggleRound = (id: string) => setOpenRounds((o) => ({ ...o, [id]: !o[id] }));

 const reset = async () => {
 const ok = await confirm({
	   title: "Chơi lại trận",
	   message: "Chơi lại trận này cho khóa sau? Điểm và bài nộp của lần này sẽ bị xóa, đề bài được giữ nguyên.",
	   confirmLabel: "Chơi lại",
	   variant: "danger",
	 });
	 if (!ok) return;
 setResetting(true);
 try {
 await api.post(`/code-duel/${matchId}/reset`);
 toast.success({ title:"Đã chơi lại", message:"Trận về trạng thái nháp. Bấm vào để bắt đầu vòng mới." });
 window.location.href = `/code-duel/${matchId}/authoring`;
 } catch (err: any) {
 toast.error({ title:"Chơi lại thất bại", message: err?.response?.data?.error ||"Đã có lỗi." });
 } finally {
 setResetting(false);
 }
 };
 const sorted = [...(players || [])].sort((a, b) => (a.finalRank ?? 99) - (b.finalRank ?? 99));
 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <h2 className="text-xl font-extrabold text-foreground">🏆 Vinh danh toàn trận</h2>
 {isStaff && (
 <button
 onClick={reset}
 disabled={resetting}
 className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
 >
 {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
 Chơi lại (khóa sau)
 </button>
 )}
 </div>
 <div className="overflow-hidden rounded-xl border border-border bg-card">
 <table className="w-full text-sm">
 <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
 <tr>
 <th className="px-4 py-2">Hạng</th>
 <th className="px-4 py-2">Coder</th>
 <th className="px-4 py-2 text-right">Điểm</th>
 <th className="px-4 py-2 text-right">Rời tab</th>
 </tr>
 </thead>
 <tbody>
 {sorted.map((p) => (
 <tr key={p.userId} className="border-t border-border">
 <td className="px-4 py-2 font-bold text-foreground">{p.finalRank ??"—"}</td>
 <td className="px-4 py-2 font-medium text-foreground">{p.fullName}</td>
 <td className="px-4 py-2 text-right font-semibold text-foreground">{p.totalScore}</td>
 <td className="px-4 py-2 text-right text-muted-foreground">{p.outTabCount}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 {/* Verified-code gallery for the whole match (mỗi bài verified) */}
 <div className="space-y-2">
 <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
 <ShieldCheck className="h-4 w-4" /> Giải bài được xác thực (VERIFIED) theo từng vòng
 </h3>
 {historyLoading ? (
 <p className="text-sm text-muted-foreground">Đang tải giải verified…</p>
 ) : history.length === 0 ? (
 <p className="text-sm text-muted-foreground">
 Chưa có lời giải nào được xác thực. Giáo viên verify trong màn kết quả từng vòng.
 </p>
 ) : (
 history.map((h) => {
 const v = h.verified && h.verified[0];
 return (
 <details key={h.roundId} className="overflow-hidden rounded-xl border border-border bg-card" open={!!openRounds[h.roundId]}>
 <summary className="flex cursor-pointer items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3" onClick={() => toggleRound(h.roundId)}>
 <div className="min-w-0">
 <p className="truncate font-semibold text-foreground">
 Vòng {h.orderIndex + 1} · {h.title}
 </p>
 <p className="truncate text-xs text-muted-foreground">{h.difficulty}{h.topic ? ` · ${h.topic}` :""}</p>
 </div>
 {v && (
 <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold text-white">
 <ShieldCheck className="h-3.5 w-3.5" /> VERIFIED
 </span>
 )}
 </summary>
 {v ? (
 <div className="px-4 py-3">
 <p className="text-xs text-muted-foreground">
 {v.fullName} · {v.passedTests}/{v.totalTests} test · {v.verdict ||"—"}
 {v.verifiedComment ? <span className="text-muted-foreground"> · “{v.verifiedComment}”</span> :""}
 </p>
 <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 font-mono text-xs">
 {v.code}
 </pre>
 </div>
 ) : (
 <p className="px-4 py-3 text-sm text-muted-foreground">Vòng này chưa có giải được xác thực.</p>
 )}
 </details>
 );
 })
 )}
 </div>
 </div>
 );
}

function statusLabel(s: string) {
 return {
 countdown:"Đếm ngược",
 lobby:"Phòng chờ",
 in_progress:"Đang giải",
 judging:"Đang chấm",
 reveal:"Công bố kết quả",
 podium:"Vinh danh",
 finished:"Kết thúc",
 }[s] || s;
}
