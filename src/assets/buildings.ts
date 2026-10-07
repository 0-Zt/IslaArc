import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { vbox, MAT, type MatKey } from './voxel';
import { modelBrasero, type Sym, type Design } from './ruins';
/** Which brazier the next 'brasero' model is (set by the ruins code just before it creates one). */
let braseroNext: [Design, Sym] = ['runas', 'spiral'];
export function setBraseroNext(d: Design, s: Sym) { braseroNext = [d, s]; }

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

/* ---------- decoration ---------- */
export function modelFarol(): Model {
  const M = parts();
  vbox(M.stone, 0, 0.05, 0, 0.3, 0.1, 0.3, '#9a948a'); vbox(M.stone, 0, 0.12, 0, 0.2, 0.06, 0.2, '#8a847a');
  vbox(M.plank, 0, 0.5, 0, 0.07, 0.72, 0.07, '#4a3a2e');
  vbox(M.plank, 0, 0.87, 0, 0.24, 0.03, 0.24, '#3a2e24');
  for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) vbox(M.plank, x, 0.98, z, 0.03, 0.2, 0.03, '#3a2e24');
  vbox(M.plank, 0, 1.1, 0, 0.28, 0.04, 0.28, '#3a2e24'); vbox(M.plank, 0, 1.15, 0, 0.14, 0.05, 0.14, '#3a2e24');
  const g = group(M);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.3, 0.12) }));
  glow.position.set(0, 0.98, 0); g.add(glow);
  return { group: g, glow, smoke: [0, 1.3, 0] };
}
export function modelCerco(): Model {
  const M = parts();
  for (const x of [-0.42, 0, 0.42]) { vbox(M.plank, x, 0.22, 0, 0.08, 0.44, 0.08, '#8a5a2e'); vbox(M.plank, x, 0.46, 0, 0.1, 0.04, 0.1, '#6a4226'); }
  for (const y of [0.16, 0.34]) vbox(M.plank, 0, y, 0.05, 1, 0.07, 0.04, '#a8743e');
  return { group: group(M), smoke: [0, 0.6, 0] };
}
export function modelBanca(): Model {
  const M = parts();
  for (const x of [-0.32, 0.32]) { vbox(M.stone, x, 0.1, 0, 0.12, 0.2, 0.3, '#9a948a'); }
  vbox(M.plank, 0, 0.23, 0.02, 0.84, 0.06, 0.32, '#b07a44'); vbox(M.plank, 0, 0.23, 0.02, 0.84, 0.01, 0.02, '#8a5a2e');
  for (const x of [-0.32, 0.32]) vbox(M.plank, x, 0.4, -0.13, 0.06, 0.3, 0.05, '#8a5a2e');
  vbox(M.plank, 0, 0.46, -0.14, 0.84, 0.12, 0.04, '#b07a44');
  return { group: group(M), smoke: [0, 0.6, 0] };
}
export function modelMacetero(): Model {
  const M = parts(), L: THREE.BufferGeometry[] = [];
  vbox(M.stone, 0, 0.14, 0, 0.62, 0.28, 0.62, '#a49e92'); vbox(M.stone, 0, 0.29, 0, 0.7, 0.04, 0.7, '#8a847a');
  vbox(M.bark, 0, 0.29, 0, 0.52, 0.03, 0.52, '#6a4428');
  const cols = ['#ff9ec4', '#ffd84a', '#8ab8ff', '#fff6e0'];
  [[-0.14, -0.12], [0.12, -0.14], [0.14, 0.12], [-0.12, 0.14], [0, 0]].forEach(([x, z], k) => {
    vbox(L, x, 0.38, z, 0.04, 0.16, 0.04, '#3f9434'); vbox(L, x, 0.48, z, 0.1, 0.06, 0.1, cols[k % 4]); vbox(L, x, 0.52, z, 0.04, 0.03, 0.04, '#ffd84a');
  });
  const g = group({ ...M, leaf: L });
  return { group: g, smoke: [0, 0.7, 0] };
}

