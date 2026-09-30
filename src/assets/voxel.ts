import * as THREE from 'three';
import { detailTex } from '../core/canvas';
import { hash } from '../core/random';

/* Voxel building blocks shared by every asset.
   A block carries its colour per vertex; a grey detail texture adds pixel texture on top. */

export const Q = 1 / 32;
export const snap = (v: number) => Math.round(v / Q) * Q;

/* Baked occlusion: undersides are dark and the lower edge of each side face is a little darker,
   so canopies, roofs and stacked blocks read as solid without a screen-space AO pass. */
function paint(g: THREE.BufferGeometry, col: THREE.ColorRepresentation) {
  const c = new THREE.Color(col);
  const p = g.attributes.position, nr = g.attributes.normal, n = p.count;
  let y0 = Infinity; for (let i = 0; i < n; i++) y0 = Math.min(y0, p.getY(i));
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const ny = nr.getY(i);
    const k = ny < -0.5 ? 0.58 : ny > 0.5 ? 1 : p.getY(i) - y0 < 1e-4 ? 0.8 : 1;
    a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}

/** Texture coordinates from world position, so texels keep one size on big and small blocks. */
function worldUV(g: THREE.BufferGeometry, scale: number, jitter: boolean) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const ox = jitter ? Math.floor(hash(Math.round(p.getX(0) * 97), Math.round(p.getY(0) * 97), Math.round(p.getZ(0) * 97)) * 16) / 16 : 0;
  const oy = jitter ? Math.floor(hash(Math.round(p.getY(0) * 53), Math.round(p.getZ(0) * 53), 7) * 16) / 16 : 0;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    let u: number, v: number;
    if (ax > 0.5) { u = p.getZ(i); v = p.getY(i); } else if (ay > 0.5) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u * scale + ox, v * scale + oy);
  }
  uv.needsUpdate = true;
}

/** World-asset block (trees, rocks, buildings), snapped to the 1/32 grid. */
export function vbox(list: THREE.BufferGeometry[], x: number, y: number, z: number, sx: number, sy: number, sz: number, col: THREE.ColorRepresentation) {
  const g = new THREE.BoxGeometry(snap(sx) || Q, snap(sy) || Q, snap(sz) || Q);
  g.translate(snap(x), snap(y), snap(z));
  paint(g, col); worldUV(g, 2, true);
  list.push(g);
}

/** Block turned around the vertical axis (for hexagons and diagonal channels). Not snapped. */
export function vboxR(list: THREE.BufferGeometry[], x: number, y: number, z: number, sx: number, sy: number, sz: number, col: THREE.ColorRepresentation, rotY: number) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  paint(g, col); worldUV(g, 2, true);
  g.rotateY(rotY); g.translate(x, y, z);
  list.push(g);
}

/** Character block: not snapped, denser clay texture, continuous across the body. */
export function cbox(list: THREE.BufferGeometry[], x: number, y: number, z: number, sx: number, sy: number, sz: number, col: THREE.ColorRepresentation) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(x, y, z);
  paint(g, col); worldUV(g, 3.2, false);
  list.push(g);
}

export function shade(hex: THREE.ColorRepresentation, k: number) {
  const c = new THREE.Color(hex); const h = { h: 0, s: 0, l: 0 };
  c.getHSL(h); c.setHSL(h.h, h.s, Math.min(1, Math.max(0, h.l * k)));
  return c;
}

