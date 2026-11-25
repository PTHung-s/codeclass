import { useEffect, useRef, useState } from "react";
import { Coins, Eye, Flashlight, ShieldCheck, Zap } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { ArenaState } from "../../../lib/arenaTypes";

/** Everything a live chaos effect currently means for one viewer. */
export interface ChaosView {
  hasGenerator: boolean;
  /** Someone blacked this viewer out and no generator is shielding them. */
  blackedOut: boolean;
  blackoutEndsAt: string | null;
  /** This viewer is the one who cut the power. */
  casterEndsAt: string | null;
  usedBlackout: boolean;
  usedGenerator: boolean;
  activeEffects: ArenaState["chaosEffects"];
}

/**
 * Chaos is only wired up for versus + debug, and the server refuses a power in
 * the last 15 seconds or twice per question. This mirrors those rules so the
 * buttons disable instead of failing.
 */
export function readChaos(state: ArenaState, userId: string, now: number): ChaosView {
  const all = state.chaosEffects || [];
  const active = all.filter((e) => new Date(e.endsAt).getTime() > now);
  const hasGenerator = active.some((e) => e.power === "generator" && e.targetUserIds.includes(userId));
  const blackout = active.find((e) => e.power === "blackout" && e.targetUserIds.includes(userId));
  const caster = active.find((e) => e.power === "blackout" && e.sourceUserId === userId);
  const qi = state.match.currentQuestionIndex;
  return {
    hasGenerator,
    blackedOut: !!blackout && !hasGenerator,
    blackoutEndsAt: blackout?.endsAt ?? null,
    casterEndsAt: caster?.endsAt ?? null,
    usedBlackout: all.some((e) => e.power === "blackout" && e.sourceUserId === userId && e.questionIndex === qi),
    usedGenerator: all.some((e) => e.power === "generator" && e.sourceUserId === userId && e.questionIndex === qi),
    activeEffects: active,
  };
}

export function ChaosPowerBar({
  chaos,
  disabled,
  onUse,
  message,
}: {
  chaos: ChaosView;
  disabled: boolean;
  onUse: (power: "blackout" | "generator") => void;
  message: string | null;
}) {
  return (
    <div className="relative z-[80] flex flex-wrap items-center gap-2" aria-label="Bổ trợ arena">
      <button
        type="button"
        disabled={disabled || chaos.usedBlackout}
        onClick={() => onUse("blackout")}
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 text-sm font-bold text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Zap className="size-4 fill-amber-400 text-amber-300" />
        <span>Cúp điện</span>
        <span className="inline-flex items-center rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-amber-950">
          <Coins className="mr-0.5 size-3" />
          10
        </span>
      </button>
      <button
        type="button"
        disabled={disabled || chaos.usedGenerator || chaos.hasGenerator}
        onClick={() => onUse("generator")}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-3 text-sm font-bold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40",
          chaos.blackedOut &&
            !chaos.usedGenerator &&
            !disabled &&
            "animate-pulse border-emerald-300 bg-emerald-300 text-emerald-950 shadow-[0_0_26px_rgba(52,211,153,.75)]",
        )}
      >
        <ShieldCheck className="size-4" />
        <span>Máy phát</span>
        <span className="inline-flex items-center rounded-md bg-emerald-400 px-1.5 py-0.5 text-[10px] font-black text-emerald-950">
          <Coins className="mr-0.5 size-3" />5
        </span>
      </button>
      {message && <span className="text-[11px] text-slate-400">{message}</span>}
      <span className="sr-only" aria-live="polite">
        {message || ""}
      </span>
    </div>
  );
}

/** Ticks until `endsAt`; returns false once the effect has expired. */
function useStillActive(endsAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [endsAt]);
  return !!endsAt && new Date(endsAt).getTime() > now;
}

type Rect = { left: number; top: number; width: number; height: number };

const SPOT_RADIUS = 116;

const sameRects = (a: Rect[], b: Rect[]) =>
  a.length === b.length &&
  a.every((r, i) => r.left === b[i].left && r.top === b[i].top && r.width === b[i].width && r.height === b[i].height);

/**
 * Track the code panels in viewport coordinates.
 *
 * The darkness is drawn as `fixed` panels sitting on top of the cards rather
 * than as a `::before` inside them, because the spotlight is a mask and a mask
 * is resolved against its own element's box. Placing the darkness at the card's
 * measured rect is what lets one pointer position carve a hole through both
 * panels at once.
 *
 * `.blackout-overlay` is a marker class on the work area — no styles hang off
 * it, it just scopes the query to the panels of the player being blacked out.
 */
function useCardRects(active: boolean): Rect[] {
  const [rects, setRects] = useState<Rect[]>([]);

  useEffect(() => {
    if (!active) {
      setRects([]);
      return;
    }
    let frame = 0;

    const measure = () => {
      const next = Array.from(document.querySelectorAll<HTMLElement>(".blackout-overlay .arena-code-card"))
        .map((node) => node.getBoundingClientRect())
        // A hidden panel (the tab you are not on, below lg) measures 0×0.
        .filter((r) => r.width > 1 && r.height > 1)
        .map((r) => ({ left: r.left, top: r.top, width: r.width, height: r.height }));
      setRects((prev) => (sameRects(prev, next) ? prev : next));
    };

    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    const observer = new ResizeObserver(schedule);
    document.querySelectorAll(".blackout-overlay .arena-code-card").forEach((node) => observer.observe(node));
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    // Safety net: the tab switch below lg swaps which panel is laid out, and a
    // blackout only lasts a few seconds — a cheap poll beats a missed frame.
    const poll = window.setInterval(measure, 400);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.clearInterval(poll);
    };
  }, [active]);

  return rects;
}

