import { useEffect, useState } from "react";
import { Check, Lock, Sparkles, X } from "lucide-react";
import api from "../../lib/api";
import { AvatarTier, getAvatarUrl, getAvatarBgColor } from "../../lib/avatarShop";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { useReward } from "../../hooks/useReward";

interface AvatarShopModalProps {
  open: boolean;
  onClose: () => void;
  onAvatarChanged?: () => void;
}

interface ShopData {
  avatars: AvatarTier[];
  tokenBalance: number;
  selectedAvatar: string;
}

export default function AvatarShopModal({ open, onClose, onAvatarChanged }: AvatarShopModalProps) {
  const [shop, setShop] = useState<ShopData | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const reward = useReward();

  useEffect(() => {
    if (open) {
      fetchShop();
    }
  }, [open]);

  const fetchShop = async () => {
    try {
      setLoading(true);
      const res = await api.get("/avatars/shop");
      setShop(res.data);
    } catch (err) {
      console.error("fetch avatar shop error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async (avatarId: string) => {
    if (!shop) return;
    try {
      setActionLoading(avatarId);
      await api.post(`/avatars/unlock/${avatarId}`);
      const cost = shop.avatars.find((a) => a.id === avatarId)?.cost ?? 0;
      if (cost > 0) reward.showGold(-cost); // spending vàng on unlock
      await fetchShop();
      if (onAvatarChanged) onAvatarChanged();
    } catch (err: any) {
      alert(err.response?.data?.error || "Không thể mở khoá avatar.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSelect = async (avatarId: string) => {
    if (!shop) return;
    try {
      setActionLoading(avatarId);
      await api.post(`/avatars/select/${avatarId}`);
      await fetchShop();
      if (onAvatarChanged) onAvatarChanged();
    } catch (err: any) {
      alert(err.response?.data?.error || "Không thể chọn avatar.");
    } finally {
      setActionLoading(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Sparkles className="size-5 text-brand-600" />
              Bộ sưu tập avatar
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Mở khoá avatar đẹp bằng tokens
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Token Balance */}
        {shop && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
              🪙 Số dư: {shop.tokenBalance.toLocaleString("vi-VN")} tokens
            </p>
          </div>
        )}

        {/* Avatar Grid */}
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">Đang tải...</div>
        ) : shop ? (
          <div className="max-h-[60vh] overflow-y-auto pr-2">
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {shop.avatars.map((avatar, idx) => {
                const isSelected = avatar.selected;
                const isUnlocked = avatar.unlocked;
                const isProcessing = actionLoading === avatar.id;
                const canAfford = shop.tokenBalance >= avatar.cost;

                return (
                  <li key={avatar.id}>
                    <button
                      onClick={() => {
                        if (isUnlocked) handleSelect(avatar.id);
                        else if (canAfford) handleUnlock(avatar.id);
                      }}
                      disabled={isProcessing || (!isUnlocked && !canAfford)}
                      className={cn(
                        "flex w-full flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors",
                        isSelected
                          ? "border-brand-600 bg-brand-50 dark:bg-brand-950"
                          : isUnlocked
                            ? "border-border hover:bg-muted"
                            : "cursor-not-allowed border-border opacity-60"
                      )}
                      title={
                        isSelected
                          ? "Đang dùng"
                          : isUnlocked
                            ? "Chọn avatar này"
                            : canAfford
                              ? `Mở khoá với ${avatar.cost} tokens`
                              : `Cần ${avatar.cost} tokens`
                      }
                    >
                      <span className="relative">
                        <div
                          className={cn(
                            "relative inline-flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full",
                            !isUnlocked && "grayscale"
                          )}
                          style={{ backgroundColor: getAvatarBgColor(idx) }}
                        >
                          <img
                            src={getAvatarUrl(avatar.animalName)}
                            alt={avatar.name}
                            className="size-full rounded-full object-cover"
                          />
                        </div>
                        {isSelected && (
                          <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-brand-600 text-white">
                            <Check className="size-3" />
                          </span>
                        )}
                        {!isUnlocked && (
                          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/35">
                            <Lock className="size-4 text-white" />
                          </span>
                        )}
                      </span>
                      <span className="w-full truncate text-xs font-medium leading-tight">
                        {avatar.name}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                        {avatar.cost === 0 ? (
                          "Miễn phí"
                        ) : isUnlocked ? (
                          "Đã mở"
                        ) : (
                          <>🪙 {avatar.cost}</>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Bấm avatar đã mở để chọn. Avatar có ổ khoá: đủ tokens thì bấm để mở khoá.
            </p>
          </div>
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            Không thể tải avatar shop
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex justify-end">
          <Button onClick={onClose} variant="outline">
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
}
