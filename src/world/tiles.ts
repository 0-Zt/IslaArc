import * as THREE from 'three';
import { makeCanvas, pixTex, px } from '../core/canvas';
import { rng, vnoise, pick, type Rng } from '../core/random';

/* Ground tile textures: 16x16 pixel-art tops, 16x8 sides, three variants each. */

const PAL = {
  grass: ['#62c24a', '#58b643', '#6ccf52', '#51a93e'], gDark: '#3c8a32', gLight: '#8ad96b',
  dirt: ['#9a6038', '#8b5632', '#a86a3e', '#7c4c2c'], dDark: '#5e3a22', dLight: '#a8764a',
  path: ['#c9a36a', '#bf9860', '#d2ae76', '#b88f58'], pDark: '#a07d4a', pLight: '#e2c28e',
  sand: ['#ecd49a', '#e4ca8c', '#f2dcaa', '#dcc084'],
  stone: ['#9a948a', '#c8c2b6', '#6a645c'],
};

function field(x: CanvasRenderingContext2D, w: number, h: number, pal: string[], r: Rng, scale: number) {
  const seed = Math.floor(r() * 1e5);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const n = vnoise(i, j, scale, seed), k = r();
    let idx = n > 0.62 ? 2 : n < 0.36 ? 3 : 0;
    if (k < 0.18) idx = 1;
    if (k > 0.95) idx = (idx + 2) % 4;
    px(x, i, j, pal[idx]);
  }
}
function pebble(x: CanvasRenderingContext2D, r: Rng, w: number, h: number, big: boolean) {
  const X = Math.floor(r() * (w - 3)), Y = Math.floor(r() * (h - 3)), s = PAL.stone;
  px(x, X, Y, s[1]); px(x, X + 1, Y, s[0]); px(x, X, Y + 1, s[0]); px(x, X + 1, Y + 1, s[2]);
  if (big) { px(x, X + 2, Y, s[0]); px(x, X + 2, Y + 1, s[2]); px(x, X + 1, Y + 2, s[2]); px(x, X, Y + 2, s[2]); }
}
function blades(x: CanvasRenderingContext2D, r: Rng, n: number, w: number, h: number) {
  for (let k = 0; k < n; k++) { const X = Math.floor(r() * w), Y = 1 + Math.floor(r() * (h - 1)); px(x, X, Y, PAL.gDark); px(x, X, Y - 1, PAL.gLight); }
}

