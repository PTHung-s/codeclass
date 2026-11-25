import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { rarityConfig } from "../../lib/gacha/rarityConfig";
import type { GachaReward } from "../../types/gacha";
import { PuzzlePieceDisplay } from "./PuzzlePieceDisplay";

export function RewardCard({
  reward,
  compact = false,
  revealed = true,
  active = false,
  index = 0,
  onSelect,
  children,
}: {
  reward: GachaReward;
  compact?: boolean;
  revealed?: boolean;
  active?: boolean;
  index?: number;
  onSelect?: () => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const config = rarityConfig[reward.rarity] || rarityConfig.common;
  const isPuzzle = reward.rewardType === "puzzle_piece" && reward.puzzleImageUrl && reward.pieceIndex !== undefined;
  const isSticker = reward.rewardType === "sticker" && reward.stickerUrl;

  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const card = ref.current;
    if (!card) return;
    const box = card.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
    const y = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height));
    card.style.setProperty("--pointer-x", `${x * 100}%`);
    card.style.setProperty("--pointer-y", `${y * 100}%`);
    card.style.setProperty("--rotate-x", `${(0.5 - y) * 17}deg`);
    card.style.setProperty("--rotate-y", `${(x - 0.5) * 20}deg`);
  };

  const resetTilt = () => {
    const card = ref.current;
    if (!card) return;
    card.style.setProperty("--rotate-x", "0deg");
    card.style.setProperty("--rotate-y", "0deg");
    card.style.setProperty("--pointer-x", "50%");
    card.style.setProperty("--pointer-y", "50%");
  };

  return (
    <button
      ref={ref}
      type="button"
      className={`reward-playing-card rarity-${reward.rarity} ${compact ? "card-compact" : ""} ${
        revealed ? "card-revealed" : "card-facedown"
      } ${active ? "card-active" : ""}`}
      style={
        {
          "--card-color": config.color,
          "--card-color-2": config.color2,
          "--card-index": index,
        } as CSSProperties
      }
      onPointerMove={move}
      onPointerLeave={resetTilt}
      onClick={onSelect}
      aria-label={revealed ? `${reward.name}, ${config.label}` : `Thẻ phần thưởng số ${index + 1}, chưa mở`}
    >
      <span className="card-depth" />
      <span className="card-back">
        <i>✦</i>
        <b>CODECLASS</b>
        <em>REWARD</em>
      </span>
      <span className="card-front">
        <span className="holo-layer holo-gradient" />
        <span className="holo-layer holo-sparkles" />
        <span className="card-number">0{index + 1} / REWARD</span>

        {/* Art Area: Nếu là Mảnh Puzzle thì render Mảnh Ghép Bo Cong SVG xịn */}
        {isPuzzle ? (
          <div className="card-art-puzzle">
            <PuzzlePieceDisplay
              imageUrl={reward.puzzleImageUrl!}
              pieceIndex={reward.pieceIndex!}
              size={compact ? 90 : 130}
            />
          </div>
        ) : isSticker ? (
          <div className="card-art card-art-sticker">
            <img src={reward.stickerUrl!} alt={reward.name} className="max-w-[80%] max-h-[80%] object-contain drop-shadow-lg" />
          </div>
        ) : (
          <span className="card-art">
            <i>{reward.icon}</i>
            <span />
          </span>
        )}

        <span className="card-rarity">{config.label}</span>
        <strong>{reward.name}</strong>
        <small>{reward.description}</small>
        {reward.gemsEarned && reward.gemsEarned > 0 && (
          <span className="card-gem-badge">💎 +{reward.gemsEarned}</span>
        )}
        <span className="card-footer">
          <b>STUDY VAULT</b>
          <em>{isPuzzle ? "MẢNH GHÉP 1/4" : reward.amount > 1 ? `+${reward.amount}` : "VẬT PHẨM"}</em>
        </span>
      </span>
      {children}
    </button>
  );
}
