import * as THREE from 'three';
import { rng } from '../core/random';
import { vbox } from './voxel';
import { group } from './buildings';

/* Assets of the secret clearing: ancient trees, the buried figure's mound, and stumps. */

/** Old gnarled tree: wide mossy trunk, roots, a dark heavy canopy with hanging moss. */
export function modelAncientTree(seed: number) {
  const r = rng(seed), jit = (a: number) => (r() - 0.5) * a;
  const B: THREE.BufferGeometry[] = [], L: THREE.BufferGeometry[] = [], S: THREE.BufferGeometry[] = [];
  const tH = 1.05, w = 0.36;
  vbox(B, 0, tH / 2, 0, w, tH, w, '#4e3222'); vbox(B, -w * 0.3, tH * 0.5, 0, w * 0.45, tH, w * 1.02, '#3e2618');
  vbox(B, 0.08, tH * 0.45, w * 0.5, 0.1, 0.14, 0.02, '#2a180e'); // hollow
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7]]) { vbox(B, dx * w * 0.75, 0.05, dz * w * 0.75, 0.18, 0.1, 0.18, '#4e3222'); vbox(B, dx * w * 1.05, 0.03, dz * w * 1.05, 0.12, 0.06, 0.12, '#3e2618'); }
  vbox(B, w * 0.85, tH * 0.78, 0, w * 1.1, 0.14, 0.14, '#4e3222'); vbox(B, -w * 0.6, tH * 0.9, w * 0.4, 0.14, 0.14, w * 0.9, '#3e2618');
  // moss patches on the bark
  for (let k = 0; k < 7; k++) { const f = r() < 0.5 ? 1 : -1; vbox(S, f * w * 0.51, 0.15 + r() * 0.7, jit(w * 0.6), 0.02, 0.12, 0.1, '#5a9a3e'); }
  // the canopy leans outward (+z), leaving the clearing's centre open to the sky
  const cy = tH + 0.45, oz = 0.38, P = ['#2a5a2c', '#316633', '#3a7438', '#24502a'];
  vbox(B, 0, tH + 0.08, oz * 0.5, 0.2, 0.2, oz + 0.2, '#4e3222');
  vbox(L, 0, cy, oz, 1.1, 0.56, 1.0, P[1]);
  for (let k = 0; k < 10; k++) { const a = r() * Math.PI * 2, rad = 0.38 + r() * 0.2, sz = 0.32 + r() * 0.22; vbox(L, Math.cos(a) * rad, cy + jit(0.36), oz + Math.sin(a) * rad * 0.8, sz, sz * 0.8, sz, P[Math.floor(r() * 4)]); }
  for (let k = 0; k < 5; k++) vbox(L, jit(0.6), cy + 0.32 + r() * 0.1, oz + jit(0.5), 0.28, 0.14, 0.28, k % 2 ? '#4a8a44' : '#3f7d3c');
  for (let k = 0; k < 9; k++) { const a = r() * Math.PI * 2, rad = 0.52 + r() * 0.1, len = 0.18 + r() * 0.26; vbox(S, Math.cos(a) * rad, cy - 0.3 - len / 2, oz + Math.sin(a) * rad * 0.8, 0.05, len, 0.05, '#6aa84a'); }
  const g = group({ bark: B, leaf: L, thatch: S });
  return g;
}

/** Mound of earth with a green clay head, two leaves and a hand poking out. */
export function modelMound() {
  const D: THREE.BufferGeometry[] = [], C: THREE.BufferGeometry[] = [];
  vbox(D, 0, 0.06, 0, 0.8, 0.12, 0.7, '#6a4428'); vbox(D, 0, 0.15, 0, 0.56, 0.1, 0.5, '#7a5030'); vbox(D, 0.05, 0.22, -0.03, 0.3, 0.06, 0.28, '#8a5c38');
  vbox(D, -0.3, 0.14, 0.2, 0.12, 0.08, 0.1, '#5e3a22'); vbox(D, 0.28, 0.12, -0.22, 0.1, 0.06, 0.12, '#5e3a22');
  vbox(C, 0.06, 0.28, 0.02, 0.2, 0.1, 0.18, '#7e9c58'); vbox(C, 0.06, 0.34, 0.02, 0.14, 0.04, 0.12, '#5f8a3a');
  vbox(C, 0.06, 0.4, 0.02, 0.03, 0.1, 0.03, '#4f7a34'); vbox(C, 0.12, 0.45, 0.02, 0.1, 0.03, 0.05, '#8ccf5a'); vbox(C, 0, 0.45, 0.02, 0.1, 0.03, 0.05, '#8ccf5a');
  vbox(C, -0.2, 0.22, -0.1, 0.07, 0.12, 0.07, '#7e9c58'); vbox(C, -0.2, 0.3, -0.1, 0.09, 0.05, 0.09, '#6f8c4c');
  return group({ stone: D, leaf: C });
}

