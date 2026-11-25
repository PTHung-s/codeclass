import { useState, useEffect, useRef } from "react";
import { useAuthContext } from "../../contexts/AuthContext";
import { X, Lock, Check, Star, Coins } from "lucide-react";
import { getAnimalAvatarUrl, getAvatarBgColor } from "../../lib/utils";
import api from "../../lib/api";
import { useToast } from "../../hooks/useToast";

// Avatar tiers synced with server
const AVATAR_TIERS = [
  { id: "default", name: "Mặc định", animalName: "Penguin", cost: 0 },
  { id: "fox", name: "Cáo Đỏ", animalName: "Fox", cost: 25 },
  { id: "panda", name: "Gấu Trúc", animalName: "Panda", cost: 50 },
  { id: "raccoon", name: "Gấu Trúc Đỏ", animalName: "Raccoon", cost: 75 },
  { id: "koala", name: "Gấu Túi", animalName: "Koala", cost: 125 },
  { id: "axolotl", name: "Kỳ Nhông", animalName: "Axolotl", cost: 200 },
  { id: "tiger", name: "Hổ Vằn", animalName: "Tiger", cost: 300 },
  { id: "dinosaur", name: "Khủng Long", animalName: "Dinosaur", cost: 450 },
];

interface AvatarShopData {
  avatars: Array<{
    id: string;
    name: string;
    animalName: string;
    cost: number;
    unlocked: boolean;
    selected: boolean;
  }>;
  tokenBalance: number;
  selectedAvatar: string;
}

interface ProfileDropdownProps {
  open: boolean;
  onClose: () => void;
}

export default function ProfileDropdown({ open, onClose }: ProfileDropdownProps) {
  const { user } = useAuthContext();
  const toast = useToast();
  const [shop, setShop] = useState<AvatarShopData | null>(null);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      fetchShop();
    }
  }, [open]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose]);

  async function fetchShop() {
    try {
      setLoading(true);
      const res = await api.get<AvatarShopData>("/avatars/shop");
      setShop(res.data);
    } catch (err: any) {
      console.error("fetch avatar shop error:", err);
      toast.error({ title: "Không thể tải avatar shop" });
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlock(avatarId: string) {
    try {
      await api.post(`/avatars/unlock/${avatarId}`);
      toast.success({ title: "Đã mở khoá avatar!" });
      fetchShop(); // refresh
    } catch (err: any) {
      toast.error({
        title: err.response?.data?.error || "Không thể mở khoá",
      });
    }
  }

  async function handleSelect(avatarId: string) {
    try {
      await api.post(`/avatars/select/${avatarId}`);
      toast.success({ title: "Đã chọn avatar!" });
      fetchShop(); // refresh
      // Reload page to update avatar everywhere
      setTimeout(() => window.location.reload(), 800);
    } catch (err: any) {
      toast.error({
        title: err.response?.data?.error || "Không thể chọn avatar",
      });
    }
  }

  if (!open) return null;

  return (
    <div
      ref={dropdownRef}
      role="dialog"
      aria-label="Hồ sơ học viên"
      className="absolute right-0 z-50 mt-2 w-[calc(100vw-2rem)] max-w-[22rem] rounded-2xl border border-border bg-card p-4 shadow-lg sm:w-[22rem]"
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* User avatar */}
          <div
            className="relative inline-flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-base font-bold text-white"
            aria-label={`Avatar của ${user?.fullName}`}
            role="img"
            style={{ backgroundColor: getAvatarBgColor(user?.fullName || "") }}
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="absolute inset-0 size-full rounded-full object-cover"
              />
            ) : (
              <span>{user?.fullName?.charAt(0).toUpperCase()}</span>
            )}
          </div>
          {/* User info */}
          <div>
            <p className="text-sm font-semibold">{user?.nickname || user?.fullName}</p>
            {user?.nickname && <p className="text-xs text-muted-foreground">{user.fullName}</p>}
            <p className="flex items-center gap-1 text-xs font-bold text-yellow-700 dark:text-yellow-500">
              <Coins className="size-3.5" />
              {shop?.tokenBalance?.toLocaleString() ?? 0} tokens
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Đóng"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Token balance box */}
      <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-950/30">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-yellow-800 dark:text-yellow-400">
          💰 Số dư tokens
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-yellow-900 dark:text-yellow-300">
          {shop?.tokenBalance?.toLocaleString() ?? 0}
        </p>
      </div>

      {/* Avatar collection */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Bộ sưu tập avatar
        </p>
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Đang tải...</div>
        ) : (
          <ul className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1">
            {shop?.avatars.map((avatar) => {
              const isSelected = avatar.selected;
              const isUnlocked = avatar.unlocked;
              const canAfford = (shop.tokenBalance >= avatar.cost);

              return (
                <li key={avatar.id}>
                  <button
                    onClick={() => {
                      if (isSelected) return;
                      if (!isUnlocked && canAfford) {
                        handleUnlock(avatar.id);
                      } else if (isUnlocked) {
                        handleSelect(avatar.id);
                      }
                    }}
                    disabled={isSelected || (!isUnlocked && !canAfford)}
                    className={`flex w-full flex-col items-center gap-1 rounded-xl border p-2 text-center transition-colors ${
                      isSelected
                        ? "border-primary bg-secondary/50"
                        : isUnlocked
                        ? "border-border hover:bg-muted"
                        : "cursor-not-allowed border-border opacity-60"
                    }`}
                    title={
                      isSelected
                        ? "Đang dùng"
                        : isUnlocked
                        ? "Chọn avatar này"
                        : `Cần ${avatar.cost} tokens để mở khoá`
                    }
                  >
                    {/* Avatar image */}
                    <span className="relative">
                      <div
                        className={`relative inline-flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-base font-bold text-white ${
                          !isUnlocked ? "grayscale" : ""
                        }`}
                        aria-label={`Avatar của ${avatar.name}`}
                        role="img"
                        style={{ backgroundColor: getAvatarBgColor(avatar.name) }}
                      >
                        <img
                          src={getAnimalAvatarUrl(avatar.animalName)}
                          alt=""
                          className="absolute inset-0 size-full rounded-full object-cover"
                        />
                      </div>
                      {/* Check icon for selected */}
                      {isSelected && (
                        <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-primary text-white">
                          <Check className="size-3" />
                        </span>
                      )}
                      {/* Lock overlay for locked */}
                      {!isUnlocked && (
                        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/35">
                          <Lock className="size-4 text-white" />
                        </span>
                      )}
                    </span>
                    {/* Name */}
                    <span className="w-full truncate text-[11px] font-medium leading-tight">
                      {avatar.name}
                    </span>
                    {/* Status/cost */}
                    {isSelected ? (
                      <span className="text-[10px] text-muted-foreground">Đang dùng</span>
                    ) : isUnlocked ? (
                      <span className="text-[10px] text-muted-foreground">Đã mở</span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-muted-foreground">
                        <Star className="size-2.5" />
                        {avatar.cost}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Bấm avatar đã mở để đổi. Avatar có ổ khoá: đủ tokens thì bấm để mở khoá.
        </p>
      </div>
    </div>
  );
}
