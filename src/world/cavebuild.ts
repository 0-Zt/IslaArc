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
export interface Golem { g: THREE.Group; torso: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; eyes: THREE.Mesh[]; cracks: THREE.Mesh[] }
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
  embers: THREE.Vector3[]; lavaLights: THREE.PointLight[];
}

const isWall = (c: string | undefined) => !c || c === '#';

export function buildFloor(map: string[], dirs: Record<string, string>, decor: { mushrooms: number[][]; stalagmites: number[][] }, relicKind = 0): FloorView {
  const W = map[0].length, Hh = map.length;
  const at = (x: number, z: number) => (map[z] && map[z][x]) || '#';
  const root = new THREE.Group(); root.position.set(CAVE_X, 0, CAVE_Z);
  const v: FloorView = { root, boulders: new Map(), braziers: new Map(), statues: new Map(), doors: new Map(), gates: new Map(), plates: new Map(), crystals: new Map(), veins: new Map(), chests: new Map(), rubble: new Map(), pits: new Map(), lava: new Map(), altar: null, shell: null, golem: null, embers: [], lavaLights: [], cracked: new Map(), relic: null };
  const S = P(); const glowParts: Record<string, L> = {};
  const addGlow = (k: keyof typeof GLOW, g: THREE.BufferGeometry) => { (glowParts[k] = glowParts[k] || []).push(g); };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };

  const FLOOR = ['#6a5c50', '#72624f', '#655648', '#6e5f52'], MOSS = ['#5c6a40', '#647345', '#556238'];
  const ROCK = ['#3e3a44', '#47424d', '#38343e', '#4c4651'], DEEP = '#16141a';
  for (let z = 0; z < Hh; z++) for (let x = 0; x < W; x++) {
    const c = at(x, z), cx = x + 0.5, cz = z + 0.5;
    if (isWall(c)) {
      const nearOpen = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]].some(([a, b]) => !isWall(at(x + a, z + b)));
      if (!nearOpen) { vbox(S.stone, cx, 0.45, cz, 1.0, 0.9, 1.0, DEEP); continue; }
      // the camera looks from the south: a wall with open floor to its north would hide that floor,
      // so those stay low (a ledge); walls behind the floor rise high and give the room its depth
      const front = !isWall(at(x, z - 1)) || !isWall(at(x - 1, z - 1)) && !isWall(at(x + 1, z - 1));
      const back = !isWall(at(x, z + 1));
      const h = front ? 0.5 + H(x, z) * 0.2 : back ? 1.7 + H(x, z) * 0.7 : 1.0 + H(x, z) * 0.5, n = front ? 1 : H(x, z, 2) < 0.5 ? 2 : 3;
      let y = 0;
      for (let k = 0; k < n; k++) {
        const hh = h / n * (0.8 + H(x, z, k + 5) * 0.4), ins = 0.02 + H(x, z, k + 9) * 0.08;
        vbox(S.stone, cx + (H(x, z, k + 11) - 0.5) * 0.08, y + hh / 2, cz + (H(x, z, k + 13) - 0.5) * 0.08, 1.0 - ins, hh, 1.0 - ins, pick(ROCK, x, z, k));
        y += hh;
      }
      vbox(S.stone, cx, y + 0.03, cz, 0.86, 0.06, 0.86, front ? '#56515c' : '#25222a');
      if (front) for (let k = 0; k < 2; k++) vbox(S.stone, cx + (H(x, z, k + 33) - 0.5) * 0.6, y + 0.1, cz + (H(x, z, k + 35) - 0.5) * 0.6, 0.18, 0.14, 0.16, pick(ROCK, x, z, k + 3));
      // crystals grow on some walls that face open floor
      if (H(x, z, 31) < 0.14 && !front) {
        const side = [[0, 1], [1, 0], [-1, 0]].find(([a, b]) => !isWall(at(x + a, z + b)));
        if (side) { const [a, b] = side; for (let k = 0; k < 3; k++) { const hgt = 0.18 + H(x, z, k + 40) * 0.25; addGlow('crystal', box(0.07, hgt, 0.07, cx + a * 0.52 + (k - 1) * 0.12 * (b ? 1 : 0), 0.5 + H(x, z, k + 44) * 0.6, cz + b * 0.52 + (k - 1) * 0.12 * (a ? 1 : 0))); } }
      }
      continue;
    }
    // floor under everything that is not a wall (lava and pits are sunk below)
    if (c === '~') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), LAVA_MAT); m.position.set(cx, -0.22, cz); root.add(m); v.lava.set(`${x},${z}`, m);
      vbox(S.stone, cx, -0.45, cz, 1, 0.3, 1, '#2a1a12');
      if (H(x, z, 50) < 0.25) v.embers.push(new THREE.Vector3(CAVE_X + cx, -0.1, CAVE_Z + cz));
      continue;
    }
    if (c === 'O') {
      const g = new THREE.Group(); g.position.set(cx, 0, cz);
      const pp = P(); vbox(pp.stone, 0, -0.9, 0, 1, 1.4, 1, '#0a0807');
      for (const [a, b] of [[-0.42, 0], [0.42, 0], [0, -0.42], [0, 0.42]]) vbox(pp.stone, a, -0.06, b, a ? 0.16 : 0.9, 0.14, b ? 0.16 : 0.9, '#3a302a');
      merge(pp, g, false); root.add(g); v.pits.set(`${x},${z}`, g);
      continue;
    }
    const moss = c === ',' || H(x, z, 3) < 0.12;
    vbox(S.stone, cx, -0.15, cz, 1, 0.3, 1, moss ? pick(MOSS, x, z) : pick(FLOOR, x, z));
    // pebbles and cracks
    if (H(x, z, 4) < 0.55) for (let k = 0; k < 1 + Math.floor(H(x, z, 6) * 3); k++) vbox(S.stone, cx + (H(x, z, k + 20) - 0.5) * 0.8, 0.03, cz + (H(x, z, k + 23) - 0.5) * 0.8, 0.08 + H(x, z, k + 26) * 0.08, 0.06, 0.08 + H(x, z, k + 29) * 0.08, pick(['#6a5d50', '#5a4e44', '#7a6c5e'], x, z, k));
    if (H(x, z, 8) < 0.2) vbox(S.stone, cx + (H(x, z, 9) - 0.5) * 0.4, 0.005, cz, 0.5, 0.01, 0.04, '#2a2420');
  }
  // stairs: S rises to an opening with light from above; > drops into the dark
  for (let z = 0; z < Hh; z++) for (let x = 0; x < W; x++) {
    const c = at(x, z), cx = x + 0.5, cz = z + 0.5;
    if (c === 'S') {
      for (let k = 0; k < 3; k++) vbox(S.stone, cx, 0.05 + k * 0.1, cz + 0.2 + k * 0.1, 0.8, 0.1, 0.25, '#6a5c50');
      const d = lightDecal(1.6, '#fff0c8'); d.position.set(cx, 0.02, cz); root.add(d);
    }
    if (c === '>') {
      vbox(S.stone, cx, -0.6, cz, 0.9, 1.0, 0.9, '#0a0807');
      for (let k = 0; k < 3; k++) vbox(S.stone, cx, -0.08 - k * 0.14, cz + 0.3 - k * 0.22, 0.8, 0.08, 0.22, '#3a302a');
    }
    if (c === 'A') {
      vbox(S.stone, cx, 0.2, cz, 0.7, 0.4, 0.7, '#5a4e44'); vbox(S.stone, cx, 0.45, cz, 0.5, 0.1, 0.5, '#6a5c50');
      const orb = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), GLOW.orb); orb.position.set(cx, 0.65, cz); root.add(orb); v.altar = { orb };
    }
    if (c === 'L') {
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
  merge(S, root);
  for (const [k, list] of Object.entries(glowParts)) { const m = new THREE.Mesh(mergeGeometries(list), (GLOW as any)[k]); root.add(m); }

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
        root.add(G); v.braziers.set(key, { flame, decal, light: null, pos: new THREE.Vector3(CAVE_X + cx, 0.9, CAVE_Z + cz) }); break;
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
      case 'Y': {
        vbox(pp.stone, 0, 0.18, 0, 0.5, 0.36, 0.5, '#5e5650'); vbox(pp.stone, 0, 0.38, 0, 0.6, 0.06, 0.6, '#6a625a');
        merge(pp, G);
        const item = new THREE.Group(); item.position.y = 0.42; G.add(item);
        const ip = P();
        if (relicKind === 0) { vbox(ip.brick, 0, 0.12, 0, 0.12, 0.16, 0.1, '#c9a07a'); vbox(ip.brick, 0, 0.26, 0, 0.13, 0.12, 0.12, '#d4ac86'); vbox(ip.brick, 0.09, 0.12, 0, 0.04, 0.1, 0.04, '#c9a07a'); vbox(ip.brick, -0.09, 0.12, 0, 0.04, 0.1, 0.04, '#c9a07a'); }
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
