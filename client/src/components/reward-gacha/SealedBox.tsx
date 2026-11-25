import type { CSSProperties } from "react";

export function SealedBox({ opening, count = 1 }: { opening: boolean; count?: number }) {
  return (
    <div className={`sealed-box-scene ${opening ? "is-opening" : ""}`} aria-hidden="true">
      <div className="box-ambient-halo" />
      <div className="box-light" />
      <div className="sealed-box">
        <div className="box-lid">
          <span className="lid-rune">✦ ✦ ✦</span>
          <i />
        </div>
        <div className="box-body">
          <div className="box-gem">
            <span>✦</span>
          </div>
          <b>CODECLASS</b>
          <small>{count === 10 ? "10 REWARDS" : "MYSTERY"}</small>
        </div>
        <div className="box-seam" />
        <div className="box-card-stack">
          {Array.from({ length: Math.min(count, 5) }, (_, index) => (
            <i key={index} style={{ "--stack-index": index } as CSSProperties} />
          ))}
        </div>
      </div>
    </div>
  );
}
