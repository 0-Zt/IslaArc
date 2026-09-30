import * as THREE from 'three';
import { emit } from '../core/events';
import { rng, hash } from '../core/random';
import { worldGroup, tileAt, topY, landTiles, DIRS, island, N, tileWorld, MAP, type Tile } from '../world/island';
import { puff, smoke } from '../world/particles';
import {
  modelBrokenPillar, modelArch, modelSeaRock, modelBrasero, modelStatueRing, modelHexWalls,
  lavaStrip, trough, runeQuad, runeMesh, runeMat, type Sym, type Design, type Channel,
} from '../assets/ruins';
import { group, setBraseroNext } from '../assets/buildings';
import { buildFigure } from '../assets/characters';
import { MAT } from '../assets/voxel';
import { buildings, createBuilding, isDone, type Building } from './buildings';
import { S, afford, pay, type Cost } from './state';
import { lampK } from '../render/daynight';
import RUINS from '../data/ruins.json';

/* The ruins islet, far out to the north-east.
   A raised platform of old slabs holds five ruined braziers. Each must be rebuilt (a construction
   job) and then lit by solving its puzzle. When the fifth flame burns, six carved walls rise around
   the platform, lava runs down the channels into the ring around the statue, and the statue wakes
   up as Brasa. */

export const BRAZIERS = RUINS.braziers as { name: string; sym: Sym; puzzle: Design; cost: Cost; hint: string }[];
let CI = 0, CJ = 0;
export let center: Tile | null = null;
export const slots: Tile[] = [];                 // brazier tiles, in the order of BRAZIERS
const PLAT = 2.75, EDGE = 4.4;                    // platform radius, islet radius (tiles)

/* ---------- the islet (added right after the island is generated, before trees and rocks) ---------- */
export function buildIslet(seed: number) {
  [CI, CJ] = MAP.islet;
  const r = rng(seed + 808);
  const nearMain = (i: number, j: number) => { for (let b = -3; b <= 3; b++) for (let a = -3; a <= 3; a++) { const t = tileAt(i + a, j + b); if (t && !t.ruin) return true; } return false; };
  for (let dj = -5; dj <= 5; dj++) for (let di = -5; di <= 5; di++) {
    const i = CI + di, j = CJ + dj;
    if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1 || tileAt(i, j) || nearMain(i, j)) continue;
    const d0 = Math.hypot(di, dj), d = d0 + (hash(i, j, 41) - 0.5) * 0.8;
    if (d > EDGE) continue;
    const plat = d0 < PLAT;
    const q = hash(i, j, 43);
    const type = plat ? 'losa' : q < 0.4 ? 'musgo' : q < 0.75 ? 'losa' : q < 0.88 ? 'pasto' : 'piedras';
    const [wx, wz] = tileWorld(i, j);
    island[j][i] = { i, j, h: plat ? 2 : 1, type, variant: Math.floor(r() * 3), rot: Math.floor(r() * 4), wx, wz, ruin: true };
  }
  center = tileAt(CI, CJ);
  slots.length = 0;
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + k * (2 * Math.PI / 5);
    slots.push(tileAt(Math.round(CI + Math.cos(a) * 2), Math.round(CJ + Math.sin(a) * 2))!);
  }
  if (center) center.solid = true;               // the statue
}
export const isIslet = (t: Tile | null) => !!t && !!t.ruin;

/* ---------- props, shrine and statue ---------- */
let props: THREE.Object3D[] = [];
const ruinProps = new Map<number, THREE.Group>();      // brazier slot → ruined brazier (until rebuilt)
let walls: { group: THREE.Group; runes: THREE.MeshBasicMaterial } | null = null;
let ring: { group: THREE.Group; runes: THREE.MeshBasicMaterial; basin: THREE.Mesh } | null = null;
let borderRunes: THREE.MeshBasicMaterial | null = null;
let archRunes: THREE.MeshBasicMaterial | null = null;
let channels: Channel[] = [];
let flow = [0, 0, 0, 0, 0];                            // lava progress in each channel
let statue: THREE.Group | null = null;
let statueMat: THREE.MeshLambertMaterial | null = null;
let statueGlow: THREE.MeshBasicMaterial[] = [];
let statueFlame: THREE.Group | null = null;

