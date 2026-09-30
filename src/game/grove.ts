import * as THREE from 'three';
import { grove, worldGroup, topY, type Tile } from '../world/island';
import { modelAncientTree, modelMound } from '../assets/grove';
import { puff, smoke } from '../world/particles';
import { S, DATA } from './state';

/* The secret clearing: Musgo lies buried, walled in by ancient trees that only a metal axe can cut. */

export interface Ancient { tile: Tile; group: THREE.Group; hp: number; shake: number; falling: number; fallDir: number }
export interface Mound { tile: Tile; group: THREE.Group; hits: number; shake: number }
export const ancients: Ancient[] = [];
export let mound: Mound | null = null;

const key = (t: Tile) => `anc_${t.i}_${t.j}`;

export function spawnGrove() {
  ancients.length = 0; mound = null;
  if (!grove) return;
  const c = grove.center;
  grove.ring.forEach((t, k) => {
    const orth = Math.abs(t.i - c.i) + Math.abs(t.j - c.j) === 1;
    if (!orth) return; // corners stay open: a mossy floor that lets light into the clearing
    if (S.flags[key(t)]) return;
    const g = modelAncientTree(4100 + k * 7);
    g.position.set(t.wx, topY(t), t.wz); g.rotation.y = Math.atan2(t.wx - c.wx, t.wz - c.wz); // canopy leans outward
    worldGroup.add(g);
    const a: Ancient = { tile: t, group: g, hp: DATA.BALANCE.ancientTreeHits, shake: 0, falling: 0, fallDir: 0 };
    g.traverse(o => { o.userData.ancient = a; });
    t.ancient = a; ancients.push(a);
  });
  if (!S.flags.musgoFree) {
    const g = modelMound(); g.position.set(c.wx, topY(c), c.wz); worldGroup.add(g);
    mound = { tile: c, group: g, hits: 0, shake: 0 };
    g.traverse(o => { o.userData.mound = mound; });
    c.mound = mound;
  }
}

/** Returns 'bounce' without a metal axe, 'hit' while it stands, 'felled' when it starts to fall. */
export function hitAncient(a: Ancient, from: THREE.Vector3, metal: boolean): 'bounce' | 'hit' | 'felled' {
  const p = a.group.position;
  if (!metal) { a.shake = 0.35; puff(p.x, p.y + 0.5, p.z, '#fff4c0', 6, 2, 1.6, p.y); return 'bounce'; }
  a.shake = 1; a.hp--;
  puff(p.x, p.y + 0.4, p.z, '#8a6a4a', 6, 1.8, 1.4, p.y);
  if (a.hp > 0) return 'hit';
  a.falling = 0.001; a.fallDir = Math.atan2(p.x - from.x, p.z - from.z);
  S.flags[key(a.tile)] = true; S.flags.claroAbierto = true; S.ancientLeft = ancients.filter(x => !x.falling).length;
  return 'felled';
}

/** Returns true when the figure is fully dug out. */
export function digMound(): boolean {
  if (!mound) return false;
  mound.hits++; mound.shake = 1;
  const p = mound.group.position;
  puff(p.x, p.y + 0.2, p.z, '#7a5030', 8, 1.8, 1.6, p.y);
  if (mound.hits < DATA.BALANCE.moundDigHits) return false;
  worldGroup.remove(mound.group); mound.tile.mound = null; mound = null;
  S.flags.musgoFree = true;
  return true;
}

export function tickGrove(dt: number, T: number) {
  for (const a of ancients.slice()) {
    a.shake = Math.max(0, a.shake - dt * 2.4);
    const g = a.group;
    if (a.falling) {
      a.falling = Math.min(1, a.falling + dt * 0.9);
      const k = a.falling * a.falling * 1.5;
      g.rotation.set(Math.cos(a.fallDir) * k, g.rotation.y, -Math.sin(a.fallDir) * k);
      if (a.falling >= 1) {
        const p = g.position;
        for (let s = 0; s < 4; s++) puff(p.x + Math.sin(a.fallDir) * (0.5 + s * 0.4), p.y + 0.1, p.z + Math.cos(a.fallDir) * (0.5 + s * 0.4), s % 2 ? '#3a7438' : '#8a6a4a', 8, 1.5, 1.8, p.y);
        worldGroup.remove(g); a.tile.ancient = null; ancients.splice(ancients.indexOf(a), 1);
      }
    } else {
      const s = Math.sin(T * 36) * a.shake * 0.04;
      g.rotation.x = s; g.rotation.z = s * 0.6;
    }
  }
  if (mound && Math.random() < dt * 3) { const p = mound.group.position; smoke(p.x + (Math.random() - 0.5) * 0.4, p.y + 0.4, p.z + (Math.random() - 0.5) * 0.4, Math.random() < 0.5 ? '#c8ff9a' : '#fff4a0', 0.03, 1.4); }
  if (mound) { mound.shake = Math.max(0, mound.shake - dt * 3); const s = 1 + Math.sin(T * 40) * mound.shake * 0.05; mound.group.scale.set(s, 1 - mound.shake * 0.06, s); }
}
