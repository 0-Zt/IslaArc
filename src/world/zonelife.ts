import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { scene } from '../render/renderer';
import { nightK } from '../render/daynight';
import { vbox } from '../assets/voxel';
import { hash } from '../core/random';
import { SWAY, SWAY_MAT, seaScroll } from './cavebuild';
import { smoke } from './particles';
import { tileUnder, topY } from './island';

/* Little lives for the outdoor places (and a few fireflies on the home island at night).
   Everything here is cheap on purpose: one merged mesh of grass that sways in the vertex shader,
   and a handful of instanced creatures — butterflies by day, fireflies by night, gulls that
   circle high, crabs that run sideways on the sand, steam from the hot vents. */

type Walk = (x: number, z: number) => boolean;
const glowMat = (c: THREE.Color) => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false });
const _o = new THREE.Object3D(), _m = new THREE.Matrix4();

/* ---------- fireflies (shared by the zones and the home island) ---------- */
const NF = 12;
const fly = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), glowMat(new THREE.Color(2.2, 2.6, 0.7)), NF);
fly.frustumCulled = false; fly.renderOrder = 60; fly.count = 0;
const flies = Array.from({ length: NF }, (_, k) => ({ x: 0, y: 0, z: 0, ox: 0, oz: 0, ph: k * 1.7, set: false }));
scene.add(fly);
function tickFlies(T: number, place: (k: number) => [number, number, number] | null, k0 = 1) {
  const on = Math.min(1, Math.max(0, (nightK - 0.25) / 0.4)) * k0;
  if (on <= 0.01) { fly.count = 0; return; }
  let n = 0;
  flies.forEach((f, k) => {
    if (!f.set) { const p = place(k); if (!p) return; [f.ox, f.y, f.oz] = p; f.set = true; }
    // a slow wander around their spot, and a blink now and then
    f.x = f.ox + Math.sin(T * 0.4 + f.ph) * 1.1 + Math.sin(T * 1.3 + f.ph * 2) * 0.25;
    f.z = f.oz + Math.cos(T * 0.33 + f.ph) * 1.1;
    const y = f.y + Math.sin(T * 0.9 + f.ph) * 0.25;
    const blink = Math.max(0, Math.sin(T * 1.6 + f.ph * 3)) * on;
    _o.position.set(f.x, y, f.z); _o.rotation.set(0, 0, 0); _o.scale.setScalar(0.4 + blink); _o.updateMatrix();
    fly.setMatrixAt(n++, _o.matrix);
  });
  fly.count = n; fly.instanceMatrix.needsUpdate = true;
}

/* ---------- the zone's creatures ---------- */
const NB = 5, NG = 3, NC = 3;
const bWing = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.01, 0.1), new THREE.MeshLambertMaterial({ color: '#ffffff' }), NB * 2);
const gull = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.08, 0.3), new THREE.MeshLambertMaterial({ color: '#f4f4f0' }), NG);
const gWing = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.02, 0.14), new THREE.MeshLambertMaterial({ color: '#e8e8e4' }), NG * 2);
const crab = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.08, 0.14), new THREE.MeshLambertMaterial({ color: '#d8583a' }), NC);
const crabClaw = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.06, 0.07), new THREE.MeshLambertMaterial({ color: '#e86a4a' }), NC * 2);
for (const m of [bWing, gull, gWing, crab, crabClaw]) { m.frustumCulled = false; m.count = 0; }
const WING_COL = ['#f2c14e', '#7ec8e8', '#e86a8a', '#ffffff', '#c890f0'];
for (let k = 0; k < NB * 2; k++) bWing.setColorAt(k, new THREE.Color(WING_COL[Math.floor(k / 2) % WING_COL.length]));

