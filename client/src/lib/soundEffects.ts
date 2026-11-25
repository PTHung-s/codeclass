/**
 * Synthesized classic sound effects via Web Audio API (zero external asset dependency).
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Classic Minecraft "OOF" hurt sound synthesized via Web Audio API.
 */
export function playMinecraftHurtSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.85, now);
    masterGain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
    masterGain.connect(ctx.destination);

    const osc1 = ctx.createOscillator();
    osc1.type = "triangle";
    osc1.frequency.setValueAtTime(145, now);
    osc1.frequency.exponentialRampToValueAtTime(62, now + 0.26);

    const waveShaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1;
      curve[i] = ((3 + 20) * x * 20 * (Math.PI / 180)) / (Math.PI + 20 * Math.abs(x));
    }
    waveShaper.curve = curve;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.26);

    const osc2 = ctx.createOscillator();
    const osc2Gain = ctx.createGain();
    osc2.type = "square";
    osc2.frequency.setValueAtTime(95, now);
    osc2.frequency.exponentialRampToValueAtTime(45, now + 0.12);
    osc2Gain.gain.setValueAtTime(0.4, now);
    osc2Gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    osc1.connect(filter);
    filter.connect(waveShaper);
    waveShaper.connect(masterGain);

    osc2.connect(osc2Gain);
    osc2Gain.connect(masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.28);
    osc2.stop(now + 0.14);
  } catch (err) {}
}

/**
 * 1. Tiếng nạp năng lượng tụ sáng trước khi chém (Charge Anticipation)
 */
export function playChargeSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(380, now + 0.2);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  } catch (err) {}
}

/**
 * 2. Tiếng tia laser quét chém ngang dứt khoát (Laser Cut Swipe)
 */
export function playLaserCutSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(2400, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.18);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  } catch (err) {}
}

/**
 * 3. Hợp âm mở quà sáng rực rỡ theo Rarity (Harmonic Chord Reveal)
 */
export function playGachaRevealSound(rarity: "common" | "rare" | "epic" | "legendary" | "mythic" = "common") {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const chords = {
      common: [523.25, 659.25, 783.99],
      rare: [587.33, 739.99, 880.0, 1174.66],
      epic: [659.25, 830.61, 987.77, 1318.51],
      legendary: [659.25, 830.61, 987.77, 1318.51, 1661.22],
      mythic: [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093.0],
    }[rarity] || [523.25, 659.25];

    chords.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      const start = now + idx * 0.05;
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.85);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.9);
    });
  } catch (err) {}
}

/**
 * Tiếng cào thẻ kim loại
 */
export function playScratchSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bufferSize = ctx.sampleRate * 0.05;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2000 + Math.random() * 800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  } catch (err) {}
}
