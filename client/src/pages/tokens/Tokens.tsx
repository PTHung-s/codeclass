import { useCallback, useEffect, useState } from "react";
import api from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { PageHeader } from "../../components/ui/page-header";
import { cn } from "../../lib/utils";
import { useConfirmContext } from "../../hooks/useConfirm";
import { Coins, Gift, History, Lightbulb, Shield, Sparkles, Trophy, Target, Flame, Check, Loader2, Zap, Box, Puzzle, Sliders, Sticker, BookOpen, Bug, CalendarCheck, CircleHelp, Code2, Gamepad2, GraduationCap, MessageCircle, Swords } from "lucide-react";
import { RewardGacha } from "../../components/reward-gacha/RewardGacha";
import { PuzzleCollectionModal } from "../../components/reward-gacha/PuzzleCollectionModal";
import { AdminPhysicalRewardsManager } from "../../components/reward-gacha/AdminPhysicalRewardsManager";
import { AdminStickerManager } from "../../components/reward-gacha/AdminStickerManager";
import { AdminVirtualRewardsManager } from "../../components/reward-gacha/AdminVirtualRewardsManager";
import { EventScreen } from "../../components/quest/EventScreen";
import { StreakHistoryPanel } from "../../components/streak/StreakHistory";
import type { PuzzleProgress } from "../../types/gacha";

interface BalanceData {
  balance: number;
  hintCredits: number;
  streakFreezes: number;
  recent: { id: string; amount: number; type: string; reason: string; description: string | null; createdAt: string }[];
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
  autoFulfill: boolean;
}
interface Redemption {
  id: string;
  status: string;
  tokenCost: number;
  note: string | null;
  createdAt: string;
  reward: { name: string; icon: string | null; type: string };
}
interface Txn {
  id: string;
  amount: number;
  balanceAfter: number;
  type: string;
  reason: string;
  description: string | null;
  createdAt: string;
}
interface ClaimStatus {
  canClaim: boolean;
  claimedToday: { amount: number; at: string } | null;
  lastClaimAt: string | null;
}
interface Quest {
  id: string;
  title: string;
  description: string | null;
  type: string;
  target: number;
  tokenReward: number;
  icon: string | null;
  current: number;
  completed: boolean;
  claimed: boolean;
}
interface QuestData {
  daily: Quest[];
  weekly: Quest[];
  achievement: Quest[];
  events?: { id: string; name: string; icon: string; theme: string; quests: Quest[] }[];
  dailyResetAt: string | null;
  weeklyResetAt: string | null;
}

const REASON_LABELS: Record<string, string> = {
  problem_solved: "Giải bài tập", lesson_completed: "Hoàn thành bài học", assignment_submitted: "Nộp bài tập",
  quiz_passed: "Đỗ quiz", review_received: "Được chấm điểm", adaptive_passed: "Vượt bài kiểm tra chương",
  adaptive_partial: "Đạt một phần chương", chapter_cleared: "Xóa chương học", contest_finished: "Hoàn thành kỳ thi",
  game_participated: "Tham gia game", help_solution: "Trả lời được chọn là giải pháp",
  help_request_posted: "Đặt câu hỏi hỗ trợ", bug_resolved: "Báo lỗi được xử lý", hacktest_approved: "Đề xuất test case",
  attendance_present: "Điểm danh", daily_claim: "Nhận thưởng hàng ngày", quest_claim: "Nhận thưởng nhiệm vụ",
  redeem: "Đổi thưởng", refund: "Hoàn tokens", manual_grant: "Cấp thủ công",
};

