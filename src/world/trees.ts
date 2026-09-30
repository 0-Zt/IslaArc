import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, vnoise } from '../core/random';
import { vbox, MAT } from '../assets/voxel';
import { Voxels, meshVoxels } from '../assets/voxmesh';
import { worldGroup, landTiles, topY, tileUnder, oi, oj, type Tile } from './island';
import { camera, controls } from '../render/renderer';

export type TreeType = 'pino' | 'roble' | 'abedul';
export const TREE_TYPES: TreeType[] = ['pino', 'roble', 'abedul'];
export const SIZES = [0.7, 1, 1.35];

/* ---------- geometry (voxel) ----------
   Trunks are a few blocks; crowns are dense voxel masses (1/16 of a tile per voxel) built with the
   voxel mesher: rounded lobes, a speckled leaf palette, some voxels knocked out and some poking out,
   and per-corner occlusion so the foliage looks deep and bushy. */
const QV = 1 / 13;
const PALS: Record<TreeType, string[]> = {
  roble: ['#8fe060', '#6fcb46', '#54b238', '#3f962e', '#2c7824'],
  pino: ['#6cc05a', '#52a84c', '#3f9142', '#2f7a38', '#22622e'],
  abedul: ['#c6e96e', '#a6d856', '#88c244', '#6ea838', '#56892e'],
};
const cols = new Map<string, THREE.Color>();
const col = (h: string) => { let c = cols.get(h); if (!c) { c = new THREE.Color(h); cols.set(h, c); } return c; };

/** Leafy crown made of rounded lobes. Lobes are [x, y, z, rx, ry, rz] in voxels; p shapes them (2 = round, 3 = boxy). */
function crown(type: TreeType, lobes: number[][], r: () => number, p = 2.6) {
  const P = PALS[type], v = new Voxels(QV);
  let yMin = Infinity, yMax = -Infinity;
  for (const [, y, , , ry] of lobes) { yMin = Math.min(yMin, y - ry); yMax = Math.max(yMax, y + ry); }
  // each lobe is lit from the top: its upper voxels light, its underside dark (so tiers and bumps read),
  // with a gentle darkening toward the bottom of the whole crown and a little speckle
  const shade = (y: number, local: number) => {
    const g = (y - yMin) / Math.max(1, yMax - yMin);
    let k = Math.round((1 - local) * 2.4 + (1 - g) * 1.1);
    if (r() < 0.22) k += r() < 0.5 ? -1 : 1;
    return col(P[Math.max(0, Math.min(P.length - 1, k))]);
  };
  for (const [cx, cy, cz, rx, ry, rz] of lobes) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
      const nx = Math.abs((x - cx) / rx), sy = (y - cy) / ry, ny = Math.abs(sy), nz = Math.abs((z - cz) / rz);
      if (nx ** p + ny ** p + nz ** p > 1) continue;
      v.set(x, y, z, shade(y, (sy + 1) / 2));   // later lobes paint over, so bumps keep their own light
    }
  }
  // leafy surface: knock a few voxels out, push a few out
  const surf = v.surface();
  for (const [x, y, z] of surf) {
    const q = r();
    if (q < 0.1) v.del(x, y, z);
    else if (q < 0.22) {
      const d = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]][Math.floor(r() * 5)];
      if (!v.has(x + d[0], y + d[1], z + d[2])) v.set(x + d[0], y + d[1], z + d[2], shade(y + d[1], d[1] > 0 ? 1 : 0.5));
    }
  }
  return v;
}

