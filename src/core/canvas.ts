import * as THREE from 'three';
import { rng, type Rng } from './random';

export function makeCanvas(w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  return c;
}

/** Colour pixel-art texture (sRGB), nearest filtering. */
export function pixTex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function px(x: CanvasRenderingContext2D, X: number, Y: number, c: string) {
  x.fillStyle = c; x.fillRect(X, Y, 1, 1);
}

type DetailDraw = (x: CanvasRenderingContext2D, r: Rng, g: (v: number) => string, w: number, h: number) => void;

/**
 * Grey 16x16 detail texture. It is multiplied by each voxel's vertex colour,
 * so one texture serves every shade of a material.
 */
export function detailTex(draw: DetailDraw, seed: number) {
  const c = makeCanvas(16, 16, (x, w, h) => {
    const r = rng(seed);
    const g = (v: number) => { const k = Math.round(Math.min(1, Math.max(0, v)) * 255); return `rgb(${k},${k},${k})`; };
    draw(x, r, g, w, h);
  });
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function mkIcon(rows: string[], pal: Record<string, string>) {
  const w = Math.max(...rows.map(r => r.length)), h = rows.length;
  const c = makeCanvas(w, h, x => {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const p = pal[row[i]]; if (p) px(x, i, j, p); } });
  });
  return c.toDataURL();
}
