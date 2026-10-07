import * as THREE from 'three';
import { emit } from '../core/events';
import { scene, glowMul } from '../render/renderer';
import { worldGroup, tileAt, topY, rebuildDeco, blocked, N, type Tile } from '../world/island';
import { removeTree } from '../world/trees';
import { rocks } from '../world/rocks';
import { puff, smoke } from '../world/particles';
import { MODELS, modelScaffold } from '../assets/buildings';
import { lampK } from '../render/daynight';
import { S, DATA, afford, pay, gain, type Cost, type SavedBuilding, type ResKey } from './state';
import { RECIPES, MAX_QUEUE, makesThings, jobSeconds, finishInvention, hammerPower } from './production';
import { stumps } from './forest';

export interface Building {
  type: string; i: number; j: number; rot: number; tiles: Tile[];
  group: THREE.Group; glow?: THREE.Mesh; smokeAt: THREE.Vector3;
  jobs: string[]; prog: number; prog2: number; build: number;   // production queue (recipe ids, or 'inv:<id>' at the workshop); prog2: the furnace's second fire
  lvl: number; up: number;               // level, and the level being built when an upgrade is under way (0 = none)
  flag: THREE.Group | null;
  stoked: boolean;                                   // Brasa is fanning the fire (furnace works twice as fast)
  work: number; need: number;            // hammer blows done / needed: a building works only when finished
  scaffold: THREE.Group | null; light: THREE.Mesh | null;
}
export const buildings: Building[] = [];
export const isDone = (b: Building) => b.work >= b.need;
/** Whether a building of this type has been finished (it still counts while being upgraded). */
export const has = (type: string) => buildings.some(b => b.type === type && (isDone(b) || b.up > 0));
/** Highest finished level of a building type (0 when there is none). */
export const levelOf = (type: string) => buildings.reduce((m, b) => b.type === type && (isDone(b) || b.up > 0) ? Math.max(m, b.lvl) : m, 0);
export const saved = (): SavedBuilding[] => buildings.map(b => ({ type: b.type, i: b.i, j: b.j, rot: b.rot, jobs: b.jobs, prog: b.prog, prog2: b.prog2, work: b.work, lvl: b.lvl, up: b.up } as SavedBuilding));
export interface Level { cost: Cost; work: number; text: string; locked?: string; title?: string; needsFlag?: string; lockedFlag?: string }
/** Why the next level cannot be started yet (a fixed lock, or a story flag still missing). */
export const levelLock = (L: Level) => L.locked || (L.needsFlag && !S.flags[L.needsFlag] ? L.lockedFlag || 'Todavía no' : '');
const def = (type: string) => (DATA.BUILDINGS as any)[type] as { name: string; size: [number, number]; cost: Cost; requires?: string; work?: number; deco?: boolean; levels?: Level[]; coast?: boolean };
/** For a pier: which way the sea is from a tile (as a rotation 0..3), or -1 when it is not on the coast. */
export function seaSide(i: number, j: number) {
  const D: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  // prefer a side with open water two tiles out, so the pier does not point into a narrow inlet
  let best = -1, score = -1;
  D.forEach(([di, dj], r) => { if (tileAt(i + di, j + dj) || i + di < 0 || j + dj < 0 || i + di >= N || j + dj >= N) return; const sc = (tileAt(i + 2 * di, j + 2 * dj) ? 0 : 1) + (tileAt(i + di + dj, j + dj + di) ? 0 : 0.5) + (tileAt(i + di - dj, j + dj - di) ? 0 : 0.5); if (sc > score) { score = sc; best = r; } });
  return best;
}
/** The next level of a building, if it has one. */
export const nextLevel = (b: Building): Level | null => def(b.type).levels?.[b.lvl - 1] || null;

