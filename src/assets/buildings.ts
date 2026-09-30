import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { vbox, MAT, type MatKey } from './voxel';

/* Building models. Local origin = footprint centre on the ground; +z is the front. */

type Parts = Partial<Record<MatKey, THREE.BufferGeometry[]>>;
export function group(parts: Parts) {
  const g = new THREE.Group();
  for (const [k, list] of Object.entries(parts) as [MatKey, THREE.BufferGeometry[]][]) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list), MAT[k]); m.castShadow = true; m.receiveShadow = true; g.add(m);
  }
  return g;
}
const parts = () => ({ stone: [], brick: [], thatch: [], plank: [], bark: [] } as Record<'stone' | 'brick' | 'thatch' | 'plank' | 'bark', THREE.BufferGeometry[]>);

export interface Model { group: THREE.Group; smoke: [number, number, number]; glow?: THREE.Mesh }

export function modelCasa(): Model {
  const M = parts();
  vbox(M.stone, 0, 0.05, 0, 1.84, 0.1, 1.84, '#a49e92');
  vbox(M.brick, 0, 0.14, 0, 1.52, 0.1, 1.38, '#b8804c');
  vbox(M.brick, 0, 0.58, 0, 1.44, 0.86, 1.3, '#d9a066');
  for (const s of [1, -1]) { vbox(M.plank, 0.73 * s, 0.58, 0, 0.04, 0.86, 1.32, '#8a5a2e'); vbox(M.plank, 0, 0.58, 0.65 * s, 1.46, 0.06, 0.04, '#8a5a2e'); }
  vbox(M.plank, 0, 0.38, 0.665, 0.34, 0.54, 0.04, '#7a4f2a'); vbox(M.plank, 0, 0.68, 0.67, 0.44, 0.06, 0.05, '#5e3a1e'); vbox(M.plank, 0.1, 0.38, 0.69, 0.04, 0.04, 0.02, '#e0b050');
  vbox(M.plank, -0.46, 0.62, 0.665, 0.26, 0.24, 0.04, '#5e3a1e'); vbox(M.plank, -0.46, 0.62, 0.675, 0.18, 0.16, 0.02, '#ffd98a');
  for (const s of [1, -1]) { vbox(M.plank, 0.745 * s, 0.62, -0.1, 0.04, 0.26, 0.3, '#5e3a1e'); vbox(M.plank, 0.755 * s, 0.62, -0.1, 0.02, 0.18, 0.22, '#ffd98a'); }
  for (let k = 0; k < 5; k++) vbox(M.thatch, 0, 1.08 + k * 0.15, 0, 1.8, 0.16, 1.74 - k * 0.36, k % 2 ? '#e0b050' : '#d4a444');
  vbox(M.thatch, 0, 1.8, 0, 1.86, 0.08, 0.14, '#b88a34');
  vbox(M.stone, 0.45, 1.5, -0.32, 0.2, 0.64, 0.2, '#8a847a'); vbox(M.stone, 0.45, 1.84, -0.32, 0.26, 0.06, 0.26, '#6a645c');
  vbox(M.brick, 0.48, 0.2, 0.82, 0.16, 0.14, 0.16, '#c07048'); vbox(M.thatch, 0.48, 0.33, 0.82, 0.16, 0.12, 0.16, '#5cb847'); vbox(M.brick, 0.46, 0.41, 0.8, 0.05, 0.05, 0.05, '#ff8ab0');
  vbox(M.plank, -0.44, 0.2, 0.84, 0.42, 0.05, 0.14, '#8a5a2e'); vbox(M.plank, -0.6, 0.12, 0.84, 0.04, 0.12, 0.1, '#6a4226'); vbox(M.plank, -0.28, 0.12, 0.84, 0.04, 0.12, 0.1, '#6a4226');
  return { group: group(M), smoke: [0.45, 1.95, -0.32] };
}

export function modelHorno(): Model {
  const M = parts(), ox = -0.32;
  vbox(M.stone, 0, 0.05, 0, 1.86, 0.1, 0.9, '#a49e92');
  vbox(M.brick, ox, 0.34, 0, 0.98, 0.48, 0.8, '#b86a42'); vbox(M.brick, ox, 0.64, 0, 0.8, 0.14, 0.66, '#a85e3a'); vbox(M.brick, ox, 0.77, 0, 0.56, 0.12, 0.46, '#b86a42'); vbox(M.brick, ox, 0.86, 0, 0.3, 0.08, 0.26, '#a85e3a');
  vbox(M.stone, ox, 0.34, 0.405, 0.42, 0.34, 0.04, '#6a645c'); vbox(M.stone, ox, 0.3, 0.42, 0.28, 0.2, 0.03, '#24140e');
  vbox(M.stone, ox + 0.2, 1.02, -0.14, 0.16, 0.42, 0.16, '#8a847a'); vbox(M.stone, ox + 0.2, 1.25, -0.14, 0.22, 0.05, 0.22, '#6a645c');
  [[0.42, 0.16], [0.58, 0.16], [0.74, 0.16], [0.5, 0.26], [0.66, 0.26], [0.58, 0.36]].forEach(([x, y]) => { vbox(M.bark, x, y, 0, 0.14, 0.1, 0.62, '#8a5a2e'); vbox(M.plank, x, y, 0.315, 0.1, 0.08, 0.02, '#d8b07a'); });
  vbox(M.stone, 0.6, 0.15, 0.34, 0.2, 0.1, 0.14, '#5a5a64'); vbox(M.stone, 0.6, 0.22, 0.34, 0.12, 0.05, 0.1, '#707884');
  const g = group(M);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.12, 0.05) }));
  glow.position.set(ox, 0.28, 0.44); g.add(glow);
  return { group: g, glow, smoke: [ox + 0.2, 1.32, -0.14] };
}

export const MODELS: Record<string, () => Model> = { casa: modelCasa, horno: modelHorno };

export const ICONS: Record<string, string> = {
  casa: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="8" y="18" width="24" height="16" fill="#d9a066"/><rect x="17" y="24" width="6" height="10" fill="#7a4f2a"/><path d="M4 20L20 7L36 20Z" fill="#e0b050"/><rect x="27" y="8" width="4" height="8" fill="#8a847a"/></svg>',
  horno: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="30" width="32" height="5" fill="#a49e92"/><path d="M6 30Q6 14 18 14Q30 14 30 30Z" fill="#b86a42"/><rect x="13" y="23" width="10" height="7" rx="3" fill="#ff7a2a"/><rect x="22" y="6" width="4" height="10" fill="#8a847a"/></svg>',
  hacha: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="18" y="8" width="4" height="28" rx="1" fill="#8a5a2e"/><path d="M20 8H32V20Q26 20 20 16Z" fill="#dde3ea"/><path d="M30 8H32V20H30Z" fill="#fff"/></svg>',
  pico: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="18" y="10" width="4" height="26" rx="1" fill="#8a5a2e"/><path d="M6 12Q20 4 34 12L34 14Q20 8 6 14Z" fill="#b9c2cc"/></svg>',
  lingote: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 26L14 16H32L26 26Z" fill="#dde3ea"/><path d="M8 26H26V30H8Z" fill="#8a929e"/><path d="M26 26L32 16V20L26 30Z" fill="#6a7280"/></svg>',
};
