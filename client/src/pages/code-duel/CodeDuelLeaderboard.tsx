import { useEffect, useState } from"react";
import { useParams, Link } from"react-router-dom";
import { ArrowLeft, Users, ShieldCheck } from"lucide-react";
import api from"../../lib/api";
import { useAuthContext } from"../../contexts/AuthContext";
import { socketIsOpen, socketSubscribe } from"../../lib/socket";

interface RoundStat {
 orderIndex: number;
 verdict: string | null;
 passedTests: number;
 totalTests: number;
 acceptedAt: string | null;
}
interface BoardRow {
 userId: string;
 fullName: string;
 avatarUrl: string | null;
 totalScore: number;
 finalRank: number | null;
 rounds: RoundStat[];
}
interface Board {
 hidden: boolean;
 match: {
 id: string;
 title: string;
 status: string;
 roundsCount: number;
 currentRoundIndex: number;
 totalRounds: number | null;
 paused: boolean;
 isStaff: boolean;
 };
 currentRoundIndex: number;
 remainingSeconds: number;
 rows: BoardRow[];
}

const medalColor = ["/60","/60","/60"];

function fmtClock(s: number) {
 const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
 return [h, m, sec].map((n) => String(n).padStart(2,"0")).join(":");
}

/** Whole-match cumulative leaderboard (per-round column grid), live. */
export default function CodeDuelLeaderboard() {
 const { id } = useParams<{ id: string }>();
 const { user } = useAuthContext();
 const [board, setBoard] = useState<Board | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [prevRank, setPrevRank] = useState<Record<string, number>>({});

 const load = () => {
 api.get<Board>(`/code-duel/${id}/board`).then((res) => {
 setBoard(res.data);
 setError(null);
 }).catch((e) => setError(e?.response?.data?.error ||"Không thể tải bảng xếp hạng."));
 };

 useEffect(() => {
 load();
 // A server state change is an immediate refresh signal. Keep a slow REST
 // fallback only if the shared socket is unavailable.
 const unsub = socketSubscribe((message) => {
 if (["code_duel_state","code_duel_phase","__socket_open"].includes(message.type)) load();
 });
 const t = setInterval(() => { if (!socketIsOpen()) load(); }, 15_000);
 return () => { unsub(); clearInterval(t); };
 }, [id]);

 // Track rank movements for the ▲▼ delta arrows.
 useEffect(() => {
 if (!board?.rows) return;
 const map: Record<string, number> = {};
 board.rows.forEach((r, i) => (map[r.userId] = i + 1));
 if (Object.keys(prevRank).length === 0) setPrevRank(map);
 }, [board?.rows]);

 const rankDelta = (userId: string, rank: number):"up" |"down" |"same" => {
 const before = prevRank[userId];
 if (!before) return"same";
 if (rank < before) return"up";
 if (rank > before) return"down";
 return"same";
 };

 if (!board) return <div className="py-16 text-center text-muted-foreground">Đang tải bảng xếp hạng…</div>;
 if (error) return <div className="py-16 text-center text-muted-foreground">{error}</div>;

 const roundCount = Math.max(board.match.roundsCount, board.match.currentRoundIndex + 1);
 const progressPct = roundCount > 0 ? Math.round(((board.match.currentRoundIndex + 1) / roundCount) * 100) : 0;
 const lowTime = board.match.status ==="in_progress" && board.remainingSeconds <= 60 && !board.match.paused;

 return (
 <div className="mx-auto max-w-6xl space-y-4 px-4 py-5">
 <div className="flex items-center justify-between">
 <Link to={`/code-duel/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
 <ArrowLeft className="h-4 w-4" /> Về trận đấu
 </Link>
 <Link to={`/code-duel/${id}/history`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
 <ShieldCheck className="h-4 w-4" /> Giải verified
 </Link>
 </div>

 {/* Header: round progress + countdown */}
 <header className="rounded-xl border border-border bg-card p-4">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <h1 className="text-xl font-extrabold tracking-tight text-foreground">{board.match.title}</h1>
 <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">
 Giai đoạn {board.match.currentRoundIndex + 1} / {roundCount ||"—"}
 </p>
 </div>
 <div className="flex flex-col items-end">
 {board.match.status ==="in_progress" && (
 <span className={`font-mono text-2xl font-bold tracking-wider ${lowTime ?" animate-pulse" :"text-foreground"}`}>
 {fmtClock(board.remainingSeconds)} CÒN LẠI
 </span>
 )}
 {board.match.status ==="podium" && <span className="text-lg font-bold">🏆 Đã kết thúc</span>}
 </div>
 </div>
 <div className="mt-3 flex items-center gap-3">
 <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
 <div className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
 </div>
 <span className="font-mono text-xs text-muted-foreground">{progressPct}%</span>
 </div>
 </header>

 {/* Table */}
 <div className="overflow-x-auto rounded-xl border border-border bg-card">
 <div className="grid min-w-[640px] grid-cols-[3rem_minmax(0,1fr)_5rem_repeat(1,minmax(4.5rem,1fr))] items-center gap-2 border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
 style={{ gridTemplateColumns: `3rem minmax(0,1fr) 5rem repeat(${roundCount}, minmax(4.5rem,1fr))` }}>
 <span className="text-center">Hạng</span>
 <span>Coder</span>
 <span className="text-right">Điểm</span>
 {board.rows[0]?.rounds.map((r) => (
 <span key={r.orderIndex} className="text-center">Bài {r.orderIndex + 1}</span>
 ))}
 </div>
 <div>
 {board.rows.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Chưa có kết quả.</div>}
 {board.rows.map((row, i) => {
 const rank = i + 1;
 const isMe = user?.id === row.userId;
 const medal = i < 3 ? medalColor[i] :"border-white/10";
 const delta = rankDelta(row.userId, rank);
 return (
 <div key={row.userId} className={`relative grid items-center border-b border-border/50 px-3 py-2.5 text-sm transition-colors ${isMe ?"scan-row bg-primary-con" :"hover:bg-muted/40"}`}
 style={{ gridTemplateColumns: `3rem minmax(0,1fr) 5rem repeat(${roundCount}, minmax(4.5rem,1fr))` }}>
 <span className="flex items-center justify-center text-center">
 <span className={`font-mono text-lg font-bold ${i < 3 ?"text-foreground" :"text-muted-foreground"}`}>{rank}</span>
 </span>
 <span className="flex items-center gap-2 min-w-0">
 <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border bg-muted text-xs font-bold ${medal}`}>
 {row.avatarUrl ? <img src={row.avatarUrl} className="h-full w-full rounded-full object-cover" alt="" /> : row.fullName.charAt(0).toUpperCase()}
 </span>
 <span className="truncate font-semibold text-foreground">
 {isMe ?"Bạn ·" :""}{row.fullName}
 </span>
 {delta !=="same" && (
 <span className={`shrink-0 text-xs font-bold ${delta ==="up" ?"" :""}`}>
 {delta ==="up" ?"▲" :"▼"} {Math.abs((prevRank[row.userId] || rank) - rank)}
 </span>
 )}
 </span>
 <span className="text-right font-mono font-bold text-primary">{row.totalScore}</span>
 {row.rounds.map((r) => (
 <span key={r.orderIndex} className="flex flex-col items-center text-center">
 {r.verdict ? (
 <>
 <span className={`text-xs font-bold ${r.verdict ==="AC" ?"" :""}`}>{r.verdict}</span>
 <span className="text-[10px] text-muted-foreground">{r.acceptedAt ? r.acceptedAt.slice(11, 19) : `${r.passedTests}/${r.totalTests}`}</span>
 </>
 ) : (
 <span className="text-xs text-muted-foreground">—</span>
 )}
 </span>
 ))}
 </div>
 );
 })}
 </div>
 </div>
 </div>
 );
}
