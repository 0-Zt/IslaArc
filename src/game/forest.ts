import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { vnoise } from '../core/random';
import { worldGroup, topY, tileAt, landTiles, DIRS, GRASS, type Tile } from '../world/island';
import { addTree, removeTree, trees, type Tree, type TreeType } from '../world/trees';
import { puff } from '../world/particles';
import { modelStump, modelSprout } from '../assets/grove';
import { S, DATA, gain } from './state';
import { emit } from '../core/events';

/* How trees live on the island.
   - Forest zones (dense woods, drawn with a soft green edge) look after themselves: a felled tree
     leaves a stump that sprouts again, and new seedlings spread slowly to free neighbouring cells.
   - Outside the zones nothing grows by itself. A stump stays a stump until the shovel digs it out.
   - Felled trees may drop a seed. The player plants it anywhere; it grows through two seedling
     stages and three tree sizes on a timer.
   Everything that was not part of the original island (regrown, spread or planted) is saved in S.grown. */

const B = () => DATA.BALANCE;
const key = (t: Tile) => `${t.i},${t.j}`;
const addKey = (list: string[], k: string) => { if (!list.includes(k)) list.push(k); };
const dropKey = (list: string[], k: string) => { const i = list.indexOf(k); if (i >= 0) list.splice(i, 1); };

let busy: (t: Tile) => boolean = () => false;
export function setOccupiedTest(fn: (t: Tile) => boolean) { busy = fn; }

/* ---------- forest zones ---------- */
export let forestTiles: Tile[] = [];
export function markForestZone(seed: number) {
  forestTiles = [];
  for (const t of landTiles()) {
    const f = vnoise(t.i, t.j, 4, seed + 21);  // the same noise that makes the woods dense in plantIsland
    t.forest = GRASS.includes(t.type) && !t.ancient && !t.mound && (f > 0.56 || (t.h >= 2 && f > 0.46));
    if (t.forest) forestTiles.push(t);
  }
}

const edgeMat = new THREE.MeshBasicMaterial({ color: '#e4ff9a', transparent: true, opacity: 0.6, depthWrite: false });
let edge: THREE.Mesh | null = null;
/** Dashed green line along the border of each forest zone. */
export function buildForestEdge() {
  if (edge) { worldGroup.remove(edge); edge.geometry.dispose(); edge = null; }
  const parts: THREE.BufferGeometry[] = [];
  for (const t of forestTiles) for (const [a, b] of DIRS) {
    const n = tileAt(t.i + a, t.j + b); if (n && n.forest) continue;
    for (const s of [-0.3, 0, 0.3]) {
      const g = new THREE.BoxGeometry(a ? 0.08 : 0.2, 0.012, a ? 0.2 : 0.08);
      g.translate(t.wx + a * 0.43 + (a ? 0 : s), topY(t) + 0.02, t.wz + b * 0.43 + (b ? 0 : s));
      parts.push(g);
    }
  }
  if (!parts.length) return;
  edge = new THREE.Mesh(mergeGeometries(parts), edgeMat); edge.renderOrder = 3; worldGroup.add(edge);
}
/** The zone edge stands out while the player is planting. */
export function emphasiseForest(on: boolean) { edgeMat.opacity = on ? 0.95 : 0.6; }

/* ---------- stumps ---------- */
interface Regrow { tile: Tile; type: TreeType; at: number }
const queue: Regrow[] = [];
export const stumps = new Map<Tile, THREE.Group>();

function placeStump(tile: Tile, type: TreeType, x = tile.wx, z = tile.wz, rotY = 0) {
  const g = modelStump(type === 'abedul' ? '#d8d0c0' : '#6a3f22');
  g.position.set(x, topY(tile), z); g.rotation.y = rotY;
  g.traverse(o => { o.userData.stumpTile = tile; });
  worldGroup.add(g); stumps.set(tile, g);
  (g as any).treeType = type;
}
function dropStump(tile: Tile) {
  const g = stumps.get(tile); if (!g) return;
  worldGroup.remove(g); stumps.delete(tile); dropKey(S.stumps, key(tile));
  for (let k = queue.length - 1; k >= 0; k--) if (queue[k].tile === tile) queue.splice(k, 1);
}