/** Sawmill: a log on a saw bench under a lean-to roof, a water wheel and a stack of planks. */
export function modelAserradero(): Model {
  const M = parts();
  vbox(M.stone, 0, 0.05, 0, 1.86, 0.1, 0.9, '#a49e92');
  for (const [x, z] of [[-0.7, -0.3], [0.4, -0.3], [-0.7, 0.3], [0.4, 0.3]]) vbox(M.plank, x, 0.5, z, 0.08, 0.9, 0.08, '#6a4226');
  vbox(M.thatch, -0.15, 0.98, 0, 1.4, 0.08, 0.9, '#d4a444'); vbox(M.thatch, -0.15, 1.05, 0, 1.2, 0.06, 0.7, '#e0b050');
  vbox(M.plank, -0.15, 0.38, 0, 1.0, 0.08, 0.36, '#8a5a2e');                       // bench
  vbox(M.bark, -0.2, 0.52, 0, 0.9, 0.2, 0.2, '#7a4a2a'); vbox(M.plank, 0.26, 0.52, 0, 0.02, 0.2, 0.2, '#e0b878'); // log
  vbox(M.stone, 0.05, 0.62, 0, 0.3, 0.3, 0.02, '#c8ccd4');                            // saw blade
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; vbox(M.plank, 0.78 + Math.cos(a) * 0.22, 0.4 + Math.sin(a) * 0.22, 0.2, 0.08, 0.08, 0.1, '#8a5a2e'); }
  vbox(M.plank, 0.78, 0.4, 0.2, 0.06, 0.06, 0.18, '#5e3a1e');                        // wheel hub
  for (let k = 0; k < 4; k++) vbox(M.plank, 0.75, 0.13 + k * 0.07, -0.25, 0.4, 0.06, 0.26, k % 2 ? '#c08a50' : '#e0b070');  // planks
  return { group: group(M), smoke: [0.05, 0.9, 0] };
}
/** Workshop: an open shed with a big workbench, tools on the wall and a glowing lamp. */
export function modelTaller(): Model {
  const M = parts();
  vbox(M.stone, 0, 0.05, 0, 1.86, 0.1, 0.9, '#a49e92');
  vbox(M.brick, 0, 0.5, -0.36, 1.7, 0.9, 0.12, '#b8804c');
  for (const x of [-0.8, 0.8]) vbox(M.brick, x, 0.5, 0, 0.12, 0.9, 0.8, '#b8804c');
  vbox(M.thatch, 0, 1.0, 0, 1.9, 0.08, 1.0, '#c08a50'); vbox(M.thatch, 0, 1.08, -0.1, 1.7, 0.08, 0.7, '#a8743e');
  vbox(M.plank, 0, 0.42, 0.05, 1.2, 0.07, 0.4, '#8a5a2e'); for (const x of [-0.5, 0.5]) vbox(M.plank, x, 0.2, 0.05, 0.06, 0.38, 0.34, '#6a4226');
  vbox(M.stone, -0.3, 0.5, 0.05, 0.2, 0.08, 0.14, '#c8ccd4'); vbox(M.plank, 0.2, 0.49, 0.1, 0.3, 0.05, 0.2, '#e0b878'); vbox(M.stone, 0.35, 0.53, -0.02, 0.1, 0.1, 0.1, '#8fd4e0');
  vbox(M.plank, -0.4, 0.75, -0.29, 0.05, 0.3, 0.02, '#6a4226'); vbox(M.stone, -0.4, 0.88, -0.28, 0.14, 0.06, 0.02, '#b9c2cc');
  vbox(M.plank, 0.1, 0.75, -0.29, 0.04, 0.26, 0.02, '#6a4226'); vbox(M.stone, 0.1, 0.62, -0.28, 0.1, 0.08, 0.02, '#b9c2cc');
  const g = group(M);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.2, 0.08) }));
  glow.position.set(0.6, 0.85, -0.2); g.add(glow);
  return { group: g, glow, smoke: [0, 1.3, 0] };
}

