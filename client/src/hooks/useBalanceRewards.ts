import { useEffect, useRef } from "react";
import api from "../lib/api";
import { useReward, consumeRecentReward } from "./useReward";
import { socketIsOpen, socketSubscribe } from "../lib/socket";

const OFFLINE_FALLBACK_MS = 60_000;

/**
 * Universal reward watcher. The server emits wallet_changed after every ledger
 * write; REST is now used only to establish/recover the snapshot, not every 4s.
 * Any nonzero change — increase OR decrease — dispatches a floating reward.
 *
 * The first poll only establishes the baseline; it never fires. Errors are
 * ignored (the next poll retries), so a transient failure can't crash the app.
 */
export default function useBalanceRewards() {
  const { showExp, showGold } = useReward();
  const baseline = useRef<{ xp: number; tokenBalance: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;

    async function refresh() {
      if (cancelled) return;
      if (!localStorage.getItem("token")) {
        baseline.current = null;
        return;
      }
      try {
        const { data } = await api.get("/auth/me/rewards");
        if (cancelled) return;
        const prev = baseline.current;
        baseline.current = { xp: data.xp ?? 0, tokenBalance: data.tokenBalance ?? 0 };
        if (prev) {
          const xpDiff = data.xp - prev.xp;
          const balDiff = data.tokenBalance - prev.tokenBalance;
          // Skip changes already surfaced by an explicit trigger (same kind+amount
          // shown at the action button within the last few seconds).
          if (xpDiff !== 0 && !consumeRecentReward("exp", xpDiff)) showExp(xpDiff);
          if (balDiff !== 0 && !consumeRecentReward("gold", balDiff)) showGold(balDiff);
        }
      } catch {
        // A reconnect or the offline fallback retries the snapshot.
      }
    }

    const unsub = socketSubscribe((message) => {
      if (message.type === "wallet_changed" || message.type === "__socket_open") void refresh();
    });
    void refresh();
    // A minimal recovery path for an unavailable WebSocket, instead of 15
    // database reads per minute for every logged-in student.
    fallbackTimer = setInterval(() => {
      if (!socketIsOpen()) void refresh();
    }, OFFLINE_FALLBACK_MS);
    return () => {
      cancelled = true;
      unsub();
      if (fallbackTimer) clearInterval(fallbackTimer);
    };
  }, [showExp, showGold]);
}
