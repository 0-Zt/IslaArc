import * as THREE from 'three';
import { portrait } from '../ui/portraits';
import CAVE from '../data/cave.json';
import FARO from '../data/faro.json';
import { scene, camera, controls, cancelFly, setCaveMode, FR } from '../render/renderer';
import { refreshDay } from '../render/daynight';
import { buildFloor, lavaScroll, GLOW, DIR_ANGLE, CAVE_X, CAVE_Z, FARO_X, FARO_Z, type FloorView } from '../world/cavebuild';
import { zoneLifeStart, zoneLifeStop, tickZoneLife } from '../world/zonelife';
import { nightK } from '../render/daynight';
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
import { startBattle, battleActive, battleFocus, tickBattle, golemPose } from './battle';
import { lifeStart, lifeStop, tickLife, scareBats, type Light } from '../world/cavelife';

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
  relic?: { id: string; name: string; text: string };
  upgrade?: { id: string; who: string; name: string; text: string };
  chestAt?: Record<string, { gives: Record<string, number>; stars: number }>;
  loreAt?: Record<string, string>;
  theme?: 'isla' | 'torre';
  npc?: number[];
  pieces?: Record<string, { id: string; name: string; text: string }>;
}
const CAVE_FLOORS = CAVE.floors as FloorDef[], FARO_FLOORS = FARO.floors as FloorDef[];
/** The places explored cell by cell: the volcano cave and, from v0.18, the lighthouse island. */
export type ZoneId = 'cueva' | 'faro';
let zone: ZoneId = 'cueva';
let FLOORS = CAVE_FLOORS;
const K = (x: number, z: number) => `${x},${z}`;
const cellsOf = (fi: number, c: string) => { const out: [number, number][] = []; FLOORS[fi].map.forEach((row, z) => [...row].forEach((ch, x) => { if (ch === c) out.push([x, z]); })); return out; };

/* stories: the cave texts, the tablets and the lighthouse */
Object.assign(STORY, CAVE.story, FARO.story);
for (const f of FARO_FLOORS) for (const pc of Object.values(f.pieces || {})) STORY[pc.id] = { title: pc.name, text: pc.text };
STORY.fa_sign = { title: 'Un letrero', text: FARO_FLOORS[0].lore.replace(/ — .*$/, '') };
/** The three hidden relics, one behind a hollow wall on each floor (the cave collection). */
export const RELICS = CAVE_FLOORS.map(f => f.relic!).filter(Boolean);
for (const r of RELICS) STORY[`rel_${r.id}`] = { title: r.name, text: r.text };
/** The text of a tablet: the ones added later are placed by cell, the first ones go in map order. */
function loreKey(i: number, x: number, z: number) {
  const f = FLOORS[i], k = K(x, z);
  if (f.loreAt?.[k]) return `cv${i}_${x}_${z}`;
  return `cv${i}_${cellsOf(i, 'L').filter(([a, b]) => !f.loreAt?.[K(a, b)]).findIndex(([a, b]) => a === x && b === z)}`;
}
FLOORS.forEach((f, i) => {
  cellsOf(i, 'L').filter(([a, b]) => !f.loreAt?.[K(a, b)]).forEach((_, k) => {
    const text = k === 0 ? f.lore : f.lore2 || f.lore;
    const marea = text.includes('Marea');
    STORY[`cv${i}_${k}`] = { title: marea ? 'El grabado de Marea' : 'Tablilla de los Alfareros', text: text.replace(/ — .*$/, '') };
  });
  for (const [k, text] of Object.entries(f.loreAt || {})) { const [x, z] = k.split(',').map(Number); STORY[`cv${i}_${x}_${z}`] = { title: 'El mural de los cuatro', text: text.replace(/ — .*$/, '') }; }
  if (f.upgrade) STORY[`up_${f.upgrade.id}`] = { title: f.upgrade.name, text: f.upgrade.text.replace(/\*\*/g, '') };
});
/* what each figure can do out here, and how they are called */
const NAME: Record<string, string> = { arci: 'Arci', musgo: 'Musgo', brasa: 'Brasa', marea: 'Marea' };
const SKILL: Record<string, string> = { arci: 'empuja rocas y tiende puentes de tablas', musgo: 'aparta enredaderas y corta la hierba alta', brasa: 'camina sobre las brasas', marea: 'camina por el agua baja' };
const COLOR: Record<string, string> = { arci: '#c98655', musgo: '#7e9c58', brasa: '#c8582a', marea: '#4a86c0' };

/* ---------- saved state ---------- */
function freshFloor(i: number, floors = FLOORS): CaveFloorSave {
  const f = floors[i];
  const cellsOf = (fi: number, c: string) => { const out: [number, number][] = []; floors[fi].map.forEach((row, z) => [...row].forEach((ch, x) => { if (ch === c) out.push([x, z]); })); return out; };
  return { b: cellsOf(i, 'B'), fill: [], broken: [], lit: [], dirs: Object.fromEntries((f.statues || []).map(s => [K(s.x, s.z), s.dir])), mined: [], opened: [], read: [], door: false };
}
export function caveSave(): CaveSave {
  const c = S.cave || (S.cave = { hits: 0, max: -1, f: [], caracola: false, chests: 0 });
  CAVE_FLOORS.forEach((_, i) => { if (!c.f[i]) c.f[i] = freshFloor(i, CAVE_FLOORS); });
  if (!c.relics) c.relics = [];
  return c;
}
export function faroSave(): CaveSave {
  const c = S.faro || (S.faro = { hits: 0, max: -1, f: [], caracola: false, chests: 0, relics: [] });
  FARO_FLOORS.forEach((_, i) => { if (!c.f[i]) c.f[i] = freshFloor(i, FARO_FLOORS); });
  return c;
}
const ZS = () => zone === 'cueva' ? caveSave() : faroSave();
let OX = CAVE_X, OZ = CAVE_Z;
const theme = () => FLOORS[fi]?.theme || 'cueva';

/* ---------- runtime ---------- */
interface Member { c: Crew; x: number; z: number; fx: number; fz: number }
let active = false, fi = 0, view: FloorView | null = null, map: string[] = [];
let party: Member[] = [];
let facing: Dir = 'N', moving = false, stepT = 0, busyT = 0, onBusy: (() => void) | null = null, bumpT = 0;
let held: Dir | null = null, path: [number, number][] = [], pendingAct: [number, number] | null = null;
let boulderMeshes: (THREE.Group | null)[] = [];
const slabs: THREE.Object3D[] = [];
let glowSpots: (() => Light | null)[] = [], golemGlow = 1.3, npcFig: Crew | null = null;
let gateK = 0, doorK = 0, doorAt = 0, shakeT = 0, plateHint = false, golemFlick = 0, clock = 0, fading = false;
const STEP = 0.21, REGROW_FERN = 240, REGROW_ORE = 900;
const F = () => ZS().f[fi];
const ch = (x: number, z: number) => (map[z] && map[z][x]) || '#';
const leader = () => party[0];
export const caveActive = () => active;
export const caveFloor = () => active ? fi : -1;

