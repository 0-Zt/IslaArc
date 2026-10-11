import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, TiltShiftEffect,
  VignetteEffect, ToneMappingEffect, ToneMappingMode, KernelSize,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { makeCanvas, pixTex } from '../core/canvas';
import { rng } from '../core/random';

export const IS_TOUCH = matchMedia('(pointer:coarse)').matches || innerWidth < 820;
/* The 3D view renders at up to 1.5× on "Baja" and 2× on "Alta"; the interface is HTML, so it stays sharp at full resolution.
   Pixel-art voxels hold up very well at 1.5×, and it is roughly half the pixels of 2×. */
let DPR_MAX = Math.min(devicePixelRatio || 1, 1.5);

/* ---------- renderer, scene, camera ---------- */
export const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: false });
renderer.setPixelRatio(DPR_MAX);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // redrawn every other frame, or right away when the sun moves (see tickShadows)
renderer.toneMapping = THREE.NoToneMapping; // done in the effect pass

export const scene = new THREE.Scene();
const skyCanvas = makeCanvas(4, 256, () => {});
const skyTex = new THREE.CanvasTexture(skyCanvas);
skyTex.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTex;
scene.fog = new THREE.Fog('#bfe3f7', 50, 110);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

export const FR = 9;
export const camera = new THREE.OrthographicCamera(-FR, FR, FR, -FR, 0.1, 200);
camera.position.set(18, 17.5, 18);

export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.minZoom = 0.32;
controls.maxZoom = 4;
controls.minPolarAngle = 0.45;
controls.maxPolarAngle = 1.2;
controls.screenSpacePanning = false;
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

/* ---------- lights ---------- */
export const hemi = new THREE.HemisphereLight('#ffe9d0', '#5a6a40', 0.6);
scene.add(hemi);
export const sun = new THREE.DirectionalLight('#ffd2a0', 3.4);
sun.castShadow = true;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.05;
const sc = sun.shadow.camera;
sc.near = 1; sc.far = 90;
scene.add(sun, sun.target);
export const rim = new THREE.DirectionalLight('#9fc4ff', 0.45);
scene.add(rim, rim.target);

let sunAz = 35, sunEl = 34;
/** The shadow frustum follows the camera target, so it can stay small and sharp. */
export function placeSun() {
  const a = sunAz * Math.PI / 180, e = sunEl * Math.PI / 180, c = controls.target, R = 30;
  sun.position.set(c.x + Math.cos(a) * Math.cos(e) * R, c.y + Math.sin(e) * R, c.z + Math.sin(a) * Math.cos(e) * R);
  sun.target.position.copy(c);
  rim.position.set(c.x - Math.cos(a) * 20, 12, c.z - Math.sin(a) * 20);
  rim.target.position.copy(c);
  const half = Math.min(16, (FR * Math.max(1, camera.right / FR)) / camera.zoom + 3);
  if (Math.abs(sc.right - half) > 0.5) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
  if (!lastSun.equals(sun.position)) { lastSun.copy(sun.position); renderer.shadowMap.needsUpdate = true; }
}
const lastSun = new THREE.Vector3();
/* Shadow cache: the island barely changes between two frames (only swaying leaves and walking figures),
   so the shadow map is redrawn every other frame instead of every frame. */
let shadowFrame = 0;
export function tickShadows() { if (++shadowFrame % 2 === 0) renderer.shadowMap.needsUpdate = true; }

/* ---------- smooth camera moves ---------- */
let fly: { from: THREE.Vector3; to: THREE.Vector3; off: THREE.Vector3; off1: THREE.Vector3; z0: number; z1: number; t: number } | null = null;
/** Glides the camera to look at `target`; `off` (camera minus target) also swings it around when given. */
export function flyTo(target: THREE.Vector3, zoom: number, off?: THREE.Vector3) {
  const off0 = camera.position.clone().sub(controls.target);
  fly = { from: controls.target.clone(), to: target.clone(), off: off0, off1: off ? off.clone() : off0.clone(), z0: camera.zoom, z1: zoom, t: 0 };
}
/** Stops a camera glide (the player took over, or something else drives the camera now). */
export function cancelFly() { fly = null; }
export const cameraOffset = () => camera.position.clone().sub(controls.target);
export function tickFly(dt: number) {
  if (!fly) return;
  fly.t = Math.min(1, fly.t + dt * 1.8);
  const k = fly.t * fly.t * (3 - 2 * fly.t);
  controls.target.lerpVectors(fly.from, fly.to, k);
  // swing around the target keeping the distance (slerp of the direction)
  const a = fly.off, b = fly.off1, len = a.length() + (b.length() - a.length()) * k;
  const dir = a.clone().normalize().lerp(b.clone().normalize(), k).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, len);
  camera.zoom = fly.z0 + (fly.z1 - fly.z0) * k; camera.updateProjectionMatrix();
  if (fly.t >= 1) fly = null;
}

