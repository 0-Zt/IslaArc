import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { vbox, MAT } from '../assets/voxel';
import { makeCanvas } from '../core/canvas';
import { hash } from '../core/random';

/* Builds one floor of the volcano cave from its ASCII map: rock walls in uneven columns,
   a cave floor with gravel and moss, glowing crystals, copper veins, lava that moves,
   pits, and every object that changes as the puzzles are solved (boulders, braziers,
   statues, doors, gates, chests, the shell on its pedestal and the sleeping golem). */

export const CAVE_X = 300, CAVE_Z = 300;     // far from the island, out of its camera view
export const FARO_X = 600, FARO_Z = 0;       // the lighthouse island, another place far away
export const ARD_X = 600, ARD_Z = 320;       // the burning island (v0.20)

/* grass that sways in the wind: a Lambert material whose vertices lean more the higher they are */
export const SWAY = { uniforms: { uTime: { value: 0 } } };
export const SWAY_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
SWAY_MAT.onBeforeCompile = sh => {
  sh.uniforms.uTime = SWAY.uniforms.uTime;
  sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    vec4 swW = modelMatrix * vec4(position, 1.0);
    float swK = max(0.0, position.y);
    transformed.x += sin(uTime * 2.1 + swW.x * 0.9 + swW.z * 0.6) * 0.09 * swK;
    transformed.z += cos(uTime * 1.7 + swW.x * 0.5 + swW.z * 0.8) * 0.05 * swK;`);
};
/* the sea around an outdoor zone */
const seaTex = new THREE.CanvasTexture(makeCanvas(64, 64, x => {
  x.fillStyle = '#3a8fc0'; x.fillRect(0, 0, 64, 64);
  for (let k = 0; k < 26; k++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(160,220,255,.35)' : 'rgba(30,90,150,.35)'; x.fillRect(Math.random() * 64, Math.random() * 64, 6 + Math.random() * 12, 1 + Math.random() * 2); }
}));
seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping; seaTex.magFilter = THREE.NearestFilter; seaTex.repeat.set(12, 12);
export const SEA_MAT = new THREE.MeshLambertMaterial({ map: seaTex, transparent: true, opacity: 0.82, depthWrite: false });
export function seaScroll(dt: number) { seaTex.offset.x += dt * 0.012; seaTex.offset.y += dt * 0.006; }
/** The sea around the burning island: the same water, greyer under the ash. */
export const SEA_DARK = SEA_MAT.clone(); SEA_DARK.color = new THREE.Color(0.58, 0.66, 0.72);
const SPRING_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.15, 1.1), transparent: true, opacity: 0.72, depthWrite: false });
const STEAM_MAT = new THREE.MeshBasicMaterial({ color: '#f4f6f8', transparent: true, opacity: 0.5, depthWrite: false });
export const cellPos = (x: number, z: number, y = 0) => new THREE.Vector3(CAVE_X + x + 0.5, y, CAVE_Z + z + 0.5);

type L = THREE.BufferGeometry[];
const P = () => ({ stone: [] as L, brick: [] as L, plank: [] as L, bark: [] as L, thatch: [] as L });
function merge(parts: Record<string, L>, into: THREE.Group, shadow = true) {
  for (const [k, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list), (MAT as any)[k]); m.castShadow = shadow; m.receiveShadow = true; into.add(m);
  }
}
const H = (x: number, z: number, s = 0) => hash(x * 13 + s, z * 7 + s * 3, 91 + s);
const pick = <T>(a: T[], x: number, z: number, s = 0) => a[Math.floor(H(x, z, s) * a.length) % a.length];

/* glowing bits: crystals, lava, flames, runes — basic materials with colours over 1 so bloom picks them up */
const glow = (r: number, g: number, b: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
export const GLOW = {
  crystal: glow(0.5, 2.2, 2.6), crystalDim: glow(0.15, 0.5, 0.6), mush: glow(0.4, 1.8, 1.4), mush2: glow(1.6, 0.6, 1.9),
  flame: glow(3.2, 1.4, 0.3), flameCore: glow(3.6, 2.8, 1.2), rune: glow(0.2, 0.25, 0.3), runeOn: glow(2.6, 1.3, 0.35),
  ember: glow(1.7, 0.55, 0.12), obsGlint: glow(1.2, 0.6, 2.2),
  eye: glow(0.25, 0.08, 0.05), eyeOn: glow(3, 1.2, 0.3), orb: glow(0.3, 0.3, 0.35), orbOn: glow(2.6, 2.2, 1.2), shell: glow(2.2, 1.7, 1.6),
};
const lavaTex = new THREE.CanvasTexture(makeCanvas(64, 64, x => {
  for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) {
    const v = 0.5 + 0.25 * Math.sin(i * 0.35 + Math.sin(j * 0.21) * 2) + 0.25 * Math.sin(j * 0.29 + Math.cos(i * 0.17) * 2);
    const r = 200 + v * 55, g = 60 + v * 120, b = 10 + v * 30;
    x.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; x.fillRect(i, j, 1, 1);
  }
  // a dark crust that floats on top, so the river reads as moving rock and not as a flat light
  for (let k = 0; k < 26; k++) { const cx = Math.random() * 64, cy = Math.random() * 64, w = 4 + Math.random() * 9, h = 2 + Math.random() * 5;
    x.fillStyle = 'rgba(70,22,8,.75)'; x.fillRect(cx, cy, w, h); x.fillStyle = 'rgba(40,12,6,.6)'; x.fillRect(cx + 1, cy + 1, w - 2, Math.max(1, h - 2)); }
}));
lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping; lavaTex.magFilter = THREE.NearestFilter;
export const LAVA_MAT = new THREE.MeshBasicMaterial({ map: lavaTex, color: new THREE.Color(1.55, 1.0, 0.8) });
const glowTex = new THREE.CanvasTexture(makeCanvas(64, 64, x => { const g = x.createRadialGradient(32, 32, 2, 32, 32, 31); g.addColorStop(0, 'rgba(255,200,120,0.9)'); g.addColorStop(0.5, 'rgba(255,140,60,0.3)'); g.addColorStop(1, 'rgba(255,120,40,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }));
export const lightDecal = (size: number, color = '#ffb070') => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 2; return m;
};
/* rune slab texture: carved symbols */
function runeTex(seed: number) {
  return new THREE.CanvasTexture(makeCanvas(32, 48, x => {
    x.fillStyle = '#000'; x.fillRect(0, 0, 32, 48); x.fillStyle = '#fff';
    for (let r = 0; r < 4; r++) { const s = (seed * 7 + r * 13) % 5; const y = 6 + r * 10;
      if (s === 0) { x.fillRect(8, y, 16, 2); x.fillRect(15, y, 2, 7); }
      else if (s === 1) { x.fillRect(9, y, 2, 7); x.fillRect(21, y, 2, 7); x.fillRect(9, y + 3, 14, 2); }
      else if (s === 2) { x.fillRect(10, y, 12, 2); x.fillRect(10, y + 5, 12, 2); x.fillRect(10, y, 2, 7); }
      else if (s === 3) { for (let k = 0; k < 6; k++) x.fillRect(9 + k * 2, y + k, 3, 2); }
      else { x.fillRect(12, y, 8, 7); x.fillStyle = '#000'; x.fillRect(14, y + 2, 4, 3); x.fillStyle = '#fff'; } }
  }));
}

/** The guardian of the volcano, in parts so it can wake up, stand and swing its arms. */
export interface Golem { g: THREE.Group; torso: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; eyes: THREE.Mesh[]; cracks: THREE.Mesh[]; tail?: THREE.Group }
export interface FloorView {
  root: THREE.Group;
  boulders: Map<string, THREE.Group>;           // key "x,z" → mesh (moves with the boulder)
  braziers: Map<string, { flame: THREE.Group; decal: THREE.Mesh; light: THREE.PointLight | null; pos: THREE.Vector3 }>;
  statues: Map<string, { g: THREE.Group; eyes: THREE.Mesh[] }>;
  doors: Map<string, THREE.Group>; gates: Map<string, THREE.Group>; plates: Map<string, THREE.Mesh>;
  crystals: Map<string, THREE.Group>; veins: Map<string, THREE.Group>; chests: Map<string, { lid: THREE.Group }>;
  rubble: Map<string, THREE.Group>; pits: Map<string, THREE.Group>; lava: Map<string, THREE.Mesh>;
  altar: { orb: THREE.Mesh } | null; shell: THREE.Group | null; golem: Golem | null;
  cracked: Map<string, THREE.Group>; relic: THREE.Group | null;
  vines: Map<string, THREE.Group>; ferns: Map<string, { tall: THREE.Group; stub: THREE.Group }>;
  chasms: Map<string, { plank: THREE.Group; root: THREE.Group }>; obsidian: Map<string, THREE.Group>; gift: THREE.Group | null;
  pieces: Map<string, THREE.Group>; lamp: { glass: THREE.Mesh; beam: THREE.Group } | null;
  embers: THREE.Vector3[]; lavaLights: THREE.PointLight[];
  /* the burning island (v0.20) */
  flows: Map<string, THREE.Mesh>; geysers: Map<string, { col: THREE.Mesh; pos: THREE.Vector3; always: boolean }>;
  chimneys: Map<string, { flame: THREE.Group; glow: THREE.Mesh; top: THREE.Vector3 }>; forge: { fire: THREE.Group; embers: THREE.Mesh } | null;
  foes: Map<string, Golem>; springs: [number, number][]; crater: THREE.Vector3 | null;
}

const isWall = (c: string | undefined) => !c || c === '#';

export function buildFloor(map: string[], dirs: Record<string, string>, decor: { mushrooms: number[][]; stalagmites: number[][] }, relicKind = 0, theme = 'cueva', ox = CAVE_X, oz = CAVE_Z): FloorView {
  const W = map[0].length, Hh = map.length;
  const at = (x: number, z: number) => (map[z] && map[z][x]) || (theme === 'isla' || theme === 'volcan' ? 'w' : '#');
  const root = new THREE.Group(); root.position.set(ox, 0, oz);
  const isla = theme === 'isla', torre = theme === 'torre', volcan = theme === 'volcan', outdoor = isla || volcan;
  const v: FloorView = { root, boulders: new Map(), braziers: new Map(), statues: new Map(), doors: new Map(), gates: new Map(), plates: new Map(), crystals: new Map(), veins: new Map(), chests: new Map(), rubble: new Map(), pits: new Map(), lava: new Map(), altar: null, shell: null, golem: null, embers: [], lavaLights: [], cracked: new Map(), relic: null, vines: new Map(), ferns: new Map(), chasms: new Map(), obsidian: new Map(), gift: null, pieces: new Map(), lamp: null, flows: new Map(), geysers: new Map(), chimneys: new Map(), forge: null, foes: new Map(), springs: [], crater: null };
  const S = P(); const glowParts: Record<string, L> = {};
  const addGlow = (k: keyof typeof GLOW, g: THREE.BufferGeometry) => { (glowParts[k] = glowParts[k] || []).push(g); };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };

  const FLOOR = torre ? ['#8a6a46', '#94724c', '#7e6040', '#8e6e48'] : volcan ? ['#867e79', '#8e857f', '#7c7571', '#89817a'] : ['#6a5c50', '#72624f', '#655648', '#6e5f52'];
  const MOSS = volcan ? ['#6e6662', '#766c66', '#6a625e'] : ['#5c6a40', '#647345', '#556238'];
  const ROCK = torre ? ['#b8b0a4', '#c4bcb0', '#aaa296', '#bcb4a8'] : ['#3e3a44', '#47424d', '#38343e', '#4c4651'], DEEP = torre ? '#5a544c' : '#16141a';
  const GRASS = ['#6fae4a', '#78b850', '#66a444', '#73b04c'], SAND = ['#e8d8a0', '#e0d098', '#ecdca8'];
  const land = (q: string) => q !== 'w' && q !== '#';
  if (isla) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(W + 90, Hh + 90), SEA_MAT); sea.rotation.x = -Math.PI / 2; sea.position.set(W / 2, -0.12, Hh / 2); sea.renderOrder = 1; root.add(sea);
  }
  if (volcan) {
    // the sea only where there is water (so the sunken lava, cracks and pits on land stay visible),
    // plus four wide strips around the map; texture coordinates follow the world, so it reads as one sea
    const parts: THREE.BufferGeometry[] = [];
    const quad = (x0: number, z0: number, w: number, d: number) => {
      const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); g.translate(x0 + w / 2, -0.12, z0 + d / 2);
      const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + 45) / (W + 90), 1 - (pos.getZ(i) + 45) / (Hh + 90));
      parts.push(g);
    };
    quad(-45, -45, W + 90, 45); quad(-45, Hh, W + 90, 45); quad(-45, 0, 45, Hh); quad(W, 0, 45, Hh);
    for (let z = 0; z < Hh; z++) for (let x = 0; x < W; x++) { const c = at(x, z); if (c === 'w' || c === 'S') quad(x, z, 1, 1); }
    const sea = new THREE.Mesh(mergeGeometries(parts), SEA_DARK); sea.renderOrder = 1; root.add(sea);
  }
  // water not joined to the open sea is a hot spring (the burning island)
  const spring = new Set<string>();
  if (volcan) {
    const sea = new Set<string>(), q: [number, number][] = [];
    for (let z = 0; z < Hh; z++) for (let x = 0; x < W; x++) if ((x === 0 || z === 0 || x === W - 1 || z === Hh - 1) && at(x, z) === 'w') { sea.add(`${x},${z}`); q.push([x, z]); }
    while (q.length) { const [x, z] = q.shift()!; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${x + a},${z + b}`; if (!sea.has(k) && at(x + a, z + b) === 'w' && x + a >= 0 && z + b >= 0 && x + a < W && z + b < Hh) { sea.add(k); q.push([x + a, z + b]); } } }
    for (let z = 0; z < Hh; z++) for (let x = 0; x < W; x++) if (at(x, z) === 'w' && !sea.has(`${x},${z}`)) { spring.add(`${x},${z}`); v.springs.push([x, z]); }
  }
  const springGeo: THREE.BufferGeometry[] = [];
  for (let z = 0; z < Hh; z++) for (let x = 0; x < W; x++) {
    const c = at(x, z), cx = x + 0.5, cz = z + 0.5;
    if (volcan) {
      // the burning island: grey sea, basalt columns, ash and black sand; hot springs inland
      const nearLand = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]].some(([a, b]) => land(at(x + a, z + b)));
      if (c === 'w' || c === 'S') {
        if (spring.has(`${x},${z}`)) { vbox(S.stone, cx, -0.45, cz, 1, 0.2, 1, '#2e5a5e'); const g2 = new THREE.PlaneGeometry(1, 1); g2.rotateX(-Math.PI / 2); g2.translate(cx, -0.1, cz); springGeo.push(g2); }
        else vbox(S.stone, cx, nearLand ? -0.42 : -0.7, cz, 1, 0.2, 1, nearLand ? pick(['#4e4848', '#564e4e'], x, z) : pick(['#4a5a60', '#425258'], x, z));
        if (c === 'S') {
          // where the hot stones from the lava door reach the shore: a ring of warm rock
          for (let k = 0; k < 3; k++) { const sz = 0.5 - k * 0.08; vbox(S.stone, cx + (k - 1) * 0.08, -0.05 - k * 0.12, cz + k * 0.55, sz, 0.2, sz, '#3a3032'); addGlow('ember', box(sz * 0.6, 0.012, 0.05, cx + (k - 1) * 0.08, 0.06 - k * 0.12, cz + k * 0.55)); }
          const d = lightDecal(1.8, '#ff9a50'); d.position.set(cx, 0.02, cz); root.add(d);
        }
        continue;
      }
      if (c === '#') {
        // basalt: a few hexagonal-looking columns of different heights, taller near the volcano
        const tall = z <= 3 ? 1.1 : 0;
        vbox(S.stone, cx, -0.2, cz, 1, 0.4, 1, '#3e3b40');
        const n = 2 + Math.floor(H(x, z, 400) * 3);
        for (let k = 0; k < n; k++) {
          const ox2 = (H(x, z, k + 401) - 0.5) * 0.5, oz2 = (H(x, z, k + 404) - 0.5) * 0.5, w2 = 0.32 + H(x, z, k + 407) * 0.18, h = 0.45 + H(x, z, k + 410) * 0.9 + tall;
          vbox(S.stone, cx + ox2, h / 2, cz + oz2, w2, h, w2, pick(['#4a4650', '#544f5a', '#46424c', '#5a5560'], x, z, k));
          vbox(S.stone, cx + ox2, h + 0.02, cz + oz2, w2 * 0.86, 0.04, w2 * 0.86, H(x, z, k + 413) < 0.45 ? '#a29c96' : '#6a6670');
        }
        continue;
      }
      if (nearLand) for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (at(x + a, z + b) === 'w' && !spring.has(`${x + a},${z + b}`)) vbox(S.thatch, cx + a * 0.47, -0.06, cz + b * 0.47, a ? 0.08 : 1, 0.06, b ? 0.08 : 1, '#c8ccd0');
      if (c === ':') { vbox(S.stone, cx, -0.15, cz, 1, 0.3, 1, pick(['#5c575a', '#645f62', '#575255'], x, z)); if (H(x, z, 420) < 0.4) vbox(S.stone, cx + (H(x, z, 421) - 0.5) * 0.6, 0.02, cz + (H(x, z, 422) - 0.5) * 0.6, 0.08, 0.04, 0.06, '#7a7678'); continue; }
      if (c === ',') {
        vbox(S.stone, cx, -0.15, cz, 1, 0.3, 1, pick(MOSS, x, z));
        for (let k = 0; k < 3; k++) vbox(S.thatch, cx + (H(x, z, k + 430) - 0.5) * 0.7, 0.05, cz + (H(x, z, k + 433) - 0.5) * 0.7, 0.05, 0.1, 0.05, '#8a7a50');
        if (H(x, z, 436) < 0.6) addGlow('ember', box(0.05, 0.012, 0.05, cx + (H(x, z, 437) - 0.5) * 0.6, 0.006, cz + (H(x, z, 438) - 0.5) * 0.6));
        continue;
      }
      // everything else falls through to the shared floor below (ash colours)
    }
    if (isla) {
      // outdoors: sea, rocks on the shore, grass and sand; the dock stands on posts over the water
      const nearLand = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]].some(([a, b]) => land(at(x + a, z + b)));
      if (c === 'w' || c === 'd' || c === 'S') {
        vbox(S.stone, cx, nearLand ? -0.42 : -0.7, cz, 1, 0.2, 1, nearLand ? pick(['#d8c890', '#cfc088'], x, z) : pick(['#8ab0a8', '#7aa49c'], x, z));
        if (c !== 'w') {
          for (let k = 0; k < 5; k++) vbox(S.plank, cx - 0.4 + k * 0.2, 0.02, cz, 0.17, 0.06, 0.95, k % 2 ? '#a8763a' : '#9a6a32');
          for (const [a, b] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) vbox(S.bark, cx + a, -0.25, cz + b, 0.1, 0.6, 0.1, '#6a4a2a');
          if (c === 'S') { vbox(S.bark, cx + 0.35, 0.25, cz + 0.35, 0.14, 0.5, 0.14, '#6a4a2a'); vbox(S.thatch, cx + 0.35, 0.3, cz + 0.35, 0.18, 0.06, 0.18, '#d8c8a0'); }
        }
        continue;
      }
      if (c === '#') {
        const h = 0.45 + H(x, z) * 0.5;
        vbox(S.stone, cx, -0.2, cz, 1, 0.4, 1, pick(['#d8c890', '#8a8078'], x, z));
        vbox(S.stone, cx + (H(x, z, 2) - 0.5) * 0.15, h / 2, cz + (H(x, z, 3) - 0.5) * 0.15, 0.9, h, 0.86, pick(['#8a8478', '#9a9488', '#7e786c'], x, z));
        vbox(S.stone, cx + (H(x, z, 4) - 0.5) * 0.3, h + 0.08, cz, 0.5, 0.16, 0.5, pick(['#a8a296', '#929086'], x, z));
        if (H(x, z, 5) < 0.5) vbox(S.thatch, cx + 0.2, h + 0.18, cz - 0.15, 0.16, 0.06, 0.16, '#6fae4a');
        continue;
      }
      // ground: sand, grass with flowers, burning vents; shallow foam where it meets the water
      const sand = c === ':' || ((c === 'p' || c === 'K') && [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([a, b]) => at(x + a, z + b) === ':'));
      const vent = c === 'b' || (c === 'p' && [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([a, b]) => at(x + a, z + b) === 'b').length >= 2);
      if (vent) {
        vbox(S.stone, cx, -0.15, cz, 1, 0.3, 1, pick(['#8a8270', '#7e7666', '#948c78'], x, z));
        for (let k = 0; k < 3; k++) vbox(S.stone, cx + (H(x, z, k + 210) - 0.5) * 0.7, 0.01, cz + (H(x, z, k + 213) - 0.5) * 0.7, 0.14, 0.02, 0.14, '#d8c040');
        if (H(x, z, 216) < 0.6) { vbox(S.stone, cx, 0.05, cz, 0.3, 0.1, 0.3, '#5a544a'); vbox(S.stone, cx, 0.1, cz, 0.14, 0.02, 0.14, '#1a1814'); v.embers.push(new THREE.Vector3(ox + cx, 0.1, oz + cz)); }
        if (c === 'b') continue;
      } else vbox(S.stone, cx, -0.15, cz, 1, 0.3, 1, sand ? pick(SAND, x, z) : pick(GRASS, x, z));
      if (!sand && !vent && (c === ',' || H(x, z, 220) < 0.18)) for (let k = 0; k < 4; k++) vbox(S.thatch, cx + (H(x, z, k + 221) - 0.5) * 0.8, 0.02, cz + (H(x, z, k + 224) - 0.5) * 0.8, 0.07, 0.04, 0.07, pick(['#f2e0a0', '#e86a8a', '#ffffff', '#a8c8f0'], x, z, k));
      if (sand && H(x, z, 230) < 0.3) vbox(S.stone, cx + (H(x, z, 231) - 0.5) * 0.6, 0.02, cz + (H(x, z, 232) - 0.5) * 0.6, 0.1, 0.04, 0.08, pick(['#f0d8c8', '#ffffff', '#c8b090'], x, z));
      for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (at(x + a, z + b) === 'w') vbox(S.thatch, cx + a * 0.47, -0.06, cz + b * 0.47, a ? 0.08 : 1, 0.06, b ? 0.08 : 1, '#f4fbff');
      continue;
    }
    if (isWall(c)) {
      const nearOpen = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]].some(([a, b]) => !isWall(at(x + a, z + b)));
      if (!nearOpen) { vbox(S.stone, cx, 0.45, cz, 1.0, 0.9, 1.0, DEEP); continue; }
      // the camera looks from the south: a wall with open floor to its north would hide that floor,
      // so those stay low (a ledge); walls behind the floor rise high and give the room its depth
      const front = !isWall(at(x, z - 1)) || !isWall(at(x - 1, z - 1)) && !isWall(at(x + 1, z - 1));
      const back = !isWall(at(x, z + 1));
      const h = torre ? (front ? 0.45 : 0.9 + H(x, z) * 0.2) : front ? 0.5 + H(x, z) * 0.2 : back ? 1.7 + H(x, z) * 0.7 : 1.0 + H(x, z) * 0.5, n = front || torre ? 1 : H(x, z, 2) < 0.5 ? 2 : 3;
      let y = 0;
      for (let k = 0; k < n; k++) {
        const hh = h / n * (0.8 + H(x, z, k + 5) * 0.4), ins = 0.02 + H(x, z, k + 9) * 0.08;
        vbox(S.stone, cx + (H(x, z, k + 11) - 0.5) * 0.08, y + hh / 2, cz + (H(x, z, k + 13) - 0.5) * 0.08, 1.0 - ins, hh, 1.0 - ins, pick(ROCK, x, z, k));
        y += hh;
      }
      vbox(S.stone, cx, y + 0.03, cz, 0.86, 0.06, 0.86, torre ? '#d8d0c4' : front ? '#56515c' : '#25222a');
      if (front) for (let k = 0; k < 2; k++) vbox(S.stone, cx + (H(x, z, k + 33) - 0.5) * 0.6, y + 0.1, cz + (H(x, z, k + 35) - 0.5) * 0.6, 0.18, 0.14, 0.16, pick(ROCK, x, z, k + 3));
      // crystals grow on some walls that face open floor
      if (torre && !front && H(x, z, 32) < 0.35) { vbox(S.plank, cx, y - 0.35, cz, 0.3, 0.3, 0.3, '#bfe4f8'); }   // small windows with sky
      if (H(x, z, 31) < 0.14 && !front && !torre) {
        const side = [[0, 1], [1, 0], [-1, 0]].find(([a, b]) => !isWall(at(x + a, z + b)));
        if (side) { const [a, b] = side; for (let k = 0; k < 3; k++) { const hgt = 0.18 + H(x, z, k + 40) * 0.25; addGlow('crystal', box(0.07, hgt, 0.07, cx + a * 0.52 + (k - 1) * 0.12 * (b ? 1 : 0), 0.5 + H(x, z, k + 44) * 0.6, cz + b * 0.52 + (k - 1) * 0.12 * (a ? 1 : 0))); } }
      }
      continue;
    }
    // floor under everything that is not a wall (lava and pits are sunk below)
    if (c === 'l') {
      // a flow of lava close to the surface: Marea's water cools it into a crust anyone can walk
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 1), LAVA_MAT); m.position.set(cx, -0.07, cz); root.add(m); v.flows.set(`${x},${z}`, m);
      vbox(S.stone, cx, -0.3, cz, 1, 0.3, 1, '#2a1a12');
      for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const q2 = at(x + a, z + b); if (q2 !== 'l' && q2 !== 'w') vbox(S.stone, cx + a * 0.46, -0.02, cz + b * 0.46, a ? 0.1 : 1, 0.1, b ? 0.1 : 1, '#241c1a'); }
      if (H(x, z, 51) < 0.35) v.embers.push(new THREE.Vector3(ox + cx, 0, oz + cz));
      continue;
    }
    if (c === '~') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), LAVA_MAT); m.position.set(cx, -0.22, cz); root.add(m); v.lava.set(`${x},${z}`, m);
      vbox(S.stone, cx, -0.45, cz, 1, 0.3, 1, '#2a1a12');
      if (H(x, z, 50) < 0.25) v.embers.push(new THREE.Vector3(ox + cx, -0.1, oz + cz));
      continue;
    }
    if (c === '=') {
      // a crack in the floor that goes down forever, with broken edges; a bridge appears once built
      const g = new THREE.Group(); g.position.set(cx, 0, cz);
      const pp = P(); vbox(pp.stone, 0, -1.2, 0, 1, 2, 1, '#050404');
      const alongX = !isWall(at(x - 1, z)) || !isWall(at(x + 1, z));
      for (let k = 0; k < 5; k++) { const t = -0.4 + k * 0.2; for (const sd of [-1, 1]) { const w2 = 0.18 + H(x, z, k + sd * 7 + 120) * 0.14; if (alongX) vbox(pp.stone, t, -0.08, sd * (0.5 - w2 / 2), 0.2, 0.16, w2, '#3a302a'); else vbox(pp.stone, sd * (0.5 - w2 / 2), -0.08, t, w2, 0.16, 0.2, '#3a302a'); } }
      merge(pp, g, false);
      const plank = new THREE.Group(), pk = P();
      for (let k = 0; k < 6; k++) { const t = -0.42 + k * 0.17; if (alongX) vbox(pk.plank, t, 0.03, 0, 0.14, 0.06, 0.78, k % 2 ? '#a8763a' : '#9a6a32'); else vbox(pk.plank, 0, 0.03, t, 0.78, 0.06, 0.14, k % 2 ? '#a8763a' : '#9a6a32'); }
      for (const sd of [-1, 1]) { if (alongX) vbox(pk.bark, 0, 0.12, sd * 0.4, 1.1, 0.03, 0.03, '#c8a870'); else vbox(pk.bark, sd * 0.4, 0.12, 0, 0.03, 0.03, 1.1, '#c8a870'); }
      merge(pk, plank); plank.visible = false; g.add(plank);
      const rootB = new THREE.Group(), rk = P();
      for (let k = 0; k < 5; k++) { const o = (k - 2) * 0.15, y = 0.02 + (k % 2) * 0.04; if (alongX) vbox(rk.bark, 0, y, o, 1.15, 0.08, 0.1, k % 2 ? '#6a4a2a' : '#5a3e24'); else vbox(rk.bark, o, y, 0, 0.1, 0.08, 1.15, k % 2 ? '#6a4a2a' : '#5a3e24'); }
      for (let k = 0; k < 4; k++) vbox(rk.thatch, (H(x, z, k + 130) - 0.5) * 0.7, 0.09, (H(x, z, k + 133) - 0.5) * 0.7, 0.12, 0.04, 0.1, '#6fb04a');
      merge(rk, rootB); rootB.visible = false; g.add(rootB);
      root.add(g); v.chasms.set(`${x},${z}`, { plank, root: rootB });
      continue;
    }
    if (c === 'b') {
      // ground that is still burning: black crust and orange cracks; only Brasa walks here
      vbox(S.stone, cx, -0.15, cz, 1, 0.3, 1, pick(['#2a2220', '#30251f', '#261e1a'], x, z));
      for (let k = 0; k < 3; k++) { const a = H(x, z, k + 140) < 0.5; addGlow('ember', box(a ? 0.4 + H(x, z, k) * 0.4 : 0.05, 0.012, a ? 0.05 : 0.4 + H(x, z, k + 3) * 0.4, cx + (H(x, z, k + 143) - 0.5) * 0.6, 0.006, cz + (H(x, z, k + 146) - 0.5) * 0.6)); }
      if (H(x, z, 150) < 0.5) v.embers.push(new THREE.Vector3(ox + cx, 0.02, oz + cz));
      continue;
    }
    if (c === 'O') {
      const g = new THREE.Group(); g.position.set(cx, 0, cz);
      const pp = P(); vbox(pp.stone, 0, -0.9, 0, 1, 1.4, 1, '#0a0807');
      for (const [a, b] of [[-0.42, 0], [0.42, 0], [0, -0.42], [0, 0.42]]) vbox(pp.stone, a, -0.06, b, a ? 0.16 : 0.9, 0.14, b ? 0.16 : 0.9, '#3a302a');
      merge(pp, g, false); root.add(g); v.pits.set(`${x},${z}`, g);
      continue;
    }
    const moss = !torre && (c === ',' || (!volcan && H(x, z, 3) < 0.12));
    if (torre) { vbox(S.plank, cx, -0.15, cz, 1, 0.3, 1, pick(FLOOR, x, z)); vbox(S.plank, cx, 0.005, cz + 0.49, 1, 0.01, 0.03, '#5a4028'); continue; }
    vbox(S.stone, cx, -0.15, cz, 1, 0.3, 1, moss ? pick(MOSS, x, z) : pick(FLOOR, x, z));
    // pebbles and cracks
    if (H(x, z, 4) < 0.55) for (let k = 0; k < 1 + Math.floor(H(x, z, 6) * 3); k++) vbox(S.stone, cx + (H(x, z, k + 20) - 0.5) * 0.8, 0.03, cz + (H(x, z, k + 23) - 0.5) * 0.8, 0.08 + H(x, z, k + 26) * 0.08, 0.06, 0.08 + H(x, z, k + 29) * 0.08, pick(['#6a5d50', '#5a4e44', '#7a6c5e'], x, z, k));
    if (H(x, z, 8) < 0.2) vbox(S.stone, cx + (H(x, z, 9) - 0.5) * 0.4, 0.005, cz, 0.5, 0.01, 0.04, '#2a2420');
  }
  // stairs: S rises to an opening with light from above; > drops into the dark
  for (let z = 0; z < Hh; z++) for (let x = 0; x < W; x++) {
    const c = at(x, z), cx = x + 0.5, cz = z + 0.5;
    if (volcan && c === 'T') {
      // a tree burned long ago: black trunk, bare branches, a few embers still at the tips
      let ty = 0;
      for (let k = 0; k < 4; k++) { vbox(S.bark, cx + (k % 2 ? 0.03 : 0), ty + 0.17, cz, 0.18 - k * 0.025, 0.34, 0.18 - k * 0.025, k % 2 ? '#2a2220' : '#221c1a'); ty += 0.32; }
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + H(x, z, k + 440), L2 = 0.35 + H(x, z, k + 443) * 0.2; for (let j = 1; j <= 3; j++) vbox(S.bark, cx + Math.cos(a) * j * L2 / 3, ty - 0.3 + j * 0.12 + k * 0.1, cz + Math.sin(a) * j * L2 / 3, 0.07, 0.07, 0.07, '#2a2220'); addGlow('ember', box(0.05, 0.05, 0.05, cx + Math.cos(a) * L2, ty - 0.3 + 0.4 + k * 0.1, cz + Math.sin(a) * L2)); }
    }
    if (isla && c === 'T') {
      // a palm: a bent trunk in rings and a crown of long leaves
      let tx = cx, ty = 0, lean = (H(x, z, 240) - 0.5) * 0.12;
      for (let k = 0; k < 7; k++) { vbox(S.bark, tx, ty + 0.2, cz, 0.2 - k * 0.012, 0.36, 0.2 - k * 0.012, k % 2 ? '#8a6a42' : '#7a5a36'); ty += 0.34; tx += lean * (1 + k * 0.3); }
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + H(x, z, k) * 0.3; for (let j = 1; j <= 3; j++) vbox(S.thatch, tx + Math.cos(a) * j * 0.22, ty + 0.12 - j * j * 0.05, cz + Math.sin(a) * j * 0.22, 0.24, 0.06, 0.16, j === 3 ? '#4e8a3a' : '#5fa046'); }
      vbox(S.bark, tx + 0.08, ty - 0.05, cz + 0.06, 0.12, 0.12, 0.12, '#6a4a2a'); vbox(S.bark, tx - 0.07, ty - 0.08, cz - 0.04, 0.12, 0.12, 0.12, '#5a3e24');
    }
    if (isla && c === 'F') {
      // the lighthouse: a white tower with red bands, a glass lantern on top, a door facing the island
      vbox(S.stone, cx, -0.15, cz, 1, 0.3, 1, '#8a8478');
      vbox(S.stone, cx, 0.2, cz, 1.3, 0.4, 1.3, '#9a9488');
      for (let k = 0; k < 8; k++) { const w = 1.0 - k * 0.04; vbox(S.brick, cx, 0.4 + k * 0.45 + 0.225, cz, w, 0.45, w, k % 2 ? '#b8443a' : '#f0ece4'); }
      vbox(S.brick, cx, 4.08, cz, 1.0, 0.12, 1.0, '#3a3a40');
      for (const [a, b] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) vbox(S.bark, cx + a, 4.45, cz + b, 0.06, 0.6, 0.06, '#2a2a30');
      vbox(S.brick, cx, 4.82, cz, 0.95, 0.14, 0.95, '#b8443a'); vbox(S.brick, cx, 5.0, cz, 0.5, 0.22, 0.5, '#b8443a'); vbox(S.bark, cx, 5.2, cz, 0.06, 0.2, 0.06, '#2a2a30');
      vbox(S.plank, cx, 0.75, cz + 0.4, 0.42, 0.7, 0.06, '#6a4a2a'); vbox(S.plank, cx, 1.12, cz + 0.4, 0.5, 0.06, 0.08, '#4a3420');
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.62), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.45, 0.5) })); glass.position.set(cx, 4.45, cz); root.add(glass);
      const beam = new THREE.Group(); beam.position.set(cx, 4.45, cz);
      for (const sd of [1, -1]) { const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 9), new THREE.MeshBasicMaterial({ color: '#fff4c8', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending })); b2.position.z = sd * 4.8; beam.add(b2); }
      beam.visible = false; root.add(beam); v.lamp = { glass, beam };
    }
    if (isla && c === '>') { vbox(S.stone, cx, 0.03, cz - 0.3, 0.6, 0.06, 0.3, '#a8a296'); }
    if (isla && c === 'L') {
      vbox(S.bark, cx, 0.35, cz, 0.08, 0.7, 0.08, '#6a4a2a'); vbox(S.plank, cx, 0.62, cz + 0.05, 0.62, 0.32, 0.06, '#b08850');
      for (let k = 0; k < 2; k++) vbox(S.plank, cx, 0.56 + k * 0.12, cz + 0.085, 0.42 - k * 0.12, 0.03, 0.01, '#5a3e24');
    }
    if (c === 'S' && !isla && !torre && !volcan || c === 'S' && torre) {
      for (let k = 0; k < 3; k++) vbox(S.stone, cx, 0.05 + k * 0.1, cz + 0.2 + k * 0.1, 0.8, 0.1, 0.25, '#6a5c50');
      const d = lightDecal(1.6, '#fff0c8'); d.position.set(cx, 0.02, cz); root.add(d);
    }
    if (c === '>') {
      vbox(S.stone, cx, -0.6, cz, 0.9, 1.0, 0.9, '#0a0807');
      for (let k = 0; k < 3; k++) vbox(S.stone, cx, -0.08 - k * 0.14, cz + 0.3 - k * 0.22, 0.8, 0.08, 0.22, '#3a302a');
    }
    if (c === 'A' && torre) {
      // the lens frame: a bronze ring on a pedestal; the lens is the orb once the pieces are in
      vbox(S.stone, cx, 0.25, cz, 0.8, 0.5, 0.8, '#8a8478'); vbox(S.stone, cx, 0.53, cz, 0.9, 0.06, 0.9, '#9a9488');
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; vbox(S.bark, cx + Math.cos(a) * 0.36, 0.95 + Math.sin(a) * 0.36, cz, 0.12, 0.12, 0.1, '#b08840'); }
      const orb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.12), GLOW.orb); orb.position.set(cx, 0.95, cz); root.add(orb); v.altar = { orb };
    } else if (c === 'A') {
      vbox(S.stone, cx, 0.2, cz, 0.7, 0.4, 0.7, '#5a4e44'); vbox(S.stone, cx, 0.45, cz, 0.5, 0.1, 0.5, '#6a5c50');
      const orb = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), GLOW.orb); orb.position.set(cx, 0.65, cz); root.add(orb); v.altar = { orb };
    }
    if (c === 'L' && !isla) {   // the burning island and the caves: stone tablets
      vbox(S.stone, cx, 0.45, cz, 0.6, 0.9, 0.16, '#6a5e52'); vbox(S.stone, cx, 0.92, cz, 0.66, 0.08, 0.2, '#5a4e44');
      for (let k = 0; k < 4; k++) vbox(S.stone, cx - 0.05 + (k % 2) * 0.1, 0.25 + k * 0.15, cz + 0.085, 0.36 - (k % 2) * 0.12, 0.03, 0.01, '#3a322c');
    }
    if (c === '*') stalagmite(S, cx, cz, x, z);
  }
  for (const [x, z] of decor.stalagmites) if (!isWall(at(x, z))) stalagmite(S, x + 0.5, z + 0.5, x, z);
  for (const [x, z] of decor.mushrooms) for (let k = 0; k < 3; k++) {
    const mx = x + 0.5 + (H(x, z, k + 60) - 0.5) * 0.6, mz = z + 0.5 + (H(x, z, k + 63) - 0.5) * 0.6, h = 0.06 + H(x, z, k) * 0.1;
    vbox(S.thatch, mx, h / 2, mz, 0.03, h, 0.03, '#d8d0c0'); addGlow(k % 2 ? 'mush' : 'mush2', box(0.12, 0.05, 0.12, mx, h + 0.02, mz));
  }
  if (volcan && Hh > 12) volcanoBackdrop(S, addGlow, box, W, v, ox, oz);
  merge(S, root);
  for (const [k, list] of Object.entries(glowParts)) { const m = new THREE.Mesh(mergeGeometries(list), (GLOW as any)[k]); root.add(m); }
  if (springGeo.length) { const m = new THREE.Mesh(mergeGeometries(springGeo), SPRING_MAT); m.renderOrder = 2; root.add(m); }

  // ---------- dynamic objects ----------
  let runeSeed = 1;
  for (let z = 0; z < Hh; z++) for (let x = 0; x < W; x++) {
    const c = at(x, z), key = `${x},${z}`, cx = x + 0.5, cz = z + 0.5;
    const G = new THREE.Group(); G.position.set(cx, 0, cz);
    const pp = P();
    switch (c) {
      case 'B': {
        vbox(pp.stone, 0, 0.36, 0, 0.78, 0.66, 0.78, '#7a6a5c'); vbox(pp.stone, 0, 0.36, 0, 0.9, 0.5, 0.6, '#72645a'); vbox(pp.stone, 0, 0.36, 0, 0.6, 0.5, 0.9, '#6e6056');
        vbox(pp.stone, 0, 0.72, 0, 0.5, 0.12, 0.5, '#8a7a6a'); vbox(pp.stone, 0.18, 0.5, 0.36, 0.2, 0.08, 0.04, '#4a3f36');
        merge(pp, G); root.add(G); v.boulders.set(key, G); break;
      }
      case 'R': {
        for (let k = 0; k < 7; k++) vbox(pp.stone, (H(x, z, k + 70) - 0.5) * 0.7, 0.1 + (k > 4 ? 0.18 : 0), (H(x, z, k + 73) - 0.5) * 0.7, 0.22 + H(x, z, k) * 0.15, 0.2, 0.22 + H(x, z, k + 1) * 0.15, pick(['#7a6a5c', '#6a5c50', '#5a4e44'], x, z, k));
        merge(pp, G); root.add(G); v.rubble.set(key, G); break;
      }
      case 't': {
        vbox(pp.stone, 0, 0.2, 0, 0.5, 0.4, 0.5, '#5a4e44'); vbox(pp.stone, 0, 0.47, 0, 0.66, 0.14, 0.66, '#6a5c50'); vbox(pp.stone, 0, 0.56, 0, 0.5, 0.06, 0.5, '#1a1410');
        merge(pp, G);
        const flame = new THREE.Group(); flame.position.y = 0.62;
        const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.26), GLOW.flame); f1.position.y = 0.12; flame.add(f1);
        const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.26, 0.14), GLOW.flameCore); f2.position.y = 0.2; flame.add(f2);
        flame.visible = false; G.add(flame);
        const decal = lightDecal(3.2); decal.position.set(0, 0.03, 0); decal.visible = false; G.add(decal);
        root.add(G); v.braziers.set(key, { flame, decal, light: null, pos: new THREE.Vector3(ox + cx, 0.9, oz + cz) }); break;
      }
      case 'D': {
        vbox(pp.stone, 0, 0.9, 0, 0.96, 1.8, 0.4, '#5a5048');
        merge(pp, G);
        const r = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.75), new THREE.MeshBasicMaterial({ map: runeTex(runeSeed++), color: GLOW.rune.color.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        r.position.set(0, 0.95, 0.21); G.add(r); (G as any).rune = r;
        root.add(G); v.doors.set(key, G); break;
      }
      case 'G': {
        for (let k = 0; k < 4; k++) vbox(pp.bark, -0.33 + k * 0.22, 0.75, 0, 0.07, 1.5, 0.07, '#4a4a52');
        vbox(pp.bark, 0, 1.3, 0, 0.95, 0.08, 0.1, '#5a5a62'); vbox(pp.bark, 0, 0.4, 0, 0.95, 0.06, 0.1, '#5a5a62');
        merge(pp, G); root.add(G); v.gates.set(key, G); break;
      }
      case 'P': {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.8), new THREE.MeshLambertMaterial({ color: '#8a7e70' })); m.position.y = 0.04; m.receiveShadow = true; G.add(m);
        const r = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: runeTex(9), color: GLOW.rune.color.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        r.rotation.x = -Math.PI / 2; r.position.y = 0.085; G.add(r); (G as any).rune = r;
        root.add(G); v.plates.set(key, m); (m as any).group = G; break;
      }
      case 's': {
        // a guardian of the Alfareros: a clay woman on a plinth holding out a bowl; a chevron
        // carved on the plinth shows where she looks
        vbox(pp.stone, 0, 0.11, 0, 0.9, 0.22, 0.9, '#5e5650'); vbox(pp.stone, 0, 0.24, 0, 0.7, 0.04, 0.7, '#6a625a');
        for (const [a, b, w2] of [[0, 0.33, 0.08], [0.07, 0.27, 0.07], [-0.07, 0.27, 0.07], [0.14, 0.21, 0.07], [-0.14, 0.21, 0.07]]) vbox(pp.stone, a, 0.265, b, w2, 0.02, 0.07, '#d8c8a8');
        vbox(pp.brick, 0, 0.62, 0, 0.5, 0.72, 0.38, '#b07a52'); vbox(pp.brick, 0, 0.3, 0, 0.58, 0.12, 0.44, '#9a6a46');
        vbox(pp.brick, 0, 1.15, 0, 0.42, 0.36, 0.38, '#c08a62'); vbox(pp.brick, 0, 1.36, -0.03, 0.46, 0.1, 0.42, '#7a4a30'); vbox(pp.brick, 0, 1.2, -0.17, 0.44, 0.34, 0.08, '#7a4a30');
        vbox(pp.brick, 0, 1.12, 0.19, 0.3, 0.2, 0.02, '#d8a878');
        for (const ax of [-0.21, 0.21]) vbox(pp.brick, ax, 0.82, 0.2, 0.1, 0.1, 0.34, '#b07a52');
        vbox(pp.brick, 0, 0.84, 0.4, 0.3, 0.08, 0.18, '#8a5a3a'); vbox(pp.brick, 0, 0.89, 0.4, 0.22, 0.02, 0.12, '#5a3a24');
        merge(pp, G);
        const eyes: THREE.Mesh[] = [];
        for (const ex of [-0.08, 0.08]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.02), GLOW.eye); e.position.set(ex, 1.15, 0.205); G.add(e); eyes.push(e); }
        G.rotation.y = DIR_ANGLE[dirs[key] || 'S'];
        root.add(G); v.statues.set(key, { g: G, eyes }); break;
      }
      case 'C': {
        vbox(pp.stone, 0, 0.06, 0, 0.6, 0.12, 0.6, '#3a3634'); merge(pp, G);
        const cg = new THREE.Group();
        for (let k = 0; k < 5; k++) { const h = 0.3 + H(x, z, k + 80) * 0.45; const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 0.12), GLOW.crystal); m.position.set((H(x, z, k + 83) - 0.5) * 0.4, 0.1 + h / 2, (H(x, z, k + 86) - 0.5) * 0.4); m.rotation.set((H(x, z, k) - 0.5) * 0.5, 0, (H(x, z, k + 2) - 0.5) * 0.5); cg.add(m); }
        G.add(cg); (G as any).shards = cg;
        const d = lightDecal(1.8, '#80e0ff'); d.position.y = 0.02; G.add(d); (G as any).decal = d;
        root.add(G); v.crystals.set(key, G); break;
      }
      case 'M': {
        vbox(pp.stone, 0, 0.3, 0, 0.75, 0.6, 0.7, '#5a4e44'); vbox(pp.stone, 0.1, 0.62, -0.05, 0.5, 0.14, 0.45, '#4e443c');
        for (let k = 0; k < 4; k++) vbox(pp.brick, (H(x, z, k + 90) - 0.5) * 0.6, 0.2 + H(x, z, k + 92) * 0.4, 0.36, 0.14, 0.06, 0.02, '#c8763a');
        merge(pp, G); root.add(G); v.veins.set(key, G); break;
      }
      case 'K': {
        vbox(pp.plank, 0, 0.18, 0, 0.6, 0.36, 0.42, '#7a4a2a'); vbox(pp.bark, 0, 0.18, 0.215, 0.62, 0.06, 0.02, '#c8a040');
        merge(pp, G);
        const lid = new THREE.Group(); lid.position.set(0, 0.36, -0.21);
        const lp = P(); vbox(lp.plank, 0, 0.06, 0.21, 0.62, 0.12, 0.44, '#8a5a2e'); vbox(lp.bark, 0, 0.06, 0.43, 0.12, 0.1, 0.02, '#e0b850'); merge(lp, lid);
        G.add(lid); root.add(G); v.chests.set(key, { lid }); break;
      }
      case 'Q': {
        vbox(pp.stone, 0, 0.3, 0, 0.7, 0.6, 0.7, '#6a5c50'); vbox(pp.stone, 0, 0.64, 0, 0.8, 0.08, 0.8, '#7a6c5e');
        merge(pp, G);
        const sh = new THREE.Group(); sh.position.y = 0.72;
        const sp = P();
        vbox(sp.thatch, 0, 0.12, 0, 0.42, 0.24, 0.3, '#f0d8c8'); vbox(sp.thatch, 0.12, 0.26, 0, 0.26, 0.16, 0.24, '#e8c8b8'); vbox(sp.thatch, 0.2, 0.38, 0, 0.14, 0.12, 0.16, '#e0b8a8');
        vbox(sp.thatch, -0.2, 0.1, 0, 0.1, 0.16, 0.2, '#ffe8d8');
        merge(sp, sh); const inner = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.12), GLOW.shell); inner.position.set(-0.26, 0.1, 0); sh.add(inner);
        G.add(sh); const d = lightDecal(2.4, '#ffd8e8'); d.position.y = 0.02; G.add(d);
        root.add(G); v.shell = sh; break;
      }
      case 'g': {
        // the guardian: a hunched mass of dark clay with ember cracks, built in parts (hips, torso,
        // head, two arms) so it can wake up and fight. Asleep it leans forward with its head down.
        G.scale.setScalar(1.25);
        const base = P(); vbox(base.brick, 0, 0.2, 0, 0.86, 0.4, 0.7, '#45362d'); vbox(base.brick, -0.24, 0.1, 0.12, 0.3, 0.2, 0.5, '#3e3028'); vbox(base.brick, 0.24, 0.1, 0.12, 0.3, 0.2, 0.5, '#3e3028'); merge(base, G);
        const torso = new THREE.Group(); torso.position.y = 0.4; G.add(torso);
        const tp = P(); vbox(tp.brick, 0, 0.32, 0, 0.92, 0.66, 0.74, '#4a3a30'); vbox(tp.brick, 0, 0.5, 0.06, 0.7, 0.3, 0.7, '#54423a'); vbox(tp.brick, 0.32, 0.62, -0.05, 0.3, 0.16, 0.5, '#3e3028'); vbox(tp.brick, -0.32, 0.62, -0.05, 0.3, 0.16, 0.5, '#3e3028'); merge(tp, torso);
        const cracks: THREE.Mesh[] = [];
        for (const [a, b, w2] of [[0.18, 0.22, 0.22], [-0.22, 0.38, 0.18], [0.05, 0.5, 0.14], [-0.05, 0.12, 0.12]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.035, 0.01), GLOW.flame); m.position.set(a, b, 0.376); torso.add(m); cracks.push(m); }
        const head = new THREE.Group(); head.position.set(0, 0.66, 0.08); torso.add(head);
        const hp = P(); vbox(hp.brick, 0, 0.17, 0, 0.56, 0.34, 0.5, '#54423a'); vbox(hp.brick, 0, 0.36, -0.02, 0.4, 0.06, 0.4, '#3a2c24'); vbox(hp.brick, 0, 0.06, 0.24, 0.3, 0.08, 0.04, '#3a2c24'); merge(hp, head);
        const eyes: THREE.Mesh[] = [];
        for (const ex of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.02), GLOW.eye); e.position.set(ex, 0.2, 0.255); head.add(e); eyes.push(e); }
        const arm = (side: number) => {
          const a = new THREE.Group(); a.position.set(side * 0.56, 0.58, 0.05); torso.add(a);
          const ap = P(); vbox(ap.brick, 0, -0.22, 0, 0.26, 0.44, 0.28, '#4a3a30'); vbox(ap.brick, 0, -0.52, 0.04, 0.32, 0.26, 0.34, '#3e3028'); merge(ap, a);
          const c = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.2, 0.03), GLOW.flame); c.position.set(side * 0.135, -0.25, 0.05); a.add(c); cracks.push(c);
          return a;
        };
        const armL = arm(-1), armR = arm(1);
        torso.rotation.x = 0.42; head.rotation.x = 0.35; armL.rotation.x = armR.rotation.x = -0.2;
        root.add(G); v.golem = { g: G, torso, head, armL, armR, eyes, cracks }; break;
      }
      case 'X': {
        // a wall that sounds hollow: lighter rock, a web of cracks, a little dust at its feet
        vbox(pp.stone, 0, 0.45, 0, 0.98, 0.9, 0.98, '#5a5360'); vbox(pp.stone, 0.05, 0.95, -0.05, 0.8, 0.12, 0.8, '#4c4652');
        for (const [a, b, w2, h2] of [[-0.12, 0.6, 0.05, 0.4], [0.05, 0.42, 0.34, 0.04], [0.18, 0.3, 0.05, 0.3], [-0.2, 0.25, 0.22, 0.04], [0.02, 0.75, 0.2, 0.04]]) for (const f of [1, -1]) vbox(pp.stone, a, b, f * 0.495, w2, h2, 0.01, '#1e1a22');
        for (const [a, b, w2, h2] of [[-0.12, 0.6, 0.05, 0.4], [0.05, 0.42, 0.34, 0.04]]) for (const f of [1, -1]) vbox(pp.stone, f * 0.495, b, a, 0.01, h2, w2, '#1e1a22');
        for (let k = 0; k < 4; k++) vbox(pp.stone, (H(x, z, k + 100) - 0.5) * 0.8, 0.04, (H(x, z, k + 103) - 0.5) * 0.8, 0.1, 0.08, 0.1, '#6a6070');
        merge(pp, G); root.add(G); v.cracked.set(key, G); break;
      }
      case 'V': {
        // a curtain of vines from the ceiling, thick enough that nobody passes but Musgo
        for (let k = 0; k < 9; k++) {
          const ox = -0.42 + k * 0.105, len = 1.1 + H(x, z, k + 160) * 0.7, top = 1.9;
          vbox(pp.thatch, ox, top - len / 2, (H(x, z, k + 163) - 0.5) * 0.2, 0.05, len, 0.05, k % 3 ? '#3f7a3a' : '#4e8a44');
          for (let j = 0; j < 3; j++) vbox(pp.thatch, ox + (j % 2 ? 0.04 : -0.04), top - len * (0.25 + j * 0.25), (H(x, z, k + j + 166) - 0.5) * 0.25, 0.09, 0.05, 0.07, '#6fb04a');
        }
        vbox(pp.stone, 0, 1.95, 0, 1, 0.12, 0.4, '#3e3a44');
        merge(pp, G);
        for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), GLOW.mush2); f.position.set(-0.3 + k * 0.3, 0.6 + H(x, z, k + 170) * 0.8, 0.08); G.add(f); }
        root.add(G); v.vines.set(key, G); break;
      }
      case 'p': {
        // a piece of the lighthouse lens, shining where it fell
        const item = new THREE.Group();
        const sh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.06), GLOW.crystal); sh.position.y = 0.2; sh.rotation.set(0.4, 0.6, 0.2); item.add(sh);
        const rim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.08), new THREE.MeshLambertMaterial({ color: '#b08840' })); rim.position.y = 0.32; rim.rotation.set(0.4, 0.6, 0.2); item.add(rim);
        const d = lightDecal(1.4, '#c8f0ff'); d.position.y = 0.03; item.add(d);
        G.add(item); root.add(G); v.pieces.set(key, G); break;
      }
      case 'h': {
        // tall grass of the cave: ferns that grow back; Musgo cuts them and finds things inside
        if (volcan) {
          // on the burning island: dry, thorny scrub, black and brown, that grows back from the ash
          const tall = new THREE.Group(), tp2 = P();
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * Math.PI * 2 + H(x, z, k + 450), r = 0.1 + H(x, z, k + 453) * 0.32, hgt = 0.35 + H(x, z, k + 456) * 0.45;
            vbox(tp2.bark, Math.cos(a) * r, hgt / 2, Math.sin(a) * r, 0.05, hgt, 0.05, k % 3 ? '#3a2c24' : '#4a3a2a');
            vbox(tp2.bark, Math.cos(a) * (r + 0.07), hgt * 0.7, Math.sin(a) * (r + 0.07), 0.12, 0.03, 0.03, '#2a201a');
            if (k % 3 === 0) vbox(tp2.thatch, Math.cos(a) * r, hgt + 0.02, Math.sin(a) * r, 0.08, 0.05, 0.06, '#8a7040');
          }
          merge(tp2, tall); G.add(tall);
          const stub = new THREE.Group(), sp4 = P();
          for (let k = 0; k < 6; k++) vbox(sp4.bark, (H(x, z, k + 190) - 0.5) * 0.6, 0.04, (H(x, z, k + 193) - 0.5) * 0.6, 0.06, 0.08, 0.06, '#3a2c24');
          merge(sp4, stub); stub.visible = false; G.add(stub);
          root.add(G); v.ferns.set(key, { tall, stub }); break;
        }
        if (isla) {
          // outdoors: long blades that sway in the wind
          const tall = new THREE.Group(), list: THREE.BufferGeometry[] = [];
          for (let k = 0; k < 14; k++) { const hx = (H(x, z, k + 250) - 0.5) * 0.85, hz = (H(x, z, k + 253) - 0.5) * 0.85, hgt = 0.55 + H(x, z, k + 256) * 0.5; vbox(list, hx, hgt / 2, hz, 0.06, hgt, 0.05, pick(['#7cc04e', '#6aae42', '#8ccc5a', '#5f9a3a'], x, z, k)); }
          vbox(pp.stone, 0, -0.15, 0, 1, 0.3, 1, pick(GRASS, x, z)); merge(pp, G, false);
          tall.add(new THREE.Mesh(mergeGeometries(list), SWAY_MAT)); G.add(tall);
          const stub = new THREE.Group(), sp3 = P();
          for (let k = 0; k < 7; k++) vbox(sp3.thatch, (H(x, z, k + 190) - 0.5) * 0.7, 0.04, (H(x, z, k + 193) - 0.5) * 0.7, 0.07, 0.08, 0.06, '#6aae42');
          merge(sp3, stub); stub.visible = false; G.add(stub);
          root.add(G); v.ferns.set(key, { tall, stub }); break;
        }
        const tall = new THREE.Group(), tp = P();
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2 + H(x, z, k + 180), r = 0.12 + H(x, z, k + 183) * 0.26, hgt = 0.45 + H(x, z, k + 186) * 0.45;
          vbox(tp.thatch, Math.cos(a) * r, hgt / 2, Math.sin(a) * r, 0.07, hgt, 0.07, k % 3 ? '#4f8a3e' : '#3e7232');
          vbox(tp.thatch, Math.cos(a) * (r + 0.05), hgt * 0.85, Math.sin(a) * (r + 0.05), 0.14, 0.04, 0.06, '#6fb04a');
        }
        merge(tp, tall); G.add(tall);
        const stub = new THREE.Group(), sp2 = P();
        for (let k = 0; k < 6; k++) vbox(sp2.thatch, (H(x, z, k + 190) - 0.5) * 0.6, 0.04, (H(x, z, k + 193) - 0.5) * 0.6, 0.06, 0.08, 0.06, '#4f8a3e');
        merge(sp2, stub); stub.visible = false; G.add(stub);
        root.add(G); v.ferns.set(key, { tall, stub }); break;
      }
      case 'o': {
        vbox(pp.stone, 0, 0.32, 0, 0.78, 0.64, 0.72, '#26202c'); vbox(pp.stone, -0.1, 0.66, 0.05, 0.5, 0.14, 0.45, '#1a1620');
        for (let k = 0; k < 3; k++) vbox(pp.stone, (H(x, z, k + 200) - 0.5) * 0.5, 0.25 + H(x, z, k + 203) * 0.35, 0.365, 0.16, 0.1, 0.02, '#4a3a5e');
        merge(pp, G);
        for (let k = 0; k < 4; k++) { const gl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), GLOW.obsGlint); gl.position.set((H(x, z, k + 206) - 0.5) * 0.6, 0.2 + H(x, z, k + 209) * 0.45, 0.37); G.add(gl); }
        root.add(G); v.obsidian.set(key, G); break;
      }
      case 'U': {
        // a gift of the Alfareros for one figure: a seed for Musgo, a heart of magma for Brasa
        vbox(pp.stone, 0, 0.16, 0, 0.62, 0.32, 0.62, '#5e5650'); vbox(pp.stone, 0, 0.35, 0, 0.72, 0.06, 0.72, '#6a625a');
        for (const [a, b] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) vbox(pp.stone, a, 0.42, b, 0.08, 0.1, 0.08, '#7a7068');
        merge(pp, G);
        const item = new THREE.Group(); item.position.y = 0.55; G.add(item);
        if (relicKind === 0) {
          const ip = P(); vbox(ip.bark, 0, 0.1, 0, 0.22, 0.2, 0.2, '#7a5a30'); vbox(ip.bark, 0, 0.22, 0, 0.14, 0.06, 0.14, '#8a6a3a'); merge(ip, item);
          const sprout = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), GLOW.mush); sprout.position.y = 0.32; item.add(sprout);
          const d = lightDecal(1.6, '#90ff90'); d.position.y = 0.02; G.add(d);
        } else {
          const heart = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), GLOW.flame); heart.position.y = 0.12; heart.rotation.set(0.6, 0.6, 0); item.add(heart);
          const core = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), GLOW.flameCore); core.position.y = 0.12; item.add(core);
          const d = lightDecal(2.2, '#ff9040'); d.position.y = 0.02; G.add(d);
        }
        root.add(G); v.gift = item; break;
      }
      case 'q': case 'j': {
        // a geyser: a crust of white and yellow minerals around a hole; its column of steam comes and goes
        const big = c === 'j';
        vbox(pp.stone, 0, 0.03, 0, big ? 0.95 : 0.8, 0.06, big ? 0.95 : 0.8, '#d8d0a8'); vbox(pp.stone, 0, 0.07, 0, big ? 0.6 : 0.5, 0.06, big ? 0.6 : 0.5, '#c8b878');
        vbox(pp.stone, 0, 0.1, 0, 0.24, 0.02, 0.24, '#1a1814');
        for (let k = 0; k < 4; k++) vbox(pp.stone, (H(x, z, k + 460) - 0.5) * 0.7, 0.07, (H(x, z, k + 463) - 0.5) * 0.7, 0.1, 0.04, 0.1, '#e8d878');
        merge(pp, G);
        const col = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.42 : 0.34, 1, big ? 0.42 : 0.34), STEAM_MAT); col.position.y = 0.6; col.scale.y = big ? 2.2 : 0.01; col.renderOrder = 3; G.add(col);
        root.add(G); v.geysers.set(key, { col, pos: new THREE.Vector3(ox + cx, 0.1, oz + cz), always: big }); break;
      }
      case 'E': {
        // a chimney of the forge: a tower of dark brick; lit, its mouth glows and it smokes
        vbox(pp.stone, 0, 0.15, 0, 0.92, 0.3, 0.92, '#4a4248');
        for (let k = 0; k < 6; k++) { const w2 = 0.72 - k * 0.03; vbox(pp.brick, 0, 0.3 + k * 0.32 + 0.16, 0, w2, 0.32, w2, k % 2 ? '#5a4a44' : '#4e403a'); }
        vbox(pp.brick, 0, 2.28, 0, 0.74, 0.12, 0.74, '#3a3230'); vbox(pp.stone, 0, 2.35, 0, 0.42, 0.02, 0.42, '#0e0a0a');
        vbox(pp.brick, 0, 0.42, 0.37, 0.34, 0.3, 0.04, '#1a1210');
        merge(pp, G);
        const glow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.02), GLOW.eye); glow.position.set(0, 0.42, 0.395); G.add(glow);
        const flame = new THREE.Group(); flame.position.y = 2.38;
        const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), GLOW.flame); f1.position.y = 0.12; flame.add(f1);
        const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.3, 0.18), GLOW.flameCore); f2.position.y = 0.2; flame.add(f2);
        flame.visible = false; G.add(flame);
        root.add(G); v.chimneys.set(key, { flame, glow, top: new THREE.Vector3(ox + cx, 2.5, oz + cz) }); break;
      }
      case 'Z': {
        // the forge of the Alfareros: a great hearth in the rock and an anvil in front of it
        vbox(pp.stone, 0, 0.5, -0.1, 1.0, 1.0, 0.8, '#4a4048'); vbox(pp.stone, 0, 1.05, -0.15, 1.1, 0.12, 0.9, '#3a3238');
        vbox(pp.stone, 0, 0.35, 0.26, 0.56, 0.5, 0.06, '#120c0c');
        vbox(pp.brick, 0, 1.6, -0.25, 0.5, 1.0, 0.5, '#4e403a');
        vbox(pp.stone, 0.32, 0.18, 0.42, 0.18, 0.36, 0.18, '#3a3434'); vbox(pp.stone, 0.32, 0.4, 0.42, 0.34, 0.1, 0.16, '#6a6670'); vbox(pp.stone, 0.12, 0.42, 0.42, 0.1, 0.06, 0.1, '#6a6670');
        merge(pp, G);
        const embersM = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.2), GLOW.ember); embersM.position.set(0, 0.13, 0.18); G.add(embersM);
        const fire = new THREE.Group(); fire.position.set(0, 0.2, 0.15);
        for (const [a, h, m] of [[-0.12, 0.3, GLOW.flame], [0.1, 0.36, GLOW.flame], [0, 0.26, GLOW.flameCore]] as [number, number, THREE.Material][]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.16, h, 0.12), m); f.position.set(a, h / 2, 0); fire.add(f); }
        const d = lightDecal(3, '#ff9a50'); d.position.set(0, -0.18, 0.5); fire.add(d);
        fire.visible = false; G.add(fire);
        root.add(G); v.forge = { fire, embers: embersM }; break;
      }
      case 'N': case 'm': {
        // a nest of fire salamanders (stones, embers, two small ones curled up), or their mother
        if (c === 'N') {
          for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; vbox(pp.stone, Math.cos(a) * 0.42, 0.06, Math.sin(a) * 0.42, 0.16, 0.12, 0.14, '#3a3234'); }
          merge(pp, G);
          const bed = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.5), GLOW.ember); bed.position.y = 0.015; G.add(bed);
          const sm = salamander(0.62); sm.g.position.set(-0.05, 0.03, 0.05); G.add(sm.g);
          const sm2 = salamander(0.45); sm2.g.position.set(0.22, 0.03, -0.18); sm2.g.rotation.y = 2.4; G.add(sm2.g);
          root.add(G); v.foes.set(key, sm);
        } else {
          const big = salamander(1.35); G.add(big.g); const dm = lightDecal(2.6, '#ff8040'); dm.position.y = 0.03; G.add(dm);
          root.add(G); v.foes.set(key, big);
        }
        break;
      }
      case 'Y': {
        vbox(pp.stone, 0, 0.18, 0, 0.5, 0.36, 0.5, '#5e5650'); vbox(pp.stone, 0, 0.38, 0, 0.6, 0.06, 0.6, '#6a625a');
        merge(pp, G);
        const item = new THREE.Group(); item.position.y = 0.42; G.add(item);
        const ip = P();
        if (relicKind === 0) { vbox(ip.brick, 0, 0.12, 0, 0.12, 0.16, 0.1, '#c9a07a'); vbox(ip.brick, 0, 0.26, 0, 0.13, 0.12, 0.12, '#d4ac86'); vbox(ip.brick, 0.09, 0.12, 0, 0.04, 0.1, 0.04, '#c9a07a'); vbox(ip.brick, -0.09, 0.12, 0, 0.04, 0.1, 0.04, '#c9a07a'); }
        else if (relicKind === 3) { vbox(ip.stone, 0, 0.05, 0, 0.36, 0.1, 0.3, '#6a6466'); for (const [a, b] of [[-0.1, -0.06], [-0.03, -0.09], [0.04, -0.09], [0.11, -0.05], [0, 0.05]]) vbox(ip.stone, a, 0.101, b, a === 0 && b > 0 ? 0.2 : 0.05, 0.01, a === 0 && b > 0 ? 0.14 : 0.1, '#2a2628'); }
        else if (relicKind === 1) { vbox(ip.stone, 0, 0.04, 0, 0.36, 0.08, 0.26, '#7a7068'); vbox(ip.stone, -0.08, 0.085, 0, 0.1, 0.01, 0.14, '#3a3430'); vbox(ip.stone, 0.08, 0.085, 0, 0.1, 0.01, 0.14, '#3a3430'); }
        else { vbox(ip.bark, 0, 0.1, 0, 0.22, 0.2, 0.06, '#b08840'); vbox(ip.bark, 0, 0.1, 0.035, 0.08, 0.12, 0.01, '#e0c070'); }
        merge(ip, item);
        const d = lightDecal(1.4, '#ffd890'); d.position.y = 0.02; G.add(d);
        root.add(G); v.relic = item; break;
      }
    }
  }
  return v;
}
export const DIR_ANGLE: Record<string, number> = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };
function stalagmite(S: Record<string, L>, cx: number, cz: number, x: number, z: number) {
  const h = 0.6 + H(x, z, 77) * 0.6;
  vbox(S.stone, cx, h * 0.25, cz, 0.42, h * 0.5, 0.42, '#5a4e44'); vbox(S.stone, cx, h * 0.62, cz, 0.28, h * 0.3, 0.28, '#665a4e'); vbox(S.stone, cx, h * 0.86, cz, 0.14, h * 0.2, 0.14, '#72665a');
}
export function lavaScroll(dt: number) { lavaTex.offset.x += dt * 0.03; lavaTex.offset.y += dt * 0.012; }

