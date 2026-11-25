import { useRef, type PointerEvent } from "react";
import type { GachaReward } from "../../types/gacha";
import { RewardCard } from "./RewardCard";
import { ScratchSeal, type ScratchSealHandle } from "./ScratchSeal";

export function CardGrid({
  cards,
  revealed,
  onReveal,
  onRevealAll,
  onCollect,
}: {
  cards: GachaReward[];
  revealed: number[];
  onReveal: (index: number) => void;
  onRevealAll: () => void;
  onCollect: () => void;
}) {
  const complete = cards.length > 0 && revealed.length === cards.length;
  const sealRefs = useRef<Array<ScratchSealHandle | null>>([]);
  const dragging = useRef(false);
  const previous = useRef<{ x: number; y: number } | null>(null);

  const scratchAllAt = (x: number, y: number) => {
    sealRefs.current.forEach((seal) => seal?.scratchAt(x, y));
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const from = previous.current ?? { x: event.clientX, y: event.clientY };
    const distance = Math.hypot(event.clientX - from.x, event.clientY - from.y);
    const steps = Math.max(1, Math.ceil(distance / 8));
    for (let step = 1; step <= steps; step += 1) {
      scratchAllAt(
        from.x + ((event.clientX - from.x) * step) / steps,
        from.y + ((event.clientY - from.y) * step) / steps
      );
    }
    previous.current = { x: event.clientX, y: event.clientY };
  };

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button.grid-reveal-all")) return;
    event.preventDefault();
    dragging.current = true;
    previous.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    scratchAllAt(event.clientX, event.clientY);
  };

  const stop = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    previous.current = null;
    sealRefs.current.forEach((seal) => seal?.endStroke());
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className={`card-grid-view grid-size-${cards.length} ${complete ? "grid-complete" : ""}`}>
      <div className="grid-toolbar">
        <div className="grid-count">
          Đã mở: <b>{revealed.length}</b> / {cards.length}
        </div>
        {!complete && cards.length > 1 && (
          <button className="grid-reveal-all" onClick={onRevealAll}>
            Mở nhanh tất cả ⚡
          </button>
        )}
      </div>

      <div
        className="card-grid"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        {cards.map((card, index) => {
          const isRevealed = revealed.includes(index);
          return (
            <RewardCard
              key={card.uniqueId || `${card.id}-${index}`}
              reward={card}
              compact
              revealed
              active={isRevealed}
              index={index}
            >
              {!isRevealed && (
                <ScratchSeal
                  ref={(seal) => {
                    sealRefs.current[index] = seal;
                  }}
                  onComplete={() => onReveal(index)}
                />
              )}
            </RewardCard>
          );
        })}
      </div>

      {complete && (
        <button className="primary-action grid-collect" onClick={onCollect}>
          Thu thập tất cả <span>→</span>
        </button>
      )}
    </div>
  );
}