function addProp(o: THREE.Object3D) { worldGroup.add(o); props.push(o); return o; }

/** Places everything on the islet according to the saved state. Call after buildings are restored. */
export function spawnRuins() {
  if (!center) return;
  const c = center, y = topY(c);
  const r = rng(99);
  const ring1 = landTiles().filter(t => t.ruin && t.h === 1);
  // the arch at the back (away from the camera), pillars around the edge
  const back = ring1.slice().sort((a, b) => (a.i + a.j) - (b.i + b.j))[0];
  if (back) { const g = modelArch(); g.position.set(back.wx, topY(back), back.wz); g.rotation.y = Math.PI / 4; archRunes = ((g as any).runes as THREE.Mesh).material as THREE.MeshBasicMaterial; g.userData.shrine = true; addProp(g); back.solid = true; }
  let n = 0;
  for (const t of ring1.slice().sort((a, b) => hash(a.i, a.j, 7) - hash(b.i, b.j, 7))) {
    if (t.solid || n >= 5 || Math.abs(t.i - (back?.i ?? 0)) + Math.abs(t.j - (back?.j ?? 0)) < 2) continue;
    if (DIRS.some(([a, b]) => tileAt(t.i + a, t.j + b)?.solid)) continue;
    const g = modelBrokenPillar(t.i * 7 + t.j, n === 0); g.position.set(t.wx, topY(t), t.wz); g.rotation.y = Math.floor(r() * 4) * Math.PI / 2; g.traverse(o => { o.userData.shrine = true; }); addProp(g); t.solid = true; n++;
  }
  // rock stacks in the water around the islet
  for (let k = 0; k < 5; k++) {
    const a = k * 1.26 + 0.4, d = EDGE + 0.9 + (k % 2) * 0.6;
    const [x, z] = tileWorld(CI, CJ);
    const g = modelSeaRock(k * 11 + 3); g.position.set(x + 0.5 + Math.cos(a) * d, 0, z + 0.5 + Math.sin(a) * d); addProp(g);
  }
  // runes carved along the edge of the platform
  const R: THREE.BufferGeometry[] = [];
  for (const t of landTiles()) {
    if (!t.ruin || t.h !== 2) continue;
    for (const [a, b] of DIRS) {
      const nb = tileAt(t.i + a, t.j + b); if (nb && nb.h >= 2) continue;
      if ((t.i + t.j) % 2) continue;   // every other slab, so the carvings read as a pattern
      runeQuad(R, 'glyph', 0.42, t.wx + a * 0.4, topY(t) + 0.006, t.wz + b * 0.4, a ? Math.PI / 2 : 0, true);
    }
  }
  if (R.length) { borderRunes = runeMat(); addProp(runeMesh(R, borderRunes)); }
  // brazier ruins where nothing has been rebuilt yet
  BRAZIERS.forEach((_, k) => { if (!brazierAt(k)) placeRuin(k); });
  // channels from each brazier to the ring around the statue
  const D: THREE.BufferGeometry[] = [];
  channels = []; flow = S.ruins.lit.map(l => (l ? 1 : 0));
  for (const t of slots) {
    const dx = c.wx - t.wx, dz = c.wz - t.wz, d = Math.hypot(dx, dz);
    const x0 = t.wx + dx / d * 0.36, z0 = t.wz + dz / d * 0.36, x1 = c.wx - dx / d * 0.66, z1 = c.wz - dz / d * 0.66;
    trough(D, x0, z0, x1, z1, y + 0.012);
    const ch = lavaStrip(x0, z0, x1, z1, y + 0.028, 0.09); addProp(ch.mesh); channels.push(ch);
  }
  addProp(group({ stone: D }));
  // statue ring and the sitting statue
  ring = modelStatueRing(); ring.group.position.set(c.wx, y, c.wz); ring.group.traverse(o => { o.userData.shrine = true; }); addProp(ring.group);
  makeStatue(c);
  // the hexagon walls, underground until the awakening
  walls = modelHexWalls(3.05); walls.group.position.set(c.wx, topY(c) - 0.5, c.wz); walls.group.traverse(o => { o.userData.shrine = true; }); addProp(walls.group);
  setShrine(S.ruins.awake ? 1 : 0, S.ruins.awake ? 1 : 0, S.ruins.awake ? 1 : 0, S.ruins.awake);
}

