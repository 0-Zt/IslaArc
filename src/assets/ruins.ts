import * as THREE from 'three';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { vbox, vboxR, MAT } from './voxel';
import { group } from './buildings';
import { rng } from '../core/random';

/* Models for the ruins islet, after the concept art:
   a raised platform of worn slabs, five chalice braziers each with the props of its puzzle,
   a pentagram of lava channels to a sitting statue ringed by runes, and — once the five flames
   burn — six carved walls that rise around it in a hexagon. */

export type Sym = 'flame' | 'wave' | 'leaf' | 'stone' | 'moon' | 'spiral';
export const SYMS: Sym[] = ['flame', 'wave', 'leaf', 'stone', 'moon', 'spiral'];
/* 8×8 pixel runes ('#' = carved) */
export const RUNES: Record<Sym, string[]> = {
  flame: ['...#....', '...##...', '..###...', '..####..', '.##.###.', '.#...##.', '.##.###.', '..####..'],
  wave: ['........', '.##..##.', '#..##..#', '........', '.##..##.', '#..##..#', '........', '........'],
  leaf: ['......##', '....####', '...##.##', '..##.##.', '.##.##..', '.####...', '.##.....', '#.......'],
  stone: ['...##...', '...##...', '..#..#..', '..#..#..', '.#.##.#.', '.#.##.#.', '#......#', '########'],
  moon: ['..####..', '.##.....', '##......', '##......', '##......', '##......', '.##.....', '..####..'],
  spiral: ['.######.', '#......#', '#.####.#', '#.#..#.#', '#.#.##.#', '#.#....#', '#.######', '#.......'],
};
export const SYM_NAME: Record<Sym, string> = { flame: 'llama', wave: 'ola', leaf: 'hoja', stone: 'montaña', moon: 'luna', spiral: 'espiral' };

/** A little SVG of a rune, for the puzzle panels. */
export function runeSVG(s: Sym, color = '#ffb45a', size = 36) {
  let r = '';
  RUNES[s].forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
  return `<svg viewBox="-1 -1 10 10" width="${size}" height="${size}" aria-hidden="true" fill="${color}" shape-rendering="crispEdges">${r}</svg>`;
}

