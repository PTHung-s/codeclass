import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, GripVertical } from "lucide-react";
import { useOverlayEnabled, useServerMetrics } from "../../hooks/useServerMetrics";

const POS_KEY = "codeclass_perf_overlay_pos";

function loadPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p?.x === "number" && typeof p?.y === "number") return p;
    }
  } catch {
    /* fall through to default */
  }
  return { x: 16, y: 80 };
}

function tone(value: number, warn: number, bad: number): string {
  if (value >= bad) return "text-red-400";
  if (value >= warn) return "text-amber-400";
  return "text-emerald-400";
}

/**
 * FPS-counter style overlay for staff: a small always-on-top readout of server
 * health, so a teacher mid-lesson can tell "the server is struggling" apart
 * from "my own laptop/wifi is slow".
 *
 * Off by default and remembered per browser. Click the numbers to open the full
 * page; drag the handle to move it out of the way.
 */
export default function PerfOverlay() {
  const [enabled, setEnabled] = useOverlayEnabled();
  const { metrics, error } = useServerMetrics(enabled);
  const navigate = useNavigate();
  const [pos, setPos] = useState(loadPos);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [pos.x, pos.y]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    // Keep it on screen even after a window resize.
    const x = Math.max(0, Math.min(window.innerWidth - 150, e.clientX - d.dx));
    const y = Math.max(0, Math.min(window.innerHeight - 110, e.clientY - d.dy));
    setPos({ x, y });
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      /* storage full or blocked — position just won't persist */
    }
  }, [pos]);

  // Clamp back into view if the window shrank since the position was saved.
  useEffect(() => {
    const onResize = () => {
      setPos((p) => ({
        x: Math.max(0, Math.min(window.innerWidth - 150, p.x)),
        y: Math.max(0, Math.min(window.innerHeight - 110, p.y)),
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!enabled) return null;

  const cpu = metrics?.cpu.processPct ?? 0;
  const rss = metrics?.memory.rssMb ?? 0;
  const req = metrics?.requests.perSec ?? 0;
  const ws = metrics?.websocket.activeConnections ?? 0;
  const queue = metrics?.queue.waiting ?? 0;
  const dbTimeout = metrics?.dbErrors?.timeout ?? 0;

  return (
    <div
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[9998] w-[150px] select-none rounded-lg border border-white/10 bg-gray-950/90 font-mono text-[11px] leading-tight text-gray-300 shadow-xl backdrop-blur"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-1.5 py-1">
        <span
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="flex cursor-move items-center gap-1 text-gray-500 hover:text-gray-300"
          title="Kéo để di chuyển"
        >
          <GripVertical className="h-3 w-3" />
          <span className="text-[9px] font-bold tracking-wider">SERVER</span>
        </span>
        <button
          onClick={() => setEnabled(false)}
          className="rounded p-0.5 text-gray-500 hover:bg-white/10 hover:text-white"
          title="Tắt overlay"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <button
        onClick={() => navigate("/admin/server")}
        className="block w-full space-y-0.5 px-2 py-1.5 text-left hover:bg-white/5"
        title="Bấm để mở trang chi tiết"
      >
        {error ? (
          <span className="text-[10px] text-red-400">mất kết nối</span>
        ) : !metrics ? (
          <span className="text-[10px] text-gray-500">đang đo…</span>
        ) : (
          <>
            <Row label="CPU" value={`${cpu}%`} cls={tone(cpu, 50, 80)} />
            <Row label="RAM" value={`${rss}MB`} cls={tone(rss, 1000, 1500)} />
            <Row label="REQ" value={`${req.toFixed(1)}/s`} cls={tone(req, 20, 40)} />
            <Row label="WS" value={String(ws)} cls="text-cyan-400" />
            {queue > 0 && <Row label="CHỜ" value={String(queue)} cls="text-amber-400" />}
            {dbTimeout > 0 && <Row label="DB" value={`${dbTimeout} lỗi`} cls="text-red-400" />}
          </>
        )}
      </button>
    </div>
  );
}

function Row({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className={`font-bold tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}