/** Brasa as a sitting statue of dark, cold clay. */
function makeStatue(c: Tile) {
  statueMat = (MAT.clay as THREE.MeshLambertMaterial).clone();
  const dummy = new THREE.Texture();
  const fig = buildFigure('brasa', dummy);
  statueGlow = [];
  fig.root.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const mat = m.material as any;
    if (mat.map === dummy) { m.visible = false; return; }              // the blob shadow: it sits on stone
    if (m.material === MAT.clay) m.material = statueMat!;
    else if (mat.isMeshBasicMaterial) { const g = new THREE.MeshBasicMaterial({ color: '#1a1210' }); m.material = g; statueGlow.push(g); }
  });
  fig.ring.visible = false;
  // sit cross-legged: legs folded forward, hands on the knees
  for (const h of fig.hips) { h.rotation.x = -1.45; h.rotation.z = h.position.x > 0 ? -0.35 : 0.35; }
  fig.arms.forEach((a, k) => { a.rotation.x = -0.7; a.rotation.z = k ? 0.25 : -0.25; });
  fig.body.position.y = -0.16;
  statueFlame = fig.flame || null; if (statueFlame) statueFlame.visible = false;
  statue = fig.root; statue.scale.setScalar(1.15); statue.rotation.y = Math.PI / 4;
  statue.position.set(c.wx, topY(c) + 0.1, c.wz);
  statue.traverse(o => { o.userData.shrine = true; });
  addProp(statue);
}

function brazierAt(k: number) { return buildings.find(b => b.type === 'brasero' && b.tiles[0] === slots[k]) || null; }
function placeRuin(k: number) {
  const t = slots[k]; if (!t) return;
  const m = modelBrasero(BRAZIERS[k].puzzle, BRAZIERS[k].sym, true);
  m.group.position.set(t.wx, topY(t), t.wz); m.group.rotation.y = braziersFacing(t);
  m.accent.color.setRGB(0.12, 0.3, 0.28);
  m.group.traverse(o => { o.userData.ruinSlot = k; });
  addProp(m.group); ruinProps.set(k, m.group); t.solid = true;
}
/** Braziers turn their front (rune side) toward the camera-facing side, slightly toward the centre. */
function braziersFacing(t: Tile) { if (!center) return 0; return Math.round(Math.atan2(t.wx - center.wx, t.wz - center.wz) / (Math.PI / 2)) * Math.PI / 2; }
export const ruinPropMeshes = () => [...ruinProps.values()];
export const shrineMeshes = () => props.filter(o => o.userData.shrine);