/* ---------- rune atlas: one texture with the six runes plus a strip of small glyphs ---------- */
const atlas = (() => {
  const c = document.createElement('canvas'); c.width = 70; c.height = 10;
  const x = c.getContext('2d')!; x.fillStyle = '#fff';
  SYMS.forEach((s, k) => RUNES[s].forEach((row, y) => [...row].forEach((ch, i) => { if (ch === '#') x.fillRect(k * 10 + i + 1, y + 1, 1, 1); })));
  // slot 6: little glyph strip (for borders and the ring around the statue)
  const r = rng(5);
  for (let i = 60; i < 70; i++) for (let y = 3; y < 7; y++) if (r() < 0.45) x.fillRect(i, y, 1, 1);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const slotOf = (s: Sym | 'glyph') => s === 'glyph' ? 6 : SYMS.indexOf(s);
/** A flat rune plate (a quad) facing +z, textured from the atlas. Merge several into one mesh. */
export function runeQuad(list: THREE.BufferGeometry[], s: Sym | 'glyph', size: number, x: number, y: number, z: number, rotY = 0, flat = false) {
  const g = new THREE.PlaneGeometry(size, s === 'glyph' ? size * 0.5 : size);
  const k = slotOf(s), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (k * 10 + uv.getX(i) * 10) / 70, s === 'glyph' ? 0.3 + uv.getY(i) * 0.4 : uv.getY(i));
  if (flat) g.rotateX(-Math.PI / 2);
  g.rotateY(rotY); g.translate(x, y, z);
  list.push(g);
}
/** Material for rune plates; its colour is driven from outside (cold → ember). */
export const runeMat = () => new THREE.MeshBasicMaterial({ map: atlas, transparent: true, depthWrite: false, color: new THREE.Color(0.55, 0.26, 0.1) });
export function runeMesh(list: THREE.BufferGeometry[], mat: THREE.MeshBasicMaterial) {
  const m = new THREE.Mesh(BGU.mergeGeometries(list), mat); m.renderOrder = 3; return m;
}

const STONE = ['#a39d90', '#948e82', '#b0aa9c', '#857f73'];
const MOSS = ['#5a9a3e', '#4a8a34', '#6fb04a'];

/** Moss and grass blades on top of a block (added to the leaf list). */
function mossTop(L: THREE.BufferGeometry[], r: () => number, x: number, y: number, z: number, w: number, d: number) {
  for (let k = 0; k < 3; k++) vbox(L, x + (r() - 0.5) * w * 0.7, y + 0.015, z + (r() - 0.5) * d * 0.7, w * (0.2 + r() * 0.25), 0.03, d * (0.2 + r() * 0.25), MOSS[k % 3]);
  if (r() < 0.6) for (let k = 0; k < 3; k++) vbox(L, x + (r() - 0.5) * w * 0.6, y + 0.06, z + (r() - 0.5) * d * 0.6, 0.02, 0.1 + r() * 0.08, 0.02, MOSS[k % 3]);
}

/* ---------- islet props ---------- */
/** A broken column of worn drums with moss. */
export function modelBrokenPillar(seed: number, tall = false) {
  const r = rng(seed), S: THREE.BufferGeometry[] = [], L: THREE.BufferGeometry[] = [];
  const h = tall ? 4 + Math.floor(r() * 2) : 2 + Math.floor(r() * 2);
  vbox(S, 0, 0.06, 0, 0.44, 0.12, 0.44, STONE[3]);
  let y = 0.12;
  for (let k = 0; k < h; k++) { const w = 0.3 - (r() < 0.3 ? 0.04 : 0); vbox(S, (r() - 0.5) * 0.04, y + 0.12, (r() - 0.5) * 0.04, w, 0.24, w, STONE[k % 4]); y += 0.24; }
  vbox(S, 0.3, 0.08, 0.12, 0.24, 0.16, 0.22, STONE[1]);
  mossTop(L, r, 0, y, 0, 0.3, 0.3);
  for (let k = 0; k < 4; k++) vbox(L, 0.155, 0.2 + r() * (y - 0.3), (r() - 0.5) * 0.2, 0.02, 0.12, 0.05, MOSS[k % 3]); // ivy
  return group({ stone: S, leaf: L });
}
/** The ruined stone arch at the back of the islet. */
export function modelArch() {
  const r = rng(77), S: THREE.BufferGeometry[] = [], L: THREE.BufferGeometry[] = [], R: THREE.BufferGeometry[] = [];
  for (const x of [-0.55, 0.55]) { for (let k = 0; k < 6; k++) vbox(S, x + (r() - 0.5) * 0.03, 0.12 + k * 0.24, 0, 0.3, 0.24, 0.3, STONE[(k + (x > 0 ? 1 : 0)) % 4]); }
  vbox(S, 0, 1.56, 0, 1.46, 0.24, 0.34, STONE[2]); vbox(S, 0.2, 1.74, 0, 0.6, 0.12, 0.3, STONE[0]);
  mossTop(L, r, 0, 1.68, 0, 1.3, 0.3);
  for (let k = 0; k < 7; k++) vbox(L, -0.55 + (r() - 0.5) * 0.3, 0.3 + r() * 1.2, 0.16, 0.05, 0.14, 0.02, MOSS[k % 3]);
  runeQuad(R, 'glyph', 0.9, 0, 1.56, 0.176);
  const g = group({ stone: S, leaf: L });
  const rm = runeMesh(R, runeMat()); g.add(rm); (g as any).runes = rm;
  return g;
}
/** Stone stacks standing in the shallow water around the islet. */
export function modelSeaRock(seed: number) {
  const r = rng(seed), S: THREE.BufferGeometry[] = [], L: THREE.BufferGeometry[] = [];
  const h = 0.6 + r() * 0.5;
  vbox(S, 0, h / 2 - 0.4, 0, 0.5, h, 0.46, STONE[3]); vbox(S, 0.05, h - 0.3, 0.02, 0.34, 0.2, 0.3, STONE[1]);
  mossTop(L, r, 0.05, h - 0.2, 0.02, 0.34, 0.3);
  return group({ stone: S, leaf: L });
}

/* ---------- braziers ---------- */
export type Design = 'runas' | 'cauce' | 'losas' | 'obeliscos' | 'luna';
export interface BraseroModel { group: THREE.Group; glow: THREE.Mesh; smoke: [number, number, number]; accent: THREE.MeshBasicMaterial }

/** Chalice brazier with crenellated rim on a stepped base, plus the props of its puzzle.
    `ruined` topples the chalice and scatters its pieces. */
export function modelBrasero(design: Design, sym: Sym, ruined = false): BraseroModel {
  const r = rng(design.length * 31 + (ruined ? 7 : 0)), S: THREE.BufferGeometry[] = [], L: THREE.BufferGeometry[] = [], A: THREE.BufferGeometry[] = [], R: THREE.BufferGeometry[] = [], B: THREE.BufferGeometry[] = [];
  // stepped base
  vbox(S, 0, 0.05, 0, 0.62, 0.1, 0.62, STONE[3]); vbox(S, 0, 0.14, 0, 0.5, 0.08, 0.5, STONE[1]);
  if (!ruined) {
    vbox(S, 0, 0.3, 0, 0.26, 0.24, 0.26, STONE[0]);                          // stem
    for (let a = 0; a < 2; a++) vboxR(S, 0, 0.46, 0, 0.44, 0.1, 0.44, STONE[2], a * Math.PI / 4); // cup (octagon)
    for (let a = 0; a < 2; a++) vboxR(S, 0, 0.56, 0, 0.5, 0.1, 0.5, STONE[0], a * Math.PI / 4);
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8; vboxR(S, Math.sin(a) * 0.25, 0.66, Math.cos(a) * 0.25, 0.09, 0.1, 0.07, STONE[k % 2 ? 1 : 2], a); } // crenellations
    for (const [x, z] of [[-0.08, -0.05], [0.07, 0.06], [0, -0.1], [-0.05, 0.08]]) vbox(B, x, 0.62, z, 0.14, 0.05, 0.05, '#3a2418');
    mossTop(L, r, 0.12, 0.18, 0.12, 0.3, 0.3);
  } else {
    vbox(S, -0.06, 0.24, 0.02, 0.26, 0.12, 0.26, STONE[0]);
    vboxR(S, 0.2, 0.2, -0.16, 0.4, 0.12, 0.26, STONE[2], 0.6);             // fallen cup
    for (let k = 0; k < 5; k++) vbox(S, (r() - 0.5) * 0.7, 0.05, (r() - 0.5) * 0.7, 0.08 + r() * 0.08, 0.1, 0.08 + r() * 0.08, STONE[k % 4]);
    mossTop(L, r, 0, 0.18, 0, 0.5, 0.5);
  }
  // front rune of this flame
  runeQuad(R, sym, 0.16, 0, ruined ? 0.14 : 0.3, ruined ? 0.252 : 0.132);
  // puzzle props
  const fallen = (k: number) => ruined && k % 2 === 1;
  if (design === 'runas') {
    [[-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]].forEach(([x, z], k) => {
      const h = 0.5 + (k % 2) * 0.12;
      if (fallen(k)) { vboxR(S, x, 0.08, z, 0.14, 0.14, h, STONE[1], 0.4); return; }
      vbox(S, x, h / 2, z, 0.14, h, 0.12, STONE[k % 3]); vbox(S, x, h + 0.03, z, 0.1, 0.06, 0.08, STONE[2]);
      runeQuad(R, SYMS[(k + 1) % 6], 0.1, x, h * 0.55, z + 0.061);
      vbox(A, x, h * 0.25, z + 0.062, 0.02, h * 0.3, 0.005, '#fff');
    });
  } else if (design === 'cauce') {
    for (let k = 0; k < 6; k++) { if (fallen(k)) continue; const a = -2.2 + k * 0.62, x = Math.sin(a) * 0.36, z = Math.cos(a) * 0.36; vboxR(S, x, 0.09, z, 0.16, 0.14, 0.2, STONE[k % 3], a + Math.PI / 2); vboxR(A, x, 0.165, z, 0.05, 0.01, 0.2, '#fff', a + Math.PI / 2); }
    vbox(S, -0.34, 0.22, 0.34, 0.14, 0.3, 0.14, STONE[2]); // the channel's source spout
  } else if (design === 'losas') {
    [[0, -0.36], [0.36, 0], [0, 0.36], [-0.36, 0], [0.34, 0.34]].forEach(([x, z], k) => {
      if (fallen(k)) return;
      vbox(S, x, 0.035, z, 0.2, 0.07, 0.2, STONE[3]); vbox(A, x, 0.072, z, 0.12, 0.005, 0.12, '#fff');
    });
  } else if (design === 'obeliscos') {
    [[-0.3, -0.3, 0.9], [0.08, -0.36, 1.2], [0.36, -0.08, 0.8]].forEach(([x, z, h], k) => {
      if (fallen(k)) { vboxR(S, x, 0.08, z + 0.2, 0.14, 0.14, h * 0.7, STONE[1], 1.1); return; }
      vbox(S, x, h / 2, z, 0.14, h, 0.14, STONE[k % 3]); vbox(S, x, h + 0.06, z, 0.08, 0.12, 0.08, STONE[2]); vbox(S, x, h + 0.14, z, 0.04, 0.05, 0.04, STONE[1]);
      vbox(A, x, h * 0.5, z + 0.072, 0.025, h * 0.6, 0.005, '#fff');
      for (let q = 0; q < 3; q++) vbox(L, x + 0.072, 0.1 + r() * h * 0.7, z, 0.01, 0.1, 0.04, MOSS[q % 3]);
    });
  } else if (design === 'luna') {
    const n = 14;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2; if (ruined && (k === 3 || k === 4 || k === 5)) continue;
      const x = Math.cos(a) * 0.42, y = 0.62 + Math.sin(a) * 0.42;
      vboxR(S, x, y, -0.3, 0.2, 0.2, 0.16, STONE[k % 3], 0);
      if (k % 2 === 0) vboxR(A, x * 0.84, 0.62 + Math.sin(a) * 0.35, -0.21, 0.07, 0.07, 0.005, '#fff', 0);
    }
    for (let k = 0; k < 3; k++) vbox(S, -0.2 + k * 0.1, 0.03 + k * 0.03, 0.34 - k * 0.04, 0.3, 0.06, 0.1, STONE[k % 3]); // steps
  }
  const g = group({ stone: S, leaf: L, bark: B });
  const accent = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.75, 0.7) });
  if (A.length) { const am = new THREE.Mesh(BGU.mergeGeometries(A), accent); g.add(am); }
  const rm = runeMesh(R, runeMat()); g.add(rm); (g as any).rune = rm; (g as any).accent = accent;
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.04, 0.02) }));
  glow.position.set(0, 0.64, 0); glow.visible = !ruined; g.add(glow);
  return { group: g, glow, smoke: [0, 0.85, 0], accent };
}

