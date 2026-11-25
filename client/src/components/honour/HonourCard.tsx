import { useCallback, useEffect, useRef, useState } from "react";
import type { HonourCard as HonourCardData } from "../../hooks/useHonourCards";

/**
 * Per-rank foil colours. The pen gives every Pokémon its own colour pair
 * (charizard pink/gold, pika teal/olive, eevee's five-stop rainbow); the same
 * idea keyed on rank, so the three cards on screen never look alike.
 *
 * Rank 1 gets the five-stop gradient — the pen reserves that for its eevee card
 * and it reads as the most special.
 */
const RANK_THEMES = [
  {
    label: "🥇 Hạng 1",
    color1: "#ec9bb6",
    color2: "#ccac6f",
    // Extra stops used by the rank-1 shine override below.
    color3: "#69e4a5",
    color4: "#8ec5d6",
    color5: "#b98cce",
    bg: "linear-gradient(155deg,#3b2f16 0%,#6b4b12 38%,#2a1e08 100%)",
  },
  {
    label: "🥈 Hạng 2",
    color1: "#54a29e",
    color2: "#a79d66",
    bg: "linear-gradient(155deg,#16302f 0%,#28504d 40%,#0d1f1e 100%)",
  },
  {
    label: "🥉 Hạng 3",
    color1: "#efb2fb",
    color2: "#acc6f8",
    bg: "linear-gradient(155deg,#2a1836 0%,#472a55 40%,#170d1e 100%)",
  },
];

/** Sparkle field, inlined so the card does not depend on CodePen's CDN. */
const SPARKLES = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>` +
    Array.from({ length: 26 }, (_, i) => {
      // Deterministic scatter: same layout every render, no Math.random.
      const x = (i * 61) % 160;
      const y = (i * 37 + (i % 5) * 13) % 160;
      const r = 0.6 + ((i % 4) * 0.45);
      const o = 0.35 + ((i % 3) * 0.22);
      return `<circle cx='${x}' cy='${y}' r='${r}' fill='white' opacity='${o}'/>`;
    }).join("") +
    `</svg>`,
);

/** Diagonal weave standing in for the pen's holo.png texture. */
const HOLO_WEAVE =
  "repeating-linear-gradient(45deg," +
  "rgba(255,255,255,0.09) 0 2px,rgba(255,255,255,0) 2px 4px)," +
  "repeating-linear-gradient(-45deg," +
  "rgba(255,255,255,0.06) 0 3px,rgba(255,255,255,0) 3px 6px)";

const IDLE_REARM_MS = 2500;

/**
 * One holographic card.
 *
 * Pointer maths is lifted from the pen: the gradient tracks the cursor at 1/1.5
 * speed, the sparkles at 1/7 (so the foil appears to sit under glass), the foil
 * opacity rises with distance from centre, and tilt is derived from the same
 * two numbers. Values are written to CSS custom properties on the node —
 * ::before/::after inherit them, which is how we avoid the pen's live <style>
 * tag while keeping the pseudo-element layers.
 */
export default function HonourCard({
  card,
  index,
  children,
}: {
  card: HonourCardData;
  index: number;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [idle, setIdle] = useState(true);
  const rearmRef = useRef<ReturnType<typeof setTimeout>>();

  const theme = RANK_THEMES[Math.min(RANK_THEMES.length - 1, Math.max(0, card.rank - 1))];

  const track = useCallback((clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;

    // Pen's normalisation: percentage across the card, inverted.
    const px = Math.abs(Math.floor((100 / r.width) * (clientX - r.left)) - 100);
    const py = Math.abs(Math.floor((100 / r.height) * (clientY - r.top)) - 100);
    const pa = 50 - px + (50 - py);

    const lp = 50 + (px - 50) / 1.5;
    const tp = 50 + (py - 50) / 1.5;
    const pxSpark = 50 + (px - 50) / 7;
    const pySpark = 50 + (py - 50) / 7;
    const opacity = (20 + Math.abs(pa) * 1.5) / 100;
    const ty = ((tp - 50) / 2) * -1;
    const tx = ((lp - 50) / 1.5) * 0.5;

    el.style.setProperty("--grad-x", `${lp}%`);
    el.style.setProperty("--grad-y", `${tp}%`);
    el.style.setProperty("--sprk-x", `${pxSpark}%`);
    el.style.setProperty("--sprk-y", `${pySpark}%`);
    el.style.setProperty("--foil-opacity", `${Math.min(1, opacity)}`);
    el.style.setProperty("--rx", `${ty}deg`);
    el.style.setProperty("--ry", `${tx}deg`);
    el.style.setProperty("--rz", "0deg");
  }, []);

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      clearTimeout(rearmRef.current);
      setIdle(false);
      setActive(true);
      track(e.clientX, e.clientY);
    },
    [track],
  );

  const onLeave = useCallback(() => {
    const el = ref.current;
    setActive(false);
    if (el) {
      // Drop the inline overrides so the CSS resting values apply again.
      for (const prop of ["--grad-x", "--grad-y", "--sprk-x", "--sprk-y", "--foil-opacity", "--rx", "--ry", "--rz"]) {
        el.style.removeProperty(prop);
      }
    }
    // The pen waits 2.5s before resuming its showcase loop.
    clearTimeout(rearmRef.current);
    rearmRef.current = setTimeout(() => setIdle(true), IDLE_REARM_MS);
  }, []);

  useEffect(() => () => clearTimeout(rearmRef.current), []);

  const vars: Record<string, string> = {
    "--color1": theme.color1,
    "--color2": theme.color2,
    "--front": `url("${card.avatarUrl}"), ${theme.bg}`,
    "--sparkles": `url("data:image/svg+xml,${SPARKLES}")`,
    "--holo-weave": HOLO_WEAVE,
  };
  if (theme.color3) {
    vars["--color3"] = theme.color3;
    vars["--color4"] = theme.color4!;
    vars["--color5"] = theme.color5!;
  }

  return (
    <div className="honour-scene" style={{ animationDelay: `${index * 170}ms` }}>
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        onPointerCancel={onLeave}
        className={[
          "honour-card",
          active ? "is-active" : "",
          idle && !active ? "is-idle" : "",
          card.rank === 1 ? "honour-card--rainbow" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={vars as React.CSSProperties}
      >
        <div className="honour-card__face">
          <div className="flex items-start justify-between gap-2">
            <span className="honour-card__rank">{theme.label}</span>
            <span className="honour-card__xp">{card.xp} XP</span>
          </div>

          <div>
            <div className="honour-card__name truncate">{card.fullName}</div>
            <div className="honour-card__mascot">{card.avatarName}</div>
          </div>
        </div>
      </div>

      {children && <div className="mt-2 w-[13rem]">{children}</div>}
    </div>
  );
}