/** Walls height (0 underground → 1 risen), glow of the runes and the basin (0..1), statue awakening (0..1). */
function setShrine(rise: number, glow: number, wake: number, done: boolean) {
  if (!center) return;
  if (walls) { walls.group.visible = rise > 0.001; walls.group.position.y = topY(center) - 0.5 - 1.7 * (1 - rise); walls.runes.color.setRGB(0.4 + 2.4 * glow, 0.2 + 0.9 * glow, 0.08 + 0.18 * glow); }
  const edge = 0.35 + 0.12 * S.ruins.lit.filter(Boolean).length;
  const g = Math.max(glow, 0);
  for (const m of [borderRunes, archRunes, ring?.runes]) if (m) m.color.setRGB(edge * 0.8 + 0.9 * g, edge * 0.38 + 0.4 * g, edge * 0.14 + 0.08 * g);
  if (ring) ring.basin.visible = glow > 0.5;
  // cold: plain grey-brown stone; as it wakes the stone warms into Brasa's own ember clay
  if (statueMat) {
    const clay = wake > 0.5;
    if (statueMat.vertexColors !== clay) { statueMat.vertexColors = clay; statueMat.needsUpdate = true; }
    if (clay) { const k = (wake - 0.5) * 2; statueMat.color.setRGB(0.6 + 0.48 * k, 0.5 + 0.58 * k, 0.45 + 0.63 * k); }
    else statueMat.color.setRGB(0.42 + 0.3 * wake, 0.38 + 0.1 * wake, 0.33);
  }
  for (const m of statueGlow) m.color.setRGB(0.28 + 2.3 * wake, 0.25 + 0.72 * wake, 0.22 - 0.06 * wake); // cracks: stone-coloured while asleep
  if (statueFlame) statueFlame.visible = wake > 0.6;
  if (statue) statue.visible = !done;
  if (done && center) center.solid = false;
}

/* ---------- rebuilding and lighting ---------- */
export function slotOf(t: Tile) { return slots.indexOf(t); }
/** Pays for a brazier and turns its ruin into a construction job. */
export function rebuildBrazier(k: number): Building | string {
  const d = BRAZIERS[k], t = slots[k];
  if (brazierAt(k)) return 'Ese brasero ya está en obra';
  if (!afford(d.cost)) return 'Te faltan materiales';
  pay(d.cost);
  const g = ruinProps.get(k); if (g) { worldGroup.remove(g); ruinProps.delete(k); props.splice(props.indexOf(g), 1); }
  t.solid = false;
  setBraseroNext(d.puzzle, d.sym);
  const b = createBuilding('brasero', t.i, t.j, 0, true)!;
  b.group.rotation.y = braziersFacing(t);
  emit('changed');
  return b;
}
/** Before restoring a saved brazier: tells the model factory which design it is. */
export function prepareBrazier(i: number, j: number) { const k = slots.findIndex(t => t.i === i && t.j === j); if (k >= 0) setBraseroNext(BRAZIERS[k].puzzle, BRAZIERS[k].sym); }
/** After loading, rebuilt braziers face the right way. */
export function fixBrazierModels() {
  for (const b of buildings) if (b.type === 'brasero') { const k = slotOf(b.tiles[0]); if (k >= 0) b.group.rotation.y = braziersFacing(b.tiles[0]); }
}
export function lightFlame(k: number) {
  if (S.ruins.lit[k]) return;
  S.ruins.lit[k] = true;
  const t = slots[k];
  puff(t.wx, topY(t) + 0.8, t.wz, '#ffb040', 18, 2.4, 1.4);
  emit('toast', `${BRAZIERS[k].name}: ¡encendida! (${litCount()}/5)`);
  emit('flameLit', k); emit('changed');
  if (S.ruins.lit.every(Boolean)) setTimeout(startFinale, 1800);
}
export const litCount = () => S.ruins.lit.filter(Boolean).length;

/* ---------- the awakening ---------- */
let finale: { t: number } | null = null;
function startFinale() { if (S.ruins.awake || finale) return; finale = { t: 0 }; emit('finaleStart', center); }
export const finaleRunning = () => !!finale;

