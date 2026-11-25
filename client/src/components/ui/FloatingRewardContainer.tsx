import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import FloatingReward, { type FloatingRewardData } from "./FloatingReward";

/**
 * Global listener for `codeclass:reward` events (emitted by useReward).
 * Portal-renders floating "+N EXP" / "+N vàng" animations at the trigger
 * position, de-duplicates by id, and removes each after it finishes.
 * Mirrors ToastContainer's event-driven pattern.
 */
export default function FloatingRewardContainer() {
  const [rewards, setRewards] = useState<FloatingRewardData[]>([]);

  const removeReward = useCallback((id: string) => {
    setRewards((prev) => prev.filter((r) => r.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as FloatingRewardData;
      setRewards((prev) => {
        // Reject duplicates (same id = same source event, e.g. StrictMode
        // double-mount or a watcher + explicit trigger for the same change).
        if (prev.some((r) => r.id === detail.id)) return prev;
        return [...prev, detail];
      });
    };
    window.addEventListener("codeclass:reward", handler);
    return () => window.removeEventListener("codeclass:reward", handler);
  }, []);

  if (rewards.length === 0) return null;

  return createPortal(
    <>
      {rewards.map((r) => (
        <FloatingReward key={r.id} reward={r} onDone={removeReward} />
      ))}
    </>,
    document.body
  );
}