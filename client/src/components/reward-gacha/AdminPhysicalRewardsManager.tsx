import { useState, useEffect } from "react";
import api from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { useConfirmContext } from "../../hooks/useConfirm";
import { PuzzleBoard } from "./PuzzlePieceDisplay";
import { Plus, Edit2, Trash2, Gift, Loader2 } from "lucide-react";
import { StudentName } from "../ui/StudentName";
import type { PhysicalReward } from "../../types/gacha";

interface ClaimItem {
  id: string;
  userId: string;
  rewardId: string;
  status: string;
  note: string | null;
  createdAt: string;
  user: { id: string; fullName: string; nickname?: string | null; email: string; avatarUrl: string | null };
  reward: PhysicalReward;
}

export function AdminPhysicalRewardsManager() {
  const toast = useToast();
  const confirm = useConfirmContext();
  const [rewards, setRewards] = useState<PhysicalReward[]>([]);
  const [claims, setClaims] = useState<ClaimItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"rewards" | "claims">("rewards");

  const [showModal, setShowModal] = useState(false);
  const [editingReward, setEditingReward] = useState<PhysicalReward | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [rarity, setRarity] = useState("epic");
  const [stock, setStock] = useState(10);
  const [uploadingImage, setUploadingImage] = useState(false);

  const loadData = async () => {
    try {
      const [resRewards, resClaims] = await Promise.all([
        api.get("/gacha/admin/rewards"),
        api.get("/gacha/admin/claims"),
      ]);
      setRewards(resRewards.data);
      setClaims(resClaims.data);
    } catch {
      toast.error({ title: "Không thể tải dữ liệu quản lý quà tặng" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreate = () => {
    setEditingReward(null);
    setName("");
    setDescription("");
    setImageUrl("");
    setRarity("epic");
    setStock(10);
    setShowModal(true);
  };

  const handleOpenEdit = (r: PhysicalReward) => {
    setEditingReward(r);
    setName(r.name);
    setDescription(r.description || "");
    setImageUrl(r.imageUrl);
    setRarity(r.rarity);
    setStock(r.stock ?? 10);
    setShowModal(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setUploadingImage(true);
    try {
      const res = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImageUrl(res.data.fileUrl);
      toast.success({ title: "Tải ảnh thành công!" });
    } catch {
      toast.error({ title: "Không thể tải ảnh lên" });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !imageUrl) {
      toast.error({ title: "Vui lòng điền tên và tải ảnh phần thưởng" });
      return;
    }

    setSubmitting(true);
    try {
      if (editingReward) {
        await api.put(`/gacha/admin/rewards/${editingReward.id}`, {
          name,
          description,
          imageUrl,
          rarity,
          stock: Number(stock),
        });
        toast.success({ title: "Cập nhật quà tặng thành công!" });
      } else {
        await api.post("/gacha/admin/rewards", {
          name,
          description,
          imageUrl,
          rarity,
          stock: Number(stock),
        });
        toast.success({ title: "Tạo quà tặng ghép mảnh thành công!" });
      }
      setShowModal(false);
      loadData();
    } catch (err: any) {
      toast.error({ title: err.response?.data?.error || "Lỗi lưu quà tặng" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Ngừng phần thưởng",
      message: "Bạn có chắc chắn muốn ngừng phần thưởng hiện vật này?",
      confirmLabel: "Ngừng",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/gacha/admin/rewards/${id}`);
      toast.success({ title: "Đã vô hiệu hoá quà tặng" });
      loadData();
    } catch {
      toast.error({ title: "Không thể xoá" });
    }
  };

  const handleCompleteClaim = async (claimId: string) => {
    const ok = await confirm({
      title: "Trao quà tận tay",
      message: "Xác nhận đã trao phần thưởng này tận tay cho học sinh?",
      confirmLabel: "Xác nhận",
    });
    if (!ok) return;
    try {
      await api.post(`/gacha/admin/claims/${claimId}/complete`);
      toast.success({ title: "Đã xác nhận trao quà thành công!" });
      loadData();
    } catch {
      toast.error({ title: "Lỗi duyệt trao quà" });
    }
  };

  const getRarityBadge = (rarity: string) => {
    switch (rarity.toLowerCase()) {
      case "mythic":
        return "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/40";
      case "legendary":
        return "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/40";
      case "rare":
        return "bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800/40";
      case "epic":
      default:
        return "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800/40";
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400 text-xs">Đang tải dữ liệu...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Gift className="h-4 w-4 text-amber-500" />
            Quản Lý Quà Hiện Vật & Mảnh Ghép Puzzle
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Ảnh quà tặng được tự động cắt thành 4 mảnh puzzle bo cong đưa vào gói thẻ may mắn.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-white/10 p-0.5 shadow-sm">
            <button
              onClick={() => setActiveTab("rewards")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "rewards"
                  ? "bg-white dark:bg-amber-500 text-slate-900 dark:text-black shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              Danh sách quà ({rewards.length})
            </button>
            <button
              onClick={() => setActiveTab("claims")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "claims"
                  ? "bg-white dark:bg-amber-500 text-slate-900 dark:text-black shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              Đổi quà ({claims.filter((c) => c.status === "pending").length})
            </button>
          </div>

          {activeTab === "rewards" && (
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-black font-bold text-xs shadow transition-all active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm quà mới
            </button>
          )}
        </div>
      </div>

      {/* ── TAB 1: DANH SÁCH QUÀ ── */}
      {activeTab === "rewards" && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {rewards.map((r) => (
            <div
              key={r.id}
              className={`bg-white dark:bg-slate-900 border rounded-[20px] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-none flex flex-col justify-between transition-all ${
                r.isActive
                  ? "border-slate-200/80 dark:border-white/10"
                  : "border-red-500/30 opacity-60"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider border ${getRarityBadge(
                      r.rarity
                    )}`}
                  >
                    {r.rarity}
                  </span>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-mono">
                    Kho: <b className="text-slate-900 dark:text-white">{r.stock ?? "∞"}</b>
                  </span>
                </div>

                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate mb-1">
                  {r.name}
                </h3>
                {r.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mb-4">
                    {r.description}
                  </p>
                )}

                {/* Preview 4 mảnh puzzle khung lớn khít khao */}
                <div className="w-full h-[225px] flex items-center justify-center bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-100 dark:border-white/5 mb-4 p-2 overflow-visible">
                  <PuzzleBoard
                    imageUrl={r.imageUrl}
                    pieces={[{ pieceIndex: 0, count: 1 }, { pieceIndex: 1, count: 1 }, { pieceIndex: 2, count: 1 }, { pieceIndex: 3, count: 1 }]}
                    size={200}
                    showCount={false}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-white/10">
                <button
                  onClick={() => handleOpenEdit(r)}
                  className="flex-1 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                >
                  <Edit2 className="h-3.5 w-3.5 text-blue-500" /> Sửa
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="w-9 h-9 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 border border-red-200 dark:border-red-500/30 text-red-500 flex items-center justify-center transition-all"
                  title="Xoá"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {rewards.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-400 text-sm font-medium">
              Chưa có phần thưởng hiện vật nào. Hãy bấm "Thêm quà mới" để tạo!
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: DUYỆT ĐỔI QUÀ ── */}
      {activeTab === "claims" && (
        <div className="rounded-[20px] border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-black/40 border-b border-slate-200/80 dark:border-white/10 text-slate-500 dark:text-slate-400 font-mono">
              <tr>
                <th className="p-3.5">Học sinh</th>
                <th className="p-3.5">Phần thưởng</th>
                <th className="p-3.5">Thời gian</th>
                <th className="p-3.5">Trạng thái</th>
                <th className="p-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-700 dark:text-slate-200">
              {claims.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="p-3.5">
                    <StudentName fullName={c.user.fullName} nickname={c.user.nickname} primaryClassName="text-sm font-bold text-slate-900 dark:text-slate-100" />
                    <div className="text-[10px] text-slate-400 font-mono">{c.user.email}</div>
                  </td>
                  <td className="p-3.5">
                    <div className="flex items-center gap-2.5">
                      <img src={c.reward.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-white/10 shadow-sm" />
                      <div>
                        <div className="font-bold text-xs text-slate-900 dark:text-white">{c.reward.name}</div>
                        <span className="text-[9px] uppercase text-amber-500 font-bold font-mono">{c.reward.rarity}</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-3.5 text-slate-500 dark:text-slate-400 font-mono">
                    {new Date(c.createdAt).toLocaleDateString("vi-VN")}
                  </td>
                  <td className="p-3.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        c.status === "completed"
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30"
                          : "bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30"
                      }`}
                    >
                      {c.status === "completed" ? "Đã trao quà" : "Chờ trao quà"}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    {c.status === "pending" ? (
                      <button
                        onClick={() => handleCompleteClaim(c.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all active:scale-95"
                      >
                        Xác nhận đã trao quà
                      </button>
                    ) : (
                      <span className="text-slate-400 font-medium">Hoàn tất</span>
                    )}
                  </td>
                </tr>
              ))}
              {claims.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 text-sm font-medium">
                    Chưa có yêu cầu đổi quà hiện vật nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MODAL CREATE / EDIT ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md p-6 rounded-[24px] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-white/10 shadow-2xl text-slate-900 dark:text-slate-200">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              {editingReward ? "Chỉnh sửa quà tặng" : "Thêm quà hiện vật mới"}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Tên phần thưởng *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Áo thun CodeClass Limited"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Mô tả ngắn</label>
                <textarea
                  rows={2}
                  placeholder="Mô tả chi tiết quà tặng..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Độ hiếm *</label>
                  <select
                    value={rarity}
                    onChange={(e) => setRarity(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 font-semibold"
                  >
                    <option value="rare">Rare (Hiếm)</option>
                    <option value="epic">Epic (Sử thi)</option>
                    <option value="legendary">Legendary (Huyền thoại)</option>
                    <option value="mythic">Mythic (Thần thoại)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Số lượng trong kho</label>
                  <input
                    type="number"
                    min={1}
                    value={stock}
                    onChange={(e) => setStock(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Ảnh quà tặng (Hình vuông) *</label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="text-xs text-slate-500 file:mr-2.5 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 dark:file:bg-white/10 file:text-slate-900 dark:file:text-white hover:file:bg-slate-200"
                  />
                  {uploadingImage && <Loader2 className="h-4 w-4 animate-spin text-amber-500" />}
                </div>
              </div>

              {/* Preview 4 mảnh puzzle trong modal */}
              {imageUrl && (
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10">
                  <div className="text-xs font-bold text-slate-700 dark:text-amber-300 mb-2 text-center">
                    Preview: 4 Mảnh Ghép Puzzle Khớp Nối
                  </div>
                  <div className="flex items-center justify-center p-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/5 mx-auto overflow-visible">
                    <PuzzleBoard
                      imageUrl={imageUrl}
                      pieces={[{ pieceIndex: 0, count: 1 }, { pieceIndex: 1, count: 1 }, { pieceIndex: 2, count: 1 }, { pieceIndex: 3, count: 1 }]}
                      size={180}
                      showCount={false}
                    />
                  </div>
                </div>
              )}

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
                  disabled={submitting || !imageUrl}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-black font-bold shadow transition-all active:scale-95"
                >
                  {submitting ? "Đang lưu..." : "Lưu phần thưởng"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