function fmtDate(s: string) {
  return new Date(s).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtCountdown(iso: string | null): string {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Sắp reset";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)} ngày`;
  return `${h}h ${m}m`;
}

type MainTab = "quests" | "gacha" | "puzzle" | "admin_puzzle" | "admin_stickers" | "admin_virtual" | "shop" | "history" | "mine" | "guide";

export default function Tokens() {
  const toast = useToast();
  const confirm = useConfirmContext();
  const { user } = useAuthContext();
  const [balance, setBalance] = useState(0);
  const [hintCredits, setHintCredits] = useState(0);
  const [streakFreezes, setStreakFreezes] = useState(0);
  const [recent, setRecent] = useState<BalanceData["recent"]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [transactions, setTransactions] = useState<Txn[]>([]);
  const [questData, setQuestData] = useState<QuestData | null>(null);
  const [claimStatus, setClaimStatus] = useState<ClaimStatus | null>(null);
  const [puzzleProgress, setPuzzleProgress] = useState<PuzzleProgress[]>([]);
  const [tab, setTab] = useState<MainTab>("quests");
  const [questSubTab, setQuestSubTab] = useState<"daily" | "weekly" | "achievement">("daily");
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<{ amount: number; lucky: number; streakBonus: number; claimStreak: number } | null>(null);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [claimingQuest, setClaimingQuest] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [bal, rew, reds, claimRes, questsRes, gachaRes] = await Promise.all([
        api.get("/tokens/balance"),
        api.get("/rewards"),
        api.get("/rewards/my-redemptions"),
        api.get("/tokens/daily-claim/status"),
        api.get("/quests"),
        api.get("/gacha/info"),
      ]);
      setBalance(bal.data.balance);
      setHintCredits(bal.data.hintCredits);
      setStreakFreezes(bal.data.streakFreezes);
      setRecent(bal.data.recent);
      setRewards(rew.data);
      setRedemptions(reds.data);
      setClaimStatus(claimRes.data);
      setQuestData(questsRes.data);
      setPuzzleProgress(gachaRes.data.puzzleProgress || []);
    } catch {
      toast.error({ title: "Không thể tải dữ liệu" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadTransactions = useCallback(async () => {
    try {
      const res = await api.get("/tokens/transactions", { params: { limit: 50 } });
      setTransactions(res.data.items);
    } catch { toast.error({ title: "Không thể tải lịch sử" }); }
  }, [toast]);

  useEffect(() => {
    if (tab === "history" && transactions.length === 0) loadTransactions();
  }, [tab, transactions.length, loadTransactions]);

  const handleClaim = async () => {
    setClaiming(true);
    setClaimResult(null);
    try {
      const res = await api.post("/tokens/daily-claim");
      setClaimResult(res.data);
      setBalance(res.data.balance);
      setClaimStatus({ canClaim: false, claimedToday: { amount: res.data.amount, at: new Date().toISOString() }, lastClaimAt: new Date().toISOString() });
      toast.success({ title: `Nhận được ${res.data.amount} tokens`, message: res.data.lucky > 0 ? `May mắn +${res.data.lucky}` : undefined });
      loadAll();
    } catch (err: any) {
      toast.error({ title: err.response?.data?.error || "Không thể nhận thưởng" });
    } finally {
      setClaiming(false);
    }
  };

  const handleRedeem = async (reward: Reward) => {
    const ok = await confirm({
      title: "Xác nhận đổi thưởng",
      message: `Đổi "${reward.name}" với ${reward.tokenCost} tokens?`,
    });
    if (!ok) return;
    setRedeemingId(reward.id);
    try {
      const res = await api.post(`/rewards/${reward.id}/redeem`);
      setBalance(res.data.balance);
      setRedemptions((prev) => [{ id: res.data.redemption.id, status: res.data.redemption.status, tokenCost: reward.tokenCost, note: res.data.redemption.note, createdAt: res.data.redemption.createdAt, reward: { name: reward.name, icon: reward.icon, type: reward.type } }, ...prev]);
      toast.success({ title: reward.autoFulfill ? "Đổi thành công" : "Đã gửi yêu cầu đổi thưởng", message: reward.autoFulfill ? undefined : "Chờ giáo viên duyệt" });
      loadAll();
    } catch (err: any) {
      toast.error({ title: err.response?.data?.error || "Không thể đổi thưởng" });
    } finally {
      setRedeemingId(null);
    }
  };

  const handleClaimQuest = async (questId: string) => {
    setClaimingQuest(questId);
    try {
      const res = await api.post(`/quests/${questId}/claim`);
      toast.success({ title: `+${res.data.tokenReward} tokens` });
      setBalance((b) => b + res.data.tokenReward);
      loadAll();
    } catch (err: any) {
      toast.error({ title: err.response?.data?.error || "Không thể nhận thưởng" });
    } finally {
      setClaimingQuest(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const claimableQuests = questData ? [...questData.daily, ...questData.weekly, ...questData.achievement, ...(questData.events ?? []).flatMap((e) => e.quests)].filter((q) => q.completed && !q.claimed) : [];
  const claimableCount = claimableQuests.length;
  const claimableReward = claimableQuests.reduce((s, q) => s + q.tokenReward, 0);
  const categories = [...new Set(rewards.map((r) => r.category))];
  const currentQuests = questData ? (questSubTab === "daily" ? questData.daily : questSubTab === "weekly" ? questData.weekly : questData.achievement) : [];
  const resetLabel = questSubTab === "daily" ? questData?.dailyResetAt : questSubTab === "weekly" ? questData?.weeklyResetAt : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <PageHeader title="Ví & Hộp quà" description="Quản lý tokens, nhận thưởng và đổi quà." />

      {/* Balance + perks header */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="bg-card p-5 sm:col-span-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Coins className="h-3.5 w-3.5" /> Số dư tokens</p>
          <div className="mt-1 flex items-end gap-2">
            <span className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">{balance.toLocaleString("vi-VN")}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">Đổi quà ảo & vật lý, hoặc tích lũy.</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-500" /><span className="text-xs font-medium text-muted-foreground">Gợi ý</span></div>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{hintCredits}</p>
          <p className="text-xs text-muted-foreground">hint credits</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /><span className="text-xs font-medium text-muted-foreground">Bảo vệ</span></div>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{streakFreezes}</p>
          <p className="text-xs text-muted-foreground">streak freeze</p>
        </Card>
      </div>

      {/* Lịch sử chuỗi học (theo ngày) */}
      <StreakHistoryPanel days={70} />

      {/* Daily claim */}
      <Card className="p-5">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Gift className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Nhận thưởng hàng ngày</h3>
              <p className="text-sm text-muted-foreground">
                {claimStatus?.canClaim ? "Có phần thưởng hôm nay. Bấm để nhận (có thể có bonus may mắn)." : claimStatus?.claimedToday ? `Đã nhận ${claimStatus.claimedToday.amount} tokens. Quay lại mai nhé!` : "Đã nhận hôm nay."}
              </p>
            </div>
          </div>
          <Button size="lg" onClick={handleClaim} disabled={!claimStatus?.canClaim || claiming} className="gap-2 text-base">
            <Sparkles className="h-5 w-5" />
            {claiming ? "Đang nhận..." : claimStatus?.canClaim ? "Nhận ngay" : "Đã nhận"}
          </Button>
        </div>
        {claimResult && (
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-muted/50 p-2"><div className="text-lg font-semibold tabular-nums text-foreground">+{claimResult.amount}</div><div className="text-xs text-muted-foreground">Tokens nhận</div></div>
            <div className="rounded-lg bg-muted/50 p-2"><div className="text-lg font-semibold tabular-nums text-foreground">+{claimResult.lucky}</div><div className="text-xs text-muted-foreground">May mắn</div></div>
            <div className="rounded-lg bg-muted/50 p-2"><div className="flex items-center justify-center gap-1 text-lg font-semibold tabular-nums text-foreground">{claimResult.claimStreak}<Flame className="h-4 w-4 text-orange-500" /></div><div className="text-xs text-muted-foreground">Chuỗi ngày</div></div>
          </div>
        )}
      </Card>

      {/* Main tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {([
          ["quests", "Nhiệm vụ", Target, claimableCount],
          ["gacha", "Gói thẻ may mắn", Box, 0],
          ["puzzle", "Ghép mảnh quà", Puzzle, puzzleProgress.filter((p) => p.isComplete).length],
          ...(isStaff(user?.role)
            ? ([
                ["admin_puzzle", "Quản lý quà", Sliders, 0],
                ["admin_stickers", "Quản lý Sticker", Sticker, 0],
                ["admin_virtual", "Quản lý quà ảo", Sparkles, 0],
              ] as const)
            : []),
          ["shop", "Cửa hàng", Gift, 0],
          ["history", "Lịch sử", History, 0],
          ["mine", "Đổi của tôi", Trophy, 0],
          ["guide", "Cách kiếm", Coins, 0],
        ] as const).map(([key, label, Icon, badge]) => (
          <button key={key} onClick={() => setTab(key as MainTab)} className={cn("relative flex shrink-0 items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors", tab === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <Icon className="h-4 w-4" /> {label}
            {badge > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{badge}</span>}
          </button>
        ))}
      </div>

      {/* ── GACHA TAB ── */}
      {tab === "gacha" && (
        <div className="space-y-4">
          <RewardGacha />
        </div>
      )}

      {/* ── PUZZLE COLLECTION TAB ── */}
      {tab === "puzzle" && (
        <div className="space-y-4">
          <PuzzleCollectionModal puzzleProgress={puzzleProgress} onClaimSuccess={loadAll} />
        </div>
      )}

      {/* ── ADMIN PUZZLE REWARDS TAB ── */}
      {tab === "admin_puzzle" && (
        <div className="space-y-4">
          <AdminPhysicalRewardsManager />
        </div>
      )}

      {/* ── ADMIN STICKER MANAGEMENT TAB ── */}
      {tab === "admin_stickers" && (
        <div className="space-y-4">
          <AdminStickerManager />
        </div>
      )}

      {/* ── ADMIN VIRTUAL REWARDS TAB ── */}
      {tab === "admin_virtual" && (
        <div className="space-y-4">
          <AdminVirtualRewardsManager />
        </div>
      )}

      {/* ── QUESTS TAB (Event Screen) ── */}
      {tab === "quests" && (
        <div className="space-y-4">
          <EventScreen />
        </div>
      )}

      {/* ── SHOP TAB ── */}
      {tab === "shop" && (
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Bảo vệ Streak</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rewards.filter((r) => r.category === "streak").map((r) => {
                const affordable = balance >= r.tokenCost;
                const outOfStock = r.stock !== null && r.stock <= 0;
                return (
                  <Card key={r.id} className="flex flex-col gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-3xl">{r.icon || "🛡️"}</span>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate font-semibold text-foreground">{r.name}</h4>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{r.description || "Bảo vệ streak của bạn khỏi bị reset khi bỏ lỡ một ngày."}</p>
                      </div>
                    </div>
                    <div className="mt-auto flex items-center justify-between">
                      <span className="flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400"><Coins className="h-4 w-4" /> {r.tokenCost}</span>
                    </div>
                    <Button size="sm" className="w-full" disabled={!affordable || outOfStock || redeemingId === r.id} onClick={() => handleRedeem(r)}>
                      {redeemingId === r.id ? "..." : outOfStock ? "Hết hàng" : affordable ? "Đổi ngay" : "Không đủ"}
                    </Button>
                  </Card>
                );
              })}
            </div>
          </div>
          {rewards.filter((r) => r.category === "streak").length === 0 && <p className="py-8 text-center text-muted-foreground">Chưa có phần thưởng streak nào.</p>}
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === "history" && (
        <Card className="divide-y divide-border p-0">
          {transactions.length === 0 && <p className="p-6 text-center text-muted-foreground">Chưa có giao dịch nào.</p>}
          {transactions.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold", t.amount >= 0 ? "bg-green-100 text-green-600 dark:bg-green-900/30" : "bg-red-100 text-red-600 dark:bg-red-900/30")}>{t.amount >= 0 ? "+" : "−"}</span>
                <div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{REASON_LABELS[t.reason] || t.reason}</p><p className="truncate text-xs text-muted-foreground">{t.description || fmtDate(t.createdAt)}</p></div>
              </div>
              <div className="text-right">
                <span className={cn("text-sm font-bold", t.amount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>{t.amount >= 0 ? "+" : ""}{t.amount}</span>
                <p className="text-xs text-muted-foreground">{fmtDate(t.createdAt)}</p>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* ── MY REDEMPTIONS TAB ── */}
      {tab === "mine" && (
        <Card className="divide-y divide-border p-0">
          {redemptions.length === 0 && <p className="p-6 text-center text-muted-foreground">Bạn chưa đổi thưởng lần nào.</p>}
          {redemptions.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Gift className="h-5 w-5" />
                </div>
                <div><p className="text-sm font-medium text-foreground">{r.reward.name}</p><p className="text-xs text-muted-foreground">{fmtDate(r.createdAt)} · {r.tokenCost} tokens</p></div>
              </div>
              <Badge className={cn(r.status === "completed" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : r.status === "rejected" ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400")}>{r.status === "completed" ? "Hoàn tất" : r.status === "rejected" ? "Từ chối" : "Chờ duyệt"}</Badge>
            </div>
          ))}
        </Card>
      )}

      {/* ── GUIDE TAB ── */}
      {tab === "guide" && (
        <Card className="p-4">
          <h3 className="mb-3 font-semibold text-foreground">Cách kiếm tokens</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { icon: Code2, label: "Giải bài Easy / Medium / Hard" },
              { icon: BookOpen, label: "Hoàn thành bài học" },
              { icon: GraduationCap, label: "Nộp bài tập / đỗ quiz" },
              { icon: Target, label: "Vượt bài kiểm tra chương" },
              { icon: Trophy, label: "Hoàn thành kỳ thi" },
              { icon: Gamepad2, label: "Tham gia game / arena" },
              { icon: MessageCircle, label: "Trả lời giúp đỡ / đặt câu hỏi" },
              { icon: Bug, label: "Báo lỗi / đề xuất test case" },
              { icon: CalendarCheck, label: "Điểm danh" },
              { icon: Gift, label: "Nhận thưởng hàng ngày" },
              { icon: Swords, label: "Hoàn thành nhiệm vụ" },
              { icon: CircleHelp, label: "Hoạt động học tập khác" },
            ].map((g, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <g.icon className="h-4 w-4 text-muted-foreground" /> {g.label}
                </span>
                <Coins className="h-4 w-4 text-amber-500" />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