/* ---------- growing trees ---------- */
// stage 0 and 1: seedling (small, bigger); 2..4: tree of size 0..2
export interface Growth { tile: Tile; type: TreeType; stage: number; at: number; mesh: THREE.Group | null }
export const growing = new Map<Tile, Growth>();
const sprouts: THREE.Group[] = [];
export const sproutMeshes = () => sprouts;

function saveGrowth(g: Growth) {
  const k = S.grown.find(q => q.i === g.tile.i && q.j === g.tile.j);
  if (k) { k.stage = g.stage; k.at = g.at; k.type = g.type; } else S.grown.push({ i: g.tile.i, j: g.tile.j, type: g.type, stage: g.stage, at: g.at });
}
function forgetGrowth(t: Tile) {
  const g = growing.get(t); if (!g) return;
  if (g.mesh) { worldGroup.remove(g.mesh); sprouts.splice(sprouts.indexOf(g.mesh), 1); }
  growing.delete(t); t.sprout = null;
  S.grown = S.grown.filter(q => !(q.i === t.i && q.j === t.j));
}
/** Shows a growth at its stage: a seedling model, or a tree of the right size. */
function showStage(g: Growth, animate: boolean) {
  const t = g.tile;
  if (g.mesh) { worldGroup.remove(g.mesh); sprouts.splice(sprouts.indexOf(g.mesh), 1); g.mesh = null; }
  if (g.stage < 2) {
    t.sprout = g;
    const m = modelSprout(g.type, g.stage === 1);
    m.position.set(t.wx, topY(t), t.wz); m.rotation.y = Math.random() * Math.PI * 2;
    if (animate) m.scale.setScalar(0.3);
    m.traverse(o => { o.userData.sproutTile = t; });
    worldGroup.add(m); sprouts.push(m); g.mesh = m;
  } else {
    t.sprout = null;
    const si = g.stage - 2;
    addTree(t, g.type, si, animate && si === 0, animate && si > 0 ? [0.7, 1, 1.35][si - 1] / [0.7, 1, 1.35][si] : 0);
  }
}
const stageSeconds = (stage: number) => B().saplingStageSeconds * (stage >= 3 ? 1.5 : 1);

/** Starts a seedling on a free tile. */
export function startGrowth(t: Tile, type: TreeType, stage = 0) {
  const g: Growth = { tile: t, type, stage, at: S.time + stageSeconds(stage), mesh: null };
  growing.set(t, g); showStage(g, true); saveGrowth(g);
  puff(t.wx, topY(t) + 0.05, t.wz, '#8ad96b', 6, 1, 0.8, topY(t));
  return g;
}

/** Progress (0..1) of the whole growth from seed to a big tree. */
export function growthProgress(g: Growth) {
  const left = Math.max(0, g.at - S.time) / stageSeconds(g.stage);
  return Math.min(1, (g.stage + 1 - left) / 5);
}

/* ---------- events ---------- */
export function onTreeFallen(t: Tree, now: number) {
  for (let a = 0; a < 3; a++) puff(t.x + Math.sin(t.fallDir) * (0.4 + a * 0.35), t.y + 0.1, t.z + Math.cos(t.fallDir) * (0.4 + a * 0.35), a % 2 ? '#6fc955' : '#c9a06a', 6, 1.4, 1.6, t.y);
  const tile = t.tile;
  forgetGrowth(tile);
  placeStump(tile, t.type, t.x, t.z, t.rotY);
  addKey(S.gone, key(tile)); addKey(S.stumps, key(tile));
  if (tile.forest) {
    const secs = t.feller?.id === 'musgo' ? B().treeRegrowSecondsMusgo : B().treeRegrowSeconds;
    queue.push({ tile, type: t.type, at: now + secs });
  }
  if (Math.random() < B().seedChance[t.si]) {
    gain('semilla', 1, new THREE.Vector3(t.x, t.y + 1.1, t.z));
    if (!S.flags.seedHint) { S.flags.seedHint = true; emit('toast', '¡Una semilla! Plántala donde quieras desde Construir'); }
  }
  emit('forestChanged');
}