/** A fire salamander: a long body of black stone with glowing cracks, a head with ember eyes, four legs
    and a tail in three parts. Built as parts so it can rear up, snap and swing its tail in a fight. */
export function salamander(scale = 1): Golem {
  const g = new THREE.Group(); g.scale.setScalar(scale);
  const torso = new THREE.Group(); torso.position.y = 0.16; g.add(torso);
  const tp = P();
  vbox(tp.brick, 0, 0.0, 0, 0.36, 0.2, 0.62, '#4a3c3a'); vbox(tp.brick, 0, -0.07, 0, 0.3, 0.06, 0.56, '#b8502a');
  vbox(tp.brick, 0, 0.11, -0.05, 0.24, 0.04, 0.4, '#5e4c46');
  for (const sx of [-1, 1]) vbox(tp.brick, sx * 0.22, -0.09, -0.2, 0.1, 0.14, 0.12, '#4a3c3a');
  merge(tp, torso);
  const cracks: THREE.Mesh[] = [];
  for (const [a, b, w2, d2] of [[0, -0.12, 0.04, 0.22], [0.08, 0.08, 0.1, 0.03], [-0.08, 0.16, 0.1, 0.03]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.012, d2), GLOW.flame); m.position.set(a, 0.135, b); torso.add(m); cracks.push(m); }
  const head = new THREE.Group(); head.position.set(0, 0.04, 0.34); torso.add(head);
  const hp = P(); vbox(hp.brick, 0, 0.02, 0.1, 0.28, 0.16, 0.26, '#4e4040'); vbox(hp.brick, 0, -0.04, 0.2, 0.22, 0.05, 0.14, '#b8502a'); merge(hp, head);
  const eyes: THREE.Mesh[] = [];
  for (const ex of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), GLOW.eye); e.position.set(ex, 0.08, 0.16); head.add(e); eyes.push(e); }
  const leg = (sx: number) => { const a = new THREE.Group(); a.position.set(sx * 0.22, -0.02, 0.2); torso.add(a); const lp = P(); vbox(lp.brick, 0, -0.08, 0.02, 0.1, 0.16, 0.12, '#4a3c3a'); merge(lp, a); return a; };
  const armL = leg(-1), armR = leg(1);
  const tail = new THREE.Group(); tail.position.set(0, 0, -0.32); torso.add(tail);
  const tl = P(); vbox(tl.brick, 0, -0.02, -0.14, 0.2, 0.14, 0.3, '#4a3c3a'); vbox(tl.brick, 0, -0.04, -0.38, 0.13, 0.1, 0.26, '#4e4040'); vbox(tl.brick, 0, -0.06, -0.58, 0.07, 0.07, 0.2, '#5e4c46'); merge(tl, tail);
  const tc = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.4), GLOW.flame); tc.position.set(0, 0.06, -0.3); tail.add(tc); cracks.push(tc);
  return { g, torso, head, armL, armR, eyes, cracks, tail };
}

