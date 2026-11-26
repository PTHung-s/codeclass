import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuthContext } from "../../contexts/AuthContext";
import { cn, getAnimalAvatarUrl, getAvatarBgColor } from "../../lib/utils";
import { useToast } from "../../hooks/useToast";
import { PageHeader } from "../../components/ui/page-header";
import { Skeleton } from "../../components/ui/skeleton";
import api from "../../lib/api";
import { Coins, Flame, Trophy, Medal, CheckCircle2, Clock, Crown, ChevronDown } from "lucide-react";

interface OldEntry {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  xp: number;
  rank: number;
  problemCount: number;
  streak: number;
  level: number;
  league: string;
  leagueEmoji: string;
  rankChange: number | null;
  badges: any[];
}

interface LbRow {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  value: number;
  rank: number;
  reward: number;
}

const REWARD_AMOUNTS = [20, 18, 16, 14, 12, 10, 8, 6, 4, 2];
const PERIOD_LABELS: Record<string, string> = { today: "Hôm nay", week: "Tuần này", month: "Tháng này", all: "Tất cả" };

function CircleAvatar({ name, url, className }: { name: string; url: string | null; className?: string }) {
  const src = url || getAnimalAvatarUrl(name);
  return <img src={src} alt={name} className={cn("rounded-full object-cover", className)} style={{ backgroundColor: getAvatarBgColor(name) }} />;
}

function RankCircle({ rank, size = "md" }: { rank: number; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "size-7 text-xs" : "size-6 text-[11px]";
  if (rank === 1) {
    return (
      <span className={cn("relative flex items-center justify-center rounded-full bg-foreground font-semibold text-background", dim)}>
        <Crown className="absolute -top-2 left-1/2 size-3 -translate-x-1/2 text-amber-500" />
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
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.24, delay: 0.04 * place, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "surface-interactive relative flex flex-col items-center rounded-xl border border-border bg-card text-center shadow-card",
        isFirst ? "order-1 p-4 md:order-2 md:-translate-y-2" : place === 2 ? "order-2 p-3.5 md:order-1" : "order-3 p-3.5",
      )}
    >
      <div className="absolute left-2.5 top-2.5">
        <RankCircle rank={place} size={isFirst ? "lg" : "md"} />
      </div>
      <div className={cn("mb-2 overflow-hidden rounded-full ring-2 ring-border", isFirst ? "size-14 md:size-16" : "size-12 md:size-14")}>
        <CircleAvatar name={entry.fullName} url={entry.avatarUrl} className="size-full" />
      </div>
      <h3 className={cn("max-w-full truncate font-semibold tracking-tight text-foreground", isFirst ? "text-sm md:text-base" : "text-xs md:text-sm")}>
        {entry.fullName}
      </h3>
      <span className="mt-0.5 text-xs font-semibold tabular-nums text-foreground">{entry.xp.toLocaleString("vi-VN")} XP</span>
      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1">
        <span className="flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <CheckCircle2 className="size-2.5" />{entry.problemCount}
        </span>
        <span className="flex items-center gap-0.5 rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-600 dark:text-orange-400">
          <Flame className="size-2.5 fill-orange-500 text-orange-500" />{entry.streak}
        </span>
        <span className="flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <Clock className="size-2.5" />Lv{entry.level}
        </span>
      </div>
    </motion.div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-2.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  );
}