/* the burning island: ash that falls, little salamanders that run from the party */
const NA = 46, NS = 5;
const ash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.012, 0.05), new THREE.MeshLambertMaterial({ color: '#9a9496' }), NA);
const salB = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.06, 0.3), new THREE.MeshLambertMaterial({ color: '#2a2224' }), NS);
const salT = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.04, 0.22), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.55, 0.12) }), NS);
for (const m of [ash, salB, salT]) { m.frustumCulled = false; m.count = 0; }
const group = new THREE.Group(); group.add(bWing, gull, gWing, crab, crabClaw, ash, salB, salT);
let on = false, OX = 0, OZ = 0, W = 0, H = 0, walk: Walk = () => false, kind: 'isla' | 'torre' | 'volcan' | 'selva' = 'isla';
let flakes: { x: number; y: number; z: number; vx: number; ph: number }[] = [];
let sals: { x: number; z: number; tx: number; tz: number; wait: number; ph: number; a: number }[] = [];
let springs: [number, number][] = [], ashCells: [number, number][] = [];
let grass: THREE.Mesh | null = null;
let butterflies: { x: number; z: number; y: number; tx: number; tz: number; ph: number }[] = [];
let gulls: { r: number; a: number; w: number; y: number; ph: number }[] = [];
let crabs: { x: number; z: number; tx: number; tz: number; wait: number; ph: number }[] = [];
let vents: [number, number][] = [], flowers: [number, number][] = [], sand: [number, number][] = [], grassCells: [number, number][] = [];
let steamT = 0;

export function zoneLifeStart(map: string[], theme: 'isla' | 'torre' | 'volcan' | 'selva', ox: number, oz: number, walkable: Walk, springCells: [number, number][] = [], _crater: THREE.Vector3 | null = null) {
  zoneLifeStop();
  on = true; OX = ox; OZ = oz; W = map[0].length; H = map.length; walk = walkable; kind = theme;
  vents = []; flowers = []; sand = []; grassCells = []; springs = springCells; ashCells = [];
  map.forEach((row, z) => [...row].forEach((c, x) => { if (c === 'b') vents.push([x, z]); if (c === ',') flowers.push([x, z]); if (c === ':') sand.push([x, z]); if (c === '.' || c === ',') grassCells.push([x, z]); if (c === '.' || c === ',' || c === ':') ashCells.push([x, z]); }));
  flakes = []; sals = [];
  (ash.material as THREE.MeshLambertMaterial).color.set(theme === 'selva' ? '#6aa040' : '#9a9496');
  (gull.material as THREE.MeshLambertMaterial).color.set(theme === 'selva' ? '#d83a2a' : '#f4f4f0');
  (gWing.material as THREE.MeshLambertMaterial).color.set(theme === 'selva' ? '#2a8ad8' : '#e8e8e4');
  if (theme === 'selva') flakes = Array.from({ length: 22 }, (_, k) => ({ x: 0, y: 1 + hash(k, 1, 341) * 4, z: 0, vx: 0.05 + hash(k, 2, 342) * 0.1, ph: k * 0.7 }));
  if (theme === 'volcan') {
    flakes = Array.from({ length: NA }, (_, k) => ({ x: 0, y: 1 + hash(k, 1, 341) * 5, z: 0, vx: 0.1 + hash(k, 2, 342) * 0.2, ph: k * 0.7 }));
    sals = ashCells.length ? Array.from({ length: NS }, (_, k) => { const [x, z] = ashCells[Math.floor(hash(k, 9, 343) * ashCells.length)]; return { x: OX + x + 0.5, z: OZ + z + 0.5, tx: OX + x + 0.5, tz: OZ + z + 0.5, wait: k, ph: k * 1.9, a: 0 }; }) : [];
    vents = vents.filter((_, k) => k % 2 === 0);   // the burning ground is wide: steam from fewer of its cells
    butterflies = []; gulls = Array.from({ length: 1 }, () => ({ r: 9, a: 0, w: 0.18, y: 4.5, ph: 0 })); crabs = [];
    scene.add(group); return;
  }
  flies.forEach(f => { f.set = false; });
  if (theme === 'isla' || theme === 'selva') {
    // tufts of grass on some meadow cells: one merged mesh, swaying in the shader
    const list: THREE.BufferGeometry[] = [];
    for (const [x, z] of grassCells) {
      if (hash(x, z, 301) > 0.55) continue;
      for (let t = 0; t < 2; t++) {
        const bx = x + 0.2 + hash(x, z, 302 + t) * 0.6, bz = z + 0.2 + hash(x, z, 305 + t) * 0.6;
        for (let k = 0; k < 4; k++) { const h = 0.16 + hash(x, z, 310 + k + t * 7) * 0.2; vbox(list, bx + (k - 1.5) * 0.04, h / 2, bz + ((k % 2) - 0.5) * 0.04, 0.035, h, 0.03, k % 2 ? '#86c45a' : '#6fae4a'); }
      }
    }
    if (list.length) { grass = new THREE.Mesh(mergeGeometries(list), SWAY_MAT); grass.position.set(OX, 0, OZ); grass.receiveShadow = true; group.add(grass); }
    butterflies = Array.from({ length: NB }, (_, k) => { const [x, z] = (flowers.length ? flowers : grassCells)[k % Math.max(1, (flowers.length ? flowers : grassCells).length)] || [W / 2, H / 2]; return { x: OX + x + 0.5, z: OZ + z + 0.5, y: 0.5, tx: OX + x + 0.5, tz: OZ + z + 0.5, ph: k * 1.3 }; });
    gulls = Array.from({ length: NG }, (_, k) => ({ r: 4 + k * 2.2, a: k * 2.1, w: (k % 2 ? 1 : -1) * (0.25 + k * 0.05), y: 3.2 + k * 0.5, ph: k }));
    crabs = theme === 'selva' ? [] : sand.length ? Array.from({ length: NC }, (_, k) => { const [x, z] = sand[Math.floor(hash(k, 7, 311) * sand.length)]; return { x: OX + x + 0.5, z: OZ + z + 0.5, tx: OX + x + 0.5, tz: OZ + z + 0.5, wait: k, ph: k * 2 }; }) : [];
  } else { butterflies = []; gulls = []; crabs = []; }
  scene.add(group);
}
export function zoneLifeStop() {
  on = false; scene.remove(group); fly.count = 0;
  if (grass) { group.remove(grass); grass.geometry.dispose(); grass = null; }
}