let fireAcc = 0;
export function tickRuins(dt: number) {
  if (!center) return;
  fireAcc += dt;
  const now = performance.now();
  // braziers: fire and embers when lit, cold teal accents when not
  for (const b of buildings) {
    if (b.type !== 'brasero') continue;
    const k = slotOf(b.tiles[0]); const lit = k >= 0 && S.ruins.lit[k] && isDone(b);
    const f = lit ? 1.5 + 0.4 * Math.sin(now / 90 + k) + 0.25 * Math.sin(now / 37 + k * 2) : 0.03;
    if (b.glow) (b.glow.material as THREE.MeshBasicMaterial).color.setRGB(2.4 * f, 0.9 * f, 0.2 * f);
    const accent = (b.group as any).accent as THREE.MeshBasicMaterial | undefined;
    if (accent) { if (lit) accent.color.setRGB(2.2, 0.85, 0.2); else accent.color.setRGB(0.22, 0.62 + 0.1 * Math.sin(now / 600 + k), 0.58); }
    const rune = (b.group as any).rune as THREE.Mesh | undefined;
    if (rune) (rune.material as THREE.MeshBasicMaterial).color.setRGB(lit ? 2.2 : 0.45, lit ? 0.9 : 0.22, lit ? 0.25 : 0.1);
    if (lit && fireAcc > 0.05) { const t = b.tiles[0]; smoke(t.wx + (Math.random() - 0.5) * 0.16, topY(t) + 0.7, t.wz + (Math.random() - 0.5) * 0.16, Math.random() < 0.6 ? '#ffb040' : '#ff7020', 0.06, 0.55); }
    if (b.light) { (b.light.material as THREE.MeshBasicMaterial).opacity = lit ? 0.12 + 0.25 * lampK : 0; b.light.visible = lit; b.light.scale.setScalar(0.65); }
  }
  if (fireAcc > 0.05) fireAcc = 0;
  // lava runs down the channel of each lit brazier
  channels.forEach((c, k) => {
    const target = S.ruins.lit[k] ? 1 : 0;
    flow[k] += Math.sign(target - flow[k]) * Math.min(Math.abs(target - flow[k]), dt / 1.6);
    c.mesh.visible = flow[k] > 0.01; c.mesh.scale.z = Math.max(0.001, flow[k]);
  });
  if (!finale) { if (!S.ruins.awake) setShrine(0, 0, 0, false); return; }
  // the awakening, about ten seconds long
  finale.t += dt;
  const T = finale.t;
  const rise = Math.min(1, Math.max(0, (T - 1) / 3.2));
  const glow = Math.min(1, Math.max(0, (T - 4.4) / 1.6));
  const wake = Math.min(1, Math.max(0, (T - 6.2) / 2.4));
  const e = rise * rise * (3 - 2 * rise);
  setShrine(e, glow, wake, false);
  if (T > 1 && T < 4.3 && Math.random() < dt * 16) { const a = Math.random() * 6.28; puff(center.wx + Math.cos(a) * 3, topY(center) - 0.2, center.wz + Math.sin(a) * 3, '#c8c0b0', 4, 1.8, 1.6); }
  if (T > 6.2 && T < 8.8 && Math.random() < dt * 12 && statue) { puff(statue.position.x, statue.position.y + 0.7, statue.position.z, '#ffb040', 3, 1.8, 1); }
  if (T > 9.4) {
    finale = null;
    S.ruins.awake = true; S.flags.brasaFree = true;
    setShrine(1, 1, 1, true);
    puff(center.wx, topY(center) + 0.6, center.wz, '#ffd070', 24, 2.6, 1.8);
    emit('brasaAwake', center);
    emit('changed');
  }
}

/** Where Brasa steps out: the centre of the ring, where the statue sat. */
export const brasaSpot = () => center;

export function clearRuins() {
  for (const o of props) worldGroup.remove(o);
  props = []; ruinProps.clear(); walls = null; ring = null; statue = null; statueMat = null; statueGlow = []; statueFlame = null;
  borderRunes = null; archRunes = null; channels = []; finale = null;
}

/** Is there a walking path from the island to the islet? Checked when the island grows. */
export function checkReach(from: Tile | null, bfs: (a: Tile, goal: (t: Tile) => boolean) => Tile[] | null, quiet = false) {
  if (!from || S.flags.islote) return;
  if (bfs(from, t => !!t.ruin)) { S.flags.islote = true; if (!quiet) emit('toast', 'Ya se puede caminar hasta el islote de las ruinas'); emit('changed'); }
}
