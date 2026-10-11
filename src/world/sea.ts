import * as THREE from 'three';
import { scene } from '../render/renderer';
import { makeCanvas } from '../core/canvas';
import { tileUnder } from './island';
import { puff } from './particles';
import { S } from '../game/state';
import { nightK } from '../render/daynight';

/* The open sea around the island: patches of deep, dark water (rarer things live there),
   a wall of big waves that the raft cannot cross yet, and far behind it the outline of
   another island with a small light — where Marea went. */

const WATER_Y = 0.14;
/** Deep zones: centre and radius, in world units around the island. */
export const DEEP: { x: number; z: number; r: number; name: string }[] = [
  { x: -18.5, z: 11, r: 3.4, name: 'La fosa del oeste' },
  { x: 6, z: 21.5, r: 3.2, name: 'El bajo de los cofres' },
  { x: 21.5, z: 5, r: 3.3, name: 'La grieta del este' },
];
/** The big waves: a sector of the sea far out, towards the top of the screen. */
export const SURGE = { angle: -2.36, half: 0.62, r: 25 };
export const SEA_LIMIT = 37;

const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
export const deepAt = (x: number, z: number) => DEEP.find(d => Math.hypot(x - d.x, z - d.z) < d.r) || null;
/** Once the shell has been blown, a lane opens through the middle of the waves, out towards the lighthouse. */
export const LANE = { half: 0.13, far: 40.5 };
export const inLane = (x: number, z: number) => Math.abs(angDiff(Math.atan2(z, x), SURGE.angle)) < LANE.half;
const open = () => !!S.flags.olasAbiertas;
export const surgeAt = (x: number, z: number) => Math.hypot(x, z) > SURGE.r && Math.abs(angDiff(Math.atan2(z, x), SURGE.angle)) < SURGE.half && !(open() && inLane(x, z));
export const outOfSea = (x: number, z: number) => Math.hypot(x, z) > (open() && inLane(x, z) ? LANE.far : SEA_LIMIT);
/** Near enough to the big waves to blow the shell at them. */
export const nearWaves = (x: number, z: number) => { const r = Math.hypot(x, z); return r > SURGE.r - 4 && r < SURGE.r + 2 && Math.abs(angDiff(Math.atan2(z, x), SURGE.angle)) < SURGE.half + 0.08; };
/** Past the waves, in the lane, on the lighthouse side. */
export const pastWaves = (x: number, z: number) => open() && inLane(x, z) && Math.hypot(x, z) > SURGE.r + 5.5;
/** Close enough to the lighthouse island to step ashore. */
export const nearFaro = (x: number, z: number) => open() && inLane(x, z) && Math.hypot(x, z) > LANE.far - 2.2;
let calmPulse = 0, openK = 0;
/** The shell's call: a weak one only makes the waves bow for a moment. */
export function calmWaves() { calmPulse = 1; }
export const isOpenWater = (x: number, z: number) => !tileUnder(x, z);