/** Stump left behind by a felled tree until it regrows. */
export function modelStump(bark = '#6a3f22') {
  const B: THREE.BufferGeometry[] = [], P: THREE.BufferGeometry[] = [];
  vbox(B, 0, 0.07, 0, 0.2, 0.14, 0.2, bark);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1]]) vbox(B, dx * 0.12, 0.03, dz * 0.12, 0.1, 0.06, 0.1, bark);
  vbox(P, 0, 0.145, 0, 0.16, 0.012, 0.16, '#e0b878'); vbox(P, 0, 0.15, 0, 0.06, 0.01, 0.06, '#c89858');
  return group({ bark: B, plank: P });
}

/** A seedling: a thin stem with a couple of leaves (needles for a pine). */
export function modelSprout(type: 'pino' | 'roble' | 'abedul', big = false) {
  const S: THREE.BufferGeometry[] = [], L: THREE.BufferGeometry[] = [], D: THREE.BufferGeometry[] = [];
  const k = big ? 2.4 : 1.7;
  vbox(D, 0, 0.025, 0, 0.3, 0.05, 0.3, '#6a4428');
  vbox(S, 0, 0.1 * k, 0, 0.035, 0.2 * k, 0.035, type === 'abedul' ? '#e8e0d0' : '#7a5030');
  const leaf = type === 'pino' ? '#3f8a4a' : type === 'abedul' ? '#b8d860' : '#5fb84a';
  if (type === 'pino') { vbox(L, 0, 0.16 * k, 0, 0.14 * k, 0.07 * k, 0.14 * k, leaf); vbox(L, 0, 0.23 * k, 0, 0.08 * k, 0.07 * k, 0.08 * k, leaf); }
  else { vbox(L, 0.06 * k, 0.19 * k, 0, 0.1 * k, 0.04 * k, 0.07 * k, leaf); vbox(L, -0.06 * k, 0.15 * k, 0.01, 0.1 * k, 0.04 * k, 0.07 * k, leaf); vbox(L, 0, 0.23 * k, 0, 0.06 * k, 0.05 * k, 0.06 * k, leaf); }
  return group({ bark: S, leaf: L, plank: D });
}

/** A planting order: a little dug hole and a stake with a green tag. */
export function modelPlantMark() {
  const D: THREE.BufferGeometry[] = [], P: THREE.BufferGeometry[] = [];
  vbox(D, 0, 0.025, 0, 0.3, 0.05, 0.3, '#7a5030'); vbox(D, 0, 0.05, 0, 0.14, 0.02, 0.14, '#4a2e18');
  vbox(P, 0.2, 0.18, 0.2, 0.04, 0.36, 0.04, '#c9a06a'); vbox(P, 0.2, 0.33, 0.255, 0.04, 0.07, 0.07, '#8ad96b');
  return group({ plank: D.concat(P) });
}

/** A path order: four pegs and a string outline on the grass. */
export function modelPathMark() {
  const P: THREE.BufferGeometry[] = [];
  for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) vbox(P, x, 0.08, z, 0.05, 0.16, 0.05, '#c9a06a');
  for (const s of [-1, 1]) { vbox(P, 0, 0.12, s * 0.4, 0.8, 0.015, 0.015, '#f0e0b0'); vbox(P, s * 0.4, 0.12, 0, 0.015, 0.015, 0.8, '#f0e0b0'); }
  return group({ plank: P });
}