/**
 * Blackout: the code panels go dark, and the player gets a torch.
 *
 * Only the panels are covered — the timer, scoreboard and submit bar stay lit,
 * so losing the lights costs you reading speed, not your bearings. Move the
 * pointer (or drag a finger) and a small circle of the code becomes legible
 * again; you can read the whole panel, just never more than a slice at a time.
 *
 * The overlay is `pointer-events: none` throughout, which is the joke: every
 * control underneath stays live. You can still type and still click a line —
 * you just can't see what you're doing.
 */
export function BlackoutMask({ endsAt }: { endsAt: string | null }) {
  const active = useStillActive(endsAt);
  const rects = useCardRects(active);
  const [spot, setSpot] = useState(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
  const [moved, setMoved] = useState(false);
  const frameRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    const onMove = (event: PointerEvent) => {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = window.requestAnimationFrame(() => {
        setSpot({ x: event.clientX, y: event.clientY });
        setMoved(true);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    return () => {
      window.cancelAnimationFrame(frameRef.current);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
    };
  }, [active]);

  if (!active) return null;

  const overCard = rects.some(
    (r) => spot.x >= r.left && spot.x <= r.left + r.width && spot.y >= r.top && spot.y <= r.top + r.height,
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[75]" aria-live="assertive" aria-label="Mất điện">
      {rects.map((r, index) => {
        // Mask coordinates are relative to this panel's own box, so the shared
        // viewport position has to be rebased per panel.
        const gradient = `radial-gradient(circle ${SPOT_RADIUS}px at ${spot.x - r.left}px ${spot.y - r.top}px, transparent 0, transparent 46%, rgba(0,0,0,.6) 74%, black 100%)`;
        return (
          <div
            key={index}
            className="absolute rounded-2xl bg-[#030712]/[.94]"
            style={{
              left: r.left,
              top: r.top,
              width: r.width,
              height: r.height,
              maskImage: gradient,
              WebkitMaskImage: gradient,
            }}
          />
        );
      })}

      {/* The torch itself — a warm ring so the lit circle reads as a light. */}
      {overCard && (
        <div
          className="absolute size-[232px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-100/20 bg-[radial-gradient(circle,rgba(255,238,194,.16)_0%,rgba(251,191,36,.07)_54%,transparent_74%)] shadow-[inset_0_0_26px_rgba(251,191,36,.14),0_0_40px_rgba(251,191,36,.12)]"
          style={{ left: spot.x, top: spot.y }}
        />
      )}

      {!moved && rects.length > 0 && (
        <div className="absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-300/40 bg-slate-950/90 px-3 py-1.5 text-xs font-bold text-amber-200 shadow-xl">
          <Flashlight className="size-3.5" /> Rê chuột (hoặc miết ngón tay) để soi đèn
        </div>
      )}
    </div>
  );
}

/** Amber frame telling the caster their blackout is still running. */
export function BlackoutCasterFrame({ endsAt }: { endsAt: string | null }) {
  const active = useStillActive(endsAt);
  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[65] border-[3px] border-amber-400/80 shadow-[inset_0_0_0_1px_rgba(255,249,196,.55),inset_0_0_34px_rgba(245,158,11,.3)]">
      <div className="absolute right-4 top-16 flex items-center gap-2 rounded-full border border-amber-300/60 bg-slate-950/90 px-3 py-1.5 text-xs font-bold text-amber-200 shadow-xl">
        <Zap className="size-3.5 fill-amber-300" /> Cúp điện đang kích hoạt
      </div>
    </div>
  );
}

export function StaffChaosStatus({ state, effects }: { state: ArenaState; effects: ArenaState["chaosEffects"] }) {
  const blackouts = effects.filter((e) => e.power === "blackout");
  const generators = effects.filter((e) => e.power === "generator");
  const affected = new Set(blackouts.flatMap((e) => e.targetUserIds));
  generators.forEach((e) => e.targetUserIds.forEach((uid) => affected.delete(uid)));
  const nameOf = (uid: string) => state.players.find((p) => p.userId === uid)?.fullName || "Người chơi";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs",
        affected.size > 0
          ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      )}
    >
      <span className="inline-flex items-center gap-1 font-bold">
        <Eye className="size-3.5" /> Trạng thái Chaos:
      </span>
      {blackouts.length > 0 ? (
        <>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 font-semibold">
            <Zap className="size-3 fill-amber-400" /> {nameOf(blackouts[blackouts.length - 1].sourceUserId)} đã cúp điện
          </span>
          <span>{affected.size} học sinh đang mất điện</span>
          {generators.length > 0 && <span>· {generators.length} máy phát đang hoạt động</span>}
        </>
      ) : (
        <span>Đèn đang sáng bình thường</span>
      )}
    </div>
  );
}
