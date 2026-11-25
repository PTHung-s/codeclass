import { useEffect, useRef, useState } from "react";

/**
 * Floating reward animation ("+N EXP" / "+N vàng"), adapted from the user's
 * demo: the number counts up, then holds still so it can be read, then floats
 * up and fades. Rendered above the whole app (fixed, high z-index) at the given
 * pixel coordinates, so it is not affected by ancestor overflow/transform.
 *
 * The parent (FloatingRewardContainer) owns lifecycle and position; this
 * component only animates a single reward and calls onDone when finished.
 */
export type RewardKind = "exp" | "gold";

export interface FloatingRewardData {
  id: string;
  kind: RewardKind;
  amount: number; // signed: +N gain, -N spend
  x: number; // viewport px
  y: number; // viewport px
  duration?: number; // ms of the "hold" phase (default 1200)
}

const KIND_STYLE: Record<RewardKind, { color: string; shadow: string; label: string; icon: string }> = {
  exp: {
    color: "#FFD700",
    shadow: "0 0 12px rgba(255,215,0,0.8), -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000",
    label: "EXP",
    icon: "⚡",
  },
  gold: {
    color: "#F59E0B",
    shadow: "0 0 12px rgba(245,158,11,0.8), -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000",
    label: "vàng",
    icon: "🪙",
  },
};

export default function FloatingReward({ reward, onDone }: { reward: FloatingRewardData; onDone: (id: string) => void }) {
  const { id, kind, amount, x, y, duration = 1200 } = reward;
  const style = KIND_STYLE[kind];

  // Count-up toward the absolute amount over ~0.8s (ease-out), then hold.
  const [display, setDisplay] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    const target = Math.abs(amount);
    const totalMs = 800;
    const frameMs = 1000 / 60;
    const totalFrames = Math.round(totalMs / frameMs);
    let frame = 0;
    const timer = setInterval(() => {
      frame++;
      const p = frame / totalFrames;
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.floor(eased * target));
      if (frame >= totalFrames) {
        setDisplay(target);
        clearInterval(timer);
      }
    }, frameMs);
    // Total lifetime: count-up (800ms) + hold (duration) + float/fade (~600ms).
    const lifetime = setTimeout(() => {
      if (!doneRef.current) {
        doneRef.current = true;
        onDone(id);
      }
    }, 800 + duration + 600);
    return () => {
      clearInterval(timer);
      clearTimeout(lifetime);
    };
  }, [amount, duration, id, onDone]);

  const sign = amount < 0 ? "-" : "+";

  return (
    <div
      className="floating-reward"
      style={{ left: x, top: y, color: style.color, textShadow: style.shadow }}
    >
      <span className="fr-icon">{style.icon}</span>
      <span className="fr-amount tabular-nums">{sign}{display.toLocaleString("vi-VN")}</span>
      <span className="fr-label">{style.label}</span>
      <style>{`
        .floating-reward {
          position: fixed;
          z-index: 99999;
          transform: translate(-50%, -50%);
          pointer-events: none;
          user-select: none;
          display: flex;
          align-items: baseline;
          gap: 6px;
          font-size: 1.9rem;
          font-weight: 900;
          white-space: nowrap;
          animation: fr-float-and-hold 2.2s ease-out forwards;
        }
        .floating-reward .fr-icon { font-size: 1.4rem; }
        .floating-reward .fr-label {
          font-size: 1rem;
          font-weight: 700;
          color: #fff;
          text-shadow: 0 0 8px rgba(0,0,0,0.6), -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
        }
        @keyframes fr-float-and-hold {
          0%   { opacity: 0; transform: translate(-50%, 0) scale(0.5); }
          20%  { opacity: 1; transform: translate(-50%, -25px) scale(1.2); }
          25%  { transform: translate(-50%, -30px) scale(1); }
          70%  { opacity: 1; transform: translate(-50%, -40px) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -90px) scale(0.9); }
        }
      `}</style>
    </div>
  );
}