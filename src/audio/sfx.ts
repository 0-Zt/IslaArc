/* Procedural sound: no audio files, everything is synthesised with Web Audio.
   Short effects for work and rewards, plus a soft ambience that follows the time of day:
   waves always, birds by day, crickets at night. */

let ctx: AudioContext | null = null;
let master: GainNode, fxBus: GainNode, ambBus: GainNode;
let enabled = true;
let noiseBuf: AudioBuffer;

export function setSound(on: boolean) { enabled = on; if (master) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx!.currentTime, 0.1); }

/** Audio can only start after a tap, so this is called from the first user gesture. */
export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext; if (!AC) return;
  ctx = new AC() as AudioContext;
  master = ctx.createGain(); master.gain.value = enabled ? 0.9 : 0; master.connect(ctx.destination);
  fxBus = ctx.createGain(); fxBus.gain.value = 0.55; fxBus.connect(master);
  ambBus = ctx.createGain(); ambBus.gain.value = 0.35; ambBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startWaves();
}

function noise(t: number, dur: number, f: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', out = fxBus) {
  if (!ctx) return;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(t: number, f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'sine', out = fxBus) {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
}

export type Sfx = 'chop' | 'pick' | 'dig' | 'hammer' | 'fall' | 'pop' | 'coin' | 'level' | 'solve' | 'splash' | 'fire' | 'tap';
let lastPop = 0;
export function sfx(kind: Sfx, vol = 1) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime, r = 0.9 + Math.random() * 0.2;
  switch (kind) {
    case 'chop': noise(t, 0.09, 900 * r, 1.2, 0.5 * vol); tone(t, 180 * r, 90, 0.08, 0.35 * vol, 'triangle'); break;
    case 'pick': tone(t, 1500 * r, 1300, 0.12, 0.18 * vol, 'square'); noise(t, 0.06, 2500, 2, 0.3 * vol); tone(t + 0.01, 2400 * r, 2200, 0.2, 0.06 * vol); break;
    case 'dig': noise(t, 0.16, 400 * r, 0.8, 0.45 * vol, 'lowpass'); break;
    case 'hammer': tone(t, 320 * r, 160, 0.06, 0.4 * vol, 'triangle'); noise(t, 0.05, 1800, 1.5, 0.25 * vol); break;
    case 'fall': noise(t, 0.5, 300, 0.7, 0.5 * vol, 'lowpass'); tone(t + 0.35, 90, 45, 0.3, 0.5 * vol, 'sine'); noise(t + 0.35, 0.3, 700, 1, 0.3 * vol); break;
    case 'pop': { const now = performance.now(); if (now - lastPop < 70) return; lastPop = now; tone(t, 700 * r, 1100 * r, 0.08, 0.12 * vol, 'sine'); break; }
    case 'coin': [0, 0.07, 0.14].forEach((d, k) => tone(t + d, [880, 1109, 1319][k], [880, 1109, 1319][k], 0.18, 0.15 * vol, 'triangle')); break;
    case 'level': [0, 0.1, 0.2, 0.34].forEach((d, k) => tone(t + d, [523, 659, 784, 1047][k], [523, 659, 784, 1047][k], 0.3, 0.16 * vol, 'triangle')); break;
    case 'solve': [0, 0.12, 0.24].forEach((d, k) => tone(t + d, [392, 587, 784][k], [392, 587, 784][k] * 1.01, 0.5, 0.14 * vol, 'sine')); noise(t + 0.2, 0.8, 3000, 0.6, 0.08 * vol, 'highpass'); break;
    case 'splash': noise(t, 0.35, 1200, 0.6, 0.35 * vol, 'lowpass'); break;
    case 'fire': noise(t, 0.25, 600, 0.5, 0.2 * vol, 'lowpass'); break;
    case 'tap': tone(t, 1200, 900, 0.04, 0.06 * vol, 'sine'); break;
  }
}

/* ---------- ambience ---------- */
function startWaves() {
  if (!ctx) return;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 500;
  const g = ctx.createGain(); g.gain.value = 0.18;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12; const lg = ctx.createGain(); lg.gain.value = 0.12;
  lfo.connect(lg).connect(g.gain);
  s.connect(fl).connect(g).connect(ambBus); s.start(); lfo.start();
}
let ambAcc = 0;
/** Called every frame with how much night it is (0..1): birds by day, crickets by night. */
export function tickAmbience(dt: number, night: number) {
  if (!ctx || !enabled) return;
  ambAcc -= dt; if (ambAcc > 0) return;
  ambAcc = 0.4 + Math.random() * 1.6;
  const t = ctx.currentTime;
  if (night < 0.5 && Math.random() < 0.55) {
    // a little bird: two or three quick rising chirps
    const f = 2200 + Math.random() * 1400, n = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) tone(t + k * 0.09, f, f * 1.35, 0.07, 0.035, 'sine', ambBus);
  } else if (night >= 0.5) {
    // crickets: fast pulses of a high tone
    const f = 4200 + Math.random() * 600;
    for (let k = 0; k < 6; k++) tone(t + k * 0.045, f, f, 0.025, 0.02 * night, 'square', ambBus);
  }
}
