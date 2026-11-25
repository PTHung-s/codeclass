import { useEffect, useState } from"react";
import { Link } from"react-router-dom";
import {
 Swords, Play, Users, FileCode2, Trophy, Coins, Sparkles, Loader2,
 ArrowRight, Eye, XCircle, RefreshCw, Plus, Activity,
} from"lucide-react";
import api from"../../lib/api";
import { useToast } from"../../hooks/useToast";

interface DashMatch {
 id: string;
 title: string;
 status: string;
 language: string;
 currentRoundIndex: number;
 roundEndsAt: string | null;
 createdAt: string;
 createdBy: { id: string; fullName: string } | null;
 playersCount: number;
 roundsCount: number;
}
interface Dash {
 summary: {
 totalMatches: number; draft: number; lobby: number; live: number; finished: number;
 totalPlayers: number; totalSubmissions: number; totalXpAwarded: number; totalTokensAwarded: number;
 };
 matches: DashMatch[];
}

const statusLabel: Record<string, string> = {
 draft:"Nháp", lobby:"Phòng chờ", countdown:"Đếm ngược", in_progress:"Đang diễn ra",
 judging:"Đang chấm", reveal:"Công bố", podium:"Vinh danh", finished:"Kết thúc",
};
const statusColor: Record<string, string> = {
 draft:"", lobby:"",
 in_progress:"", judging:"",
 reveal:"bg-primary/10 text-primary", podium:"",
 finished:"",
};

function card(label: string, value: number | string, icon: React.ReactNode, accent: string) {
 return (
 <div className="rounded-xl border border-border bg-card p-4">
 <div className="flex items-center justify-between">
 <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
 <span className={accent}>{icon}</span>
 </div>
 <p className="mt-2 text-2xl font-extrabold text-foreground">{value}</p>
 </div>
 );
}

/** Bảng điều khiển giáo viên / quản trị — thống kê + điều khiển mọi trận.
 * Role teacher == admin == teaching_assistant (đều là staff). */
