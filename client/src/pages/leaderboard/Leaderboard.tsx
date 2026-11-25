import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff as checkIsStaff } from "../../lib/roles";
import { cn, getAnimalAvatarUrl, getAvatarBgColor } from "../../lib/utils";
import { useToast } from "../../hooks/useToast";
import api from "../../lib/api";
import { Coins, Flame, Trophy, Medal, Loader2, CheckCircle2, Clock, Crown, ChevronDown } from "lucide-react";

// ── Old XP types ──
interface OldEntry {
  userId: string; fullName: string; avatarUrl: string | null; xp: number; rank: number;
  problemCount: number; streak: number; level: number; league: string; leagueEmoji: string;
  rankChange: number | null; badges: any[];
}

// ── New tokens/streak types ──
interface LbRow { userId: string; fullName: string; avatarUrl: string | null; value: number; rank: number; reward: number; }

const REWARD_AMOUNTS = [20, 18, 16, 14, 12, 10, 8, 6, 4, 2];
const PERIOD_LABELS: Record<string, string> = { today: "Hôm nay", all: "Tất cả", week: "Tuần này", month: "Tháng này" };

function CircleAvatar({ name, url, className }: { name: string; url: string | null; className?: string }) {
  const src = url || getAnimalAvatarUrl(name);
  return <img src={src} alt={name} className={cn("rounded-full object-cover", className)} style={{ backgroundColor: getAvatarBgColor(name) }} />;
}

