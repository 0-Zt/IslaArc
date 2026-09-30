import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, hash } from '../core/random';
import { vbox, MAT } from '../assets/voxel';
import { worldGroup, landTiles, topY, grove, type Tile } from './island';

/* Quarry rocks: stone with blue ore veins. Infinite source of stone and mineral. */

function rockGeo(seed: number) {
  const r = rng(seed); const L: THREE.BufferGeometry[] = [];
  ([[0, 0.2, 0, 0.62, 0.4, 0.56, '#9a948a'], [0.17, 0.45, -0.06, 0.4, 0.24, 0.36, '#aaa498'], [-0.2, 0.15, 0.18, 0.34, 0.26, 0.3, '#8a847a'], [0.24, 0.12, 0.22, 0.26, 0.2, 0.24, '#a49e92']] as const)
    .forEach(([x, y, z, sx, sy, sz, c]) => vbox(L, x + (r() - 0.5) * 0.06, y, z + (r() - 0.5) * 0.06, sx, sy, sz, c));
  vbox(L, 0.17, 0.575, -0.06, 0.3, 0.02, 0.26, '#c8c2b6');
  for (let k = 0; k < 7; k++) {
    const f = Math.floor(r() * 3), y = 0.1 + r() * 0.3, a = (r() - 0.5) * 0.4;
    if (f === 0) vbox(L, 0.32, y, a, 0.04, 0.06, 0.06, '#5ab8ff'); else if (f === 1) vbox(L, a, y, 0.29, 0.06, 0.06, 0.04, '#5ab8ff'); else vbox(L, -0.32, y, a, 0.04, 0.06, 0.06, '#8fd4ff');
  }
  return mergeGeometries(L);
}
const GEOS = [0, 1, 2].map(k => rockGeo(900 + k * 17));
export const rocks: THREE.Mesh[] = [];

export function placeRocks(seed: number, count = 5) {
  const r = rng(seed + 303); rocks.length = 0;
  const far = (t: Tile) => !grove || Math.abs(t.i - grove.center.i) + Math.abs(t.j - grove.center.j) > 3;
  const cand = landTiles().filter(t => (t.type === 'piedras' || t.type === 'tierra') && !t.tree && far(t))
    .sort((a, b) => hash(a.i, a.j, seed) - hash(b.i, b.j, seed));
  const chosen: Tile[] = [];
  const spaced = (t: Tile) => !chosen.some(o => Math.abs(o.i - t.i) + Math.abs(o.j - t.j) < 3);
  for (const t of cand) { if (chosen.length >= count) break; if (spaced(t)) chosen.push(t); }
  if (chosen.length < 3) {
    const extra = landTiles().filter(t => t.type !== 'arena' && t.type !== 'musgo' && !t.tree && far(t)).sort((a, b) => hash(a.i, a.j, 5) - hash(b.i, b.j, 5));
    for (const t of extra) { if (chosen.length >= 3) break; if (spaced(t)) chosen.push(t); }
  }
  chosen.forEach((t, k) => {
    t.type = 'piedras';
    const m = new THREE.Mesh(GEOS[k % 3], MAT.stone);
    m.castShadow = true; m.receiveShadow = true;
    m.position.set(t.wx, topY(t), t.wz); m.rotation.y = Math.floor(r() * 4) * Math.PI / 2;
    m.userData = { tile: t, shake: 0 };
    worldGroup.add(m); t.rock = m; rocks.push(m);
  });
}

export function tickRocks(dt: number, T: number) {
  for (const m of rocks) {
    const u = m.userData; u.shake = Math.max(0, u.shake - dt * 4);
    const s = 1 + Math.sin(T * 50) * u.shake * 0.025; m.scale.set(s, 1 - u.shake * 0.03, s);
  }
}
