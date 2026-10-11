import * as THREE from 'three';
import { scene } from '../render/renderer';
import { makeCanvas } from '../core/canvas';
import { CAVE_X, CAVE_Z } from './cavebuild';
import { puff } from './particles';
import { sfx } from '../audio/sfx';
import { hash } from '../core/random';

/* What makes the cave feel alive (a bit like Core Keeper): darkness that only opens around
   the lantern and the fires, bats that sleep on the walls and burst out when someone walks by,
   little glowing beetles that run away, water dripping from the ceiling into puddles, dust
   floating in the light and, on the lava floor, bubbles that pop. */

export interface Light { x: number; z: number; r: number }
type Walk = (x: number, z: number) => boolean;

/* ---------- darkness: a sheet above the room with holes cut where there is light ---------- */
const DK = 256, SHEET_Y = 2.75;
const dark = makeCanvas(DK, DK, () => {});
const darkTex = new THREE.CanvasTexture(dark);
const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: darkTex, transparent: true, depthWrite: false, fog: false }));
sheet.rotation.x = -Math.PI / 2; sheet.renderOrder = 50;
let box = { x0: 0, z0: 0, w: 1, h: 1 };
/** The camera looks down at about 62°, so a light on the floor shows through the sheet a bit closer to the camera. */
const SHIFT = (SHEET_Y - 0.5) / (16 / 8.4);

/* everything that glows by itself is drawn after the darkness, so it still shines in the dark */
const glowMat = (c: THREE.Color) => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false });

/* ---------- bats ---------- */
const NB = 8;
const batBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.1, 0.16), new THREE.MeshLambertMaterial({ color: '#3a2c40' }), NB);
const batWing = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.02, 0.13), new THREE.MeshLambertMaterial({ color: '#4c3a58' }), NB * 2);
const batEye = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.025, 0.01), glowMat(new THREE.Color(2.4, 0.5, 0.3)), NB * 2);
for (const m of [batBody, batWing, batEye]) { m.frustumCulled = false; m.count = 0; }
batEye.renderOrder = 60;
interface Bat { x: number; y: number; z: number; roost: number; mode: 'roost' | 'fly'; t: number; cx: number; cz: number; r: number; w: number; ph: number; land: number }
let bats: Bat[] = [], roosts: THREE.Vector3[] = [];

/* ---------- glowing beetles ---------- */
const NG = 10;
const bugBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.05, 0.12), new THREE.MeshLambertMaterial({ color: '#2a2420' }), NG);
const bugGlowMat = glowMat(new THREE.Color(0.4, 2.2, 1.6));
const bugGlow = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.04, 0.06), bugGlowMat, NG);
for (const m of [bugBody, bugGlow]) { m.frustumCulled = false; m.count = 0; }
bugGlow.renderOrder = 60;
interface Bug { x: number; z: number; a: number; sp: number; turn: number; ph: number }
let bugs: Bug[] = [];

/* ---------- drips, puddles, dust ---------- */
const dropMat = glowMat(new THREE.Color(1.1, 1.5, 1.9));
const drops: { m: THREE.Mesh; x: number; z: number; y: number; v: number; wait: number }[] = [];
const ringTex = new THREE.CanvasTexture(makeCanvas(64, 64, x => { x.strokeStyle = 'rgba(200,230,255,0.9)'; x.lineWidth = 3; x.beginPath(); x.arc(32, 32, 26, 0, Math.PI * 2); x.stroke(); }));
const rings: { m: THREE.Mesh; t: number }[] = [];
const ND = 26;
const dust = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.0, 0.75), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }), ND);
dust.frustumCulled = false; dust.renderOrder = 61; dust.count = ND;
const motes = Array.from({ length: ND }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.02 + Math.random() * 0.025, ph: Math.random() * 6 }));

