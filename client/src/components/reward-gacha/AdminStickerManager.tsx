import { useState, useEffect } from "react";
import api from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { useConfirmContext } from "../../hooks/useConfirm";
import { Plus, Trash2, Loader2, Sparkles, Lock } from "lucide-react";

interface AdminSticker {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  rarity: string;
  isGachaReward: boolean;
  createdAt: string;
}

const RARITY_COLORS: Record<string, string> = {
  common: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  rare: "bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800/40",
  epic: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800/40",
  legendary: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/40",
  mythic: "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/40",
};

export function AdminStickerManager() {
  const toast = useToast();
  const confirm = useConfirmContext();
  const [stickers, setStickers] = useState<AdminSticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("meme");
  const [imageUrl, setImageUrl] = useState("");
  const [rarity, setRarity] = useState("rare");
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const res = await api.get("/gacha/admin/stickers");
      setStickers(res.data);
    } catch {
      toast.error({ title: "Không thể tải danh sách sticker" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Bật / tắt đưa sticker vào Gacha
  const handleToggleGacha = async (st: AdminSticker) => {
    try {
      await api.put(`/gacha/admin/stickers/${st.id}`, { isGachaReward: !st.isGachaReward });
      setStickers((prev) =>
        prev.map((s) => (s.id === st.id ? { ...s, isGachaReward: !st.isGachaReward } : s))
      );
      toast.success({
        title: !st.isGachaReward ? "Đã đưa sticker vào Gacha!" : "Đã gỡ sticker khỏi Gacha",
      });
    } catch {
      toast.error({ title: "Lỗi cập nhật sticker" });
    }
  };

  const handleChangeRarity = async (st: AdminSticker, newRarity: string) => {
    try {
      await api.put(`/gacha/admin/stickers/${st.id}`, { rarity: newRarity });
      setStickers((prev) => prev.map((s) => (s.id === st.id ? { ...s, rarity: newRarity } : s)));
      toast.success({ title: `Đã đổi độ hiếm sang ${newRarity}` });
    } catch {
      toast.error({ title: "Lỗi đổi độ hiếm" });
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Xóa sticker",
      message: "Xóa sticker này vĩnh viễn?",
      confirmLabel: "Xóa",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/gacha/admin/stickers/${id}`);
      setStickers((prev) => prev.filter((s) => s.id !== id));
      toast.success({ title: "Đã xóa sticker" });
    } catch {
      toast.error({ title: "Không thể xóa sticker" });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !imageUrl) {
      toast.error({ title: "Điền tên và đường dẫn ảnh sticker" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/gacha/admin/stickers", { name, category, imageUrl, rarity });
      setStickers((prev) => [res.data, ...prev]);
      setShowModal(false);
      setName("");
      setCategory("meme");
      setImageUrl("");
      setRarity("rare");
      toast.success({ title: "Tạo sticker thành công!" });
    } catch (err: any) {
      toast.error({ title: err.response?.data?.error || "Lỗi tạo sticker" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-400 text-xs">Đang tải dữ liệu...</div>;

  const gachaCount = stickers.filter((s) => s.isGachaReward).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Quản Lý Meme Sticker Live Chat
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Bật "Đưa vào Gacha" để học sinh quay gói thẻ có thể mở khóa sticker và gửi trong khung chat.
            Đang có: <b className="text-amber-600 dark:text-amber-400">{gachaCount}/{stickers.length}</b> sticker
            được chọn làm quà.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-black font-bold text-xs shadow transition-all active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" />
          Thêm sticker
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {stickers.map((st) => (
          <div
            key={st.id}
            className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
              st.isGachaReward
                ? "border-amber-300/60 dark:border-amber-500/40 bg-amber-50/50 dark:bg-amber-500/[0.07]"
                : "border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900"
            }`}
          >
            {/* Thumbnail */}
            <div className="w-full h-[110px] flex items-center justify-center bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-100 dark:border-white/5 mb-3">
              {st.imageUrl.startsWith("/") || st.imageUrl.startsWith("http") ? (
                <img src={st.imageUrl} alt={st.name} className="w-16 h-16 object-contain drop-shadow-lg" />
              ) : (
                <span className="text-6xl drop-shadow-lg">{st.imageUrl}</span>
              )}
            </div>

            {/* Name + Category */}
            <div className="mb-2">
              <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{st.name}</h4>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">{st.category}</span>
            </div>

            {/* Rarity selector */}
            <div className="mb-3">
              <select
                value={st.rarity}
                onChange={(e) => handleChangeRarity(st, e.target.value)}
                className={`w-full px-2 py-1 rounded-lg border text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-400 ${RARITY_COLORS[st.rarity] || RARITY_COLORS.common}`}
              >
                <option value="common">Common</option>
                <option value="rare">Rare</option>
                <option value="epic">Epic</option>
                <option value="legendary">Legendary</option>
                <option value="mythic">Mythic</option>
              </select>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-white/10">
              <button
                onClick={() => handleToggleGacha(st)}
                className={`flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  st.isGachaReward
                    ? "bg-amber-500 hover:bg-amber-400 text-black shadow"
                    : "bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {st.isGachaReward ? "Trong Gacha ✓" : "Đưa vào Gacha"}
              </button>
              <span
                className={`w-7 h-7 grid place-items-center rounded-lg border ${
                  st.isGachaReward
                    ? ""
                    : "border-slate-200 dark:border-white/10"
                }`}
              >
                {st.isGachaReward ? (
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                )}
              </span>
              <button
                onClick={() => handleDelete(st.id)}
                className="w-7 h-7 grid place-items-center rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 border border-red-200 dark:border-red-500/30 text-red-500 transition-all"
                title="Xóa"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal thêm sticker */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-sm p-5 rounded-[20px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl text-slate-900 dark:text-slate-200">
            <h3 className="text-base font-bold mb-4">Thêm Meme Sticker mới</h3>

            <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Tên sticker *</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Chú mèo Flex"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">
                  Đường dẫn ảnh hoặc Emoji (VD: /stickers/doge.svg hoặc 🤣) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="/stickers/doge.svg hoặc 🤣"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Danh mục</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-amber-500"
                  >
                    <option value="meme">Meme</option>
                    <option value="coder">Coder</option>
                    <option value="reaction">Reaction</option>
                    <option value="funny">Hài hước</option>
                    <option value="custom">Tùy chỉnh</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Độ hiếm</label>
                  <select
                    value={rarity}
                    onChange={(e) => setRarity(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-amber-500"
                  >
                    <option value="common">Common</option>
                    <option value="rare">Rare</option>
                    <option value="epic">Epic</option>
                    <option value="legendary">Legendary</option>
                    <option value="mythic">Mythic</option>
                  </select>
                </div>
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
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tạo sticker"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}