/** A pine: stacked tiers, each a short stepped cone with a light top, a dark underside and a ragged rim. */
function pineCrown(s: number, r: () => number) {
  // stepped tiers, like a stack of plates: each one a dark drooping rim, a mid ring and a light top,
  // clearly narrower than the one below so the steps read from far away
  const P = ['#7cd06a', '#5cb454', '#44994a', '#327f3e', '#236430'], v = new Voxels(QV);
  const n = s < 0.8 ? 3 : s < 1.2 ? 4 : 5, R0 = 0.5 * s / QV;
  let y = 0;
  for (let k = 0; k < n; k++) {
    const R = Math.max(2, R0 * (1 - k / (n + 0.2)));
    const rows: [number, number][] = [[R, 3], [R - 0.9, 2], [R - 1.9, 0]];   // [radius, palette index]
    rows.forEach(([rr, pi], row) => {
      for (let x = -Math.ceil(rr); x <= Math.ceil(rr); x++) for (let z = -Math.ceil(rr); z <= Math.ceil(rr); z++) {
        const d = Math.hypot(x, z) + (r() - 0.5) * 0.7;
        if (d > rr) continue;
        const rim = d > rr - 1;
        v.set(x, y + row, z, col(P[Math.min(4, pi + (rim && row === 0 ? 1 : 0) + (r() < 0.12 ? 1 : 0))]));
      }
    });
    for (let q = 0; q < 12; q++) { const a = r() * Math.PI * 2; v.set(Math.round(Math.cos(a) * (R - 0.3)), y - 1, Math.round(Math.sin(a) * (R - 0.3)), col(P[4])); }
    y += 3;
  }
  v.set(0, y, 0, col(P[1])); v.set(0, y + 1, 0, col(P[0])); v.set(0, y + 2, 0, col(P[0]));
  return v;
}

function buildTree(type: TreeType, s: number, seed: number) {
  const r = rng(seed); const trunk: THREE.BufferGeometry[] = [];
  const jitter = (a: number) => (r() - 0.5) * a;
  const V = (u: number) => Math.round(u / QV);        // world units → voxels
  let pivot: number, crownV: Voxels, base: number;
  if (type === 'pino') {
    const tH = 0.42 * s, w = 0.13 * s;
    vbox(trunk, 0, tH / 2, 0, w, tH, w, '#6a3a22'); vbox(trunk, w * 0.3, tH * 0.45, 0, w * 0.45, tH * 0.8, w * 1.02, '#7a4428');
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) vbox(trunk, dx * w * 0.55, 0.03, dz * w * 0.55, w * 0.5, 0.06, w * 0.5, '#5e3420');
    pivot = tH * 0.75; base = tH * 0.55;
    // stacked tiers, each a flat rounded disc wider at the bottom, drooping at the rim
    crownV = pineCrown(s, r);
  } else if (type === 'roble') {
    const tH = 0.5 * s, w = 0.2 * s;
    vbox(trunk, 0, tH / 2, 0, w, tH, w, '#8b4a2b'); vbox(trunk, -w * 0.28, tH * 0.5, 0, w * 0.42, tH, w * 1.02, '#74391f');
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) vbox(trunk, dx * w * 0.62, 0.04, dz * w * 0.62, w * 0.6, 0.08, w * 0.6, '#74391f');
    vbox(trunk, w * 0.7, tH * 0.85, 0, w * 0.9, w * 0.45, w * 0.45, '#8b4a2b'); vbox(trunk, -w * 0.3, tH * 0.95, w * 0.6, w * 0.45, w * 0.45, w * 0.8, '#74391f');
    pivot = tH * 0.9; base = tH * 0.8;
    // a boxy, rounded crown with bumps, like the reference oaks
    const R = 0.46 * s, H = 0.36 * s;
    const lobes: number[][] = [[0, V(H), 0, V(R), V(H), V(R)]];
    const nb = 3 + Math.floor(r() * 3);
    for (let k = 0; k < nb; k++) { const a = r() * Math.PI * 2, d = R * (0.45 + r() * 0.25), rr = R * (0.42 + r() * 0.18); lobes.push([V(Math.cos(a) * d), V(H + (r() - 0.2) * H * 0.8), V(Math.sin(a) * d), V(rr), V(rr * 0.85), V(rr)]); }
    lobes.push([V(jitter(0.2 * s)), V(H * 1.75), V(jitter(0.2 * s)), V(R * 0.55), V(H * 0.45), V(R * 0.55)]);
    crownV = crown('roble', lobes, r, 2.8);
  } else {
    const tH = 0.9 * s, w = 0.11 * s;
    vbox(trunk, 0, tH / 2, 0, w, tH, w, '#ece6da'); vbox(trunk, w * 0.28, tH / 2, 0, w * 0.45, tH, w * 1.01, '#d8d0c0');
    const marks = 4 + Math.floor(3 * s);
    for (let k = 0; k < marks; k++) { const y = 0.06 + r() * (tH - 0.12), f = Math.floor(r() * 4), L = (0.03 + r() * 0.04) * s, off = w * 0.51; const [x, z, sx, sz] = f === 0 ? [off, 0, 0.01, L] : f === 1 ? [-off, 0, 0.01, L] : f === 2 ? [0, off, L, 0.01] : [0, -off, L, 0.01]; vbox(trunk, x, y, z + (f < 2 ? jitter(w * 0.4) : 0), sx, 0.022 * s + 0.01, sz, '#2b2b2b'); }
    vbox(trunk, w * 0.9, tH * 0.62, 0, w * 1.2, w * 0.35, w * 0.35, '#ece6da'); vbox(trunk, -w * 0.7, tH * 0.78, 0, w * 0.9, w * 0.3, w * 0.3, '#d8d0c0');
    pivot = tH * 0.75; base = tH * 0.72;
    // a tall airy crown of stacked soft lobes
    const lobes: number[][] = [];
    [[0, 0.3, 0.2], [0.14, 0.26, 0.42], [-0.1, 0.22, 0.62], [0.05, 0.16, 0.8]].forEach(([dx, rr, y]) => lobes.push([V(dx * s + jitter(0.05 * s)), V(y * s), V(jitter(0.08 * s)), V(rr * s), V(rr * 0.8 * s), V(rr * s)]));
    crownV = crown('abedul', lobes, r, 2.2);
  }
  const tg = mergeGeometries(trunk);
  const cg = meshVoxels(crownV, 0, base, 0, 3);
  cg.translate(0, -pivot, 0); cg.computeBoundingBox(); cg.computeBoundingSphere();
  return { tg, cg, pivot };
}

