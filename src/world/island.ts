import * as THREE from 'three';
import { scene } from '../render/renderer';
import { rng, hash, vnoise, pick } from '../core/random';
import { LEVEL, topMat, sideMatFor, SIDE_MAT } from './tiles';

export const N = 44;          // grid size: room for the sea, expansions, a bridge and the ruins islet
// The main island is generated on a 30×30 grid (as in v0.7) and set in the middle of this one,
// so it keeps the same shape, trees and rocks. Saves from v0.7 are shifted by OFF (see state.ts).
const G0 = 30;
export const OFF = (N - G0) / 2;
const GRID = N;
const R = 10.6;               // island radius in tiles

export interface Tile {
  i: number; j: number; h: number;
  type: string; variant: number; rot: number;
  wx: number; wz: number;
  tree?: any; rock?: THREE.Mesh | null; building?: any; ancient?: any; mound?: any;
  proxy?: THREE.Mesh;
  forest?: boolean;   // inside a forest zone: trees regrow and spread here on their own
  sprout?: any;       // a seedling still growing into a tree
  mark?: any;         // a planting or path order waiting for a figure
  solid?: boolean;    // ruins and statues: cannot be walked through
  ruin?: boolean;     // part of the ruins islet
}

export let island: (Tile | null)[][] = [];
export let grove: { center: Tile; ring: Tile[] } | null = null;
export const worldGroup = new THREE.Group();
scene.add(worldGroup);

export const tileAt = (i: number, j: number): Tile | null => (island[j] && island[j][i]) || null;
export const tileUnder = (x: number, z: number) => tileAt(Math.floor(x + N / 2), Math.floor(z + N / 2));
export const topY = (t: Tile) => t.h * LEVEL;
export function landTiles() { const a: Tile[] = []; for (const row of island) for (const t of row) if (t) a.push(t); return a; }
export const blocked = (t: Tile | null) => !t || !!t.tree || !!t.rock || !!t.building || !!t.ancient || !!t.mound || !!t.solid;
/** Grid coordinates as they were on the original 30×30 map: noise keyed on these keeps the island identical. */
export const oi = (t: Tile) => t.i - OFF, oj = (t: Tile) => t.j - OFF;
export const GRASS = ['pasto', 'matas', 'flores', 'trebol'];
export const walkable = (t: Tile | null) => !blocked(t);
export const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const tileWorld = (i: number, j: number): [number, number] => [i - N / 2 + 0.5, j - N / 2 + 0.5];
export const inGrid = (i: number, j: number) => i >= 1 && j >= 1 && i < N - 1 && j < N - 1;
/** Water cell next to land, inside the grid: a place the island can grow into. */
export const canExpand = (i: number, j: number) => inGrid(i, j) && !tileAt(i, j) && DIRS.some(([a, b]) => tileAt(i + a, j + b));
/** Turns a water cell into new flat land. The caller rebuilds the terrain. */
export function addLand(i: number, j: number, type: string) {
  const [wx, wz] = tileWorld(i, j);
  const t: Tile = { i, j, h: 1, type, variant: Math.floor(Math.random() * 3), rot: Math.floor(Math.random() * 4), wx, wz };
  island[j][i] = t;
  return t;
}

