/**
 * soundCue — âm thanh phản hồi tinh tế tổng hợp bằng Web Audio API (0 asset ngoài).
 *
 * Hoạt động tốt cả trên mạng LAN/firewall, không rò rỉ bộ nhớ (tái sử dụng 1 AudioContext),
 * tôn trọng tùy chọn tắt âm lưu trong localStorage (`meet:soundCues`).
 */
export type SoundCueKind =
  | 'chat'
  | 'hand'
  | 'help'
  | 'solo'
  | 'runOk'
  | 'runErr'
  | 'reaction'
  | 'quiz';

const LS_KEY = 'meet:soundCues';

let audioCtx: AudioContext | null = null;
const lastPlayedAt: Partial<Record<SoundCueKind, number>> = {};

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(LS_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(LS_KEY, enabled ? '1' : '0');
  } catch {
    /* noop */
  }
  window.dispatchEvent(new CustomEvent('meet:soundPrefChanged', { detail: enabled }));
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function scheduleTone(
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  gainPeak: number,
  type: OscillatorType = 'sine',
) {
  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, gainPeak), now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function playSoundCue(kind: SoundCueKind): void {
  if (!isSoundEnabled()) return;
  const now = Date.now();
  const minGap = kind === 'reaction' ? 220 : 120;
  if (lastPlayedAt[kind] && now - (lastPlayedAt[kind] || 0) < minGap) return;
  lastPlayedAt[kind] = now;

  const ctx = getContext();
  if (!ctx || ctx.state !== 'running') return;

  try {
    switch (kind) {
      case 'chat':
        scheduleTone(ctx, 523.25, 0, 0.09, 0.055, 'sine');
        scheduleTone(ctx, 659.25, 0.07, 0.11, 0.05, 'sine');
        break;
      case 'hand':
        scheduleTone(ctx, 587.33, 0, 0.09, 0.06, 'triangle');
        scheduleTone(ctx, 880, 0.08, 0.13, 0.055, 'sine');
        break;
      case 'help':
        scheduleTone(ctx, 783.99, 0, 0.1, 0.075, 'triangle');
        scheduleTone(ctx, 987.77, 0.1, 0.12, 0.075, 'triangle');
        scheduleTone(ctx, 783.99, 0.24, 0.1, 0.065, 'triangle');
        scheduleTone(ctx, 987.77, 0.34, 0.15, 0.075, 'triangle');
        break;
      case 'solo':
        scheduleTone(ctx, 440, 0, 0.06, 0.045, 'sine');
        scheduleTone(ctx, 554.37, 0.05, 0.08, 0.04, 'sine');
        break;
      case 'runOk':
        scheduleTone(ctx, 659.25, 0, 0.07, 0.045, 'sine');
        scheduleTone(ctx, 783.99, 0.06, 0.1, 0.045, 'sine');
        break;
      case 'runErr':
        scheduleTone(ctx, 240, 0, 0.1, 0.055, 'triangle');
        scheduleTone(ctx, 180, 0.08, 0.13, 0.05, 'triangle');
        break;
      case 'reaction':
        scheduleTone(ctx, 520, 0, 0.045, 0.025, 'sine');
        scheduleTone(ctx, 680, 0.03, 0.055, 0.022, 'sine');
        break;
      case 'quiz':
        scheduleTone(ctx, 523.25, 0, 0.08, 0.055, 'sine');
        scheduleTone(ctx, 659.25, 0.07, 0.08, 0.055, 'sine');
        scheduleTone(ctx, 783.99, 0.14, 0.14, 0.06, 'sine');
        break;
    }
  } catch {
    /* noop */
  }
}