function XpLeaderboard() {
  const { user } = useAuthContext();
  const [period, setPeriod] = useState("all");
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, isError } = useQuery<{ leaderboard: OldEntry[] }>({
    queryKey: ["leaderboard_xp", period],
    queryFn: () => api.get("/leaderboard", { params: { period } }).then((r) => r.data),
  });

  const scrollToUser = useCallback((userId: string) => {
    document.getElementById(`lb-row-${userId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  if (isLoading) return <LeaderboardSkeleton />;
  if (isError) return <div className="py-10 text-center text-xs text-muted-foreground">Không tải được bảng xếp hạng.</div>;

  const lb = data?.leaderboard || [];
  const top3 = lb.slice(0, 3);
  const rest = lb.slice(3);
  const visibleRows = !showAll && lb.length > 10 ? lb.slice(0, 10) : lb;

  return (
    <div className="space-y-4">
      <div className="inline-flex h-8 w-full items-center rounded-[8px] border border-border bg-card p-0.5">
        {(Object.keys(PERIOD_LABELS) as string[]).map((p) => {
          const active = period === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                "relative h-7 flex-1 rounded-[6px] px-2.5 text-xs font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="lb-period-tab"
                  transition={{ type: "spring", stiffness: 450, damping: 35 }}
                  className="absolute inset-0 rounded-[6px] bg-muted shadow-sm"
                />
              )}
              <span className="relative z-10">{PERIOD_LABELS[p]}</span>
            </button>
          );
        })}
      </div>

      {top3.length >= 3 && (
        <div className="grid grid-cols-3 items-end gap-2 sm:gap-3 pt-1">
          <PodiumCard entry={top3[1]} place={2} />
          <PodiumCard entry={top3[0]} place={1} />
          <PodiumCard entry={top3[2]} place={3} />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <table className="w-full table-fixed text-left">
          <thead>
            <tr className="border-b border-border bg-muted/35 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <th className="w-11 px-3 py-2 text-center">#</th>
              <th className="px-3 py-2">Học viên</th>
              <th className="w-20 px-2 py-2 text-center">XP</th>
              <th className="hidden w-14 px-2 py-2 text-center sm:table-cell">Bài</th>
              <th className="w-14 px-3 py-2 text-center">
                <Flame className="mx-auto size-3.5 fill-orange-500 text-orange-500" aria-label="Chuỗi ngày" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {visibleRows.map((entry) => {
              const isMe = entry.userId === user?.id;
              return (
                <tr
                  key={entry.userId}
                  id={`lb-row-${entry.userId}`}
                  onClick={() => scrollToUser(entry.userId)}
                  className={cn("cursor-pointer transition-colors hover:bg-muted/40", isMe && "bg-primary/5")}
                >
                  <td className="px-3 py-2 text-center">
                    {entry.rank <= 3 ? (
                      <div className="flex justify-center">
                        <RankCircle rank={entry.rank} />
                      </div>
                    ) : (
                      <span className="text-xs font-medium tabular-nums text-muted-foreground">{entry.rank}</span>
                    )}
                  </td>
                  <td className="max-w-0 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="size-7 shrink-0 overflow-hidden rounded-full ring-1 ring-border">
                        <CircleAvatar name={entry.fullName} url={entry.avatarUrl} className="size-full text-xs" />
                      </div>
                      <span className={cn("truncate text-[13px] font-medium text-foreground", isMe && "text-primary")}>
                        {entry.fullName}
                        {isMe && <span className="ml-1 text-[10px] font-semibold text-primary">(Bạn)</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className="text-xs font-semibold tabular-nums text-foreground">{entry.xp.toLocaleString("vi-VN")}</span>
                  </td>
                  <td className="hidden px-2 py-2 text-center sm:table-cell">
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">{entry.problemCount}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-flex items-center gap-0.5 text-xs font-medium tabular-nums text-orange-600 dark:text-orange-400">
                      {entry.streak > 0 ? <Flame className="size-3 fill-orange-500 text-orange-500" /> : null}
                      {entry.streak}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {top3.length >= 3 && rest.length > 7 && (
          <div className="flex justify-center border-t border-border py-2.5">
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {showAll ? "Thu gọn" : `Xem thêm (${lb.length - 10})`}
              <ChevronDown className={cn("size-3.5 transition-transform duration-150", showAll && "rotate-180")} />
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

  if (loading) return <LeaderboardSkeleton />;
  const list = data?.leaderboard || [];

  return (
    <div className="space-y-4">
      <div className="stagger-in space-y-1.5">
        {list.length > 0 ? (
          list.map((entry) => {
            const isMe = entry.userId === user?.id;
            const isTop10 = entry.rank <= 10;
            return (
              <div
                key={entry.userId}
                className={cn(
                  "surface-interactive flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5",
                  isMe ? "border-primary/30 bg-primary/5" : "border-border bg-card hover:border-muted-foreground/30",
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center">
                  {isTop10 ? <RankCircle rank={entry.rank} /> : <span className="text-xs font-medium tabular-nums text-muted-foreground">#{entry.rank}</span>}
                </span>
                <div className="size-8 shrink-0 overflow-hidden rounded-full ring-1 ring-border">
                  <CircleAvatar name={entry.fullName} url={entry.avatarUrl} className="size-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("truncate text-[13px] font-medium", isMe ? "text-primary" : "text-foreground")}>{entry.fullName}</span>
                    {isMe && <span className="text-[10px] font-semibold text-primary">(Bạn)</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {type === "tokens" ? "Tổng vàng" : "Chuỗi ngày"}:{" "}
                    <b className={cn("tabular-nums", type === "streak" ? "text-orange-600 dark:text-orange-400" : "text-foreground")}>
                      {type === "streak" ? (
                        <span className="inline-flex items-center gap-0.5">
                          <Flame className="size-3 fill-orange-500 text-orange-500" />
                          {entry.value.toLocaleString("vi-VN")}
                        </span>
                      ) : (
                        entry.value.toLocaleString("vi-VN")
                      )}
                    </b>
                  </div>
                </div>
                {isTop10 ? (
                  <div className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    <Coins className="size-3 text-amber-500" />+{entry.reward}/ngày
                  </div>
                ) : (
                  <span className="text-xs font-medium text-muted-foreground/60">—</span>
                )}
              </div>
            );
          })
        ) : (
          <div className="py-10 text-center text-xs text-muted-foreground">Chưa có dữ liệu.</div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-3.5 shadow-card">
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Medal className="size-3.5" /> Thưởng top 10 hằng ngày
        </h3>
        <div className="grid grid-cols-5 gap-1.5">
          {REWARD_AMOUNTS.map((amt, i) => (
            <div key={i} className="flex flex-col items-center rounded-lg bg-muted/50 px-2 py-1">
              <span className="text-[11px] font-semibold text-foreground">#{i + 1}</span>
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                <Coins className="size-2.5 text-amber-500" />{amt}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Leaderboard() {
  const toast = useToast();
  const [tab, setTab] = useState<"xp" | "tokens" | "streak">("xp");

  useEffect(() => {
    let cancelled = false;
    api.post("/leaderboard/claim-rewards").then((r) => {
      if (cancelled) return;
      const rewards = r.data?.rewards || [];
      if (rewards.length > 0) {
        const msgs = rewards.map((rw: any) => `+${rw.amount} tokens (Top ${rw.rank} ${rw.type === "tokens" ? "Tokens" : "Chuỗi"})`);
        toast.success({ title: "Thưởng bảng xếp hạng!", message: msgs.join(" · ") });
      }
    }).catch(() => {}).finally(() => { cancelled = true; });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Bảng xếp hạng"
        description="Xếp hạng học tập — Top 10 mỗi ngày và mỗi tuần nhận thưởng Tokens."
      />

      <div className="flex h-9 items-center rounded-[8px] border border-border bg-card p-0.5">
        {([
          { key: "xp", label: "XP", Icon: Trophy },
          { key: "tokens", label: "Top Tokens", Icon: Coins },
          { key: "streak", label: "Top Chuỗi", Icon: Flame },
        ] as const).map(({ key, label, Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[6px] px-3 text-xs font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="lb-main-tab"
                  transition={{ type: "spring", stiffness: 450, damping: 35 }}
                  className="absolute inset-0 rounded-[6px] bg-muted shadow-sm"
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                <Icon className="size-3.5" /> {label}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "xp" && <XpLeaderboard />}
      {tab === "tokens" && <SimpleLeaderboard type="tokens" />}
      {tab === "streak" && <SimpleLeaderboard type="streak" />}
    </div>
  );
}