/** The volcano behind the burning island: a stepped mountain of basalt and ash, with lava running
    down its face from a glowing crater. Built once into the floor's merged mesh. */
function volcanoBackdrop(S: Record<string, L>, addGlow: (k: keyof typeof GLOW, g: THREE.BufferGeometry) => void, box: (w: number, h: number, d: number, x: number, y: number, z: number) => THREE.BufferGeometry, W: number, v: FloorView, ox: number, oz: number) {
  const cx = W / 2, cz = -9, peak = 8.5;
  for (let z = -20; z < 0; z++) for (let x = -8; x < W + 8; x++) {
    const d = Math.hypot((x + 0.5 - cx) * 0.9, (z + 0.5 - cz) * 1.1);
    let h = peak - d * 0.72 + (H(x, z, 470) - 0.5) * 0.5;
    if (h <= 0.2) continue;
    const crater = d < 2.2;
    if (crater) h = peak - 1.4 + (H(x, z, 471) - 0.5) * 0.3;
    h = Math.round(h * 2.5) / 2.5;
    const col = crater ? '#2a2224' : h > peak - 2.2 ? pick(['#9a9490', '#8e8884'], x, z) : h > 3 ? pick(['#544e50', '#4e4848', '#5a5354'], x, z) : pick(['#46424a', '#4c4646'], x, z);
    vbox(S.stone, x + 0.5, h / 2 - 0.3, z + 0.5, 1, h, 1, col);
    if (crater && d < 1.4) addGlow('flame', box(0.9, 0.06, 0.9, x + 0.5, h - 0.25, z + 0.5));
    // two rivers of lava down the south face
    const lane = Math.abs(x + 0.5 - (cx - 2.5 + (cz - z) * 0.18)) < 0.6 || Math.abs(x + 0.5 - (cx + 3 - (cz - z) * 0.12)) < 0.5;
    if (!crater && lane && z > cz && h > 0.8) addGlow('ember', box(0.5, 0.03, 1.02, x + 0.5, h - 0.28, z + 0.5));
  }
  v.crater = new THREE.Vector3(ox + cx, peak, oz + cz);
}
