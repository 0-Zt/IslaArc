import * as THREE from 'three';
import CAVE from '../data/cave.json';
import { scene, camera, controls, cancelFly, setCaveMode, FR } from '../render/renderer';
import { refreshDay } from '../render/daynight';
import { buildFloor, lavaScroll, GLOW, DIR_ANGLE, CAVE_X, CAVE_Z, type FloorView } from '../world/cavebuild';
import { vbox } from '../assets/voxel';
import { makeFigure, animFigure, setFigureAnim, crew, select, type Crew } from './crew';
import { S, gain, type ResKey, type CaveSave, type CaveFloorSave } from './state';
import { addStars } from './progress';
import { emit, on } from '../core/events';
import { puff } from '../world/particles';
import { sfx, setCaveAmbience } from '../audio/sfx';
import { STORY } from './fishing';
import type { CharId, ToolKey } from '../assets/characters';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT } from '../assets/voxel';

/* The volcano cave, explored like the old handheld adventures: the figures walk in a line,
   one cell at a time, with the arrows (or by tapping the floor) and the A button looks, pushes,
   lights, turns, digs or opens whatever is in front. Three floors, each with its own puzzle:
   braziers to light, guardians to turn towards the altar, a river of lava to fill with boulders.
   Everything solved stays solved (S.cave). */

type Dir = 'N' | 'E' | 'S' | 'W';
const DV: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const CW: Record<string, Dir> = { N: 'E', E: 'S', S: 'W', W: 'N' };
interface FloorDef {
  name: string; intro: string; door: string; map: string[];
  statues?: { x: number; z: number; dir: string; want: string; link?: number[] }[];
  decor: { mushrooms: number[][]; stalagmites: number[][] };
  lore: string; lore2?: string; chest: { gives: Record<string, number>; stars: number };
}
const FLOORS = CAVE.floors as FloorDef[];
const K = (x: number, z: number) => `${x},${z}`;
const cellsOf = (fi: number, c: string) => { const out: [number, number][] = []; FLOORS[fi].map.forEach((row, z) => [...row].forEach((ch, x) => { if (ch === c) out.push([x, z]); })); return out; };

/* stories: the two cave texts and the tablets */
Object.assign(STORY, CAVE.story);
FLOORS.forEach((f, i) => {
  const L = cellsOf(i, 'L');
  L.forEach((_, k) => {
    const text = k === 0 ? f.lore : f.lore2 || f.lore;
    const marea = text.includes('Marea');
    STORY[`cv${i}_${k}`] = { title: marea ? 'El grabado de Marea' : 'Tablilla de los Alfareros', text: text.replace(/ — .*$/, '') };
  });
});

/* ---------- saved state ---------- */
function freshFloor(i: number): CaveFloorSave {
  const f = FLOORS[i];
  return { b: cellsOf(i, 'B'), fill: [], broken: [], lit: [], dirs: Object.fromEntries((f.statues || []).map(s => [K(s.x, s.z), s.dir])), mined: [], opened: [], read: [], door: false };
}
export function caveSave(): CaveSave {
  if (!S.cave) S.cave = { hits: 0, max: -1, f: [], caracola: false, chests: 0 };
  FLOORS.forEach((_, i) => { if (!S.cave!.f[i]) S.cave!.f[i] = freshFloor(i); });
  return S.cave;
}

/* ---------- runtime ---------- */
interface Member { c: Crew; x: number; z: number; fx: number; fz: number }
let active = false, fi = 0, view: FloorView | null = null, map: string[] = [];
let party: Member[] = [];
let facing: Dir = 'N', moving = false, stepT = 0, busyT = 0, onBusy: (() => void) | null = null, bumpT = 0;
let held: Dir | null = null, path: [number, number][] = [], pendingAct: [number, number] | null = null;
let boulderMeshes: (THREE.Group | null)[] = [];
const slabs: THREE.Object3D[] = [];
let gateK = 0, doorK = 0, doorAt = 0, shakeT = 0, plateHint = false, golemFlick = 0, clock = 0, fading = false;
const STEP = 0.21;
const F = () => S.cave!.f[fi];
const ch = (x: number, z: number) => (map[z] && map[z][x]) || '#';
const leader = () => party[0];
export const caveActive = () => active;
export const caveFloor = () => active ? fi : -1;

interface Slide { o: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number; d: number; spin?: number; done?: () => void }
let slides: Slide[] = [];
const local = (x: number, z: number, y = 0) => new THREE.Vector3(x + 0.5, y, z + 0.5);
const world = (x: number, z: number, y = 0) => new THREE.Vector3(CAVE_X + x + 0.5, y, CAVE_Z + z + 0.5);

/* lights: a fixed pool while underground (same count on every floor, so shaders compile once) */
const POOL = 5;
let lights: THREE.PointLight[] = [];
let partyLight: THREE.PointLight | null = null;
interface Slot { pos: THREE.Vector3; color: string; base: number; dist: number; flick: number; on: () => number }
let slots: Slot[] = [];

/* embers: little bright squares rising from the lava (basic material: they glow without light) */
const EMB = 70;
const embers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.3, 0.3) }), EMB);
embers.count = 0; embers.frustumCulled = false;
const emberList: { x: number; y: number; z: number; vy: number; vx: number; life: number; s: number }[] = [];
const _m = new THREE.Matrix4();

