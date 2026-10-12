import * as THREE from 'three';
import { portrait } from '../ui/portraits';
import CAVE from '../data/cave.json';
import FARO from '../data/faro.json';
import ARD from '../data/ardiente.json';
import SEL from '../data/selva.json';
import HONDO from '../data/hondo.json';
import { genDepth, CAMP, DOOR } from './depths';
import { scene, camera, controls, cancelFly, setCaveMode, inCaveLight, FR } from '../render/renderer';
import { refreshDay } from '../render/daynight';
import { buildFloor, lavaScroll, GLOW, DIR_ANGLE, CAVE_X, CAVE_Z, FARO_X, FARO_Z, ARD_X, ARD_Z, SEL_X, SEL_Z, HON_X, HON_Z, type FloorView, type Golem } from '../world/cavebuild';
import { zoneLifeStart, zoneLifeStop, tickZoneLife } from '../world/zonelife';
import { nightK } from '../render/daynight';
import { vbox } from '../assets/voxel';
import { makeFigure, animFigure, setFigureAnim, crew, select, type Crew } from './crew';
import { S, gain, type ResKey, type CaveSave, type CaveFloorSave } from './state';
import { smoke } from '../world/particles';
import { addStars } from './progress';
import { emit, on } from '../core/events';
import { puff } from '../world/particles';
import { sfx, setCaveAmbience } from '../audio/sfx';
import { STORY } from './fishing';
import type { CharId, ToolKey } from '../assets/characters';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT } from '../assets/voxel';
import { startBattle, battleActive, battleFocus, tickBattle, golemPose, salamanderPose, releaseFoe, type FoeId } from './battle';
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
  chestAt?: Record<string, { gives: Record<string, number>; stars: number; flag?: string }>;
  loreAt?: Record<string, string | { title: string; text: string }>;
  theme?: 'isla' | 'torre' | 'volcan' | 'cueva' | 'selva';
  chimneys?: Record<string, { name: string; flag: string; plug?: string; blocked?: string }>;
  nest?: string; madre?: string; madreRest?: string; guardian?: string; guardianRest?: string;
  npc?: number[]; marks?: Record<string, string>; deep?: number;
  pieces?: Record<string, { id: string; name: string; text: string }>;
}
const CAVE_FLOORS = CAVE.floors as FloorDef[], FARO_FLOORS = FARO.floors as FloorDef[], ARD_FLOORS = ARD.floors as unknown as FloorDef[], SEL_FLOORS = SEL.floors as unknown as FloorDef[];
/** The places explored cell by cell: the volcano cave and, from v0.18, the lighthouse island. */
export type ZoneId = 'cueva' | 'faro' | 'ardiente' | 'selva' | 'hondo';
let zone: ZoneId = 'cueva';
let FLOORS = CAVE_FLOORS;
const K = (x: number, z: number) => `${x},${z}`;
const cellsOf = (fi: number, c: string) => { const out: [number, number][] = []; FLOORS[fi].map.forEach((row, z) => [...row].forEach((ch, x) => { if (ch === c) out.push([x, z]); })); return out; };

/* stories: the cave texts, the tablets and the lighthouse */
Object.assign(STORY, CAVE.story, FARO.story, ARD.story, SEL.story, HONDO.story);
for (const f of FARO_FLOORS) for (const pc of Object.values(f.pieces || {})) STORY[pc.id] = { title: pc.name, text: pc.text };
STORY.fa_sign = { title: 'Un letrero', text: FARO_FLOORS[0].lore.replace(/ — .*$/, '') };
/** The three hidden relics, one behind a hollow wall on each floor (the cave collection). */
export const RELICS = CAVE_FLOORS.map(f => f.relic!).filter(Boolean);
for (const r of RELICS) STORY[`rel_${r.id}`] = { title: r.name, text: r.text };
/** The text of a tablet: the ones added later are placed by cell, the first ones go in map order. */
function loreKey(i: number, x: number, z: number) {
  const f = FLOORS[i], k = K(x, z);
  if (zone === 'ardiente') return `ar${i}_${x}_${z}`;
  if (zone === 'selva') return `sv${i}_${x}_${z}`;
  if (zone === 'hondo') return `ho${i}_${x}_${z}`;
  if (f.loreAt?.[k]) return `cv${i}_${x}_${z}`;
  return `cv${i}_${cellsOf(i, 'L').filter(([a, b]) => !f.loreAt?.[K(a, b)]).findIndex(([a, b]) => a === x && b === z)}`;
}
FLOORS.forEach((f, i) => {
  cellsOf(i, 'L').filter(([a, b]) => !f.loreAt?.[K(a, b)]).forEach((_, k) => {
    const text = k === 0 ? f.lore : f.lore2 || f.lore;
    const marea = text.includes('Marea');
    STORY[`cv${i}_${k}`] = { title: marea ? 'El grabado de Marea' : 'Tablilla de los Alfareros', text: text.replace(/ — .*$/, '') };
  });
  for (const [k, text] of Object.entries(f.loreAt || {})) { const [x, z] = k.split(',').map(Number); STORY[`cv${i}_${x}_${z}`] = { title: 'El mural de los cuatro', text: (text as string).replace(/ — .*$/, '') }; }
  if (f.upgrade) STORY[`up_${f.upgrade.id}`] = { title: f.upgrade.name, text: f.upgrade.text.replace(/\*\*/g, '') };
});
/* the burning island: its tablets (each with its own title) and its relics */
ARD_FLOORS.forEach((f, i) => { for (const [k, t] of Object.entries(f.loreAt || {})) { const [x, z] = k.split(',').map(Number); const o = t as { title: string; text: string }; STORY[`ar${i}_${x}_${z}`] = { title: o.title, text: o.text }; } });
SEL_FLOORS.forEach((f, i) => { for (const [k, t] of Object.entries(f.loreAt || {})) { const [x, z] = k.split(',').map(Number); const o = t as { title: string; text: string }; STORY[`sv${i}_${x}_${z}`] = { title: o.title, text: o.text }; } });
export const SEL_RELICS = SEL_FLOORS.map(f => f.relic!).filter(Boolean);
for (const r of SEL_RELICS) STORY[`rel_${r.id}`] = { title: r.name, text: r.text };
export const ARD_RELICS = ARD_FLOORS.map(f => f.relic!).filter(Boolean);
for (const r of ARD_RELICS) STORY[`rel_${r.id}`] = { title: r.name, text: r.text };
/* what each figure can do out here, and how they are called */
const NAME: Record<string, string> = { arci: 'Arci', musgo: 'Musgo', brasa: 'Brasa', marea: 'Marea' };
const SKILL: Record<string, string> = { arci: 'empuja rocas y tiende puentes de tablas', musgo: 'aparta enredaderas y corta la hierba alta', brasa: 'camina sobre las brasas y enciende el fuego', marea: 'camina por el agua baja y enfría la lava' };
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
export function ardSave(): CaveSave {
  const c = S.ardiente || (S.ardiente = { hits: 0, max: -1, f: [], caracola: false, chests: 0, relics: [] });
  ARD_FLOORS.forEach((_, i) => { if (!c.f[i]) c.f[i] = freshFloor(i, ARD_FLOORS); });
  if (!c.relics) c.relics = [];
  return c;
}
export function selSave(): CaveSave {
  const c = S.selva || (S.selva = { hits: 0, max: -1, f: [], caracola: false, chests: 0, relics: [] });
  SEL_FLOORS.forEach((_, i) => { if (!c.f[i]) c.f[i] = freshFloor(i, SEL_FLOORS); });
  if (!c.relics) c.relics = [];
  return c;
}
/** The Depths: the floors of this visit are generated as they are reached (and forgotten on the next visit). */
const HON_FLOORS: FloorDef[] = [];
export function hondoSave(): CaveSave {
  const c = S.hondo || (S.hondo = { hits: 0, max: -1, f: [], caracola: false, chests: 0, relics: [], seed: 1 });
  return c;
}
function newVisit() { const h = hondoSave(); h.seed = 1 + Math.floor(Math.random() * 1e9); h.f = []; HON_FLOORS.length = 0; }
function ensureFloor(n: number) {
  const h = hondoSave();
  if (!HON_FLOORS[n]) {
    const f = genDepth(h.seed || 1, n, !!S.flags.campamento) as unknown as FloorDef; HON_FLOORS[n] = f;
    for (const [k, t] of Object.entries(f.loreAt || {})) { const [x, z] = k.split(',').map(Number); const o = t as { title: string; text: string }; STORY[`ho${n}_${x}_${z}`] = { title: o.title, text: o.text }; }
  }
  if (!h.f[n]) h.f[n] = freshFloor(n, HON_FLOORS);
}
const floorsOf = (z: ZoneId) => z === 'cueva' ? CAVE_FLOORS : z === 'faro' ? FARO_FLOORS : z === 'ardiente' ? ARD_FLOORS : z === 'selva' ? SEL_FLOORS : HON_FLOORS;
const originOf = (z: ZoneId): [number, number] => z === 'cueva' ? [CAVE_X, CAVE_Z] : z === 'faro' ? [FARO_X, FARO_Z] : z === 'ardiente' ? [ARD_X, ARD_Z] : z === 'selva' ? [SEL_X, SEL_Z] : [HON_X, HON_Z];
const ZS = () => zone === 'cueva' ? caveSave() : zone === 'faro' ? faroSave() : zone === 'ardiente' ? ardSave() : zone === 'selva' ? selSave() : hondoSave();
let OX = CAVE_X, OZ = CAVE_Z;
const theme = () => FLOORS[fi]?.theme || 'cueva';