/* ---------- instanced rendering: one draw call per shape ---------- */
export interface Tree {
  tile: Tile; type: TreeType; si: number; v: number;
  x: number; y: number; z: number; rotY: number; sc: number; ph: number;
  shake: number; falling: number; fallDir: number; grow: number; hp: number | null;
  regrow: number; feller?: any;
}
interface Combo { key: string; geo: ReturnType<typeof buildTree>; trunk: THREE.InstancedMesh; canopy: THREE.InstancedMesh; list: Tree[]; cap: number }
const combos = new Map<string, Combo>();
export const trees: Tree[] = [];
let dirty = true;

function makeCombo(key: string, type: TreeType, si: number, v: number, cap: number, geo?: Combo['geo']): Combo {
  geo = geo || buildTree(type, SIZES[si], 7000 + TREE_TYPES.indexOf(type) * 100 + si * 10 + v);
  const trunk = new THREE.InstancedMesh(geo.tg, type === 'abedul' ? MAT.birch : MAT.bark, cap);
  const canopy = new THREE.InstancedMesh(geo.cg, type === 'pino' ? MAT.needle : MAT.leaf, cap);
  for (const m of [trunk, canopy]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; m.userData.combo = key; worldGroup.add(m); }
  return { key, geo, trunk, canopy, list: [], cap };
}
function comboFor(t: Tree) {
  const key = `${t.type}|${t.si}|${t.v}`;
  let c = combos.get(key);
  if (!c) { c = makeCombo(key, t.type, t.si, t.v, 32); combos.set(key, c); }
  if (c.list.length >= c.cap) {
    const bigger = makeCombo(key, t.type, t.si, t.v, c.cap * 2, c.geo);
    worldGroup.remove(c.trunk, c.canopy); c.trunk.dispose(); c.canopy.dispose();
    bigger.list = c.list; combos.set(key, bigger); c = bigger;
  }
  return c;
}

