/**
 * MeetPlaybackPlugin — overlay phát lại quá trình code của học sinh.
 *
 * Dữ liệu từ journal server (code:history): chuỗi mốc {t, k:'snap'|'copy'|'paste', text, n}.
 * – snap: toàn bộ code tại thời điểm đó (merge dồn nên thưa)
 * – copy/paste: mốc đánh dấu (highlight xanh/đỏ trên timeline)
 *
 * Tương tác: play/pause, tua (scrub), tốc độ 1×–240×, nhảy tới mốc.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Play, Pause } from 'lucide-react';
import { toast } from '../store/useUiStore';

interface CodeEvent {
  t: number;
  k: 'snap' | 'copy' | 'paste';
  text?: string;
  n?: number;
}

export interface PlaybackData {
  name: string;
  code: string;
  log: CodeEvent[];
  language?: { name?: string } | null;
  startedAt?: number;
}

const SPEEDS = [1, 2, 5, 10, 30, 60, 120, 240];

const fmtClock = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const MeetPlaybackPlugin: React.FC = () => {
  const [data, setData] = useState<PlaybackData | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [pos, setPos] = useState(0); // vị trí 0..1 trên timeline
  const posRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);

  const setTimelinePos = useCallback((next: number) => {
    const clamped = Math.min(1, Math.max(0, next));
    posRef.current = clamped;
    setPos(clamped);
  }, []);

  // Nhận dữ liệu từ nút ▶ trong danh sách thành viên
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (!detail.log || !detail.log.length) {
        toast.info('Chưa có nhật ký code cho học sinh này (journal ghi từ bây giờ).');
        return;
      }
      const log = [...detail.log].sort((a: CodeEvent, b: CodeEvent) => a.t - b.t);
      setData({ name: detail.name || 'Học sinh', code: detail.code || '', log, startedAt: detail.startedAt });
      setTimelinePos(0);
      setPlaying(true);
    };
    window.addEventListener('meet:playback', onOpen);
    return () => window.removeEventListener('meet:playback', onOpen);
  }, [setTimelinePos]);

  const t0 = data ? data.log[0].t : 0;
  const tEnd = data ? Math.max(data.log[data.log.length - 1].t, t0 + 1000) : 0;
  const duration = data ? tEnd - t0 : 0;

  /** Code hiển thị tại thời điểm pos: mốc snap gần nhất <= thời điểm */
  const codeAt = useCallback((p: number): string => {
    if (!data) return '';
    const now = t0 + p * duration;
    let last = '';
    for (const e of data.log) {
      if (e.t > now) break;
      if (e.k === 'snap' && typeof e.text === 'string') last = e.text;
    }
    return last;
  }, [data, t0, duration]);

  // Vòng lặp phát (không gọi setState trong updater của setState khác)
  useEffect(() => {
    if (!playing || !data || duration <= 0) return;
    lastTsRef.current = performance.now();
    const tick = (ts: number) => {
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      const np = posRef.current + (dt * speed) / duration;
      if (np >= 1) {
        setTimelinePos(1);
        setPlaying(false);
        return;
      }
      setTimelinePos(np);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, speed, duration, data, setTimelinePos]);

  if (!data) return null;

  const marks = data.log.filter((e) => e.k !== 'snap');
  const curCode = codeAt(pos);
  const activeMarks = marks.filter((m) => (m.t - t0) / duration <= pos).length;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="flex h-full max-h-[92vh] w-full max-w-4xl flex-col rounded-panel border border-line bg-overlay shadow-2xl">
        {/* Header */}
        <div className="flex flex-none items-center justify-between border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate font-bold text-white">Playback code — {data.name}</h3>
            <p className="text-[11px] text-muted">
              {data.log.length} mốc · {marks.length} lần copy/dán ({activeMarks} đã phát qua) · thời lượng {fmtClock(duration)} thực
            </p>
          </div>
          <button onClick={() => { setData(null); setPlaying(false); }} className="text-muted hover:text-white" title="Đóng">
            <X size={20} />
          </button>
        </div>

        {/* Code snapshot */}
        <div className="min-h-0 flex-1 overflow-auto bg-[#0d1117] p-4 custom-scrollbar">
          <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-white/90">
            {curCode || '(trống)'}
          </pre>
        </div>

        {/* Timeline */}
        <div className="flex-none border-t border-line px-4 py-3">
          <div className="relative mb-2 h-8">
            {/* thanh nền */}
            <div className="absolute left-0 right-0 top-3 h-1.5 rounded-full bg-line" />
            {/* thanh đã phát */}
            <div className="absolute left-0 top-3 h-1.5 rounded-full bg-accent" style={{ width: `${pos * 100}%` }} />
            {/* mốc copy xanh / paste đỏ */}
            {marks.map((m, i) => {
              const left = ((m.t - t0) / duration) * 100;
              return (
                <button
                  key={i}
                  onClick={() => setTimelinePos(left / 100)}
                  title={`${m.k === 'copy' ? 'Copy' : 'Dán'} ×${m.n || 1} tại ${fmtClock(m.t - t0)}${m.text ? `: ${m.text.slice(0, 60)}` : ''}`}
                  className="absolute top-0.5 -translate-x-1/2 rounded-full transition-transform hover:scale-125"
                  style={{ left: `${left}%`, width: 10, height: 10, background: m.k === 'copy' ? '#448AFF' : '#FF5252' }}
                />
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => { if (pos >= 1) setTimelinePos(0); setPlaying((v) => !v); }}
              className="grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-ink"
              title={playing ? 'Tạm dừng' : 'Phát'}
            >
              {playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(pos * 1000)}
              onChange={(e) => { setPlaying(false); setTimelinePos(Number(e.target.value) / 1000); }}
              className="h-1.5 flex-1 min-w-[180px] cursor-pointer appearance-none rounded-full bg-line accent-[var(--color-accent)]"
            />
            <span className="font-mono text-xs text-muted">
              {fmtClock(pos * duration)} / {fmtClock(duration)}
            </span>
            <div className="flex items-center gap-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${speed === s ? 'bg-accent text-accent-ink' : 'bg-elevated text-muted hover:text-white'}`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeetPlaybackPlugin;