/* ---------- UI: arrows, the A button, floor name ---------- */
const $ = (id: string) => document.getElementById(id)!;
function ui() {
  if (document.getElementById('caveUI')) return;
  const d = document.createElement('div'); d.id = 'caveUI'; d.hidden = true;
  d.innerHTML = `<div id="cvPad" aria-label="Flechas">${(['N', 'W', 'E', 'S'] as Dir[]).map(k => `<button data-d="${k}" class="d${k}" aria-label="${{ N: 'Arriba', W: 'Izquierda', E: 'Derecha', S: 'Abajo' }[k]}"><svg viewBox="0 0 16 16" width="22" height="22"><path d="M8 3l5 7H3z" fill="currentColor"/></svg></button>`).join('')}<i></i></div>`
    + '<button id="cvA"><b>A</b><small id="cvAL">Mirar</small></button>'
    + '<div id="cvBar"><span id="cvName"></span><button id="cvReset">Reiniciar sala</button><button id="cvExit">Salir</button></div>'
    + '<div id="cvSign" hidden></div>';
  document.body.appendChild(d);
  const fd = document.createElement('div'); fd.id = 'cvFade'; document.body.appendChild(fd);
  const pad = $('cvPad');
  const release = () => { held = null; pad.querySelectorAll('button').forEach(b => b.classList.remove('on')); };
  pad.addEventListener('pointerdown', e => {
    const b = (e.target as HTMLElement).closest('[data-d]') as HTMLElement | null; if (!b) return;
    e.preventDefault(); held = b.dataset.d as Dir; path = []; pendingAct = null; b.classList.add('on');
    (b as any).setPointerCapture?.(e.pointerId);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(ev, release);
  $('cvA').addEventListener('click', () => caveAct());
  $('cvExit').addEventListener('click', () => exitCave());
  $('cvReset').addEventListener('click', () => resetRoom());
  addEventListener('keydown', e => {
    if (!active) return;
    const m: Record<string, Dir> = { ArrowUp: 'N', ArrowDown: 'S', ArrowLeft: 'W', ArrowRight: 'E', w: 'N', s: 'S', a: 'W', d: 'E' };
    const k = m[e.key]; if (k) { held = k; path = []; pendingAct = null; e.preventDefault(); return; }
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'z' || e.key === 'e') { e.preventDefault(); caveAct(); }
  });
  addEventListener('keyup', e => { const m: Record<string, Dir> = { ArrowUp: 'N', ArrowDown: 'S', ArrowLeft: 'W', ArrowRight: 'E', w: 'N', s: 'S', a: 'W', d: 'E' }; if (m[e.key] === held) held = null; });
}
function sign(text: string) {
  const el = $('cvSign'); el.textContent = text; el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
  clearTimeout((sign as any).t); (sign as any).t = setTimeout(() => { el.hidden = true; }, 3200);
}
function fade(then: () => void, immediate = false) {
  const el = $('cvFade');
  if (immediate) { then(); return; }
  fading = true; el.classList.add('on');
  setTimeout(() => { then(); requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.remove('on'); fading = false; })); }, 280);
}

/* ---------- entering and leaving ---------- */
let before: { target: THREE.Vector3; pos: THREE.Vector3; zoom: number } | null = null;
let exitTo: (() => THREE.Vector3 | null) = () => null;
/** Where the camera goes back to on the island (the cave mouth sets this). */
export function setExitPoint(f: () => THREE.Vector3 | null) { exitTo = f; }

export function enterCave(immediate = false) {
  if (active) return;
  ui(); caveSave();
  fade(() => {
    active = true; cancelFly(); select(null);
    before = { target: controls.target.clone(), pos: camera.position.clone(), zoom: camera.zoom };
    controls.enabled = false;
    setCaveMode(true); setCaveAmbience(true);
    document.body.classList.add('incave');
    $('caveUI').hidden = false; $('bottom').hidden = true;
    for (let k = 0; k < POOL; k++) { const l = new THREE.PointLight('#ffb070', 0, 6, 1.6); scene.add(l); lights.push(l); }
    partyLight = new THREE.PointLight('#ffd8a0', 5, 7.5, 1.4); scene.add(partyLight);
    scene.add(embers);
    const ids: CharId[] = ['arci', ...(['musgo', 'brasa'] as CharId[]).filter(id => crew.some(c => c.id === id))];
    party = ids.map(id => { const c = makeFigure(id); c.lamp = 0.6; c.ring.visible = false; scene.add(c.root); return { c, x: 0, z: 0, fx: 0, fz: 0 }; });
    loadFloor(0, 'down');
    if (!S.flags.cuevaEntro) { S.flags.cuevaEntro = true; emit('changed'); }
    emit('caveMode', true); emit('caveChanged');
  }, immediate);
}
export function exitCave(immediate = false) {
  if (!active) return;
  fade(() => {
    unloadFloor();
    for (const m of party) scene.remove(m.c.root);
    party = [];
    for (const l of lights) scene.remove(l); lights = [];
    if (partyLight) scene.remove(partyLight); partyLight = null;
    scene.remove(embers); emberList.length = 0;
    active = false; held = null; path = []; pendingAct = null; moving = false; busyT = 0;
    setCaveMode(false); setCaveAmbience(false); refreshDay();
    document.body.classList.remove('incave');
    $('caveUI').hidden = true; $('bottom').hidden = false;
    controls.enabled = true;
    const p = exitTo();
    if (before) {
      const off = before.pos.clone().sub(before.target);
      const t = p || before.target;
      controls.target.copy(t); camera.position.copy(t).add(off); camera.zoom = Math.max(before.zoom, 1.1); camera.updateProjectionMatrix();
    }
    if (S.cave?.caracola && !S.flags.caracolaIsla) { S.flags.caracolaIsla = true; emit('toast', 'Vuelves a la luz con la caracola grande. Pesa, y está tibia.'); }
    emit('changed'); emit('caveMode', false); emit('caveChanged');
  }, immediate);
}