const group = new THREE.Group();
group.add(sheet, batBody, batWing, batEye, bugBody, bugGlow, dust);
let on = false, walk: Walk = () => false, lavaCells: [number, number][] = [], floor = 0, bubbleT = 1;
const _o = new THREE.Object3D(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
let OX = CAVE_X, OZ = CAVE_Z;
const W = (x: number, z: number, y = 0) => new THREE.Vector3(OX + x, y, OZ + z);

/** Sets up the life of a floor: where bats sleep, where beetles crawl, where water drips. */
export function lifeStart(map: string[], fi: number, walkable: Walk, ox = CAVE_X, oz = CAVE_Z) {
  OX = ox; OZ = oz;
  lifeStop();
  on = true; walk = walkable; floor = fi;
  const Wd = map[0].length, Hd = map.length;
  box = { x0: OX - 4, z0: OZ - 4, w: Wd + 8, h: Hd + 8 };
  sheet.scale.set(box.w, box.h, 1); sheet.position.set(box.x0 + box.w / 2, SHEET_Y, box.z0 + box.h / 2);
  const open = (x: number, z: number) => { const c = map[z]?.[x]; return !!c && c !== '#'; };
  const floorCells: [number, number][] = [];
  lavaCells = [];
  map.forEach((row, z) => [...row].forEach((c, x) => { if ('.,'.includes(c)) floorCells.push([x, z]); if (c === '~') lavaCells.push([x, z]); }));
  // bats sleep high on the back walls (walls with open floor right below them on screen)
  roosts = [];
  map.forEach((row, z) => [...row].forEach((c, x) => { if (c === '#' && open(x, z + 1) && !open(x, z - 1) && hash(x * 7, z * 3, fi + 41) < 0.35) roosts.push(W(x + 0.5, z + 0.95, 1.55)); }));
  const nb = Math.min(NB, [5, 6, 4][fi] ?? 4);
  bats = [];
  for (let k = 0; k < nb && roosts.length; k++) {
    const r = k % Math.max(1, Math.min(roosts.length, 3));
    const p = roosts[r];
    bats.push({ x: p.x + (k % 3 - 1) * 0.18, y: p.y - (k % 2) * 0.08, z: p.z, roost: r, mode: 'roost', t: 0, cx: 0, cz: 0, r: 2, w: 1, ph: Math.random() * 6, land: 0 });
  }
  // beetles on open floor
  bugs = [];
  for (let k = 0; k < NG && floorCells.length; k++) {
    const [x, z] = floorCells[Math.floor(hash(k * 13, fi * 7, 5) * floorCells.length)];
    bugs.push({ x: OX + x + 0.5, z: OZ + z + 0.5, a: Math.random() * 6.28, sp: 0.25 + Math.random() * 0.15, turn: 0, ph: Math.random() * 6 });
  }
  const gc = fi === 2 ? [2.6, 1.1, 0.25] : fi === 1 ? [0.5, 1.6, 2.6] : [0.4, 2.2, 1.6]; bugGlowMat.color.setRGB(gc[0], gc[1], gc[2]);
  // water drips (not on the lava floor) into small puddles
  if (fi !== 2) {
    const spots = floorCells.filter(([x, z]) => !open(x, z - 1) && hash(x, z, fi + 77) < 0.3).slice(0, 4);
    for (const [x, z] of spots) {
      const px = x + 0.3 + hash(x, z, 3) * 0.4, pz = z + 0.25;
      const pud = new THREE.Mesh(new THREE.CircleGeometry(0.22 + hash(x, z, 9) * 0.12, 14), new THREE.MeshBasicMaterial({ color: '#2a4050', transparent: true, opacity: 0.55, depthWrite: false }));
      pud.rotation.x = -Math.PI / 2; pud.position.copy(W(px, pz, 0.012)); group.add(pud);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.035), dropMat); m.renderOrder = 60; group.add(m);
      drops.push({ m, x: OX + px, z: OZ + pz, y: 2.4, v: 0, wait: 0.5 + Math.random() * 3 });
    }
  }
  scene.add(group);
}
export function lifeStop() {
  on = false; scene.remove(group);
  for (const d of drops) group.remove(d.m); drops.length = 0;
  for (const r of rings) group.remove(r.m); rings.length = 0;
  for (const c of [...group.children]) if ((c as THREE.Mesh).geometry instanceof THREE.CircleGeometry) { group.remove(c); (c as THREE.Mesh).geometry.dispose(); }
  bats = []; bugs = [];
}