/* ---------- deep zones: dark discs with a soft edge that slowly turn ---------- */
const deepTex = new THREE.CanvasTexture(makeCanvas(128, 128, x => {
  const g = x.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  // a few lighter ripples so it does not read as a flat hole
  x.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 9; k++) { x.strokeStyle = `rgba(0,0,0,${0.12 + Math.random() * 0.1})`; x.lineWidth = 2 + Math.random() * 2; x.beginPath(); x.arc(64 + (Math.random() - 0.5) * 30, 64 + (Math.random() - 0.5) * 30, 10 + Math.random() * 40, Math.random() * 6, Math.random() * 6 + 1.5); x.stroke(); }
}));
const deepMeshes: THREE.Mesh[] = [];
for (const d of DEEP) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(d.r * 1.25, 40), new THREE.MeshBasicMaterial({ map: deepTex, color: '#020c1e', transparent: true, opacity: 0.72, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(d.x, WATER_Y + 0.006, d.z); m.renderOrder = 2;
  scene.add(m); deepMeshes.push(m);
}

/* ---------- the wall of waves ---------- */
const surge = new THREE.Group(); scene.add(surge);
const crests: { g: THREE.Group; ph: number; y0: number; lane: boolean }[] = [];
{
  const body = [new THREE.MeshLambertMaterial({ color: '#1f6fa8' }), new THREE.MeshLambertMaterial({ color: '#2a80b8' }), new THREE.MeshLambertMaterial({ color: '#3890c4' })];
  const foam = new THREE.MeshLambertMaterial({ color: '#f4fbff' }), spray = new THREE.MeshLambertMaterial({ color: '#d8f0fa' });
  for (let row = 0; row < 3; row++) {
    const r = SURGE.r + 0.6 + row * 1.4, n = 16 + row * 4;
    for (let k = 0; k < n; k++) {
      const a = SURGE.angle - SURGE.half + (k + 0.5 + (row % 2) * 0.5) / n * SURGE.half * 2 + (Math.random() - 0.5) * 0.03;
      const w = 1.3 + Math.random() * 0.7, h = 0.3 + Math.random() * 0.25 + row * 0.14;
      const g = new THREE.Group();
      // a wave: a blue body leaning towards the island, a curl of foam on top and a bit of spray
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.55), body[row]); b.position.y = h / 2; g.add(b);
      const f = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.1, 0.14), foam); f.position.set(0, h + 0.03, 0.22); g.add(f);
      const c = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.08, 0.1), foam); c.position.set((Math.random() - 0.5) * 0.3, h - 0.08, 0.33); g.add(c);
      if (Math.random() < 0.6) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), spray); sp.position.set((Math.random() - 0.5) * w * 0.6, h + 0.25, 0.1); g.add(sp); }
      g.position.set(Math.cos(a) * r, WATER_Y - 0.12, Math.sin(a) * r);
      g.rotation.y = -a - Math.PI / 2;   // the curl faces the island
      surge.add(g); crests.push({ g, ph: Math.random() * 6.28 + row, y0: g.position.y, lane: Math.abs(angDiff(a, SURGE.angle)) < LANE.half + 0.05 });
    }
  }
  // darker, rough water beyond the wall
  const back = new THREE.Mesh(new THREE.RingGeometry(SURGE.r + 0.3, SEA_LIMIT + 14, 40, 1, -(SURGE.angle + SURGE.half), SURGE.half * 2), new THREE.MeshBasicMaterial({ color: '#0a2440', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  back.rotation.x = -Math.PI / 2; back.position.y = WATER_Y + 0.004; back.renderOrder = 2;
  // laid flat, the ring's angle θ ends up at world angle -θ, hence the negated start
  surge.add(back);
}

/* ---------- the far island with a small light ---------- */
const far = new THREE.Group(); scene.add(far);
{
  const a = SURGE.angle, r = SEA_LIMIT + 9;
  far.position.set(Math.cos(a) * r, WATER_Y, Math.sin(a) * r);
  const rock = new THREE.MeshLambertMaterial({ color: '#46586c' }), green = new THREE.MeshLambertMaterial({ color: '#4a6a5a' });
  const add = (w: number, h: number, d: number, x: number, z: number, y: number, m: THREE.Material) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y + h / 2, z); far.add(b); };
  add(9, 1.2, 6, 0, 0, -0.4, rock); add(6, 1.4, 4, -0.5, 0.3, 0.6, green); add(3, 1.6, 2.6, 1, -0.2, 1.8, green);
  add(0.7, 2.6, 0.7, 2.6, 0.8, 0.6, new THREE.MeshLambertMaterial({ color: '#d8d0c0' }));   // a lighthouse
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.1) }));
  lamp.position.set(2.6, 3.5, 0.8); far.add(lamp); (far as any).lamp = lamp;
  // once lit, a beam sweeps the sea at night
  const beam = new THREE.Group(); beam.position.copy(lamp.position);
  for (const sd of [1, -1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 26), new THREE.MeshBasicMaterial({ color: '#fff4c8', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending })); b.position.z = sd * 13.3; beam.add(b); }
  beam.visible = false; far.add(beam); (far as any).beam = beam;
}

let bub = 0;
export function tickSea(dt: number, T: number) {
  deepMeshes.forEach((m, k) => { m.rotation.z += dt * (k % 2 ? 0.02 : -0.025); (m.material as THREE.MeshBasicMaterial).opacity = 0.68 + 0.05 * Math.sin(T * 0.6 + k); });
  // bubbles rising from the deep
  bub -= dt;
  if (bub <= 0) { bub = 0.25; for (const d of DEEP) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * d.r * 0.9; puff(d.x + Math.cos(a) * r, WATER_Y + 0.02, d.z + Math.sin(a) * r, Math.random() < 0.5 ? '#8fd0f0' : '#c8ecff', 1, 0.6, 0.15, WATER_Y); } }
  // the shell: a weak call makes every wave bow for a moment; the tuned one opens a lane for good
  calmPulse = Math.max(0, calmPulse - dt * 0.35); openK += ((open() ? 1 : 0) - openK) * Math.min(1, dt * 0.8);
  const bow = Math.sin(Math.min(1, calmPulse) * Math.PI) * 0.9;
  for (const c of crests) {
    const w = Math.sin(T * 1.5 + c.ph), down = c.lane ? openK * 1.3 : openK * 0.25;
    c.g.position.y = c.y0 + w * 0.13 * (1 - bow * 0.8) - bow * 0.45 - down; c.g.rotation.x = 0.12 + 0.12 * Math.sin(T * 1.5 + c.ph + 0.9); c.g.scale.y = (1 + 0.18 * w) * (1 - bow * 0.5) * (c.lane ? 1 - openK * 0.8 : 1);
    c.g.visible = !(c.lane && openK > 0.97);
  }
  const lamp = (far as any).lamp as THREE.Mesh, beam = (far as any).beam as THREE.Group, lit = !!S.flags.faroEncendido;
  const f = lit ? 1.4 + 0.2 * Math.sin(T * 4) : 0.6 + 0.4 * Math.max(0, Math.sin(T * 1.3));
  (lamp.material as THREE.MeshBasicMaterial).color.setRGB(3 * f, 2.4 * f, 1.1 * f);
  beam.visible = lit && nightK > 0.2; beam.rotation.y = T * 0.6;
  for (const b of beam.children) ((b as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.14 * nightK;
}
