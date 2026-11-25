import { useState, useCallback, useRef, useEffect } from "react";
import { CheckCircle2, XCircle, RotateCcw } from "lucide-react";

interface Pair {
  id: number;
  left: { emoji: string; label: string };
  right: { text: string };
}

interface Props {
  pairs: Pair[];
  title?: string;
  description?: string;
}

const COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#8b5cf5", "#ef4444", "#06b6d4"];

export default function MatchPairs({ pairs, title, description }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dotPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const check = () => setDarkMode(document.documentElement.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const [rightOrder] = useState<number[]>(() => {
    const indices = pairs.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  });

  const [matches, setMatches] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);
  const [dragging, setDragging] = useState<{
    from: number;
    fromSide: "left" | "right";
    mx: number;
    my: number;
  } | null>(null);
  const [, forceRender] = useState(0);

  // Measure all dot positions after render — stable, no infinite loop
  const measureDots = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const dots = containerRef.current.querySelectorAll("[data-dot]");
    const positions: Record<string, { x: number; y: number }> = {};
    dots.forEach((el) => {
      const key = el.getAttribute("data-dot")!;
      const rect = el.getBoundingClientRect();
      positions[key] = {
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top + rect.height / 2 - containerRect.top,
      };
    });
    dotPositionsRef.current = positions;
  }, []);

  // Measure after initial render and when pairs change
  useEffect(() => {
    measureDots();
  }, [measureDots]);

  // Re-measure on resize
  useEffect(() => {
    const handler = () => {
      measureDots();
      forceRender((n) => n + 1);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [measureDots]);

  const handleDotMouseDown = useCallback(
    (e: React.MouseEvent, id: number, side: "left" | "right") => {
      e.stopPropagation();
      e.preventDefault();
      if (checked) return;

      if (side === "left" && matches[id] !== undefined) {
        setMatches((prev) => {
          const n = { ...prev };
          delete n[id];
          return n;
        });
        return;
      }
      if (side === "right") {
        const leftId = Object.entries(matches).find(([, r]) => r === id)?.[0];
        if (leftId !== undefined) {
          setMatches((prev) => {
            const n = { ...prev };
            delete n[Number(leftId)];
            return n;
          });
          return;
        }
      }

      setDragging({ from: id, fromSide: side, mx: e.clientX, my: e.clientY });
    },
    [checked, matches]
  );

  // Mouse drag
  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => {
      setDragging((prev) =>
        prev ? { ...prev, mx: e.clientX, my: e.clientY } : null
      );
    };

    const handleUp = (e: MouseEvent) => {
      const targetSide = dragging.fromSide === "left" ? "right" : "left";
      const targetDot = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest(`[data-dot][data-side="${targetSide}"]`);

      if (targetDot) {
        const targetId = Number(targetDot.getAttribute("data-dot")!.split("-")[1]);

        setMatches((prev) => {
          const next = { ...prev };
          if (dragging.fromSide === "left") {
            for (const [l, r] of Object.entries(next)) {
              if (r === targetId) delete next[Number(l)];
            }
            next[dragging.from] = targetId;
          } else {
            delete next[targetId];
            for (const [l, r] of Object.entries(next)) {
              if (r === dragging.from) delete next[Number(l)];
            }
            next[targetId] = dragging.from;
          }
          return next;
        });
      }
      setDragging(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging]);

  // Touch drag
  const handleDotTouchStart = useCallback(
    (e: React.TouchEvent, id: number, side: "left" | "right") => {
      e.stopPropagation();
      if (checked) return;

      if (side === "left" && matches[id] !== undefined) {
        setMatches((prev) => {
          const n = { ...prev };
          delete n[id];
          return n;
        });
        return;
      }
      if (side === "right") {
        const leftId = Object.entries(matches).find(([, r]) => r === id)?.[0];
        if (leftId !== undefined) {
          setMatches((prev) => {
            const n = { ...prev };
            delete n[Number(leftId)];
            return n;
          });
          return;
        }
      }

      const touch = e.touches[0];
      setDragging({ from: id, fromSide: side, mx: touch.clientX, my: touch.clientY });
    },
    [checked, matches]
  );

  useEffect(() => {
    if (!dragging) return;

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      setDragging((prev) =>
        prev ? { ...prev, mx: touch.clientX, my: touch.clientY } : null
      );
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      const targetSide = dragging.fromSide === "left" ? "right" : "left";
      const targetDot = document
        .elementFromPoint(touch.clientX, touch.clientY)
        ?.closest(`[data-dot][data-side="${targetSide}"]`);

      if (targetDot) {
        const targetId = Number(targetDot.getAttribute("data-dot")!.split("-")[1]);

        setMatches((prev) => {
          const next = { ...prev };
          if (dragging.fromSide === "left") {
            for (const [l, r] of Object.entries(next)) {
              if (r === targetId) delete next[Number(l)];
            }
            next[dragging.from] = targetId;
          } else {
            delete next[targetId];
            for (const [l, r] of Object.entries(next)) {
              if (r === dragging.from) delete next[Number(l)];
            }
            next[targetId] = dragging.from;
          }
          return next;
        });
      }
      setDragging(null);
    };

    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [dragging]);

  const check = useCallback(() => setChecked(true), []);
  const reset = useCallback(() => {
    setMatches({});
    setChecked(false);
    setDragging(null);
  }, []);

  const correctCount = pairs.filter((p) => matches[p.id] === p.id).length;
  const allCorrect = correctCount === pairs.length;
  const allMatched = Object.keys(matches).length === pairs.length;

  const getContainerPos = () => {
    if (!containerRef.current || !dragging) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return { x: dragging.mx - rect.left, y: dragging.my - rect.top };
  };

  const dotPositions = dotPositionsRef.current;

  return (
    <div style={{ margin: "1.5rem 0" }}>
      {title && <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem", fontWeight: 700 }}>{title}</h3>}
      {description && <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: darkMode ? "#94a3b8" : "#64748b" }}>{description}</p>}

      <div ref={containerRef} style={{ display: "flex", gap: "1.5rem", position: "relative", alignItems: "flex-start" }}>
        {/* SVG overlay */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 10, overflow: "visible" }}>
          {Object.entries(matches).map(([leftId, rightId]) => {
            const fromDot = dotPositions[`left-${leftId}`];
            const toDot = dotPositions[`right-${rightId}`];
            if (!fromDot || !toDot) return null;
            const isCorrect = checked && Number(leftId) === rightId;
            const color = COLORS[Number(leftId) % COLORS.length];
            return (
              <line
                key={`line-${leftId}`}
                x1={fromDot.x} y1={fromDot.y} x2={toDot.x} y2={toDot.y}
                stroke={checked ? (isCorrect ? "#16a34a" : "#dc2626") : color}
                strokeWidth={checked ? 3 : 2.5}
                strokeLinecap="round"
                opacity={checked && !isCorrect ? 0.5 : 0.85}
              />
            );
          })}
          {dragging && (() => {
            const fromDot = dotPositions[`${dragging.fromSide}-${dragging.from}`];
            const toPos = getContainerPos();
            if (!fromDot) return null;
            return (
              <line x1={fromDot.x} y1={fromDot.y} x2={toPos.x} y2={toPos.y}
                stroke="#0066cc" strokeWidth={2} strokeDasharray="6,3"
                strokeLinecap="round" opacity={0.7}
              />
            );
          })()}
        </svg>

        {/* Left column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: darkMode ? "#94a3b8" : "#64748b", textAlign: "center", marginBottom: "0.25rem" }}>
            🍳 Các bước nấu ăn
          </div>
          {pairs.map((pair) => {
            const isMatched = matches[pair.id] !== undefined;
            const isCorrect = checked && matches[pair.id] === pair.id;
            const isWrong = checked && matches[pair.id] !== undefined && matches[pair.id] !== pair.id;
            const isDraggingFrom = dragging?.from === pair.id && dragging?.fromSide === "left";

            return (
              <div key={`left-${pair.id}`}
                style={{
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  padding: "0.6rem 0.75rem",
                  border: isDraggingFrom ? "2px solid #0066cc" : isCorrect ? "2px solid #86efac" : isWrong ? "2px solid #fca5a5" : "2px solid #e2e8f0",
                  borderRadius: "0.75rem",
                  background: isDraggingFrom ? "#eef2ff" : isCorrect ? "#f0fdf4" : isWrong ? "#fef2f2" : darkMode ? "#1f2937" : "white",
                  transition: "border 0.2s, background 0.2s",
                }}
              >
                <span style={{ fontSize: "1.3rem" }}>{pair.left.emoji}</span>
                <span style={{ flex: 1, fontSize: "0.9rem", color: darkMode ? "#e2e8f0" : undefined }}>{pair.left.label}</span>
                <span data-dot={`left-${pair.id}`} data-side="left"
                  onMouseDown={e => handleDotMouseDown(e, pair.id, "left")}
                  onTouchStart={e => handleDotTouchStart(e, pair.id, "left")}
                  style={{
                    width: "16px", height: "16px", borderRadius: "50%",
                    background: isDraggingFrom ? "#0066cc" : isMatched ? COLORS[pair.id % COLORS.length] : "#d4d4d8",
                    border: `2px solid ${isDraggingFrom ? "#0066cc" : isMatched ? COLORS[pair.id % COLORS.length] : "#a3a3a3"}`,
                    cursor: checked ? "default" : "grab", flexShrink: 0,
                    transition: "transform 0.15s, background 0.2s",
                    transform: isDraggingFrom ? "scale(1.3)" : "scale(1)",
                  }}
                />
                {checked && isCorrect && <CheckCircle2 size={16} style={{ color: "#16a34a", flexShrink: 0 }} />}
                {checked && isWrong && <XCircle size={16} style={{ color: "#dc2626", flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>

        {/* Right column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: darkMode ? "#94a3b8" : "#64748b", textAlign: "center", marginBottom: "0.25rem" }}>
            💻 Code Python
          </div>
          {rightOrder.map((rightIdx) => {
            const pair = pairs[rightIdx];
            const isMatched = Object.values(matches).includes(rightIdx);
            const matchedLeftId = Object.entries(matches).find(([, r]) => r === rightIdx)?.[0];
            const matchedLeft = matchedLeftId !== undefined ? Number(matchedLeftId) : undefined;
            const isCorrect = checked && matchedLeft === rightIdx;
            const isWrong = checked && matchedLeft !== undefined && matchedLeft !== rightIdx;
            const matchedPair = matchedLeft !== undefined ? pairs[matchedLeft] : undefined;
            const isDraggingTarget = dragging?.fromSide === "left" && !isMatched;
            const isDraggingFrom = dragging?.from === rightIdx && dragging?.fromSide === "right";

            return (
              <div key={`right-${rightIdx}`}
                style={{
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  padding: "0.6rem 0.75rem",
                  border: isDraggingTarget ? "2px dashed #0066cc" : isDraggingFrom ? "2px solid #0066cc" : isCorrect ? "2px solid #86efac" : isWrong ? "2px solid #fca5a5" : "2px solid #e2e8f0",
                  borderRadius: "0.75rem",
                  background: isDraggingTarget || isDraggingFrom ? "#eef2ff" : isCorrect ? "#f0fdf4" : isWrong ? "#fef2f2" : "#1e293b",
                  transition: "border 0.2s, background 0.2s",
                }}
              >
                <span data-dot={`right-${rightIdx}`} data-side="right"
                  onMouseDown={e => handleDotMouseDown(e, rightIdx, "right")}
                  onTouchStart={e => handleDotTouchStart(e, rightIdx, "right")}
                  style={{
                    width: "16px", height: "16px", borderRadius: "50%",
                    background: isDraggingTarget || isDraggingFrom ? "#0066cc" : isMatched ? COLORS[matchedLeft! % COLORS.length] : "#475569",
                    border: `2px solid ${isDraggingTarget || isDraggingFrom ? "#0066cc" : isMatched ? COLORS[matchedLeft! % COLORS.length] : "#64748b"}`,
                    cursor: checked ? "default" : "grab", flexShrink: 0,
                    transition: "transform 0.15s, background 0.2s",
                    transform: (isDraggingTarget || isDraggingFrom) ? "scale(1.3)" : "scale(1)",
                  }}
                />
                <code style={{ color: isMatched ? COLORS[matchedLeft! % COLORS.length] : "#e2e8f0", fontFamily: "monospace", fontSize: "0.85rem", flex: 1 }}>
                  {pair.right.text}
                </code>
                {isMatched && !checked && matchedPair && (
                  <span style={{ fontSize: "0.75rem", color: COLORS[matchedLeft! % COLORS.length], fontWeight: 600, flexShrink: 0 }}>
                    {matchedPair.left.emoji}
                  </span>
                )}
                {checked && isCorrect && <CheckCircle2 size={16} style={{ color: "#16a34a", flexShrink: 0 }} />}
                {checked && isWrong && <XCircle size={16} style={{ color: "#dc2626", flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
        {!checked ? (
          <button onClick={check} disabled={!allMatched}
            style={{
              padding: "0.6rem 2rem", border: "none", borderRadius: "0.5rem", fontWeight: 600,
              cursor: allMatched ? "pointer" : "default", fontSize: "0.95rem",
              background: allMatched ? "#0066cc" : "#d4d4d8", color: "white",
            }}
          >
            {allMatched ? "Kiểm tra" : `Đã nối ${Object.keys(matches).length}/${pairs.length} — kéo hết các dây nhé!`}
          </button>
        ) : (
          <>
            <div style={{
              padding: "0.5rem 1.5rem", borderRadius: "0.5rem", fontWeight: 600, fontSize: "0.95rem",
              background: allCorrect ? "#f0fdf4" : "#fef2f2",
              color: allCorrect ? "#16a34a" : "#dc2626",
              border: allCorrect ? "2px solid #86efac" : "2px solid #fca5a5",
            }}>
              {allCorrect ? "🎉 Chính xác! Bạn đã nối đúng tất cả!" : `Đúng ${correctCount}/${pairs.length} — thử lại nhé!`}
            </div>
            {!allCorrect && (
              <button onClick={reset} style={{
                padding: "0.6rem 1.5rem", background: "#1e293b", color: "white", border: "none",
                borderRadius: "0.5rem", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem",
                display: "flex", alignItems: "center", gap: "0.4rem",
              }}>
                <RotateCcw size={16} /> Làm lại
              </button>
            )}
          </>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: "0.5rem", fontSize: "0.8rem", color: darkMode ? "#64748b" : "#94a3b8" }}>
        🖱️ Kéo từ chấm tròn bên trái sang chấm tròn bên phải để nối — nhấn vào dây đã nối để gỡ
      </div>
    </div>
  );
}