/* ---------- runtime ---------- */
interface Member { c: Crew; x: number; z: number; fx: number; fz: number; px?: number; pz?: number }
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
const exitTo: Record<ZoneId, () => THREE.Vector3 | null> = { cueva: () => null, faro: () => null, ardiente: () => null, selva: () => null, hondo: () => exitTo.cueva() };
/** Where the camera goes back to on the island (the cave mouth and the pier set this). */
export function setExitPoint(f: () => THREE.Vector3 | null, z: ZoneId = 'cueva') { exitTo[z] = f; }

export const enterCave = (immediate = false) => enterZone('cueva', immediate);
export const exitCave = (immediate = false) => exitZone(immediate);
export const zoneId = () => active ? zone : null;
export function enterZone(z: ZoneId, immediate = false) {
  if (active) return;
  ui(); caveSave(); faroSave(); ardSave(); selSave();
  fade(() => {
    zone = z; FLOORS = floorsOf(z); [OX, OZ] = originOf(z);
    if (z === 'hondo') { newVisit(); ensureFloor(0); }
    active = true; cancelFly(); select(null);
    before = { target: controls.target.clone(), pos: camera.position.clone(), zoom: camera.zoom };
    controls.enabled = false;

    document.body.classList.add('incave');
    $('caveUI').hidden = false; $('bottom').hidden = true;
    if (z !== 'faro') for (let k = 0; k < POOL; k++) { const l = new THREE.PointLight('#ffb070', 0, 6, 1.6); scene.add(l); lights.push(l); }
    partyLight = new THREE.PointLight('#ffd8a0', 5, 7.5, 1.4); scene.add(partyLight);
    scene.add(embers);
    const ids: CharId[] = ['arci', ...(['musgo', 'brasa', 'marea'] as CharId[]).filter(id => crew.some(c => c.id === id))];
    party = ids.map(id => { const c = makeFigure(id); c.lamp = 0.6; c.ring.visible = false; scene.add(c.root); return { c, x: 0, z: 0, fx: 0, fz: 0 }; });
    loadFloor(0, 'down'); refreshWho();
    if (party.length > 1 && !S.flags.cvWhoHint) { S.flags.cvWhoHint = true; setTimeout(() => say('Toca una cara (a la derecha) para elegir quién va adelante: cada figura sabe hacer algo distinto.'), 4200); }
    if (z === 'cueva' && !S.flags.cuevaEntro) { S.flags.cuevaEntro = true; emit('changed'); }
    if (z === 'faro' && !S.flags.faroVisitado) { S.flags.faroVisitado = true; emit('changed'); }
    if (z === 'ardiente' && !S.flags.ardVisitado) { S.flags.ardVisitado = true; emit('changed'); }
    if (z === 'selva' && !S.flags.selvaVisitada) { S.flags.selvaVisitada = true; emit('changed'); }
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
    if (inCaveLight()) { setCaveMode(false); refreshDay(); }
    setCaveAmbience(false);
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
function loadFloor(n: number, how: 'down' | 'up' | 'reset' | 'rope' | 'back', spawn?: [number, number, Dir]) {
  unloadFloor();
  if (zone === 'hondo') ensureFloor(n);
  fi = n; map = FLOORS[n].map;
  seenCells.clear(); memory = []; memAt = '';
  const st = F();
  view = buildFloor(map, st.dirs, FLOORS[n].decor, zone === 'ardiente' ? n + 3 : zone === 'selva' ? n + 5 : n, FLOORS[n].theme || 'cueva', OX, OZ, zone === 'hondo' ? { deep: n, marks: FLOORS[n].marks } : {});
  scene.add(view.root);
  // underground floors use the cave's light; the outdoor ones the day's
  if (theme() === 'cueva') { if (!inCaveLight()) setCaveMode(true); }
  else if (inCaveLight()) { setCaveMode(false); refreshDay(); }
  geyserWas.clear(); rumbleT = 30 + Math.random() * 20;
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
  for (const [k, kind] of Object.entries(st.built)) { const c = view.chasms.get(k); if (c) (kind === 'raices' ? c.root : c.plank).visible = true; if (kind === 'frio') { const [a, b] = k.split(',').map(Number); addSlab(a, b); } }
  for (const k of st.lit) { const c = view.chimneys.get(k); if (c) { c.flame.visible = true; c.glow.material = GLOW.flame; } }
  for (const [k, g] of view.geysers) if (st.fill.includes(k)) g.col.visible = false;
  for (const [k, b] of view.buds) setBud(b, st.built[k]);
  for (const [k, p] of view.plants) if (st.built[k] === 'susto') hidePlant(p, true);
  if (view.heart && S.flags.ceiboDespierto) view.heart.orb.scale.setScalar(1.5);
  if (view.forge) { view.forge.fire.visible = !!S.flags.forjaViva; }
  for (const [k, f] of view.foes) {
    if (FLOORS[n].guardian === k) { if (S.flags.raizCalma) placeAside(f, FLOORS[n].guardianRest); golemPose(f, S.flags.raizCalma ? 'calm' : S.flags.raizHola ? 'awake' : 'sleep'); }
    else if (FLOORS[n].madre === k) { salamanderPose(f, !S.flags.madreCalma && !!S.flags.madreHola); if (S.flags.madreCalma) placeMadre(f); }
    else salamanderPose(f, zone === 'hondo' ? st.built?.[k] !== 'calma' : !nestCalm());
  }
  // the golem's rock, once moved, stays to one side; the marks of the sealed door keep their light
  if (view.bigRock && S.flags.hondoAbierto) rockAside(view.bigRock);
  for (const [k, m] of view.marks) if (st.built[k] === 'mano' || S.flags.puertaAlfareros) markOn(m);
  if (view.alfDoor && S.flags.puertaAlfareros) doorLit(view.alfDoor);
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
  if (spawn) { at = [spawn[0], spawn[1]]; facing = spawn[2]; }
  else if (how === 'up') { const g = cellsOf(n, '>')[0]; at = [g[0], g[1] + 1]; facing = 'S'; }
  else if (how === 'rope' && cellsOf(n, 'u')[0]) { at = freeBeside(n, cellsOf(n, 'u')[0]); facing = 'N'; }
  else { at = cellsOf(n, 'S')[0]; facing = 'N'; }
  for (const m of party) { m.x = m.fx = at[0]; m.z = m.fz = at[1]; m.c.root.position.copy(world(at[0], at[1])); m.c.dir = Math.atan2(DV[facing][0], DV[facing][1]); m.c.root.rotation.y = m.c.dir; setFigureAnim(m.c, 'idle'); }
  moving = false; path = []; pendingAct = null; busyT = 0;
  if (n > ZS().max) { ZS().max = n; emit('changed'); }
  setupLights();
  if (theme() === 'cueva') { lifeStart(map, n, (x, z) => !solid(x, z), OX, OZ); setCaveAmbience(true, (zone === 'cueva' && n === 2) || zone === 'ardiente'); }
  else { setCaveAmbience(false); zoneLifeStart(map, theme() as 'isla' | 'torre' | 'volcan' | 'selva', OX, OZ, (x, z) => !blockedFor('arci', x, z), view.springs, view.crater); }
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
    if (c === 'l') glowSpots.push(() => cooled(k2) ? null : { x: w2.x, z: w2.z, r: 1.4 });
    if (c === 'Z') glowSpots.push(() => ({ x: w2.x, z: w2.z, r: S.flags.forjaViva ? 3.4 : 1.2 }));
    if (c === 'm' || c === 'N') glowSpots.push(() => ({ x: w2.x, z: w2.z, r: c === 'm' ? 2.6 : 1.5 }));
    if (c === 'H') glowSpots.push(() => ({ x: w2.x, z: w2.z, r: S.flags.ceiboDespierto ? 3.6 : 2.2 }));
    if (c === 'W') glowSpots.push(() => ({ x: w2.x, z: w2.z, r: 1.8 }));
    if (c === 'E') glowSpots.push(() => F().lit.includes(k2) ? { x: w2.x, z: w2.z, r: 2.2 } : null);
    if (c === 'a') glowSpots.push(() => F().mined.includes(k2) ? null : { x: w2.x, z: w2.z, r: 0.8 });
    if (c === 'u') glowSpots.push(() => ({ x: w2.x, z: w2.z, r: 2.2 }));
    if (c === 'k') glowSpots.push(() => ({ x: w2.x, z: w2.z, r: F().built?.[k2] === 'mano' || S.flags.puertaAlfareros ? 1.8 : 0.9 }));
    if (c === '{') glowSpots.push(() => ({ x: w2.x, z: w2.z + 0.6, r: S.flags.puertaAlfareros ? 4 : 2 }));
    if (c === 'J') glowSpots.push(() => ({ x: w2.x + 0.3, z: w2.z, r: S.flags.hondoAbierto ? 1.8 : 1.3 }));
    if (c === 'K' && zone === 'hondo') glowSpots.push(() => F().opened.includes(k2) ? null : { x: w2.x, z: w2.z, r: 0.9 });
  }));
  for (const [x, z] of FLOORS[n].decor.mushrooms) { const w2 = world(x, z); glowSpots.push(() => ({ x: w2.x, z: w2.z, r: 1.1 })); }
  const p = world(at[0], at[1]);
  controls.target.copy(p); camera.zoom = caveZoom(); camera.updateProjectionMatrix(); camera.position.copy(p).add(OFF);
  $('cvName').textContent = `${n + 1}. ${FLOORS[n].name}`;
  if (zone === 'hondo') $('cvName').textContent = `Piso ${n + 1} · ${FLOORS[n].name}`;
  if (how !== 'reset') { sign(zone === 'hondo' ? `Piso ${n + 1}\n${FLOORS[n].name}` : FLOORS[n].name); if (FLOORS[n].intro && !S.flags[`cvIntro${n}`]) { S.flags[`cvIntro${n}`] = true; setTimeout(() => emit('toast', FLOORS[n].intro), 900); } }
  if (zone === 'hondo') {
    if (how === 'down' && n > 0) S.stats.pisos = (S.stats.pisos || 0) + 1;
    if (n === CAMP && !S.flags.campamento) { S.flags.campamento = true; setTimeout(() => emit('story', 'campamento'), 1200); emit('changed'); }
    if (n === DOOR && !S.flags.puertaVista) { S.flags.puertaVista = true; setTimeout(() => emit('story', 'puertaHola'), 1200); emit('changed'); }
  }
}
/** A free cell next to (x, z) to stand on (the rope, the golem's stairs). */
function freeBeside(n: number, p: [number, number]): [number, number] {
  const m = FLOORS[n].map, ok = (x: number, z: number) => '.,'.includes((m[z] && m[z][x]) || '#');
  for (const [a, b] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (ok(p[0] + a, p[1] + b)) return [p[0] + a, p[1] + b];
  return cellsOf(n, 'S')[0];
}
/** Changes zone without going out to the island (the cave and the Depths are joined by the golem's stairs). */
function switchTo(z: ZoneId, n: number, how: 'down' | 'up' | 'rope' | 'back', spawn?: [number, number, Dir]) {
  fade(() => {
    if (z !== zone) { unloadFloor(); zone = z; FLOORS = floorsOf(z); [OX, OZ] = originOf(z); }
    loadFloor(n, how, spawn); emit('caveChanged'); emit('changed');
  });
}
function toDepths() {
  path = []; held = null;
  fade(() => {
    unloadFloor(); zone = 'hondo'; FLOORS = HON_FLOORS; [OX, OZ] = [HON_X, HON_Z];
    newVisit(); ensureFloor(0); loadFloor(0, 'down');
    if (!S.flags.hondoVisitado) { S.flags.hondoVisitado = true; setTimeout(() => emit('story', 'hondoEntrada'), 1000); }
    emit('caveChanged'); emit('changed');
  });
}
/* the golem's rock rolled aside, the lit hands of the sealed door */
function rockAside(r: THREE.Group) { r.position.set(-0.78, -0.05, -0.55); r.rotation.set(0, 0.5, 0.25); r.scale.setScalar(0.92); }
function markOn(m: { glow: THREE.Mesh; who: string }) { const mat = m.glow.material as THREE.MeshBasicMaterial; mat.color.set(({ arci: '#e0a070', musgo: '#8ad96b', brasa: '#ff8a40', marea: '#6ab8f0' } as Record<string, string>)[m.who] || '#ffffff').multiplyScalar(2.2); }
function doorLit(d: NonNullable<FloorView['alfDoor']>) { const cols = ['#e0a070', '#8ad96b', '#ff8a40', '#6ab8f0']; d.hands.forEach((h, i) => (h.material as THREE.MeshBasicMaterial).color.set(cols[i]).multiplyScalar(2.2)); (d.fifth.material as THREE.MeshBasicMaterial).color.setRGB(1.6, 1.5, 1.2); (d.seam.material as THREE.MeshBasicMaterial).color.setRGB(1.2, 1.1, 0.8); }
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
  for (const [x, z] of cellsOf(fi, 'E')) slots.push({ pos: world(x, z, 2.6), color: '#ff9a40', base: 6, dist: 6, flick: 0.6, on: () => st.lit.includes(K(x, z)) ? 1 : 0 });
  for (const [x, z] of cellsOf(fi, 'Z')) slots.push({ pos: world(x, z + 0.6, 1), color: '#ffa050', base: 8, dist: 7, flick: 0.7, on: () => S.flags.forjaViva ? 1 : 0.25 });
  for (const [x, z] of cellsOf(fi, 'C')) slots.push({ pos: world(x, z, 0.9), color: '#70d8ff', base: 3.5, dist: 4.5, flick: 0.1, on: () => st.mined.includes(K(x, z)) ? 0.15 : 1 });
  for (const [x, z] of cellsOf(fi, 'S')) slots.push({ pos: world(x, z, 2.2), color: '#fff0d0', base: 3, dist: 5, flick: 0, on: () => 1 });
  for (const [x, z] of cellsOf(fi, '{')) slots.unshift({ pos: world(x, z + 1.5, 2.4), color: '#c8d8ff', base: 6, dist: 9, flick: 0.1, on: () => S.flags.puertaAlfareros ? 1.6 : 0.8 });
  for (const [x, z] of cellsOf(fi, 'u')) slots.push({ pos: world(x, z, 1.6), color: '#fff0c8', base: 4, dist: 5, flick: 0.1, on: () => 1 });
  for (const [x, z] of cellsOf(fi, '>')) if (zone === 'hondo') slots.push({ pos: world(x, z + 0.4, 1.4), color: '#a8c0ff', base: 3, dist: 4.5, flick: 0.2, on: () => 1 });
  if (zone === 'hondo') slots.sort((a, b) => (a.color === '#70d8ff' ? 1 : 0) - (b.color === '#70d8ff' ? 1 : 0));   // the stairs and the rope before the crystals
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
const cooled = (k: string) => F().fill.includes(k) || F().built?.[k] === 'frio';
/* geysers blow for a moment every few seconds, each one a little after the one before */
const G_PERIOD = 3.2, G_ON = 1.15;
let waitGeyser = false, rumbleT = 40;
const geyserWas = new Map<string, boolean>();
function geyserOn(x: number, z: number) {
  const c = ch(x, z); if (c === 'j') return !F().fill.includes(K(x, z));
  if (c !== 'q') return false;
  return ((clock + x * 0.55 + z * 0.3) % G_PERIOD) < G_ON;
}
/** The salamanders of the nest sleep for a while after a fight, then wake up again. */
const NEST_SLEEP = 600;
const nestCalm = () => { const n = ZS().nestAt; return n !== undefined && S.time - n < NEST_SLEEP; };
function setBud(b: { bud: THREE.Group; wet: THREE.Group; pad: THREE.Group }, state?: string) { b.bud.visible = !state; b.wet.visible = state === 'regada'; b.pad.visible = state === 'flor'; }
function hidePlant(p: { g: THREE.Group; head: THREE.Group; jaw: THREE.Group }, hide: boolean) { p.head.position.y = hide ? 0.12 : 0.62; p.jaw.rotation.x = hide ? 0 : -0.7; p.head.scale.setScalar(hide ? 0.7 : 1); }
/** A guardian that has been calmed moves to its resting cell, out of the way. */
function placeAside(f: Golem, rest?: string) { if (!rest) return; const [a, b] = rest.split(',').map(Number); f.g.position.copy(local(a, b)); }
/** The mother, once calm, lies down beside the forge (out of the way). */
function placeMadre(f: Golem) { const r = FLOORS[fi].madreRest; if (!r) return; const [a, b] = r.split(',').map(Number); f.g.parent!.position.copy(local(a, b)); f.g.rotation.y = -0.6; }
function solid(x: number, z: number) {
  if (boulderAt(x, z) >= 0) return true;
  const c = ch(x, z), st = F(), k = K(x, z);
  if (S.flags.madreCalma && FLOORS[fi].madreRest === k) return true;
  if (S.flags.raizCalma && FLOORS[fi].guardianRest === k) return true;
  switch (c) {
    case '.': case ',': case 'S': case '>': case 'P': case 'B': case ':': case 'd': return false;   // under a boulder there is floor
    case 'w': return false;                                     // water: see blockedFor
    case 'n': return !S.flags.mareaUnida;
    case 'T': return true;
    case 'p': return !st.opened.includes(k);
    case 'R': case 'X': case 'V': return !st.broken.includes(k);
    case 'b': return false;                                     // burning ground: see blockedFor
    case 'h': return !(st.cut && k in st.cut);
    case '=': return !(st.built && st.built[k]);
    case 'O': case '~': return !st.fill.includes(k);
    case 'l': return !cooled(k);
    case 'q': return false;                                     // a geyser: see tryStep (it blows now and then)
    case 'j': return !st.fill.includes(k);
    case 'm': return !S.flags.madreCalma;
    case 'W': return !S.flags.raizCalma;
    case 'f': return false;                                     // a bud in the river: see blockedFor
    case 'x': return st.built?.[k] !== 'susto';
    case 'D': return !(st.door && doorK > 0.7);
    case 'G': return gateK < 0.7;
    case 'J': return !S.flags.hondoAbierto;                      // the golem's rock; behind it, stairs
    default: return true;
  }
}

/** Somewhere only one figure can go: the burning ground is for Brasa alone. */
function blockedFor(id: string, x: number, z: number) {
  if (id === 'musgo' && ch(x, z) === 'h') return false;                  // Musgo walks into the tall grass and cuts it
  if (solid(x, z)) return true;
  const c = ch(x, z);
  if (c === 'w') return id !== 'marea' && !F().fill.includes(K(x, z));   // only Marea walks in the water
  if (c === 'f') return id !== 'marea' && F().built?.[K(x, z)] !== 'flor';   // a flower pad in bloom carries anyone
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
  if (c === 'l' && !cooled(k)) return 'marea';
  if (c === 'E' && !st.lit.includes(k)) { const d = FLOORS[fi].chimneys?.[k]; return d?.plug && !st.fill.includes(d.plug) ? null : 'brasa'; }
  if (c === 'Z' && S.flags.madreCalma && !S.flags.forjaViva) return 'brasa';
  if (c === 'f') { const b = st.built?.[k]; return b === 'flor' ? null : b === 'regada' ? 'musgo' : 'marea'; }
  if (c === 'x' && st.built?.[k] !== 'susto') return 'brasa';
  if (c === 'H' && S.flags.raizCalma && !S.flags.ceiboDespierto) return 'musgo';
  if (c === 'k' && st.built?.[k] !== 'mano' && !S.flags.puertaAlfareros) return FLOORS[fi].marks?.[k] || null;
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
    if (id !== 'musgo') { bump(); hint(has('musgo') ? (theme() === 'volcan' ? 'Matorral seco y espinoso: Musgo lo puede cortar (toca su cara).' : 'Hierba muy tupida: Musgo la puede cortar (toca su cara arriba).') : 'Hierba muy tupida.'); return false; }
    cutFern(nx, nz);
  } else if (c === 'q' && geyserOn(nx, nz)) {
    bump(); waitGeyser = true; hint('¡El géiser está soplando! Espera a que pare y pasa rápido.'); return false;
  } else if (blockedFor(id, nx, nz)) {
    bump();
    if (c === 'l') hint(has('marea') ? 'Lava que corre: Marea la puede enfriar con agua (toca su cara).' : 'Lava que corre. Hace falta agua para enfriarla.');
    if (c === '~') hint(id === 'marea' ? 'Esta lava es muy honda para enfriarla: hace falta una roca que la tape.' : 'Lava honda. Una roca grande la taparía.');
    if (c === 'j') hint('Un géiser que nunca para. Una roca lo podría tapar.');
    if (c === 'f') hint('Un capullo gigante en el río. Marea lo puede regar y Musgo hacerlo florecer: así se cruza.');
    if (c === 'x') hint(has('brasa') ? 'Una planta carnívora: muerde todo lo que se acerca. Brasa la puede asustar con una chispa (toca su cara).' : 'Una planta carnívora. Muerde.');
    if (c === 'b') hint(has('brasa') ? (theme() === 'isla' ? 'Vapor hirviendo: solo Brasa camina entre las fumarolas (toca su cara).' : 'El suelo quema: solo Brasa camina sobre las brasas (toca su cara arriba).') : 'El suelo quema.');
    if (c === 'w') hint(has('marea') ? 'Agua: solo Marea camina por ahí (toca su cara).' : 'Agua. Nadie del equipo sabe moverse en el agua… todavía.');
    return false;
  }
  // the others follow in line, but only where they can stand; if not, they wait
  const old = party.map(m => [m.x, m.z]);
  for (const m of party) { m.px = m.x; m.pz = m.z; }
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
  if (theme() === 'volcan') {
    // dry scrub on the ash: charcoal, chips of obsidian, now and then a seed that survived the fire
    puff(w.x, 0.4, w.z, '#5a4a3a', 8, 1.4, 1.1, 0);
    if (r < 0.05) { addStars(1, 'Una salamandra dorada escondida en el matorral'); sfx('coin'); }
    else if (r < 0.4) gain('carbon', 1, at);
    else if (r < 0.55) gain('obsidiana', 1, at);
    else if (r < 0.68) gain('semilla', 1, at);
    else if (r < 0.8) gain('mineral', 1, at);
    emit('caveChanged'); return;
  }
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
  if (boulderAt(tx, tz) >= 0 || c === 'S' || c === '>' || c === 'f' || c === 'x') return false;
  const hole = (c === 'O' || c === '~' || c === 'w' || c === 'j' || (c === 'l' && !cooled(k))) && !st.fill.includes(k);
  if (!hole && solid(tx, tz)) return false;
  if (party.slice(1).some(m => m.x === tx && m.z === tz)) return false;
  const mesh = boulderMeshes[bi]!;
  st.b[bi] = hole ? null : [tx, tz];
  if (hole) { st.fill.push(k); boulderMeshes[bi] = null; }
  const from = mesh.position.clone(), to = local(tx, tz);
  sfx('dig', 0.9);
  if (c === 'P' && !hole && zone === 'selva' && !S.flags.temploAbierto) { S.flags.temploAbierto = true; setTimeout(() => { sfx('solve'); say('La roca hunde la losa: clic. La reja del templo sube y se queda arriba.'); }, 300); emit('changed'); }
  const w = world(bx, bz); puff(w.x - dx * 0.4, 0.1, w.z - dz * 0.4, '#8a7a6a', 6, 0.9, 0.9, 0);
  slides.push({ o: mesh, from, to, t: 0, d: STEP * 1.05, spin: dx ? -dx : dz, done: hole ? () => fall(mesh, tx, tz, c) : undefined });
  emit('caveChanged');
  return true;
}
function fall(mesh: THREE.Group, x: number, z: number, c: string) {
  const w = world(x, z);
  if (c === 'w') { sfx('splash'); puff(w.x, 0.1, w.z, '#e8f6ff', 16, 2.2, 1.4, -0.1); }
  else if (c === 'j') {
    sfx('steam'); sfx('fall', 0.6); puff(w.x, 0.3, w.z, '#f4f6f8', 24, 3, 1.6, 0);
    const g = view?.geysers.get(K(x, z)); if (g) g.col.visible = false;
    setTimeout(() => say('La roca tapa el géiser. El vapor se queda quieto… y la chimenea de al lado empieza a silbar.'), 500);
    if (!S.flags.geiserTapado) { S.flags.geiserTapado = true; emit('changed'); }
  }
  else if (c === '~' || c === 'l') {
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
  } else if (c === 'j') {
    // the boulder sits in the geyser's mouth: a stone cap ringed with white crust
    vbox(parts, 0, 0.08, 0, 0.62, 0.18, 0.62, '#6e6056'); vbox(parts, 0.05, 0.19, -0.03, 0.4, 0.06, 0.4, '#7a6a5c');
    const m = new THREE.Mesh(mergeGeometries(parts), MAT.stone); m.receiveShadow = true; g.add(m);
  } else if (c === 'l') {
    // cooled lava: a black crust with a few cracks still warm
    vbox(parts, 0, -0.05, 0, 1, 0.1, 1, '#2c2624'); vbox(parts, 0.12, 0.005, -0.1, 0.46, 0.02, 0.4, '#38302c'); vbox(parts, -0.22, 0.005, 0.2, 0.3, 0.02, 0.26, '#342c28');
    const m = new THREE.Mesh(mergeGeometries(parts), MAT.stone); m.receiveShadow = true; g.add(m);
    for (const [a, b, w, d] of [[-0.1, 0.05, 0.4, 0.03], [0.2, -0.2, 0.03, 0.3]]) { const cr = new THREE.Mesh(new THREE.BoxGeometry(w, 0.01, d), GLOW.ember); cr.position.set(a, 0.02, b); g.add(cr); }
    view.flows.get(K(x, z))?.removeFromParent();
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
    case 'D': case 'G': case 'g': case '*': case 'q': case 'j': return 'Mirar';
    case 'l': return cooled(k) ? '' : 'Enfriar';
    case 'E': return st.lit.includes(k) ? 'Mirar' : 'Encender';
    case 'Z': return S.flags.forjaViva || !S.flags.madreCalma ? 'Mirar' : 'Avivar';
    case 'N': return (zone === 'hondo' ? st.built?.[k] === 'calma' : nestCalm()) ? 'Mirar' : 'Acercarse';
    case 'm': return S.flags.madreCalma ? '' : S.flags.madreHola ? 'Calmar' : 'Mirar';
    case 'W': return S.flags.raizCalma ? '' : S.flags.raizHola ? 'Calmar' : 'Mirar';
    case 'f': { const b = st.built?.[k]; return b === 'flor' ? '' : b === 'regada' ? 'Florecer' : 'Regar'; }
    case 'x': return st.built?.[k] === 'susto' ? '' : 'Asustar';
    case 'H': return S.flags.ceiboDespierto || !S.flags.raizCalma ? 'Mirar' : 'Cantar';
    case 'a': return st.mined.includes(k) ? 'Mirar' : 'Picar';
    case 'u': return fi === 0 ? 'Bajar' : 'Subir';
    case 'J': return S.flags.hondoAbierto ? '' : 'Mirar';
    case 'k': return st.built?.[k] === 'mano' || S.flags.puertaAlfareros ? 'Mirar' : 'Poner la mano';
    case '{': return 'Mirar';
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
        if (flag && !S.flags[flag]) { S.flags[flag] = true; if (flag === 'islaConchas') setTimeout(() => emit('story', 'conchas'), 900); if (flag === 'termas') setTimeout(() => say('Un cofre en medio de las termas: solo Marea podía llegar nadando.'), 900); }
        emit('changed'); emit('caveChanged');
      });
      return;
    }
    case 'L': {
      if (!st.read.includes(k)) { st.read.push(k); emit('caveChanged'); }
      if (FLOORS[fi].loreAt?.[k] && !S.flags.mural) { S.flags.mural = true; emit('changed'); }
      if (zone === 'ardiente' && fi === 0 && k === '14,21' && !S.flags.ardTablilla) { S.flags.ardTablilla = true; emit('changed'); }
      if (zone === 'ardiente' && k === '7,3' && !S.flags.grabadoMarea) { S.flags.grabadoMarea = true; emit('changed'); }
      if (zone === 'selva' && fi === 0 && k === '6,3' && !S.flags.suenoMusgo) { S.flags.suenoMusgo = true; emit('changed'); }
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
    case 'D': if (zone === 'ardiente') { const all = Object.keys(FLOORS[fi].chimneys || {}); say(st.door ? 'La puerta de basalto está abierta. Adentro brilla la forja.' : `Una puerta de basalto con tres canales de humo. Chimeneas encendidas: ${all.filter(q => st.lit.includes(q)).length} de ${all.length}.`); return; }
      say(st.door ? 'La puerta de runas está abierta.' : fi === 0 ? 'Una puerta de piedra con runas. Dos de ellas parecen llamas.' : 'Las runas dicen: «Cuando las cuatro miren al centro, se abrirá el paso».'); return;
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
    case 'T': say(theme() === 'selva' ? 'Un árbol de frutas de arcilla. Huelen a mango, pero son duras como ladrillo.' : theme() === 'isla' ? 'Una palmera de arcilla. Los cocos son duros como piedra.' : theme() === 'volcan' ? 'Un árbol quemado hace mucho. En las puntas de las ramas todavía brillan brasas.' : 'Un árbol.'); return;
    case 'F': say('El faro de los Alfareros. La puerta está al frente.'); return;
    case 'A': if (zone === 'faro') { lightLens(); return; } say(st.door ? 'El orbe del altar brilla: las cuatro guardianas lo miran.' : 'Un altar con un orbe apagado. Ninguna de las guardianas lo mira.'); return;
    case 'g': {
      if (S.flags.golemCalmo && S.flags.ceiboDespierto && !S.flags.hondoAbierto) { golemMoveRock(); return; }
      if (S.flags.golemCalmo) { say(S.flags.hondoAbierto ? 'El gólem descansa junto a la escalera que destapó. Te mira y asiente.' : 'El gólem descansa, tibio y tranquilo. Te mira y asiente: la montaña te presta la caracola.'); return; }
      if (S.flags.caracolaDebil) { golemFight(); return; }
      say(ZS().caracola ? 'El gólem no se mueve… pero ahora sus ojos parecen seguirte.' : 'Un gólem de arcilla oscura, enorme, dormido sobre las rodillas. El calor le late en las grietas.'); return;
    }
    case '*': say('Una estalagmita. Gotea.'); return;
    case 'f': {
      const b = st.built?.[k]; if (b === 'flor') return;
      if (!b) {
        work(1.0, '', () => {
          (st.built ||= {})[k] = 'regada'; const v2 = view!.buds.get(k); if (v2) setBud(v2, 'regada');
          sfx('splash', 0.7); puff(w.x, 0.6, w.z, '#7ec8f0', 14, 1.6, 1, 0);
          say('Marea riega el capullo con agua del río. Se hincha y se pone rosado… falta que alguien le hable.');
          emit('changed'); emit('caveChanged');
        });
      } else {
        work(1.2, '', () => {
          (st.built ||= {})[k] = 'flor'; const v2 = view!.buds.get(k); if (v2) setBud(v2, 'flor');
          sfx('heal'); sfx('coin', 0.5); puff(w.x, 0.3, w.z, '#f8a8c8', 22, 2, 1.4, 0);
          const all = cellsOf(fi, 'f'), n = all.filter(([a, b2]) => st.built?.[K(a, b2)] === 'flor').length;
          say(n < all.length ? `Musgo le canta al capullo y se abre en una flor enorme que flota: se puede pisar (${n}/${all.length}).` : 'La última flor se abre. El río ya se puede cruzar de flor en flor.');
          if (n >= all.length && !S.flags.rioFlor) S.flags.rioFlor = true;
          emit('changed'); emit('caveChanged');
        });
      }
      return;
    }
    case 'x': {
      if (st.built?.[k] === 'susto') return;
      work(0.8, '', () => {
        (st.built ||= {})[k] = 'susto'; const p2 = view!.plants.get(k); if (p2) hidePlant(p2, true);
        sfx('fire'); sfx('snap', 0.6); puff(w.x, 0.7, w.z, '#ffb040', 10, 1.6, 0.8, 0); puff(w.x, 0.3, w.z, '#4e8a3a', 10, 1.2, 1, 0);
        say(S.flags.plantaAsustada ? 'Brasa le acerca una chispa y la planta se esconde bajo sus hojas.' : 'Brasa le acerca una chispa a la planta. ¡Se asusta! Cierra la boca y se esconde bajo sus hojas, temblando. Ya se puede pasar.');
        if (!S.flags.plantaAsustada) S.flags.plantaAsustada = true;
        emit('changed'); emit('caveChanged');
      });
      return;
    }
    case 'W': {
      if (S.flags.raizCalma) return;
      const f = view!.foes.get(k); if (!f) return;
      if (!S.flags.raizHola) { S.flags.raizHola = true; golemPose(f, 'awake'); shakeT = 0.4; sfx('roar', 0.5); emit('story', 'raizHola'); emit('changed'); return; }
      fightFoe('raiz', x, z, f, () => {
        S.flags.raizCalma = true; releaseFoe();
        const holder = f.g, r = FLOORS[fi].guardianRest; if (r) { const [a, b] = r.split(',').map(Number); slides.push({ o: holder, from: holder.position.clone(), to: local(a, b), t: 0, d: 1.2 }); }
        setTimeout(() => emit('story', 'raizCalma'), 1500);
      });
      return;
    }
    case 'H': {
      if (S.flags.ceiboDespierto) { say('El corazón del Ceibo late tranquilo. Arriba, la selva respira.'); return; }
      if (!S.flags.raizCalma) { say('Una luz verde late entre las raíces. El guardián no deja acercarse.'); return; }
      work(1.8, '', () => {
        S.flags.ceiboDespierto = true; S.flags.semillaCeibo = true; sfx('solve'); sfx('heal');
        if (view!.heart) view!.heart.orb.scale.setScalar(1.5);
        puff(w.x, 0.8, w.z, '#9aff90', 34, 2.6, 1.6, 0); shakeT = 0.3;
        for (const m of party) m.c.cheer = 2.4;
        setTimeout(() => emit('story', 'ceibo'), 1300);
        emit('changed'); emit('caveChanged');
      });
      return;
    }
    case 'a': {
      if (st.mined.includes(k)) { say('Ya no queda arcilla en esta veta. Más abajo hay más.'); return; }
      sfx('pick');
      work(1.4, 'pickM', () => {
        sfx('pick'); st.mined.push(k); (st.minedAt ||= {})[k] = S.time; mineVisual(k);
        S.stats.cueva = (S.stats.cueva || 0) + 1;
        gain('arcilla', S.inv.picoO ? 3 : 2, leader().c.root.position.clone().setY(1.2)); puff(w.x, 0.5, w.z, '#6a96d8', 14, 1.8, 1, 0);
        if (!S.flags.arcillaVista) { S.flags.arcillaVista = true; setTimeout(() => emit('story', 'arcillaAzul'), 700); emit('changed'); }
        emit('caveChanged');
      });
      return;
    }
    case 'u': {
      if (fi === 0) { if (!S.flags.campamento) { say('Una cuerda que sube por un hueco del techo. ¿Quién la habrá dejado?'); return; } say('Bajan por la cuerda, una figura tras otra, hasta el campamento.'); sfx('step'); switchTo('hondo', CAMP, 'rope'); return; }
      say('Suben por la cuerda hasta el primer piso.'); sfx('step'); switchTo('hondo', 0, 'rope'); return;
    }
    case 'J': if (!S.flags.hondoAbierto) {
      if (S.flags.golemCalmo && S.flags.ceiboDespierto) { golemMoveRock(); return; }
      say(S.flags.golemCalmo ? 'Una roca enorme, redonda y lisa, más pesada que cualquier otra. Detrás se siente un aire frío… Ni Arci la mueve.' : 'Una roca enorme, redonda y lisa. Detrás se siente un aire frío.'); return;
    } return;
    case 'k': {
      const who = FLOORS[fi].marks?.[k] || 'arci', kind: Record<string, string> = { arci: 'tierra', musgo: 'hojas', brasa: 'brasas', marea: 'agua' };
      if (st.built?.[k] === 'mano' || S.flags.puertaAlfareros) { say(`La mano de ${kind[who]} brilla tibia.`); return; }
      work(0.9, '', () => {
        (st.built ||= {})[k] = 'mano'; const m = view!.marks.get(k); if (m) markOn(m);
        sfx('heal'); puff(w.x, 0.8, w.z, ({ arci: '#e0a070', musgo: '#8ad96b', brasa: '#ff8a40', marea: '#6ab8f0' } as Record<string, string>)[who], 16, 1.6, 1, 0);
        const all = Object.keys(FLOORS[fi].marks || {}), n = all.filter(q => st.built?.[q] === 'mano').length;
        if (n < all.length) { say(`${NAME[who]} pone la mano en la marca de ${kind[who]}. La piedra se entibia y se ilumina (${n}/${all.length}).`); emit('caveChanged'); return; }
        S.flags.puertaAlfareros = true; shakeT = 1; sfx('rumble'); sfx('solve');
        if (view!.alfDoor) doorLit(view!.alfDoor);
        for (const m2 of party) m2.c.cheer = 2.4;
        setTimeout(() => emit('story', 'puertaAlfareros'), 1600);
        emit('changed'); emit('caveChanged');
      });
      return;
    }
    case '{': say(S.flags.puertaAlfareros ? 'La puerta sigue cerrada. En el centro brilla una quinta marca vacía. Del otro lado se oye el mar.' : 'Una puerta enorme de piedra oscura. Cuatro Alfareros tallados con las manos abiertas, y delante, cuatro pedestales.'); return;
    case 'q': say(geyserOn(x, z) ? '¡Fiuuu! El géiser sopla un chorro de vapor hirviendo.' : 'Un géiser dormido… por un momento. Sopla cada pocos segundos.'); return;
    case 'j': say('Un géiser que nunca para. Una roca grande lo podría tapar.'); return;
    case 'l': {
      if (cooled(k)) return;
      work(1.1, '', () => {
        (st.built ||= {})[k] = 'frio'; addSlab(x, z); sfx('steam'); sfx('splash', 0.6);
        puff(w.x, 0.2, w.z, '#f4f6f8', 22, 2.6, 1.4, 0); puff(w.x, 0.1, w.z, '#7ec8f0', 8, 1.2, 0.8, 0);
        say(S.flags.lavaEnfriada ? 'Marea enfría la lava: una costra negra que ya se puede pisar.' : 'Marea junta agua entre las manos y la echa sobre la lava. ¡Vapor! Queda una costra negra que todos pueden pisar.');
        if (!S.flags.lavaEnfriada) { S.flags.lavaEnfriada = true; }
        emit('changed'); emit('caveChanged');
      });
      return;
    }
    case 'E': {
      const d = FLOORS[fi].chimneys?.[k]; if (!d) return;
      if (st.lit.includes(k)) { say(`${d.name[0].toUpperCase() + d.name.slice(1)} echa humo y tira fuerte.`); return; }
      if (d.plug && !st.fill.includes(d.plug)) { say(d.blocked || 'La chimenea no tira.'); return; }
      work(1.0, '', () => {
        st.lit.push(k); S.flags[d.flag] = true; sfx('fire'); sfx('steam', 0.5);
        const c2 = view!.chimneys.get(k); if (c2) { c2.flame.visible = true; c2.glow.material = GLOW.flame; puff(c2.top.x, c2.top.y, c2.top.z, '#ffb040', 18, 2.4, 1, 0); }
        puff(w.x, 0.5, w.z, '#ffb040', 12, 1.8, 0.8, 0); leader().c.cheer = 1.6;
        const all = Object.keys(FLOORS[fi].chimneys || {}), n = all.filter(q => st.lit.includes(q)).length;
        say(`Brasa sopla adentro y ${d.name} se enciende de abajo hacia arriba (${n}/${all.length})`);
        checkDoor(); emit('changed'); emit('caveChanged');
      });
      return;
    }
    case 'Z': {
      if (S.flags.forjaViva) { say('La forja arde blanca. El yunque está tibio y limpio.'); return; }
      if (!S.flags.madreCalma) { say('Un yunque enorme frente a un fogón apagado. La salamandra madre no deja que nadie se acerque.'); return; }
      work(1.4, '', () => {
        S.flags.forjaViva = true; S.flags.planosForja = true; sfx('fire'); sfx('solve');
        if (view!.forge) view!.forge.fire.visible = true;
        puff(w.x, 0.8, w.z, '#ffd080', 30, 2.6, 1.4, 0); shakeT = 0.4;
        for (const m of party) m.c.cheer = 2.2;
        setTimeout(() => emit('story', 'forjaViva'), 1200);
        emit('changed'); emit('caveChanged');
      });
      return;
    }
    case 'N': if (zone === 'hondo') { lizards(x, z, k); return; } {
      if (nestCalm()) { say(zone === 'selva' ? 'Las iguanas duermen al sol, panza arriba. Más tarde volverán a molestar.' : 'Las salamandras duermen enroscadas entre las brasas. Más tarde volverán a despertar.'); return; }
      const f = view!.foes.get(k); if (!f) return;
      const jungle = zone === 'selva';
      fightFoe(jungle ? 'iguanas' : 'salamandra', x, z, f, () => {
        ZS().nestAt = S.time; salamanderPose(f, false);
        const at = w.clone().setY(1);
        if (jungle) { gain('semilla', 3, at); gain('madera', 6, at.clone().setY(1.35)); if (Math.random() < 0.5) gain('cuarzo', 1, at.clone().setY(1.7)); }
        else { gain('obsidiana', 2, at); gain('carbon', 3, at.clone().setY(1.35)); if (Math.random() < 0.5) gain('cuarzo', 1, at.clone().setY(1.7)); }
        const fl = jungle ? 'nidoIguanas' : 'nidoCalmo';
        if (Math.random() < 0.25 || !S.flags[fl]) addStars(1, jungle ? 'Las iguanas de la selva' : 'Las salamandras del nido');
        if (!S.flags[fl]) { S.flags[fl] = true; setTimeout(() => emit('story', jungle ? 'nidoIguanas' : 'nido'), 500); }
      });
      return;
    }
    case 'm': {
      if (S.flags.madreCalma) return;
      const f = view!.foes.get(k); if (!f) return;
      if (!S.flags.madreHola) { S.flags.madreHola = true; salamanderPose(f, true); shakeT = 0.3; sfx('roar', 0.5); emit('story', 'madreHola'); emit('changed'); return; }
      fightFoe('madre', x, z, f, () => {
        S.flags.madreCalma = true; salamanderPose(f, false);
        const [a, b] = (FLOORS[fi].madreRest || k).split(',').map(Number), holder = f.g.parent!;
        slides.push({ o: holder, from: holder.position.clone(), to: local(a, b), t: 0, d: 1.2, done: () => { f.g.rotation.y = -0.6; } });
        setTimeout(() => emit('story', 'madre'), 1500);
      });
      return;
    }
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
    : f.door === 'chimeneas' ? Object.keys(f.chimneys || {}).every(k => st.lit.includes(k))
    : (f.statues || []).every(s => st.dirs[K(s.x, s.z)] === s.want);
  if (!ok) return;
  st.door = true; doorAt = 0.9;
  if (f.door === 'chimeneas') { setTimeout(() => { sfx('rumble'); shakeT = 0.9; }, 400); setTimeout(() => emit('story', 'chimeneas'), 1800); return; }
  setTimeout(() => { sfx('solve'); say(fi === 0 ? 'Las runas se encienden y la puerta de piedra se hunde en el suelo' : 'Las cuatro guardianas miran el altar. El orbe se enciende y la puerta se abre'); }, 500);
}

