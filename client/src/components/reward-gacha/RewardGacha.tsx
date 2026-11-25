import type { CSSProperties } from "react";
import { useState } from "react";
import { Sparkles, Coins, Flame, Info, Layers, Gem } from "lucide-react";
import { useCardPack } from "../../hooks/useCardPack";
import { rarityConfig } from "../../lib/gacha/rarityConfig";
import { CardGrid } from "./CardGrid";
import { PackSummary } from "./PackSummary";
import { FoilPack } from "./FoilPack";
import { RewardsCatalogModal } from "./RewardsCatalogModal";
import { GemShopModal } from "./GemShopModal";
import "./reward-gacha.css";

export function RewardGacha() {
  const pack = useCardPack();
  const accent = rarityConfig[pack.bestRarity] || rarityConfig.common;
  const [showCatalog, setShowCatalog] = useState(false);
  const [showGemShop, setShowGemShop] = useState(false);

  return (
    <main
      className={`gacha-page pack-state-${pack.state} pack-rarity-${pack.bestRarity}`}
      style={
        {
          "--accent": accent.color,
          "--accent-2": accent.color2,
        } as CSSProperties
      }
    >
      <div className="page-grid" aria-hidden="true" />
      <div className="page-glow" aria-hidden="true" />

      {/* Floating Status Bar */}
      <header className="gacha-floating-bar">
        <div className="bar-tag">
          <Sparkles className="h-3.5 w-3.5 text-sky-400" />
          <span>BOOSTER PACK</span>
        </div>

        <div className="bar-stats">
          <div className="stat-pill">
            <Coins className="h-3.5 w-3.5 text-amber-400" />
            <span>{pack.tokenBalance.toLocaleString("vi-VN")}</span>
          </div>

          <div className="stat-pill">
            <Flame className="h-3.5 w-3.5 text-orange-400" />
            <span>
              Pity <b>{pack.pity}</b>/{pack.hardPity}
            </span>
          </div>

          <div className="stat-pill cursor-pointer" onClick={() => setShowGemShop(true)} title="Gem Shop">
            <Gem className="h-3.5 w-3.5 text-cyan-400" />
            <span>{pack.info?.gemBalance ?? 0}</span>
          </div>

          <details className="rate-details-compact">
            <summary title="Xem tỉ lệ rơi thẻ">
              <Info className="h-3.5 w-3.5" />
            </summary>
            <div className="rate-popover">
              <div className="rate-popover-title">Tỉ lệ rơi thẻ</div>
              <p><i className="dot-common" /> Common <b>60%</b></p>
              <p><i className="dot-rare" /> Rare <b>25%</b></p>
              <p><i className="dot-epic" /> Epic <b>10%</b></p>
              <p><i className="dot-legendary" /> Legendary <b>4%</b></p>
              <p><i className="dot-mythic" /> Mythic <b>1%</b></p>
              <small>Bảo hiểm: Chắc chắn Legendary+ sau {pack.hardPity} lượt mở</small>
            </div>
          </details>
        </div>
      </header>

      {/* Stage chính - Gói thẻ Foil Pack */}
      <section className="pack-stage">
        {pack.state === "idle" && (
          <div className="idle-view">
            {/* Foil Pack Hero */}
            <div className="pack-hero-wrapper">
              <FoilPack opening={false} />
            </div>

            {/* Nút bấm tinh gọn, thanh lịch, chuyên nghiệp */}
            <div className="open-actions-compact">
              <button
                className="btn-pill-x1"
                disabled={pack.loading}
                onClick={() => pack.openPack(1)}
              >
                <span>Mở x1</span>
                <span className="pill-cost">
                  <Coins className="h-3 w-3" /> {pack.costs.x1}
                </span>
              </button>

              <button
                className="btn-pill-x10"
                disabled={pack.loading}
                onClick={() => pack.openPack(10)}
              >
                <span>Mở x10</span>
                <span className="pill-cost">
                  <Coins className="h-3 w-3" /> {pack.costs.x10}
                </span>
                <span className="pill-badge">-10%</span>
              </button>
            </div>

            {/* Xem tất cả quà */}
            <button
              className="btn-catalog"
              onClick={() => setShowCatalog(true)}
              disabled={pack.state !== "idle"}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Xem tất cả quà</span>
            </button>
          </div>
        )}

        {pack.state === "opening" && (
          <div className="opening-view">
            <FoilPack opening count={pack.packSize} />
            <span className="opening-pulse-text">
              {pack.packSize === 10 ? "ĐANG KHUI 10 THẺ..." : "ĐANG KHUI GÓI THẺ..."}
            </span>
          </div>
        )}

        {pack.state === "cards" && (
          <CardGrid
            cards={pack.cards}
            revealed={pack.revealed}
            onReveal={pack.revealCard}
            onRevealAll={pack.revealAll}
            onCollect={pack.collect}
          />
        )}

        {pack.state === "summary" && <PackSummary cards={pack.cards} onDone={pack.reset} />}
      </section>

      {/* Modal xem toàn bộ quà */}
      <RewardsCatalogModal
        open={showCatalog}
        onClose={() => setShowCatalog(false)}
        pool={pack.info?.rewardsPool}
      />

      {/* Modal Gem Shop */}
      <GemShopModal
        open={showGemShop}
        onClose={() => setShowGemShop(false)}
        onPurchase={pack.loadInfo}
      />
    </main>
  );
}
