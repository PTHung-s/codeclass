import { useEffect, useMemo, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { useHonourCards, type HonourCard as CardData } from "../../hooks/useHonourCards";
import HonourCard from "./HonourCard";
import "./honourCard.css";

const MAX_LEN = 300;
const MIN_LEN = 2;

/**
 * Daily honour ceremony: the top-3 cards fly into the middle of the screen for
 * every student, and a viewer must write one compliment per card before it lets
 * them go. Only students being honoured are exempt from praising.
 *
 * Deliberately not dismissible by Escape, backdrop click or an X — the point of
 * the feature is that everyone stops and says something nice.
 */
export default function HonourOverlay() {
  const { cards, dismiss, praise } = useHonourCards();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const open = cards.length > 0;

  // Lock background scrolling while the ceremony is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const isPreview = cards.some((c) => c.preview);

  // Swallow Escape so the browser's own dismiss gesture cannot skip the praise.
  // In a staff rehearsal Escape closes everything instead — a teacher trying the
  // feature should not be trapped behind a compliment box.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (isPreview) cards.forEach((c) => dismiss(c.userId));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, isPreview, cards, dismiss]);

  // "Daily" reads cleaner than "this day's" — a viewer from yesterday can come
  // back today and see a new set of cards.
  const heading = useMemo(() => {
    if (cards.length === 0) return "";
    if (cards.length === 1) return "Vinh danh học sinh xuất sắc hôm nay";
    return `Vinh danh ${cards.length} học sinh xuất sắc hôm nay`;
  }, [cards.length]);

  if (!open) return null;

  const submit = async (card: CardData) => {
    if (!card.praiseRequired) {
      dismiss(card.userId);
      return;
    }
    const text = (drafts[card.userId] || "").trim();
    if (text.length < MIN_LEN) {
      setErrors((p) => ({ ...p, [card.userId]: "Viết một lời khen nhé" }));
      return;
    }
    // A staff rehearsal must not write into a real student's notifications.
    if (card.preview) {
      dismiss(card.userId);
      return;
    }
    setSending((p) => ({ ...p, [card.userId]: true }));
    setErrors((p) => ({ ...p, [card.userId]: "" }));
    try {
      await praise(card.userId, text);
      dismiss(card.userId);
    } catch (err: any) {
      setErrors((p) => ({
        ...p,
        [card.userId]: err?.response?.data?.error || "Không gửi được, thử lại",
      }));
    } finally {
      setSending((p) => ({ ...p, [card.userId]: false }));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10001] flex flex-col items-center justify-center gap-6 overflow-y-auto bg-gradient-to-b from-slate-950/95 via-blue-950/95 to-slate-950/95 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-200">
          <Sparkles className="h-3.5 w-3.5" /> Bảng vinh danh hôm nay
        </div>
        {isPreview && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-sky-300/30 bg-sky-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-sky-200">
            Đang xem thử — không gửi lời khen thật · Esc để đóng
          </div>
        )}
        <h2 className="mt-3 text-xl font-extrabold text-white sm:text-2xl">{heading}</h2>
        <p className="mt-1 text-xs text-white/60">
          Gửi một lời khen để tiếp tục — bạn bè sẽ đọc được ở phần thông báo
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-center gap-5">
        {cards.map((card, i) => (
          <HonourCard key={card.userId} card={card} index={i}>
            <div className="space-y-1.5">
              {card.praiseRequired ? (
                <>
                  <textarea
                    value={drafts[card.userId] || ""}
                    onChange={(e) =>
                      setDrafts((p) => ({ ...p, [card.userId]: e.target.value.slice(0, MAX_LEN) }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void submit(card);
                      }
                    }}
                    rows={2}
                    placeholder="Khen bạn một câu..."
                    autoFocus={i === 0}
                    className="w-full resize-none rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[11px] text-white placeholder:text-white/35 focus:border-amber-300/60 focus:outline-none"
                  />
                  <button
                    onClick={() => void submit(card)}
                    disabled={sending[card.userId]}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-[11px] font-bold text-slate-900 transition-colors hover:bg-amber-300 disabled:opacity-60"
                  >
                    {sending[card.userId] ? (
                      <><Loader2 className="h-3 w-3 animate-spin" /> Đang gửi</>
                    ) : (
                      <><Send className="h-3 w-3" /> Gửi lời khen</>
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => dismiss(card.userId)}
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-white/20"
                >
                  {card.selfCard ? "Cảm ơn mọi người!" : "Đã khen rồi — đóng"}
                </button>
              )}
              {errors[card.userId] && (
                <p className="text-[10px] font-medium text-red-300">{errors[card.userId]}</p>
              )}
            </div>
          </HonourCard>
        ))}
      </div>

      <p className="text-[10px] text-white/40">Kéo chuột lên thẻ để xem hiệu ứng lấp lánh ✨</p>
    </div>
  );
}
