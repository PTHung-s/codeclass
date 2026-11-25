import { useState, useEffect } from "react";
import api from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { Loader2, Sparkles, Pencil, Power } from "lucide-react";

interface VirtualReward {
  id: string;
  rewardType: string;
  baseName: string;
  baseRarity: string;
  baseAmount: number;
  baseIcon: string;
  name: string;
  description: string | null;
  rarity: string;
  amount: number;
  icon: string;
  isActive: boolean;
}

const RARITY_COLORS: Record<string, string> = {
  common: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  rare: "bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800/40",
  epic: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800/40",
  legendary: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/40",
  mythic: "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/40",
};

const RARITY_ORDER: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };

export function AdminVirtualRewardsManager() {
  const toast = useToast();
  const [rewards, setRewards] = useState<VirtualReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<VirtualReward | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Modal state
  const [mName, setMName] = useState("");
  const [mRarity, setMRarity] = useState("common");
  const [mAmount, setMAmount] = useState(1);
  const [mIcon, setMIcon] = useState("✦");
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const res = await api.get("/gacha/admin/virtual-rewards");
      setRewards(res.data);
    } catch {
      toast.error({ title: "Không thể tải danh sách quà ảo" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bật / tắt quà ảo
  const handleToggle = async (r: VirtualReward) => {
    try {
      await api.put(`/gacha/admin/virtual-rewards/${r.id}`, { isActive: !r.isActive });
      setRewards((prev) => prev.map((x) => (x.id === r.id ? { ...x, isActive: !r.isActive } : x)));
      toast.success({ title: !r.isActive ? "Đã bật quà này!" : "Đã tắt quà này" });
    } catch {
      toast.error({ title: "Lỗi cập nhật quà" });
    }
  };

  const openEdit = (r: VirtualReward) => {
    setEditing(r);
    setMName(r.name);
    setMRarity(r.rarity);
    setMAmount(r.amount);
    setMIcon(r.icon);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !mName.trim()) {
      toast.error({ title: "Điền tên quà" });
      return;
    }
    setSubmitting(true);
    try {
      await api.put(`/gacha/admin/virtual-rewards/${editing.id}`, {
        name: mName.trim(),
        rarity: mRarity,
        amount: mAmount,
        icon: mIcon || "✦",
      });
      setRewards((prev) =>
        prev.map((x) =>
          x.id === editing.id ? { ...x, name: mName.trim(), rarity: mRarity, amount: mAmount, icon: mIcon || "✦" } : x
        )
      );
      setShowModal(false);
      toast.success({ title: "Đã cập nhật quà!" });
    } catch (err: any) {
      toast.error({ title: err.response?.data?.error || "Lỗi lưu quà" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-400 text-xs">Đang tải dữ liệu...</div>;

  const activeCount = rewards.filter((r) => r.isActive).length;
  const sorted = [...rewards].sort((a, b) => {
    const r = (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0);
    if (r !== 0) return r;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          Quản Lý Quà Ảo Gacha
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Bật/tắt, đổi độ hiếm, tên và số lượng cho các quà ảo (EXP, Vàng, Gợi ý, Khiên, Avatar, Emoji) khi mở gói thẻ.
          Đang có: <b className="text-amber-600 dark:text-amber-400">{activeCount}/{rewards.length}</b> quà được kích hoạt.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((r) => (
          <div
            key={r.id}
            className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
              r.isActive
                ? "border-amber-300/60 dark:border-amber-500/40 bg-amber-50/40 dark:bg-amber-500/[0.06]"
                : "border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 opacity-70"
            }`}
          >
            {/* Icon + Type + name */}
            <div className="flex items-start gap-3 mb-3">
              <span className="w-11 h-11 grid place-items-center rounded-xl bg-white dark:bg-slate-950/60 border border-slate-100 dark:border-white/10 text-2xl shadow-sm">
                {r.icon}
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{r.name}</h4>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">{r.rewardType}</span>
              </div>
              <span
                className={`shrink-0 w-7 h-7 grid place-items-center rounded-lg border ${
                  r.isActive
                    ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                    : "border-slate-200 dark:border-white/10 text-slate-300 dark:text-slate-600"
                }`}
              >
                <Power className="h-3.5 w-3.5" />
              </span>
            </div>

            {/* Rarity + amount badges */}
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold font-mono uppercase ${RARITY_COLORS[r.rarity] || RARITY_COLORS.common}`}>
                {r.rarity}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[10px] font-bold font-mono text-slate-600 dark:text-slate-300">
                x{r.amount}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-white/10">
              <button
                onClick={() => openEdit(r)}
                className="flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 transition-all"
              >
                <Pencil className="h-3.5 w-3.5 text-blue-500" /> Sửa
              </button>
              <button
                onClick={() => handleToggle(r)}
                className={`flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  r.isActive
                    ? "bg-red-500/10 hover:bg-red-500/20 border border-red-400/40 dark:border-red-500/30 text-red-600 dark:text-red-400"
                    : "bg-emerald-500 hover:bg-emerald-400 text-black shadow"
                }`}
              >
                <Power className="h-3.5 w-3.5" />
                {r.isActive ? "Tắt" : "Bật"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal sửa quà */}
      {showModal && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-sm p-5 rounded-[20px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl text-slate-900 dark:text-slate-200">
            <h3 className="text-base font-bold mb-4 flex items-center gap-2">
              <span className="text-2xl">{editing.icon}</span> Sửa quà ảo
            </h3>

            <form onSubmit={handleSave} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Tên quà *</label>
                <input
                  type="text"
                  required
                  value={mName}
                  onChange={(e) => setMName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Icon</label>
                  <input
                    type="text"
                    value={mIcon}
                    onChange={(e) => setMIcon(e.target.value)}
                    placeholder="✦"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-amber-500 text-center text-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Số lượng</label>
                  <input
                    type="number"
                    min={1}
                    value={mAmount}
                    onChange={(e) => setMAmount(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Độ hiếm</label>
                <select
                  value={mRarity}
                  onChange={(e) => setMRarity(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-amber-500 font-bold ${RARITY_COLORS[mRarity] || ""}`}
                >
                  <option value="common">Common</option>
                  <option value="rare">Rare</option>
                  <option value="epic">Epic</option>
                  <option value="legendary">Legendary</option>
                  <option value="mythic">Mythic</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold shadow transition-all active:scale-95"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lưu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}