/** Storehouse: a long wooden shed on a stone base, a wide door, crates and sacks out front. */
export function modelAlmacen(): Model {
  const M = parts();
  vbox(M.stone, 0, 0.06, 0, 1.9, 0.12, 0.92, '#a49e92');
  vbox(M.plank, 0, 0.5, -0.05, 1.7, 0.78, 0.7, '#b07a44');                                  // walls
  for (const x of [-0.84, -0.28, 0.28, 0.84]) vbox(M.bark, x, 0.5, 0.31, 0.08, 0.8, 0.06, '#6a4226');   // posts
  vbox(M.plank, 0, 0.88, 0.31, 1.76, 0.06, 0.06, '#6a4226');                                 // lintel
  vbox(M.plank, 0, 0.42, 0.305, 0.5, 0.6, 0.04, '#5e3a1e');                                   // big door
  vbox(M.plank, 0, 0.42, 0.33, 0.04, 0.6, 0.02, '#8a5a2e'); vbox(M.plank, 0, 0.42, 0.33, 0.5, 0.04, 0.02, '#8a5a2e');
  // gabled roof in two slabs
  for (const [z, y] of [[-0.24, 1.0], [0.16, 1.0]] as [number, number][]) vbox(M.thatch, 0, y, z, 1.95, 0.08, 0.5, '#c0703c');
  vbox(M.thatch, 0, 1.08, -0.04, 1.95, 0.08, 0.3, '#d4844a'); vbox(M.thatch, 0, 1.14, -0.04, 1.95, 0.05, 0.12, '#a85a30');
  // crates and sacks
  vbox(M.plank, -0.62, 0.2, 0.52, 0.28, 0.24, 0.24, '#c08a50'); vbox(M.plank, -0.62, 0.2, 0.645, 0.28, 0.04, 0.01, '#8a5a2e');
  vbox(M.plank, -0.62, 0.43, 0.52, 0.22, 0.2, 0.2, '#d4a060');
  vbox(M.thatch, 0.6, 0.18, 0.54, 0.24, 0.2, 0.2, '#e8d8b0'); vbox(M.thatch, 0.6, 0.3, 0.54, 0.12, 0.05, 0.12, '#c8b890');
  vbox(M.thatch, 0.78, 0.15, 0.5, 0.18, 0.16, 0.18, '#dccca0');
  vbox(M.bark, 0.4, 0.1, 0.56, 0.16, 0.12, 0.16, '#8a8f9a');                                   // a little stone pile
  return { group: group(M), smoke: [0, 1.3, 0] };
}

/** Pier: planks on posts reaching out over the water (+Z), a crate and a lantern post at the end. */
export function modelMuelle(): Model {
  const M = parts();
  for (let k = 0; k < 10; k++) { const z = -0.38 + k * 0.2; vbox(M.plank, 0, 0.05, z, 0.66, 0.06, 0.17, k % 3 === 1 ? '#b08450' : k % 3 === 2 ? '#c49660' : '#a87a48'); }
  for (const x of [-0.31, 0.31]) {
    vbox(M.bark, x, 0.1, 0.55, 0.05, 0.05, 1.9, '#6a4226');                                        // side beams
    for (const z of [0.3, 0.9, 1.45]) vbox(M.bark, x, -0.9, z, 0.09, 2.0, 0.09, '#5e3a1e');         // posts down into the sea
  }
  vbox(M.plank, 0.2, 0.2, 1.3, 0.2, 0.2, 0.2, '#c08a50'); vbox(M.plank, 0.2, 0.31, 1.3, 0.22, 0.03, 0.22, '#8a5a2e');   // crate
  vbox(M.bark, -0.3, 0.45, 1.5, 0.05, 0.8, 0.05, '#5e3a1e'); vbox(M.stone, -0.3, 0.84, 1.5, 0.12, 0.1, 0.12, '#3a2e24');  // lantern post
  vbox(M.thatch, -0.27, 0.2, 0.0, 0.16, 0.06, 0.16, '#d8c8a0'); vbox(M.thatch, -0.27, 0.24, 0.0, 0.1, 0.03, 0.1, '#c0b088');  // coiled rope
  const g = group(M);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.3, 0.12) }));
  glow.position.set(-0.3, 0.77, 1.5); g.add(glow);
  return { group: g, glow, smoke: [0, 1, 1.3] };
}

