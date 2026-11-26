import { useEffect, useState } from "react";
import api from "../../lib/api";
import { Loader2, Flame, Coins, Award, Medal } from "lucide-react";
import { getAnimalAvatarUrl, getAvatarBgColor } from "../../lib/utils";

interface LbRow {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}
interface LbTokenRow extends LbRow { tokens: number }
interface LbStreakRow extends LbRow { streak: number }

interface LbData {
  topTokens: LbTokenRow[];
  topStreak: LbStreakRow[];
}

const RANK_ICONS = ["🥇", "🥈", "🥉"];

function LbCard({ rank, name, avatarUrl, badge, value, unit }: { rank: number; name: string; avatarUrl: string | null; badge: number | string; value: number; unit: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 transition hover:bg-white/10">
      <span className="w-6 text-center text-sm font-bold">{rank <= 3 ? RANK_ICONS[rank - 1] : `#${rank}`}</span>
      <div className="relative grid h-7 w-7 shrink-0 overflow-hidden place-items-center rounded-full text-[10px] font-bold text-white shadow-sm" style={{ backgroundColor: getAvatarBgColor(name) }}>
        <img src={avatarUrl || getAnimalAvatarUrl(name)} alt={name} className="relative z-10 size-full rounded-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        <span className="absolute inset-0 z-0 flex items-center justify-center font-bold text-[8px]">{name.charAt(0).toUpperCase()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-bold text-foreground">{name}</div>
        <div className="text-[10px] text-muted-foreground">Tổng: <b>{value.toLocaleString("vi-VN")}</b> {unit}</div>
      </div>
      <span className="shrink-0 text-right text-xs font-bold" style={{ color: rank <= 3 ? ["#f59e0b", "#94a3b8", "#cd7f32"][rank - 1] : "var(--muted-foreground)" }}>{badge}</span>
    </div>
  );
}

export function Leaderboard() {
  const [data, setData] = useState<LbData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"tokens" | "streak">("tokens");

  useEffect(() => {
    api.get("/tokens/leaderboard").then((r) => { setData(r.data); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;

  const list = tab === "tokens" ? data?.topTokens : data?.topStreak;
  const label = tab === "tokens" ? "Top Tokens" : "Top Chuỗi";
  const unit = tab === "tokens" ? "tokens" : "🔥 ngày";

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
        {([
          { key: "tokens", label: "💰 Top Tokens", items: data?.topTokens ?? [] },
          { key: "streak", label: "🔥 Top Chuỗi", items: data?.topStreak ?? [] },
        ] as const).map(({ key, label, items }) => (
          <button key={key} onClick={() => setTab(key as any)} className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition ${tab === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {label} <span className="text-white/30">({items.length})</span>
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        {list && list.length > 0 ? list.map((row: any, i: number) => (
          <LbCard key={row.id} rank={i + 1} name={row.fullName} avatarUrl={row.avatarUrl} badge={tab === "tokens" ? row.tokens : row.streak} value={tab === "tokens" ? row.tokens : row.streak} unit={unit} />
        )) : (
          <p className="py-8 text-center text-xs text-muted-foreground">Chưa có dữ liệu xếp hạng.</p>
        )}
      </div>
    </div>
  );
}