/** Neutral rank circle — #1 gets a small crown accent, no medal emojis. */
function RankCircle({ rank, size = "md" }: { rank: number; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "h-8 w-8 text-sm" : "h-7 w-7 text-xs";
  if (rank === 1) {
    return (
      <span className={cn("relative flex items-center justify-center rounded-full bg-foreground font-semibold text-background", dim)}>
        <Crown className="absolute -top-2.5 left-1/2 h-3.5 w-3.5 -translate-x-1/2 text-foreground" />
        1
      </span>
    );
  }
  return (
    <span className={cn("flex items-center justify-center rounded-full bg-muted font-semibold text-foreground", dim)}>
      {rank}
    </span>
  );
}

function PodiumCard({ entry, place }: { entry: OldEntry; place: 1 | 2 | 3 }) {
  const isFirst = place === 1;
  return (
    <div
      className={cn(
        "relative flex flex-col items-center rounded-xl border border-border bg-card text-center shadow-card",
        isFirst ? "order-1 p-6 md:order-2 md:-translate-y-3 md:p-7" : place === 2 ? "order-2 p-5 md:order-1" : "order-3 p-5",
      )}
    >
      <div className="absolute left-3 top-3">
        <RankCircle rank={place} size={isFirst ? "lg" : "md"} />
      </div>
      <div className={cn("mb-3 overflow-hidden rounded-full ring-2 ring-border", isFirst ? "h-20 w-20 md:h-24 md:w-24" : "h-16 w-16 md:h-20 md:w-20")}>
        <CircleAvatar name={entry.fullName} url={entry.avatarUrl} className="h-full w-full" />
      </div>
      <h3 className={cn("max-w-full truncate font-semibold tracking-tight text-foreground", isFirst ? "text-lg" : "text-base")}>{entry.fullName}</h3>
      <span className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{entry.xp.toLocaleString("vi-VN")} XP</span>
      <div className="mt-4 flex items-center justify-center gap-2">
        <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"><CheckCircle2 className="h-3 w-3" />{entry.problemCount}</span>
        <span className="flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-1 text-xs font-medium text-orange-600 dark:text-orange-400"><Flame className="h-3 w-3 fill-orange-500 text-orange-500" />{entry.streak}</span>
        <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"><Clock className="h-3 w-3" />Lv{entry.level}</span>
      </div>
    </div>
  );
}

function XpLeaderboard() {
  const { user } = useAuthContext();
  const [period, setPeriod] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const isStaff = checkIsStaff(user?.role);
  const { data, isLoading, isError, refetch } = useQuery<{ leaderboard: OldEntry[] }>({
    queryKey: ["leaderboard_xp", period],
    queryFn: () => api.get("/leaderboard", { params: { period } }).then((r) => r.data),
  });
  const scrollToUser = useCallback((userId: string) => {
    document.getElementById(`lb-row-${userId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  if (isLoading) return <div className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <div className="py-12 text-center text-sm text-muted-foreground">Không tải được bảng xếp hạng.</div>;
  const lb = data?.leaderboard || [];
  const top3 = lb.slice(0, 3);
  const rest = lb.slice(3);
  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        {(Object.keys(PERIOD_LABELS) as string[]).map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", period === p ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{PERIOD_LABELS[p]}</button>
        ))}
      </div>
      {top3.length >= 3 && (
        <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
          <PodiumCard entry={top3[1]} place={2} />
          <PodiumCard entry={top3[0]} place={1} />
          <PodiumCard entry={top3[2]} place={3} />
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <table className="w-full table-fixed text-left">
          <thead>
            <tr className="border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="w-12 px-3 py-3 text-center">#</th>
              <th className="px-3 py-3">Học viên</th>
              <th className="w-20 px-2 py-3 text-center">XP</th>
              <th className="hidden w-14 px-2 py-3 text-center sm:table-cell">Bài</th>
              <th className="w-14 px-3 py-3 text-center">
                <Flame className="mx-auto h-3.5 w-3.5 fill-orange-500 text-orange-500" aria-label="Chuỗi ngày" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {lb.map((entry) => {
              const isMe = entry.userId === user?.id;
              return (
                <tr key={entry.userId} id={`lb-row-${entry.userId}`} onClick={() => scrollToUser(entry.userId)}
                  className={cn("cursor-pointer transition-colors hover:bg-muted/40", isMe && "bg-primary/5")}>
                  <td className="px-3 py-3 text-center">
                    {entry.rank <= 3 ? <RankCircle rank={entry.rank} /> : <span className="text-sm font-medium tabular-nums text-muted-foreground">{entry.rank}</span>}
                  </td>
                  <td className="max-w-0 px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full ring-2 ring-border"><CircleAvatar name={entry.fullName} url={entry.avatarUrl} className="h-full w-full text-xs" /></div>
                      <span className={cn("truncate text-sm font-medium text-foreground", isMe && "text-primary")}>{entry.fullName}{isMe && <span className="ml-1 text-[10px] font-semibold text-primary">(Bạn)</span>}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center"><span className="text-sm font-semibold tabular-nums text-foreground">{entry.xp.toLocaleString("vi-VN")}</span></td>
                  <td className="hidden px-3 py-3 text-center sm:table-cell"><span className="text-sm font-medium tabular-nums text-foreground">{entry.problemCount}</span></td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-sm font-medium tabular-nums text-orange-600 dark:text-orange-400">
                      {entry.streak > 0 ? <Flame className="h-3.5 w-3.5 fill-orange-500 text-orange-500" /> : null}
                      {entry.streak}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {top3.length >= 3 && rest.length > 7 && (
          <div className="flex justify-center py-3">
            <button onClick={() => setShowAll((s) => !s)} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {showAll ? "Thu gọn" : "Xem thêm"} <ChevronDown className={cn("h-4 w-4 transition-transform", showAll && "rotate-180")} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SimpleLeaderboard({ type }: { type: "tokens" | "streak" }) {
  const { user } = useAuthContext();
  const [data, setData] = useState<{ leaderboard: LbRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.get(`/leaderboard?type=${type}`).then((r) => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [type]);
  if (loading) return <div className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const list = data?.leaderboard || [];
  return (
    <>
      <div className="space-y-1.5">
        {list.length > 0 ? list.map((entry) => {
          const isMe = entry.userId === user?.id;
          const isTop10 = entry.rank <= 10;
          return (
            <div key={entry.userId} className={cn("flex items-center gap-3 rounded-xl border border-border px-4 py-3 transition", isMe ? "bg-primary/5 border-primary/30" : "bg-card border-border hover:border-muted-foreground/30")}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                {isTop10 ? <RankCircle rank={entry.rank} /> : <span className="text-sm font-medium tabular-nums text-muted-foreground">#{entry.rank}</span>}
              </span>
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full ring-2 ring-border"><CircleAvatar name={entry.fullName} url={entry.avatarUrl} className="h-full w-full" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={cn("truncate text-sm font-medium", isMe ? "text-primary" : "text-foreground")}>{entry.fullName}</span>
                  {isMe && <span className="text-[9px] font-semibold text-primary">(Bạn)</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {type === "tokens" ? "Tổng vàng" : "Chuỗi ngày"}:{" "}
                  <b className={cn("tabular-nums", type === "streak" ? "text-orange-600 dark:text-orange-400" : "text-foreground")}>
                    {type === "streak" ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Flame className="h-3 w-3 fill-orange-500 text-orange-500" />
                        {entry.value.toLocaleString("vi-VN")}
                      </span>
                    ) : (
                      entry.value.toLocaleString("vi-VN")
                    )}
                  </b>
                </div>
              </div>
              {isTop10 && <div className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"><Coins className="h-3 w-3 text-amber-500" />+{entry.reward}/ngày</div>}
              {!isTop10 && <span className="text-xs font-medium text-muted-foreground/60">—</span>}
            </div>
          );
        }) : <div className="py-12 text-center text-sm text-muted-foreground">Chưa có dữ liệu.</div>}
      </div>
      {/* Reward chart */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-card">
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2.5"><Medal className="h-3.5 w-3.5" /> Thưởng top 10 hằng ngày</h3>
        <div className="grid grid-cols-5 gap-1.5">
          {REWARD_AMOUNTS.map((amt, i) => (
            <div key={i} className="flex flex-col items-center rounded-lg bg-muted/50 px-2 py-1.5">
              <span className="text-xs font-semibold text-foreground">#{i + 1}</span>
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"><Coins className="h-2.5 w-2.5 text-amber-500" />{amt}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function Leaderboard() {
  const { user } = useAuthContext();
  const toast = useToast();
  const [tab, setTab] = useState<"xp" | "tokens" | "streak">("xp");

  // Auto-claim rewards on mount
  useEffect(() => {
    let cancelled = false;
    api.post("/leaderboard/claim-rewards").then((r) => {
      if (cancelled) return;
      const rewards = r.data?.rewards || [];
      if (rewards.length > 0) {
        const msgs = rewards.map((rw: any) => `+${rw.amount} tokens (Top ${rw.rank} ${rw.type === "tokens" ? "Vàng" : "Chuỗi"})`);
        toast.success({ title: "Thưởng bảng xếp hạng!", message: msgs.join(" · ") });
      }
    }).catch(() => {}).finally(() => { cancelled = true; });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground"><Trophy className="h-5 w-5 text-muted-foreground" /> Bảng xếp hạng</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Top 10 mỗi ngày nhận thưởng.</p>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        {([
          { key: "xp", label: "XP", Icon: Trophy },
          { key: "tokens", label: "Top Vàng", Icon: Coins },
          { key: "streak", label: "Top Chuỗi", Icon: Flame },
        ] as const).map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors", tab === key ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "xp" && <XpLeaderboard />}
      {tab === "tokens" && <SimpleLeaderboard type="tokens" />}
      {tab === "streak" && <SimpleLeaderboard type="streak" />}
    </div>
  );
}
