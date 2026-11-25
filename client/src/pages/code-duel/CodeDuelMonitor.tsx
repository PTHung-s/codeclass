import { useState, useEffect } from"react";
import { useParams, Link } from"react-router-dom";
import { ArrowLeft, Eye, EyeOff, AlertTriangle, Users, Pause, Play, Plus, Maximize2, Minimize2, UserMinus, Wifi, WifiOff, Loader2 } from"lucide-react";
import { useCodeDuelMatch } from"../../hooks/useCodeDuelMatch";
import { useAuthContext } from"../../contexts/AuthContext";
import api from"../../lib/api";
import { useToast } from"../../hooks/useToast";
import { useConfirmContext } from"../../hooks/useConfirm";
import { CodeDuelJudging } from"../../components/code-duel/CodeDuelJudging";
import { socketSubscribe } from"../../lib/socket";
import { StudentName } from"../../components/ui/StudentName";

export default function CodeDuelMonitor() {
 const { id } = useParams<{ id: string }>();
 const { user } = useAuthContext();
 const toast = useToast();
 const confirm = useConfirmContext();
 const { state, panelStates, tabEvents, connected, refresh, judgingResults, judgingTotal } = useCodeDuelMatch(id || null, user?.id);
 const [viewFull, setViewFull] = useState<Record<string, boolean>>({});
 const [oversub, setOversub] = useState<Record<string, { passed: number; total: number }>>({});

 // Load per-student test progress (current round) from the board endpoint so
 // each mini-terminal can show"% tests passed" live, like the mockup.
 useEffect(() => {
 if (!id) return;
 api.get(`/code-duel/${id}/board`).then((res) => {
 if (res.data?.rows) {
 const idx = res.data.currentRoundIndex ?? -1;
 const map: Record<string, { passed: number; total: number }> = {};
 for (const r of res.data.rows) {
 const rnd = (r.rounds || []).find((x: any) => x.orderIndex === idx);
 if (rnd) map[r.userId] = { passed: rnd.passedTests ?? 0, total: rnd.totalTests ?? 0 };
 }
 setOversub(map);
 }
 }).catch(() => {});
 }, [id, state?.match?.status, state?.match?.currentRoundIndex]);

 const toggleFull = (userId: string) => setViewFull((v) => ({ ...v, [userId]: !v[userId] }));

 const toggleLeaderboard = async () => {
 if (!state) return;
 try {
 await api.post(`/code-duel/${state.match.id}/leaderboard`, { visible: !state.match.leaderboardVisible });
 refresh();
 } catch (err: any) {
 toast.error({ title:"Không đổi được", message: err?.response?.data?.error ||"Đã có lỗi." });
 }
 };

 const togglePause = async () => {
 if (!state) return;
 try {
 await api.post(`/code-duel/${state.match.id}/${state.match.paused ?"resume" :"pause"}`);
 refresh();
 } catch (err: any) {
 toast.error({ title:"Không đổi được", message: err?.response?.data?.error ||"Đã có lỗi." });
 }
 };

 const extend = async (seconds: number) => {
 if (!state) return;
 try {
 await api.post(`/code-duel/${state.match.id}/extend`, { seconds });
 refresh();
 } catch (err: any) {
 toast.error({ title:"Không kéo dài được", message: err?.response?.data?.error ||"Đã có lỗi." });
 }
 };

 const [presence, setPresence] = useState<Record<string, { online: boolean; kicked: boolean; outTabCount: number }>>({});
 const [presenceUpdatedAt, setPresenceUpdatedAt] = useState<Date | null>(null);
 const [presenceUnavailable, setPresenceUnavailable] = useState(false);
 const [kicking, setKicking] = useState<string | null>(null);

 useEffect(() => {
 if (!id) return;
 const loadPresence = () => {
 api.get(`/code-duel/${id}/presence`)
 .then((res) => {
 const map: Record<string, { online: boolean; kicked: boolean; outTabCount: number }> = {};
 for (const p of res.data || []) map[p.userId] = p;
 setPresence(map);
 setPresenceUpdatedAt(new Date());
 setPresenceUnavailable(false);
 })
 .catch(() => setPresenceUnavailable(true));
 };
 loadPresence();
 // The socket handles joins/leaves during normal operation. REST remains a
 // low-frequency recovery path for a failed socket or a missed event.
 const unsub = socketSubscribe((message) => {
 if (message.type !=="code_duel_presence" || message.payload?.matchId !== id) return;
 setPresence((previous) => ({
 ...previous,
 [message.payload.userId]: { ...previous[message.payload.userId], online: Boolean(message.payload.online) },
 }));
 setPresenceUpdatedAt(new Date());
 setPresenceUnavailable(false);
 });
 const t = !connected ? setInterval(loadPresence, 10_000) : undefined;
 return () => { unsub(); if (t) clearInterval(t); };
 }, [id, connected]);

 const kick = async (userId: string, fullName: string) => {
 const ok = await confirm({
 title: "Loại học sinh",
 message: `Loại "${fullName}" khỏi trận? Em này sẽ bị khóa cho đến khi giáo viên mở lại quyền vào phòng.`,
 confirmLabel: "Loại",
 variant: "danger",
 });
 if (!ok) return;
 setKicking(userId);
 try {
 await api.post(`/code-duel/${id}/kick`, { userId });
 toast.success({ title:"Đã loại học sinh", message: `${fullName} đã bị khỏi trận.` });
 refresh();
 } catch (err: any) {
 toast.error({ title:"Loại thất bại", message: err?.response?.data?.error ||"Đã có lỗi." });
 } finally {
 setKicking(null);
 }
 };

 if (!state) return <div className="py-16 text-center text-muted-foreground">Đang tải...</div>;

 const players = state.players || [];
 const offlineCount = players.filter((p) => presence[p.userId] && !presence[p.userId].online).length;

 // During the judging phase, teachers watch the same live judging stage as
 // students — results stream in one by one.
 if (state.match.status ==="judging") {
 return (
 <div className="mx-auto max-w-7xl space-y-4 px-4 py-5">
 <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
 <div>
 <Link to={`/code-duel/${state.match.id}/game`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
 <ArrowLeft className="h-4 w-4" /> Về trận đấu
 </Link>
 <h1 className="mt-1 flex items-center gap-2 text-lg font-bold text-foreground">
 <Eye className="h-5 w-5 text-primary" /> Giám sát · {state.match.title}
 </h1>
 </div>
 </div>
 <CodeDuelJudging
 results={judgingResults || {}}
 total={judgingTotal}
 players={players}
 />
 </div>
 );
 }

 return (
 <div className="mx-auto max-w-7xl space-y-4 px-4 py-5">
 <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
 <div>
 <Link to={`/code-duel/${state.match.id}/game`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
 <ArrowLeft className="h-4 w-4" /> Về trận đấu
 </Link>
 <h1 className="mt-1 flex items-center gap-2 text-lg font-bold text-foreground">
 <Eye className="h-5 w-5 text-primary" /> Giám sát · {state.match.title}
 </h1>
 </div>
 <div className="flex items-center gap-3">
 <span className={`rounded-full px-3 py-1 text-xs font-semibold ${connected ?"bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" :"bg-rose-500/15 text-rose-700 dark:text-rose-400"}`}>
 {connected ?"Kết nối trực tiếp" :"Mất kết nối"}
 </span>
 <button
 onClick={toggleLeaderboard}
 className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted"
 >
 {state.match.leaderboardVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
 {state.match.leaderboardVisible ?"Bảng xếp hạng đang hiện" :"Bảng xếp hạng đang ẩn"}
 </button>
 {["in_progress","countdown"].includes(state.match.status) && (
 <button
 onClick={togglePause}
 className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted ${state.match.paused ?"bg-amber-500/10" :"border-input text-foreground"}`}
 >
 {state.match.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
 {state.match.paused ?"Tiếp tục" :"Tạm dừng"}
 </button>
 )}
 {state.match.status ==="in_progress" && (
 <>
 <button
 onClick={() => extend(60)}
 title="Kéo dài thêm 1 phút"
 className="inline-flex items-center gap-1 rounded-lg border border-input px-2.5 py-1.5 text-sm font-semibold text-foreground hover:bg-muted"
 >
 <Plus className="h-4 w-4" />1'
 </button>
 <button
 onClick={() => extend(300)}
 title="Kéo dài thêm 5 phút"
 className="inline-flex items-center gap-1 rounded-lg border border-input px-2.5 py-1.5 text-sm font-semibold text-foreground hover:bg-muted"
 >
 <Plus className="h-4 w-4" />5'
 </button>
 </>
 )}
 </div>
 </div>

 <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
 {/* Live code wall */}
 <div>
 <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
 <Users className="h-4 w-4" /> Bức tường mã ({players.length} học sinh{offlineCount ? ` · ${offlineCount} ngoại tuyến` :""})
 {presenceUpdatedAt && <span className="ml-auto text-xs font-normal text-muted-foreground">Cập nhật {presenceUpdatedAt.toLocaleTimeString("vi-VN", { hour:"2-digit", minute:"2-digit", second:"2-digit" })}</span>}
 </div>
 {players.length === 0 ? (
 <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
 Chưa có học sinh nào trong trận.
 </div>
 ) : (
 <div className="grid gap-3 md:grid-cols-2">
 {players.map((p) => {
 const panel = panelStates[p.userId];
 const tab = tabEvents[p.userId];
 const prog = oversub[p.userId];
 const pct = prog && prog.total > 0 ? Math.round((prog.passed / prog.total) * 100) : null;
 const isFull = viewFull[p.userId];
 const pres = presence[p.userId];
 const isOnline = pres?.online ?? false;
 const isKicked = pres?.kicked;
 return (
 <div key={p.userId} className={`overflow-hidden rounded-lg border ${isKicked ?"border-rose-500/40 opacity-60" : tab?.out ?"border-amber-500/60" :"border-border"} bg-card`}>
 {/* Terminal header */}
 <div className="flex items-center justify-between border-b border-border bg-muted/60 px-3 py-2">
 <div className="flex min-w-0 items-center gap-2">
 {isKicked ? (
 <span className="shrink-0 text-[10px] font-bold">🚫</span>
 ) : isOnline ? (
 <Wifi className="h-3.5 w-3.5 shrink-0" />
 ) : (
 <WifiOff className="h-3.5 w-3.5 shrink-0" />
 )}
 <StudentName fullName={p.fullName} nickname={p.nickname} className="min-w-0 flex-1" primaryClassName="font-mono text-sm font-semibold text-foreground" />
 {isKicked && <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold">Đã loại</span>}
 </div>
 <div className="flex items-center gap-2">
 {!isOnline && !isKicked && <span className="font-mono text-[10px]">offline</span>}
 {pct !== null ? (
 <span className={`font-mono text-xs font-bold ${pct === 100 ?"text-emerald-600 dark:text-emerald-400" :"text-primary"}`}>
 {pct}% tests passed
 </span>
 ) : panel?.hasCode ? (
 <span className="font-mono text-[10px] text-muted-foreground">Đang soạn…</span>
 ) : (
 <span className="font-mono text-[10px] text-muted-foreground">Chưa gõ</span>
 )}
 {tab && tab.out && tab.outTabCount > 0 && (
 <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
 <AlertTriangle className="h-3 w-3" /> ×{tab.outTabCount}
 </span>
 )}
 </div>
 </div>
 {/* Code body */}
 <div className={isFull ?"max-h-[70vh] overflow-auto bg-black/60 p-3" :"max-h-40 overflow-auto bg-black/60 p-3"}>
 {panel?.code ? (
 <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-100">{panel.code}</pre>
 ) : (
 <p className="py-6 text-center font-mono text-xs text-zinc-400">
 {tab?.out ?"Đang rời tab…" : panel?.hasCode ?"Đang soạn…" :"Chưa bắt đầu gõ"}
 </p>
 )}
 </div>
 {/* Terminal footer actions */}
 <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 px-2 py-1">
 <button
 onClick={() => kick(p.userId, p.fullName)}
 disabled={kicking === p.userId || isKicked}
 className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold disabled:opacity-40"
 >
 {kicking === p.userId ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserMinus className="h-3 w-3" />}
 {isKicked ?"Đã loại" :"Loại"}
 </button>
 <button
 onClick={() => toggleFull(p.userId)}
 className="font-mono text-[10px] font-semibold text-primary hover:text-primary"
 >
 {isFull ? (<span className="inline-flex items-center gap-1"><Minimize2 className="h-3 w-3" /> GRAD</span>) : (<span className="inline-flex items-center gap-1"><Maximize2 className="h-3 w-3" /> VIEW FULL</span>)}
 </button>
 </div>
 </div>
 );
 })}
 </div>
 )}
 {presenceUnavailable && <p className="mt-2 text-xs">Không thể làm mới trạng thái online; dữ liệu gần nhất vẫn được giữ lại.</p>}
 </div>

 {/* Live rankings sidebar */}
 <aside className="space-y-3">
 <h2 className="text-sm font-bold text-foreground">Điểm toàn trận</h2>
 <div className="overflow-hidden rounded-xl border border-border bg-card">
 {players.length === 0 ? (
 <p className="p-4 text-center text-xs text-muted-foreground">Chưa có dữ liệu.</p>
 ) : (
 [...players]
 .sort((a, b) => b.totalScore - a.totalScore)
 .map((p, i) => (
 <div key={p.userId} className="flex items-center justify-between border-b border-border px-3 py-2 text-sm">
 <span className="flex items-center gap-2 text-foreground">
 <span className="w-5 text-center font-bold text-muted-foreground">{i + 1}</span>
 <StudentName fullName={p.fullName} nickname={p.nickname} className="min-w-0 flex-1" primaryClassName="text-sm" />
 </span>
 <span className="font-mono font-semibold text-foreground">{p.totalScore}</span>
 </div>
 ))
 )}
 </div>
 </aside>
 </div>
 </div>
 );
}
