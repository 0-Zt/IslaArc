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

export type Sfx = 'chop' | 'pick' | 'dig' | 'hammer' | 'fall' | 'pop' | 'coin' | 'level' | 'solve' | 'splash' | 'fire' | 'tap' | 'cast' | 'plop' | 'nibble' | 'bite' | 'catch' | 'snap'
  | 'flap' | 'squeak' | 'step' | 'bubble' | 'crack' | 'hit' | 'bighit' | 'heal' | 'roar' | 'whoosh' | 'shell' | 'guard';
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
    // fishing
    case 'cast': noise(t, 0.3, 2400, 0.7, 0.18 * vol, 'highpass'); tone(t, 900, 500, 0.25, 0.04 * vol, 'sine'); break;
    case 'plop': tone(t, 620 * r, 180, 0.12, 0.22 * vol, 'sine'); noise(t + 0.02, 0.12, 900, 1, 0.12 * vol, 'lowpass'); break;
    case 'nibble': tone(t, 880 * r, 640, 0.06, 0.12 * vol, 'sine'); break;
    case 'bite': noise(t, 0.3, 1100, 0.7, 0.4 * vol, 'lowpass'); tone(t, 300, 120, 0.2, 0.25 * vol, 'sine'); break;
    case 'catch': [0, 0.09, 0.18, 0.3].forEach((d, k) => tone(t + d, [587, 740, 880, 1175][k], [587, 740, 880, 1175][k], 0.25, 0.15 * vol, 'triangle')); noise(t, 0.3, 1400, 0.6, 0.15 * vol, 'lowpass'); break;
    case 'snap': noise(t, 0.08, 3200, 2, 0.3 * vol, 'highpass'); tone(t + 0.05, 400, 140, 0.25, 0.18 * vol, 'triangle'); break;
    // the cave
    case 'flap': for (let k = 0; k < 7; k++) noise(t + k * 0.055 + Math.random() * 0.02, 0.05, 700 + Math.random() * 500, 1.2, 0.16 * vol, 'bandpass'); break;
    case 'squeak': { const f = 3800 + Math.random() * 1600; tone(t, f, f * 1.25, 0.05, 0.05 * vol, 'sine'); tone(t + 0.08, f * 1.1, f * 0.9, 0.04, 0.035 * vol, 'sine'); break; }
    case 'step': noise(t, 0.045, 1400 * r, 1.4, 0.07 * vol, 'bandpass'); break;
    case 'bubble': tone(t, 140 * r, 320 * r, 0.12, 0.1 * vol, 'sine'); noise(t + 0.08, 0.08, 500, 1, 0.06 * vol, 'lowpass'); break;
    case 'crack': noise(t, 0.12, 2200, 1.5, 0.35 * vol, 'bandpass'); noise(t + 0.08, 0.6, 350, 0.7, 0.5 * vol, 'lowpass'); tone(t + 0.1, 110, 50, 0.4, 0.4 * vol, 'sine'); break;
    // battle
    case 'hit': noise(t, 0.08, 1100 * r, 1, 0.45 * vol, 'bandpass'); tone(t, 220 * r, 90, 0.12, 0.3 * vol, 'triangle'); break;
    case 'bighit': noise(t, 0.4, 260, 0.8, 0.7 * vol, 'lowpass'); tone(t, 90, 38, 0.45, 0.6 * vol, 'sine'); noise(t + 0.03, 0.15, 1600, 1, 0.25 * vol); break;
    case 'heal': [0, 0.08, 0.16].forEach((d, k) => tone(t + d, [660, 880, 1320][k], [700, 940, 1400][k], 0.25, 0.08 * vol, 'sine')); break;
    case 'roar': tone(t, 95, 60, 1.1, 0.4 * vol, 'sawtooth'); noise(t, 1.0, 240, 0.8, 0.35 * vol, 'lowpass'); tone(t + 0.05, 140, 85, 0.9, 0.15 * vol, 'square'); break;
    case 'whoosh': noise(t, 0.28, 900, 0.6, 0.22 * vol, 'bandpass'); break;
    case 'guard': tone(t, 520, 520, 0.2, 0.1 * vol, 'triangle'); tone(t, 780, 780, 0.2, 0.06 * vol, 'triangle'); break;
    case 'shell': {
      // the big shell: a long, low horn with a slow wobble and a breathy edge
      if (!ctx) break;
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; o2.type = 'sine'; o.frequency.value = 174; o2.frequency.value = 348; lfo.frequency.value = 5.5; lg.gain.value = 4;
      lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28 * vol, t + 0.35); g.gain.setValueAtTime(0.28 * vol, t + 1.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      o.connect(fl); o2.connect(fl); fl.connect(g).connect(fxBus);
      [o, o2, lfo].forEach(n => { n.start(t); n.stop(t + 2.5); });
      noise(t, 2.2, 1800, 0.5, 0.05 * vol, 'bandpass');
      break;
    }
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
  wavesBus = ctx.createGain(); wavesBus.gain.value = cave ? 0 : 1;
  s.connect(fl).connect(g).connect(wavesBus).connect(ambBus); s.start(); lfo.start();
  // underground: a deep, slow wind instead of the sea
  const d = ctx.createBufferSource(); d.buffer = noiseBuf; d.loop = true;
  const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 160;
  const dlfo = ctx.createOscillator(); dlfo.frequency.value = 0.07; const dlg = ctx.createGain(); dlg.gain.value = 0.08;
  droneBus = ctx.createGain(); droneBus.gain.value = cave ? 0.22 : 0;
  dlfo.connect(dlg).connect(droneBus.gain);
  d.connect(dl).connect(droneBus).connect(ambBus); d.start(); dlfo.start();
}
let ambAcc = 0, cave = false, lavaNear = false, wavesBus: GainNode | null = null, droneBus: GainNode | null = null;
/** Underground there are no birds: drops of water with a little echo, and the mountain rumbling now and then. */
export function setCaveAmbience(on: boolean, lava = false) {
  cave = on; lavaNear = lava; ambAcc = 0.5;
  if (ctx && wavesBus && droneBus) { wavesBus.gain.setTargetAtTime(on ? 0 : 1, ctx.currentTime, 0.4); droneBus.gain.setTargetAtTime(on ? 0.22 : 0, ctx.currentTime, 0.4); }
}
/** Called every frame with how much night it is (0..1): birds by day, crickets by night. */
export function tickAmbience(dt: number, night: number) {
  if (!ctx || !enabled) return;
  ambAcc -= dt; if (ambAcc > 0) return;
  ambAcc = 0.4 + Math.random() * 1.6;
  const t = ctx.currentTime;
  if (cave) {
    ambAcc = 0.9 + Math.random() * 2.2;
    if (lavaNear && Math.random() < 0.5) { for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) { const f = 120 + Math.random() * 80; tone(t + k * 0.14, f, f * 2.2, 0.12, 0.07, 'sine', ambBus); } return; }
    if (Math.random() < 0.8) {
      const f = 1500 + Math.random() * 900;
      for (let k = 0; k < 3; k++) tone(t + k * 0.21, f, f * 0.55, 0.05, 0.05 / (1 + k * 2.2), 'sine', ambBus);
    } else tone(t, 70, 46, 1.1, 0.07, 'triangle', ambBus);
    return;
  }
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