interface Slide { o: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number; d: number; spin?: number; done?: () => void }
let slides: Slide[] = [];
const local = (x: number, z: number, y = 0) => new THREE.Vector3(x + 0.5, y, z + 0.5);
const world = (x: number, z: number, y = 0) => new THREE.Vector3(OX + x + 0.5, y, OZ + z + 0.5);

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
    + '<div id="cvWho" aria-label="Quién va adelante"></div><div id="cvSign" hidden></div>';
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
  $('cvWho').addEventListener('click', e => { const b = (e.target as HTMLElement).closest('[data-who]') as HTMLElement | null; if (b) switchLeader(b.dataset.who!); });
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
const exitTo: Record<ZoneId, () => THREE.Vector3 | null> = { cueva: () => null, faro: () => null };
/** Where the camera goes back to on the island (the cave mouth and the pier set this). */
export function setExitPoint(f: () => THREE.Vector3 | null, z: ZoneId = 'cueva') { exitTo[z] = f; }

export const enterCave = (immediate = false) => enterZone('cueva', immediate);
export const exitCave = (immediate = false) => exitZone(immediate);
export const zoneId = () => active ? zone : null;
export function enterZone(z: ZoneId, immediate = false) {
  if (active) return;
  ui(); caveSave(); faroSave();
  fade(() => {
    zone = z; FLOORS = z === 'cueva' ? CAVE_FLOORS : FARO_FLOORS;
    [OX, OZ] = z === 'cueva' ? [CAVE_X, CAVE_Z] : [FARO_X, FARO_Z];
    active = true; cancelFly(); select(null);
    before = { target: controls.target.clone(), pos: camera.position.clone(), zoom: camera.zoom };
    controls.enabled = false;
    if (z === 'cueva') { setCaveMode(true); setCaveAmbience(true); }
    document.body.classList.add('incave');
    $('caveUI').hidden = false; $('bottom').hidden = true;
    if (z === 'cueva') for (let k = 0; k < POOL; k++) { const l = new THREE.PointLight('#ffb070', 0, 6, 1.6); scene.add(l); lights.push(l); }
    partyLight = new THREE.PointLight('#ffd8a0', 5, 7.5, 1.4); scene.add(partyLight);
    scene.add(embers);
    const ids: CharId[] = ['arci', ...(['musgo', 'brasa', 'marea'] as CharId[]).filter(id => crew.some(c => c.id === id))];
    party = ids.map(id => { const c = makeFigure(id); c.lamp = 0.6; c.ring.visible = false; scene.add(c.root); return { c, x: 0, z: 0, fx: 0, fz: 0 }; });
    loadFloor(0, 'down'); refreshWho();
    if (party.length > 1 && !S.flags.cvWhoHint) { S.flags.cvWhoHint = true; setTimeout(() => say('Toca una cara (a la derecha) para elegir quién va adelante: cada figura sabe hacer algo distinto.'), 4200); }
    if (z === 'cueva' && !S.flags.cuevaEntro) { S.flags.cuevaEntro = true; emit('changed'); }
    if (z === 'faro' && !S.flags.faroVisitado) { S.flags.faroVisitado = true; emit('changed'); }
    emit('caveMode', true); emit('caveChanged');
  }, immediate);
}
export function exitZone(immediate = false) {
  if (!active) return;
  const was = zone;
  fade(() => {
    unloadFloor();
    for (const m of party) scene.remove(m.c.root);
    party = [];
    for (const l of lights) scene.remove(l); lights = [];
    if (partyLight) scene.remove(partyLight); partyLight = null;
    scene.remove(embers); emberList.length = 0;
    active = false; held = null; path = []; pendingAct = null; moving = false; busyT = 0;
    if (was === 'cueva') { setCaveMode(false); setCaveAmbience(false); refreshDay(); }
    document.body.classList.remove('incave');
    $('caveUI').hidden = true; $('bottom').hidden = false;
    controls.enabled = true;
    const p = exitTo[was]();
    if (before) {
      const off = before.pos.clone().sub(before.target);
      const t = p || before.target;
      controls.target.copy(t); camera.position.copy(t).add(off); camera.zoom = Math.max(before.zoom, 1.1); camera.updateProjectionMatrix();
    }
    if (was === 'cueva' && S.cave?.caracola && !S.flags.caracolaIsla) { S.flags.caracolaIsla = true; emit('toast', 'Vuelves a la luz con la caracola grande. Pesa, y está tibia.'); }
    if (was === 'faro' && S.flags.mareaUnida && !S.flags.mareaEnIsla) { S.flags.mareaEnIsla = true; emit('mareaJoins'); }
    zone = 'cueva'; FLOORS = CAVE_FLOORS; [OX, OZ] = [CAVE_X, CAVE_Z];
    emit('changed'); emit('caveMode', false); emit('caveChanged');
  }, immediate);
}