/* ---------- detail textures ---------- */
export const TEX = {
  leaf: detailTex((x, r, g, w, h) => {
    x.fillStyle = g(0.84); x.fillRect(0, 0, w, h);
    for (let k = 0; k < 22; k++) {
      const X = Math.floor(r() * w), Y = Math.floor(r() * h);
      x.fillStyle = g(0.62); x.fillRect(X, Y + 2, 3, 1);
      x.fillStyle = g(1); x.fillRect(X, Y, 2, 2);
      x.fillStyle = g(0.94); x.fillRect(X + 2, Y + 1, 1, 1);
    }
    for (let k = 0; k < 10; k++) { x.fillStyle = g(0.55); x.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 1); }
  }, 41),
  needle: detailTex((x, r, g, w, h) => {
    x.fillStyle = g(0.8); x.fillRect(0, 0, w, h);
    for (let k = 0; k < 26; k++) {
      const X = Math.floor(r() * w), Y = Math.floor(r() * h), s = r() < 0.5 ? 1 : -1;
      x.fillStyle = g(r() < 0.5 ? 1 : 0.95);
      for (let t = 0; t < 3; t++) x.fillRect((X + t * s + w) % w, (Y + t) % h, 1, 1);
      x.fillStyle = g(0.58); x.fillRect((X + w) % w, (Y + 3) % h, 1, 1);
    }
  }, 53),
  bark: detailTex((x, r, g, w, h) => {
    for (let i = 0; i < w; i++) { const ridge = i % 4 === 0 ? 0.66 : i % 4 === 2 ? 1 : 0.86; for (let j = 0; j < h; j++) { x.fillStyle = g(ridge + (r() - 0.5) * 0.06); x.fillRect(i, j, 1, 1); } }
    for (let k = 0; k < 5; k++) { let X = Math.floor(r() * w); const Y = Math.floor(r() * h); for (let s = 0; s < 5; s++) { x.fillStyle = g(0.58); x.fillRect(X, (Y + s) % h, 1, 1); if (r() < 0.3) X = (X + (r() < 0.5 ? 1 : w - 1)) % w; } }
    x.fillStyle = g(0.55); x.fillRect(10, 5, 2, 2); x.fillStyle = g(0.75); x.fillRect(9, 4, 4, 1); x.fillRect(9, 7, 4, 1);
  }, 67),
  birch: detailTex((x, r, g, w, h) => {
    x.fillStyle = g(1); x.fillRect(0, 0, w, h);
    for (let k = 0; k < 30; k++) { x.fillStyle = g(0.9); x.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 1); }
    for (let k = 0; k < 7; k++) { const X = Math.floor(r() * w), Y = Math.floor(r() * h), L = 2 + Math.floor(r() * 4); x.fillStyle = g(0.22); x.fillRect(X, Y, L, 1); if (r() < 0.5) { x.fillStyle = g(0.5); x.fillRect(X + 1, Y + 1, L - 1, 1); } }
  }, 79),
  stone: detailTex((x, r, g, w, h) => {
    x.fillStyle = g(0.86); x.fillRect(0, 0, w, h);
    for (let k = 0; k < 40; k++) { x.fillStyle = g(0.78 + r() * 0.24); x.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 2), 1); }
    for (let k = 0; k < 3; k++) { let X = Math.floor(r() * w), Y = Math.floor(r() * h); for (let s = 0; s < 5; s++) { x.fillStyle = g(0.6); x.fillRect(X, Y, 1, 1); X = (X + 1) % w; Y = (Y + (r() < 0.5 ? 1 : 0)) % h; } }
  }, 301),
  brick: detailTex((x, r, g, w) => {
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 4 : 0;
      for (let b = 0; b < 2; b++) { x.fillStyle = g(0.88 + r() * 0.12); x.fillRect((b * 8 + off) % w, row * 4, 8, 4); if (off && b === 1) x.fillRect(0, row * 4, 4, 4); }
      x.fillStyle = g(0.66); x.fillRect(0, row * 4 + 3, w, 1); x.fillRect(off % w, row * 4, 1, 3); x.fillRect((8 + off) % w, row * 4, 1, 3);
    }
  }, 313),
  thatch: detailTex((x, r, g, w, h) => {
    for (let i = 0; i < w; i++) { const v = 0.8 + r() * 0.2; for (let j = 0; j < h; j++) { x.fillStyle = g(v + (r() - 0.5) * 0.08); x.fillRect(i, j, 1, 1); } if (r() < 0.35) { x.fillStyle = g(0.64); x.fillRect(i, 0, 1, h); } }
    x.fillStyle = g(0.62); x.fillRect(0, 7, w, 1); x.fillStyle = g(1); x.fillRect(0, 8, w, 1);
  }, 327),
  plank: detailTex((x, r, g, w) => {
    for (let row = 0; row < 4; row++) {
      const v = 0.84 + r() * 0.14;
      for (let i = 0; i < w; i++) for (let j = 0; j < 4; j++) { x.fillStyle = g(v + (r() < 0.2 ? -0.08 : 0)); x.fillRect(i, row * 4 + j, 1, 1); }
      x.fillStyle = g(0.6); x.fillRect(0, row * 4 + 3, w, 1);
    }
  }, 331),
  clay: detailTex((x, r, g, w, h) => {
    x.fillStyle = g(0.9); x.fillRect(0, 0, w, h);
    for (let k = 0; k < 40; k++) { x.fillStyle = g(0.84 + r() * 0.14); x.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 1); }
    const arc = (cx: number, cy: number, rad: number, a0: number, a1: number, v: number) => { for (let a = a0; a < a1; a += 0.35) { x.fillStyle = g(v); x.fillRect(Math.round(cx + Math.cos(a) * rad + w) % w, Math.round(cy + Math.sin(a) * rad * 0.7 + h) % h, 1, 1); } };
    for (let f = 0; f < 2; f++) { const cx = r() * w, cy = r() * h; for (let k = 0; k < 3; k++) { arc(cx, cy, 2 + k * 1.6, r(), r() + 3.4, 0.76); arc(cx, cy + 0.8, 2.8 + k * 1.6, r() + 0.5, r() + 2.6, 1); } }
  }, 97),
};

// Lambert: the blocks are matte anyway, and it costs far less per pixel than the physical material
const texMat = (map: THREE.Texture, boost = 1.14) =>
  new THREE.MeshLambertMaterial({ vertexColors: true, map, color: new THREE.Color(boost, boost, boost) });

export const MAT = {
  leaf: texMat(TEX.leaf), needle: texMat(TEX.needle), bark: texMat(TEX.bark), birch: texMat(TEX.birch),
  stone: texMat(TEX.stone), brick: texMat(TEX.brick), thatch: texMat(TEX.thatch), plank: texMat(TEX.plank),
  clay: texMat(TEX.clay, 1.08),
};
export type MatKey = keyof typeof MAT;