/* ---------- graphics settings (saved per device) ---------- */
export type Quality = 'alta' | 'baja';
export interface Gfx {
  quality: Quality;
  tilt: number;            // 0 = off, 1 = strong miniature blur
  tiltFollow: boolean;     // focus band follows the selected figure
  ao: 'off' | 'suave' | 'marcada';
  bloom: boolean; vignette: boolean; shadows: boolean; fps: boolean;
  daycycle: boolean;       // the day turns into night and back
  sound: boolean;
  cap60: boolean;          // never draw more than 60 frames per second (120 Hz phones heat up and throttle)
  v?: number;
}
const GFX_KEY = 'isla-arcilla-gfx';
export const GFX_DEFAULT: Gfx = { quality: IS_TOUCH ? 'baja' : 'alta', tilt: 0.35, tiltFollow: true, ao: 'off', bloom: true, vignette: true, shadows: true, fps: false, cap60: true, daycycle: true, sound: true, v: 2 };
export const gfx: Gfx = { ...GFX_DEFAULT };
try {
  const saved = JSON.parse(localStorage.getItem(GFX_KEY) || '{}');
  // v2: occlusion is baked into the blocks now, so the costly screen-space pass starts off
  if (!saved.v) { delete saved.ao; saved.v = 2; }
  Object.assign(gfx, saved);
} catch { /* storage may be blocked */ }
function saveGfx() { try { localStorage.setItem(GFX_KEY, JSON.stringify(gfx)); } catch { /* ignore */ } }

/* ---------- post-processing: one render, AO, and one merged effect pass ---------- */
let composer: EffectComposer;
let tilt: TiltShiftEffect | null = null;
export const bloom = new BloomEffect({ intensity: 0.6, luminanceThreshold: 0.92, luminanceSmoothing: 0.1, mipmapBlur: true, radius: 0.6, levels: 6 });
let focusY = 0, clearK = 0;

function tiltParams(t: number) { const focusArea = 0.6 - 0.36 * t; return { focusArea, feather: focusArea * 0.6 }; } // the soft edge must stay narrower than the sharp band

function buildComposer() {
  composer?.dispose();
  const high = gfx.quality === 'alta';
  DPR_MAX = Math.min(devicePixelRatio || 1, high ? 2 : 1.5);
  if (!prLocked) { pr = Math.min(pr, DPR_MAX); if (high) pr = DPR_MAX; renderer.setPixelRatio(pr); }
  composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: high ? 4 : 2 });
  composer.addPass(new RenderPass(scene, camera));
  if (gfx.ao !== 'off') {
    const ao: any = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
    ao.setQualityMode(high ? 'Medium' : 'Performance');
    Object.assign(ao.configuration, {
      aoRadius: 0.9, distanceFalloff: 0.6, intensity: gfx.ao === 'marcada' ? 3 : 1.8, color: new THREE.Color('#1c2410'),
      halfRes: !high, depthAwareUpsampling: true, gammaCorrection: false, screenSpaceRadius: false,
    });
    composer.addPass(ao);
  }
  const effects: any[] = [];
  if (gfx.bloom) effects.push(bloom);
  tilt = null;
  if (gfx.tilt > 0.01) {
    tilt = new TiltShiftEffect({ ...tiltParams(gfx.tilt), offset: focusY, kernelSize: high ? KernelSize.MEDIUM : KernelSize.SMALL, resolutionScale: 0.5 });
    effects.push(tilt);
  }
  if (gfx.vignette) effects.push(new VignetteEffect({ offset: 0.32, darkness: 0.42 }));
  effects.push(new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }));
  composer.addPass(new EffectPass(camera, ...effects));
  composer.setSize(innerWidth, innerHeight);
  sun.castShadow = gfx.shadows;
  sun.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
  if (sun.shadow.map) { sun.shadow.map.dispose(); (sun.shadow as any).map = null; }
  renderer.shadowMap.needsUpdate = true;
}