/* ---------- the shrine ---------- */
export interface Channel { mesh: THREE.Mesh; length: number }

const lavaMat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.75, 0.12) });
/** A lava strip that grows along its length (scale.z 0..1) from its start point. */
export function lavaStrip(x0: number, z0: number, x1: number, z1: number, y: number, width = 0.08): Channel {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const geo = new THREE.BoxGeometry(width, 0.025, len); geo.translate(0, 0, len / 2);
  const m = new THREE.Mesh(geo, lavaMat());
  m.position.set(x0, y, z0); m.rotation.y = Math.atan2(x1 - x0, z1 - z0); m.scale.z = 0.001; m.visible = false;
  return { mesh: m, length: len };
}
/** A stone trough with raised lips between two points, the bed the lava runs in. */
export function trough(list: THREE.BufferGeometry[], x0: number, z0: number, x1: number, z1: number, y: number) {
  const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  vboxR(list, cx, y, cz, 0.12, 0.02, len, '#4e483f', a);
  for (const s of [-1, 1]) vboxR(list, cx + Math.cos(a) * 0.09 * s, y + 0.02, cz - Math.sin(a) * 0.09 * s, 0.06, 0.05, len, '#8e887c', a);
}

/** The ring around the statue: eight carved stones and a round basin where the lava gathers. */
export function modelStatueRing() {
  const S: THREE.BufferGeometry[] = [], R: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + Math.PI / 8, x = Math.sin(a) * 0.5, z = Math.cos(a) * 0.5;
    vboxR(S, x, 0.06, z, 0.36, 0.12, 0.16, STONE[k % 3], a);
    runeQuad(R, 'glyph', 0.3, Math.sin(a) * 0.5, 0.125, Math.cos(a) * 0.5, a, true);
  }
  vbox(S, 0, 0.05, 0, 0.36, 0.1, 0.36, STONE[2]);   // pedestal under the statue
  const g = group({ stone: S });
  const runes = runeMat(); g.add(runeMesh(R, runes));
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 12), lavaMat());
  basin.position.y = 0.03; basin.visible = false; g.add(basin);
  return { group: g, runes, basin };
}

