import * as THREE from 'three';
import { emit } from '../core/events';
import { worldGroup, topY, tileAt, GRASS, type Tile } from '../world/island';
import { modelPlantMark, modelPathMark } from '../assets/grove';
import { puff } from '../world/particles';
import type { TreeType } from '../world/trees';
import { canGrowOn, startGrowth, stumps, emphasiseForest } from './forest';
import { S } from './state';

/* Orders the player draws on the island and figures carry out one after another:
   planting a seed, or digging a grass cell into a dirt path. */

export type MarkKind = 'plant' | 'path';
export interface Mark { tile: Tile; kind: MarkKind; type?: TreeType; group: THREE.Group }
export const marks: Mark[] = [];

function makeMark(tile: Tile, kind: MarkKind, type?: TreeType) {
  const g = kind === 'plant' ? modelPlantMark() : modelPathMark();
  g.position.set(tile.wx, topY(tile), tile.wz);
  const m: Mark = { tile, kind, type, group: g };
  g.traverse(o => { o.userData.mark = m; });
  worldGroup.add(g); marks.push(m); tile.mark = m;
  return m;
}
function saveMarks() { S.marks = marks.map(m => ({ i: m.tile.i, j: m.tile.j, kind: m.kind, type: m.type })); emit('marksChanged'); }

export const canPath = (t: Tile | null) => !!t && GRASS.includes(t.type) && !t.tree && !t.sprout && !t.rock && !t.building && !t.ancient && !t.mound && !t.mark && !stumps.has(t);

/** Adds or removes a mark on a tile while a mode is active. Returns a message for the player, if any. */
export function toggleMark(tile: Tile, kind: MarkKind, type?: TreeType): string | null {
  const cur: Mark | undefined = tile.mark;
  if (cur) {
    if (cur.kind !== kind) return 'Esa casilla ya tiene otra orden';
    removeMark(cur, true); return null;
  }
  if (kind === 'plant') {
    if (!canGrowOn(tile)) return tile.type === 'sendero' || tile.type === 'tierra' || tile.type === 'arena' ? 'Las semillas necesitan pasto' : 'Ahí no cabe un árbol';
    if (S.res.semilla < 1) return 'No te quedan semillas. Salen al talar árboles.';
    S.res.semilla--; emit('changed');
  } else if (!canPath(tile)) return tile.type === 'sendero' ? 'Ahí ya hay sendero' : 'Solo se puede hacer sendero sobre pasto libre';
  makeMark(tile, kind, type);
  puff(tile.wx, topY(tile) + 0.05, tile.wz, kind === 'plant' ? '#8ad96b' : '#d8c8a0', 4, 0.8, 0.6, topY(tile));
  saveMarks();
  return null;
}
export function removeMark(m: Mark, refund = false) {
  worldGroup.remove(m.group); marks.splice(marks.indexOf(m), 1); m.tile.mark = null;
  if (refund && m.kind === 'plant') { S.res.semilla++; emit('changed'); }
  saveMarks();
}

/** A figure finished the work on a mark. */
export function completeMark(m: Mark, by?: string) {
  const t = m.tile;
  removeMark(m);
  // Musgo's green thumb: his seedlings start a stage ahead
  if (m.kind === 'plant') { startGrowth(t, m.type || 'roble', by === 'musgo' ? 1 : 0); emit('planted'); emit('forestChanged'); }
  else { setPath(t); emit('pathsChanged', t); }
}

export function setPath(t: Tile) {
  t.type = 'sendero'; t.rot = 0;
  const k = `${t.i},${t.j}`; if (!S.paths.includes(k)) S.paths.push(k);
}
/** Paths change tile types, so they are applied before the terrain is built. */
export function restorePaths() { for (const k of S.paths) { const [i, j] = k.split(',').map(Number); const t = tileAt(i, j); if (t) { t.type = 'sendero'; t.rot = 0; } } }
export function restoreMarks() { for (const q of S.marks) { const t = tileAt(q.i, q.j); if (t && !t.mark) makeMark(t, q.kind, q.type as TreeType); } }
export function clearMarks() { for (const m of marks) { worldGroup.remove(m.group); m.tile.mark = null; } marks.length = 0; }

/** Nearest open mark of a kind that no other figure is taking care of. */
export function nearestMark(from: Tile, kind: MarkKind, taken: (t: Tile) => boolean, max = 10) {
  let best: Mark | null = null, bd = 1e9;
  for (const m of marks) {
    if (m.kind !== kind || taken(m.tile)) continue;
    const d = Math.abs(m.tile.i - from.i) + Math.abs(m.tile.j - from.j);
    if (d < bd && d <= max) { bd = d; best = m; }
  }
  return best;
}

/* ---------- drawing mode ---------- */
export let markMode: { kind: MarkKind; type?: TreeType } | null = null;
export function enterMarkMode(kind: MarkKind, type?: TreeType) {
  markMode = { kind, type }; emphasiseForest(kind === 'plant'); emit('markMode', markMode);
}
export function exitMarkMode() {
  if (!markMode) return;
  markMode = null; emphasiseForest(false); emit('markMode', null);
}
