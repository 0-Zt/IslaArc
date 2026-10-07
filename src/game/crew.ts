import * as THREE from 'three';
import { emit, on } from '../core/events';
import { lerp, smoothstep, angleLerp } from '../core/random';
import { makeCanvas } from '../core/canvas';
import { scene, glowMul } from '../render/renderer';
import { lampK } from '../render/daynight';
import { tileAt, tileUnder, topY, walkable, landTiles, DIRS, type Tile } from '../world/island';
import { spawnLeaf, type Tree } from '../world/trees';
import { puff } from '../world/particles';
import { buildFigure, type CharId, type Figure, type ToolKey } from '../assets/characters';
import { hitAncient, digMound, type Ancient } from './grove';
import { removeStump } from './forest';
import { completeMark, nearestMark, type Mark, type MarkKind } from './marks';
import { fillHit, sites, type Site } from './expansion';
import { S, DATA, gain, isFull, type ResKey } from './state';
import { workSpeed } from './progress';
import { walkBoost, shovelHits } from './production';
import { collectAt } from './beach';
import { sfx, type Sfx } from '../audio/sfx';
import { buildings, buildHit, isDone, type Building } from './buildings';

export type JobKind = 'tree' | 'rock' | 'sand' | 'soil' | 'stump' | 'fill' | 'ancient' | 'dig' | 'plant' | 'path' | 'build' | 'avivar' | 'recoger' | 'pescar' | 'walk';
export interface Job { kind: JobKind; tile: Tile }
export interface Crew extends Figure {
  job: Job | null; path: Tile[]; anim: 'idle' | 'walk' | 'work' | 'wave' | 'fish';
  /** fishing pose: 0 = holding the rod, 1 = rod thrown forward (cast), -1 = pulled back (strike) */
  swing?: number;
  t: number; phase: number; blink: number; dir: number; hits: number;
  toolKey: ToolKey; workHit: boolean; lastStep: number; off: number; offz: number;
  light?: THREE.Mesh;
  /** the gathering job the figure goes back to after a one-off task (a build, a plot, a mark) */
  last?: Job;
  /** seconds left of a little celebration jump (stage or chapter done) */
  cheer?: number;
}
const GATHER: JobKind[] = ['tree', 'rock', 'sand', 'soil'];
const GATHER_RES: Partial<Record<JobKind, ResKey>> = { tree: 'madera', rock: 'piedra', sand: 'arena', soil: 'tierra' };
/** The material a figure cannot gather because the store is full (it waits, then goes on by itself). */
export const blockedBy = (c: Crew): ResKey | null => { const r = c.job && !c.path.length ? GATHER_RES[c.job.kind] : undefined; return r && isFull(r) ? r : null; };

const blob = new THREE.CanvasTexture(makeCanvas(64, 64, x => {
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
}));

export const crew: Crew[] = [];
const lampGeo = new THREE.PlaneGeometry(2.2, 2.2);
const lampTex = new THREE.CanvasTexture(makeCanvas(64, 64, x => {
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,220,160,0.9)'); g.addColorStop(0.5, 'rgba(255,180,90,0.3)'); g.addColorStop(1, 'rgba(255,150,60,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
}));
export let selected: CharId | null = null;
export function select(id: CharId | null) { selected = id; emit('changed'); }
export const tileOf = (c: Crew) => tileUnder(c.root.position.x, c.root.position.z);
export const occupied = (t: Tile) => crew.some(c => tileOf(c) === t);

export function spawnCrew(id: CharId, tile: Tile) {
  const f = buildFigure(id, blob);
  const c: Crew = Object.assign(f, {
    job: null, path: [], anim: 'idle' as const, t: 0, phase: Math.random() * 6, blink: 2 + Math.random() * 3,
    dir: Math.PI / 4, hits: 0, toolKey: 'axe' as ToolKey, workHit: false, lastStep: 0,
    off: (crew.length % 2 ? 1 : -1) * 0.12, offz: crew.length % 2 ? -0.08 : 0.08,
  });
  c.root.position.set(tile.wx, topY(tile), tile.wz); c.root.rotation.y = c.dir;
  scene.add(c.root); crew.push(c); emit('changed');
  return c;
}
export function clearCrew() { for (const c of crew) scene.remove(c.root); crew.length = 0; selected = null; }