type Side = 'grass' | 'dirt' | 'path' | 'sand' | 'stone' | 'wood';
type Draw = (x: CanvasRenderingContext2D, r: Rng, w: number, h: number) => void;
export const TILE_DEFS: Record<string, { name: string; side: Side; draw: Draw }> = {
  pasto: { name: 'Pasto', side: 'grass', draw: (x, r, w, h) => { field(x, w, h, PAL.grass, r, 5); blades(x, r, 9, w, h); } },
  matas: { name: 'Pasto con matas', side: 'grass', draw: (x, r, w, h) => {
    field(x, w, h, PAL.grass, r, 4);
    for (let k = 0; k < 5; k++) { const X = Math.floor(r() * 13), Y = 2 + Math.floor(r() * 12); for (const [a, b] of [[0, 0], [1, 0], [2, 0], [1, -1], [0, 1], [1, 1], [2, 1]]) px(x, X + a, Y + b, PAL.gDark); px(x, X + 1, Y - 2, PAL.gLight); px(x, X, Y - 1, PAL.gLight); }
    blades(x, r, 6, w, h);
  } },
  flores: { name: 'Pasto con flores', side: 'grass', draw: (x, r, w, h) => {
    field(x, w, h, PAL.grass, r, 5); blades(x, r, 6, w, h);
    for (let k = 0; k < 5; k++) { const X = 1 + Math.floor(r() * 13), Y = 1 + Math.floor(r() * 13), c = pick(r, ['#fff6e0', '#ff9ec4', '#8ab8ff', '#fff6e0']); px(x, X, Y - 1, c); px(x, X - 1, Y, c); px(x, X + 1, Y, c); px(x, X, Y + 1, c); px(x, X, Y, '#ffd84a'); }
  } },
  trebol: { name: 'Trébol', side: 'grass', draw: (x, r, w, h) => {
    field(x, w, h, PAL.grass, r, 6);
    for (let k = 0; k < 7; k++) { const X = Math.floor(r() * 14), Y = Math.floor(r() * 14); px(x, X, Y, '#9be27c'); px(x, X + 1, Y, '#9be27c'); px(x, X, Y + 1, '#9be27c'); px(x, X + 1, Y + 1, '#6fc955'); }
    blades(x, r, 4, w, h);
  } },
  musgo: { name: 'Musgo antiguo', side: 'grass', draw: (x, r, w, h) => {
    field(x, w, h, ['#3f8a3a', '#468f3e', '#377a33', '#52a046'], r, 3);
    for (let k = 0; k < 8; k++) { const X = Math.floor(r() * 15), Y = Math.floor(r() * 15); px(x, X, Y, '#79c25a'); px(x, X + 1, Y, '#2c6a2c'); }
  } },
  tierra: { name: 'Tierra', side: 'dirt', draw: (x, r, w, h) => { field(x, w, h, PAL.dirt, r, 4); for (let k = 0; k < 14; k++) px(x, Math.floor(r() * w), Math.floor(r() * h), r() < 0.5 ? PAL.dDark : PAL.dLight); pebble(x, r, w, h, false); } },
  piedras: { name: 'Tierra pedregosa', side: 'dirt', draw: (x, r, w, h) => { field(x, w, h, PAL.dirt, r, 4); for (let k = 0; k < 10; k++) px(x, Math.floor(r() * w), Math.floor(r() * h), PAL.dDark); for (let k = 0; k < 4; k++) pebble(x, r, w, h, k < 2); } },
  arada: { name: 'Tierra arada', side: 'dirt', draw: (x, r, w, h) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const m = j % 4; let c = m === 0 ? PAL.dDark : m === 1 ? '#74482a' : m === 2 ? '#8b5a35' : '#a0703f'; if (r() < 0.12) c = pick(r, PAL.dirt); px(x, i, j, c); }
    for (let k = 0; k < 3; k++) { const X = 1 + Math.floor(r() * 14), Y = 2 + 4 * Math.floor(r() * 3); px(x, X, Y, '#6fc955'); px(x, X, Y - 1, '#9be27c'); }
  } },
  sendero: { name: 'Sendero', side: 'path', draw: (x, r, w, h) => {
    field(x, w, h, PAL.path, r, 5);
    for (let k = 0; k < 3; k++) { let X = Math.floor(r() * w), Y = Math.floor(r() * h); for (let s = 0; s < 4; s++) { px(x, X, Y, PAL.pDark); X += r() < 0.5 ? 1 : 0; Y += 1; } }
  } },
  arena: { name: 'Arena', side: 'sand', draw: (x, r, w, h) => {
    field(x, w, h, PAL.sand, r, 4);
    for (let k = 0; k < 10; k++) px(x, Math.floor(r() * w), Math.floor(r() * h), r() < 0.5 ? '#c8a860' : '#fff0c8');
    if (r() < 0.6) { const X = 2 + Math.floor(r() * 11), Y = 2 + Math.floor(r() * 11); px(x, X, Y, '#ff9ab8'); px(x, X + 1, Y, '#ffd6e2'); }
  } },
  // wooden bridge: planks across, nails and gaps
  puente: { name: 'Puente', side: 'wood', draw: (x, r, w, h) => {
    for (let j = 0; j < h; j++) { const plank = Math.floor(j / 4), v = ['#b07a44', '#a8743e', '#bc8650', '#9c6a38'][(plank + Math.floor(r() * 2)) % 4]; for (let i = 0; i < w; i++) px(x, i, j, j % 4 === 3 ? '#5e3a1e' : r() < 0.1 ? '#8a5a2e' : v); }
    for (let k = 0; k < 4; k++) { px(x, 2, k * 4 + 1, '#4a3020'); px(x, 13, k * 4 + 1, '#4a3020'); }
  } },
  // old paving of the ruins: square slabs, cracks and moss in the joints
  losa: { name: 'Losa antigua', side: 'stone', draw: (x, r, w, h) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x, i, j, pick(r, ['#9a9488', '#a39d90', '#8e887c']));
    for (let k = 0; k < w; k++) { px(x, k, 7, '#6a645c'); px(x, k, 15, '#6a645c'); px(x, 7, k, '#6a645c'); px(x, 15, k, '#6a645c'); }
    for (let k = 0; k < 6; k++) { const X = Math.floor(r() * w), Y = Math.floor(r() * h); px(x, X, Y, '#b4aea2'); }
    for (let k = 0; k < 7; k++) { const e = r() < 0.5, X = e ? 7 : Math.floor(r() * w), Y = e ? Math.floor(r() * h) : 7; px(x, X, Y, r() < 0.6 ? '#4e8a3a' : '#63a348'); }
    let X = Math.floor(r() * 6) + 1, Y = Math.floor(r() * 6) + 1; for (let s = 0; s < 4; s++) { px(x, X, Y, '#5e584f'); X += 1; Y += r() < 0.5 ? 1 : 0; }
  } },
};

const topTex: Record<string, THREE.Texture[]> = {};
Object.keys(TILE_DEFS).forEach((k, ti) => {
  topTex[k] = [0, 1, 2].map(v => { const r = rng(1000 + ti * 97 + v * 13); return pixTex(makeCanvas(16, 16, (x, w, h) => TILE_DEFS[k].draw(x, r, w, h))); });
});

