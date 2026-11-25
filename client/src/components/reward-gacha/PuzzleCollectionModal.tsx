import { useState } from "react";
import api from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { useConfirmContext } from "../../hooks/useConfirm";
import type { PuzzleProgress } from "../../types/gacha";
import { PuzzleBoard } from "./PuzzlePieceDisplay";
import { Gift, Sparkles, Loader2 } from "lucide-react";

export function PuzzleCollectionModal({
  puzzleProgress,
  onClaimSuccess,
}: {
  puzzleProgress: PuzzleProgress[];
  onClaimSuccess?: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirmContext();
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const handleClaim = async (rewardId: string, name: string) => {
    const ok = await confirm({
      title: "Đổi mảnh ghép",
      message: `Xác nhận đổi 4 mảnh ghép lấy phần thưởng hiện vật "${name}"?`,
      confirmLabel: "Đổi quà",
    });
    if (!ok) return;

    setClaimingId(rewardId);
    try {
      const res = await api.post(`/gacha/claim-puzzle/${rewardId}`, { note: "Đổi tại web học tập" });
      toast.success({
        title: "Đổi quà thành công! 🎉",
        message: res.data.message || "Hãy liên hệ giáo viên tại lớp để nhận quà thực tế.",
      });
      onClaimSuccess?.();
    } catch (err: any) {
      toast.error({
        title: "Lỗi đổi quà",
        message: err.response?.data?.error || "Không thể thực hiện",
      });
    } finally {
      setClaimingId(null);
    }
  };

  if (!puzzleProgress || puzzleProgress.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500 bg-white dark:bg-slate-900/40 rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-sm">
        <Gift className="h-9 w-9 mx-auto mb-2 opacity-30 text-slate-400" />
        <p className="text-sm font-medium">Hiện chưa có phần thưởng hiện vật nào đang diễn ra.</p>
      </div>
    );
  }

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

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          Bộ Sưu Tập Mảnh Ghép Quà Hiện Vật
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Mở Gói Thẻ để thu thập đủ 4 mảnh. Ghép hoàn chỉnh để đổi quà thực tế tại lớp học!
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {puzzleProgress.map((item) => {
          const { reward, pieces, collectedCount, totalRequired, isComplete } = item;
          const pieceMap = new Map(pieces.map((p) => [p.pieceIndex, p.count]));

          return (
            <div
              key={reward.id}
              className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-white/10 rounded-[20px] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-none flex flex-col justify-between transition-all hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]"
            >
              <div>
                {/* Header Badge & Stock */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider border ${getRarityBadge(
                      reward.rarity
                    )}`}
                  >
                    {reward.rarity}
                  </span>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-mono">
                    Đã có: <b className="text-slate-900 dark:text-white">{collectedCount}</b>/{totalRequired}
                  </span>
                </div>

                {/* Title */}
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate mb-1">
                  {reward.name}
                </h4>
                {reward.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mb-4">
                    {reward.description}
                  </p>
                )}

                {/* 4 Puzzle Pieces Grid: Ghép khít 100% không lệch 1 pixel */}
                <div className="w-full h-[225px] flex items-center justify-center bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-100 dark:border-white/5 mb-4 p-2 overflow-visible">
                  <PuzzleBoard
                    imageUrl={reward.imageUrl}
                    pieces={pieces}
                    size={200}
                    showCount={true}
                  />
                </div>
              </div>

              {/* Action Button */}
              <button
                disabled={!isComplete || claimingId === reward.id}
                onClick={() => handleClaim(reward.id, reward.name)}
                className={`w-full h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  isComplete
                    ? "bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-black shadow-md active:scale-98 cursor-pointer"
                    : "bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500 border border-slate-200/50 dark:border-white/5 cursor-not-allowed"
                }`}
              >
                {claimingId === reward.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Đang gửi yêu cầu...</span>
                  </>
                ) : isComplete ? (
                  <>
                    <Gift className="h-4 w-4" />
                    <span>Đổi Quà Hiện Vật Ngay!</span>
                  </>
                ) : (
                  <span>Còn thiếu {totalRequired - collectedCount} mảnh ghép</span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