function unloadFloor() {
  if (!view) return;
  scene.remove(view.root);
  view.root.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
  view = null; slides = []; slabs.length = 0; boulderMeshes = [];
}
function loadFloor(n: number, how: 'down' | 'up' | 'reset') {
  unloadFloor();
  fi = n; map = FLOORS[n].map;
  const st = F();
  view = buildFloor(map, st.dirs, FLOORS[n].decor);
  scene.add(view.root);
  // boulders where they were left; the ones that fell became floor
  const orig = cellsOf(n, 'B');
  boulderMeshes = orig.map(([x, z], k) => {
    const m = view!.boulders.get(K(x, z))!; const p = st.b[k];
    if (!p) { m.visible = false; return null; }
    m.position.copy(local(p[0], p[1])); return m;
  });
  for (const k of st.fill) { const [x, z] = k.split(',').map(Number); addSlab(x, z); }
  for (const k of st.broken) view.rubble.get(k)?.removeFromParent();
  for (const k of st.mined) mineVisual(k);
  for (const k of st.opened) { const c = view.chests.get(k); if (c) c.lid.rotation.x = -1.9; }
  if (S.cave!.caracola && view.shell) view.shell.visible = false;
  for (const [k, s] of view.statues) s.g.rotation.y = DIR_ANGLE[st.dirs[k] || 'S'];
  gateK = plateDown() ? 1 : 0; doorK = st.door ? 1 : 0; doorAt = 0;
  // party position
  let at: [number, number];
  if (how === 'up') { const g = cellsOf(n, '>')[0]; at = [g[0], g[1] + 1]; facing = 'S'; }
  else { at = cellsOf(n, 'S')[0]; facing = 'N'; }
  for (const m of party) { m.x = m.fx = at[0]; m.z = m.fz = at[1]; m.c.root.position.copy(world(at[0], at[1])); m.c.dir = Math.atan2(DV[facing][0], DV[facing][1]); m.c.root.rotation.y = m.c.dir; setFigureAnim(m.c, 'idle'); }
  moving = false; path = []; pendingAct = null; busyT = 0;
  if (n > S.cave!.max) { S.cave!.max = n; emit('changed'); }
  setupLights();
  const p = world(at[0], at[1]);
  controls.target.copy(p); camera.zoom = caveZoom(); camera.updateProjectionMatrix(); camera.position.copy(p).add(OFF);
  $('cvName').textContent = `${n + 1}. ${FLOORS[n].name}`;
  if (how !== 'reset') { sign(FLOORS[n].name); if (!S.flags[`cvIntro${n}`]) { S.flags[`cvIntro${n}`] = true; setTimeout(() => emit('toast', FLOORS[n].intro), 900); } }
}
const OFF = new THREE.Vector3(0, 16, 8.4);   // high and from the south, like the handheld games
function caveZoom() { const a = innerWidth / innerHeight; return Math.max(0.8, Math.min(2.6, 2 * FR * a / (a < 1 ? 9.5 : 14))); }
addEventListener('resize', () => { if (active) { camera.zoom = caveZoom(); camera.updateProjectionMatrix(); } });

function goFloor(n: number, how: 'down' | 'up') {
  fade(() => { loadFloor(n, how); emit('caveChanged'); });
}
function resetRoom() {
  if (!active || fading) return;
  const st = F(), fresh = freshFloor(fi);
  st.b = fresh.b; st.fill = [];
  fade(() => { loadFloor(fi, 'reset'); emit('toast', 'Las rocas vuelven a su lugar'); emit('caveChanged'); });
}

/* ---------- lights of the floor ---------- */
function setupLights() {
  const st = F(); slots = [];
  for (const [x, z] of cellsOf(fi, 't')) slots.push({ pos: world(x, z, 1.3), color: '#ff9a40', base: 7, dist: 7, flick: 1, on: () => st.lit.includes(K(x, z)) ? 1 : 0 });
  for (const [x, z] of cellsOf(fi, 'Q')) slots.push({ pos: world(x, z, 1.4), color: '#ffc8d8', base: 4, dist: 5, flick: 0.1, on: () => S.cave!.caracola ? 0 : 1 });
  for (const [x, z] of cellsOf(fi, 'A')) slots.push({ pos: world(x, z, 1.2), color: '#ffd890', base: 5, dist: 6, flick: 0.15, on: () => st.door ? 1 : 0.15 });
  // lava: a few lights spread along the river
  const lava = cellsOf(fi, '~');
  if (lava.length) {
    const rows = [...new Set(lava.map(p => p[1]))];
    const groups: [number, number][][] = [];
    for (let r = 0; r < rows.length; r++) { if (r > 0 && rows[r] === rows[r - 1] + 1) groups[groups.length - 1].push(...lava.filter(p => p[1] === rows[r])); else groups.push(lava.filter(p => p[1] === rows[r])); }
    for (const g of groups) {
      const xs = g.map(p => p[0]), zs = g.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), zc = (Math.min(...zs) + Math.max(...zs)) / 2;
      const n = g.length > 14 ? 2 : 1;
      for (let k = 0; k < n; k++) { const x = x0 + (x1 - x0) * (n === 1 ? 0.5 : k === 0 ? 0.25 : 0.75); slots.push({ pos: world(x, zc, 0.9), color: '#ff6a20', base: 8, dist: 6.5, flick: 0.5, on: () => 1 }); }
    }
  }
  for (const [x, z] of cellsOf(fi, 'C')) slots.push({ pos: world(x, z, 0.9), color: '#70d8ff', base: 3.5, dist: 4.5, flick: 0.1, on: () => st.mined.includes(K(x, z)) ? 0.15 : 1 });
  for (const [x, z] of cellsOf(fi, 'S')) slots.push({ pos: world(x, z, 2.2), color: '#fff0d0', base: 3, dist: 5, flick: 0, on: () => 1 });
  slots = slots.slice(0, POOL);
  lights.forEach((l, k) => { const s = slots[k]; if (!s) { l.intensity = 0; return; } l.position.copy(s.pos); l.color.set(s.color); l.distance = s.dist; });
}

/* ---------- rules ---------- */
const boulderAt = (x: number, z: number) => F().b.findIndex(p => !!p && p[0] === x && p[1] === z);
function plateDown() {
  const plates = cellsOf(fi, 'P'); if (!plates.length) return false;
  const L = leader();
  return plates.every(([x, z]) => boulderAt(x, z) >= 0 || (!!L && L.x === x && L.z === z));
}
/** Can nobody stand here right now? (boulders count) */
function solid(x: number, z: number) {
  if (boulderAt(x, z) >= 0) return true;
  const c = ch(x, z), st = F(), k = K(x, z);
  switch (c) {
    case '.': case ',': case 'S': case '>': case 'P': case 'B': return false;   // under a boulder there is floor
    case 'R': return !st.broken.includes(k);
    case 'O': case '~': return !st.fill.includes(k);
    case 'D': return !(st.door && doorK > 0.7);
    case 'G': return gateK < 0.7;
    default: return true;
  }
}