function setAnim(c: Crew, a: Crew['anim']) { if (c.anim !== a) { c.anim = a; c.t = 0; c.workHit = false; } }
function setTool(c: Crew, kind: JobKind) {
  c.toolKey = kind === 'tree' || kind === 'ancient' ? (S.tools.hacha ? 'axeM' : 'axe') : kind === 'rock' ? (S.tools.pico ? 'pickM' : 'pick') : kind === 'build' ? 'hammer' : kind === 'pescar' ? 'rod' : kind === 'avivar' ? ('' as ToolKey) : 'shovel';
}
/** Ends a one-off task: goes back to what the figure was gathering, or rests. */
export const finishTask = (c: Crew) => stop(c);
export function refreshTools() { for (const c of crew) if (c.job) setTool(c, c.job.kind); }

/* ---------- pathfinding (grid BFS; steps of at most one level) ---------- */
const adjacent = (a: Tile, b: Tile) => Math.abs(a.i - b.i) + Math.abs(a.j - b.j) === 1;
export function bfs(start: Tile, goal: (t: Tile) => boolean): Tile[] | null {
  const K = (t: Tile) => t.j * 1000 + t.i;
  const prev = new Map<number, Tile | null>([[K(start), null]]); const q = [start];
  while (q.length) {
    const t = q.shift()!;
    if (goal(t)) { const path: Tile[] = []; let n: Tile | null = t; while (n && n !== start) { path.unshift(n); n = prev.get(K(n))!; } return path; }
    for (const [di, dj] of DIRS) {
      const n = tileAt(t.i + di, t.j + dj);
      if (!n || !walkable(n) || prev.has(K(n)) || Math.abs(n.h - t.h) > 1) continue;
      prev.set(K(n), t); q.push(n);
    }
  }
  return null;
}

/** Sends a figure to work on (or walk to) a tile. Returns a reason when it cannot. */
export function order(c: Crew, tile: Tile, kind: JobKind): true | string {
  const here = tileOf(c); if (!here) return 'No hay camino hasta ahí';
  const standOn = kind === 'walk' || kind === 'sand' || kind === 'soil' || kind === 'path' || kind === 'recoger';
  const b: Building | undefined = kind === 'build' || kind === 'avivar' || kind === 'pescar' ? tile.building : undefined;
  const reach = standOn ? (t: Tile) => t === tile
    : b ? (t: Tile) => b.tiles.some(q => adjacent(t, q) && Math.abs(t.h - q.h) <= 1)   // any side of a building site
    : (t: Tile) => adjacent(t, tile) && Math.abs(t.h - tile.h) <= 1;
  const path = bfs(here, reach);
  if (!path) return kind === 'dig' ? 'Los árboles antiguos no dejan pasar' : 'No hay camino hasta ahí';
  c.job = { kind, tile }; c.path = path; c.hits = 0;
  if (GATHER.includes(kind)) c.last = { kind, tile };
  else if (kind === 'walk') c.last = undefined;          // sent somewhere on purpose: stay there
  if (!path.length) arrive(c); else setAnim(c, 'walk');
  emit('changed');
  return true;
}
function arrive(c: Crew) {
  const j = c.job;
  if (!j || j.kind === 'walk') { c.job = null; setAnim(c, 'idle'); emit('changed'); return; }
  const p = c.root.position;
  if (j.kind === 'recoger') { collectAt(j.tile, c); stop(c); return; }
  if (j.kind === 'pescar') { setTool(c, 'pescar'); setAnim(c, 'fish'); emit('fishArrive', c); emit('changed'); return; }
  if ((j.kind === 'build' || j.kind === 'avivar') && j.tile.building) { const bt = j.tile.building.tiles as Tile[]; const n = bt.reduce((a, q) => Math.hypot(q.wx - p.x, q.wz - p.z) < Math.hypot(a.wx - p.x, a.wz - p.z) ? q : a, bt[0]); c.dir = Math.atan2(n.wx - p.x, n.wz - p.z); }
  else if (j.kind !== 'sand' && j.kind !== 'soil' && j.kind !== 'path') c.dir = Math.atan2(j.tile.wx - p.x, j.tile.wz - p.z);
  setTool(c, j.kind); setAnim(c, 'work'); emit('changed');
}
function idle(c: Crew) { c.job = null; c.path = []; setAnim(c, 'idle'); emit('changed'); }
/** A task ended: go back to what the figure was gathering before, or rest. */
function stop(c: Crew) {
  const l = c.last;
  idle(c);
  if (!l) return;
  if (l.kind === 'tree') { nextTree(c, l.tile); return; }
  const still = l.kind === 'rock' ? !!l.tile.rock : l.kind === 'sand' ? l.tile.type === 'arena' : l.tile.type === 'tierra' || (l.tile.type === 'piedras' && !l.tile.rock);
  if (!still || order(c, l.tile, l.kind) !== true) { c.last = undefined; idle(c); }
}

