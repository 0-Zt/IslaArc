import * as THREE from 'three';
import { worldGroup, topY, tileAt, type Tile } from '../world/island';
import { addTree, removeTree, type Tree } from '../world/trees';
import { puff } from '../world/particles';
import { modelStump } from '../assets/grove';
import { S, DATA } from './state';
import { emit } from '../core/events';

/* Felled trees leave a stump and grow back from it. Digging the stump out
   with the shovel keeps that spot clear for good. Both are saved. */

interface Regrow { tile: Tile; type: Tree['type']; at: number }
const queue: Regrow[] = [];
export const stumps = new Map<Tile, THREE.Group>();
let busy: (t: Tile) => boolean = () => false;
export function setOccupiedTest(fn: (t: Tile) => boolean) { busy = fn; }

const key = (t: Tile) => `${t.i},${t.j}`;
const addKey = (list: string[], k: string) => { if (!list.includes(k)) list.push(k); };
const dropKey = (list: string[], k: string) => { const i = list.indexOf(k); if (i >= 0) list.splice(i, 1); };

function placeStump(tile: Tile, type: Tree['type'], x = tile.wx, z = tile.wz, rotY = 0) {
  const g = modelStump(type === 'abedul' ? '#d8d0c0' : '#6a3f22');
  g.position.set(x, topY(tile), z); g.rotation.y = rotY;
  g.traverse(o => { o.userData.stumpTile = tile; });
  worldGroup.add(g); stumps.set(tile, g);
}

export function onTreeFallen(t: Tree, now: number) {
  for (let a = 0; a < 3; a++) puff(t.x + Math.sin(t.fallDir) * (0.4 + a * 0.35), t.y + 0.1, t.z + Math.cos(t.fallDir) * (0.4 + a * 0.35), a % 2 ? '#6fc955' : '#c9a06a', 6, 1.4, 1.6, t.y);
  placeStump(t.tile, t.type, t.x, t.z, t.rotY);
  addKey(S.gone, key(t.tile)); addKey(S.stumps, key(t.tile));
  const secs = t.feller?.id === 'musgo' ? DATA.BALANCE.treeRegrowSecondsMusgo : DATA.BALANCE.treeRegrowSeconds;
  queue.push({ tile: t.tile, type: t.type, at: now + secs });
  emit('forestChanged');
}

/** Digs a stump out: no tree will grow there again. */
export function removeStump(tile: Tile) {
  const g = stumps.get(tile); if (!g) return false;
  worldGroup.remove(g); stumps.delete(tile);
  dropKey(S.stumps, key(tile));
  for (let k = queue.length - 1; k >= 0; k--) if (queue[k].tile === tile) queue.splice(k, 1);
  puff(tile.wx, topY(tile) + 0.1, tile.wz, '#7a5030', 10, 1.8, 1.4, topY(tile));
  emit('forestChanged');
  return true;
}

export function tickForest(now: number) {
  for (let k = queue.length - 1; k >= 0; k--) {
    const q = queue[k]; if (now < q.at) continue;
    const t = q.tile;
    if (t.tree || t.building || t.rock || busy(t)) { q.at = now + 5; continue; }
    queue.splice(k, 1);
    const g = stumps.get(t); if (g) { worldGroup.remove(g); stumps.delete(t); }
    dropKey(S.stumps, key(t)); dropKey(S.gone, key(t));
    addTree(t, q.type, 1, true);
    puff(t.wx, topY(t) + 0.05, t.wz, '#8ad96b', 8, 1.2, 1, topY(t));
  }
}

/** After the island is regenerated from its seed, re-apply what the player felled and cleared. */
export function restoreForest(now: number) {
  for (const k of S.gone) {
    const [i, j] = k.split(',').map(Number); const t = tileAt(i, j); if (!t) continue;
    const type: Tree['type'] = t.tree?.type || 'roble';
    removeTree(t);
    if (S.stumps.includes(k)) { placeStump(t, type); queue.push({ tile: t, type, at: now + DATA.BALANCE.treeRegrowSeconds }); }
  }
}

export function clearForest() { queue.length = 0; stumps.clear(); }