function tryStep(d: Dir): boolean {
  const L = leader(); facing = d; L.c.dir = Math.atan2(DV[d][0], DV[d][1]);
  const [dx, dz] = DV[d], nx = L.x + dx, nz = L.z + dz;
  const bi = boulderAt(nx, nz);
  if (bi >= 0) { if (!push(bi, dx, dz)) { bump(); return false; } }
  else if (solid(nx, nz)) { bump(); return false; }
  for (let k = party.length - 1; k >= 1; k--) { const m = party[k], f = party[k - 1]; m.fx = m.x; m.fz = m.z; m.x = f.x; m.z = f.z; }
  L.fx = L.x; L.fz = L.z; L.x = nx; L.z = nz;
  for (const m of party) if (m.x !== m.fx || m.z !== m.fz) { m.c.dir = Math.atan2(m.x - m.fx, m.z - m.fz); setFigureAnim(m.c, 'walk'); }
  moving = true; stepT = 0;
  return true;
}
function bump() { if (bumpT > 0) return; bumpT = 0.35; sfx('tap', 0.25); }

function push(bi: number, dx: number, dz: number) {
  const st = F(), [bx, bz] = st.b[bi]!, tx = bx + dx, tz = bz + dz, c = ch(tx, tz), k = K(tx, tz);
  if (boulderAt(tx, tz) >= 0 || c === 'S' || c === '>') return false;
  const hole = (c === 'O' || c === '~') && !st.fill.includes(k);
  if (!hole && solid(tx, tz)) return false;
  if (party.slice(1).some(m => m.x === tx && m.z === tz)) return false;
  const mesh = boulderMeshes[bi]!;
  st.b[bi] = hole ? null : [tx, tz];
  if (hole) { st.fill.push(k); boulderMeshes[bi] = null; }
  const from = mesh.position.clone(), to = local(tx, tz);
  sfx('dig', 0.9);
  const w = world(bx, bz); puff(w.x - dx * 0.4, 0.1, w.z - dz * 0.4, '#8a7a6a', 6, 0.9, 0.9, 0);
  slides.push({ o: mesh, from, to, t: 0, d: STEP * 1.05, spin: dx ? -dx : dz, done: hole ? () => fall(mesh, tx, tz, c) : undefined });
  emit('caveChanged');
  return true;
}
function fall(mesh: THREE.Group, x: number, z: number, c: string) {
  const w = world(x, z);
  if (c === '~') {
    sfx('fire'); sfx('splash', 0.6);
    puff(w.x, 0.1, w.z, '#e8e0d8', 14, 2.2, 1.2, 0); puff(w.x, 0.1, w.z, '#ffb040', 8, 2.6, 1.4, 0);
    for (let k = 0; k < 10; k++) spawnEmber(w.x + (Math.random() - 0.5) * 0.8, w.z + (Math.random() - 0.5) * 0.8, 1.6);
  } else { sfx('fall', 0.8); puff(w.x, 0.1, w.z, '#6a5c50', 12, 1.6, 1.4, 0); }
  slides.push({ o: mesh, from: mesh.position.clone(), to: mesh.position.clone().setY(-0.75), t: 0, d: 0.32, done: () => { mesh.visible = false; addSlab(x, z); shakeT = 0.25; } });
}
/** The floor a boulder leaves when it fills a pit (a stone lid) or the lava (cooled black rock). */
function addSlab(x: number, z: number) {
  if (!view) return;
  const c = ch(x, z), g = new THREE.Group(); g.position.copy(local(x, z));
  const parts: THREE.BufferGeometry[] = [];
  if (c === '~') {
    vbox(parts, 0, -0.14, 0, 1, 0.3, 1, '#2c2420'); vbox(parts, 0.15, 0.015, -0.1, 0.5, 0.03, 0.44, '#3a302a'); vbox(parts, -0.25, 0.015, 0.22, 0.36, 0.03, 0.3, '#342a24');
    const m = new THREE.Mesh(mergeGeometries(parts), MAT.stone); m.receiveShadow = true; g.add(m);
    for (const [a, b, w, d] of [[-0.1, 0.05, 0.5, 0.03], [0.2, -0.25, 0.03, 0.34], [-0.3, -0.2, 0.25, 0.03]]) { const cr = new THREE.Mesh(new THREE.BoxGeometry(w, 0.01, d), GLOW.runeOn); cr.position.set(a, 0.012, b); g.add(cr); }
    view.lava.get(K(x, z))?.removeFromParent();
  } else {
    vbox(parts, 0, -0.13, 0, 0.92, 0.3, 0.92, '#6e6056'); vbox(parts, 0.1, 0.02, 0.05, 0.5, 0.04, 0.5, '#7a6a5c');
    const m = new THREE.Mesh(mergeGeometries(parts), MAT.stone); m.receiveShadow = true; g.add(m);
  }
  view.root.add(g); slabs.push(g);
}

/* ---------- the A button ---------- */
function front(): [number, number] { const L = leader(), [dx, dz] = DV[facing]; return [L.x + dx, L.z + dz]; }
function actionLabel(): string {
  if (!active || !party.length) return '';
  const [x, z] = front(), k = K(x, z), st = F(), c = ch(x, z);
  if (boulderAt(x, z) >= 0) return 'Empujar';
  switch (c) {
    case 't': return st.lit.includes(k) ? 'Mirar' : 'Encender';
    case 's': return 'Girar';
    case 'R': return st.broken.includes(k) ? '' : 'Romper';
    case 'C': case 'M': return st.mined.includes(k) ? 'Mirar' : 'Picar';
    case 'K': return st.opened.includes(k) ? 'Mirar' : 'Abrir';
    case 'L': return 'Leer';
    case 'Q': return S.cave!.caracola ? 'Mirar' : 'Tomar';
    case 'D': case 'G': case 'A': case 'g': case '*': return 'Mirar';
  }
  return '';
}
function work(seconds: number, tool: ToolKey | '', done: () => void) {
  const c = leader().c; c.toolKey = tool as ToolKey; setFigureAnim(c, 'work'); busyT = seconds; onBusy = done;
}
const say = (t: string) => emit('toast', t);
const lead = () => leader().c.def.name;