/* a warm pool of light on the ground under each lantern, only at night */
const lightTex = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!; const g = x.createRadialGradient(32, 32, 2, 32, 32, 31); g.addColorStop(0, 'rgba(255,190,100,0.9)'); g.addColorStop(0.5, 'rgba(255,150,60,0.35)'); g.addColorStop(1, 'rgba(255,120,40,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c; })());
const lightGeo = new THREE.PlaneGeometry(3.2, 3.2); lightGeo.rotateX(-Math.PI / 2);

export function footprint(type: string, i: number, j: number, rot: number) {
  const [w0, d0] = def(type).size; const [w, d] = rot % 2 ? [d0, w0] : [w0, d0];
  const a: (Tile | null)[] = [];
  for (let dj = 0; dj < d; dj++) for (let di = 0; di < w; di++) a.push(tileAt(i + di, j + dj));
  return a;
}
export function footprintValid(tiles: (Tile | null)[]) {
  if (tiles.some(t => !t)) return false;
  const h = tiles[0]!.h;
  return tiles.every(t => t!.h === h && !blocked(t) && t!.type !== 'musgo' && !t!.sprout && !t!.mark && !stumps.has(t!));
}
const centre = (tiles: Tile[]): [number, number, number] => {
  let x = 0, z = 0; tiles.forEach(t => { x += t.wx; z += t.wz; });
  return [x / tiles.length, topY(tiles[0]), z / tiles.length];
};

export function createBuilding(type: string, i: number, j: number, rot: number, animate: boolean, extra: Partial<SavedBuilding> = {}) {
  const tiles = footprint(type, i, j, rot) as Tile[];
  if (tiles.some(t => !t)) return null;
  for (const t of tiles) { removeTree(t); if (t.rock) { worldGroup.remove(t.rock); rocks.splice(rocks.indexOf(t.rock), 1); t.rock = null; } }
  const m = MODELS[type](); const g = m.group;
  const [cx, cy, cz] = centre(tiles);
  g.position.set(cx, cy, cz); g.rotation.y = rot * Math.PI / 2;
  const lvl = extra.lvl || 1, up = extra.up || 0;
  const need = up ? def(type).levels![up - 2].work : def(type).work || 1;
  const work = extra.work ?? (animate ? 0 : need);
  const b: Building = { type, i, j, rot, tiles, group: g, glow: m.glow, smokeAt: new THREE.Vector3(...m.smoke), jobs: extra.jobs ? [...extra.jobs] : Array(extra.queue || 0).fill('lingote'), prog: extra.prog || 0, prog2: extra.prog2 || 0, stoked: false, build: 1, work, need, scaffold: null, light: null, lvl, up, flag: null };
  g.traverse(o => { o.userData.building = b; });
  tiles.forEach(t => { t.building = b; });
  worldGroup.add(g); buildings.push(b);
  if (type === 'farol' || type === 'brasero') {
    const l = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ map: lightTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    l.position.set(cx, cy + 0.03, cz); l.renderOrder = 2; worldGroup.add(l); b.light = l;
  }
  if (!isDone(b)) {
    addScaffold(b);
    setRise(b);
    if (animate) for (const t of tiles) puff(t.wx, topY(t) + 0.1, t.wz, '#d8c8a8', 8, 1.6, 1.8, topY(t));
  }
  setFlag(b);
  rebuildDeco();
  emit('placed', b);
  if (isDone(b)) emit('built', b);
  return b;
}
function addScaffold(b: Building) {
  const [w0, d0] = def(b.type).size; const [w, d] = b.rot % 2 ? [d0, w0] : [w0, d0];
  const [cx, cy, cz] = centre(b.tiles);
  const sc = modelScaffold(w * 0.98, d * 0.98, Math.max(0.8, Math.min(2, (w + d) * 0.5)) + (b.up ? 0.3 : 0));
  sc.position.set(cx, cy, cz); sc.traverse(o => { o.userData.building = b; });
  worldGroup.add(sc); b.scaffold = sc;
}
/** Unfinished buildings rise out of the ground as the work goes on (an upgrade keeps its full size). */
function setRise(b: Building) { const k = b.work / b.need; b.group.scale.set(1, isDone(b) || b.up ? 1 : 0.1 + 0.8 * k, 1); }

/* A small pennant on the roof shows the level: one stripe per level above the first. */
const FLAG_COL = ['#f2c14e', '#7ec8e8', '#e86a8a', '#8ad96b'];
function setFlag(b: Building) {
  if (b.flag) { b.group.remove(b.flag); b.flag = null; }
  if (b.lvl < 2) return;
  const box = new THREE.Box3().setFromObject(b.group), top = box.max.y - b.group.position.y;
  const f = new THREE.Group();
  const mat = (c: string) => new THREE.MeshLambertMaterial({ color: c });
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), mat('#5e3a1e')); pole.position.y = 0.25; f.add(pole);
  for (let k = 0; k < b.lvl - 1; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.02), mat(FLAG_COL[k % FLAG_COL.length])); p.position.set(0.14, 0.44 - k * 0.1, 0); f.add(p); }
  const [w0] = def(b.type).size;
  f.position.set(w0 * 0.32, top - 0.05, 0); f.traverse(o => { o.userData.building = b; (o as THREE.Mesh).castShadow = true; });
  b.group.add(f); b.flag = f;
}

/** Starts the next level: pays, puts the scaffold back and waits for the hammer. Returns a reason when it cannot. */
export function startUpgrade(b: Building): string | null {
  const L = nextLevel(b);
  if (!L) return 'Ya está en su nivel más alto';
  if (levelLock(L)) return levelLock(L);
  if (!isDone(b)) return 'Termina la obra primero';
  if (!afford(L.cost)) return 'Te faltan materiales';
  pay(L.cost);
  b.up = b.lvl + 1; b.work = 0; b.need = L.work;
  addScaffold(b);
  for (const t of b.tiles) puff(t.wx, topY(t) + 0.3, t.wz, '#d8c8a8', 6, 1.4, 1.4, topY(t));
  emit('toast', `${L.title ? L.title : `Mejora en obra: ${def(b.type).name.toLowerCase()} nivel ${b.up}`}. Una figura la levanta a martillazos.`);
  emit('changed');
  return null;
}