export default function CodeDuelDashboard() {
 const toast = useToast();
 const [dash, setDash] = useState<Dash | null>(null);
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState<string | null>(null);

 const load = () => {
 api.get<Dash>("/code-duel/stats")
 .then((res) => setDash(res.data))
 .catch((e) => toast.error({ title:"Không tải được", message: e?.response?.data?.error ||"Lỗi." }))
 .finally(() => setLoading(false));
 };
 useEffect(() => { load(); }, []);

 const act = async (id: string, endpoint: string, ok: string) => {
 setBusy(id);
 try { await api.post(`/code-duel/${id}/${endpoint}`); toast.success({ title: ok }); load(); }
 catch (e: any) { toast.error({ title:"Thất bại", message: e?.response?.data?.error ||"Lỗi." }); }
 finally { setBusy(null); }
 };

 if (loading) return <div className="py-16 text-center text-muted-foreground">Đang tải bảng điều khiển…</div>;
 if (!dash) return <div className="py-16 text-center text-muted-foreground">Không có dữ liệu (cần quyền giáo viên/admin).</div>;

 const s = dash.summary;
 return (
 <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
 <div className="flex flex-wrap items-center justify-between gap-4">
 <div>
 <h1 className="flex items-center gap-2 text-2xl font-extrabold text-foreground">
 <Swords className="h-6 w-6 text-primary" /> Bảng điều khiển Code Duel
 </h1>
 <p className="mt-0.5 text-sm text-muted-foreground">
 Quản trị & giáo viên · giám sát, điều phối các trận đấu code nhanh.
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Link to="/code-duel" className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
 <Swords className="h-4 w-4" /> Danh sách trận
 </Link>
 <Link to="/code-duel/new" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary">
 <Plus className="h-4 w-4" /> Tạo trận
 </Link>
 </div>
 </div>

 {/* Summary cards */}
 <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
 {card("Tổng trận", s.totalMatches, <Activity className="h-5 w-5" />,"text-primary")}
 {card("Đang diễn ra", s.live, <Play className="h-5 w-5" />,"")}
 {card("Học sinh tham gia", s.totalPlayers, <Users className="h-5 w-5" />,"")}
 {card("Bài nộp", s.totalSubmissions, <FileCode2 className="h-5 w-5" />,"")}
 {card("Chờ (lobby)", s.lobby, <Sparkles className="h-5 w-5" />,"")}
 {card("Đã kết thúc", s.finished, <Trophy className="h-5 w-5" />,"")}
 {card("XP đã phát", s.totalXpAwarded.toLocaleString("vi-VN"), <Coins className="h-5 w-5" />,"")}
 {card("Token đã phát", s.totalTokensAwarded.toLocaleString("vi-VN"), <Coins className="h-5 w-5" />,"")}
 </div>

 {/* Matches table */}
 <div className="overflow-hidden rounded-xl border border-border bg-card">
 <div className="border-b border-border px-4 py-3 text-sm font-bold text-foreground">Tất cả trận đấu</div>
 {dash.matches.length === 0 ? (
 <p className="p-8 text-center text-sm text-muted-foreground">Chưa có trận nào. Tạo trận đầu tiên.</p>
 ) : (
 <div className="divide-y divide-border">
 {dash.matches.map((m) => {
 const live = ["countdown","in_progress","judging","reveal"].includes(m.status);
 const dur = m.roundEndsAt ? Math.max(0, Math.ceil((new Date(m.roundEndsAt).getTime() - Date.now()) / 1000)) : 0;
 return (
 <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <Link to={`/code-duel/${m.id}`} className="truncate font-semibold text-foreground hover:text-primary">
 {m.title}
 </Link>
 <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor[m.status] ||""}`}>
 {statusLabel[m.status] || m.status}
 </span>
 </div>
 <p className="mt-0.5 truncate text-xs text-muted-foreground">
 {m.roundsCount} câu · {m.playersCount} HS · {m.language ==="cpp" ?"C++" : m.language ==="both" ?"Python+C++" :"Python"}
 {live && dur > 0 ? ` · còn ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2,"0")}` :""}
 {m.createdBy ? ` · ${m.createdBy.fullName}` :""}
 </p>
 </div>
 <div className="flex flex-wrap items-center gap-1.5">
 {m.status !=="draft" && (
 <Link to={`/code-duel/${m.id}/monitor`} className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted">
 <Eye className="h-3.5 w-3.5" /> Giám sát
 </Link>
 )}
 <Link to={`/code-duel/${m.id}/leaderboard`} className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted">
 <Trophy className="h-3.5 w-3.5" /> Bảng
 </Link>
 {m.status ==="draft" && (
 <button onClick={() => act(m.id,"lobby","Đã mở phòng chờ")} disabled={busy === m.id}
 className="inline-flex items-center gap-1 rounded-md border border-primary px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50">
 <Play className="h-3.5 w-3.5" /> Mở phòng
 </button>
 )}
 {m.status ==="lobby" && (
 <button onClick={() => act(m.id,"start","Đã bắt đầu")} disabled={busy === m.id}
 className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-emerald-500/10 disabled:opacity-50">
 <Play className="h-3.5 w-3.5" /> Bắt đầu
 </button>
 )}
 {m.status ==="podium" && (
 <button onClick={() => act(m.id,"reset","Đã chơi lại (nháp)")} disabled={busy === m.id}
 className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-amber-500/10 disabled:opacity-50">
 <RefreshCw className="h-3.5 w-3.5" /> Chơi lại
 </button>
 )}
 {(live || m.status ==="lobby") && (
 <button onClick={() => act(m.id,"end","Đã kết thúc trận")} disabled={busy === m.id}
 className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-red-500/10 disabled:opacity-50">
 <XCircle className="h-3.5 w-3.5" /> Kết thúc
 </button>
 )}
 <Link to={`/code-duel/${m.id}`} className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted">
 <ArrowRight className="h-3.5 w-3.5" /> Mở
 </Link>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>
 </div>
 );
}