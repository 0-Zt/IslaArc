import * as THREE from 'three';
import { emit, on } from '../core/events';
import { lerp, smoothstep, angleLerp } from '../core/random';
import { makeCanvas } from '../core/canvas';
import { scene, glowMul } from '../render/renderer';
import { tileAt, tileUnder, topY, walkable, landTiles, DIRS, type Tile } from '../world/island';
import { spawnLeaf, type Tree } from '../world/trees';
import { puff } from '../world/particles';
import { buildFigure, type CharId, type Figure, type ToolKey } from '../assets/characters';
import { hitAncient, digMound, type Ancient } from './grove';
import { S, DATA, gain } from './state';
import type { Building } from './buildings';

export type JobKind = 'tree' | 'rock' | 'sand' | 'ancient' | 'dig' | 'walk';
export interface Job { kind: JobKind; tile: Tile }
export interface Crew extends Figure {
  job: Job | null; path: Tile[]; anim: 'idle' | 'walk' | 'work' | 'wave';
  t: number; phase: number; blink: number; dir: number; hits: number;
  toolKey: ToolKey; workHit: boolean; lastStep: number; off: number; offz: number;
}

const blob = new THREE.CanvasTexture(makeCanvas(64, 64, x => {
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
}));

export const crew: Crew[] = [];
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
  c.toolKey = kind === 'tree' || kind === 'ancient' ? (S.tools.hacha ? 'axeM' : 'axe') : kind === 'rock' ? (S.tools.pico ? 'pickM' : 'pick') : 'shovel';
}
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
  const reach = kind === 'walk' || kind === 'sand' ? (t: Tile) => t === tile : (t: Tile) => adjacent(t, tile) && Math.abs(t.h - tile.h) <= 1;
  const path = bfs(here, reach);
  if (!path) return kind === 'dig' ? 'Los árboles antiguos no dejan pasar' : 'No hay camino hasta ahí';
  c.job = { kind, tile }; c.path = path; c.hits = 0;
  if (!path.length) arrive(c); else setAnim(c, 'walk');
  emit('changed');
  return true;
}
function arrive(c: Crew) {
  const j = c.job;
  if (!j || j.kind === 'walk') { c.job = null; setAnim(c, 'idle'); emit('changed'); return; }
  const p = c.root.position;
  if (j.kind !== 'sand') c.dir = Math.atan2(j.tile.wx - p.x, j.tile.wz - p.z);
  setTool(c, j.kind); setAnim(c, 'work'); emit('changed');
}
function stop(c: Crew) { c.job = null; c.path = []; setAnim(c, 'idle'); emit('changed'); }

export function statusOf(c: Crew) {
  if (c.path.length) return 'Caminando';
  const j = c.job; if (!j) return 'Esperando órdenes';
  return ({ tree: 'Talando', rock: 'Picando piedra', sand: 'Juntando arena', ancient: 'Talando árbol antiguo', dig: 'Cavando', walk: 'Esperando' } as const)[j.kind];
}

function nearestTile(c: Crew, test: (t: Tile) => boolean, max = 6) {
  const here = tileOf(c); if (!here) return null;
  let best: Tile | null = null, bd = 1e9;
  for (const t of landTiles()) { if (!test(t)) continue; const d = Math.abs(t.i - here.i) + Math.abs(t.j - here.j); if (d < bd && d <= max) { bd = d; best = t; } }
  return best;
}
function nextTree(c: Crew) {
  const t = nearestTile(c, t => !!t.tree && !t.tree.falling && !crew.some(o => o !== c && o.job?.tile === t));
  if (!t || order(c, t, 'tree') !== true) stop(c);
}

/* ---------- what each swing does ---------- */
const headPos = (c: Crew, dy = 0) => c.root.position.clone().add(new THREE.Vector3(0, 1 + dy, 0));