/** One hammer blow. Returns true when this blow finishes the building. */
export function buildHit(b: Building, power = 1) {
  if (isDone(b)) return false;
  b.work = Math.min(b.need, b.work + power * hammerPower());
  const t = b.tiles[Math.floor(Math.random() * b.tiles.length)];
  puff(t.wx, topY(t) + 0.3, t.wz, '#d8c8a8', 4, 1.2, 1, topY(t));
  setRise(b);
  if (!isDone(b)) { emit('changed'); return false; }
  if (b.scaffold) { worldGroup.remove(b.scaffold); b.scaffold = null; }
  for (const q of b.tiles) puff(q.wx, topY(q) + 0.4, q.wz, '#fff0c0', 10, 2, 1.6, topY(q));
  emit('obraDone', !!def(b.type).deco);
  if (b.up) {
    b.lvl = b.up; b.up = 0; setFlag(b);
    const L = def(b.type).levels![b.lvl - 2];
    emit('toast', L.title ? `¡Listo! ${L.title.toLowerCase()}: ${L.text.toLowerCase()}` : `${def(b.type).name} nivel ${b.lvl}: ${L.text.toLowerCase()}`);
    emit('upgraded', b); emit('changed');
    return true;
  }
  emit('toast', `Obra terminada: ${def(b.type).name.toLowerCase()}`);
  emit('built', b); emit('changed');
  return true;
}
export function clearBuildings() { for (const b of buildings) { worldGroup.remove(b.group); if (b.scaffold) worldGroup.remove(b.scaffold); if (b.light) worldGroup.remove(b.light); } buildings.length = 0; }

const _v = new THREE.Vector3();
export function smokePoint(b: Building) { return b.group.localToWorld(_v.copy(b.smokeAt)); }

/** Queues a recipe at a production building. */
export function smelt(b: Building, recipe = 'lingote') {
  const R = RECIPES[recipe];
  if (!R || !isDone(b) || !afford(R.cost) || b.jobs.length >= MAX_QUEUE) return false;
  pay(R.cost); b.jobs.push(recipe); emit('changed'); return true;
}

function finishJob(b: Building, job: string) {
  const v = smokePoint(b).clone();
  if (job.startsWith('inv:')) finishInvention(job.slice(4));
  else {
    const R = RECIPES[job], out = R.out as ResKey, n = R.n || 1;
    if (out === 'lingote') S.made += n;
    S.stats[out] = (S.stats[out] || 0) + n;
    gain(out, n, v);
  }
  puff(v.x, v.y, v.z, '#ffd04a', 10, 2.2, 1.4);
  emit('smelted', b, job);
}

export function tickBuildings(dt: number) {
  for (const b of buildings) {
    if (!isDone(b)) continue;
    if ((b.type === 'farol' || b.type === 'muelle') && b.glow) {
      const f = lampK * (1 + 0.06 * Math.sin(performance.now() / 180 + b.i));
      (b.glow.material as THREE.MeshBasicMaterial).color.setRGB(0.4 + 2.6 * f, 0.3 + 1.5 * f, 0.12 + 0.4 * f);
      if (b.light) { (b.light.material as THREE.MeshBasicMaterial).opacity = 0.55 * f; b.light.visible = f > 0.02; }
    }
    if (makesThings(b.type)) {
      const job = b.jobs[0], on = !!job;
      if (on) {
        // the furnace at level 2 has a second fire working on the next job at the same time
        const job2 = b.type === 'horno' && b.lvl >= 2 ? b.jobs[1] : undefined;
        b.prog += dt / jobSeconds(b.type, job, b.stoked);
        if (job2) b.prog2 += dt / jobSeconds(b.type, job2, b.stoked); else b.prog2 = 0;
        if (b.prog >= 1) { b.prog = b.prog2; b.prog2 = 0; b.jobs.shift(); finishJob(b, job); }
        else if (job2 && b.prog2 >= 1) { b.prog2 = 0; b.jobs.splice(1, 1); finishJob(b, job2); }
        if (b.type === 'horno' && Math.random() < dt * (b.stoked ? 12 : 6)) { const v = smokePoint(b); smoke(v.x, v.y, v.z, Math.random() < 0.5 ? '#c8c4be' : '#a8a49e'); }
        if (b.type === 'aserradero' && Math.random() < dt * 8) { const v = smokePoint(b); puff(v.x, v.y - 0.3, v.z, '#e0c08a', 2, 1.2, 1, v.y - 0.6); }
      }
      if (b.glow && b.type === 'taller') { const f = on ? 2 + 0.3 * Math.sin(performance.now() / 150) : 0.4 + lampK * 1.5; (b.glow.material as THREE.MeshBasicMaterial).color.setRGB(2.2 * f / 2, 1.7 * f / 2, 0.6 * f / 2); }
      else if (b.glow) {
        const f = on ? (b.stoked ? 2.4 : 1.6) + 0.5 * Math.sin(performance.now() / 110) + 0.3 * Math.sin(performance.now() / 43) : 0.18;
        (b.glow.material as THREE.MeshBasicMaterial).color.setRGB(2.4 * f * glowMul, 0.9 * f * glowMul, 0.22 * f * glowMul);
      }
    }
    if (b.type === 'casa' && Math.random() < dt * 1.2) { const v = smokePoint(b); smoke(v.x, v.y, v.z, '#d8d4ce', 0.05, 1.8); }
    b.stoked = false; // set again next frame while Brasa keeps fanning
  }
}

