import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns an animal avatar URL from the Anonymous Animals API.
 * Uses the user's fullName as the seed for a consistent animal.
 * Falls back to "anonymous" if no identifier is provided.
 */
export function getAnimalAvatarUrl(identifier?: string | null): string {
  const cleaned = (identifier || "").replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF]+/g, "").trim();
  const seed = cleaned || "student";
  return `https://anonymous-animals.azurewebsites.net/avatar/${encodeURIComponent(seed)}`;
}

/** Vibrant background palette — each user gets a consistent color based on name hash. */
const BG_PALETTE = [
  "#0066cc", // blue (brand)
  "#0d9488", // teal
  "#ec4899", // pink
  "#f43f5e", // rose
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#0891b2", // cyan deep
  "#db2777", // pink deep
  "#ef4444", // red
  "#84cc16", // lime
  "#0ea5e9", // sky
  "#64748b", // slate
];

/**
 * Returns a consistent background color for a user based on their name.
 * Same name → same color every time.
 */
export function getAvatarBgColor(identifier?: string | null): string {
  const seed = identifier?.trim() || "anonymous";
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0; // 32-bit int
  }
  return BG_PALETTE[Math.abs(hash) % BG_PALETTE.length];
}
