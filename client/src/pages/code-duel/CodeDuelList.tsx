import { useEffect, useState } from"react";
import { Link } from"react-router-dom";
import { Plus, Swords, Users, Clock, Play, Trash2, Eye, XCircle, Loader2, FilePenLine } from"lucide-react";
import api from"../../lib/api";
import { useAuthContext } from"../../contexts/AuthContext";
import { useToast } from"../../hooks/useToast";
import { useConfirmContext } from"../../hooks/useConfirm";
import { CodeDuelMatchSummary } from"../../lib/codeDuelTypes";

const statusLabel: Record<string, string> = {
 draft:"Nháp",
 lobby:"Phòng chờ",
 countdown:"Đếm ngược",
 in_progress:"Đang diễn ra",
 reveal:"Công bố",
 podium:"Vinh danh",
 finished:"Đã kết thúc",
};

const statusColor: Record<string, string> = {
 draft:"",
 in_progress:"",
 reveal:"",
 podium:"",
 finished:"",
};

export default function CodeDuelList() {
 const { user } = useAuthContext();
 const toast = useToast();
 const confirm = useConfirmContext();
 const isStaff = ["teacher","admin","teaching_assistant"].includes(user?.role ||"");
 const [items, setItems] = useState<CodeDuelMatchSummary[]>([]);
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState<string | null>(null);

 const load = async () => {
 try {
 const res = await api.get<CodeDuelMatchSummary[]>("/code-duel");
 setItems(res.data);
 } catch {}
 };

 useEffect(() => {
 api
 .get<CodeDuelMatchSummary[]>("/code-duel")
 .then((res) => setItems(res.data))
 .catch(() => {})
 .finally(() => setLoading(false));
 }, []);

 const act = async (id: string, endpoint: string, msg: { ok: string; fail: string }) => {
 setBusy(id);
 try {
 await api.post(`/code-duel/${id}/${endpoint}`);
 toast.success({ title: msg.ok });
 await load();
 } catch (err: any) {
 toast.error({ title:"Thất bại", message: err?.response?.data?.error || msg.fail });
 } finally {
 setBusy(null);
 }
 };

 const remove = async (m: CodeDuelMatchSummary) => {
 const ok = await confirm({
 title: "Xóa trận đấu",
 message: `Xóa trận "${m.title}"? Hành động này không thể hoàn tác.`,
 confirmLabel: "Xóa",
 variant: "danger",
 });
 if (!ok) return;
 // No delete route yet → 404 path; flag so user knows it's not wired.
 try {
 await api.delete(`/code-duel/${m.id}`);
 toast.success({ title:"Đã xóa trận đấu" });
 await load();
 } catch (err: any) {
 toast.error({ title:"Xóa thất bại", message: err?.response?.data?.error ||"Không có route xóa trận đấu." });
 }
 };

 return (
 <div className="mx-auto max-w-5xl space-y-6">
 <div className="flex flex-wrap items-center justify-between gap-4">
 <div>
 <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
 <Swords className="h-6 w-6 text-primary" />
 Code Duel · Đấu trường code nhanh
 </h1>
 <p className="mt-1 text-sm text-muted-foreground">
 Cùng một đề bài, cùng đồng hồ — ai nộp đúng trước khi hết giờ sẽ thắng.
 </p>
 </div>
 {isStaff && (
 <div className="flex items-center gap-2">
 <Link
 to="/code-duel/dashboard"
 className="inline-flex items-center gap-2 rounded-lg border border-input px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
 >
 <Swords className="h-4 w-4" /> Bảng điều khiển
 </Link>
 <Link
 to="/code-duel/new"
 className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
 >
 <Plus className="h-4 w-4" /> Tạo trận đấu
 </Link>
 </div>
 )}
 </div>

 {loading ? (
 <div className="py-16 text-center text-muted-foreground">Đang tải...</div>
 ) : items.length === 0 ? (
 <div className="rounded-xl border border-dashed border-border bg-card p-16 text-center text-muted-foreground">
 {isStaff
 ?"Chưa có trận đấu nào. Tạo một trận để bắt đầu!"
 :"Chưa có trận đấu nào dành cho bạn."}
 </div>
 ) : (
 <div className="grid gap-4 sm:grid-cols-2">
 {items.map((m) => (
 <article
 key={m.id}
 className="group rounded-xl border border-border bg-card transition-colors hover:border-primary/30 hover:shadow-md"
 >
 <Link to={`/code-duel/${m.id}`} className="block p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
 <div className="flex items-center justify-between gap-2">
 <h3 className="font-semibold text-foreground group-hover:text-primary">
 {m.title}
 </h3>
 <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor[m.status] ||""}`}>
 {statusLabel[m.status] || m.status}
 </span>
 </div>
 <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
 <span className="flex items-center gap-1">
 <Users className="h-3.5 w-3.5" />
 {m._count?.rounds ?? 0} câu hỏi
 </span>
 <span className="uppercase">{m.language ==="cpp" ?"C++" : m.language ==="both" ?"Python + C++" :"Python"}</span>
 {m.status ==="in_progress" && m.roundEndsAt && (
 <span className="flex items-center gap-1 text-primary">
 <Clock className="h-3.5 w-3.5" /> Đang diễn ra
 </span>
 )}
 </div>
 {isStaff && m.status ==="draft" && (
 <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-primary">
 <Play className="h-3.5 w-3.5" /> Vào soạn thảo
 </div>
 )}

 </Link>
 {isStaff && (
 <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-5 py-3">
 <Link
 to={`/code-duel/${m.id}/leaderboard`}
 className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
 >
 <Eye className="h-3.5 w-3.5" /> Bảng xếp hạng
 </Link>
 {m.status ==="draft" || m.status ==="lobby" ? (
 <Link
 to={`/code-duel/${m.id}/authoring`}
 className="inline-flex items-center gap-1 rounded-md border border-primary px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
 >
 <FilePenLine className="h-3.5 w-3.5" /> Soạn đề
 </Link>
 ) : m.status ==="podium" ? (
 <button
 onClick={() => act(m.id,"reset", { ok:"Đã chơi lại (nháp)", fail:"Không chơi lại được" })}
 disabled={busy === m.id}
 className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-amber-500/10 disabled:opacity-50"
 >
 {busy === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
 Chơi lại
 </button>
 ) : (
 <button
 onClick={() => act(m.id,"end", { ok:"Đã kết thúc trận đấu", fail:"Không kết thúc được" })}
 disabled={busy === m.id}
 className="inline-flex items-center gap-1 rounded-md border border-error/60 px-2 py-1 text-xs font-semibold hover:bg-red-500/10 disabled:opacity-50"
 >
 {busy === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
 Kết thúc
 </button>
 )}
 <button
 onClick={() => remove(m)}
 disabled={busy === m.id}
 title="Xóa trận"
 className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-red-500/10 disabled:opacity-50"
 >
 {busy === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
 Xóa
 </button>
 </div>
 )}
 </article>
 ))}
 </div>
 )}
 </div>
 );
}