/* ---------- placement with the yellow guide ---------- */
export interface Placement { type: string; rot: number; i: number; j: number; ghost: THREE.Group; valid: boolean }
export let place: Placement | null = null;
const fpGroup = new THREE.Group(); scene.add(fpGroup);
const FP_OK = new THREE.MeshBasicMaterial({ color: '#f2c14e', transparent: true, opacity: 0.5, depthWrite: false });
const FP_BAD = new THREE.MeshBasicMaterial({ color: '#ff5a4a', transparent: true, opacity: 0.5, depthWrite: false });
const EDGE_OK = new THREE.LineBasicMaterial({ color: '#fff0b0' }), EDGE_BAD = new THREE.LineBasicMaterial({ color: '#ffc0b0' });
const planeGeo = new THREE.PlaneGeometry(0.94, 0.94); planeGeo.rotateX(-Math.PI / 2);
const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.98, 0.04, 0.98));
const GHOST = new THREE.MeshStandardMaterial({ color: '#fff4d0', transparent: true, opacity: 0.6, depthWrite: false, roughness: 0.8 });

export function startPlace(type: string, at: Tile) {
  cancelPlace();
  const ghost = MODELS[type]().group;
  ghost.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = GHOST; m.castShadow = false; } });
  scene.add(ghost);
  place = { type, rot: 0, i: at.i, j: at.j, ghost, valid: false };
  updatePlace();
}
export function movePlace(t: Tile) { if (!place) return; place.i = t.i; place.j = t.j; updatePlace(); }
export function rotatePlace() { if (!place) return; place.rot = (place.rot + 1) % 4; updatePlace(); }
function updatePlace() {
  if (!place) return;
  while (fpGroup.children.length) fpGroup.remove(fpGroup.children[0]);
  if (def(place.type).coast) { const r = seaSide(place.i, place.j); if (r >= 0) place.rot = r; }
  const tiles = footprint(place.type, place.i, place.j, place.rot);
  place.valid = footprintValid(tiles) && (!def(place.type).coast || seaSide(place.i, place.j) >= 0);
  for (const t of tiles) {
    if (!t) continue;
    const y = topY(t) + 0.025;
    const m = new THREE.Mesh(planeGeo, place.valid ? FP_OK : FP_BAD); m.position.set(t.wx, y, t.wz); m.renderOrder = 5; fpGroup.add(m);
    const e = new THREE.LineSegments(edgeGeo, place.valid ? EDGE_OK : EDGE_BAD); e.position.set(t.wx, y, t.wz); fpGroup.add(e);
  }
  const real = tiles.filter(Boolean) as Tile[];
  if (real.length) { const [cx, cy, cz] = centre(real); place.ghost.position.set(cx, cy + 0.02, cz); }
  place.ghost.rotation.y = place.rot * Math.PI / 2;
  emit('placeChanged', place);
}
export function cancelPlace() {
  if (!place) return;
  scene.remove(place.ghost);
  while (fpGroup.children.length) fpGroup.remove(fpGroup.children[0]);
  place = null; emit('placeChanged', null);
}
/** Pays and builds. Returns the building, or a reason it could not be placed. */
export function confirmPlace(): Building | string {
  if (!place || !place.valid) return 'Ese lugar no sirve';
  const d = def(place.type);
  if (!afford(d.cost)) return 'Te faltan materiales';
  pay(d.cost);
  const type = place.type, at = tileAt(place.i + 1, place.j) || tileAt(place.i, place.j)!, rot = place.rot;
  const b = createBuilding(type, place.i, place.j, place.rot, true)!;
  cancelPlace();
  // decoration: stay in placing mode for another one while materials last
  if (d.deco && afford(d.cost)) { startPlace(type, at); if (place) { place.rot = rot; movePlace(at); } }
  return b;
}
export const buildingDef = def;