export function tickZoneLife(dt: number, T: number, lead: THREE.Vector3) {
  SWAY.uniforms.uTime.value = T;
  if (!on) return;
  seaScroll(dt);
  const day = 1 - nightK;
  // butterflies: hop from flower to flower by day
  let n = 0;
  for (const b of butterflies) {
    if (day < 0.3) break;
    if (Math.hypot(b.tx - b.x, b.tz - b.z) < 0.2) { const [x, z] = (flowers.length ? flowers : grassCells)[Math.floor(Math.random() * (flowers.length || grassCells.length))]; b.tx = OX + x + 0.5 + (Math.random() - 0.5) * 0.6; b.tz = OZ + z + 0.5 + (Math.random() - 0.5) * 0.6; }
    const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz) || 1;
    b.x += dx / d * dt * 0.9 + Math.sin(T * 3 + b.ph) * dt * 0.4; b.z += dz / d * dt * 0.9 + Math.cos(T * 2.6 + b.ph) * dt * 0.4;
    b.y = 0.45 + Math.abs(Math.sin(T * 2.2 + b.ph)) * 0.35;
    const flap = Math.sin(T * 22 + b.ph) * 1.1, head = Math.atan2(dx, dz);
    for (const s of [-1, 1]) {
      _o.position.set(b.x, b.y, b.z); _o.rotation.set(0, head, 0); _o.scale.setScalar(1); _o.updateMatrix();
      _m.makeRotationZ(s * flap).premultiply(new THREE.Matrix4().makeTranslation(0, 0, 0)).multiply(new THREE.Matrix4().makeTranslation(s * 0.06, 0, 0));
      bWing.setMatrixAt(n++, _o.matrix.clone().multiply(_m));
    }
  }
  bWing.count = n; bWing.instanceMatrix.needsUpdate = true; if (bWing.instanceColor) bWing.instanceColor.needsUpdate = true;
  // gulls: slow circles high above, wings beating now and then
  let g = 0;
  const cx = OX + W / 2, cz = OZ + H / 2;
  for (const q of gulls) {
    q.a += q.w * dt;
    const x = cx + Math.cos(q.a) * q.r, z = cz + Math.sin(q.a) * q.r * 0.7, head = Math.atan2(-Math.sin(q.a) * q.w, Math.cos(q.a) * q.w * 0.7);
    _o.position.set(x, q.y + Math.sin(T + q.ph) * 0.2, z); _o.rotation.set(0, head, Math.sign(q.w) * 0.25); _o.scale.setScalar(1); _o.updateMatrix();
    gull.setMatrixAt(g, _o.matrix);
    const beat = Math.sin(T * 6 + q.ph) > 0.3 ? Math.sin(T * 12 + q.ph) * 0.5 : 0.1;
    for (const s of [-1, 1]) { _m.makeTranslation(s * 0.06, 0, 0).multiply(new THREE.Matrix4().makeRotationZ(s * beat)).multiply(new THREE.Matrix4().makeTranslation(s * 0.2, 0, 0)); gWing.setMatrixAt(g * 2 + (s < 0 ? 0 : 1), _o.matrix.clone().multiply(_m)); }
    g++;
  }
  gull.count = g; gWing.count = g * 2; gull.instanceMatrix.needsUpdate = gWing.instanceMatrix.needsUpdate = true;
  // crabs: short sideways runs on the sand, away from the party
  let c = 0;
  for (const k of crabs) {
    const dl = Math.hypot(k.x - lead.x, k.z - lead.z);
    if (dl < 1.6) { const a = Math.atan2(k.z - lead.z, k.x - lead.x); k.tx = k.x + Math.cos(a) * 1.5; k.tz = k.z + Math.sin(a) * 1.5; k.wait = 0; }
    else if ((k.wait -= dt) <= 0 && Math.hypot(k.tx - k.x, k.tz - k.z) < 0.05) { k.wait = 1 + Math.random() * 3; const [x, z] = sand[Math.floor(Math.random() * sand.length)]; if (Math.hypot(OX + x + 0.5 - k.x, OZ + z + 0.5 - k.z) < 4) { k.tx = OX + x + 0.5; k.tz = OZ + z + 0.5; } }
    const dx = k.tx - k.x, dz = k.tz - k.z, d = Math.hypot(dx, dz);
    if (d > 0.02) { const sp = Math.min(d, dt * (dl < 1.6 ? 2.2 : 0.7)); const nx = k.x + dx / d * sp, nz = k.z + dz / d * sp; if (walk(Math.floor(nx - OX), Math.floor(nz - OZ))) { k.x = nx; k.z = nz; } else { k.tx = k.x; k.tz = k.z; } }
    const moving = d > 0.02, wob = moving ? Math.sin(T * 30 + k.ph) * 0.02 : 0;
    _o.position.set(k.x, 0.05 + Math.abs(wob), k.z); _o.rotation.set(0, Math.atan2(dz, -dx) || 0, 0); _o.scale.setScalar(1); _o.updateMatrix();
    crab.setMatrixAt(c, _o.matrix);
    for (const s of [-1, 1]) { _m.makeTranslation(s * 0.11, 0.02, 0.08 + (s > 0 ? Math.sin(T * 4 + k.ph) * 0.02 : 0)); crabClaw.setMatrixAt(c * 2 + (s < 0 ? 0 : 1), _o.matrix.clone().multiply(_m)); }
    c++;
  }
  crab.count = c; crabClaw.count = c * 2; crab.instanceMatrix.needsUpdate = crabClaw.instanceMatrix.needsUpdate = true;
  // the burning island: ash drifting down around the party, salamanders on the ash
  if (kind === 'volcan' || kind === 'selva') {
    let a = 0;
    for (const f of flakes) {
      f.y -= dt * (kind === 'selva' ? 0.25 : 0.35); f.x += f.vx * dt;
      if (f.y < 0 || !f.x || Math.abs(f.x - lead.x) > 7 || Math.abs(f.z - lead.z) > 6) { f.x = lead.x + (Math.random() - 0.5) * 12; f.z = lead.z + (Math.random() - 0.5) * 10; f.y = f.y < 0 || !f.x ? 4 + Math.random() * 2 : f.y; }
      _o.position.set(f.x + Math.sin(T + f.ph) * 0.2, f.y, f.z); _o.rotation.set(Math.sin(T * 2 + f.ph), f.ph, 0); _o.scale.setScalar(1); _o.updateMatrix(); ash.setMatrixAt(a++, _o.matrix);
    }
    ash.count = a; ash.instanceMatrix.needsUpdate = true;
    let n2 = 0;
    for (const q of sals) {
      const dl = Math.hypot(q.x - lead.x, q.z - lead.z);
      if (dl < 1.8) { const an = Math.atan2(q.z - lead.z, q.x - lead.x); q.tx = q.x + Math.cos(an) * 2; q.tz = q.z + Math.sin(an) * 2; q.wait = 0; }
      else if ((q.wait -= dt) <= 0 && Math.hypot(q.tx - q.x, q.tz - q.z) < 0.05) { q.wait = 2 + Math.random() * 4; const [x, z] = ashCells[Math.floor(Math.random() * ashCells.length)]; if (Math.hypot(OX + x + 0.5 - q.x, OZ + z + 0.5 - q.z) < 5) { q.tx = OX + x + 0.5; q.tz = OZ + z + 0.5; } }
      const dx = q.tx - q.x, dz = q.tz - q.z, d = Math.hypot(dx, dz);
      if (d > 0.02) { const sp = Math.min(d, dt * (dl < 1.8 ? 2.6 : 0.9)); const nx = q.x + dx / d * sp, nz = q.z + dz / d * sp; if (walk(Math.floor(nx - OX), Math.floor(nz - OZ))) { q.x = nx; q.z = nz; q.a = Math.atan2(dx, dz); } else { q.tx = q.x; q.tz = q.z; } }
      const wig = d > 0.02 ? Math.sin(T * 24 + q.ph) * 0.3 : Math.sin(T * 2 + q.ph) * 0.1;
      _o.position.set(q.x, 0.04, q.z); _o.rotation.set(0, q.a + wig * 0.3, 0); _o.scale.setScalar(1); _o.updateMatrix(); salB.setMatrixAt(n2, _o.matrix);
      _m.makeRotationY(-wig).multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.24)); salT.setMatrixAt(n2, _o.matrix.clone().multiply(_m));
      n2++;
    }
    salB.count = salT.count = n2; salB.instanceMatrix.needsUpdate = salT.instanceMatrix.needsUpdate = true;
    if (springs.length && Math.random() < dt * 4) { const [x, z] = springs[Math.floor(Math.random() * springs.length)]; smoke(OX + x + 0.5 + (Math.random() - 0.5) * 0.6, 0, OZ + z + 0.5 + (Math.random() - 0.5) * 0.6, '#f4f8f8', 0.09, 1.6); }
  } else { ash.count = 0; salB.count = salT.count = 0; }
  // steam from the hot vents
  steamT -= dt;
  if (steamT <= 0 && vents.length) { steamT = 0.18; const [x, z] = vents[Math.floor(Math.random() * vents.length)]; smoke(OX + x + 0.5 + (Math.random() - 0.5) * 0.4, 0.15, OZ + z + 0.5 + (Math.random() - 0.5) * 0.4, Math.random() < 0.7 ? '#f4f4f0' : '#e8e4c8', 0.1, 1.8); }
  // fireflies over the meadow at night
  if (kind === 'isla' || kind === 'selva') tickFlies(T, k => { const p = grassCells[Math.floor(hash(k, 3, 321) * grassCells.length)]; return p ? [OX + p[0] + 0.5, 0.7 + hash(k, 5, 322) * 0.6, OZ + p[1] + 0.5] : null; });
  else fly.count = 0;
}

/* ---------- the home island at night ---------- */
let homeT = 0;
export function tickIslandLife(dt: number, T: number, centre: THREE.Vector3, hidden: boolean) {
  SWAY.uniforms.uTime.value = T;
  if (on) return;                                    // a zone is open: its own fireflies are in use
  homeT -= dt;
  if (hidden) { fly.count = 0; return; }
  // every so often the fireflies move to wherever the camera is looking, over land
  if (homeT <= 0) { homeT = 25; flies.forEach(f => { f.set = false; }); }
  tickFlies(T, k => {
    for (let tries = 0; tries < 6; tries++) {
      const a = hash(k, tries, 331) * Math.PI * 2, r = 2 + hash(k, tries, 332) * 7;
      const x = centre.x + Math.cos(a) * r, z = centre.z + Math.sin(a) * r, t = tileUnder(x, z);
      if (t && !t.building) return [x, topY(t) + 0.6 + hash(k, 1, 333) * 0.7, z];
    }
    return null;
  }, 0.9);
  void dt;
}