/** Six carved walls in a hexagon, each with a big rune panel (they rise when the five flames burn). */
export function modelHexWalls(R0: number) {
  const r = rng(12), S: THREE.BufferGeometry[] = [], L: THREE.BufferGeometry[] = [], P: THREE.BufferGeometry[] = [];
  const order: Sym[] = ['flame', 'spiral', 'wave', 'leaf', 'stone', 'moon'];
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3, cx = Math.sin(a) * R0, cz = Math.cos(a) * R0, len = R0 * 0.95;
    const tx = Math.cos(a), tz = -Math.sin(a); // along the wall
    for (let row = 0; row < 2; row++) for (let b = -2; b <= 2; b++) {
      if (row === 1 && (b === -2 || b === 2) && r() < 0.6) continue;
      const w = len / 5, off = (row % 2 ? 0.5 : 0) * w * 0.3;
      vboxR(S, cx + tx * (b * w + off), 0.13 + row * 0.26, cz + tz * (b * w + off), w * 0.98, 0.26, 0.34, STONE[(row + b + 4) % 4], a);
    }
    // corner pillars
    const px = Math.sin(a + Math.PI / 6) * R0 * 1.04, pz = Math.cos(a + Math.PI / 6) * R0 * 1.04;
    vbox(S, px, 0.45, pz, 0.38, 0.9, 0.38, STONE[3]); vbox(S, px, 0.95, pz, 0.44, 0.1, 0.44, STONE[2]);
    mossTop(L, r, px, 1.0, pz, 0.38, 0.38);
    mossTop(L, r, cx, 0.52, cz, len * 0.8, 0.3);
    // a carved panel in the middle of each wall, rune on both faces
    vboxR(S, cx, 0.45, cz, 0.66, 0.9, 0.4, STONE[2], a); vboxR(S, cx, 0.94, cz, 0.74, 0.08, 0.46, STONE[0], a);
    runeQuad(P, order[k], 0.48, cx - Math.sin(a) * 0.205, 0.5, cz - Math.cos(a) * 0.205, a + Math.PI);
    runeQuad(P, order[k], 0.48, cx + Math.sin(a) * 0.205, 0.5, cz + Math.cos(a) * 0.205, a);
    for (let q = 0; q < 5; q++) vboxR(L, cx + tx * (r() - 0.5) * len + Math.sin(a) * 0.18, 0.15 + r() * 0.35, cz + tz * (r() - 0.5) * len + Math.cos(a) * 0.18, 0.04, 0.14, 0.02, MOSS[q % 3], a);
  }
  const g = group({ stone: S, leaf: L });
  const runes = runeMat(); g.add(runeMesh(P, runes));
  return { group: g, runes };
}

export { MAT };
