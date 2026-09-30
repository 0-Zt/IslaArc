import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, type Rng } from '../core/random';
import { cbox, shade, MAT } from './voxel';

/* Clay figures sculpted from small voxels, rigged as hips / arms / head groups. */

const QC = 1 / 26;
type ColorFn = (nx: number, ny: number, nz: number, r: Rng, wx: number, wy: number, wz: number) => THREE.Color | null | undefined;

/** Hollow voxel ellipsoid: only surface voxels are emitted. */
function vsphere(list: THREE.BufferGeometry[], cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, colorFn: ColorFn, r: Rng, q = QC) {
  const nx = Math.ceil(rx / q), ny = Math.ceil(ry / q), nz = Math.ceil(rz / q);
  const inside = (i: number, j: number, k: number) => ((i * q) / rx) ** 2 + ((j * q) / ry) ** 2 + ((k * q) / rz) ** 2 <= 1.02;
  for (let j = -ny; j <= ny; j++) for (let i = -nx; i <= nx; i++) for (let k = -nz; k <= nz; k++) {
    if (!inside(i, j, k)) continue;
    if (inside(i + 1, j, k) && inside(i - 1, j, k) && inside(i, j + 1, k) && inside(i, j - 1, k) && inside(i, j, k + 1) && inside(i, j, k - 1)) continue;
    const c = colorFn(i * q / rx, j * q / ry, k * q / rz, r, cx + i * q, cy + j * q, cz + k * q);
    if (c) cbox(list, cx + i * q, cy + j * q, cz + k * q, q, q, q, c);
  }
}
function vring(list: THREE.BufferGeometry[], cy: number, rx: number, rz: number, h: number, hex: string, r: Rng, q = QC) {
  const n = Math.ceil(2 * Math.PI * Math.max(rx, rz) / q);
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; cbox(list, Math.cos(a) * rx, cy, Math.sin(a) * rz, q * 1.1, h, q * 1.1, shade(hex, 1 + (r() - 0.5) * 0.12)); }
}
const clay = (hex: THREE.ColorRepresentation, extra?: ColorFn | null): ColorFn => (nx, ny, nz, r, wx, wy, wz) => {
  const k = (0.9 + 0.1 * (ny + 1) / 2) * (1 + (r() - 0.5) * 0.1);
  const e = extra && extra(nx, ny, nz, r, wx, wy, wz);
  return e == null ? shade(hex, k) : e;
};

export type CharId = 'arci' | 'musgo' | 'brasa';
export const CHAR_DEFS: Record<CharId, { name: string; color: string; glow?: boolean }> = {
  arci: { name: 'Arci', color: '#c98655' },
  musgo: { name: 'Musgo', color: '#7e9c58' },
  brasa: { name: 'Brasa', color: '#a8432a', glow: true },
};

export function part(list: THREE.BufferGeometry[], mat: THREE.Material = MAT.clay) {
  const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = true; m.receiveShadow = true; return m;
}