/* ---------- generation ---------- */
export function generate(seed: number) {
  const N = G0; // everything below runs on the original grid; the result is shifted into place at the end
  const r = rng(seed), g: (Tile | null)[][] = [], c = (N - 1) / 2;
  for (let j = 0; j < N; j++) {
    g[j] = [];
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(i - c, j - c) / R + (vnoise(i + seed, j, 4.5, seed) - 0.5) * 0.4;
      if (d >= 1) { g[j][i] = null; continue; }
      const hn = vnoise(i, j + seed, 5, seed + 3);
      let h = 1; if (d < 0.72 && hn > 0.6) h = 2; if (d < 0.6 && hn > 0.74) h = 3;
      let type = 'pasto';
      const pn = vnoise(i, j, 3.3, seed + 9), rr = r();
      if (pn > 0.7) type = pn > 0.78 ? 'piedras' : 'tierra';
      else if (vnoise(i, j, 4, seed + 5) > 0.64) type = 'matas';
      else if (rr < 0.13) type = 'flores'; else if (rr < 0.2) type = 'trebol';
      const [wx, wz] = [i - N / 2 + 0.5, j - N / 2 + 0.5];
      g[j][i] = { i, j, h, type, variant: Math.floor(r() * 3), rot: Math.floor(r() * 4), wx, wz };
    }
  }
  // fill holes and narrow bays
  for (let pass = 0; pass < 2; pass++) for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    if (g[j][i]) continue;
    const nb = [g[j - 1][i], g[j + 1][i], g[j][i - 1], g[j][i + 1]].filter(Boolean);
    if (nb.length >= 3 || (nb.length >= 1 && Math.hypot(i - c, j - c) < R * 0.78)) {
      const [wx, wz] = [i - N / 2 + 0.5, j - N / 2 + 0.5];
      g[j][i] = { i, j, h: 1, type: 'pasto', variant: Math.floor(r() * 3), rot: Math.floor(r() * 4), wx, wz };
    }
  }
  // tilled plot
  outer: for (let t = 0; t < 80; t++) {
    const i0 = 5 + Math.floor(r() * (N - 11)), j0 = 5 + Math.floor(r() * (N - 11)); const cells: Tile[] = [];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) { const q = g[j0 + b] && g[j0 + b][i0 + a]; if (!q || q.h !== 1) continue outer; cells.push(q); }
    cells.forEach(q => { q.type = 'arada'; q.rot = 0; }); break;
  }
  // winding path
  let pi = Math.round(c), pj = Math.round(c); const dir = pick(r, [[1, 0], [0, 1]] as [number, number][]);
  for (let s = 0; s < 50; s++) {
    const q = g[pj] && g[pj][pi]; if (!q) break;
    if (q.type !== 'arada') q.type = 'sendero';
    if (r() < 0.3) { const side = r() < 0.5 ? [dir[1], dir[0]] : [-dir[1], -dir[0]]; pi += side[0]; pj += side[1]; } else { pi += dir[0]; pj += dir[1]; }
  }
  // beach on the south-east shore, facing the camera
  for (const row of g) for (const q of row) {
    if (!q) continue;
    let near = 9;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const a = g[q.j + dj] && g[q.j + dj][q.i + di]; if (!a) near = Math.min(near, Math.abs(di) + Math.abs(dj)); }
    const dot = (q.i - c) * 0.707 + (q.j - c) * 0.707;
    if (near <= 2 && dot > R * 0.4) { q.type = 'arena'; q.h = 1; q.rot = Math.floor(r() * 4); }
  }
  // the grove: a flat mossy clearing in the far north-west, reserved for a secret
  let best: Tile | null = null, bd = 1e9;
  const target = [c - R * 0.52, c - R * 0.52];
  for (const row of g) for (const q of row) {
    if (!q) continue;
    const ok = [[0, 0], ...DIRS, [1, 1], [-1, -1], [1, -1], [-1, 1]].every(([a, b]) => g[q.j + b] && g[q.j + b][q.i + a]);
    if (!ok) continue;
    const d = Math.hypot(q.i - target[0], q.j - target[1]); if (d < bd) { bd = d; best = q; }
  }
  grove = null;
  if (best) {
    const ring: Tile[] = [];
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const q = g[best.j + b][best.i + a]!; q.h = 1; q.type = a === 0 && b === 0 ? 'musgo' : 'musgo'; q.rot = Math.floor(r() * 4);
      if (a !== 0 || b !== 0) ring.push(q);
    }
    // soften the clearing's edge
    for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) { const q = g[best.j + b] && g[best.j + b][best.i + a]; if (q && (Math.abs(a) === 2 || Math.abs(b) === 2)) { q.h = Math.min(q.h, 2); if (q.type === 'arena') continue; if (hash(q.i, q.j, 3) < 0.5) q.type = 'musgo'; } }
    grove = { center: best, ring };
  }
  // set the island in the middle of the bigger grid
  const big: (Tile | null)[][] = [];
  for (let j = 0; j < GRID; j++) big[j] = new Array(GRID).fill(null);
  for (const row of g) for (const q of row) { if (!q) continue; q.i += OFF; q.j += OFF; [q.wx, q.wz] = tileWorld(q.i, q.j); big[q.j][q.i] = q; }
  island = big;
  return big;
}