function unloadFloor() {
  lifeStop(); zoneLifeStop();
  if (npcFig) { scene.remove(npcFig.root); npcFig = null; }
  if (!view) return;
  scene.remove(view.root);
  view.root.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
  view = null; slides = []; slabs.length = 0; boulderMeshes = [];
}
function loadFloor(n: number, how: 'down' | 'up' | 'reset') {
  unloadFloor();
  fi = n; map = FLOORS[n].map;
  const st = F();
  view = buildFloor(map, st.dirs, FLOORS[n].decor, n, FLOORS[n].theme || 'cueva', OX, OZ);
  scene.add(view.root);
  // boulders where they were left; the ones that fell became floor
  const orig = cellsOf(n, 'B');
  boulderMeshes = orig.map(([x, z], k) => {
    const m = view!.boulders.get(K(x, z))!; const p = st.b[k];
    if (!p) { m.visible = false; return null; }
    m.position.copy(local(p[0], p[1])); return m;
  });
  for (const k of st.fill) { const [x, z] = k.split(',').map(Number); addSlab(x, z); }
  // what grows back: ferns in a few minutes, crystals and veins after a longer while (old saves: right away)
  st.cut = st.cut || {}; st.minedAt = st.minedAt || {}; st.built = st.built || {};
  for (const [k, t] of Object.entries(st.cut)) if (S.time - t > REGROW_FERN) delete st.cut[k];
  st.mined = st.mined.filter(k => S.time - (st.minedAt![k] ?? -1e9) < REGROW_ORE);
  for (const k of Object.keys(st.minedAt)) if (!st.mined.includes(k)) delete st.minedAt[k];
  for (const k of st.broken) view.vines.get(k)?.removeFromParent();
  for (const [k, f] of view.ferns) { const cut = k in st.cut!; f.tall.visible = !cut; f.stub.visible = cut; }
  for (const [k, kind] of Object.entries(st.built)) { const c = view.chasms.get(k); if (c) (kind === 'raices' ? c.root : c.plank).visible = true; }
  const up = FLOORS[n].upgrade; if (up && S.flags[up.id] && view.gift) view.gift.visible = false;
  for (const k of st.broken) { view.rubble.get(k)?.removeFromParent(); view.cracked.get(k)?.removeFromParent(); }
  if (FLOORS[n].relic && ZS().relics!.includes(FLOORS[n].relic!.id) && view.relic) view.relic.visible = false;
  for (const k of st.mined) mineVisual(k);
  for (const k of st.opened) { const c = view.chests.get(k); if (c) c.lid.rotation.x = -1.9; }
  if (ZS().caracola && view.shell) view.shell.visible = false;
  if (view.golem) golemPose(view.golem, S.flags.golemCalmo ? 'calm' : S.flags.caracolaDebil ? 'awake' : 'sleep');
  for (const [k, s] of view.statues) s.g.rotation.y = DIR_ANGLE[st.dirs[k] || 'S'];
  gateK = plateDown() ? 1 : 0; doorK = st.door ? 1 : 0; doorAt = 0;
  // party position
  let at: [number, number];
  if (how === 'up') { const g = cellsOf(n, '>')[0]; at = [g[0], g[1] + 1]; facing = 'S'; }
  else { at = cellsOf(n, 'S')[0]; facing = 'N'; }
  for (const m of party) { m.x = m.fx = at[0]; m.z = m.fz = at[1]; m.c.root.position.copy(world(at[0], at[1])); m.c.dir = Math.atan2(DV[facing][0], DV[facing][1]); m.c.root.rotation.y = m.c.dir; setFigureAnim(m.c, 'idle'); }
  moving = false; path = []; pendingAct = null; busyT = 0;
  if (n > ZS().max) { ZS().max = n; emit('changed'); }
  setupLights();
  if (theme() === 'cueva') { lifeStart(map, n, (x, z) => !solid(x, z), OX, OZ); setCaveAmbience(true, n === 2); }
  else zoneLifeStart(map, theme() as 'isla' | 'torre', OX, OZ, (x, z) => !blockedFor('arci', x, z));
  // Marea waits by the lighthouse until it shines again
  const npc = FLOORS[n].npc;
  if (npc && !S.flags.mareaUnida) { npcFig = makeFigure('marea'); npcFig.lamp = 0; npcFig.ring.visible = false; npcFig.root.position.copy(world(npc[0], npc[1])); npcFig.dir = 0; npcFig.root.rotation.y = 0; scene.add(npcFig.root); }
  for (const k of Object.keys(FLOORS[n].pieces || {})) if (st.opened.includes(k)) view.pieces.get(k)?.removeFromParent();
  glowSpots = [];
  map.forEach((row, z) => [...row].forEach((c, x) => {
    const k2 = K(x, z), w2 = world(x, z);
    if (c === 't') glowSpots.push(() => F().lit.includes(k2) ? { x: w2.x, z: w2.z, r: 3.6 } : null);
    if (c === '~') glowSpots.push(() => F().fill.includes(k2) ? null : { x: w2.x, z: w2.z, r: 1.5 });
    if (c === 'C') glowSpots.push(() => ({ x: w2.x, z: w2.z, r: F().mined.includes(k2) ? 0.8 : 1.9 }));
    if (c === 'S') glowSpots.push(() => ({ x: w2.x, z: w2.z, r: 2.4 }));
    if (c === '>') glowSpots.push(() => ({ x: w2.x, z: w2.z, r: 1.2 }));
    if (c === 'Q') glowSpots.push(() => ZS().caracola ? null : { x: w2.x, z: w2.z, r: 2.4 });
    if (c === 'A') glowSpots.push(() => F().door ? { x: w2.x, z: w2.z, r: 2.8 } : { x: w2.x, z: w2.z, r: 0.9 });
    if (c === 'D') glowSpots.push(() => ({ x: w2.x, z: w2.z, r: F().door ? 1.6 : 0.9 }));
    if (c === 'Y') glowSpots.push(() => F().broken.length && !ZS().relics!.includes(FLOORS[fi].relic?.id || '') ? { x: w2.x, z: w2.z, r: 1.2 } : null);
    if (c === 'g') glowSpots.push(() => ({ x: w2.x, z: w2.z, r: golemGlow }));
    if (c === 'b') glowSpots.push(() => ({ x: w2.x, z: w2.z, r: 1.0 }));
    if (c === 'U') glowSpots.push(() => S.flags[FLOORS[fi].upgrade?.id || ''] ? null : { x: w2.x, z: w2.z, r: 1.8 });
    if (c === 'V') glowSpots.push(() => F().broken.includes(k2) ? null : { x: w2.x, z: w2.z, r: 0.8 });
    if (c === 'o') glowSpots.push(() => F().mined.includes(k2) ? null : { x: w2.x, z: w2.z, r: 0.7 });
  }));
  for (const [x, z] of FLOORS[n].decor.mushrooms) { const w2 = world(x, z); glowSpots.push(() => ({ x: w2.x, z: w2.z, r: 1.1 })); }
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
  for (const [x, z] of cellsOf(fi, 'Q')) slots.push({ pos: world(x, z, 1.4), color: '#ffc8d8', base: 4, dist: 5, flick: 0.1, on: () => ZS().caracola ? 0 : 1 });
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
    case '.': case ',': case 'S': case '>': case 'P': case 'B': case ':': case 'd': return false;   // under a boulder there is floor
    case 'w': return false;                                     // water: see blockedFor
    case 'n': return !S.flags.mareaUnida;
    case 'p': return !st.opened.includes(k);
    case 'R': case 'X': case 'V': return !st.broken.includes(k);
    case 'b': return false;                                     // burning ground: see blockedFor
    case 'h': return !(st.cut && k in st.cut);
    case '=': return !(st.built && st.built[k]);
    case 'O': case '~': return !st.fill.includes(k);
    case 'D': return !(st.door && doorK > 0.7);
    case 'G': return gateK < 0.7;
    default: return true;
  }
}