export function statusOf(c: Crew) {
  if (c.path.length) return 'Caminando';
  const j = c.job; if (!j) return 'Esperando órdenes';
  if (blockedBy(c)) return 'Almacén lleno';
  return ({ tree: 'Talando', rock: 'Picando piedra', sand: 'Juntando arena', soil: 'Cavando tierra', stump: 'Arrancando tocón', fill: 'Rellenando parcela', ancient: 'Talando árbol antiguo', dig: 'Cavando', plant: 'Plantando', path: 'Haciendo sendero', build: 'Construyendo', avivar: 'Avivando el horno', recoger: 'Recogiendo', pescar: 'Pescando', walk: 'Esperando' } as const)[j.kind];
}

function nearestTile(c: Crew, test: (t: Tile) => boolean, max = 6, from?: Tile) {
  const here = from || tileOf(c); if (!here) return null;
  let best: Tile | null = null, bd = 1e9;
  for (const t of landTiles()) { if (!test(t)) continue; const d = Math.abs(t.i - here.i) + Math.abs(t.j - here.j); if (d < bd && d <= max) { bd = d; best = t; } }
  return best;
}
/** After finishing a mark, the figure moves on to the nearest open mark of the same kind. */
function nextMark(c: Crew, kind: MarkKind) {
  const here = tileOf(c);
  const m = here && nearestMark(here, kind, t => crew.some(o => o !== c && o.job?.tile === t));
  if (!m || order(c, m.tile, kind) !== true) stop(c);
}
/** After finishing a building, the figure moves on to the nearest unfinished one nobody is working on. */
export function nextBuild(c: Crew) {
  const here = tileOf(c); if (!here) { stop(c); return; }
  const open = buildings.filter(b => !isDone(b) && !crew.some(o => o !== c && o.job?.kind === 'build' && o.job.tile.building === b))
    .sort((a, b) => (Math.abs(a.i - here.i) + Math.abs(a.j - here.j)) - (Math.abs(b.i - here.i) + Math.abs(b.j - here.j)));
  for (const b of open) if (order(c, b.tiles[0], 'build') === true) return;
  stop(c);
}
/** Sends the nearest free figure to an unfinished building. Returns it, or null when everyone is busy. */
export function assignIdleBuilder(): Crew | null {
  if (crew.some(c => c.job?.kind === 'build')) return null;
  for (const c of crew.filter(q => !q.job && !q.path.length)) { nextBuild(c); if (c.job?.kind === 'build') return c; }
  return null;
}
/** After filling a plot, the figure walks on to the nearest plot that still needs filling. */
export function nextSite(c: Crew) {
  const here = tileOf(c); if (!here) { stop(c); return; }
  const free = sites.filter(s => !crew.some(o => o !== c && o.job?.tile === s.tile))
    .sort((a, b) => (Math.abs(a.i - here.i) + Math.abs(a.j - here.j)) - (Math.abs(b.i - here.i) + Math.abs(b.j - here.j)));
  for (const s of free) if (order(c, s.tile, 'fill') === true) return;
  stop(c);
}
/** Keeps chopping: the nearest standing tree around the figure (or around where it was working). */
function nextTree(c: Crew, near?: Tile) {
  const free = (t: Tile) => !!t.tree && !t.tree.falling && !crew.some(o => o !== c && o.job?.tile === t);
  const t = nearestTile(c, free, 10, near);
  if (t && order(c, t, 'tree') === true) return;
  c.last = undefined; idle(c);
  emit('toast', `${c.def.name} no encuentra más árboles cerca`);
}

