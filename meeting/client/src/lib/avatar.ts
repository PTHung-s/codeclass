/**
 * Avatar thống nhất với CodeClass — "con vật" kiểu Google Docs.
 *
 * 3 lớp: nền màu (hash theo tên) → chữ cái đầu → ảnh con vật (ẩn nếu lỗi tải).
 * Regeln: trùng với client/src/components/ui/StudentAvatar.tsx của CodeClass
 * (cùng bảng màu 16 màu + cùng thuật toán hash) để một học sinh có cùng
 * màu/ avatar ở cả CodeClass lẫn Meet.
 */

/** 16 màu nền — giống BG_PALETTE của CodeClass (bắt đầu #0066cc, #0d9488, #ec4899…) */
export const BG_PALETTE = [
  '#0066cc', '#0d9488', '#ec4899', '#f97316',
  '#8b5cf6', '#eab308', '#14b8a6', '#ef4444',
  '#3b82f6', '#84cc16', '#a855f7', '#f43f5e',
  '#06b6d4', '#22c55e', '#e879f9', '#f59e0b',
];

/** Hash giống lib/utils.ts của CodeClass: h = charCode + (h<<5) - h (int32) */
export const avatarBgColor = (name?: string | null): string => {
  const seed = name || '';
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = seed.charCodeAt(i) + ((h << 5) - h);
    h |= 0; // ép int32
  }
  return BG_PALETTE[Math.abs(h) % BG_PALETTE.length];
};

/** Ảnh con vật anonymous-animals (giống CodeClass) — tên rỗng → "anonymous" */
export const animalAvatarUrl = (name?: string | null): string =>
  `https://anonymous-animals.azurewebsites.net/avatar/${encodeURIComponent((name || '').trim() || 'anonymous')}`;