/** Somewhere only one figure can go: the burning ground is for Brasa alone. */
function blockedFor(id: string, x: number, z: number) {
  if (id === 'musgo' && ch(x, z) === 'h') return false;                  // Musgo walks into the tall grass and cuts it
  if (solid(x, z)) return true;
  const c = ch(x, z);
  if (c === 'w') return id !== 'marea' && !F().fill.includes(K(x, z));   // only Marea walks in the water
  return c === 'b' && id !== 'brasa';
}
/** Which figure is needed for what is in this cell (null: anyone). */
function needs(x: number, z: number): string | null {
  const c = ch(x, z), k = K(x, z), st = F();
  if (boulderAt(x, z) >= 0) return 'arci';
  if (c === 'V' && !st.broken.includes(k)) return 'musgo';
  if (c === 'h' && solid(x, z)) return 'musgo';
  if (c === '=' && solid(x, z)) return S.flags.semilla && leader().c.id === 'musgo' ? 'musgo' : 'arci';
  if (c === 'b') return 'brasa';
  if (c === 'w' && !F().fill.includes(k)) return 'marea';
  return null;
}
let hintT = 0;
function hint(t: string) { if (hintT > 0) return; hintT = 2.5; say(t); }
function tryStep(d: Dir): boolean {
  const L = leader(), id = L.c.id; facing = d; L.c.dir = Math.atan2(DV[d][0], DV[d][1]);
  const [dx, dz] = DV[d], nx = L.x + dx, nz = L.z + dz;
  const bi = boulderAt(nx, nz), c = ch(nx, nz);
  if (bi >= 0) {
    if (id !== 'arci') { bump(); hint(has('arci') ? 'Es muy pesada: solo Arci puede empujar las rocas (toca su cara arriba).' : 'Es muy pesada para moverla.'); return false; }
    if (!push(bi, dx, dz)) { bump(); return false; }
  } else if (c === 'h' && solid(nx, nz)) {
    if (id !== 'musgo') { bump(); hint(has('musgo') ? 'Hierba muy tupida: Musgo la puede cortar (toca su cara arriba).' : 'Hierba muy tupida.'); return false; }
    cutFern(nx, nz);
  } else if (blockedFor(id, nx, nz)) {
    bump();
    if (c === 'b') hint(has('brasa') ? (theme() === 'isla' ? 'Vapor hirviendo: solo Brasa camina entre las fumarolas (toca su cara).' : 'El suelo quema: solo Brasa camina sobre las brasas (toca su cara arriba).') : 'El suelo quema.');
    if (c === 'w') hint(has('marea') ? 'Agua: solo Marea camina por ahí (toca su cara).' : 'Agua. Nadie del equipo sabe moverse en el agua… todavía.');
    return false;
  }
  // the others follow in line, but only where they can stand; if not, they wait
  const old = party.map(m => [m.x, m.z]);
  L.fx = L.x; L.fz = L.z; L.x = nx; L.z = nz;
  let aheadMoved = true;
  for (let k = 1; k < party.length; k++) {
    const m = party[k], [ax, az] = old[k - 1];
    m.fx = m.x; m.fz = m.z;
    const near = Math.abs(ax - m.x) + Math.abs(az - m.z) <= 1;
    if (aheadMoved && near && !(ax === m.x && az === m.z && k > 1 && !aheadMoved) && !blockedFor(m.c.id, ax, az)) { m.x = ax; m.z = az; aheadMoved = true; }
    else aheadMoved = false;
  }
  if (c === 'b' && id === 'brasa' && !S.flags.brasas) { S.flags.brasas = true; say('Brasa camina sobre las brasas como si nada. Las demás esperan.'); emit('changed'); }
  for (const m of party) if (m.x !== m.fx || m.z !== m.fz) { m.c.dir = Math.atan2(m.x - m.fx, m.z - m.fz); setFigureAnim(m.c, 'walk'); } else if (m !== L) setFigureAnim(m.c, 'idle');
  moving = true; stepT = 0; sfx('step', 0.6);
  return true;
}
function bump() { if (bumpT > 0) return; bumpT = 0.35; sfx('tap', 0.25); }
const has = (id: string) => party.some(m => m.c.id === id);
/** Musgo walks into the tall grass and cuts it; sometimes there is something inside. */
function cutFern(x: number, z: number) {
  const st = F(), k = K(x, z), w = world(x, z);
  (st.cut ||= {})[k] = S.time;
  const f = view?.ferns.get(k); if (f) { f.tall.visible = false; f.stub.visible = true; }
  sfx('chop', 0.6); puff(w.x, 0.4, w.z, '#6fb04a', 10, 1.6, 1.2, 0);
  S.stats.hierba = (S.stats.hierba || 0) + 1;
  const r = Math.random(), at = w.clone().setY(1);
  if (r < 0.05) { addStars(1, 'Escarabajo dorado escondido en la hierba'); sfx('coin'); }
  else if (r < 0.45) gain('semilla', 1, at);
  else if (r < 0.6) gain('cuarzo', 1, at);
  else if (r < 0.75) gain('mineral', 1, at);
  else if (r < 0.82) { for (let q = 0; q < 3; q++) spawnEmber(w.x, w.z, 0.4); }
  emit('caveChanged');
}
/** Puts another figure at the front of the line (it keeps its place; the camera goes to it). */
export function switchLeader(id: string) {
  const k = party.findIndex(m => m.c.id === id); if (k <= 0 || battleActive()) { refreshWho(); return; }
  const m = party.splice(k, 1)[0]; party.unshift(m);
  path = []; pendingAct = null; held = null;
  const off = (d: Dir) => { let a = Math.atan2(DV[d][0], DV[d][1]) - m.c.dir; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return Math.abs(a); };
  facing = (Object.keys(DV) as Dir[]).reduce((b, d) => off(d) < off(b) ? d : b, 'N' as Dir);
  sfx('tap'); m.c.cheer = 0.4;
  if (!S.flags[`lider_${id}`]) { S.flags[`lider_${id}`] = true; say(`${NAME[id]} va adelante: ${SKILL[id]}.`); }
  if (id === 'musgo' && !S.flags.liderMusgo) { S.flags.liderMusgo = true; emit('changed'); }
  refreshWho();
}
function refreshWho() {
  const el = document.getElementById('cvWho'); if (!el) return;
  const h = party.map((m, k) => `<button data-who="${m.c.id}" class="${k === 0 ? 'on' : ''}" style="--c:${COLOR[m.c.id]}" aria-label="${NAME[m.c.id]}: ${SKILL[m.c.id]}">${portrait(m.c.id) ? `<img src="${portrait(m.c.id)}" alt="">` : `<b>${NAME[m.c.id][0]}</b>`}</button>`).join('');
  if (el.dataset.sig !== h) { el.dataset.sig = h; el.innerHTML = h; }
}

