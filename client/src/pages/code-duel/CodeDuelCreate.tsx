import { useState, useEffect } from"react";
import { useNavigate, Link } from"react-router-dom";
import { ArrowLeft, Swords, Users, Coins } from"lucide-react";
import api from"../../lib/api";
import { useToast } from"../../hooks/useToast";

interface StudentOption {
 id: string;
 fullName: string;
 email: string;
}
interface CourseOption {
 id: string;
 title: string;
}

export default function CodeDuelCreate() {
 const navigate = useNavigate();
 const toast = useToast();
 const [title, setTitle] = useState("");
 const [courseId, setCourseId] = useState("");
 const [language, setLanguage] = useState<"python" |"cpp" |"both">("python");
 const [level, setLevel] = useState("Cấp 2 / THCS");
 const [totalRounds, setTotalRounds] = useState("");
 const [pointsPerProblem, setPointsPerProblem] = useState("10");
 const [scheduledStartAt, setScheduledStartAt] = useState("");
 const [players, setPlayers] = useState<string[]>([]);
 const [search, setSearch] = useState("");
 const [students, setStudents] = useState<StudentOption[]>([]);
 const [courses, setCourses] = useState<CourseOption[]>([]);
 const [submitting, setSubmitting] = useState(false);
 // Rewards (tokens / XP)
 const [reward, setReward] = useState({
 participateTokens: 2,
 participateXp: 15,
 topTokens: [50, 30, 15],
 topXp: [60, 40, 25],
 verifiedTokens: 10,
 verifiedXp: 20,
 });

 useEffect(() => {
 const load = async () => {
 try {
 const [s, c] = await Promise.all([
 api.get("/users?limit=200&role=student").then((r) => (Array.isArray(r.data) ? r.data : r.data?.users || [])),
 api.get("/courses").then((r) => (Array.isArray(r.data) ? r.data : r.data?.courses || [])),
 ]);
 setStudents(s);
 setCourses(c);
 } catch {}
 };
 load();
 }, []);

 const matches = students
 .filter((s) => !players.includes(s.id))
 .filter((s) => `${s.fullName} ${s.email}`.toLowerCase().includes(search.toLowerCase()))
 .slice(0, 8);

 const togglePlayer = (id: string) =>
 setPlayers((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

 const create = async () => {
 if (!title.trim()) {
 toast.error({ title:"Cần nhập tên trận đấu" });
 return;
 }
 setSubmitting(true);
 try {
 const res = await api.post("/code-duel", {
 title: title.trim(),
 courseId: courseId || undefined,
 language,
 playerIds: players,
 level,
 totalRounds: totalRounds && Number(totalRounds) > 0 ? Number(totalRounds) : null,
 pointsPerProblem: Number(pointsPerProblem) > 0 ? Number(pointsPerProblem) : 1,
 scheduledStartAt: scheduledStartAt || null,
 rewards: reward,
 });
 navigate(`/code-duel/${res.data.id}`);
 } catch (err: any) {
 toast.error({ title:"Tạo thất bại", message: err?.response?.data?.error ||"Đã có lỗi xảy ra." });
 setSubmitting(false);
 }
 };

 return (
 <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
 <Link to="/code-duel" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
 <ArrowLeft className="h-4 w-4" /> Quay lại
 </Link>

 <div>
 <h1 className="flex items-center gap-2 text-2xl font-extrabold text-foreground">
 <Swords className="h-6 w-6 text-primary" /> Tạo trận Code Duel
 </h1>
 <p className="mt-0.5 text-sm text-muted-foreground">
 Tạo trận đấu, soạn câu hỏi cùng AI, rồi phát động — mọi học sinh lập trình trên cùng đồng hồ.
 </p>
 </div>

 <div className="space-y-4 rounded-xl border border-border bg-card p-5">
 <div>
 <label className="mb-1 block text-sm font-semibold text-foreground">Tên trận đấu</label>
 <input
 value={title}
 onChange={(e) => setTitle(e.target.value)}
 placeholder="VD: Chung kết Code Duel lớp 8A"
 className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
 />
 </div>

 <div>
 <label className="mb-1 block text-sm font-semibold text-foreground">Ngôn ngữ lập trình</label>
 <div className="flex gap-2">
 {(["python","cpp","both"] as const).map((l) => (
 <button
 key={l}
 onClick={() => setLanguage(l)}
 className={`rounded-lg border border-border px-4 py-2 text-sm font-semibold transition-colors ${
 language === l ?"border-primary bg-primary/10 text-primary" :"border-input text-muted-foreground"
 }`}
 >
 {l ==="python" ?"Python" : l ==="cpp" ?"C++" :"Python + C++"}
 </button>
 ))}
 </div>
 </div>

 <div>
 <label className="mb-1 block text-sm font-semibold text-foreground">Đối tượng / level</label>
 <select
 value={level}
 onChange={(e) => setLevel(e.target.value)}
 className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
 >
 <option>Cấp 2 / THCS</option>
 <option>THPT</option>
 <option>Mọi cấp</option>
 </select>
 </div>

 <div className="grid gap-4 sm:grid-cols-2">
 <div>
 <label className="mb-1 block text-sm font-semibold text-foreground">Số vòng (để trống = theo câu đã soạn)</label>
 <input
 type="number"
 min={1}
 max={20}
 value={totalRounds}
 onChange={(e) => setTotalRounds(e.target.value)}
 placeholder="VD: 5"
 className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
 />
 </div>
 <div>
 <label className="mb-1 block text-sm font-semibold text-foreground">Điểm mỗi bài</label>
 <input
 type="number"
 min={1}
 max={100}
 value={pointsPerProblem}
 onChange={(e) => setPointsPerProblem(e.target.value)}
 className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
 />
 </div>
 </div>

 <div>
 <label className="mb-1 block text-sm font-semibold text-foreground">Giờ bắt đầu (bỏ trống = bắt đầu ngay)</label>
 <input
 type="datetime-local"
 value={scheduledStartAt}
 onChange={(e) => setScheduledStartAt(e.target.value)}
 className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
 />
 </div>

 <div>
 <label className="mb-1 block text-sm font-semibold text-foreground">Khóa học (tùy chọn)</label>
 <select
 value={courseId}
 onChange={(e) => setCourseId(e.target.value)}
 className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
 >
 <option value="">— Không gắn khóa học —</option>
 {courses.map((c) => (
 <option key={c.id} value={c.id}>{c.title}</option>
 ))}
 </select>
 </div>

 <div>
 <label className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
 <Users className="h-4 w-4" /> Người chơi (tùy chọn — học sinh tự tham gia khi vào trận)
 </label>
 <p className="mb-2 text-xs text-muted-foreground">
 Không cần chọn trước. Học sinh mở link trận là được đăng ký tham gia tự động. Bạn có thể chọn trước một số ai đó muốn ghim trước.
 </p>
 <input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="Tìm học sinh..."
 className="mb-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
 />
 <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
 {matches.length === 0 && <div className="py-4 text-center text-sm text-muted-foreground">Không tìm thấy học sinh.</div>}
 {matches.map((s) => (
 <div
 key={s.id}
 onClick={() => togglePlayer(s.id)}
 className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-muted"
 >
 <span className="font-medium text-foreground">{s.fullName}</span>
 <span className="text-xs text-muted-foreground">{players.includes(s.id) ?"✓ Đã chọn" :"Thêm"}</span>
 </div>
 ))}
 </div>
 </div>

 {/* Rewards settings */}
 <div className="space-y-3 rounded-xl border bg-amber-500/10 p-4">
 <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
 <Coins className="h-4 w-4" /> Phần thưởng cho học sinh (Tokens / XP)
 </label>
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="rounded-lg border border-border bg-card p-3">
 <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Tham gia</p>
 <div className="flex gap-2">
 <label className="flex-1 text-xs text-muted-foreground">Token
 <input type="number" value={reward.participateTokens} onChange={(e) => setReward({ ...reward, participateTokens: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none" />
 </label>
 <label className="flex-1 text-xs text-muted-foreground">XP
 <input type="number" value={reward.participateXp} onChange={(e) => setReward({ ...reward, participateXp: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none" />
 </label>
 </div>
 </div>

 <div className="rounded-lg border border-border bg-card p-3">
 <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Code được xác thực (VERIFIED)</p>
 <div className="flex gap-2">
 <label className="flex-1 text-xs text-muted-foreground">Token
 <input type="number" value={reward.verifiedTokens} onChange={(e) => setReward({ ...reward, verifiedTokens: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none" />
 </label>
 <label className="flex-1 text-xs text-muted-foreground">XP
 <input type="number" value={reward.verifiedXp} onChange={(e) => setReward({ ...reward, verifiedXp: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none" />
 </label>
 </div>
 </div>
 </div>

 <div className="rounded-lg border border-border bg-card p-3">
 <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Top 3 chung cuộc</p>
 <div className="grid gap-2 sm:grid-cols-3">
 {["Hạng 1","Hạng 2","Hạng 3"].map((label, i) => (
 <div key={label} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 p-2">
 <span className="shrink-0 text-xs font-medium text-foreground">{label}</span>
 <div className="flex gap-1.5">
 <input type="number" value={reward.topTokens[i]} onChange={(e) => { const v=[...reward.topTokens]; v[i]=Math.max(0,Number(e.target.value)||0); setReward({ ...reward, topTokens: v }); }} className="w-16 rounded border border-input bg-background px-1.5 py-1 text-sm text-center outline-none" title={`Token ${label}`} />
 <input type="number" value={reward.topXp[i]} onChange={(e) => { const v=[...reward.topXp]; v[i]=Math.max(0,Number(e.target.value)||0); setReward({ ...reward, topXp: v }); }} className="w-16 rounded border border-input bg-background px-1.5 py-1 text-sm text-center outline-none" title={`XP ${label}`} />
 </div>
 </div>
 ))}
 </div>
 <p className="mt-1 text-[11px] text-muted-foreground">Mỗi ô: trái = Token, phải = XP.</p>
 </div>
 </div>

 <button
 onClick={create}
 disabled={submitting}
 className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary disabled:opacity-50"
 >
 {submitting ?"Đang tạo..." :"Tạo trận đấu"}
 </button>
 </div>
 </div>
 );
}