/* ---------- terrain mesh: visible faces only, one merged mesh per material ---------- */
type Bucket = { pos: number[]; nor: number[]; uv: number[]; col: number[]; idx: number[] };
let terrainMeshes: THREE.Mesh[] = [];
export const tileProxies: THREE.Mesh[] = [];
const proxyGroup = new THREE.Group();
proxyGroup.visible = false; // invisible, but still hit by the raycaster
scene.add(proxyGroup);
const proxyGeo = new Map<number, THREE.BoxGeometry>();
const proxyMat = new THREE.MeshBasicMaterial();

function quad(b: Bucket, cx: number, cy: number, cz: number, n: number[], right: number[], up: number[], hw: number, hh: number, rot = 0, ao = [1, 1, 1, 1]) {
  const base = b.pos.length / 3;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let k = 0; k < 4; k++) {
    const [a, c] = corners[k];
    b.pos.push(cx + right[0] * a * hw + up[0] * c * hh, cy + right[1] * a * hw + up[1] * c * hh, cz + right[2] * a * hw + up[2] * c * hh);
    b.nor.push(n[0], n[1], n[2]);
    const [u, v] = uvs[(k + rot) % 4];
    b.uv.push(u, v);
    b.col.push(ao[k], ao[k], ao[k]);
  }
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

export function buildTerrain() {
  for (const m of terrainMeshes) { worldGroup.remove(m); m.geometry.dispose(); }
  terrainMeshes = [];
  const buckets = new Map<THREE.Material, Bucket>();
  const B = (m: THREE.Material) => { let b = buckets.get(m); if (!b) { b = { pos: [], nor: [], uv: [], col: [], idx: [] }; buckets.set(m, b); } return b; };
  const sides: { n: number[]; right: number[]; di: number; dj: number }[] = [
    { n: [1, 0, 0], right: [0, 0, -1], di: 1, dj: 0 }, { n: [-1, 0, 0], right: [0, 0, 1], di: -1, dj: 0 },
    { n: [0, 0, 1], right: [1, 0, 0], di: 0, dj: 1 }, { n: [0, 0, -1], right: [-1, 0, 0], di: 0, dj: -1 },
  ];
  // baked ambient occlusion, voxel style: a top corner darkens for each taller neighbour touching it
  const higher = (i: number, j: number, h: number) => { const n = tileAt(i, j); return n && n.h > h ? 1 : 0; };
  const AO = [0.52, 0.68, 0.84, 1];
  const cornerAO = (t: Tile, sx: number, sz: number) => {
    const a = higher(t.i + sx, t.j, t.h), b = higher(t.i, t.j + sz, t.h), c = higher(t.i + sx, t.j + sz, t.h);
    return AO[a && b ? 0 : 3 - (a + b + c)];
  };
  for (const t of landTiles()) {
    const top = topMat(t.type, t.variant);
    if (t.type === 'puente') {
      // a deck of planks on four posts, with the sea showing underneath
      const y = t.h * LEVEL;
      quad(B(top), t.wx, y, t.wz, [0, 1, 0], [1, 0, 0], [0, 0, -1], 0.5, 0.5, 0);
      for (const s of sides) { const nb = tileAt(t.i + s.di, t.j + s.dj); if (nb && nb.h >= t.h) continue; quad(B(SIDE_MAT.wood), t.wx + s.n[0] * 0.5, y - 0.06, t.wz + s.n[2] * 0.5, s.n, s.right, [0, 1, 0], 0.5, 0.06, 0, [0.8, 0.8, 1, 1]); }
      for (const [px, pz] of [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]]) for (const s of sides) {
        const ph = (y - 0.12 + 0.45) / 2;
        quad(B(SIDE_MAT.wood), t.wx + px + s.n[0] * 0.05, y - 0.12 - ph, t.wz + pz + s.n[2] * 0.05, s.n, s.right, [0, 1, 0], 0.05, ph, 0, [0.6, 0.6, 0.9, 0.9]);
      }
      continue;
    }
    // quad corners in order: (-x,+z) (+x,+z) (+x,-z) (-x,-z) for right=+x, up=-z
    const tao = [cornerAO(t, -1, 1), cornerAO(t, 1, 1), cornerAO(t, 1, -1), cornerAO(t, -1, -1)];
    quad(B(top), t.wx, t.h * LEVEL, t.wz, [0, 1, 0], [1, 0, 0], [0, 0, -1], 0.5, 0.5, t.rot, tao);
    for (let l = 0; l <= t.h; l++) {
      const mat = l === t.h ? sideMatFor(t.type) : l === 0 ? SIDE_MAT.deep : SIDE_MAT.under;
      const cy = l * LEVEL - LEVEL / 2;
      for (const s of sides) {
        const nb = tileAt(t.i + s.di, t.j + s.dj);
        if (nb && nb.h >= l) continue; // hidden behind the neighbour column
        // the foot of a cliff, where it meets the lower ground, gets a soft dark band
        const foot = nb && nb.h === l - 1 ? 0.62 : l === 0 ? 0.7 : 0.9;
        quad(B(mat), t.wx + s.n[0] * 0.5, cy, t.wz + s.n[2] * 0.5, s.n, s.right, [0, 1, 0], 0.5, LEVEL / 2, 0, [foot, foot, 1, 1]);
      }
    }
  }
  for (const [mat, b] of buckets) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.setIndex(b.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true;
    worldGroup.add(m); terrainMeshes.push(m);
  }
  // pick proxies
  while (proxyGroup.children.length) proxyGroup.remove(proxyGroup.children[0]);
  tileProxies.length = 0;
  for (const t of landTiles()) {
    let g = proxyGeo.get(t.h);
    if (!g) { g = new THREE.BoxGeometry(1, (t.h + 1) * LEVEL, 1); g.translate(0, ((t.h + 1) * LEVEL) / 2 - LEVEL, 0); proxyGeo.set(t.h, g); }
    const m = new THREE.Mesh(g, proxyMat); m.position.set(t.wx, 0, t.wz); m.userData.tile = t; t.proxy = m;
    proxyGroup.add(m); tileProxies.push(m);
  }
  proxyGroup.updateMatrixWorld(true);
}
export const terrainDrawCalls = () => terrainMeshes.length;