export type ToolKey = 'axe' | 'axeM' | 'pick' | 'pickM' | 'shovel';
const TOOL_PARTS: Record<ToolKey, (L: THREE.BufferGeometry[]) => void> = {
  axe: L => { cbox(L, 0, -0.1, 0.04, 0.04, 0.36, 0.04, '#8a5a2e'); cbox(L, 0, -0.25, 0.1, 0.05, 0.1, 0.12, '#8a847a'); cbox(L, 0, -0.24, 0.05, 0.055, 0.05, 0.04, '#6b4a2a'); },
  axeM: L => { cbox(L, 0, -0.1, 0.04, 0.04, 0.36, 0.04, '#8a5a2e'); cbox(L, 0, -0.25, 0.1, 0.045, 0.12, 0.14, '#b9c2cc'); cbox(L, 0, -0.25, 0.18, 0.05, 0.17, 0.035, '#eef2f6'); cbox(L, 0, -0.25, 0.04, 0.05, 0.05, 0.05, '#6b4a2a'); },
  pick: L => { cbox(L, 0, -0.1, 0.04, 0.04, 0.36, 0.04, '#8a5a2e'); cbox(L, 0, -0.26, 0.06, 0.05, 0.05, 0.28, '#8a847a'); },
  pickM: L => { cbox(L, 0, -0.1, 0.04, 0.04, 0.36, 0.04, '#8a5a2e'); cbox(L, 0, -0.26, 0.06, 0.05, 0.05, 0.32, '#b9c2cc'); cbox(L, 0, -0.27, 0.21, 0.035, 0.035, 0.06, '#eef2f6'); cbox(L, 0, -0.27, -0.09, 0.035, 0.035, 0.06, '#eef2f6'); },
  shovel: L => { cbox(L, 0, -0.12, 0.04, 0.035, 0.42, 0.035, '#8a5a2e'); cbox(L, 0, -0.35, 0.07, 0.13, 0.14, 0.03, '#a0a8b2'); cbox(L, 0, 0.1, 0.04, 0.1, 0.03, 0.04, '#6b4a2a'); },
};

export interface Figure {
  id: CharId; def: typeof CHAR_DEFS[CharId];
  root: THREE.Group; body: THREE.Group; head: THREE.Group;
  hips: THREE.Group[]; arms: THREE.Group[]; eyes: THREE.Group[];
  tools: Record<ToolKey, THREE.Group>; glowMat: THREE.MeshBasicMaterial; ring: THREE.Mesh;
}