/** Notice board: two posts, a small roof and a board with pinned notes. */
export function modelTablon(): Model {
  const M = parts(), P: THREE.BufferGeometry[] = [];
  for (const x of [-0.7, 0.7]) { vbox(M.plank, x, 0.5, 0, 0.1, 1, 0.1, '#6a4226'); vbox(M.stone, x, 0.05, 0, 0.2, 0.1, 0.2, '#8a847a'); }
  vbox(M.plank, 0, 0.6, 0, 1.3, 0.6, 0.06, '#b07a44'); vbox(M.plank, 0, 0.6, 0.035, 1.34, 0.64, 0.02, '#8a5a2e');
  vbox(M.thatch, 0, 1.02, 0, 1.6, 0.08, 0.36, '#d4a444'); vbox(M.thatch, 0, 1.08, 0, 1.3, 0.06, 0.26, '#e0b050');
  [[-0.4, 0.72, '#fff6e0'], [-0.05, 0.58, '#fff0c8'], [0.32, 0.74, '#ffe0e8'], [0.4, 0.46, '#e8f4ff'], [-0.35, 0.44, '#fff6e0']].forEach(([x, y, c]) => { vbox(P, x as number, y as number, 0.055, 0.22, 0.18, 0.01, c as string); vbox(P, x as number, (y as number) + 0.07, 0.062, 0.03, 0.03, 0.01, '#d9463c'); });
  const g = group({ ...M, plank: M.plank.concat(P) });
  return { group: g, smoke: [0, 1.2, 0] };
}

/** Scaffolding shown around a building while it is being built. */
export function modelScaffold(w: number, d: number, h: number) {
  const P: THREE.BufferGeometry[] = [];
  const hx = w / 2 + 0.04, hz = d / 2 + 0.04;
  for (const [x, z] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) vbox(P, x, h / 2, z, 0.06, h, 0.06, '#c9a06a');
  for (let y = 0.35; y < h; y += 0.45) { vbox(P, 0, y, hz, w + 0.1, 0.05, 0.05, '#b08450'); vbox(P, 0, y, -hz, w + 0.1, 0.05, 0.05, '#b08450'); vbox(P, hx, y, 0, 0.05, 0.05, d + 0.1, '#b08450'); vbox(P, -hx, y, 0, 0.05, 0.05, d + 0.1, '#b08450'); }
  vbox(P, 0, 0.04, hz + 0.12, Math.min(0.6, w * 0.5), 0.08, 0.16, '#8a5a2e'); // a stack of planks
  return group({ plank: P });
}

export const MODELS: Record<string, () => Model> = { casa: modelCasa, horno: modelHorno, tablon: modelTablon, almacen: modelAlmacen, muelle: modelMuelle, aserradero: modelAserradero, taller: modelTaller, farol: modelFarol, cerco: modelCerco, banca: modelBanca, macetero: modelMacetero, brasero: () => modelBrasero(braseroNext[0], braseroNext[1]) };

