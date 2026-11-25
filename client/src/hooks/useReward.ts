import { useCallback, useMemo } from "react";
import type { RewardKind } from "../components/ui/FloatingReward";

export interface RewardOptions {
  /** Fixed viewport position (px). If omitted and `target` given, anchors to it. */
  x?: number;
  y?: number;
  /** Anchor element — positions the reward just above its top-center. */
  target?: HTMLElement | null;
  /** Hold-phase length in ms (default 1200). */
  duration?: number;
}

export interface RewardDetail extends Required<Pick<RewardOptions, "duration">> {
  id: string;
  kind: RewardKind;
  amount: number;
  x: number;
  y: number;
}

function resolvePosition(opts: RewardOptions): { x: number; y: number } {
  if (typeof opts.x === "number" && typeof opts.y === "number") {
    return { x: opts.x, y: opts.y };
  }
  if (opts.target) {
    const r = opts.target.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top - 8 };
  }
  // Fallback: near the top-center of the viewport (balance pill area).
  return { x: window.innerWidth / 2, y: Math.max(80, window.innerHeight * 0.12) };
}

// ── Anti-duplication between explicit triggers and the balance watcher ──
// When an action explicitly shows a reward (e.g. problem solve at the button),
// the watcher will later detect the same balance change and try to show it again
// at the top-center. Record explicit rewards here so the watcher can skip a
// change it has already surfaced within the last few seconds.
const RECENT_TTL_MS = 5000;
const recent = new Map<string, number>();

function recentKey(kind: RewardKind, amount: number) {
  return `${kind}:${amount}`;
}

function markRecent(kind: RewardKind, amount: number) {
  recent.set(recentKey(kind, amount), Date.now());
}

/** True if (kind, amount) was explicitly shown recently; also clears it. */
export function consumeRecentReward(kind: RewardKind, amount: number): boolean {
  const key = recentKey(kind, amount);
  const at = recent.get(key);
  if (at == null) return false;
  if (Date.now() - at > RECENT_TTL_MS) {
    recent.delete(key);
    return false;
  }
  recent.delete(key);
  return true;
}

export function useReward() {
  const emit = useCallback((kind: RewardKind, amount: number, opts: RewardOptions = {}) => {
    if (!amount) return;
    const { x, y } = resolvePosition(opts);
    markRecent(kind, amount);
    const detail: RewardDetail = {
      id: crypto.randomUUID(),
      kind,
      amount,
      x,
      y,
      duration: opts.duration ?? 1200,
    };
    window.dispatchEvent(new CustomEvent("codeclass:reward", { detail }));
  }, []);

  // Stable object (memoized on `emit`, which is stable) so callers can safely
  // use `reward` as a hook dependency without re-running effects.
  return useMemo(
    () => ({
      showExp: (amount: number, opts?: RewardOptions) => emit("exp", amount, opts),
      showGold: (amount: number, opts?: RewardOptions) => emit("gold", amount, opts),
      show: emit,
    }),
    [emit]
  );
}