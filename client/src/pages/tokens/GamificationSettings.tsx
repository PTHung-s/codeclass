import { useCallback, useEffect, useRef, useState } from"react";
import { createPortal } from"react-dom";
import api from"../../lib/api";
import { useToast } from"../../hooks/useToast";
import { useConfirmContext } from"../../hooks/useConfirm";
import { Button } from"../../components/ui/button";
import { Card } from"../../components/ui/card";
import { Input } from"../../components/ui/input";
import { Badge } from"../../components/ui/badge";
import { StudentName } from"../../components/ui/StudentName";
import { cn } from"../../lib/utils";
import { Check, Coins, Flame, Gift, Plus, Settings as SettingsIcon, Star, Trash2, Trophy, X } from"lucide-react";

interface Rates {
 xp: Record<string, number>;
 tokens: Record<string, number>;
 streak?: { minActiveMinutes: number; bridgeLookbackDays: number };
}
interface Reward {
 id: string;
 name: string;
 description: string | null;
 type: string;
 icon: string | null;
 tokenCost: number;
 category: string;
 stock: number | null;
 isActive: boolean;
 autoFulfill: boolean;
}
interface Redemption {
 id: string;
 status: string;
 tokenCost: number;
 note: string | null;
 createdAt: string;
 user: { id: string; fullName: string; nickname?: string | null; avatarUrl: string | null };
 reward: { name: string; icon: string | null; type: string };
}

const XP_LABELS: Record<string, string> = {
 problemEasyXp:"Bài Dễ",
 problemMediumXp:"Bài Trung bình",
 problemHardXp:"Bài Khó",
 submissionXp:"Nộp bài tập",
 lessonXp:"Hoàn thành bài học",
 quizXpPerPoint:"Quiz (mỗi điểm đúng)",
 streakXp:"Streak (mỗi ngày)",
};
const TOKEN_LABELS: Record<string, string> = {
 problemEasyTokens:"Bài Dễ",
 problemMediumTokens:"Bài Trung bình",
 problemHardTokens:"Bài Khó",
 lessonTokens:"Hoàn thành bài học",
 assignmentTokens:"Nộp bài tập",
 quizPassTokens:"Đỗ quiz",
 reviewTokensMultiplier:"Hệ số điểm chấm",
 adaptivePassTokens:"Vượt bài kiểm tra chương",
 adaptivePartialTokens:"Đạt một phần",
 chapterClearTokens:"Hoàn thành chương",
 contestFinishTokens:"Hoàn thành kỳ thi",
 gameParticipationTokens:"Tham gia game",
 helpRequestTokens:"Đặt câu hỏi hỗ trợ",
 helpSolutionTokens:"Trả lời được chọn giải pháp",
 bugReportTokens:"Báo lỗi được xử lý",
 hacktestTokens:"Đề xuất test case duyệt",
 attendanceTokens:"Điểm danh có mặt",
};

