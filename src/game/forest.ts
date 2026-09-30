import { worldGroup, topY, type Tile } from '../world/island';
import { addTree, type Tree } from '../world/trees';
import { puff } from '../world/particles';
import { modelStump } from '../assets/grove';
import { DATA } from './state';

/* Felled trees leave a stump; a sapling grows back after a while. */

interface Regrow { tile: Tile; type: Tree['type']; at: number }
const queue: Regrow[] = [];
let busy: (t: Tile) => boolean = () => false;
export function setOccupiedTest(fn: (t: Tile) => boolean) { busy = fn; }

export function onTreeFallen(t: Tree, now: number) {
  const p = { x: t.x, y: t.y, z: t.z };
  for (let a = 0; a < 3; a++) puff(p.x + Math.sin(t.fallDir) * (0.4 + a * 0.35), p.y + 0.1, p.z + Math.cos(t.fallDir) * (0.4 + a * 0.35), a % 2 ? '#6fc955' : '#c9a06a', 6, 1.4, 1.6, p.y);
  const stump = modelStump(t.type === 'abedul' ? '#d8d0c0' : '#6a3f22');
  stump.position.set(t.x, t.y, t.z); stump.rotation.y = t.rotY;
  worldGroup.add(stump); (t.tile as any).stump = stump;
  const secs = t.feller?.id === 'musgo' ? DATA.BALANCE.treeRegrowSecondsMusgo : DATA.BALANCE.treeRegrowSeconds;
  queue.push({ tile: t.tile, type: t.type, at: now + secs });
}

export function tickForest(now: number) {
  for (let k = queue.length - 1; k >= 0; k--) {
    const q = queue[k]; if (now < q.at) continue;
    const t = q.tile;
    if (t.tree || t.building || t.rock || busy(t)) { q.at = now + 5; continue; }
    queue.splice(k, 1);
    const st = (t as any).stump; if (st) { worldGroup.remove(st); (t as any).stump = null; }
    addTree(t, q.type, 1, true);
    puff(t.wx, topY(t) + 0.05, t.wz, '#8ad96b', 8, 1.2, 1, topY(t));
  }
}
export function clearForest() {
  queue.length = 0;
}
