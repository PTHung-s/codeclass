import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from "react";
import { playScratchSound } from "../../lib/soundEffects";

type Dust = { id: number; x: number; y: number; dx: number; dy: number };
export type ScratchSealHandle = { scratchAt: (clientX: number, clientY: number) => void; endStroke: () => void };

export const ScratchSeal = forwardRef<ScratchSealHandle, { onComplete: () => void }>(function ScratchSeal(
  { onComplete },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const completed = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const moves = useRef(0);
  const dustId = useRef(0);
  const [isComplete, setIsComplete] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dust, setDust] = useState<Dust[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 560;
    canvas.height = 784;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    // Lớp bạc ánh kim
    const metal = context.createLinearGradient(0, 0, 560, 784);
    metal.addColorStop(0, "#4f5662");
    metal.addColorStop(0.18, "#b8bec7");
    metal.addColorStop(0.38, "#686f7a");
    metal.addColorStop(0.58, "#d3d6dc");
    metal.addColorStop(0.78, "#747b86");
    metal.addColorStop(1, "#a8aeb7");

    context.fillStyle = metal;
    context.fillRect(0, 0, 560, 784);
    context.globalAlpha = 0.18;
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1;
    for (let offset = -784; offset < 560; offset += 18) {
      context.beginPath();
      context.moveTo(offset, 0);
      context.lineTo(offset + 784, 784);
      context.stroke();
    }
    context.globalAlpha = 0.11;
    context.fillStyle = "#121720";
    for (let y = 12; y < 784; y += 24) {
      for (let x = 12; x < 560; x += 24) {
        context.beginPath();
        context.arc(x + (y % 48 ? 4 : -4), y, 1.4, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.globalAlpha = 1;
    context.textAlign = "center";
    context.fillStyle = "rgba(13,17,24,.72)";
    context.font = "800 32px sans-serif";
    context.fillText("CÀO ĐỂ MỞ THẺ", 280, 382);
    context.fillStyle = "rgba(13,17,24,.44)";
    context.font = "600 16px sans-serif";
    context.fillText("SCRATCH TO REVEAL", 280, 414);
  }, []);

  const inspect = useCallback(
    (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let clear = 0;
      let sampled = 0;
      for (let index = 3; index < pixels.length; index += 80) {
        sampled += 1;
        if (pixels[index] < 35) clear += 1;
      }
      const amount = clear / sampled;
      setProgress(Math.min(1, amount / 0.5));
      if (amount >= 0.5 && !completed.current) {
        completed.current = true;
        setIsComplete(true);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(28);
        window.setTimeout(onComplete, 350);
      }
    },
    [onComplete]
  );

  const scratchAt = useCallback(
    (clientX: number, clientY: number) => {
      if (completed.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) {
        lastPoint.current = null;
        return;
      }
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      const point = {
        x: ((clientX - bounds.left) * canvas.width) / bounds.width,
        y: ((clientY - bounds.top) * canvas.height) / bounds.height,
      };
      const previous = lastPoint.current ?? point;
      context.globalCompositeOperation = "destination-out";
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 74;
      context.beginPath();
      context.moveTo(previous.x, previous.y);
      context.lineTo(point.x, point.y);
      context.stroke();
      lastPoint.current = point;
      moves.current += 1;

      if (moves.current % 4 === 0) {
        playScratchSound();
        const x = (point.x / canvas.width) * 100;
        const y = (point.y / canvas.height) * 100;
        const flakes = Array.from({ length: 2 }, (_, index) => ({
          id: dustId.current++,
          x,
          y,
          dx: (index ? 1 : -1) * 17 + Math.sin(moves.current) * 8,
          dy: 24 + index * 10,
        }));
        setDust((items) => [...items.slice(-23), ...flakes]);
      }
      if (moves.current % 8 === 0) inspect(context, canvas);
    },
    [inspect]
  );

  useImperativeHandle(ref, () => ({ scratchAt, endStroke: () => { lastPoint.current = null; } }), [scratchAt]);

  return (
    <span className={`scratch-seal ${isComplete ? "seal-complete" : ""}`}>
      <canvas ref={canvasRef} aria-label="Cào lớp seal để mở thẻ" />
      <span className="scratch-dust" aria-hidden="true">
        {dust.map((flake) => (
          <i
            key={flake.id}
            style={
              {
                left: `${flake.x}%`,
                top: `${flake.y}%`,
                "--dust-x": `${flake.dx}px`,
                "--dust-y": `${flake.dy}px`,
              } as CSSProperties
            }
          />
        ))}
      </span>
      <span className="scratch-progress">
        <i style={{ width: `${progress * 100}%` }} />
      </span>
    </span>
  );
});