export function caveAct() {
  if (!active || moving || busyT > 0 || fading || !party.length) return;
  const [x, z] = front(), k = K(x, z), st = F(), c = ch(x, z), w = world(x, z);
  if (boulderAt(x, z) >= 0) { tryStep(facing); return; }
  switch (c) {
    case 't': {
      if (st.lit.includes(k)) { say('El brasero arde y calienta la piedra.'); return; }
      work(0.7, '', () => {
        st.lit.push(k); sfx('fire'); puff(w.x, 0.8, w.z, '#ffb040', 10, 1.8, 0.8, 0);
        const br = cellsOf(fi, 't'), n = br.filter(p => st.lit.includes(K(...p))).length;
        say(party.some(m => m.c.id === 'brasa') ? `Brasa sopla una chispa: el brasero se enciende (${n}/${br.length})` : `${lead()} enciende el brasero con la linterna (${n}/${br.length})`);
        checkDoor(); emit('changed'); emit('caveChanged');
      });
      return;
    }
    case 's': {
      // a guardian turns clockwise; some hold hands with the one in front, and that one turns too
      const def = FLOORS[fi].statues?.find(q => K(q.x, q.z) === k);
      const turn = [k, ...(def?.link ? [K(def.link[0], def.link[1])] : [])];
      work(0.55, '', () => {
        sfx('hammer', 0.8); puff(w.x, 0.15, w.z, '#8a7a6a', 8, 0.8, 1.2, 0);
        let right = 0;
        for (const q of turn) {
          const s = view!.statues.get(q); if (!s) continue;
          const next = CW[st.dirs[q] || 'S']; st.dirs[q] = next;
          const from = s.g.rotation.y; let to = DIR_ANGLE[next]; while (to > from + 0.01) to -= Math.PI * 2;   // always clockwise (seen from above)
          slides.push({ o: s.g, from: new THREE.Vector3(from, 0, 0), to: new THREE.Vector3(to, 0, 0), t: 0, d: 0.45, spin: -99 });
          if (FLOORS[fi].statues?.find(z2 => K(z2.x, z2.z) === q)?.want === next) right++;
          if (q !== k) { const [a, b] = q.split(',').map(Number), w2 = world(a, b); puff(w2.x, 0.15, w2.z, '#8a7a6a', 8, 0.8, 1.2, 0); if (!S.flags.cvLink) { S.flags.cvLink = true; say('¡La guardiana del frente giró también! Están unidas.'); } }
        }
        if (right) sfx('coin', 0.5);
        checkDoor(); emit('changed'); emit('caveChanged');
      });
      return;
    }
    case 'R': {
      if (st.broken.includes(k)) return;
      if (!S.tools.pico) { say('Escombros duros: hace falta el pico de metal'); return; }
      sfx('pick');
      work(1.2, 'pickM', () => {
        sfx('fall', 0.6); st.broken.push(k); view!.rubble.get(k)?.removeFromParent();
        puff(w.x, 0.3, w.z, '#8a7a6a', 16, 2, 1.6, 0); shakeT = 0.2; emit('caveChanged');
      });
      return;
    }
    case 'C': case 'M': {
      if (st.mined.includes(k)) { say(c === 'C' ? 'Solo quedan astillas apagadas.' : 'La veta ya está vacía.'); return; }
      sfx('pick');
      work(1.4, 'pickM', () => {
        sfx('pick'); st.mined.push(k); mineVisual(k);
        S.stats.cueva = (S.stats.cueva || 0) + 1;
        const at = leader().c.root.position.clone().setY(1.2);
        if (c === 'C') { gain('cuarzo', 2, at); puff(w.x, 0.5, w.z, '#8fe8ff', 12, 1.8, 1, 0); say('Cristales de cuarzo: brillan solos, incluso en la oscuridad'); }
        else { gain('cobre', 2, at); gain('mineral', 2, at.clone().setY(1.5)); puff(w.x, 0.5, w.z, '#e09050', 12, 1.8, 1, 0); }
        emit('caveChanged');
      });
      return;
    }
    case 'K': {
      if (st.opened.includes(k)) { say('El cofre está vacío.'); return; }
      work(0.6, '', () => {
        st.opened.push(k); sfx('coin'); const ch2 = view!.chests.get(k)!;
        slides.push({ o: ch2.lid, from: new THREE.Vector3(0, 0, 0), to: new THREE.Vector3(-1.9, 0, 0), t: 0, d: 0.5, spin: -98 });
        const gv = FLOORS[fi].chest, at = w.clone().setY(1);
        Object.entries(gv.gives).forEach(([r, n], i) => gain(r as ResKey, n, at.clone().setY(1 + i * 0.35)));
        puff(w.x, 0.5, w.z, '#f2c14e', 14, 2.2, 1, 0);
        S.cave!.chests++; S.stats.cueva = (S.stats.cueva || 0) + 1;
        addStars(gv.stars, 'Cofre de los Alfareros');
        emit('changed'); emit('caveChanged');
      });
      return;
    }
    case 'L': {
      const idx = cellsOf(fi, 'L').findIndex(p => p[0] === x && p[1] === z);
      if (!st.read.includes(k)) { st.read.push(k); emit('caveChanged'); }
      emit('story', `cv${fi}_${idx}`);
      return;
    }
    case 'Q': {
      if (S.cave!.caracola) { say('El pedestal está vacío. Todavía se siente tibio.'); return; }
      work(0.8, '', () => {
        S.cave!.caracola = true; sfx('level');
        const sh = view!.shell!; slides.push({ o: sh, from: sh.position.clone(), to: sh.position.clone().setY(2.4), t: 0, d: 0.9, done: () => { sh.visible = false; } });
        puff(w.x, 1, w.z, '#ffe0f0', 20, 2.2, 1.2, 0);
        golemFlick = 1.4; shakeT = 0.5;
        for (const m of party) m.c.cheer = 1.6;
        setTimeout(() => emit('story', 'caracola'), 1300);
        emit('changed'); emit('caveChanged');
      });
      return;
    }
    case 'D': say(st.door ? 'La puerta de runas está abierta.' : fi === 0 ? 'Una puerta de piedra con runas. Dos de ellas parecen llamas.' : 'Las runas dicen: «Cuando las cuatro miren al centro, se abrirá el paso».'); return;
    case 'G': say(gateK > 0.7 ? 'La reja está arriba.' : 'Una reja de hierro viejo. En el suelo hay una placa con la misma runa.'); return;
    case 'A': say(st.door ? 'El orbe del altar brilla: las cuatro guardianas lo miran.' : 'Un altar con un orbe apagado. Ninguna de las guardianas lo mira.'); return;
    case 'g': say(S.cave!.caracola ? 'El gólem no se mueve… pero ahora sus ojos parecen seguirte.' : 'Un gólem de arcilla oscura, enorme, dormido sobre las rodillas. El calor le late en las grietas.'); return;
    case '*': say('Una estalagmita. Gotea.'); return;
  }
}
function mineVisual(k: string) {
  const c = view?.crystals.get(k);
  if (c) { (c as any).shards.children.forEach((m: THREE.Mesh) => { m.material = GLOW.crystalDim; m.scale.y = 0.35; m.position.y *= 0.4; }); (c as any).decal.visible = false; }
  const v = view?.veins.get(k);
  if (v) v.children.forEach(m => { const mm = m as THREE.Mesh; if (mm.isMesh) mm.scale.y = 0.85; });
}
function checkDoor() {
  const f = FLOORS[fi], st = F();
  if (st.door || !f.door) return;
  const ok = f.door === 'braseros' ? cellsOf(fi, 't').every(p => st.lit.includes(K(...p)))
    : (f.statues || []).every(s => st.dirs[K(s.x, s.z)] === s.want);
  if (!ok) return;
  st.door = true; doorAt = 0.9;
  setTimeout(() => { sfx('solve'); say(fi === 0 ? 'Las runas se encienden y la puerta de piedra se hunde en el suelo' : 'Las cuatro guardianas miran el altar. El orbe se enciende y la puerta se abre'); }, 500);
}