/* ---------- ground decoration: one instanced mesh ---------- */
const decoGeo = new THREE.BoxGeometry(1, 1, 1);
const decoMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
let deco: THREE.InstancedMesh | null = null;
export function rebuildDeco() {
  if (deco) { worldGroup.remove(deco); deco.dispose(); }
  const list: [number, number, number, number, number, number, string][] = [];
  const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, col: string) => list.push([x, y, z, sx, sy, sz, col]);
  const daisy = (x: number, y: number, z: number, r: () => number) => { const hg = 0.06 + r() * 0.05; add(x, y + hg / 2, z, 0.02, hg, 0.02, '#3f9434'); add(x, y + hg + 0.015, z, 0.07, 0.025, 0.035, '#fbf8ee'); add(x, y + hg + 0.015, z, 0.035, 0.025, 0.07, '#fbf8ee'); add(x, y + hg + 0.03, z, 0.025, 0.015, 0.025, '#ffd84a'); };
  const tuft = (x: number, y: number, z: number, r: () => number) => { const cols = ['#3c8a32', '#4ea33c', '#63c24d']; for (let k = 0; k < 3; k++) { const hg = 0.08 + r() * 0.08; add(x + (k - 1) * 0.035, y + hg / 2, z + (r() - 0.5) * 0.04, 0.035, hg, 0.035, cols[k]); } };
  for (const t of landTiles()) {
    if (t.building || t.rock || t.ancient || t.mound || t.solid) continue;
    const r = rng(Math.floor(hash(oi(t) * 31, oj(t) * 17, t.variant + t.type.length) * 1e9));
    const y = topY(t), spot = (): [number, number] => [t.wx + (r() - 0.5) * 0.8, t.wz + (r() - 0.5) * 0.8];
    switch (t.type) {
      case 'pasto': if (r() < 0.55) { const [x, z] = spot(); tuft(x, y, z, r); } if (r() < 0.22) { const [x, z] = spot(); daisy(x, y, z, r); } break;
      case 'matas': for (let k = 0; k < 3 + Math.floor(r() * 3); k++) { const [x, z] = spot(); tuft(x, y, z, r); } break;
      case 'flores': for (let k = 0; k < 3; k++) { const [x, z] = spot(); const hg = 0.1 + r() * 0.07; add(x, y + hg / 2, z, 0.025, hg, 0.025, '#3f9434'); add(x, y + hg + 0.03, z, 0.07, 0.05, 0.07, pick(r, ['#fff6e0', '#ff9ec4', '#8ab8ff', '#ffd84a'])); add(x, y + hg + 0.06, z, 0.03, 0.02, 0.03, '#ffd84a'); } break;
      case 'trebol': for (let k = 0; k < 2; k++) { const [x, z] = spot(); add(x, y + 0.02, z, 0.12, 0.04, 0.12, '#8ad96b'); } break;
      case 'musgo': for (let k = 0; k < 3; k++) { const [x, z] = spot(); add(x, y + 0.025, z, 0.14 + r() * 0.1, 0.05, 0.12 + r() * 0.1, pick(r, ['#3f8a3a', '#52a046', '#2f6a2c'])); } if (r() < 0.4) { const [x, z] = spot(); add(x, y + 0.04, z, 0.03, 0.08, 0.03, '#f0e6d0'); add(x, y + 0.09, z, 0.08, 0.03, 0.08, pick(r, ['#d9463c', '#e8a040'])); } break;
      case 'tierra': if (r() < 0.4) { const [x, z] = spot(); const s = 0.08 + r() * 0.06; add(x, y + s / 2, z, s, s * 0.7, s * 1.1, '#8a847a'); } break;
      case 'piedras': for (let k = 0; k < 2 + Math.floor(r() * 2); k++) { const [x, z] = spot(); const s = 0.1 + r() * 0.12; add(x, y + s * 0.35, z, s * 1.2, s * 0.7, s, pick(r, ['#9a948a', '#8a847a', '#aaa498'])); } break;
      case 'arada': for (let a = 0; a < 3; a++) if (r() < 0.55) { const x = t.wx + (r() - 0.5) * 0.7, z = t.wz - 0.33 + a * 0.33; add(x, y + 0.05, z, 0.03, 0.1, 0.03, '#4ea33c'); add(x + 0.03, y + 0.09, z, 0.06, 0.03, 0.03, '#8ad96b'); } break;
      case 'arena': if (r() < 0.25) { const [x, z] = spot(); add(x, y + 0.012, z, 0.07, 0.024, 0.055, pick(r, ['#ffb3c6', '#fff0d8', '#ffd0a0'])); } break;
      case 'losa': if (r() < 0.35) { const [x, z] = spot(); const s2 = 0.06 + r() * 0.06; add(x, y + s2 / 2, z, s2 * 1.3, s2, s2, pick(r, ['#8e887c', '#a39d90'])); } if (r() < 0.3) { const [x, z] = spot(); tuft(x, y, z, r); } break;
      case 'sendero': if (r() < 0.6) { const [x, z] = spot(); add(x, y + 0.015, z, 0.09, 0.03, 0.07, '#d8d2c6'); } break;
    }
  }
  deco = new THREE.InstancedMesh(decoGeo, decoMat, Math.max(1, list.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  list.forEach((d, k) => { e.set(0, hash(k, 3) * Math.PI, 0); q.setFromEuler(e); m.compose(new THREE.Vector3(d[0], d[1], d[2]), q, new THREE.Vector3(d[3], d[4], d[5])); deco!.setMatrixAt(k, m); deco!.setColorAt(k, c.set(d[6])); });
  deco.count = list.length; deco.castShadow = false; deco.receiveShadow = true; // tufts are too small for their shadows to show, and cost a lot in the shadow pass
  worldGroup.add(deco);
}
