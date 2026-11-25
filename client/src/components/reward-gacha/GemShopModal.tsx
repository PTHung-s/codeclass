import { useEffect, useState } from "react";
import { X, Gem, Loader2, Sparkles, Lock } from "lucide-react";
import api from "../../lib/api";
import { useToast } from "../../hooks/useToast";

interface GemShopSticker {
  id: string;
  name: string;
  imageUrl: string;
  rarity: string;
  category: string;
  gemCost: number;
}

interface GemShopData {
  gemBalance: number;
  catalog: GemShopSticker[];
}

const RARITY_COLORS: Record<string, string> = {
  common: "border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800",
  rare: "border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30",
  epic: "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30",
  legendary: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
  mythic: "border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30",
};

export function GemShopModal({ open, onClose, onPurchase }: { open: boolean; onClose: () => void; onPurchase: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<GemShopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLoading(true);
      api.get("/gacha/gem-shop").then((r) => { setData(r.data); }).catch(() => {}).finally(() => setLoading(false));
    }
  }, [open]);

  const handleBuy = async (stickerId: string) => {
    setBuyingId(stickerId);
    try {
      await api.post(`/gacha/gem-shop/buy/${stickerId}`);
      toast.success({ title: "Mua thành công! 🎉" });
      onPurchase();
      // Refresh catalog
      const r = await api.get("/gacha/gem-shop");
      setData(r.data);
    } catch (err: any) {
      toast.error({ title: err.response?.data?.error || "Không thể mua" });
    } finally {
      setBuyingId(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-[20px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <Gem className="h-4 w-4 text-cyan-500" />
            <h3 className="text-base font-extrabold">Gem Shop</h3>
          </div>
          <div className="flex items-center gap-2.5">
            {data && (
              <span className="flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 px-3 py-1 text-xs font-bold text-cyan-600 dark:text-cyan-400">
                <Gem className="h-3.5 w-3.5" /> {data.gemBalance}
              </span>
            )}
            <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-500 transition-all" title="Đóng">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-cyan-500" /></div>
          ) : data && data.catalog.length > 0 ? (
            <div className="space-y-2">
              {data.catalog.map((s) => (
                <div key={s.id} className={`flex items-center gap-3 rounded-xl border p-3 ${RARITY_COLORS[s.rarity] || RARITY_COLORS.common}`}>
                  <div className="w-12 h-12 shrink-0 flex items-center justify-center rounded-lg bg-white dark:bg-slate-950/60 border border-slate-100 dark:border-white/10">
                    {s.imageUrl.startsWith("/") || s.imageUrl.startsWith("http") ? (
                      <img src={s.imageUrl} alt={s.name} className="w-9 h-9 object-contain" />
                    ) : (
                      <span className="text-2xl">{s.imageUrl}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-foreground truncate">{s.name}</h4>
                    <span className="text-[10px] uppercase font-mono text-muted-foreground">{s.rarity} · {s.category}</span>
                  </div>
                  <button
                    onClick={() => handleBuy(s.id)}
                    disabled={buyingId === s.id || (data?.gemBalance ?? 0) < s.gemCost}
                    className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      (data?.gemBalance ?? 0) >= s.gemCost
                        ? "bg-cyan-500 hover:bg-cyan-400 text-black shadow"
                        : "bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    {buyingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gem className="h-3.5 w-3.5" />}
                    {s.gemCost}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <Gem className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium text-muted-foreground">Tất cả sticker đã sở hữu hoặc chưa có sticker nào để mua!</p>
              <p className="text-xs text-muted-foreground mt-1">Mở gói thẻ may mắn để nhận gem từ item trùng.</p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-white/10 text-[10px] text-muted-foreground text-center">
          💎 Gem được nhận từ việc quay trúng item trong Gói Thẻ may mắn đã sở hữu.
        </div>
      </div>
    </div>
  );
}