/** `grow` animates the tree in from nothing; `from` (0..1) starts it at that fraction of its size, for a tree stepping up a size. */
export function addTree(tile: Tile, type: TreeType, si: number, grow = false, from = 0) {
  const old: Tree | undefined = tile.tree;
  removeTree(tile);
  const t: Tree = {
    tile, type, si, v: Math.random() < 0.5 ? 0 : 1,
    x: tile.wx + (Math.random() - 0.5) * 0.14, y: topY(tile), z: tile.wz + (Math.random() - 0.5) * 0.14,
    rotY: Math.floor(Math.random() * 4) * Math.PI / 2, sc: 0.94 + Math.random() * 0.12, ph: Math.random() * 6.28,
    shake: 0, falling: 0, fallDir: 0, grow: grow ? 0 : 1, hp: null, regrow: 40,
  };
  if (from > 0) t.grow = 1 - Math.cbrt(1 - Math.min(0.99, from)); // matches the eased scale in tickTrees
  if (old) { t.x = old.x; t.z = old.z; t.rotY = old.rotY; t.sc = old.sc; t.v = old.v; }
  comboFor(t).list.push(t); trees.push(t); tile.tree = t; dirty = true;
  return t;
}
export function removeTree(tile: Tile) {
  const t: Tree = tile.tree; if (!t) return;
  const c = combos.get(`${t.type}|${t.si}|${t.v}`);
  if (c) c.list.splice(c.list.indexOf(t), 1);
  trees.splice(trees.indexOf(t), 1); tile.tree = null; dirty = true;
}
export function clearTrees() {
  for (const c of combos.values()) { worldGroup.remove(c.trunk, c.canopy); c.trunk.dispose(); c.canopy.dispose(); }
  combos.clear(); trees.length = 0; dirty = true;
}
export const canopyInfo = (t: Tree) => { const c = combos.get(`${t.type}|${t.si}|${t.v}`)!; return { bb: c.geo.cg.boundingBox!, pivot: c.geo.pivot }; };

export function plantIsland(seed: number) {
  const r = rng(seed + 77);
  for (const t of landTiles()) {
    if (t.ruin || !['pasto', 'matas', 'trebol', 'flores'].includes(t.type)) continue;
    const f = vnoise(oi(t), oj(t), 4, seed + 21); let p = f > 0.6 ? 0.5 : 0.05; if (t.h >= 2) p += 0.18;
    if (r() > p) continue;
    const type: TreeType = t.h >= 2 ? (r() < 0.7 ? 'pino' : 'roble') : vnoise(oi(t), oj(t), 5, seed + 31) > 0.58 ? 'abedul' : r() < 0.25 ? 'pino' : 'roble';
    const q = r(); addTree(t, type, q < 0.35 ? 0 : q < 0.75 ? 1 : 2);
  }
}

const _m = new THREE.Matrix4(), _c = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _ry = new THREE.Matrix4(), _rf = new THREE.Matrix4(), _sc = new THREE.Matrix4(), _pv = new THREE.Matrix4(), _sw = new THREE.Matrix4();

/** Animates sway, shakes, growth and falls, then writes every instance matrix. */
export function tickTrees(dt: number, T: number, onFallen: (t: Tree) => void) {
  for (const t of trees.slice()) {
    t.shake = Math.max(0, t.shake - dt * 2.6);
    if (t.grow < 1) t.grow = Math.min(1, t.grow + dt * 0.7);
    if (t.falling > 0) { t.falling = Math.min(1, t.falling + dt * 1.5); if (t.falling >= 1) { onFallen(t); removeTree(t.tile); } }
  }
  for (const c of combos.values()) {
    c.list.forEach((t, k) => {
      const s = SIZES[t.si];
      const gk = 1 - Math.pow(1 - t.grow, 3);
      const fk = t.falling * t.falling * 1.45;
      _p.set(t.x, t.y, t.z); _m.makeTranslation(_p);
      _rf.makeRotationFromEuler(_e.set(Math.cos(t.fallDir) * fk, 0, -Math.sin(t.fallDir) * fk));
      _ry.makeRotationY(t.rotY);
      _sc.makeScale(t.sc * Math.max(0.05, gk), t.sc * Math.max(0.05, gk), t.sc * Math.max(0.05, gk));
      _m.multiply(_rf).multiply(_ry).multiply(_sc);
      c.trunk.setMatrixAt(k, _m);
      const sx = Math.cos(T * 1.05 + t.ph * 1.3) * 0.022 / s + Math.cos(T * 33) * t.shake * 0.05;
      const sz = Math.sin(T * 1.3 + t.ph) * 0.03 / s + Math.sin(T * 38) * t.shake * 0.07;
      _pv.makeTranslation(0, c.geo.pivot, 0); _sw.makeRotationFromEuler(_e.set(sx, 0, sz));
      _c.copy(_m).multiply(_pv).multiply(_sw);
      c.canopy.setMatrixAt(k, _c);
    });
    c.trunk.count = c.canopy.count = c.list.length;
    c.trunk.visible = c.canopy.visible = c.list.length > 0;
    c.trunk.instanceMatrix.needsUpdate = c.canopy.instanceMatrix.needsUpdate = true;
    if (dirty) { c.trunk.boundingSphere = null; c.canopy.boundingSphere = null; }
  }
  dirty = false;
}