const near = (x: number, z: number, p: THREE.Vector3, d: number) => Math.hypot(x - p.x, z - p.z) < d;

/** Bats burst out of their wall and circle around for a while (also called when a wall breaks nearby). */
export function scareBats(p: THREE.Vector3, radius = 3.2) {
  let flushed = 0;
  for (const b of bats) if (b.mode === 'roost' && near(b.x, b.z, p, radius)) {
    b.mode = 'fly'; b.t = 0; b.cx = p.x + (Math.random() - 0.5) * 3; b.cz = p.z - 1 + (Math.random() - 0.5) * 2; b.r = 1.2 + Math.random() * 1.6; b.w = (Math.random() < 0.5 ? 1 : -1) * (2.2 + Math.random() * 1.4); b.land = 2.5 + Math.random() * 2.5;
    flushed++;
  }
  if (flushed) { sfx('flap', 0.9); sfx('squeak', 0.8); setTimeout(() => sfx('squeak', 0.6), 220); }
}

let darkAcc = 0, idleBat = 8;
export function tickLife(dt: number, T: number, lead: THREE.Vector3, lights: Light[], leadR = 4.6) {
  if (!on) return;
  // ---- bats
  idleBat -= dt;
  if (idleBat <= 0) { idleBat = 10 + Math.random() * 12; const sleeping = bats.filter(b => b.mode === 'roost'); const b = sleeping[Math.floor(Math.random() * sleeping.length)]; if (b) scareBats(new THREE.Vector3(b.x, 0, b.z), 0.6); }
  if (bats.some(b => b.mode === 'roost' && near(b.x, b.z, lead, 2.6))) scareBats(lead, 3);
  let n = 0;
  for (const b of bats) {
    let flap = 0;
    if (b.mode === 'fly') {
      b.t += dt; flap = Math.sin(T * 34 + b.ph);
      if (b.t < b.land) {
        // loop around a slowly drifting centre, rising and dipping
        b.cx += (lead.x - b.cx) * dt * 0.15; b.cz += (lead.z - 0.5 - b.cz) * dt * 0.15;
        const a = b.t * b.w + b.ph;
        const tx = b.cx + Math.cos(a) * b.r, tz = b.cz + Math.sin(a) * b.r * 0.7, ty = 1.7 + Math.sin(b.t * 3 + b.ph) * 0.35;
        b.x += (tx - b.x) * Math.min(1, dt * 4); b.z += (tz - b.z) * Math.min(1, dt * 4); b.y += (ty - b.y) * Math.min(1, dt * 3);
        if (Math.random() < dt * 0.4 && near(b.x, b.z, lead, 6)) sfx('squeak', 0.4);
      } else {
        // pick a roost away from the party and fly there
        if (b.land >= 0 && b.t - b.land < dt * 1.5) { const far = roosts.map((p, i) => [p, i] as const).filter(([p]) => !near(p.x, p.z, lead, 4.5)); const pick = far[Math.floor(Math.random() * far.length)] || [roosts[b.roost], b.roost]; b.roost = pick[1]; }
        const p = roosts[b.roost], dx = p.x - b.x, dz = p.z - b.z, dy = p.y - b.y, d = Math.hypot(dx, dy, dz), sp = 3.2 * dt;
        if (d < sp) { b.x = p.x + (Math.random() - 0.5) * 0.3; b.y = p.y; b.z = p.z; b.mode = 'roost'; }
        else { b.x += dx / d * sp; b.y += dy / d * sp; b.z += dz / d * sp; }
      }
    }
    const ang = b.t * b.w + b.ph, heading = b.mode === 'fly' ? Math.atan2(-Math.sin(ang) * b.w, Math.cos(ang) * 0.7 * b.w) : 0;
    _o.position.set(b.x, b.y, b.z); _o.rotation.set(b.mode === 'roost' ? Math.PI : 0, heading, 0); _o.scale.setScalar(1); _o.updateMatrix();
    batBody.setMatrixAt(n, _o.matrix);
    for (const side of [-1, 1]) {
      const fold = b.mode === 'roost' ? 0.35 : 1;
      _m.makeTranslation(side * 0.06, 0, 0).multiply(_m2.makeRotationZ(side * (b.mode === 'roost' ? 1.3 : flap * 0.9))).multiply(new THREE.Matrix4().makeTranslation(side * 0.1 * fold, 0, 0)).multiply(new THREE.Matrix4().makeScale(fold, 1, 1));
      batWing.setMatrixAt(n * 2 + (side < 0 ? 0 : 1), _o.matrix.clone().multiply(_m));
      _m.makeTranslation(side * 0.03, b.mode === 'roost' ? -0.02 : 0.02, 0.081);
      batEye.setMatrixAt(n * 2 + (side < 0 ? 0 : 1), _o.matrix.clone().multiply(_m));
    }
    n++;
  }
  batBody.count = n; batWing.count = n * 2; batEye.count = n * 2;
  for (const m of [batBody, batWing, batEye]) m.instanceMatrix.needsUpdate = true;
  // ---- beetles: wander, turn at walls, run from the party
  let g = 0;
  for (const u of bugs) {
    const dx = u.x - lead.x, dz = u.z - lead.z, d = Math.hypot(dx, dz);
    let sp = u.sp;
    if (d < 1.7) { u.a = Math.atan2(dz, dx) + Math.sin(T * 9 + u.ph) * 0.3; sp = 1.1; }
    else { u.turn -= dt; if (u.turn <= 0) { u.turn = 0.6 + Math.random() * 1.6; u.a += (Math.random() - 0.5) * 2; } }
    const nx = u.x + Math.cos(u.a) * sp * dt, nz = u.z + Math.sin(u.a) * sp * dt;
    if (walk(Math.floor(nx - OX), Math.floor(nz - OZ))) { u.x = nx; u.z = nz; } else u.a += Math.PI * (0.6 + Math.random() * 0.8);
    _o.position.set(u.x, 0.03, u.z); _o.rotation.set(0, -u.a + Math.PI / 2, 0); _o.scale.setScalar(1); _o.updateMatrix();
    bugBody.setMatrixAt(g, _o.matrix);
    const pulse = 0.8 + 0.4 * Math.sin(T * 3 + u.ph);
    _m.makeTranslation(0, 0.02, -0.05).multiply(_m2.makeScale(pulse, 1, pulse));
    bugGlow.setMatrixAt(g, _o.matrix.clone().multiply(_m)); g++;
  }
  bugBody.count = bugGlow.count = g; bugBody.instanceMatrix.needsUpdate = bugGlow.instanceMatrix.needsUpdate = true;
  // ---- drips
  for (const d of drops) {
    if (d.wait > 0) { d.wait -= dt; d.m.visible = false; if (d.wait <= 0) { d.y = 2.4; d.v = 0; } continue; }
    d.v += 9 * dt; d.y -= d.v * dt; d.m.visible = true; d.m.position.set(d.x, d.y, d.z);
    if (d.y <= 0.02) {
      d.wait = 1.5 + Math.random() * 3.5; d.m.visible = false;
      puff(d.x, 0.04, d.z, '#9ac8e0', 3, 0.7, 0.5, 0);
      const r = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, opacity: 0.7 }));
      r.rotation.x = -Math.PI / 2; r.position.set(d.x, 0.02, d.z); r.renderOrder = 60; group.add(r); rings.push({ m: r, t: 0 });
      const dist = Math.hypot(d.x - lead.x, d.z - lead.z);
      if (dist < 7) sfx('tap', 0.6 * (1 - dist / 7));
    }
  }
  for (const r of rings) { r.t += dt; const s = 0.3 + r.t * 1.6; r.m.scale.set(s, s, 1); (r.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.7 - r.t * 1.1); }
  for (let i = rings.length - 1; i >= 0; i--) if (rings[i].t > 0.65) { group.remove(rings[i].m); rings[i].m.geometry.dispose(); rings.splice(i, 1); }
  // ---- lava bubbles
  if (lavaCells.length) {
    bubbleT -= dt;
    if (bubbleT <= 0) {
      bubbleT = 0.3 + Math.random() * 0.6;
      const [x, z] = lavaCells[Math.floor(Math.random() * lavaCells.length)];
      if (walk(x, z) === false) { const w = W(x + 0.3 + Math.random() * 0.4, z + 0.3 + Math.random() * 0.4); puff(w.x, -0.12, w.z, Math.random() < 0.5 ? '#ff9a30' : '#ffcf60', 4, 1.4, 0.5, -0.15); if (near(w.x, w.z, lead, 4)) sfx('bubble', 0.5); }
    }
  }
  // ---- dust floating in the lantern light
  motes.forEach((m, k) => {
    const dx = m.x - lead.x, dz = m.z - lead.z;
    if (Math.hypot(dx, dz) > 3.2 || m.y < 0.1 || m.y > 2.4) { const a = Math.random() * 6.28, r = Math.random() * 2.8; m.x = lead.x + Math.cos(a) * r; m.z = lead.z + Math.sin(a) * r; m.y = 0.3 + Math.random() * 1.8; m.vx = (Math.random() - 0.5) * 0.12; m.vz = (Math.random() - 0.5) * 0.12; m.vy = (Math.random() - 0.4) * 0.08; }
    m.x += (m.vx + Math.sin(T * 0.7 + m.ph) * 0.05) * dt; m.y += m.vy * dt; m.z += m.vz * dt;
    const s = m.s * (0.6 + 0.4 * Math.sin(T * 2 + m.ph));
    _o.position.set(m.x, m.y, m.z); _o.rotation.set(0, 0, 0); _o.scale.setScalar(s); _o.updateMatrix(); dust.setMatrixAt(k, _o.matrix);
  });
  dust.instanceMatrix.needsUpdate = true;
  // ---- darkness (redrawn every other frame)
  darkAcc += dt; if (darkAcc < 0.03) return; darkAcc = 0;
  const x = dark.getContext('2d')!, sx = DK / box.w, sz = DK / box.h;
  x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, DK, DK); x.fillStyle = 'rgba(5,3,2,0.95)'; x.fillRect(0, 0, DK, DK);
  x.globalCompositeOperation = 'destination-out';
  const hole = (wx: number, wz: number, r: number, k = 1) => {
    const px = (wx - box.x0) * sx, pz = (wz + SHIFT - box.z0) * sz, pr = r * sx;
    const gr = x.createRadialGradient(px, pz, pr * 0.15, px, pz, pr);
    for (let i = 0; i <= 8; i++) { const t = i / 8, e = 1 - t * t * (3 - 2 * t); gr.addColorStop(t, `rgba(0,0,0,${(k * e).toFixed(3)})`); }   // smooth edge, no visible rings
    x.fillStyle = gr; x.beginPath(); x.arc(px, pz, pr, 0, Math.PI * 2); x.fill();
  };
  const flick = 1 + Math.sin(T * 9) * 0.03 + Math.sin(T * 23) * 0.02;
  hole(lead.x, lead.z, leadR * flick);
  for (const l of lights) hole(l.x, l.z, l.r, 0.9);
  for (const u of bugs) hole(u.x, u.z, 0.55, 0.5);
  darkTex.needsUpdate = true;
}
/** The floor of the room in world units, for the darkness sheet (tests). */
export const lifeFloor = () => floor;