/** Changes settings; only rebuilds the pipeline when an effect is switched on or off. */
export function setGfx(patch: Partial<Gfx>) {
  const before = { ...gfx };
  Object.assign(gfx, patch); saveGfx();
  const structural = before.quality !== gfx.quality || before.ao !== gfx.ao || before.bloom !== gfx.bloom || before.vignette !== gfx.vignette
    || before.shadows !== gfx.shadows || (before.tilt > 0.01) !== (gfx.tilt > 0.01);
  if (structural) buildComposer();
  else if (tilt) Object.assign(tilt, tiltParams(gfx.tilt));
}
export function resetGfx() { setGfx({ ...GFX_DEFAULT }); }

/** Moves the sharp band of the miniature effect toward a screen height (-1 bottom .. 1 top). */
export function focusOn(ndcY: number | null, dt: number, allSharp = false) {
  const target = gfx.tiltFollow && ndcY !== null ? Math.max(-0.3, Math.min(0.3, ndcY / 2)) : 0;
  focusY += (target - focusY) * Math.min(1, dt * 4);
  // while placing a building the whole view turns sharp, so the spot can be judged
  clearK += ((allSharp ? 1 : 0) - clearK) * Math.min(1, dt * 6);
  if (tilt) {
    const fa = tiltParams(gfx.tilt).focusArea;
    const a = fa + (1.6 - fa) * clearK;
    tilt.offset = focusY; tilt.focusArea = a; tilt.feather = a * 0.6;
  }
}

/* ---------- dynamic resolution: keep frames smooth before touching the look ---------- */
let prLocked = false;
let pr = 1.5, acc = 0, frames = 0;
const PR_MIN = 0.8;
export function adaptResolution(rawDt: number) {
  if (prLocked) return;
  acc += rawDt; frames++;
  if (acc < 1.2) return;
  const avg = acc / frames; acc = 0; frames = 0;
  let next = pr;
  if (avg > 1 / 45 && pr > PR_MIN) next = Math.max(PR_MIN, pr - 0.15);
  else if (avg < 1 / 58 && pr < DPR_MAX) next = Math.min(DPR_MAX, pr + 0.1);
  if (Math.abs(next - pr) > 0.01) { pr = next; renderer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); }
}
export const pixelRatio = () => pr;

export function resize() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  camera.left = -FR * aspect; camera.right = FR * aspect; camera.top = FR; camera.bottom = -FR;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
}

export function render(dt: number) { composer.render(dt); }