function onWorkHit(c: Crew) {
  const j = c.job; if (!j) return;
  c.hits++;
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
        if (Math.random() < (S.tools.pico ? B.mineralChanceMetal : B.mineralChance)) gain('mineral', 1, headPos(c, 0.35));
      }
      break;
    }
    case 'sand': {
      const p = c.root.position;
      puff(p.x + Math.sin(c.root.rotation.y) * 0.35, p.y + 0.06, p.z + Math.cos(c.root.rotation.y) * 0.35, '#f0d890', 6, 1.6, 1.2, p.y);
      if (c.hits % B.sandEveryHits === 0) gain('arena', 1, headPos(c));
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

/* ---------- per-frame update: movement and hand-made clay animation ---------- */
export function updateCrew(dt: number, T: number) {
  for (const c of crew) updateOne(c, dt, T);
}
function updateOne(c: Crew, dt: number, T: number) {
  c.t += dt; const p = c.root.position;
  if (c.path.length) {
    const t = c.path[0], tx = t.wx + c.off, tz = t.wz + c.offz, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), sp = DATA.BALANCE.walkSpeed * dt;
    if (d <= sp) { p.x = tx; p.z = tz; c.path.shift(); if (!c.path.length) arrive(c); }
    else { p.x += dx / d * sp; p.z += dz / d * sp; c.dir = Math.atan2(dx, dz); if (c.anim !== 'walk') setAnim(c, 'walk'); }
  }
  const u = tileOf(c); if (u) p.y = lerp(p.y, topY(u), Math.min(1, dt * 12));
  c.root.rotation.y = angleLerp(c.root.rotation.y, c.dir, Math.min(1, dt * 9));
  c.blink -= dt; const bl = c.blink < 0 ? Math.max(0.1, Math.abs(c.blink + 0.07) / 0.07) : 1; if (c.blink < -0.14) c.blink = 2 + Math.random() * 4;
  c.eyes.forEach(e => { e.scale.y = bl; });

  const [L, R] = c.arms, [hl, hr] = c.hips;
  let sy = 1, sxz = 1, bob = 0, lean = 0, hx = 0, hz = 0;
  L.rotation.set(0, 0, 0); R.rotation.set(0, 0, 0); hl.rotation.set(0, 0, 0); hr.rotation.set(0, 0, 0); c.head.rotation.set(0, 0, 0);
  for (const k in c.tools) c.tools[k as ToolKey].visible = c.anim === 'work' && k === c.toolKey;
  if (c.anim === 'idle') {
    const b = Math.sin(T * 2.3 + c.phase); sy = 1 + 0.035 * b; sxz = 1 - 0.018 * b; L.rotation.z = 0.12 + 0.04 * b; R.rotation.z = -0.12 - 0.04 * b; hz = Math.sin(T * 0.7 + c.phase) * 0.12; hx = Math.sin(T * 0.5 + c.phase) * 0.05;
  } else if (c.anim === 'walk') {
    const ph = c.t * 10.5, s = Math.sin(ph);
    hl.rotation.x = -s * 0.65; hr.rotation.x = s * 0.65; L.rotation.x = s * 0.55; R.rotation.x = -s * 0.55; L.rotation.z = 0.18; R.rotation.z = -0.18;
    const contact = 1 - Math.abs(s); bob = Math.abs(s) * 0.045; sy = 1 - 0.07 * contact; sxz = 1 + 0.035 * contact; lean = 0.08; hz = Math.sin(ph * 0.5) * 0.06;
    const step = Math.floor(ph / Math.PI); if (step !== c.lastStep) { c.lastStep = step; if (Math.random() < 0.4) puff(p.x, p.y + 0.03, p.z, '#d8c8a8', 2, 0.6, 0.6, p.y); }
  } else if (c.anim === 'work') {
    const cyc = DATA.BALANCE.workCycle, q = (c.t % cyc) / cyc; let a: number;
    if (q < 0.55) { const k = smoothstep(0, 0.55, q); a = lerp(0, -2.85, k); sy = 1 + 0.07 * k; sxz = 1 - 0.035 * k; lean = -0.12 * k; hx = -0.15 * k; }
    else if (q < 0.66) { const k = smoothstep(0.55, 0.66, q); a = lerp(-2.85, -0.75, k); lean = lerp(-0.12, 0.2, k); sy = lerp(1.07, 0.86, k); sxz = lerp(0.965, 1.09, k); hx = lerp(-0.15, 0.12, k); }
    else { const k = smoothstep(0.66, 1, q); a = lerp(-0.75, 0, k); lean = lerp(0.2, 0, k); sy = lerp(0.86, 1, k); sxz = lerp(1.09, 1, k); hx = lerp(0.12, 0, k); }
    R.rotation.x = a; L.rotation.x = a * 0.55; L.rotation.z = 0.15; R.rotation.z = -0.08;
    if (q >= 0.66 && !c.workHit) {
      c.workHit = true;
      const fx = p.x + Math.sin(c.root.rotation.y) * 0.4, fz = p.z + Math.cos(c.root.rotation.y) * 0.4, k = c.job?.kind;
      if (k !== 'sand' && k !== 'dig') puff(fx, p.y + 0.25, fz, k === 'rock' ? '#b8b2a8' : '#c9a06a', 6, 1.8, 1.4, p.y);
      onWorkHit(c);
    }
    if (q < 0.3) c.workHit = false;
  } else if (c.anim === 'wave') {
    const w = Math.sin(c.t * 11); R.rotation.z = -2.55 + w * 0.35; L.rotation.z = 0.15; sy = 1 + 0.03 * Math.sin(c.t * 5.5); hz = -0.12 + w * 0.04; bob = Math.max(0, Math.sin(c.t * 5.5)) * 0.03;
  }
  c.body.scale.set(sxz, sy, sxz); c.body.position.y = bob; c.body.rotation.x = lean; c.head.rotation.x = hx; c.head.rotation.z = hz;
  c.ring.visible = selected === c.id; if (c.ring.visible) { const s = 1 + Math.sin(T * 6) * 0.08; c.ring.scale.set(s, s, s); }
  if (c.def.glow) { const g = (1.2 + 0.5 * Math.sin(T * 3.1)) * glowMul; c.glowMat.color.setRGB(2.6 * g, 1.05 * g, 0.28 * g); }
}

/* Figures standing where a building goes step out of its footprint. */
on('built', (b: Building) => {
  for (const c of crew) if (b.tiles.includes(tileOf(c)!)) {
    const out = bfs(b.tiles[0], t => walkable(t));
    if (out && out.length) { const d = out[out.length - 1]; c.root.position.set(d.wx, topY(d), d.wz); stop(c); }
  }
});