export const ICONS: Record<string, string> = {
  casa: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="8" y="18" width="24" height="16" fill="#d9a066"/><rect x="17" y="24" width="6" height="10" fill="#7a4f2a"/><path d="M4 20L20 7L36 20Z" fill="#e0b050"/><rect x="27" y="8" width="4" height="8" fill="#8a847a"/></svg>',
  horno: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="30" width="32" height="5" fill="#a49e92"/><path d="M6 30Q6 14 18 14Q30 14 30 30Z" fill="#b86a42"/><rect x="13" y="23" width="10" height="7" rx="3" fill="#ff7a2a"/><rect x="22" y="6" width="4" height="10" fill="#8a847a"/></svg>',
  hacha: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="18" y="8" width="4" height="28" rx="1" fill="#8a5a2e"/><path d="M20 8H32V20Q26 20 20 16Z" fill="#dde3ea"/><path d="M30 8H32V20H30Z" fill="#fff"/></svg>',
  pico: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="18" y="10" width="4" height="26" rx="1" fill="#8a5a2e"/><path d="M6 12Q20 4 34 12L34 14Q20 8 6 14Z" fill="#b9c2cc"/></svg>',
  expandir: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="22" width="36" height="14" fill="#3a8fd6"/><rect x="4" y="16" width="16" height="10" fill="#5cb847"/><rect x="4" y="24" width="16" height="6" fill="#8b5a35"/><rect x="22" y="18" width="14" height="10" fill="none" stroke="#f2c14e" stroke-width="2" stroke-dasharray="3 2"/><path d="M29 8v8M25 12h8" stroke="#f2c14e" stroke-width="2.5"/></svg>',
  plantar: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="28" width="28" height="7" fill="#7a5030"/><rect x="18" y="16" width="3" height="13" fill="#6a4a2a"/><path d="M20 18Q10 18 9 10Q18 9 20 18Z" fill="#6fc955"/><path d="M20 15Q29 14 31 7Q22 6 20 15Z" fill="#8ad96b"/></svg>',
  pino: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="18" y="28" width="4" height="8" fill="#6a3f22"/><path d="M20 4L31 18H9Z" fill="#3f8a4a"/><path d="M20 12L33 28H7Z" fill="#35773f"/></svg>',
  roble: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="17" y="24" width="6" height="12" fill="#6a3f22"/><rect x="7" y="8" width="26" height="18" rx="7" fill="#5fb84a"/><rect x="11" y="10" width="10" height="7" rx="3" fill="#7fd060"/></svg>',
  abedul: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="18" y="20" width="4" height="16" fill="#e8e0d0"/><rect x="18" y="26" width="4" height="2" fill="#4a4038"/><rect x="11" y="4" width="18" height="20" rx="8" fill="#b8d860"/></svg>',
  sendero: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="4" width="36" height="32" fill="#5cb847"/><path d="M14 36L18 4H26L28 36Z" fill="#b08a5a"/><rect x="19" y="12" width="3" height="2" fill="#d8d2c6"/><rect x="22" y="24" width="3" height="2" fill="#d8d2c6"/></svg>',
  aserradero: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="10" width="32" height="4" fill="#d4a444"/><rect x="6" y="14" width="3" height="20" fill="#6a4226"/><rect x="31" y="14" width="3" height="20" fill="#6a4226"/><rect x="9" y="22" width="22" height="7" fill="#7a4a2a"/><circle cx="20" cy="22" r="6" fill="#c8ccd4"/><rect x="8" y="31" width="24" height="4" fill="#e0b070"/></svg>',
  taller: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="8" width="34" height="5" fill="#c08a50"/><rect x="5" y="13" width="30" height="20" fill="#b8804c"/><rect x="9" y="22" width="22" height="4" fill="#8a5a2e"/><circle cx="29" cy="17" r="3" fill="#ffd24a"/><rect x="12" y="16" width="2" height="6" fill="#6a4226"/><rect x="11" y="15" width="4" height="2" fill="#b9c2cc"/></svg>',
  almacen: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="32" width="34" height="4" fill="#a49e92"/><rect x="5" y="16" width="30" height="16" fill="#b07a44"/><path d="M2 17L20 7L38 17Z" fill="#c0703c"/><rect x="15" y="20" width="10" height="12" fill="#5e3a1e"/><rect x="19.5" y="20" width="1" height="12" fill="#8a5a2e"/><rect x="4" y="27" width="7" height="6" fill="#d4a060"/><rect x="29" y="27" width="7" height="6" fill="#e8d8b0"/></svg>',
  muelle: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="0" y="24" width="40" height="16" fill="#3a8fd6"/><rect x="0" y="28" width="40" height="2" fill="#7ec0f0" opacity=".6"/><rect x="2" y="18" width="36" height="6" fill="#b08450"/><rect x="2" y="18" width="36" height="2" fill="#c49660"/><rect x="6" y="24" width="3" height="14" fill="#5e3a1e"/><rect x="20" y="24" width="3" height="14" fill="#5e3a1e"/><rect x="33" y="24" width="3" height="14" fill="#5e3a1e"/><rect x="33" y="6" width="2" height="12" fill="#5e3a1e"/><rect x="31" y="4" width="6" height="4" fill="#ffd27a"/></svg>',
  anzuelo: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M22 4V26A6 6 0 0 1 10 26V22" stroke="#c8ccd4" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M10 22L6 26" stroke="#c8ccd4" stroke-width="3" stroke-linecap="round"/><rect x="19" y="2" width="6" height="5" rx="1" fill="#8a847a"/></svg>',
  tablon: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="12" width="3" height="26" fill="#6a4226"/><rect x="30" y="12" width="3" height="26" fill="#6a4226"/><rect x="5" y="13" width="30" height="16" fill="#b07a44"/><rect x="3" y="8" width="34" height="5" fill="#d4a444"/><rect x="9" y="16" width="8" height="7" fill="#fff6e0"/><rect x="21" y="17" width="9" height="8" fill="#ffe0e8"/><rect x="12" y="15" width="2" height="2" fill="#d9463c"/><rect x="25" y="16" width="2" height="2" fill="#d9463c"/></svg>',
  farol: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="14" y="33" width="12" height="4" fill="#9a948a"/><rect x="18.5" y="16" width="3" height="18" fill="#4a3a2e"/><rect x="13" y="6" width="14" height="3" fill="#3a2e24"/><rect x="15" y="9" width="10" height="8" fill="#ffd27a"/><rect x="13" y="17" width="14" height="2" fill="#3a2e24"/></svg>',
  cerco: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="12" width="4" height="22" fill="#8a5a2e"/><rect x="18" y="12" width="4" height="22" fill="#8a5a2e"/><rect x="30" y="12" width="4" height="22" fill="#8a5a2e"/><rect x="4" y="17" width="32" height="4" fill="#a8743e"/><rect x="4" y="26" width="32" height="4" fill="#a8743e"/></svg>',
  banca: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="12" width="28" height="6" fill="#b07a44"/><rect x="6" y="22" width="28" height="5" fill="#b07a44"/><rect x="9" y="27" width="4" height="8" fill="#9a948a"/><rect x="27" y="27" width="4" height="8" fill="#9a948a"/></svg>',
  macetero: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="8" y="22" width="24" height="13" fill="#a49e92"/><rect x="6" y="20" width="28" height="3" fill="#8a847a"/><rect x="12" y="12" width="5" height="5" fill="#ff9ec4"/><rect x="21" y="9" width="5" height="5" fill="#ffd84a"/><rect x="26" y="14" width="5" height="5" fill="#8ab8ff"/><rect x="14" y="17" width="2" height="4" fill="#3f9434"/><rect x="23" y="14" width="2" height="7" fill="#3f9434"/></svg>',
  lingote: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 26L14 16H32L26 26Z" fill="#dde3ea"/><path d="M8 26H26V30H8Z" fill="#8a929e"/><path d="M26 26L32 16V20L26 30Z" fill="#6a7280"/></svg>',
};