/* ---------- time of day ---------- */
const TIMES = {
  manana: { sky: ['#7fb8e8', '#cfe6f2', '#ffe2c0'], fog: '#e8e6dc', hemi: ['#ffe9d0', '#5a6a40', 0.6], sun: ['#ffd2a0', 3.4], el: 34, rim: ['#9fc4ff', 0.45], env: 0.2, glow: 1 },
  mediodia: { sky: ['#5aa6e6', '#9fd0f0', '#d8eef8'], fog: '#cfe8f5', hemi: ['#d8efff', '#5b7a3c', 0.85], sun: ['#fff4e2', 3.2], el: 62, rim: ['#bcd6ff', 0.3], env: 0.3, glow: 0.8 },
  atardecer: { sky: ['#34407e', '#c0688a', '#ffac68'], fog: '#d89078', hemi: ['#ffb088', '#4a3444', 0.5], sun: ['#ff8638', 4.3], el: 17, rim: ['#7a86ff', 0.6], env: 0.15, glow: 1.4 },
  noche: { sky: ['#070b1e', '#141e40', '#243458'], fog: '#1a2444', hemi: ['#5a70b8', '#101820', 0.45], sun: ['#8aa8ff', 1.2], el: 50, rim: ['#5a6aff', 0.3], env: 0.08, glow: 2.6 },
} as const;
export type TimeKey = keyof typeof TIMES;
export let glowMul = 1;
type Preset = (typeof TIMES)[TimeKey];
const _ca = new THREE.Color(), _cb = new THREE.Color();
const mixHex = (a: string, b: string, k: number) => '#' + _ca.set(a).lerp(_cb.set(b), k).getHexString();
let skySig = '';
/** Lighting between two presets (k = 0 → a, 1 → b). The day-night cycle calls this every few frames. */
export function applyBlend(ka: TimeKey, kb: TimeKey, k: number, azimuth = 35) {
  if (caveMode) return;   // underground the day does not reach
  const a: Preset = TIMES[ka], b: Preset = TIMES[kb], L = (x: number, y: number) => x + (y - x) * k;
  const sky = [0, 1, 2].map(i => mixHex(a.sky[i], b.sky[i], k));
  const sig = sky.join();
  if (sig !== skySig) {
    skySig = sig;
    const x = skyCanvas.getContext('2d')!;
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, sky[0]); g.addColorStop(0.55, sky[1]); g.addColorStop(1, sky[2]);
    x.fillStyle = g; x.fillRect(0, 0, 4, 256); skyTex.needsUpdate = true;
  }
  (scene.fog as THREE.Fog).color.set(mixHex(a.fog, b.fog, k));
  hemi.color.set(mixHex(a.hemi[0], b.hemi[0], k)); hemi.groundColor.set(mixHex(a.hemi[1], b.hemi[1], k));
  const env = L(a.env, b.env);
  hemi.intensity = L(a.hemi[2], b.hemi[2]) + env * 1.6; // stands in for the environment light the physical materials used to get
  sun.color.set(mixHex(a.sun[0], b.sun[0], k)); sun.intensity = L(a.sun[1], b.sun[1]); sunEl = L(a.el, b.el); sunAz = azimuth;
  rim.color.set(mixHex(a.rim[0], b.rim[0], k)); rim.intensity = L(a.rim[1], b.rim[1]);
  scene.environmentIntensity = env; glowMul = L(a.glow, b.glow);
  placeSun();
}
export function applyTime(k: TimeKey) { applyBlend(k, k, 0); }

/* ---------- underground: the volcano cave has its own light ---------- */
let caveMode = false;
const CAVE_BG = new THREE.Color('#0d0907');
/** Switches the cave lighting on (dark, warm, light from the lanterns) or back to the island sky. */
export function setCaveMode(on: boolean) {
  caveMode = on;
  const fog = scene.fog as THREE.Fog;
  if (on) {
    scene.background = CAVE_BG; fog.color.copy(CAVE_BG); fog.near = 21; fog.far = 34;
    hemi.color.set('#aaa0bc'); hemi.groundColor.set('#2a2018'); hemi.intensity = 1.15;
    sun.color.set('#ffcf9a'); sun.intensity = 1.3; sunEl = 70; sunAz = 100;
    rim.intensity = 0; scene.environmentIntensity = 0.04; glowMul = 2.2;
    placeSun();
  } else {
    scene.background = skyTex; fog.near = 50; fog.far = 110; skySig = '';
  }
}
export const inCaveLight = () => caveMode;

buildComposer();

/* ---------- debug: timings for performance work ---------- */
export function lockPixelRatio(v: number | null) { prLocked = v !== null; if (v !== null) { pr = v; renderer.setPixelRatio(v); composer.setSize(innerWidth, innerHeight); } }
export function benchRender(n = 3, post = true, shadowEvery = 0) {
  const gl = renderer.getContext(), px = new Uint8Array(4);
  const sync = () => { renderer.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  sync();
  const t0 = performance.now();
  renderer.info.reset();
  for (let k = 0; k < n; k++) { if (shadowEvery && k % shadowEvery === 0) renderer.shadowMap.needsUpdate = true; if (post) composer.render(0.016); else renderer.render(scene, camera); sync(); }
  return { ms: (performance.now() - t0) / n, calls: Math.round(renderer.info.render.calls / n), tris: Math.round(renderer.info.render.triangles / n) };
}