/* ---------- the lighthouse ---------- */
const PIECES = ['piezaPasto', 'piezaVapor', 'piezaRoca'];
export const piecesHeld = () => PIECES.filter(f => S.flags[f]).length;
function lightLens() {
  if (S.flags.faroEncendido) {
    if (S.flags.forjaViva && !S.flags.selvaVista) { S.flags.selvaVista = true; sfx('solve'); shakeT = 0.2; emit('story', 'selvaVista'); emit('changed'); return; }
    say(S.flags.selvaVista ? 'La lente gira despacio. Al oeste, la selva verde; al sur, tu isla.' : 'La lente gira despacio. Desde aquí se ve tu isla.'); return;
  }
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

/* ---------- fights on the burning island ---------- */
/** The team lines up in front of an enemy and the turn-based fight starts. Winning runs onWin;
    losing sends the team back to the start of the floor with nothing lost. */
function fightFoe(id: FoeId, ex: number, ez: number, model: Golem, onWin: () => void) {
  fade(() => {
    $('caveUI').classList.add('fight'); held = null; path = []; pendingAct = null;
    const n = party.length, homes = party.map((_, k) => world(ex, ez + 1).add(new THREE.Vector3((k - (n - 1) / 2) * 0.95, 0, 0.45)));
    for (const m of party) { m.fx = m.x; m.fz = m.z; }
    startBattle({ party: party.map(m => m.c), homes, golem: model, foe: id, onEnd: win => {
      $('caveUI').classList.remove('fight');
      for (const m of party) m.c.root.position.copy(world(m.x, m.z));
      if (win) { onWin(); emit('changed'); emit('caveChanged'); }
      else fade(() => { loadFloor(fi, 'reset'); say('Las figuras se recuperan en la entrada. Pueden volver a intentarlo.'); });
    } });
  });
}

/* ---------- the guardian ---------- */
function golemFight() {
  const g = cellsOf(fi, 'g')[0]; if (!g || !view?.golem) return;
  if (!S.flags.golemDespierto) { S.flags.golemDespierto = true; emit('changed'); }
  fightFoe('golem', g[0], g[1] + 0.15, view.golem, () => {
    S.flags.golemCalmo = true;
    setTimeout(() => emit('story', 'golemCalmo'), 400);
  });
}

/* ---------- the Depths ---------- */
/** The golem, once the Ceibo is awake, rolls aside the big rock and opens the way down. */
function golemMoveRock() {
  if (S.flags.hondoAbierto || !view?.bigRock) return;
  S.flags.hondoAbierto = true; emit('changed');
  emit('story', 'golemRoca');
  const g = view.golem; if (g) golemPose(g, 'awake');
  setTimeout(() => {
    const r = view?.bigRock; if (!r || zone !== 'cueva') return;
    slides.push({ o: r, from: r.position.clone(), to: new THREE.Vector3(-0.78, -0.05, -0.55), t: 0, d: 1.4, done: () => rockAside(r) });
    shakeT = 1; sfx('rumble'); sfx('dig', 0.8);
    const w = r.getWorldPosition(new THREE.Vector3()); puff(w.x, 0.3, w.z, '#8a7a6a', 26, 2.4, 1.6, 0); scareBats(w, 8);
  }, 700);
  setTimeout(() => { if (view?.golem && zone === 'cueva') golemPose(view.golem, 'calm'); emit('caveChanged'); }, 2600);
}
/** The quartz lizards: a short fight, then they curl up around their crystals for the rest of the visit. */
function lizards(x: number, z: number, k: string) {
  const st = F(), w = world(x, z);
  if (st.built?.[k] === 'calma') { say('Los lagartos de cuarzo duermen hechos un ovillo brillante.'); return; }
  const f = view!.foes.get(k); if (!f) return;
  fightFoe('lagartos', x, z, f, () => {
    (st.built ||= {})[k] = 'calma'; salamanderPose(f, false);
    const at = w.clone().setY(1);
    gain('cuarzo', 3, at); if (fi >= 2) gain('arcilla', 2, at.clone().setY(1.35)); else gain('mineral', 3, at.clone().setY(1.35));
    if (Math.random() < 0.3 || !S.flags.lagartos) addStars(1, 'Los lagartos de cuarzo');
    if (!S.flags.lagartos) { S.flags.lagartos = true; setTimeout(() => say('Los lagartos de cuarzo se calman. Cuidaban unos cristales: dejan que te lleves algunos.'), 600); }
    S.stats.lagartos = (S.stats.lagartos || 0) + 1;
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
  const interest = boulderAt(x, z) >= 0 || 'tsRCMKLQDGAg*XYVh=oUpnTFlEjNZmWxHaukJ{'.includes(ch(x, z)) && solid(x, z) || ch(x, z) === 'f' && F().built?.[K(x, z)] !== 'flor';
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
      const c = ch(nx, nz); if ((c === 'S' || c === '>' || c === 'J') && !(stairsOk && nx === tx && nz === tz)) continue;
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
  if (c === 'J' && zone === 'cueva' && S.flags.hondoAbierto) { toDepths(); return; }
  if (c === '>') { path = []; held = null; goFloor(fi + 1, 'down'); return; }
  if (c === 'S') {
    path = []; held = null;
    // from the first floor of the Depths, back up the golem's stairs to the river of lava
    if (zone === 'hondo' && fi === 0) { const j = CAVE_FLOORS[2].map.findIndex(r => r.includes('J')), jx = CAVE_FLOORS[2].map[j].indexOf('J'); switchTo('cueva', 2, 'back', [jx + 1, j, 'E']); return; }
    if (fi === 0) exitZone(); else goFloor(fi - 1, 'up'); return;
  }
}

/* ---------- every frame ---------- */
function spawnEmber(x: number, z: number, up = 1) {
  if (emberList.length >= EMB) return;
  emberList.push({ x, y: 0, z, vy: (0.5 + Math.random() * 0.7) * up, vx: (Math.random() - 0.5) * 0.25, life: 1.2 + Math.random() * 1.4, s: 0.04 + Math.random() * 0.04 });
}
/** The burning island's moving parts: geysers that blow (and push whoever stands on them), lit
    chimneys that smoke, the forge's fire, and now and then the volcano rumbles. */
let smokeAcc = 0, shoveSaid = false;
function tickBurning(dt: number) {
  if (!view) return;
  smokeAcc += dt; const puffNow = smokeAcc > 0.12; if (puffNow) smokeAcc = 0;
  const L = leader();
  for (const [k, g] of view.geysers) {
    if (!g.col.visible) continue;
    const [x, z] = k.split(',').map(Number), on = geyserOn(x, z), was = geyserWas.get(k) || false;
    const want = on ? (g.always ? 2.2 : 1.9) : 0.01;
    g.col.scale.y += (want - g.col.scale.y) * Math.min(1, dt * (on ? 14 : 5)); g.col.position.y = 0.1 + g.col.scale.y / 2;
    (g.col.material as THREE.MeshBasicMaterial).opacity = 0.5;
    if (on && puffNow) smoke(g.pos.x + (Math.random() - 0.5) * 0.3, 0.3 + g.col.scale.y * 0.7, g.pos.z + (Math.random() - 0.5) * 0.3, '#f4f6f8', g.always ? 0.14 : 0.1, 1.2);
    if (on && !was) {
      if (L && Math.hypot(g.pos.x - L.c.root.position.x, g.pos.z - L.c.root.position.z) < 7) sfx('steam', 0.6);
      // whoever stands on it is pushed back to the cell they came from
      if (!moving && busyT <= 0) for (const m of party) {
        if (m.x !== x || m.z !== z || m.px === undefined || m.pz === undefined) continue;
        if (blockedFor(m.c.id, m.px, m.pz) || party.some(o => o !== m && o.x === m.px && o.z === m.pz)) continue;
        for (const o of party) { o.fx = o.x; o.fz = o.z; }
        m.x = m.px; m.z = m.pz; moving = true; stepT = 0; path = []; pendingAct = null;
        if (!shoveSaid) { shoveSaid = true; say('¡Fiuuu! El géiser empuja hacia atrás a quien se quede encima. Hay que pasar entre soplido y soplido.'); }
      }
    }
    geyserWas.set(k, on);
  }
  for (const [k, c] of view.chimneys) {
    if (!F().lit.includes(k)) continue;
    const f = 1 + Math.sin(clock * 13 + c.top.x) * 0.12; c.flame.scale.set(2 - f, f, 2 - f);
    if (puffNow && Math.random() < 0.6) smoke(c.top.x + (Math.random() - 0.5) * 0.2, c.top.y + 0.3, c.top.z + (Math.random() - 0.5) * 0.2, Math.random() < 0.7 ? '#4a4446' : '#6a6062', 0.14, 2.6);
  }
  if (view.forge && view.forge.fire.visible) { const f = 1 + Math.sin(clock * 15) * 0.1; view.forge.fire.scale.set(1, f, 1); if (Math.random() < dt * 5) { const p = view.forge.fire.getWorldPosition(new THREE.Vector3()); spawnEmber(p.x, p.z + 0.1, 1.4); } }
  if (view.crater && theme() === 'volcan') {
    if (puffNow) smoke(view.crater.x + (Math.random() - 0.5) * 1.6, view.crater.y, view.crater.z + (Math.random() - 0.5) * 1.2, Math.random() < 0.6 ? '#5a5456' : '#3e3a3c', 0.32, 4.5);
    rumbleT -= dt;
    if (rumbleT <= 0) { rumbleT = 45 + Math.random() * 30; sfx('rumble', 0.7); shakeT = 0.5; for (let q = 0; q < 6; q++) smoke(view.crater.x + (Math.random() - 0.5), view.crater.y + 0.4, view.crater.z, '#ff8a40', 0.2, 1.4); }
  }
  for (const [k, p] of view.plants) {
    if (F().built?.[k] === 'susto') { p.head.rotation.z = Math.sin(clock * 30) * 0.03; continue; }
    const [x, z] = k.split(',').map(Number), d = L ? Math.abs(L.x - x) + Math.abs(L.z - z) : 9;
    const snap = d <= 1 && Math.sin(clock * 5 + x) > 0.6;
    p.jaw.rotation.x += ((snap ? 0 : -0.7 - Math.sin(clock * 2 + z) * 0.1) - p.jaw.rotation.x) * Math.min(1, dt * (snap ? 25 : 4));
    p.head.rotation.y = L && d < 4 ? Math.atan2(L.x - x, L.z - z) : Math.sin(clock * 0.6 + x) * 0.5;
  }
  if (view.heart) { const k2 = S.flags.ceiboDespierto ? 1 : 0.6; view.heart.orb.rotation.y += dt * 0.6; (view.heart.glow.material as THREE.MeshBasicMaterial).opacity = (0.5 + 0.2 * Math.sin(clock * (S.flags.ceiboDespierto ? 2 : 1.2))) * k2; }
  for (const [k, f] of view.foes) { if (battleActive()) break; const t = (f as any).tail as THREE.Group | undefined; if (t) t.rotation.y = Math.sin(clock * (FLOORS[fi].madre === k && !S.flags.madreCalma && S.flags.madreHola ? 2 : 0.7) + f.g.position.x) * 0.25; }
}

let emberAcc = 0, lastLabel = '';
/* the Depths: what the team has already seen stays faintly lit */
const seenCells = new Set<string>(); let memory: [number, number][] = [], memAt = '';
function remember(x: number, z: number) {
  const here = K(x, z); if (here === memAt) return; memAt = here;
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    if (dx * dx + dz * dz > 10) continue;
    const k = K(x + dx, z + dz); if (seenCells.has(k) || ch(x + dx, z + dz) === '#') continue;
    seenCells.add(k); const w = world(x + dx, z + dz); memory.push([w.x, w.z]);
  }
}
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
    if (held) { path = []; tryStep(held); waitGeyser = false; }
    else if (path.length) {
      const [nx, nz] = path[0], d = (Object.keys(DV) as Dir[]).find(q => L.x + DV[q][0] === nx && L.z + DV[q][1] === nz);
      if (!d) { path = []; pendingAct = null; }
      else if (!tryStep(d)) { if (waitGeyser) waitGeyser = false; else { path = []; pendingAct = null; } }
      else path.shift();
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
  lavaScroll(dt);
  tickBurning(dt);
  emberAcc += dt * view.embers.length * 0.35;
  while (emberAcc > 1) { emberAcc--; const e = view.embers[Math.floor(Math.random() * view.embers.length)]; if (e && !st.fill.includes(K(Math.floor(e.x - OX), Math.floor(e.z - OZ)))) spawnEmber(e.x + (Math.random() - 0.5) * 0.8, e.z + (Math.random() - 0.5) * 0.8); }
  for (const p of emberList) { p.life -= dt; p.y += p.vy * dt; p.x += p.vx * dt + Math.sin(clock * 3 + p.s * 99) * dt * 0.1; }
  for (let i = emberList.length - 1; i >= 0; i--) if (emberList[i].life <= 0) emberList.splice(i, 1);
  emberList.forEach((p, k) => { const s = p.s * Math.min(1, p.life * 2); _m.makeScale(s, s, s).setPosition(p.x, p.y, p.z); embers.setMatrixAt(k, _m); });
  embers.count = emberList.length; embers.instanceMatrix.needsUpdate = true;
  // lights
  lights.forEach((l, k) => { const s = slots[k]; if (!s) return; const f = 1 + (Math.sin(clock * 13 + k * 2) * 0.12 + Math.sin(clock * 5.1 + k) * 0.1) * s.flick; l.intensity = s.base * s.on() * f; });
  if (partyLight) { const p = L.c.root.position; partyLight.position.set(p.x, 1.7, p.z + 0.4); partyLight.intensity = (theme() === 'cueva' ? 5.5 : 4 * nightK) * (1 + Math.sin(clock * 9) * 0.04); }
  if (npcFig) {
    animFigure(npcFig, dt, T);
    const d = L.c.root.position.clone().sub(npcFig.root.position); if (d.length() < 3.5) npcFig.dir = Math.atan2(d.x, d.z);
    if (!S.flags.mareaHablo && npcFig.anim !== 'wave' && Math.sin(clock * 1.3) > 0.985) { setFigureAnim(npcFig, 'wave'); setTimeout(() => npcFig && setFigureAnim(npcFig, 'idle'), 1600); }
  }
  // bats, beetles, drips and the darkness that only opens around light
  const ls: Light[] = []; for (const f of glowSpots) { const l = f(); if (l) ls.push(l); }
  if (zone === 'hondo') remember(L.x, L.z);
  if (theme() === 'cueva') tickLife(dt, T, L.c.root.position, ls, (L.c.id === 'brasa' && S.flags.corazon ? 7 : 4.6) + (zone === 'hondo' ? 1.2 : 0), zone === 'hondo' ? memory : undefined);
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

const HO_GOALS = new Set(['hoGolem', 'hoBajar', 'hoPiso3', 'hoArcilla', 'hoCampamento', 'hoPuerta']);
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
  if (zone === 'ardiente') {
    const at2 = (k: string, y = 1.4) => { const [a, b] = k.split(',').map(Number); return over([a, b], y); };
    const F0 = ARD_FLOORS[0], ch0 = F0.chimneys || {}, st0 = ZS().f[0];
    const chimFor: Record<string, string> = { ardVapor: 'chimVapor', ardRaices: 'chimRaices', ardRio: 'chimRio' };
    if (fi === 0) {
      if (goal === 'ardTablilla') return at2('14,21', 1.5);
      if (chimFor[goal]) {
        const [k, d] = Object.entries(ch0).find(([, v]) => v.flag === chimFor[goal])!;
        if (d.plug && !st0.fill.includes(d.plug)) return at2(d.plug, 1.2);
        if (goal === 'ardRio' && !cooled('19,5')) return at2('19,5', 0.9);
        if (goal === 'ardRio' && !cooled('19,4')) return at2('19,4', 0.9);
        return at2(k, 2.9);
      }
      if (goal === 'ardCrater' || goal === 'ardMadre' || goal === 'ardForja') return st0.door ? over(cellsOf(0, '>')[0], 0.9) : null;
      if (goal === 'ardHorno') return over(cellsOf(0, 'S')[0], 0.9);
      return null;
    }
    if (goal === 'ardMadre') return S.flags.madreCalma ? null : at2(FLOORS[1].madre!, 1.6);
    if (goal === 'ardForja') return over(cellsOf(1, 'Z')[0], 1.9);
    return over(cellsOf(fi, 'S')[0], 0.9);
  }
  if (zone === 'selva') {
    const at2 = (k: string, y = 1.4) => { const [a, b] = k.split(',').map(Number); return over([a, b], y); };
    if (fi === 0) {
      const st0 = ZS().f[0];
      if (goal === 'selRio') { const b = cellsOf(0, 'f').sort((p, q) => q[1] - p[1]).find(p => st0.built?.[K(...p)] !== 'flor'); return b ? over(b, 1.2) : null; }
      if (goal === 'selPlanta') { const x = cellsOf(0, 'x').find(p => st0.built?.[K(...p)] !== 'susto'); return x ? over(x, 1.4) : null; }
      if (goal === 'selTemplo') { const bi = st0.b.findIndex(Boolean); const b = st0.b[bi]; return b ? over(b as [number, number], 1.3) : null; }
      if (goal === 'selRaices' || goal === 'selGuardian' || goal === 'selCeibo') return over(cellsOf(0, '>')[0], 0.9);
      if (goal === 'selPlantar') return over(cellsOf(0, 'S')[0], 0.9);
      return null;
    }
    if (goal === 'selGuardian') return S.flags.raizCalma ? null : at2(FLOORS[1].guardian!, 2.2);
    if (goal === 'selCeibo') return over(cellsOf(1, 'H')[0], 1.6);
    return over(cellsOf(fi, 'S')[0], 0.9);
  }
  if (HO_GOALS.has(goal)) {
    if (zone === 'cueva') {
      if (fi < 2) return F().door ? over(cellsOf(fi, '>')[0], 0.9) : null;
      if (goal === 'hoGolem' || !S.flags.hondoAbierto) return over(cellsOf(2, 'g')[0], 2.6);
      return over(cellsOf(2, 'J')[0], 1.6);
    }
    if (zone === 'hondo') {
      if (goal === 'hoArcilla') { const a = cellsOf(fi, 'a').find(p => !st.mined.includes(K(...p))); if (a) return over(a, 1.3); }
      if (goal === 'hoPuerta' && fi === DOOR) { const m = Object.keys(FLOORS[fi].marks || {}).find(k => st.built?.[k] !== 'mano'); if (m) { const [a, b] = m.split(',').map(Number); return over([a, b], 1.4); } return over(cellsOf(fi, '{')[0], 3.4); }
      if (goal === 'hoPuerta' && fi === 0 && cellsOf(0, 'u').length) return over(cellsOf(0, 'u')[0], 2.2);
      const d = cellsOf(fi, '>')[0]; return d ? over(d, 0.9) : null;
    }
    return null;
  }
  if (zone === 'faro' && goal === 'selVer') return fi === 0 ? over(cellsOf(0, '>')[0], 1.2) : over(cellsOf(1, 'A')[0], 1.6);
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
/** Debug: put the whole party on a cell. */
export function caveWarp(x: number, z: number) { if (!active) return; for (const m of party) { m.x = m.fx = x; m.z = m.fz = z; m.c.root.position.copy(world(x, z)); } controls.target.copy(world(x, z)); }
/** Debug: jump straight to a floor. */
export function caveDebugFloor(n: number, up = false) { if (active) loadFloor(n, up ? 'up' : 'down'); }
/** Debug and tests: the map of the current floor and what was solved on it. */
export function caveDebugMap() { return active ? { zone, floor: fi, map, st: F(), marks: FLOORS[fi].marks || null } : null; }
