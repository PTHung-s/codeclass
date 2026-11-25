import type { CSSProperties } from "react";
import type { GachaReward } from "../../types/gacha";
import { rarityConfig } from "../../lib/gacha/rarityConfig";

export function PackSummary({ cards, onDone }: { cards: GachaReward[]; onDone: () => void }) {
  return (
    <section className="pack-summary">
      <span>ĐÃ THU THẬP VÀO TÀI KHOẢN</span>
      <h2>{cards.length} Phần Thưởng</h2>
      <div className={`summary-grid summary-size-${cards.length}`}>
        {cards.map((card, idx) => {
          const config = rarityConfig[card.rarity] || rarityConfig.common;
          const isSticker = card.rewardType === "sticker" && card.stickerUrl;
          return (
            <div
              key={card.uniqueId || `${card.id}-${idx}`}
              style={{ "--summary-color": config.color } as CSSProperties}
            >
              {isSticker ? (
                <img src={card.stickerUrl!} alt={card.name} className="w-10 h-10 object-contain drop-shadow-lg" />
              ) : (
                <i>{card.icon}</i>
              )}
              <b>{card.name}</b>
              <small>{config.label}</small>
            </div>
          );
        })}
      </div>
      <button onClick={onDone}>Tiếp tục mở</button>
    </section>
  );
}
