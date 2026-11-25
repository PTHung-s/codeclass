import { useState, type CSSProperties, type PointerEvent } from "react";

export function FoilPack({ opening, count = 1 }: { opening: boolean; count?: number }) {
  const [tilt, setTilt] = useState({ rotX: 0, rotY: 0, gx: 50, gy: 50 });

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (opening) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({
      rotX: -y * 18,
      rotY: x * 18,
      gx: (x + 0.5) * 100,
      gy: (y + 0.5) * 100,
    });
  };

  const handlePointerLeave = () => {
    setTilt({ rotX: 0, rotY: 0, gx: 50, gy: 50 });
  };

  return (
    <div
      className={`foil-pack-stage ${opening ? "is-opening" : ""}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      aria-hidden="true"
    >
      <div
        className="foil-pack-container"
        style={
          {
            "--rot-x": `${tilt.rotX}deg`,
            "--rot-y": `${tilt.rotY}deg`,
            "--glare-x": `${tilt.gx}%`,
            "--glare-y": `${tilt.gy}%`,
          } as CSSProperties
        }
      >
        {/* NẮP TRÊN (Sẽ bị chém đứt ngang và trượt nhẹ lên trên tan biến) */}
        <div className="pack-top-slice">
          <div className="pack-crimp pack-crimp-top" />
          <div className="pack-top-sheen" />
          <div className="pack-top-brand">
            <span>CODECLASS CYPHER</span>
          </div>
        </div>

        {/* ĐƯỜNG RÃNH CẮT LASER & TIA LỬA */}
        <div className="pack-laser-seam">
          <div className="anticipation-glow" />
          <div className="laser-beam" />
          <div className="spark-field">
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i} style={{ "--spark-i": i } as CSSProperties} />
            ))}
          </div>
        </div>

        {/* THÂN DƯỚI GÓI THẺ */}
        <div className="pack-main-body">
          <div className="glowing-rim" />
          <div className="pack-foil-hologram" />

          <div className="pack-front-art">
            <div className="pack-logo-badge">
              <span>✦</span>
            </div>
            <h3 className="pack-series-title">GENESIS SERIES</h3>
            <span className="pack-series-tag">
              {count === 10 ? "10 CARDS • FOIL SPECIAL" : "1 CARD • ULTRA RARE FOIL"}
            </span>
          </div>

          <div className="pack-bottom-section">
            <div className="pack-meta-row">
              <span>VER 2.4</span>
              <span>1ST EDITION</span>
            </div>
            <div className="pack-crimp pack-crimp-bottom" />
          </div>
        </div>

        {/* LÕI THẺ TRƯỢT VỌT LÊN KHỎI MIỆNG GÓI */}
        <div className="pack-card-core">
          {Array.from({ length: Math.min(count, 5) }, (_, index) => (
            <i key={index} style={{ "--card-i": index } as CSSProperties} />
          ))}
        </div>
      </div>
    </div>
  );
}
