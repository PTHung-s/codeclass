import { useMemo } from "react";
import { X, Package, Layers } from "lucide-react";
import type { GachaReward, Rarity } from "../../types/gacha";

interface RewardsCatalogModalProps {
  open: boolean;
  onClose: () => void;
  pool: GachaReward[] | null | undefined;
}

const RARITY_META: Record<string, { order: number; label: string; dot: string }> = {
  common: { order: 0, label: "Common", dot: "bg-slate-400" },
  rare: { order: 1, label: "Rare", dot: "bg-sky-400" },
  epic: { order: 2, label: "Epic", dot: "bg-blue-400" },
  legendary: { order: 3, label: "Legendary", dot: "bg-amber-400" },
  mythic: { order: 4, label: "Mythic", dot: "bg-rose-500" },
};

const RARITY_TEXT: Record<string, string> = {
  common: "text-slate-500 dark:text-slate-400",
  rare: "text-sky-500 dark:text-sky-400",
  epic: "text-blue-500 dark:text-blue-400",
  legendary: "text-amber-500 dark:text-amber-400",
  mythic: "text-rose-500 dark:text-rose-400",
};

const RARITY_ORDER: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };

const TYPE_LABEL: Record<string, string> = {
  xp: "EXP",
  tokens: "Vàng",
  hint_credits: "Gợi ý",
  streak_freeze: "Khiên Streak",
  avatar: "Avatar",
  emoji: "Emoji",
  sticker: "Sticker",
  puzzle_piece: "Mảnh ghép",
  custom: "Quà",
};

export function RewardsCatalogModal({ open, onClose, pool }: RewardsCatalogModalProps) {
  const grouped = useMemo(() => {
    const cards = pool ?? [];
    const sorted = [...cards].sort((a, b) => (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0));
    const groups: Record<string, GachaReward[]> = {};
    for (const c of sorted) {
      if (!groups[c.rarity]) groups[c.rarity] = [];
      groups[c.rarity].push(c);
    }
    return (Object.entries(groups) as [Rarity, GachaReward[]][]).sort(
      (a, b) => RARITY_ORDER[a[0]] - RARITY_ORDER[b[0]]
    );
  }, [pool]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-[20px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl text-slate-900 dark:text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <Layers className="h-4 w-4 text-amber-500" />
            <h3 className="text-base font-extrabold">Tất Cả Phần Thưởng</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-500 transition-all" title="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {grouped.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-sm font-medium">Chưa có dữ liệu phần thưởng.</div>
          )}

          {grouped.map(([rarity, cards]) => (
            <div key={rarity}>
              <div className="flex items-center gap-2 mb-2">
                <i className={`h-2 w-2 rounded-full ${RARITY_META[rarity]?.dot ?? "bg-slate-400"}`} />
                <span className={`text-xs font-extrabold uppercase tracking-wider ${RARITY_TEXT[rarity] ?? "text-slate-400"}`}>
                  {RARITY_META[rarity]?.label ?? rarity}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">({cards.length})</span>
              </div>

              <div className="grid gap-1.5 sm:grid-cols-2">
                {cards.map((c, i) => (
                  <div
                    key={`${c.id}-${i}`}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-50 dark:bg-black/30 border border-slate-100 dark:border-white/5"
                  >
                    <span
                      className="w-8 h-8 shrink-0 grid place-items-center rounded-lg bg-white dark:bg-slate-950/60 border border-slate-100 dark:border-white/10 text-lg"
                      title={c.description || c.name}
                    >
                      {c.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{c.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wide">
                        {TYPE_LABEL[c.rewardType] ?? c.rewardType}
                        {c.rewardType === "puzzle_piece" && c.pieceName ? ` · ${c.pieceName}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between text-[10px] text-slate-400 font-medium">
          <span className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" /> {pool?.length ?? 0} phần thưởng có thể nhận
          </span>
          <span>Tỉ lệ rơi: Common 60% · Rare 25% · Epic 10% · Legendary 4% · Mythic 1%</span>
        </div>
      </div>
    </div>
  );
}