/* ---------- taps on the cave ---------- */
export function caveTap(ray: THREE.Raycaster) {
  if (!active || !view || fading) return;
  const hits = ray.intersectObject(view.root, true).filter(h => (h.object as THREE.Mesh).isMesh && ((h.object as THREE.Mesh).material as THREE.Material).blending !== THREE.AdditiveBlending);
  let x: number, z: number;
  if (hits.length) {
    const h = hits[0], n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    const p = h.point.clone().addScaledVector(n, -0.05);
    x = Math.floor(p.x - CAVE_X); z = Math.floor(p.z - CAVE_Z);
  } else {
    const t = -ray.ray.origin.y / ray.ray.direction.y; if (!(t > 0)) return;
    const p = ray.ray.at(t, new THREE.Vector3()); x = Math.floor(p.x - CAVE_X); z = Math.floor(p.z - CAVE_Z);
  }
  tapCell(x, z);
}
export function tapCell(x: number, z: number) {
  if (!active || fading || busyT > 0) return;
  const L = leader(); if (L.x === x && L.z === z) return;
  held = null; pendingAct = null;
  const adj = Math.abs(L.x - x) + Math.abs(L.z - z) === 1;
  const interest = boulderAt(x, z) >= 0 || 'tsRCMKLQDGAg*'.includes(ch(x, z)) && solid(x, z);
  if (adj && interest && !moving) {
    const d = (Object.keys(DV) as Dir[]).find(q => L.x + DV[q][0] === x && L.z + DV[q][1] === z)!;
    facing = d; L.c.dir = Math.atan2(DV[d][0], DV[d][1]); caveAct(); return;
  }
  if (!interest && !solid(x, z)) { path = route(x, z, true) || []; return; }
  if (!interest) return;
  // walk next to it, turn to it, and use it (boulders only get faced)
  let best: [number, number][] | null = null;
  for (const d of Object.values(DV)) {
    const ax = x - d[0], az = z - d[1]; if (solid(ax, az)) continue;
    const r = route(ax, az, false); if (r && (!best || r.length < best.length)) best = r;
  }
  if (!best) { say('No hay camino hasta ahí'); return; }
  path = best; pendingAct = [x, z];
  if (boulderAt(x, z) >= 0) (pendingAct as any).faceOnly = true;
}
/** Breadth-first route over free cells; stairs only as the destination (so walking never changes floor by accident). */
function route(tx: number, tz: number, stairsOk: boolean): [number, number][] | null {
  const L = leader(), start = K(L.x, L.z), prev = new Map<string, string | null>([[start, null]]), q: [number, number][] = [[L.x, L.z]];
  while (q.length) {
    const [x, z] = q.shift()!;
    if (x === tx && z === tz) { const out: [number, number][] = []; let k: string | null = K(x, z); while (k && k !== start) { const [a, b] = k.split(',').map(Number); out.unshift([a, b]); k = prev.get(k)!; } return out; }
    for (const [dx, dz] of Object.values(DV)) {
      const nx = x + dx, nz = z + dz, nk = K(nx, nz);
      if (prev.has(nk) || solid(nx, nz)) continue;
      const c = ch(nx, nz); if ((c === 'S' || c === '>') && !(stairsOk && nx === tx && nz === tz)) continue;
      prev.set(nk, K(x, z)); q.push([nx, nz]);
    }
  }
  return null;
}