function fmtDate(s: string) {
 return new Date(s).toLocaleString("vi-VN", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
}

export default function GamificationSettings() {
 const toast = useToast();
 const confirm = useConfirmContext();
 const [tab, setTab] = useState<"rates" |"lb" |"rewards" |"approvals">("rates");
 const [rates, setRates] = useState<Rates | null>(null);
 const [rateDraft, setRateDraft] = useState<Rates | null>(null);
 const [savingRates, setSavingRates] = useState(false);
 const [lbRewards, setLbRewards] = useState<{ dailyTop3: number[]; weeklyTop3: number[] } | null>(null);
 const [lbDraft, setLbDraft] = useState<{ dailyTop3: number[]; weeklyTop3: number[] } | null>(null);
 const [savingLb, setSavingLb] = useState(false);
 const [rewards, setRewards] = useState<Reward[]>([]);
 const [redemptions, setRedemptions] = useState<Redemption[]>([]);
 const [showAdd, setShowAdd] = useState(false);
 const [newReward, setNewReward] = useState({ name:"", description:"", type:"virtual", icon:"🎁", tokenCost: 10, category:"misc", stock:"" as string, autoFulfill: true, metadata:"" });
 const [students, setStudents] = useState<{ id: string; fullName: string; nickname?: string | null; email: string }[]>([]);
 const [studentQuery, setStudentQuery] = useState("");
 const [grantStudent, setGrantStudent] = useState<{ id: string; fullName: string; nickname?: string | null; email: string } | null>(null);
 const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
 const grantFieldRef = useRef<HTMLDivElement>(null);
 const grantDropdownRef = useRef<HTMLDivElement>(null);
 const [grantAmount, setGrantAmount] = useState(0);
 const [grantReason, setGrantReason] = useState("");
 const [granting, setGranting] = useState(false);
 const [grantResult, setGrantResult] = useState<number | null>(null);

 const openStudentDropdown = useCallback(() => {
 const el = grantFieldRef.current;
 if (!el) return;
 const rect = el.getBoundingClientRect();
 const estHeight = 224; // max dropdown height (~max-h-56)
 const spaceBelow = window.innerHeight - rect.bottom;
 const width = Math.max(rect.width, 320);
 const left = Math.min(rect.left, window.innerWidth - width - 8);
 let top: number;
 let maxHeight: number;
 if (spaceBelow < 200) {
 // Not enough room below → open upward so it doesn't block scrolling.
 top = Math.max(8, rect.top - estHeight - 4);
 maxHeight = Math.min(estHeight, rect.top - 8);
 } else {
 top = rect.bottom + 4;
 maxHeight = Math.min(estHeight, spaceBelow - 8);
 }
 setDropdownPos({ top, left, width, maxHeight });
 }, []);

 const loadRates = useCallback(async () => {
 try {
 const res = await api.get("/settings/gamification");
 setRates(res.data);
 setRateDraft(res.data);
 } catch {
 toast.error({ title:"Không tải được cấu hình" });
 }
 }, [toast]);

 const loadRewards = useCallback(async () => {
 try {
 const res = await api.get("/rewards");
 setRewards(res.data);
 } catch {
 toast.error({ title:"Không tải được danh sách phần thưởng" });
 }
 }, [toast]);

 const loadRedemptions = useCallback(async () => {
 try {
 const res = await api.get("/rewards/redemptions", { params: { status:"pending" } });
 setRedemptions(res.data);
 } catch {
 toast.error({ title:"Không tải được yêu cầu đổi thưởng" });
 }
 }, [toast]);

 const loadLbRewards = useCallback(async () => {
 try {
 const res = await api.get("/settings/leaderboard-rewards");
 setLbRewards(res.data);
 setLbDraft(res.data);
 } catch {
 toast.error({ title:"Không tải được cấu hình thưởng BXH" });
 }
 }, [toast]);

 const loadStudents = useCallback(async () => {
 try {
 const res = await api.get("/students");
 setStudents(res.data);
 } catch {
 toast.error({ title:"Không tải được danh sách học sinh" });
 }
 }, [toast]);

 useEffect(() => {
 loadRates();
 loadLbRewards();
 loadStudents();
 }, [loadRates, loadLbRewards, loadStudents]);
 useEffect(() => {
 if (tab ==="rewards") loadRewards();
 if (tab ==="approvals") loadRedemptions();
 }, [tab, loadRewards, loadRedemptions]);
 // Close the (portal-rendered) student dropdown when clicking outside it, or when
 // the page scrolls/resizes (its fixed position would no longer line up). Clicking or
 // scrolling INSIDE the dropdown must NOT close it — that's why we exclude both nodes.
 useEffect(() => {
 if (!dropdownPos) return;
 const isInside = (node: EventTarget | null) =>
 !!node &&
 (grantFieldRef.current?.contains(node as Node) ||
 grantDropdownRef.current?.contains(node as Node));
 const onDown = (e: MouseEvent) => {
 if (!isInside(e.target)) setDropdownPos(null);
 };
 const onScroll = (e: Event) => {
 if (!isInside(e.target)) setDropdownPos(null);
 };
 const close = () => setDropdownPos(null);
 document.addEventListener("mousedown", onDown);
 window.addEventListener("scroll", onScroll, true);
 window.addEventListener("resize", close);
 return () => {
 document.removeEventListener("mousedown", onDown);
 window.removeEventListener("scroll", onScroll, true);
 window.removeEventListener("resize", close);
 };
 }, [dropdownPos]);

 const saveRates = async () => {
 if (!rateDraft) return;
 setSavingRates(true);
 try {
 await api.put("/settings/gamification", rateDraft);
 setRates(rateDraft);
 toast.success({ title:"Đã lưu cấu hình điểm & tokens" });
 } catch (err: any) {
 toast.error({ title: err.response?.data?.error ||"Lưu thất bại" });
 } finally {
 setSavingRates(false);
 }
 };

 const resetRates = () => setRateDraft(rates);

 const saveLbRewards = async () => {
 if (!lbDraft) return;
 setSavingLb(true);
 try {
 const res = await api.put("/settings/leaderboard-rewards", lbDraft);
 setLbRewards(res.data);
 toast.success({ title:"Đã lưu thưởng BXH" });
 } catch (err: any) {
 toast.error({ title: err.response?.data?.error ||"Lưu thất bại" });
 } finally {
 setSavingLb(false);
 }
 };

 const updateRate = (group:"xp" |"tokens" |"streak", key: string, value: number) => {
 setRateDraft((prev) => {
 if (!prev) return prev;
 if (group ==="streak") {
 const base = prev.streak ?? { minActiveMinutes: 3, bridgeLookbackDays: 14 };
 return { ...prev, streak: { ...base, [key]: Math.max(0, Math.round(value)) } };
 }
 return { ...prev, [group]: { ...prev[group], [key]: Math.max(0, value) } };
 });
 };

 const addReward = async () => {
 if (!newReward.name.trim() || !newReward.tokenCost) {
 toast.error({ title:"Cần tên và giá tokens" });
 return;
 }
 try {
 await api.post("/rewards", { ...newReward, stock: newReward.stock ==="" ? null : Number(newReward.stock) });
 toast.success({ title:"Đã thêm phần thưởng" });
 setShowAdd(false);
 setNewReward({ name:"", description:"", type:"virtual", icon:"🎁", tokenCost: 10, category:"misc", stock:"", autoFulfill: true, metadata:"" });
 loadRewards();
 } catch (err: any) {
 toast.error({ title: err.response?.data?.error ||"Thêm thất bại" });
 }
 };

 const deactivateReward = async (id: string) => {
 const ok = await confirm({
 title: "Ẩn phần thưởng",
 message: "Ẩn phần thưởng này (khóa, không xóa)?",
 confirmLabel: "Ẩn",
 });
 if (!ok) return;
 try {
 await api.delete(`/rewards/${id}`);
 toast.success({ title:"Đã ẩn phần thưởng" });
 loadRewards();
 } catch {
 toast.error({ title:"Thất bại" });
 }
 };

 const processRedemption = async (id: string, approve: boolean, note?: string) => {
 try {
 await api.post(`/rewards/redemptions/${id}/${approve ?"approve" :"reject"}`, { note });
 toast.success({ title: approve ?"Đã duyệt đổi thưởng" :"Đã từ chối (hoàn tokens)" });
 loadRedemptions();
 } catch (err: any) {
 toast.error({ title: err.response?.data?.error ||"Thất bại" });
 }
 };

 const grantTokens = async () => {
 if (!grantStudent) return;
 setGrantResult(null);
 setGranting(true);
 try {
 // Unique id per submit → server dedups on it, so a double-click or network
 // retry can never apply the same grant twice.
 const requestId = typeof crypto !=="undefined" && crypto.randomUUID
 ? crypto.randomUUID()
 : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
 const res = await api.post("/tokens/grant", { userId: grantStudent.id, amount: grantAmount, reason: grantReason ||"manual_grant", description: `Cấp thủ công cho ${grantStudent.fullName}: ${grantReason ||"thưởng"}`, requestId });
 setGrantResult(res.data.balance);
 toast.success({ title:"Đã cấp tokens thành công" });
 } catch (err: any) {
 toast.error({ title: err.response?.data?.error ||"Không thể cấp tokens" });
 } finally {
 setGranting(false);
 }
 };

 const pendingCount = redemptions.length;

 return (
 <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary">
 <SettingsIcon className="h-5 w-5" />
 </div>
 <div>
 <h1 className="text-xl font-bold dark:text-foreground">Cấu hình Gamification</h1>
 <p className="text-sm text-muted-foreground">Điều chỉnh điểm kinh nghiệm (XP), tokens và quản lý phần thưởng</p>
 </div>
 </div>

 {/* Tabs */}
 <div className="flex gap-1 rounded-lg bg-muted p-1">
 {([
 ["rates","Điểm & Tokens", Star],
 ["lb","Thưởng BXH", Trophy],
 ["rewards","Phần thưởng", Gift],
 ["approvals","Duyệt đổi thưởng", Coins],
 ] as const).map(([key, label, Icon]) => (
 <button
 key={key}
 onClick={() => setTab(key)}
 className={cn("relative flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
 tab === key ?"bg-background text-foreground shadow-sm" :"text-muted-foreground hover:text-foreground"
 )}
 >
 <Icon className="h-4 w-4" /> {label}
 {key ==="approvals" && pendingCount > 0 && (
 <span className="absolute right-2 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white dark:bg-rose-400 dark:text-rose-950">{pendingCount}</span>
 )}
 </button>
 ))}
 </div>

 {/* Rates tab */}
 {tab ==="rates" && rateDraft && (
 <>
 <Card className="p-4">
 <div className="mb-3 flex items-center gap-2">
 <Star className="h-4 w-4" />
 <h3 className="font-semibold dark:text-foreground">Điểm kinh nghiệm (XP)</h3>
 <span className="text-xs text-muted-foreground">— dùng để định hạng/level</span>
 </div>
 <div className="grid gap-3 sm:grid-cols-2">
 {Object.entries(XP_LABELS).map(([key, label]) => (
 <div key={key} className="flex items-center justify-between gap-3">
 <label className="text-sm text-muted-foreground">{label}</label>
 <Input
 type="number"
 min={0}
 className="w-24"
 value={rateDraft.xp[key] ?? 0}
 onChange={(e: any) => updateRate("xp", key, Number(e.target.value))}
 />
 </div>
 ))}
 </div>
 </Card>

 <Card className="p-4">
 <div className="mb-3 flex items-center gap-2">
 <Coins className="h-4 w-4" />
 <h3 className="font-semibold dark:text-foreground">Tokens</h3>
 <span className="text-xs text-muted-foreground">— tiền tệ đổi thưởng, khích lệ mọi hoạt động</span>
 </div>
 <div className="grid gap-3 sm:grid-cols-2">
 {Object.entries(TOKEN_LABELS).map(([key, label]) => (
 <div key={key} className="flex items-center justify-between gap-3">
 <label className="text-sm text-muted-foreground">{label}</label>
 <Input
 type="number"
 min={0}
 className="w-24"
 value={rateDraft.tokens[key] ?? 0}
 onChange={(e: any) => updateRate("tokens", key, Number(e.target.value))}
 />
 </div>
 ))}
 </div>
 </Card>

 <Card className="p-4">
 <div className="mb-3 flex items-center gap-2">
 <Flame className="h-4 w-4" />
 <h3 className="font-semibold dark:text-foreground">Streak & Khiên</h3>
 <span className="text-xs text-muted-foreground">— quy tắc tính ngày học và bắc cầu qua ngày nghỉ</span>
 </div>
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="flex items-center justify-between gap-3">
 <label className="text-sm text-muted-foreground" title="Số phút active tối thiểu trong ngày để được tính là ngày học thật (ngày chỉ mở web vài chục giây vẫn được miễn khiên, không tính là ngày học)">Phút học tối thiểu/ngày</label>
 <Input
 type="number"
 min={0}
 max={60}
 className="w-24"
 value={rateDraft.streak?.minActiveMinutes ?? 3}
 onChange={(e: any) => updateRate("streak", "minActiveMinutes", Number(e.target.value))}
 />
 </div>
 <div className="flex items-center justify-between gap-3">
 <label className="text-sm text-muted-foreground" title="Khiên chỉ tự bắc cầu các ngày nghỉ trong N ngày gần nhất; nghỉ lâu hơn thì chuỗi đứt thay vì đốt khiên cũ">Bắc cầu tối đa (ngày)</label>
 <Input
 type="number"
 min={0}
 max={365}
 className="w-24"
 value={rateDraft.streak?.bridgeLookbackDays ?? 14}
 onChange={(e: any) => updateRate("streak", "bridgeLookbackDays", Number(e.target.value))}
 />
 </div>
 </div>
 <p className="mt-2 text-xs text-muted-foreground">Học sinh vào học dưới ngưỡng phút vẫn được bảo vệ chuỗi miễn phí (không tốn khiên). Đặt "Bắc cầu tối đa" = 0 để tắt hoàn toàn tự bắc cầu.</p>
 </Card>

 <div className="flex justify-end gap-2">
 <Button variant="outline" onClick={resetRates} disabled={savingRates}>Hủy</Button>
 <Button onClick={saveRates} disabled={savingRates}>{savingRates ?"Đang lưu..." :"Lưu cấu hình"}</Button>
 </div>

 {/* Manual token grant */}
 <Card className="p-4">
 <h3 className="mb-3 font-semibold dark:text-foreground">Cấp/trừ tokens thủ công</h3>
 <div className="flex flex-wrap items-end gap-3">
 <div ref={grantFieldRef} className="relative min-w-[200px] flex-1 space-y-1">
 <label className="text-xs text-muted-foreground">Học sinh</label>
 {grantStudent ? (
 <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
 <StudentName fullName={grantStudent.fullName} nickname={grantStudent.nickname} className="min-w-0 flex-1" primaryClassName="text-sm" />
 <span className="truncate text-xs text-muted-foreground">{grantStudent.email}</span>
 <button
 type="button"
 onClick={() => { setGrantStudent(null); setStudentQuery(""); }}
 className="text-muted-foreground hover:text-foreground"
 aria-label="Bỏ chọn học sinh"
 >
 <X className="h-4 w-4" />
 </button>
 </div>
 ) : (
 <Input
 value={studentQuery}
 onChange={(e: any) => { setStudentQuery(e.target.value); openStudentDropdown(); }}
 onFocus={openStudentDropdown}
 placeholder="Tìm tên hoặc email học sinh..."
 />
 )}
 </div>
 <div className="w-24 space-y-1">
 <label className="text-xs text-muted-foreground">Số lượng</label>
 <Input type="number" value={grantAmount} onChange={(e: any) => setGrantAmount(Number(e.target.value))} />
 </div>
 <div className="min-w-[150px] flex-1 space-y-1">
 <label className="text-xs text-muted-foreground">Lý do</label>
 <Input value={grantReason} onChange={(e: any) => setGrantReason(e.target.value)} placeholder="VD: thưởng thi đua" />
 </div>
 <Button onClick={grantTokens} disabled={granting || !grantStudent || !grantAmount}>{granting ?"..." :"Thực hiện"}</Button>
 </div>
 {grantResult !== null && (
 <p className="mt-2 text-sm">Thành công! Số dư mới: {grantResult} tokens</p>
 )}
 {/* Student dropdown, portal-rendered at <body> so the Card's overflow-hidden
 cannot clip it. Positioned (fixed) just below the search field. */}
 {dropdownPos && !grantStudent && createPortal(
 <div
 ref={grantDropdownRef}
 className="fixed z-50 overflow-y-auto rounded-md border bg-background p-1 shadow-lg"
 style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, maxHeight: dropdownPos.maxHeight }}
 >
 {(() => {
 const q = studentQuery.trim().toLowerCase();
 const list = q
 ? students.filter((s) => (`${s.fullName} ${s.nickname ||""} ${s.email}`).toLowerCase().includes(q)).slice(0, 12)
 : students.slice(0, 12);
 return list.length === 0
 ? <p className="p-3 text-sm text-muted-foreground">Không tìm thấy học sinh</p>
 : list.map((s) => (
 <button
 key={s.id}
 type="button"
 onMouseDown={() => { setGrantStudent(s); setDropdownPos(null); setStudentQuery(""); }}
 className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
 >
 <StudentName fullName={s.fullName} nickname={s.nickname} className="min-w-0 flex-1" primaryClassName="text-sm" />
 <span className="truncate text-xs text-muted-foreground">{s.email}</span>
 </button>
 ));
 })()}
 </div>,
 document.body
 )}
 </Card>
 </>
 )}

 {/* Leaderboard rewards tab */}
 {tab ==="lb" && lbDraft && (
 <div className="space-y-4">
 <Card>
 <div className="p-4 space-y-4">
 <div>
 <h3 className="text-sm font-bold flex items-center gap-2"><Trophy className="h-4 w-4" /> Thưởng Top 3 mỗi ngày</h3>
 <p className="text-xs text-muted-foreground mt-1">Phân phối token cho top 3 bảng xếp hạng mỗi ngày.</p>
 <div className="mt-3 grid grid-cols-3 gap-2">
 {["🥇 Top 1","🥈 Top 2","🥉 Top 3"].map((label, i) => (
 <div key={i}>
 <label className="text-xs font-medium text-muted-foreground">{label}</label>
 <Input type="number" min={0} value={lbDraft.dailyTop3[i] ?? 0}
 onChange={(e) => {
 const next = [...lbDraft.dailyTop3];
 next[i] = Math.max(0, Number(e.target.value) || 0);
 setLbDraft({ ...lbDraft, dailyTop3: next });
 }} />
 </div>
 ))}
 </div>
 </div>

 <div className="border-t pt-4">
 <h3 className="text-sm font-bold flex items-center gap-2"><Trophy className="h-4 w-4" /> Thưởng Top 3 tuần</h3>
 <p className="text-xs text-muted-foreground mt-1">Trao thưởng vào Chủ Nhật cho top 3 bảng xếp hạng.</p>
 <div className="mt-3 grid grid-cols-3 gap-2">
 {["🏆 #1 tuần","🏆 #2 tuần","🏆 #3 tuần"].map((label, i) => (
 <div key={i}>
 <label className="text-xs font-medium text-muted-foreground">{label}</label>
 <Input type="number" min={0} value={lbDraft.weeklyTop3[i] ?? 0}
 onChange={(e) => {
 const next = [...lbDraft.weeklyTop3];
 next[i] = Math.max(0, Number(e.target.value) || 0);
 setLbDraft({ ...lbDraft, weeklyTop3: next });
 }} />
 </div>
 ))}
 </div>
 </div>

 <div className="flex gap-2 pt-2 border-t">
 <Button onClick={saveLbRewards} disabled={savingLb}>{savingLb ?"Đang lưu..." :"Lưu thưởng BXH"}</Button>
 <Button variant="outline" onClick={() => setLbDraft(lbRewards)} disabled={savingLb}>Reset</Button>
 </div>
 </div>
 </Card>
 </div>
 )}

 {/* Rewards tab */}
 {tab ==="rewards" && (
 <div className="space-y-4">
 <div className="flex justify-end">
 <Button onClick={() => setShowAdd((s) => !s)} className="gap-1.5"><Plus className="h-4 w-4" /> Thêm phần thưởng</Button>
 </div>

 {showAdd && (
 <Card className="space-y-3 p-4">
 <h3 className="font-semibold dark:text-foreground">Phần thưởng mới</h3>
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-1">
 <label className="text-xs text-muted-foreground">Tên</label>
 <Input value={newReward.name} onChange={(e: any) => setNewReward({ ...newReward, name: e.target.value })} placeholder="VD: AvatarVIP" />
 </div>
 <div className="space-y-1">
 <label className="text-xs text-muted-foreground">Icon (emoji)</label>
 <Input value={newReward.icon} onChange={(e: any) => setNewReward({ ...newReward, icon: e.target.value })} />
 </div>
 <div className="space-y-1">
 <label className="text-xs text-muted-foreground">Giá (tokens)</label>
 <Input type="number" min={1} value={newReward.tokenCost} onChange={(e: any) => setNewReward({ ...newReward, tokenCost: Number(e.target.value) })} />
 </div>
 <div className="space-y-1">
 <label className="text-xs text-muted-foreground">Loại</label>
 <select className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm" value={newReward.type} onChange={(e: any) => setNewReward({ ...newReward, type: e.target.value, autoFulfill: e.target.value ==="virtual" })}>
 <option value="virtual">Ảo (tự động)</option>
 <option value="physical">Vật lý (cần duyệt)</option>
 </select>
 </div>
 <div className="space-y-1">
 <label className="text-xs text-muted-foreground">Danh mục</label>
 <Input value={newReward.category} onChange={(e: any) => setNewReward({ ...newReward, category: e.target.value })} placeholder="avatar, hint, gift..." />
 </div>
 <div className="space-y-1">
 <label className="text-xs text-muted-foreground">Tồn kho (để trống = ∞)</label>
 <Input type="number" value={newReward.stock} onChange={(e: any) => setNewReward({ ...newReward, stock: e.target.value })} placeholder="∞" />
 </div>
 <div className="space-y-1">
 <label className="text-xs text-muted-foreground">Metadata (JSON) <span className="text-[10px]">VD: {"{\"perkType\":\"hint_credits\",\"amount\":5}"}</span></label>
 <Input value={newReward.metadata} onChange={(e: any) => setNewReward({ ...newReward, metadata: e.target.value })} placeholder='{"perkType":"hint_credits","amount":5}' />
 </div>
 </div>
 <div className="space-y-1">
 <label className="text-xs text-muted-foreground">Mô tả</label>
 <Input value={newReward.description} onChange={(e: any) => setNewReward({ ...newReward, description: e.target.value })} />
 </div>
 <div className="flex justify-end gap-2">
 <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Hủy</Button>
 <Button size="sm" onClick={addReward}>Thêm</Button>
 </div>
 </Card>
 )}

 <Card className="divide-y divide-border p-0">
 {rewards.length === 0 && <p className="p-6 text-center text-muted-foreground">Chưa có phần thưởng nào.</p>}
 {rewards.map((r) => (
 <div key={r.id} className="flex items-center justify-between gap-3 p-3">
 <div className="flex items-center gap-3">
 <span className="text-2xl">{r.icon ||"🎁"}</span>
 <div>
 <div className="flex items-center gap-2">
 <p className="text-sm font-medium dark:text-foreground">{r.name}</p>
 <Badge variant="outline" className="text-[10px]">{r.type ==="physical" ?"Vật lý" :"Ảo"}</Badge>
 </div>
 <p className="text-xs text-muted-foreground">{r.category} · {r.stock === null ?"∞" : `còn ${r.stock}`} · {r.tokenCost} tokens</p>
 </div>
 </div>
 <Button variant="ghost" size="icon-sm" onClick={() => deactivateReward(r.id)} title="Ẩn">
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 ))}
 </Card>
 </div>
 )}

 {/* Approvals tab */}
 {tab ==="approvals" && (
 <Card className="divide-y divide-border p-0">
 {redemptions.length === 0 && <p className="p-6 text-center text-muted-foreground">Không có yêu cầu nào chờ duyệt.</p>}
 {redemptions.map((r) => (
 <div key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
 <div className="flex items-center gap-3">
 <span className="text-2xl">{r.reward.icon ||"🎁"}</span>
 <div>
 <p className="text-sm font-medium dark:text-foreground">{r.reward.name}</p>
 <div className="flex items-center gap-1 text-xs text-muted-foreground"><StudentName fullName={r.user.fullName} nickname={r.user.nickname} primaryClassName="text-xs" /> <span>· {r.tokenCost} tokens · {fmtDate(r.createdAt)}</span></div>
 {r.note && <p className="text-xs italic text-muted-foreground">"{r.note}"</p>}
 </div>
 </div>
 <div className="flex gap-2">
 <Button variant="outline" size="sm" className="gap-1" onClick={() => processRedemption(r.id, true)}>
 <Check className="h-4 w-4" /> Duyệt
 </Button>
 <Button variant="outline" size="sm" className="gap-1" onClick={() => processRedemption(r.id, false)}>
 <X className="h-4 w-4" /> Từ chối
 </Button>
 </div>
 </div>
 ))}
 </Card>
 )}
 </div>
 );
}