function push(bi: number, dx: number, dz: number) {
  const st = F(), [bx, bz] = st.b[bi]!, tx = bx + dx, tz = bz + dz, c = ch(tx, tz), k = K(tx, tz);
  if (boulderAt(tx, tz) >= 0 || c === 'S' || c === '>') return false;
  const hole = (c === 'O' || c === '~' || c === 'w') && !st.fill.includes(k);
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
  if (c === 'w') { sfx('splash'); puff(w.x, 0.1, w.z, '#e8f6ff', 16, 2.2, 1.4, -0.1); }
  else if (c === '~') {
    sfx('fire'); sfx('splash', 0.6);
    puff(w.x, 0.1, w.z, '#e8e0d8', 14, 2.2, 1.2, 0); puff(w.x, 0.1, w.z, '#ffb040', 8, 2.6, 1.4, 0);
    for (let k = 0; k < 10; k++) spawnEmber(w.x + (Math.random() - 0.5) * 0.8, w.z + (Math.random() - 0.5) * 0.8, 1.6);
  } else { sfx('fall', 0.8); puff(w.x, 0.1, w.z, '#6a5c50', 12, 1.6, 1.4, 0); }
  scareBats(w, 5);
  slides.push({ o: mesh, from: mesh.position.clone(), to: mesh.position.clone().setY(-0.75), t: 0, d: 0.32, done: () => { mesh.visible = false; addSlab(x, z); shakeT = 0.25; } });
}
/** The floor a boulder leaves when it fills a pit (a stone lid) or the lava (cooled black rock). */
function addSlab(x: number, z: number) {
  if (!view) return;
  const c = ch(x, z), g = new THREE.Group(); g.position.copy(local(x, z));
  const parts: THREE.BufferGeometry[] = [];
  if (c === 'w') {
    vbox(parts, 0, -0.2, 0, 0.9, 0.36, 0.9, '#7a7068'); vbox(parts, 0.08, -0.01, -0.05, 0.6, 0.04, 0.55, '#8a8078');
    const m = new THREE.Mesh(mergeGeometries(parts), MAT.stone); m.receiveShadow = true; g.add(m);
  } else if (c === '~') {
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
  const need = needs(x, z), lid = leader().c.id;
  if (need && need !== lid && c !== 'b') return has(need) ? `${NAME[need]} ▸` : '';
  if (boulderAt(x, z) >= 0) return 'Empujar';
  switch (c) {
    case 'V': return st.broken.includes(k) ? '' : 'Apartar';
    case 'h': return solid(x, z) ? 'Cortar' : '';
    case '=': return solid(x, z) ? (lid === 'musgo' ? 'Raíces' : 'Puente · 3 tablas') : '';
    case 'o': return st.mined.includes(k) ? 'Mirar' : 'Picar';
    case 'p': return st.opened.includes(k) ? '' : 'Tomar';
    case 'n': return S.flags.mareaUnida ? '' : 'Hablar';
    case 'T': case 'F': return 'Mirar';
    case 'U': return S.flags[FLOORS[fi].upgrade?.id || ''] ? 'Mirar' : (FLOORS[fi].upgrade?.who === lid ? 'Tomar' : `${NAME[FLOORS[fi].upgrade?.who || 'arci']} ▸`);
    case 't': return st.lit.includes(k) ? 'Mirar' : 'Encender';
    case 's': return 'Girar';
    case 'R': return st.broken.includes(k) ? '' : 'Romper';
    case 'C': case 'M': return st.mined.includes(k) ? 'Mirar' : 'Picar';
    case 'K': return st.opened.includes(k) ? 'Mirar' : 'Abrir';
    case 'L': return 'Leer';
    case 'X': return st.broken.includes(k) ? '' : 'Romper';
    case 'Y': return ZS().relics!.includes(FLOORS[fi].relic?.id || '') ? 'Mirar' : 'Tomar';
    case 'Q': return ZS().caracola ? 'Mirar' : 'Tomar';
    case 'A': return zone === 'faro' ? (S.flags.faroEncendido ? 'Mirar' : piecesHeld() >= 3 ? 'Poner la lente' : 'Mirar') : 'Mirar';
    case 'D': case 'G': case 'g': case '*': return 'Mirar';
  }
  return '';
}
function work(seconds: number, tool: ToolKey | '', done: () => void) {
  const c = leader().c; c.toolKey = tool as ToolKey; setFigureAnim(c, 'work'); busyT = seconds; onBusy = done;
}
const say = (t: string) => emit('toast', t);
const lead = () => leader().c.def.name;

export function caveAct() {
  if (!active || moving || busyT > 0 || fading || !party.length || battleActive()) return;
  const [x, z] = front(), k = K(x, z), st = F(), c = ch(x, z), w = world(x, z);
  // something only another figure can do: that figure comes to the front and does it
  const need = c === 'U' && !S.flags[FLOORS[fi].upgrade?.id || ''] ? FLOORS[fi].upgrade!.who : needs(x, z);
  if (need && need !== leader().c.id && c !== 'b') {
    if (!has(need)) { say('Eso no lo puede hacer nadie del equipo todavía.'); return; }
    const L0 = leader(); switchLeader(need);
    const r = route(L0.x, L0.z, false);
    if (r) { path = r; pendingAct = [x, z]; } else say(`${NAME[need]} no llega hasta ahí.`);
    return;
  }
  if (boulderAt(x, z) >= 0) { tryStep(facing); return; }
  switch (c) {
    case 'V': {
      if (st.broken.includes(k)) return;
      work(0.9, '', () => {
        st.broken.push(k); view!.vines.get(k)?.removeFromParent(); sfx('chop'); puff(w.x, 0.9, w.z, '#6fb04a', 18, 1.8, 1.4, 0);
        say('Musgo le habla a la enredadera y la enredadera se aparta.');
        if (!S.flags.enredadera) { S.flags.enredadera = true; emit('changed'); }
        emit('caveChanged');
      });
      return;
    }
    case 'h': { if (solid(x, z)) tryStep(facing); return; }
    case '=': {
      if (!solid(x, z)) return;
      const roots = leader().c.id === 'musgo' && S.flags.semilla;
      if (!roots && S.res.tablas < 3) { say('Para el puente hacen falta 3 tablas (del aserradero de la isla).'); return; }
      work(1.4, roots ? '' : 'hammer', () => {
        if (!roots) S.res.tablas -= 3;
        (st.built ||= {})[k] = roots ? 'raices' : 'tablas';
        const cz = view!.chasms.get(k); if (cz) (roots ? cz.root : cz.plank).visible = true;
        sfx(roots ? 'heal' : 'hammer'); puff(w.x, 0.2, w.z, roots ? '#6fb04a' : '#c8a870', 14, 1.4, 1, 0);
        say(roots ? 'Las raíces de Musgo cruzan la grieta y se trenzan en un puente.' : 'Arci clava las tablas y tiende un puente sobre la grieta.');
        if (!S.flags.puenteGrieta) { S.flags.puenteGrieta = true; }
        emit('changed'); emit('caveChanged');
      });
      return;
    }
    case 'o': {
      if (st.mined.includes(k)) { say('La obsidiana volverá a asomar con el tiempo.'); return; }
      if (!S.tools.pico) { say('Hace falta el pico de metal'); return; }
      sfx('pick');
      work(1.6, 'pickM', () => {
        sfx('crack', 0.6); st.mined.push(k); (st.minedAt ||= {})[k] = S.time; view!.obsidian.get(k)?.scale.set(1, 0.4, 1);
        gain('obsidiana', S.inv.picoO ? 4 : 2, leader().c.root.position.clone().setY(1.2)); puff(w.x, 0.5, w.z, '#4a3a5e', 12, 1.8, 1, 0);
        if (!S.flags.obsidianaVista) { S.flags.obsidianaVista = true; say('Obsidiana: vidrio de volcán, negro y filoso. Con ella se puede hacer un pico mejor.'); }
        S.stats.cueva = (S.stats.cueva || 0) + 1;
        emit('changed'); emit('caveChanged');
      });
      return;
    }
    case 'U': {
      const up = FLOORS[fi].upgrade; if (!up) return;
      if (S.flags[up.id]) { say('El pedestal está vacío.'); return; }
      work(0.9, '', () => {
        S.flags[up.id] = true; sfx('level');
        const it = view!.gift; if (it) slides.push({ o: it, from: it.position.clone(), to: it.position.clone().setY(1.8), t: 0, d: 0.8, done: () => { it.visible = false; } });
        puff(w.x, 0.9, w.z, up.who === 'brasa' ? '#ffb040' : '#8ad96b', 22, 2, 1.2, 0);
        leader().c.cheer = 2;
        setTimeout(() => emit('story', `up_${up.id}`), 1000);
        emit('changed'); emit('caveChanged');
      });
      return;
    }
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
    case 'X': {
      if (st.broken.includes(k)) return;
      if (!S.tools.pico) { say('La pared suena hueca… pero hace falta el pico de metal'); return; }
      sfx('pick');
      work(1.5, 'pickM', () => {
        sfx('crack'); st.broken.push(k); view!.cracked.get(k)?.removeFromParent(); scareBats(w, 6);
        puff(w.x, 0.5, w.z, '#6a6070', 22, 2.2, 1.8, 0); shakeT = 0.35;
        say('¡La pared estaba hueca! Hay un nicho escondido.'); emit('caveChanged');
      });
      return;
    }
    case 'Y': {
      const r = FLOORS[fi].relic; if (!r) return;
      if (ZS().relics!.includes(r.id)) { say('El nicho está vacío. Aquí estaba ' + r.name.toLowerCase() + '.'); return; }
      work(0.7, '', () => {
        ZS().relics!.push(r.id); sfx('catch');
        if (view!.relic) { const it = view!.relic; slides.push({ o: it, from: it.position.clone(), to: it.position.clone().setY(1.6), t: 0, d: 0.7, done: () => { it.visible = false; } }); }
        puff(w.x, 0.8, w.z, '#ffe0a0', 14, 1.8, 1, 0);
        S.stats.cueva = (S.stats.cueva || 0) + 1;
        addStars(2, `Reliquia: ${r.name}`);
        setTimeout(() => emit('story', `rel_${r.id}`), 900);
        emit('changed'); emit('caveChanged');
      });
      return;
    }
    case 'C': case 'M': {
      if (st.mined.includes(k)) { say(c === 'C' ? 'Solo quedan astillas apagadas. Los cristales vuelven a crecer con el tiempo.' : 'La veta está vacía por ahora: el mineral vuelve a asomar con el tiempo.'); return; }
      sfx('pick');
      work(1.4, 'pickM', () => {
        sfx('pick'); st.mined.push(k); (st.minedAt ||= {})[k] = S.time; mineVisual(k);
        S.stats.cueva = (S.stats.cueva || 0) + 1;
        const at = leader().c.root.position.clone().setY(1.2), x2 = S.inv.picoO ? 2 : 1;
        if (c === 'C') { gain('cuarzo', 2 * x2, at); puff(w.x, 0.5, w.z, '#8fe8ff', 12, 1.8, 1, 0); say('Cristales de cuarzo: brillan solos, incluso en la oscuridad'); }
        else { gain('cobre', 2 * x2, at); gain('mineral', 2 * x2, at.clone().setY(1.5)); puff(w.x, 0.5, w.z, '#e09050', 12, 1.8, 1, 0); }
        emit('caveChanged');
      });
      return;
    }
    case 'K': {
      if (st.opened.includes(k)) { say('El cofre está vacío.'); return; }
      work(0.6, '', () => {
        st.opened.push(k); sfx('coin'); const ch2 = view!.chests.get(k)!;
        slides.push({ o: ch2.lid, from: new THREE.Vector3(0, 0, 0), to: new THREE.Vector3(-1.9, 0, 0), t: 0, d: 0.5, spin: -98 });
        const gv = FLOORS[fi].chestAt?.[k] || FLOORS[fi].chest, at = w.clone().setY(1);
        Object.entries(gv.gives).forEach(([r, n], i) => gain(r as ResKey, n, at.clone().setY(1 + i * 0.35)));
        puff(w.x, 0.5, w.z, '#f2c14e', 14, 2.2, 1, 0);
        ZS().chests++; S.stats.cueva = (S.stats.cueva || 0) + 1;
        addStars(gv.stars, 'Cofre de los Alfareros');
        const flag = (gv as { flag?: string }).flag;
        if (flag && !S.flags[flag]) { S.flags[flag] = true; if (flag === 'islaConchas') setTimeout(() => emit('story', 'conchas'), 900); }
        emit('changed'); emit('caveChanged');
      });
      return;
    }
    case 'L': {
      if (!st.read.includes(k)) { st.read.push(k); emit('caveChanged'); }
      if (FLOORS[fi].loreAt?.[k] && !S.flags.mural) { S.flags.mural = true; emit('changed'); }
      emit('story', zone === 'faro' ? 'fa_sign' : loreKey(fi, x, z));
      return;
    }
    case 'Q': {
      if (ZS().caracola) { say('El pedestal está vacío. Todavía se siente tibio.'); return; }
      work(0.8, '', () => {
        ZS().caracola = true; sfx('level');
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
    case 'p': {
      const pc = FLOORS[fi].pieces?.[k]; if (!pc || st.opened.includes(k)) return;
      work(0.7, '', () => {
        st.opened.push(k); S.flags[pc.id] = true; sfx('catch');
        const it = view!.pieces.get(k); if (it) slides.push({ o: it, from: it.position.clone(), to: it.position.clone().setY(1.6), t: 0, d: 0.7, done: () => { it.visible = false; } });
        puff(w.x, 0.6, w.z, '#e8f6ff', 14, 1.8, 1, 0); leader().c.cheer = 1.2;
        setTimeout(() => { emit('story', pc.id); say(`Trozos de la lente: ${piecesHeld()} de 3`); }, 800);
        emit('changed'); emit('caveChanged');
      });
      return;
    }
    case 'n': {
      if (S.flags.mareaUnida) return;
      if (npcFig) { const d = leader().c.root.position.clone().sub(npcFig.root.position); npcFig.dir = Math.atan2(d.x, d.z); setFigureAnim(npcFig, 'wave'); setTimeout(() => npcFig && setFigureAnim(npcFig, 'idle'), 1400); }
      if (!S.flags.mareaHablo) { S.flags.mareaHablo = true; emit('story', 'mareaHola'); emit('changed'); return; }
      const n = piecesHeld();
      say(n < 3 ? `Marea: «Faltan ${3 - n} ${3 - n === 1 ? 'trozo' : 'trozos'} de la lente. Pasto alto, fumarolas y la roca del este.»` : 'Marea: «¡Los tres! Sube al faro y ponlos en el marco de arriba.»');
      return;
    }
    case 'T': say(theme() === 'isla' ? 'Una palmera de arcilla. Los cocos son duros como piedra.' : 'Un árbol.'); return;
    case 'F': say('El faro de los Alfareros. La puerta está al frente.'); return;
    case 'A': if (zone === 'faro') { lightLens(); return; } say(st.door ? 'El orbe del altar brilla: las cuatro guardianas lo miran.' : 'Un altar con un orbe apagado. Ninguna de las guardianas lo mira.'); return;
    case 'g': {
      if (S.flags.golemCalmo) { say('El gólem descansa, tibio y tranquilo. Te mira y asiente: la montaña te presta la caracola.'); return; }
      if (S.flags.caracolaDebil) { golemFight(); return; }
      say(ZS().caracola ? 'El gólem no se mueve… pero ahora sus ojos parecen seguirte.' : 'Un gólem de arcilla oscura, enorme, dormido sobre las rodillas. El calor le late en las grietas.'); return;
    }
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

/* ---------- the lighthouse ---------- */
const PIECES = ['piezaPasto', 'piezaVapor', 'piezaRoca'];
export const piecesHeld = () => PIECES.filter(f => S.flags[f]).length;
function lightLens() {
  if (S.flags.faroEncendido) { say('La lente gira despacio. Desde aquí se ve tu isla.'); return; }
  const n = piecesHeld();
  if (n < 3) { say(`El marco de bronce de la lente. Faltan ${3 - n} ${3 - n === 1 ? 'trozo' : 'trozos'}.`); return; }
  work(1.2, '', () => {
    S.flags.faroEncendido = true; sfx('solve'); shakeT = 0.3;
    const w = world(...cellsOf(fi, 'A')[0], 1.2); puff(w.x, 1.2, w.z, '#fff6c8', 26, 2.4, 1.4, 0);
    for (const m of party) m.c.cheer = 2;
    // Marea comes up the stairs and joins the line
    if (!S.flags.mareaUnida) {
      S.flags.mareaUnida = true; if (!S.crew.includes('marea')) S.crew.push('marea');
      const L = leader(), c = makeFigure('marea'); c.lamp = 0.6; c.ring.visible = false; c.root.position.copy(world(L.x, L.z)); scene.add(c.root);
      party.push({ c, x: L.x, z: L.z, fx: L.x, fz: L.z }); refreshWho();
    }
    setTimeout(() => emit('story', 'faroLuz'), 1200);
    emit('changed'); emit('caveChanged');
  });
}

/* ---------- the guardian ---------- */
function golemFight() {
  const g = cellsOf(fi, 'g')[0]; if (!g || !view?.golem) return;
  if (!S.flags.golemDespierto) { S.flags.golemDespierto = true; emit('changed'); }
  fade(() => {
    $('caveUI').classList.add('fight'); held = null; path = []; pendingAct = null;
    // the team lines up in front of the guardian, the leader in the middle
    const row = g[1] + 1, xs = [g[0], g[0] - 1, g[0] + 1].filter(x => !solid(x, row) || party.some(m => m.x === x && m.z === row));
    const homes = party.map((_, k) => world(xs[k % xs.length], row, 0).add(new THREE.Vector3(0, 0, 0.35)));
    for (const m of party) { m.x = m.fx = g[0]; m.z = m.fz = row; }
    startBattle({ party: party.map(m => m.c), homes, golem: view!.golem!, onEnd: win => {
      $('caveUI').classList.remove('fight');
      if (win) {
        S.flags.golemCalmo = true;
        for (const m of party) { m.c.root.position.copy(world(g[0], row)); }
        setTimeout(() => emit('story', 'golemCalmo'), 400);
        emit('changed'); emit('caveChanged');
      } else {
        fade(() => { loadFloor(fi, 'reset'); say('Las figuras se recuperan junto a la escalera. El gólem sigue esperando.'); });
      }
    } });
  });
}

/* ---------- taps on the cave ---------- */
export function caveTap(ray: THREE.Raycaster) {
  if (!active || !view || fading) return;
  const hits = ray.intersectObject(view.root, true).filter(h => (h.object as THREE.Mesh).isMesh && ((h.object as THREE.Mesh).material as THREE.Material).blending !== THREE.AdditiveBlending);
  let x: number, z: number;
  if (hits.length) {
    const h = hits[0], n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    const p = h.point.clone().addScaledVector(n, -0.05);
    x = Math.floor(p.x - OX); z = Math.floor(p.z - OZ);
  } else {
    const t = -ray.ray.origin.y / ray.ray.direction.y; if (!(t > 0)) return;
    const p = ray.ray.at(t, new THREE.Vector3()); x = Math.floor(p.x - OX); z = Math.floor(p.z - OZ);
  }
  tapCell(x, z);
}
export function tapCell(x: number, z: number) {
  if (!active || fading || busyT > 0 || battleActive()) return;
  const L = leader(); if (L.x === x && L.z === z) return;
  held = null; pendingAct = null;
  const adj = Math.abs(L.x - x) + Math.abs(L.z - z) === 1;
  const interest = boulderAt(x, z) >= 0 || 'tsRCMKLQDGAg*XYVh=oUpnTF'.includes(ch(x, z)) && solid(x, z);
  if (adj && interest && !moving) {
    const d = (Object.keys(DV) as Dir[]).find(q => L.x + DV[q][0] === x && L.z + DV[q][1] === z)!;
    facing = d; L.c.dir = Math.atan2(DV[d][0], DV[d][1]); caveAct(); return;
  }
  if (!interest && !blockedFor(L.c.id, x, z)) {
    path = route(x, z, true) || [];
    // somewhere only another figure can reach (behind water, embers or tall grass): that one goes
    if (!path.length) for (const m of party.slice(1)) { if (blockedFor(m.c.id, x, z)) continue; const r = route(x, z, true, m); if (r && r.length) { switchLeader(m.c.id); path = r; return; } }
    return;
  }
  const only: Record<string, string> = { b: 'brasa', w: 'marea' }, who = only[ch(x, z)];
  if (!interest && who) { if (has(who)) { switchLeader(who); path = route(x, z, true) || []; } return; }
  if (!interest) return;
  // walk next to it, turn to it, and use it (boulders only get faced)
  let best: [number, number][] | null = null;
  for (const d of Object.values(DV)) {
    const ax = x - d[0], az = z - d[1]; if (blockedFor(L.c.id, ax, az)) continue;
    const r = route(ax, az, false); if (r && (!best || r.length < best.length)) best = r;
  }
  if (!best) {
    for (const m of party.slice(1)) for (const d of Object.values(DV)) {
      const ax = x - d[0], az = z - d[1]; if (blockedFor(m.c.id, ax, az)) continue;
      const r = (m.x === ax && m.z === az) ? [] : route(ax, az, false, m); if (r && (!best || r.length < best.length)) { best = r; (best as any).who = m.c.id; }
    }
    if (!best) { say('No hay camino hasta ahí'); return; }
    const who = (best as any).who; switchLeader(who);
  }
  path = best; pendingAct = [x, z];
  if (boulderAt(x, z) >= 0 && leader().c.id !== 'arci') (pendingAct as any).faceOnly = true;
}
/** Breadth-first route over free cells; stairs only as the destination (so walking never changes floor by accident). */
function route(tx: number, tz: number, stairsOk: boolean, L = leader()): [number, number][] | null {
  const start = K(L.x, L.z), prev = new Map<string, string | null>([[start, null]]), q: [number, number][] = [[L.x, L.z]];
  while (q.length) {
    const [x, z] = q.shift()!;
    if (x === tx && z === tz) { const out: [number, number][] = []; let k: string | null = K(x, z); while (k && k !== start) { const [a, b] = k.split(',').map(Number); out.unshift([a, b]); k = prev.get(k)!; } return out; }
    for (const [dx, dz] of Object.values(DV)) {
      const nx = x + dx, nz = z + dz, nk = K(nx, nz);
      if (prev.has(nk) || blockedFor(L.c.id, nx, nz)) continue;
      const c = ch(nx, nz); if ((c === 'S' || c === '>') && !(stairsOk && nx === tx && nz === tz)) continue;
      prev.set(nk, K(x, z)); q.push([nx, nz]);
    }
  }
  return null;
}

/* ---------- arriving on a cell ---------- */
function arrived() {
  const L = leader(), c = ch(L.x, L.z);
  if (zone === 'cueva' && fi === 2 && L.z <= 4 && !S.flags.lavaCruzada) { S.flags.lavaCruzada = true; say('¡Cruzaste el río de lava!'); sfx('solve'); emit('changed'); }
  if (c === 'P' && !plateHint && boulderAt(L.x, L.z) < 0) { plateHint = true; say('Clic… la reja se levanta. Pero baja apenas te alejas: algo pesado tendría que quedarse encima.'); }
  if (c === '>') { path = []; held = null; goFloor(fi + 1, 'down'); return; }
  if (c === 'S') { path = []; held = null; if (fi === 0) exitZone(); else goFloor(fi - 1, 'up'); return; }
}

/* ---------- every frame ---------- */
function spawnEmber(x: number, z: number, up = 1) {
  if (emberList.length >= EMB) return;
  emberList.push({ x, y: 0, z, vy: (0.5 + Math.random() * 0.7) * up, vx: (Math.random() - 0.5) * 0.25, life: 1.2 + Math.random() * 1.4, s: 0.04 + Math.random() * 0.04 });
}
let emberAcc = 0, lastLabel = '';
export function tickCave(dt: number, T: number) {
  if (!active || !view || !party.length) return;
  clock += dt; bumpT -= dt; hintT -= dt;
  const st = F(), L = leader();
  tickBattle(dt);
  const fight = battleActive();
  // walking
  if (moving && !fight) {
    stepT += dt;
    const k = Math.min(1, stepT / STEP);
    for (const m of party) m.c.root.position.copy(world(m.fx, m.fz)).lerp(world(m.x, m.z), k);
    if (k >= 1) { moving = false; for (const m of party) { m.fx = m.x; m.fz = m.z; } arrived(); }
  }
  if (busyT > 0) { busyT -= dt; if (busyT <= 0) { setFigureAnim(L.c, 'idle'); const f = onBusy; onBusy = null; f?.(); } }
  if (active && !moving && busyT <= 0 && !fading && !fight) {
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
  if (view.altar && zone === 'faro') { const lit = !!S.flags.faroEncendido; view.altar.orb.material = lit ? GLOW.orbOn : piecesHeld() >= 3 ? GLOW.crystal : GLOW.orb; view.altar.orb.rotation.y += dt * (lit ? 1.6 : 0); }
  else if (view.altar) { view.altar.orb.material = st.door ? GLOW.orbOn : GLOW.orb; view.altar.orb.position.y = 0.65 + (st.door ? 0.12 + Math.sin(clock * 2) * 0.05 : 0); view.altar.orb.rotation.y += dt * (st.door ? 1.2 : 0.2); }
  if (view.lamp) { const lit = !!S.flags.faroEncendido, f = lit ? 1.6 + Math.sin(clock * 3) * 0.2 : 0.4; (view.lamp.glass.material as THREE.MeshBasicMaterial).color.setRGB(2 * f, 1.8 * f, 1.1 * f); view.lamp.beam.visible = lit; view.lamp.beam.rotation.y = clock * 0.8; }
  if (view.shell && view.shell.visible && !ZS().caracola) { view.shell.position.y = 0.72 + Math.sin(clock * 1.6) * 0.04; view.shell.rotation.y = Math.sin(clock * 0.7) * 0.3; }
  if (view.golem) {
    const asleep = !S.flags.caracolaDebil && !S.flags.golemCalmo && !fight;
    golemGlow = S.flags.golemCalmo ? 1.8 : asleep ? 1.3 : 2.4;
    if (asleep) { golemFlick -= dt; const on = golemFlick > 0 && Math.sin(clock * 22) > -0.2; for (const e of view.golem.eyes) e.material = on ? GLOW.eyeOn : GLOW.eye; }
    view.golem.g.scale.y = 1.25 * (1 + Math.sin(clock * 0.9) * 0.012);
  }
  for (const c of view.crystals.values()) { const d = (c as any).decal as THREE.Mesh; if (d.visible) (d.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.2 * Math.sin(clock * 1.7 + c.position.x); }
  // lava and embers
  if (zone === 'cueva') lavaScroll(dt);
  emberAcc += dt * view.embers.length * 0.35;
  while (emberAcc > 1) { emberAcc--; const e = view.embers[Math.floor(Math.random() * view.embers.length)]; if (e && !st.fill.includes(K(Math.floor(e.x - OX), Math.floor(e.z - OZ)))) spawnEmber(e.x + (Math.random() - 0.5) * 0.8, e.z + (Math.random() - 0.5) * 0.8); }
  for (const p of emberList) { p.life -= dt; p.y += p.vy * dt; p.x += p.vx * dt + Math.sin(clock * 3 + p.s * 99) * dt * 0.1; }
  for (let i = emberList.length - 1; i >= 0; i--) if (emberList[i].life <= 0) emberList.splice(i, 1);
  emberList.forEach((p, k) => { const s = p.s * Math.min(1, p.life * 2); _m.makeScale(s, s, s).setPosition(p.x, p.y, p.z); embers.setMatrixAt(k, _m); });
  embers.count = emberList.length; embers.instanceMatrix.needsUpdate = true;
  // lights
  lights.forEach((l, k) => { const s = slots[k]; if (!s) return; const f = 1 + (Math.sin(clock * 13 + k * 2) * 0.12 + Math.sin(clock * 5.1 + k) * 0.1) * s.flick; l.intensity = s.base * s.on() * f; });
  if (partyLight) { const p = L.c.root.position; partyLight.position.set(p.x, 1.7, p.z + 0.4); partyLight.intensity = (zone === 'cueva' ? 5.5 : 4 * nightK) * (1 + Math.sin(clock * 9) * 0.04); }
  if (npcFig) {
    animFigure(npcFig, dt, T);
    const d = L.c.root.position.clone().sub(npcFig.root.position); if (d.length() < 3.5) npcFig.dir = Math.atan2(d.x, d.z);
    if (!S.flags.mareaHablo && npcFig.anim !== 'wave' && Math.sin(clock * 1.3) > 0.985) { setFigureAnim(npcFig, 'wave'); setTimeout(() => npcFig && setFigureAnim(npcFig, 'idle'), 1600); }
  }
  // bats, beetles, drips and the darkness that only opens around light
  const ls: Light[] = []; for (const f of glowSpots) { const l = f(); if (l) ls.push(l); }
  if (theme() === 'cueva') tickLife(dt, T, L.c.root.position, ls, L.c.id === 'brasa' && S.flags.corazon ? 7 : 4.6);
  else tickZoneLife(dt, T, L.c.root.position);
  // camera follows the leader
  const bf = battleFocus();
  const tgt = bf ? bf.clone().setY(0.4).add(new THREE.Vector3(0, 0, -0.3)) : L.c.root.position.clone().setY(0.4).add(new THREE.Vector3(0, 0, 0.9));   // the controls cover the bottom of the screen: keep the party a little above the middle
  const zWant = caveZoom() * (bf ? 1.6 : 1);
  if (Math.abs(camera.zoom - zWant) > 0.002) { camera.zoom += (zWant - camera.zoom) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
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
  if ((goal === 'cvSalon' || goal === 'cvEstatuas') && fi === 0 && ZS().f[0].door) return over(cellsOf(0, '>')[0], 0.9);
  if ((goal === 'cvRio' || goal === 'cvCruzar') && fi === 1 && st.door) return over(cellsOf(1, '>')[0], 0.9);
  if (goal === 'cvCaracola' && fi === 2 && S.flags.lavaCruzada) return over(cellsOf(2, 'Q')[0], 1.9);
  if (goal === 'cvSalir' && fi === 0) return over(cellsOf(0, 'S')[0], 0.9);
  const FG: Record<string, [number, string]> = { fEnredadera: [0, 'V'], fSemilla: [0, 'U'], fPuente: [1, '='], fMural: [1, 'L2'], fBrasas: [2, 'b'], fCorazon: [2, 'U'], fObsidiana: [2, 'o'] };
  if (FG[goal]) {
    const [gf, c] = FG[goal];
    if (gf > fi) return F().door ? over(cellsOf(fi, '>')[0], 0.9) : null;
    if (gf < fi) return over(cellsOf(fi, 'S')[0], 0.9);
    const cells = c === 'L2' ? Object.keys(FLOORS[fi].loreAt || {}).map(k => k.split(',').map(Number) as [number, number]) : cellsOf(fi, c);
    const p = c === 'o' ? cells.find(q => !st.mined.includes(K(...q))) : cells[0];
    return over(p, c === 'b' ? 0.9 : 1.6);
  }
  if (zone === 'faro') {
    const piece: Record<string, string> = { faroPasto: '5,8', faroVapor: '16,8', faroRoca: '21,12' };
    if (goal === 'faroMarea' && fi === 0) { const n = FLOORS[0].npc!; return over([n[0], n[1]], 2.2); }
    if (piece[goal] && fi === 0) { const [a, b] = piece[goal].split(',').map(Number); return over([a, b], 1.2); }
    if (goal === 'faroLuz') return fi === 0 ? over(cellsOf(0, '>')[0], 1.2) : over(cellsOf(1, 'A')[0], 1.6);
    if (goal === 'faroAgua' && fi === 0) return over(cellsOf(0, 'K')[0], 1.2);
    if (fi === 1 && goal !== 'faroLuz') return over(cellsOf(1, 'S')[0], 0.9);
    return null;
  }
  if (goal === 'volverCueva' || goal === 'golem') { if (battleActive()) return null; if (fi === 2) return over(cellsOf(2, 'g')[0], 2.6); if (F().door) return over(cellsOf(fi, '>')[0], 0.9); }
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