export function buildFigure(id: CharId, blob: THREE.Texture): Figure {
  const d = CHAR_DEFS[id], r = rng(id.length * 977 + 13), base = d.color, INK = '#1f140e';
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1, 0.25) });
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  // legs
  const hips: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const hp = new THREE.Group(); hp.position.set(0.085 * s, 0.2, 0); body.add(hp); const L: THREE.BufferGeometry[] = [];
    vsphere(L, 0, -0.06, 0, 0.055, 0.09, 0.055, clay('#' + shade(base, 0.82).getHexString()), r);
    cbox(L, 0, -0.165, 0.02, 0.12, 0.06, 0.15, shade(base, 0.72)); cbox(L, 0, -0.16, 0.09, 0.08, 0.05, 0.05, shade(base, 0.72));
    hp.add(part(L)); hips.push(hp);
  }
  // torso
  const T: THREE.BufferGeometry[] = [];
  const torsoExtra: ColorFn | null = id === 'musgo' ? (_nx, ny, _nz, rr) => (ny > 0.45 && rr() < 0.55 ? shade('#5f8a3a', 1 + (rr() - 0.5) * 0.2) : undefined)
    : id === 'brasa' ? (_nx, _ny, _nz, rr) => (rr() < 0.05 ? shade('#4a3a3a', 1 + (rr() - 0.5) * 0.2) : undefined) : null;
  vsphere(T, 0, 0.36, 0, 0.19, 0.2, 0.16, clay(base, torsoExtra), r);
  vsphere(T, 0, 0.29, 0.03, 0.16, 0.12, 0.14, clay(base), r);
  if (id === 'arci') {
    for (let k = 0; k < 8; k++) { const t = k / 7; cbox(T, -0.15 + 0.31 * t, 0.5 - 0.22 * t, 0.15 - 0.02 * t + (t > 0.85 ? -0.03 : 0), 0.05, 0.05, 0.03, '#6b4a2a'); }
    cbox(T, 0.2, 0.26, 0.03, 0.08, 0.11, 0.14, '#6b4a2a'); cbox(T, 0.2, 0.3, 0.03, 0.085, 0.04, 0.145, '#8a6238'); cbox(T, 0.24, 0.27, 0.03, 0.02, 0.02, 0.02, '#e0b050');
  }
  body.add(part(T));
  // arms
  const arms: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const sh = new THREE.Group(); sh.position.set(0.2 * s, 0.47, 0); body.add(sh); const A: THREE.BufferGeometry[] = [];
    cbox(A, 0, -0.09, 0, 0.085, 0.18, 0.085, shade(base, 0.95)); cbox(A, 0, -0.2, 0, 0.1, 0.09, 0.1, shade(base, 0.9)); cbox(A, 0, -0.235, 0.03, 0.07, 0.04, 0.06, shade(base, 0.85));
    sh.add(part(A)); arms.push(sh);
  }
  // head
  const head = new THREE.Group(); head.position.set(0, 0.66, 0); body.add(head);
  const H: THREE.BufferGeometry[] = [], G: THREE.BufferGeometry[] = [];
  const headExtra: ColorFn | null = id === 'musgo' ? (_nx, ny, _nz, rr) => { const edge = ny + (rr() - 0.5) * 0.22; return edge > 0.3 ? shade(rr() < 0.2 ? '#79a84a' : '#5f8a3a', 1 + (rr() - 0.5) * 0.18) : undefined; }
    : id === 'brasa' ? (nx, ny, nz, rr, wx, wy, wz) => { if (nz > 0.6 && Math.abs(nx) < 0.55 && ny > -0.6 && ny < 0.5) return undefined; const q = rr(); if (q < 0.045) { cbox(G, wx, wy, wz, QC * 1.25, QC * 1.25, QC * 1.25, '#fff'); return shade('#3a1a14', 1); } if (q < 0.09) return shade('#4a3a3a', 1 + (rr() - 0.5) * 0.2); return undefined; } : null;
  vsphere(H, 0, 0, 0, 0.27, 0.25, 0.26, clay(base, headExtra), r); head.add(part(H));
  // face
  const eyes: THREE.Group[] = [], F: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const e = new THREE.Group(); e.position.set(0.09 * s, 0.02, 0.235); head.add(e); const E: THREE.BufferGeometry[] = [];
    if (id === 'brasa') { cbox(E, 0, 0, 0, 0.1, 0.055, 0.03, '#2a1010'); e.add(part(E)); const gl: THREE.BufferGeometry[] = []; cbox(gl, 0, 0, 0.006, 0.08, 0.03, 0.03, '#fff'); e.add(part(gl, glowMat)); }
    else if (id === 'musgo') { cbox(E, 0, -0.01, 0, 0.075, 0.07, 0.03, INK); cbox(E, -0.018 * s, 0, 0.012, 0.026, 0.026, 0.02, '#fff'); cbox(E, 0, 0.03, 0.004, 0.085, 0.035, 0.036, shade(base, 0.9)); e.add(part(E)); }
    else { cbox(E, 0, 0, 0, 0.075, 0.09, 0.03, INK); cbox(E, -0.02 * s, 0.025, 0.012, 0.028, 0.028, 0.02, '#fff'); e.add(part(E)); }
    eyes.push(e);
  }
  if (id === 'arci') { cbox(F, 0, -0.085, 0.25, 0.09, 0.028, 0.02, INK); cbox(F, -0.045, -0.07, 0.245, 0.025, 0.025, 0.02, INK); cbox(F, 0.045, -0.07, 0.245, 0.025, 0.025, 0.02, INK); for (const s of [1, -1]) cbox(F, 0.165 * s, -0.045, 0.19, 0.05, 0.03, 0.03, '#e39a7a'); }
  if (id === 'brasa') { cbox(F, 0, -0.085, 0.25, 0.14, 0.03, 0.02, '#2a1010'); cbox(F, -0.04, -0.075, 0.255, 0.03, 0.025, 0.02, '#fff0d0'); cbox(F, 0.04, -0.075, 0.255, 0.03, 0.025, 0.02, '#fff0d0'); }
  if (id === 'musgo') { cbox(F, 0, -0.09, 0.25, 0.05, 0.025, 0.02, INK); for (const s of [1, -1]) cbox(F, 0.165 * s, -0.05, 0.19, 0.05, 0.03, 0.03, '#a8b86a'); }
  head.add(part(F));
  // accessories
  const X: THREE.BufferGeometry[] = [];
  if (id === 'arci') {
    vring(X, 0.09, 0.255, 0.245, 0.055, '#e0b050', r);
    cbox(X, 0.03, 0.09, -0.255, 0.06, 0.06, 0.05, '#e0b050'); cbox(X, -0.03, 0.08, -0.255, 0.06, 0.06, 0.05, '#d0a040'); cbox(X, 0.045, 0, -0.265, 0.035, 0.12, 0.03, '#e0b050'); cbox(X, -0.02, -0.02, -0.27, 0.035, 0.14, 0.03, '#d0a040');
    cbox(X, -0.08, 0.26, 0.02, 0.06, 0.05, 0.06, shade(base, 1.05)); cbox(X, 0.06, 0.27, -0.02, 0.05, 0.06, 0.05, shade(base, 1.05));
  }
  if (id === 'brasa') {
    [0.09, 0.14, 0.1, 0.16, 0.08, 0.12].forEach((hh, k) => { const a = k / 6 * Math.PI * 2 + 0.3, x = Math.cos(a) * 0.17, z = Math.sin(a) * 0.16, y0 = 0.12 + 0.05 * Math.cos(a * 2); cbox(X, x, y0 + hh / 2, z, 0.06, hh, 0.06, '#2a1d3a'); cbox(X, x, y0 + hh + 0.01, z, 0.035, 0.03, 0.035, '#6a4aa8'); });
    cbox(X, 0, 0.245, 0, 0.05, 0.05, 0.05, '#2a1d3a'); cbox(X, 0, 0.28, 0, 0.03, 0.03, 0.03, '#6a4aa8');
  }
  if (id === 'musgo') {
    cbox(X, 0, 0.3, 0, 0.03, 0.1, 0.03, '#4f7a34'); cbox(X, 0.07, 0.36, 0, 0.1, 0.03, 0.05, '#8ccf5a'); cbox(X, -0.07, 0.36, 0, 0.1, 0.03, 0.05, '#8ccf5a'); cbox(X, 0, 0.39, 0, 0.03, 0.03, 0.03, '#a8e070');
    cbox(X, -0.21, 0.13, 0.08, 0.04, 0.07, 0.04, '#f0e6d0'); cbox(X, -0.21, 0.185, 0.08, 0.1, 0.045, 0.1, '#d9463c'); cbox(X, -0.23, 0.21, 0.1, 0.025, 0.02, 0.025, '#fff'); cbox(X, -0.19, 0.205, 0.05, 0.02, 0.02, 0.02, '#fff');
    cbox(X, 0.2, 0.17, -0.04, 0.03, 0.05, 0.03, '#f0e6d0'); cbox(X, 0.2, 0.205, -0.04, 0.07, 0.035, 0.07, '#e8a040'); cbox(X, 0.21, 0.225, -0.03, 0.02, 0.02, 0.02, '#fff');
  }
  if (X.length) head.add(part(X));
  if (G.length) head.add(part(G, glowMat));
  // tools, shown one at a time while working
  const tools = {} as Record<ToolKey, THREE.Group>;
  for (const k of Object.keys(TOOL_PARTS) as ToolKey[]) {
    const L: THREE.BufferGeometry[] = []; TOOL_PARTS[k](L);
    const g = new THREE.Group(); g.position.set(0, -0.2, 0); g.rotation.x = 0.15; g.add(part(L)); g.visible = false;
    arms[1].add(g); tools[k] = g;
  }
  // selection ring + soft contact shadow
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 24), new THREE.MeshBasicMaterial({ color: '#f2c14e', side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.visible = false; root.add(ring);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012; root.add(shadow);
  root.traverse(o => { if ((o as THREE.Mesh).isMesh) o.userData.char = id; });
  return { id, def: d, root, body, head, hips, arms, eyes, tools, glowMat, ring };
}