/** Digs out a stump (no tree will grow there again) or lifts a seedling (its seed comes back). */
export function removeStump(tile: Tile): 'stump' | 'sprout' | false {
  if (growing.has(tile) && tile.sprout) {
    forgetGrowth(tile);
    puff(tile.wx, topY(tile) + 0.1, tile.wz, '#8ad96b', 8, 1.4, 1.2, topY(tile));
    emit('forestChanged');
    return 'sprout';
  }
  if (!stumps.has(tile)) return false;
  dropStump(tile);
  puff(tile.wx, topY(tile) + 0.1, tile.wz, '#7a5030', 10, 1.8, 1.4, topY(tile));
  emit('forestChanged');
  return 'stump';
}

/** Where a seedling can go (planted by hand or spread by the forest). */
export const canGrowOn = (t: Tile | null) => !!t && GRASS.includes(t.type) && !t.tree && !t.sprout && !t.rock && !t.building && !t.ancient && !t.mound && !t.mark && !stumps.has(t);

let nextSpread = 0;
function spread() {
  if (!forestTiles.length) return;
  const full = forestTiles.filter(t => t.tree || t.sprout).length / forestTiles.length;
  if (full >= B().forestMaxDensity) return;
  const cand = forestTiles.filter(t => canGrowOn(t) && !busy(t) && DIRS.some(([a, b]) => tileAt(t.i + a, t.j + b)?.tree));
  if (!cand.length) return;
  const t = cand[Math.floor(Math.random() * cand.length)];
  const src = DIRS.map(([a, b]) => tileAt(t.i + a, t.j + b)?.tree).find(Boolean) as Tree;
  startGrowth(t, src.type, 0);
  emit('forestChanged');
}

export function tickForest(now: number) {
  // stumps inside a forest sprout again
  for (let k = queue.length - 1; k >= 0; k--) {
    const q = queue[k]; if (now < q.at) continue;
    const t = q.tile;
    if (t.tree || t.building || t.rock || t.mark || busy(t)) { q.at = now + 5; continue; }
    queue.splice(k, 1);
    dropStump(t);
    startGrowth(t, q.type, 1);
    emit('forestChanged');
  }
  // seedlings and young trees grow on the game clock
  for (const g of growing.values()) {
    if (g.stage >= 4 || S.time < g.at) continue;
    if (g.stage === 1 && busy(g.tile)) { g.at = S.time + 3; continue; } // do not grow a trunk through a figure
    if (g.stage >= 2 && !g.tile.tree) continue;                          // being felled
    g.stage++; g.at = S.time + stageSeconds(g.stage);
    showStage(g, true); saveGrowth(g);
    if (g.stage === 2) puff(g.tile.wx, topY(g.tile) + 0.3, g.tile.wz, '#8ad96b', 8, 1.4, 1.2, topY(g.tile));
    emit('forestChanged');
  }
  // seedling meshes pop in
  for (const m of sprouts) if (m.scale.x < 1) m.scale.setScalar(Math.min(1, m.scale.x + 0.04));
  if (S.time >= nextSpread) { if (nextSpread > 0) spread(); nextSpread = S.time + B().forestSpreadSeconds; }
}

/** After the island is regenerated from its seed, re-apply what the player felled, cleared and planted. */
export function restoreForest(now: number) {
  for (const k of S.gone) {
    const [i, j] = k.split(',').map(Number); const t = tileAt(i, j); if (!t) continue;
    const type: TreeType = t.tree?.type || 'roble';
    removeTree(t);
    if (S.stumps.includes(k)) { placeStump(t, type); if (t.forest) queue.push({ tile: t, type, at: now + B().treeRegrowSeconds }); }
  }
  for (const s of S.grown) {
    const t = tileAt(s.i, s.j); if (!t) continue;
    removeTree(t);
    const g: Growth = { tile: t, type: s.type as TreeType, stage: s.stage, at: s.at, mesh: null };
    growing.set(t, g); showStage(g, false);
  }
  nextSpread = 0;
}

export function clearForest() { queue.length = 0; stumps.clear(); growing.clear(); sprouts.length = 0; nextSpread = 0; }
export const forestStats = () => ({ zone: forestTiles.length, trees: forestTiles.filter(t => t.tree).length, sprouts: [...growing.values()].filter(g => g.stage < 2).length, grown: S.grown.length, trees_all: trees.length });