/* ---------- what each swing does ---------- */
const p0 = (c: Crew) => c.root.position;
const headPos = (c: Crew, dy = 0) => c.root.position.clone().add(new THREE.Vector3(0, 1 + dy, 0));

const HIT_SFX: Partial<Record<JobKind, Sfx>> = { tree: 'chop', ancient: 'chop', rock: 'pick', sand: 'dig', soil: 'dig', stump: 'dig', fill: 'dig', dig: 'dig', plant: 'dig', path: 'dig', build: 'hammer', avivar: 'fire' };
function onWorkHit(c: Crew) {
  const j = c.job; if (!j) return;
  c.hits++;
  const fx = HIT_SFX[j.kind]; if (fx) sfx(fx, selected === c.id || crew.length === 1 ? 1 : 0.7);
  const B = DATA.BALANCE;
  switch (j.kind) {
    case 'tree': {
      const tr: Tree | undefined = j.tile.tree;
      if (!tr || tr.falling) { nextTree(c); return; }
      tr.shake = 1; spawnLeaf(tr); spawnLeaf(tr); if (Math.random() < 0.5) spawnLeaf(tr);
      if (tr.hp == null) tr.hp = 3 + Math.round([0.7, 1, 1.35][tr.si] * 3);
      tr.hp--;
      if (c.hits % (S.tools.hacha ? B.woodEveryHitsMetal : B.woodEveryHits) === 0) gain('madera', 1, headPos(c));
      if (tr.hp <= 0) { tr.falling = 0.001; tr.fallDir = Math.atan2(tr.x - c.root.position.x, tr.z - c.root.position.z); tr.feller = c; setTimeout(() => { if (c.job?.tile === j.tile) nextTree(c); }, 450); }
      break;
    }
    case 'rock': {
      const m = j.tile.rock; if (m) m.userData.shake = 1;
      if (c.hits % B.stoneEveryHits === 0) {
        gain('piedra', 1, headPos(c));
        if (Math.random() < (S.tools.pico ? B.mineralChanceMetal : B.mineralChance)) {
          // Brasa's heat melts some ore right in the rock
          if (c.id === 'brasa' && Math.random() < 0.4) { gain('lingote', 1, headPos(c, 0.35)); S.made++; puff(p0(c).x, p0(c).y + 0.6, p0(c).z, '#ffb040', 6, 1.6, 1); }
          else gain('mineral', 1, headPos(c, 0.35));
        }
      }
      break;
    }
    case 'sand': {
      const p = c.root.position;
      puff(p.x + Math.sin(c.root.rotation.y) * 0.35, p.y + 0.06, p.z + Math.cos(c.root.rotation.y) * 0.35, '#f0d890', 6, 1.6, 1.2, p.y);
      if (c.hits % B.sandEveryHits === 0) gain('arena', 1, headPos(c));
      break;
    }
    case 'soil': {
      const p = c.root.position;
      puff(p.x + Math.sin(c.root.rotation.y) * 0.35, p.y + 0.06, p.z + Math.cos(c.root.rotation.y) * 0.35, '#7a5030', 6, 1.6, 1.2, p.y);
      if (c.hits % (S.inv.palaM ? 1 : B.soilEveryHits) === 0) gain('tierra', 1, headPos(c));
      break;
    }
    case 'stump': {
      if (c.hits >= shovelHits(B.stumpDigHits)) {
        const r = removeStump(j.tile);
        if (r === 'stump') { gain('tierra', 1, headPos(c)); emit('toast', 'Tocón arrancado: ahí ya no volverá a crecer un árbol'); }
        if (r === 'sprout') { gain('semilla', 1, headPos(c)); emit('toast', 'Retoño arrancado: recuperas la semilla'); }
        stop(c);
      }
      else puff(j.tile.wx, topY(j.tile) + 0.1, j.tile.wz, '#7a5030', 5, 1.4, 1.2, topY(j.tile));
      break;
    }
    case 'fill': {
      const s: Site | undefined = (j.tile as any).site;
      if (!s || !s.group.parent) { stop(c); return; }
      if (fillHit(s, S.inv.palaM ? 2 : 1)) { emit('toast', 'La isla creció una casilla'); nextSite(c); }
      break;
    }
    case 'plant': case 'path': {
      const m: Mark | undefined = j.tile.mark;
      if (!m || m.kind !== j.kind) { nextMark(c, j.kind); return; }
      const p = c.root.position;
      puff(j.kind === 'path' ? p.x + Math.sin(c.root.rotation.y) * 0.3 : j.tile.wx, topY(j.tile) + 0.06, j.kind === 'path' ? p.z + Math.cos(c.root.rotation.y) * 0.3 : j.tile.wz, '#7a5030', 5, 1.4, 1.1, topY(j.tile));
      if (c.hits >= shovelHits(j.kind === 'plant' ? B.plantHits : B.pathHits)) {
        completeMark(m, c.id);
        if (j.kind === 'plant' && !S.flags.plantHint) { S.flags.plantHint = true; emit('toast', 'Semilla plantada. Crecerá sola con el tiempo.'); }
        c.hits = 0; nextMark(c, j.kind);
      }
      break;
    }
    case 'build': {
      const b: Building | undefined = j.tile.building;
      if (!b || isDone(b)) { nextBuild(c); return; }
      if (buildHit(b, c.id === 'arci' ? 1.5 : 1)) { c.hits = 0; setTimeout(() => { if (c.job?.kind === 'build') nextBuild(c); }, 500); }
      break;
    }
    case 'avivar': {
      const b: Building | undefined = j.tile.building;
      if (!b) { stop(c); return; }
      const v = b.group.position; puff(v.x + (Math.random() - 0.5) * 0.4, v.y + 0.4, v.z + (Math.random() - 0.5) * 0.4, '#ffb040', 5, 1.6, 1);
      if (!S.flags.avivado) { S.flags.avivado = true; emit('toast', 'Con Brasa soplando, el horno trabaja el doble de rápido'); emit('changed'); }
      break;
    }
    case 'ancient': {
      const a: Ancient | undefined = j.tile.ancient;
      if (!a || a.falling) { stop(c); return; }
      const r = hitAncient(a, c.root.position, !!S.tools.hacha);
      if (r === 'bounce') { emit('toast', 'El hacha de piedra rebota en la corteza antigua. Hace falta metal.'); stop(c); }
      if (r === 'felled') { gain('madera', 4, headPos(c)); emit('toast', 'El árbol antiguo cae. Ya se puede entrar al claro.'); setTimeout(() => stop(c), 600); }
      emit('changed');
      break;
    }
    case 'dig': {
      if (digMound()) {
        stop(c);
        const t = j.tile;
        const m = spawnCrew('musgo', t);
        m.anim = 'wave'; m.t = 0; S.crew.push('musgo');
        puff(t.wx, topY(t) + 0.2, t.wz, '#8ad96b', 16, 2, 1.6, topY(t));
        setTimeout(() => { if (!m.job) setAnim(m, 'idle'); }, 2600);
        emit('toast', 'Musgo sale de la tierra, se sacude y se une al equipo');
        emit('changed');
      }
      break;
    }
  }
}

