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
const DPR_MAX = Math.min(devicePixelRatio || 1, IS_TOUCH ? 2 : 1.5);

/* ---------- renderer, scene, camera ---------- */
export const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: false });
renderer.setPixelRatio(DPR_MAX);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
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
controls.minZoom = 0.45;
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
}

/* ---------- water ---------- */
export const waterTex = pixTex(makeCanvas(32, 32, (x, w, h) => {
  const r = rng(5);
  x.fillStyle = '#3a8fd6'; x.fillRect(0, 0, w, h);
  for (let k = 0; k < 26; k++) { x.fillStyle = r() < 0.5 ? '#5aa8e8' : '#2f7cc4'; x.fillRect(Math.floor(r() * w), Math.floor(r() * h), 2 + Math.floor(r() * 3), 1); }
  for (let k = 0; k < 5; k++) { x.fillStyle = '#9fd4ff'; x.fillRect(Math.floor(r() * w), Math.floor(r() * h), 2, 1); }
}));
waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
waterTex.repeat.set(50, 50);
export const water = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ map: waterTex, transparent: true, opacity: 0.9, roughness: 0.28 }),
);
water.rotation.x = -Math.PI / 2;
water.position.y = 0.14;
water.receiveShadow = true;
scene.add(water);

/* ---------- post-processing: one render, AO, and one merged effect pass ---------- */
export type Quality = 'alta' | 'baja';
let composer: EffectComposer;
let aoPass: any;
let tilt: TiltShiftEffect;
export const bloom = new BloomEffect({ intensity: 0.6, luminanceThreshold: 0.92, luminanceSmoothing: 0.1, mipmapBlur: true, radius: 0.6, levels: 6 });

export let quality: Quality = IS_TOUCH ? 'baja' : 'alta';
try { const q = localStorage.getItem('isla-arcilla-q'); if (q === 'alta' || q === 'baja') quality = q; } catch { /* storage may be blocked */ }

function buildComposer() {
  composer?.dispose();
  const high = quality === 'alta';
  composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: high ? 4 : 2 });
  composer.addPass(new RenderPass(scene, camera));
  aoPass = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
  aoPass.setQualityMode(high ? 'Medium' : 'Performance');
  Object.assign(aoPass.configuration, {
    aoRadius: 0.9, distanceFalloff: 0.6, intensity: 2.2, color: new THREE.Color('#1c2410'),
    halfRes: !high, depthAwareUpsampling: true, gammaCorrection: false, screenSpaceRadius: false,
  });
  composer.addPass(aoPass);
  tilt = new TiltShiftEffect({ focusArea: 0.5, feather: 0.4, kernelSize: high ? KernelSize.MEDIUM : KernelSize.SMALL, resolutionScale: 0.5 });
  const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.42 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
  composer.addPass(new EffectPass(camera, bloom, tilt, vignette, tone));
  composer.setSize(innerWidth, innerHeight);
  sun.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
  if (sun.shadow.map) { sun.shadow.map.dispose(); (sun.shadow as any).map = null; }
}

export function setQuality(q: Quality) {
  quality = q;
  try { localStorage.setItem('isla-arcilla-q', q); } catch { /* ignore */ }
  buildComposer();
}

/* ---------- dynamic resolution: keep frames smooth before touching the look ---------- */
let pr = DPR_MAX, acc = 0, frames = 0;
const PR_MIN = 0.8;
export function adaptResolution(rawDt: number) {
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
export function applyTime(k: TimeKey) {
  const t = TIMES[k];
  const x = skyCanvas.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, t.sky[0]); g.addColorStop(0.55, t.sky[1]); g.addColorStop(1, t.sky[2]);
  x.fillStyle = g; x.fillRect(0, 0, 4, 256); skyTex.needsUpdate = true;
  (scene.fog as THREE.Fog).color.set(t.fog);
  hemi.color.set(t.hemi[0]); hemi.groundColor.set(t.hemi[1]); hemi.intensity = t.hemi[2];
  sun.color.set(t.sun[0]); sun.intensity = t.sun[1]; sunEl = t.el;
  rim.color.set(t.rim[0]); rim.intensity = t.rim[1];
  scene.environmentIntensity = t.env; glowMul = t.glow;
  placeSun();
}

buildComposer();