/* ---------- arriving on a cell ---------- */
function arrived() {
  const L = leader(), c = ch(L.x, L.z);
  if (fi === 2 && L.z <= 4 && !S.flags.lavaCruzada) { S.flags.lavaCruzada = true; say('¡Cruzaste el río de lava!'); sfx('solve'); emit('changed'); }
  if (c === 'P' && !plateHint && boulderAt(L.x, L.z) < 0) { plateHint = true; say('Clic… la reja se levanta. Pero baja apenas te alejas: algo pesado tendría que quedarse encima.'); }
  if (c === '>') { path = []; held = null; goFloor(fi + 1, 'down'); return; }
  if (c === 'S') { path = []; held = null; if (fi === 0) exitCave(); else goFloor(fi - 1, 'up'); return; }
}

/* ---------- every frame ---------- */
function spawnEmber(x: number, z: number, up = 1) {
  if (emberList.length >= EMB) return;
  emberList.push({ x, y: 0, z, vy: (0.5 + Math.random() * 0.7) * up, vx: (Math.random() - 0.5) * 0.25, life: 1.2 + Math.random() * 1.4, s: 0.04 + Math.random() * 0.04 });
}
let emberAcc = 0, lastLabel = '';
export function tickCave(dt: number, T: number) {
  if (!active || !view || !party.length) return;
  clock += dt; bumpT -= dt;
  const st = F(), L = leader();
  // walking
  if (moving) {
    stepT += dt;
    const k = Math.min(1, stepT / STEP);
    for (const m of party) m.c.root.position.copy(world(m.fx, m.fz)).lerp(world(m.x, m.z), k);
    if (k >= 1) { moving = false; for (const m of party) { m.fx = m.x; m.fz = m.z; } arrived(); }
  }
  if (busyT > 0) { busyT -= dt; if (busyT <= 0) { setFigureAnim(L.c, 'idle'); const f = onBusy; onBusy = null; f?.(); } }
  if (active && !moving && busyT <= 0 && !fading) {
    if (held) { path = []; tryStep(held); }
    else if (path.length) {
      const [nx, nz] = path[0], d = (Object.keys(DV) as Dir[]).find(q => L.x + DV[q][0] === nx && L.z + DV[q][1] === nz);
      if (!d || !tryStep(d)) { path = []; pendingAct = null; } else path.shift();
    } else if (pendingAct) {
      const [x, z] = pendingAct, faceOnly = (pendingAct as any).faceOnly; pendingAct = null;
      const d = (Object.keys(DV) as Dir[]).find(q => L.x + DV[q][0] === x && L.z + DV[q][1] === z);
      if (d) { facing = d; L.c.dir = Math.atan2(DV[d][0], DV[d][1]); if (!faceOnly) caveAct(); }
    }
    if (!moving && busyT <= 0) for (const m of party) if (m.c.anim === 'walk') setFigureAnim(m.c, 'idle');
  }
  if (!active || !view) return;
  for (const m of party) animFigure(m.c, dt, T);
  // slides (boulders, statues turning, chest lids, the shell)
  for (const s of slides) {
    s.t = Math.min(1, s.t + dt / s.d); const e = s.t * s.t * (3 - 2 * s.t);
    if (s.spin === -99) s.o.rotation.y = s.from.x + (s.to.x - s.from.x) * e;
    else if (s.spin === -98) s.o.rotation.x = s.from.x + (s.to.x - s.from.x) * e;
    else { s.o.position.lerpVectors(s.from, s.to, e); if (s.spin) s.o.rotation.z = Math.sin(s.t * Math.PI) * 0.12 * s.spin; }
    if (s.t >= 1) s.done?.();
  }
  slides = slides.filter(s => s.t < 1);
  // gate and door
  const plate = plateDown();
  gateK += ((plate ? 1 : 0) - gateK) * Math.min(1, dt * 5);
  for (const g of view.gates.values()) g.position.y = -1.45 * gateK;
  for (const p of view.plates.values()) { const pressed = plate; p.position.y = pressed ? 0.0 : 0.04; ((p as any).group.rune.material as THREE.MeshBasicMaterial).color.copy(pressed ? GLOW.runeOn.color : GLOW.rune.color); }
  if (doorAt > 0) { doorAt -= dt; if (doorAt <= 0) shakeT = 0.6; }
  const opening = st.door && doorAt <= 0;
  doorK += ((opening ? 1 : 0) - doorK) * Math.min(1, dt * (opening ? 1.6 : 6));
  const runeK = st.door ? 1 : FLOORS[fi].door === 'braseros' ? st.lit.length / Math.max(1, cellsOf(fi, 't').length) * 0.6 : (FLOORS[fi].statues || []).filter(s => st.dirs[K(s.x, s.z)] === s.want).length / 4 * 0.6;
  for (const d of view.doors.values()) {
    d.position.y = -1.85 * doorK; d.position.x = doorK > 0.02 && doorK < 0.98 ? Math.sin(clock * 60) * 0.02 : 0;
    ((d as any).rune.material as THREE.MeshBasicMaterial).color.copy(GLOW.rune.color).lerp(GLOW.runeOn.color, runeK * (0.85 + 0.15 * Math.sin(clock * 4)));
    if (doorK > 0.02 && doorK < 0.95 && Math.random() < 0.3) { const w = d.getWorldPosition(new THREE.Vector3()); puff(w.x + (Math.random() - 0.5) * 0.9, 0.05, w.z + 0.3, '#8a7a6a', 2, 0.8, 0.6, 0); }
  }
  // braziers
  for (const [k, b] of view.braziers) {
    const on = st.lit.includes(k); b.flame.visible = on; b.decal.visible = on;
    if (on) { const f = 1 + Math.sin(clock * 17 + b.pos.x) * 0.1 + Math.sin(clock * 7.3) * 0.08; b.flame.scale.set(2 - f, f, 2 - f); (b.decal.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.1 * f; if (Math.random() < dt * 4) spawnEmber(b.pos.x, b.pos.z, 1.3); }
  }
  // statues look with glowing eyes when they face the altar
  for (const s of FLOORS[fi].statues || []) { const v = view.statues.get(K(s.x, s.z)); if (v) for (const e of v.eyes) e.material = st.dirs[K(s.x, s.z)] === s.want ? GLOW.eyeOn : GLOW.eye; }
  if (view.altar) { view.altar.orb.material = st.door ? GLOW.orbOn : GLOW.orb; view.altar.orb.position.y = 0.65 + (st.door ? 0.12 + Math.sin(clock * 2) * 0.05 : 0); view.altar.orb.rotation.y += dt * (st.door ? 1.2 : 0.2); }
  if (view.shell && view.shell.visible && !S.cave!.caracola) { view.shell.position.y = 0.72 + Math.sin(clock * 1.6) * 0.04; view.shell.rotation.y = Math.sin(clock * 0.7) * 0.3; }
  if (view.golem) { golemFlick -= dt; const on = golemFlick > 0 && Math.sin(clock * 22) > -0.2; for (const e of view.golem.eyes) e.material = on ? GLOW.eyeOn : GLOW.eye; view.golem.g.scale.y = 1.25 * (1 + Math.sin(clock * 0.9) * 0.012); }
  for (const c of view.crystals.values()) { const d = (c as any).decal as THREE.Mesh; if (d.visible) (d.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.2 * Math.sin(clock * 1.7 + c.position.x); }
  // lava and embers
  lavaScroll(dt);
  emberAcc += dt * view.embers.length * 0.35;
  while (emberAcc > 1) { emberAcc--; const e = view.embers[Math.floor(Math.random() * view.embers.length)]; if (e && !st.fill.includes(K(Math.floor(e.x - CAVE_X), Math.floor(e.z - CAVE_Z)))) spawnEmber(e.x + (Math.random() - 0.5) * 0.8, e.z + (Math.random() - 0.5) * 0.8); }
  for (const p of emberList) { p.life -= dt; p.y += p.vy * dt; p.x += p.vx * dt + Math.sin(clock * 3 + p.s * 99) * dt * 0.1; }
  for (let i = emberList.length - 1; i >= 0; i--) if (emberList[i].life <= 0) emberList.splice(i, 1);
  emberList.forEach((p, k) => { const s = p.s * Math.min(1, p.life * 2); _m.makeScale(s, s, s).setPosition(p.x, p.y, p.z); embers.setMatrixAt(k, _m); });
  embers.count = emberList.length; embers.instanceMatrix.needsUpdate = true;
  // lights
  lights.forEach((l, k) => { const s = slots[k]; if (!s) return; const f = 1 + (Math.sin(clock * 13 + k * 2) * 0.12 + Math.sin(clock * 5.1 + k) * 0.1) * s.flick; l.intensity = s.base * s.on() * f; });
  if (partyLight) { const p = L.c.root.position; partyLight.position.set(p.x, 1.7, p.z + 0.4); partyLight.intensity = 5.5 * (1 + Math.sin(clock * 9) * 0.04); }
  // camera follows the leader
  const tgt = L.c.root.position.clone().setY(0.4); tgt.z += 0.9;   // the controls cover the bottom of the screen: keep the party a little above the middle
  controls.target.lerp(tgt, 1 - Math.exp(-dt * 7));
  camera.position.copy(controls.target).add(OFF);
  if (shakeT > 0) { shakeT -= dt; camera.position.x += (Math.random() - 0.5) * 0.12 * shakeT * 3; camera.position.y += (Math.random() - 0.5) * 0.08 * shakeT * 3; }
  // the A button says what it would do
  const lab = actionLabel();
  if (lab !== lastLabel) { lastLabel = lab; $('cvAL').textContent = lab || '—'; $('cvA').classList.toggle('dim', !lab); }
}

/** Something to point at, for the bouncing arrow (only the way forward, never the puzzles). */
export function caveHint(goal: string): THREE.Vector3 | null {
  if (!active || !view) return null;
  const st = F();
  const over = (p: [number, number] | undefined, y = 1.4) => p ? world(p[0], p[1], y) : null;
  if (goal === 'cvBraseros' && fi === 0) {
    if (!st.broken.length) return over(cellsOf(0, 'R')[0], 1);
    return over(cellsOf(0, 't').find(p => !st.lit.includes(K(...p))));
  }
  if ((goal === 'cvSalon' && fi === 0 && st.door) || (goal === 'cvRio' && fi === 1 && st.door)) return over(cellsOf(fi, '>')[0], 0.9);
  if ((goal === 'cvSalon' || goal === 'cvEstatuas') && fi === 0 && S.cave!.f[0].door) return over(cellsOf(0, '>')[0], 0.9);
  if ((goal === 'cvRio' || goal === 'cvCruzar') && fi === 1 && st.door) return over(cellsOf(1, '>')[0], 0.9);
  if (goal === 'cvCaracola' && fi === 2 && S.flags.lavaCruzada) return over(cellsOf(2, 'Q')[0], 1.9);
  if (goal === 'cvSalir' && fi === 0) return over(cellsOf(0, 'S')[0], 0.9);
  return null;
}

on('stageDone', () => { if (active) for (const m of party) m.c.cheer = 1.8; });
on('chapterDone', () => { if (active) for (const m of party) m.c.cheer = 2.6; });

/** Debug and tests: the state of the party. */
export function caveState() {
  if (!active) return null;
  const L = leader();
  return { floor: fi, x: L.x, z: L.z, facing, moving, busy: busyT > 0, fading, label: actionLabel(), gate: gateK, door: doorK, party: party.map(m => m.c.id), path: path.length };
}
export function caveHold(d: Dir | null) { held = d; }
export function caveStepDir(d: Dir) { if (active && !moving && busyT <= 0) return tryStep(d); return false; }
export function caveFace(d: Dir) { if (!active) return; facing = d; leader().c.dir = Math.atan2(DV[d][0], DV[d][1]); }
/** Debug: jump straight to a floor. */
export function caveDebugFloor(n: number, up = false) { if (active) loadFloor(n, up ? 'up' : 'down'); }