const sideTex = (seed: number, draw: (x: CanvasRenderingContext2D, r: Rng, w: number, h: number) => void) =>
  pixTex(makeCanvas(16, 8, (x, w, h) => draw(x, rng(seed), w, h)));
const SIDE_TEX = {
  // grass hanging over the edge in ragged drips, over warm dirt with big soft blotches
  grass: sideTex(55, (x, r, w, h) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x, i, j, j > 5 ? '#74462a' : pick(r, ['#9a6038', '#8b5632', '#a86a3e', '#7c4c2c']));
    for (let k = 0; k < 4; k++) { const X = Math.floor(r() * 14), Y = 3 + Math.floor(r() * 4); px(x, X, Y, '#b8784a'); px(x, X + 1, Y, '#b8784a'); }
    let drip = 0;
    for (let i = 0; i < w; i++) {
      if (i % 2 === 0) drip = r() < 0.35 ? 3 + Math.floor(r() * 3) : 1 + Math.floor(r() * 2);
      px(x, i, 0, '#8ee060');
      for (let j = 1; j <= drip; j++) px(x, i, j, j === drip ? '#3f962e' : j === 1 ? '#6fcb46' : '#54b238');
    }
  }),
  dirt: sideTex(77, (x, r, w, h) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x, i, j, j === 0 ? PAL.dLight : j > 5 ? '#6a4226' : pick(r, PAL.dirt));
    for (let k = 0; k < 8; k++) px(x, Math.floor(r() * w), 1 + Math.floor(r() * 7), PAL.dDark);
    px(x, 5, 4, PAL.stone[0]); px(x, 6, 4, PAL.stone[2]); px(x, 12, 2, PAL.stone[0]);
  }),
  path: sideTex(88, (x, r, w, h) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x, i, j, j < 2 ? pick(r, PAL.path) : j > 5 ? '#6a4226' : pick(r, PAL.dirt));
    for (let i = 0; i < w; i++) if (r() < 0.3) px(x, i, 2, PAL.pDark);
  }),
  wood: sideTex(141, (x, r, w, h) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x, i, j, j < 2 ? pick(r, ['#b07a44', '#a8743e']) : i % 8 < 2 ? '#5e3a1e' : pick(r, ['#6a4226', '#74482a']));
    for (let i = 0; i < w; i++) px(x, i, 2, '#4a3020');
  }),
  stone: sideTex(131, (x, r, w, h) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x, i, j, j === 0 ? '#b4aea2' : j > 5 ? '#5e584f' : pick(r, ['#8e887c', '#827c70', '#9a9488']));
    for (let i = 0; i < w; i++) px(x, i, 3, '#6a645c'); px(x, 5, 1, '#6a645c'); px(x, 5, 2, '#6a645c'); px(x, 12, 4, '#6a645c'); px(x, 12, 5, '#6a645c');
  }),
  sand: sideTex(123, (x, r, w, h) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x, i, j, j < 3 ? pick(r, ['#ecd49a', '#e4ca8c', '#dcc084']) : j > 5 ? '#8a6a44' : pick(r, ['#c8a870', '#b89860', '#a88850']));
    for (let i = 0; i < w; i++) if (r() < 0.4) px(x, i, 3, '#dcc084');
  }),
  under: sideTex(99, (x, r, w, h) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x, i, j, pick(r, ['#7a4c2c', '#6a4226', '#74482a', '#80522f']));
    for (let k = 0; k < 10; k++) px(x, Math.floor(r() * w), Math.floor(r() * h), PAL.dDark);
    for (let k = 0; k < 3; k++) { const X = Math.floor(r() * 14), Y = Math.floor(r() * 7); px(x, X, Y, PAL.stone[0]); px(x, X + 1, Y, PAL.stone[2]); }
  }),
  deep: sideTex(111, (x, r, w, h) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x, i, j, pick(r, ['#6b5a4c', '#5e4f43', '#76665a', '#584a3f']));
    for (let k = 0; k < 6; k++) px(x, Math.floor(r() * w), Math.floor(r() * h), '#4e4238');
  }),
};

const std = (map: THREE.Texture) => new THREE.MeshLambertMaterial({ map, vertexColors: true }); // vertex colours carry the baked occlusion
export const SIDE_MAT = Object.fromEntries(Object.entries(SIDE_TEX).map(([k, t]) => [k, std(t)])) as Record<keyof typeof SIDE_TEX, THREE.MeshLambertMaterial>;
const topCache = new Map<string, THREE.MeshLambertMaterial>();
export function topMat(type: string, variant: number) {
  const key = type + variant;
  let m = topCache.get(key);
  if (!m) { m = std(topTex[type][variant]); topCache.set(key, m); }
  return m;
}
export const sideMatFor = (type: string) => SIDE_MAT[TILE_DEFS[type].side];
export const LEVEL = 0.5;