/** Everyone jumps with arms up and clay confetti flies: a stage or chapter is done. */
const CONFETTI = ['#f2c14e', '#c98655', '#8ad96b', '#e86a5a', '#7ec8e8', '#fff0d0'];
export function cheer(seconds = 1.8) {
  crew.forEach((c, k) => {
    c.cheer = seconds + k * 0.12;
    const p = c.root.position;
    for (const col of CONFETTI) puff(p.x, p.y + 1.1, p.z, col, 3, 2.6, 1.8, p.y);
  });
}

/* ---------- per-frame update: movement and hand-made clay animation ---------- */
export function updateCrew(dt: number, T: number) {
  for (const c of crew) updateOne(c, dt, T);
}
function updateOne(c: Crew, dt: number, T: number) {
  c.t += dt; const p = c.root.position;
  if (c.path.length) {
    const t = c.path[0], tx = t.wx + c.off, tz = t.wz + c.offz, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), sp = DATA.BALANCE.walkSpeed * dt * walkBoost() * (tileOf(c)?.type === 'sendero' ? DATA.BALANCE.pathSpeed : 1);
    if (d <= sp) { p.x = tx; p.z = tz; c.path.shift(); if (!c.path.length) arrive(c); }
    else { p.x += dx / d * sp; p.z += dz / d * sp; c.dir = Math.atan2(dx, dz); if (c.anim !== 'walk') setAnim(c, 'walk'); }
  }
  // a full store pauses gathering; the figure picks it up again as soon as there is room
  if (c.job && !c.path.length && GATHER_RES[c.job.kind]) {
    const full = !!blockedBy(c);
    if (full && c.anim === 'work') setAnim(c, 'idle');
    else if (!full && c.anim === 'idle') setAnim(c, 'work');
  }
  const u = tileOf(c); if (u) p.y = lerp(p.y, topY(u), Math.min(1, dt * 12));
  c.root.rotation.y = angleLerp(c.root.rotation.y, c.dir, Math.min(1, dt * 9));
  c.blink -= dt; const bl = c.blink < 0 ? Math.max(0.1, Math.abs(c.blink + 0.07) / 0.07) : 1; if (c.blink < -0.14) c.blink = 2 + Math.random() * 4;
  c.eyes.forEach(e => { e.scale.y = bl; });

  const [L, R] = c.arms, [hl, hr] = c.hips;
  let sy = 1, sxz = 1, bob = 0, lean = 0, hx = 0, hz = 0;
  L.rotation.set(0, 0, 0); R.rotation.set(0, 0, 0); hl.rotation.set(0, 0, 0); hr.rotation.set(0, 0, 0); c.head.rotation.set(0, 0, 0);
  for (const k in c.tools) c.tools[k as ToolKey].visible = (c.anim === 'work' && k === c.toolKey) || (c.anim === 'fish' && k === 'rod');
  if (c.anim === 'idle') {
    const b = Math.sin(T * 2.3 + c.phase); sy = 1 + 0.035 * b; sxz = 1 - 0.018 * b; L.rotation.z = 0.12 + 0.04 * b; R.rotation.z = -0.12 - 0.04 * b; hz = Math.sin(T * 0.7 + c.phase) * 0.12; hx = Math.sin(T * 0.5 + c.phase) * 0.05;
  } else if (c.anim === 'walk') {
    const ph = c.t * 10.5, s = Math.sin(ph);
    hl.rotation.x = -s * 0.65; hr.rotation.x = s * 0.65; L.rotation.x = s * 0.55; R.rotation.x = -s * 0.55; L.rotation.z = 0.18; R.rotation.z = -0.18;
    const contact = 1 - Math.abs(s); bob = Math.abs(s) * 0.045; sy = 1 - 0.07 * contact; sxz = 1 + 0.035 * contact; lean = 0.08; hz = Math.sin(ph * 0.5) * 0.06;
    const step = Math.floor(ph / Math.PI); if (step !== c.lastStep) { c.lastStep = step; if (Math.random() < 0.4) puff(p.x, p.y + 0.03, p.z, '#d8c8a8', 2, 0.6, 0.6, p.y); }
  } else if (c.anim === 'work') {
    const cyc = DATA.BALANCE.workCycle / workSpeed(), q = (c.t % cyc) / cyc; let a: number;
    if (q < 0.55) { const k = smoothstep(0, 0.55, q); a = lerp(0, -2.85, k); sy = 1 + 0.07 * k; sxz = 1 - 0.035 * k; lean = -0.12 * k; hx = -0.15 * k; }
    else if (q < 0.66) { const k = smoothstep(0.55, 0.66, q); a = lerp(-2.85, -0.75, k); lean = lerp(-0.12, 0.2, k); sy = lerp(1.07, 0.86, k); sxz = lerp(0.965, 1.09, k); hx = lerp(-0.15, 0.12, k); }
    else { const k = smoothstep(0.66, 1, q); a = lerp(-0.75, 0, k); lean = lerp(0.2, 0, k); sy = lerp(0.86, 1, k); sxz = lerp(1.09, 1, k); hx = lerp(0.12, 0, k); }
    R.rotation.x = a; L.rotation.x = a * 0.55; L.rotation.z = 0.15; R.rotation.z = -0.08;
    if (q >= 0.66 && !c.workHit) {
      c.workHit = true;
      const fx = p.x + Math.sin(c.root.rotation.y) * 0.4, fz = p.z + Math.cos(c.root.rotation.y) * 0.4, k = c.job?.kind;
      if (k !== 'sand' && k !== 'dig' && k !== 'soil' && k !== 'fill' && k !== 'plant' && k !== 'path' && k !== 'build') puff(fx, p.y + 0.25, fz, k === 'rock' ? '#b8b2a8' : '#c9a06a', 6, 1.8, 1.4, p.y);
      onWorkHit(c);
    }
    if (q < 0.3) c.workHit = false;
  } else if (c.anim === 'fish') {
    // holding the rod out over the water; `swing` throws it forward (cast) or yanks it back (strike)
    const w = c.swing || 0, b = Math.sin(T * 1.8 + c.phase);
    R.rotation.x = -1.05 - 0.9 * Math.max(0, -w) + 0.55 * Math.max(0, w) + 0.03 * b; R.rotation.z = -0.1;
    L.rotation.x = -0.7 - 0.4 * Math.max(0, -w); L.rotation.z = 0.25;
    lean = 0.05 * w - 0.12 * Math.max(0, -w); sy = 1 + 0.02 * b; hx = 0.12 + 0.05 * b;
  } else if (c.anim === 'wave') {
    const w = Math.sin(c.t * 11); R.rotation.z = -2.55 + w * 0.35; L.rotation.z = 0.15; sy = 1 + 0.03 * Math.sin(c.t * 5.5); hz = -0.12 + w * 0.04; bob = Math.max(0, Math.sin(c.t * 5.5)) * 0.03;
  }
  if (c.cheer && c.cheer > 0) {
    // celebration on top of whatever the figure is doing: hops with both arms up
    c.cheer -= dt;
    const h = Math.abs(Math.sin(c.t * 8 + c.phase));
    bob = h * 0.28; sy = 1 + 0.08 * h; sxz = 1 - 0.04 * h; lean = 0;
    L.rotation.set(0, 0, 2.5 + 0.25 * h); R.rotation.set(0, 0, -2.5 - 0.25 * h); hx = -0.15;
    for (const k in c.tools) c.tools[k as ToolKey].visible = false;
  }
  c.body.scale.set(sxz, sy, sxz); c.body.position.y = bob; c.body.rotation.x = lean; c.head.rotation.x = hx; c.head.rotation.z = hz;
  if (c.job?.kind === 'avivar' && c.anim === 'work' && c.job.tile.building) c.job.tile.building.stoked = true;
  // a small pool of light at night: Brasa always glows, the others once the lantern is invented
  const glows = c.id === 'brasa' || !!S.inv.linterna;
  if (glows && lampK > 0.02) {
    if (!c.light) { c.light = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ map: lampTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: c.id === 'brasa' ? '#ffa050' : '#ffe0a0' })); c.light.rotation.x = -Math.PI / 2; c.light.position.y = 0.03; c.root.add(c.light); }
    c.light.visible = true; (c.light.material as THREE.MeshBasicMaterial).opacity = lampK * (c.id === 'brasa' ? 0.55 : 0.45);
  } else if (c.light) c.light.visible = false;
  c.ring.visible = selected === c.id; if (c.ring.visible) { const s = 1 + Math.sin(T * 6) * 0.08; c.ring.scale.set(s, s, s); }
  if (c.def.glow) { const g = (1.1 + 0.35 * Math.sin(T * 3.1)) * glowMul; c.glowMat.color.setRGB(2.4 * g, 0.8 * g, 0.16 * g); }
  if (c.flame) { const f = Math.sin(T * 17 + c.phase) * 0.08 + Math.sin(T * 7.3) * 0.06; c.flame.scale.set(1 - f * 0.5, 1 + f, 1 - f * 0.5); c.flame.rotation.z = Math.sin(T * 5) * 0.08; }
}

/* Figures standing where a building goes step out of its footprint. */
on('placed', (b: Building) => {
  for (const c of crew) if (b.tiles.includes(tileOf(c)!)) {
    const out = bfs(b.tiles[0], t => walkable(t));
    if (out && out.length) { const d = out[out.length - 1]; c.root.position.set(d.wx, topY(d), d.wz); stop(c); }
  }
});