/** Raycast helper: which tree (if any) the ray hits first. */
export function pickTree(ray: THREE.Raycaster) {
  const meshes: THREE.InstancedMesh[] = [];
  for (const c of combos.values()) if (c.list.length) meshes.push(c.trunk, c.canopy);
  const h = ray.intersectObjects(meshes, false)[0];
  if (!h || h.instanceId == null) return null;
  const t = combos.get(h.object.userData.combo)!.list[h.instanceId];
  return t && !t.falling ? { tree: t, distance: h.distance } : null;
}
export const treeDrawCalls = () => [...combos.values()].filter(c => c.list.length).length * 2;

/* ---------- falling leaves ---------- */
const LEAF_N = 90;
const leafMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.085, 0.012, 0.055), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), LEAF_N);
leafMesh.count = 0; leafMesh.frustumCulled = false;
worldGroup.parent!.add(leafMesh);
const LEAF_COLS: Record<TreeType, string[]> = { roble: ['#4ea33c', '#6fc955', '#8ad96b', '#d8b84a'], abedul: ['#a8cf52', '#c4e070', '#e8d25a', '#f0b848'], pino: ['#2f6b3a', '#3b7d44'] };
const leaves: any[] = [];
let leafAcc = 0;
export let leafRate = 4;
export function spawnLeaf(force?: Tree) {
  if (!trees.length || leaves.length >= LEAF_N) return;
  let t = force;
  if (!t) {
    const c = controls.target, R = 9 / camera.zoom + 2;
    const near = trees.filter(q => Math.hypot(q.x - c.x, q.z - c.z) < R && !q.falling);
    const pool = near.length ? near : trees; t = pool[Math.floor(Math.random() * pool.length)];
    if (t.type === 'pino' && Math.random() < 0.75) return;
  }
  if (t.falling) return;
  const { bb, pivot } = canopyInfo(t); const s = t.sc;
  const x = t.x + (bb.min.x + Math.random() * (bb.max.x - bb.min.x)) * s * 0.8;
  const z = t.z + (bb.min.z + Math.random() * (bb.max.z - bb.min.z)) * s * 0.8;
  const y = t.y + (pivot + bb.min.y + (bb.max.y - bb.min.y) * 0.35 * Math.random()) * s;
  const ft = tileUnder(x, z); if (!ft) return;
  const cols = LEAF_COLS[t.type];
  leaves.push({ x, y, z, floor: topY(ft) + 0.01, vy: -0.18 - Math.random() * 0.12, ph: Math.random() * 6.28, sp: 1.5 + Math.random() * 1.5, amp: 0.25 + Math.random() * 0.25, rx: Math.random() * 6, ry: Math.random() * 6, land: 0, col: new THREE.Color(cols[Math.floor(Math.random() * cols.length)]), t: 0 });
}
export function tickLeaves(dt: number) {
  leafAcc += dt * leafRate; while (leafAcc > 1) { leafAcc -= 1; spawnLeaf(); }
  for (const l of leaves) {
    l.t += dt;
    if (l.y > l.floor) { l.y += l.vy * dt; l.x += Math.sin(l.t * l.sp + l.ph) * l.amp * dt + 0.05 * dt; l.z += Math.cos(l.t * l.sp * 0.7 + l.ph) * l.amp * 0.6 * dt; l.rx += dt * 2.4; l.ry += dt * 1.3; if (l.y <= l.floor) { l.y = l.floor; l.rx = 0; } }
    else l.land += dt;
  }
  for (let i = leaves.length - 1; i >= 0; i--) if (leaves[i].land > 3) leaves.splice(i, 1);
  leaves.forEach((l, k) => {
    const sc = l.land > 2 ? Math.max(0, 3 - l.land) : 1;
    _q.setFromEuler(_e.set(l.y > l.floor ? Math.sin(l.rx) * 0.9 : 0, l.ry, l.y > l.floor ? Math.cos(l.rx) * 0.5 : 0));
    _m.compose(_p.set(l.x, l.y, l.z), _q, _s.set(sc, sc, sc)); leafMesh.setMatrixAt(k, _m); leafMesh.setColorAt(k, l.col);
  });
  leafMesh.count = leaves.length; leafMesh.instanceMatrix.needsUpdate = true; if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
}
