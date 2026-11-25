import { useCallback, useEffect, useState } from "react";
import api from "../lib/api";
import { useAuthContext } from "../contexts/AuthContext";

export interface HonourCard {
  userId: string;
  fullName: string;
  rank: number;
  xp: number;
  avatarUrl: string;
  avatarName: string;
  selfCard: boolean;
  /** false when this is the viewer's own card, or they already praised today. */
  praiseRequired: boolean;
  /**
   * Staff preview only. A preview card never records a showing and never sends a
   * praise, so a teacher can rehearse the ceremony without consuming a
   * student's once-per-day card or writing into anyone's notifications.
   */
  preview?: boolean;
}

/** Event a staff preview panel dispatches to show cards without touching the API. */
export const HONOUR_PREVIEW_EVENT = "codeclass:honour-preview";

export function previewHonourCards(cards: HonourCard[]): void {
  window.dispatchEvent(new CustomEvent(HONOUR_PREVIEW_EVENT, { detail: { cards } }));
}

/**
 * Fetches the honour cards owed to the current student, once per mount.
 *
 * The server marks cards as shown in the same request that returns them, so
 * this must fire exactly once per page load — a second call would return
 * nothing, and a call fired twice concurrently would burn cards the student
 * never saw. Hence the module-level guard: React StrictMode double-invokes
 * effects in development, and the ref-per-component approach does not survive
 * that when two components mount.
 */
let fetchedThisLoad = false;

export function useHonourCards() {
  const { user } = useAuthContext();
  const [cards, setCards] = useState<HonourCard[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Only students are honoured or asked to praise.
    if (!user || user.role !== "student") return;
    if (fetchedThisLoad) return;
    fetchedThisLoad = true;

    let cancelled = false;
    // Small delay so the cards arrive after the page has painted, rather than
    // fighting the initial render for the main thread.
    const timer = setTimeout(() => {
      api
        .get("/honour/pending")
        .then((r) => {
          if (cancelled) return;
          const list = Array.isArray(r.data?.cards) ? (r.data.cards as HonourCard[]) : [];
          setCards(list.slice(0, 3));
          setLoaded(true);
        })
        .catch(() => {
          // Silent: a failed honour fetch must never block the app.
          if (!cancelled) setLoaded(true);
        });
    }, 1200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user]);

  // Staff preview: cards pushed in by the rehearsal panel, for any role.
  useEffect(() => {
    const handler = (e: Event) => {
      const list = (e as CustomEvent).detail?.cards;
      if (Array.isArray(list)) setCards(list.slice(0, 3).map((c) => ({ ...c, preview: true })));
    };
    window.addEventListener(HONOUR_PREVIEW_EVENT, handler);
    return () => window.removeEventListener(HONOUR_PREVIEW_EVENT, handler);
  }, []);

  const dismiss = useCallback((userId: string) => {
    setCards((prev) => prev.filter((c) => c.userId !== userId));
  }, []);

  const praise = useCallback(async (honoureeId: string, message: string) => {
    await api.post("/honour/praise", { honoureeId, message });
  }, []);

  return { cards, loaded, dismiss, praise };
}
