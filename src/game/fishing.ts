import * as THREE from 'three';
import FISH from '../data/fishing.json';
import { scene, flyTo, camera, controls, cameraOffset } from '../render/renderer';
import { makeCanvas } from '../core/canvas';
import { emit, on } from '../core/events';
import { tileUnder, tileAt, walkable, topY, DIRS } from '../world/island';
import { S, gain, pay, type ResKey } from './state';
import { buildings, isDone, type Building } from './buildings';
import { crew, order, select, selected, finishTask, tileOf, type Crew } from './crew';
import { addStars, bump } from './progress';
import { isNight } from '../render/daynight';
import { puff } from '../world/particles';
import { sfx } from '../audio/sfx';
import { LORE_TEXT } from './beach';
import { XICON } from '../ui/hud';
import { deepAt, surgeAt, outOfSea } from '../world/sea';

/* Fishing from the pier. Clay figures do not catch fish: the sea gives back things.
   Like Animal Crossing, shadows move in the water and their size hints at what they are;
   a cast near one makes it come, nibble a few times and then bite — tap on the bite, not
   before. Big shadows then pull back (a short tug like Stardew Valley's). Everything caught
   goes into the Sea collection in the Diary. */

export type Size = 's' | 'm' | 'l';
export interface FishItem {
  name: string; size: Size; tier: 'orilla' | 'media' | 'profunda'; w: number; desc: string;
  gives?: Partial<Record<ResKey, number>>; stars?: number; lore?: boolean; pieces?: number;
  time?: 'noche' | 'dia'; after?: string; once?: boolean; story?: string; special?: boolean;
}
export const ITEMS = FISH.items as Record<string, FishItem>;
export const STORY = FISH.story as Record<string, { title: string; text: string }>;
const PIECES = FISH.pieces as string[];
const WATER_Y = 0.14;
const SIZE_LABEL: Record<Size, string> = { s: 'Sombra pequeña', m: 'Sombra mediana', l: 'Sombra grande' };
export const sizeLabel = (s: Size) => SIZE_LABEL[s];

/* ---------- the pier ---------- */
const pier = () => buildings.find(b => b.type === 'muelle' && isDone(b)) || null;
const facing = (b: Building) => new THREE.Vector3(Math.sin(b.rot * Math.PI / 2), 0, Math.cos(b.rot * Math.PI / 2));
/** Where the line leaves from (end of the pier), and where the fisher stands. */
export function pierTip(b: Building, along = 1.3) { const f = facing(b); return b.group.position.clone().add(f.multiplyScalar(along)).setY(b.group.position.y + 0.06); }

/* Where someone fishes from: the end of the pier, or the raft out at sea. `stand` is where the
   fisher stands and `dir` where they face; the line leaves a little ahead of `stand`. */
export interface Spot { stand: THREE.Vector3; dir: THREE.Vector3; raft: boolean }
const pierSpot = (b: Building): Spot => ({ stand: pierTip(b, 1.05), dir: facing(b), raft: false });
const ahead = (sp: Spot, d: number) => sp.stand.clone().addScaledVector(sp.dir, d);
let raftSpot: () => Spot | null = () => null;
/** The raft module tells where the raft is while it is out at sea. */
export function setRaftSpot(f: () => Spot | null) { raftSpot = f; }
const anchor = (): Spot | null => raftSpot() || (pier() ? pierSpot(pier()!) : null);

/* ---------- shadows in the water ---------- */
interface Shadow { x: number; z: number; size: Size; deep: boolean; mesh: THREE.Mesh; tx: number; tz: number; retarget: number; life: number; age: number; mode: 'wander' | 'approach' | 'flee'; special: boolean; spark: number }
export const shadows: Shadow[] = [];
const shTex = new THREE.CanvasTexture(makeCanvas(64, 96, x => {
  const g = x.createRadialGradient(32, 52, 4, 32, 52, 34);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.ellipse(32, 52, 22, 34, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.moveTo(32, 16); x.lineTo(20, 2); x.lineTo(44, 2); x.closePath(); x.fillStyle = 'rgba(255,255,255,.55)'; x.fill();   // a little tail
}));
const shGeo = new THREE.PlaneGeometry(1, 1.5); shGeo.rotateX(-Math.PI / 2);
const SCALE: Record<Size, number> = { s: 0.42, m: 0.66, l: 0.95 };
let spawnIn = 4;

const isWater = (x: number, z: number) => !tileUnder(x, z) && !outOfSea(x, z) && !surgeAt(x, z);
const openWater = (x: number, z: number, r: number) => isWater(x, z) && isWater(x + r, z) && isWater(x - r, z) && isWater(x, z + r) && isWater(x, z - r);

function addShadow(x: number, z: number, size: Size, special = false) {
  const deep = !special && !!deepAt(x, z);
  const mat = new THREE.MeshBasicMaterial({ map: shTex, color: special ? '#3a2a08' : deep ? '#01060f' : '#0a1a30', transparent: true, opacity: 0, depthWrite: false });
  const m = new THREE.Mesh(shGeo, mat); m.scale.setScalar(SCALE[size] * (deep ? 1.15 : 1)); m.renderOrder = 3; m.position.set(x, WATER_Y + 0.012, z);
  scene.add(m);
  const s: Shadow = { x, z, size, deep, mesh: m, tx: x, tz: z, retarget: 0, life: special ? 1e9 : 55 + Math.random() * 35, age: 0, mode: 'wander', special, spark: 0 };
  shadows.push(s); return s;
}
function removeShadow(s: Shadow) { scene.remove(s.mesh); (s.mesh.material as THREE.Material).dispose(); shadows.splice(shadows.indexOf(s), 1); }
function rollSize(bait = false, deep = false): Size { const r = Math.random(); return deep ? (r < 0.55 ? 'm' : 'l') : bait ? (r < 0.45 ? 's' : r < 0.85 ? 'm' : 'l') : (r < 0.62 ? 's' : r < 0.91 ? 'm' : 'l'); }
/** A spot of open water in front of where the fisher is (all around, on the raft), `near` an optional point. */
function spotNear(sp: Spot, near?: THREE.Vector3) {
  const tip = ahead(sp, 0.25), f = sp.dir;
  for (let k = 0; k < 24; k++) {
    let x: number, z: number;
    if (near) { const a = Math.random() * Math.PI * 2, d = 0.6 + Math.random() * 1.2; x = near.x + Math.cos(a) * d; z = near.z + Math.sin(a) * d; }
    else { const a = sp.raft ? Math.random() * Math.PI * 2 : Math.atan2(f.x, f.z) + (Math.random() - 0.5) * 2.6, d = (sp.raft ? 1.3 : 1.6) + Math.random() * 3.2; x = tip.x + Math.sin(a) * d; z = tip.z + Math.cos(a) * d; }
    if (openWater(x, z, 0.4)) return [x, z] as const;
  }
  return null;
}
function tickShadows(dt: number, T: number) {
  const sp = anchor(), b = pier();
  if (!sp) { while (shadows.length) removeShadow(shadows[0]); return; }
  // the chest that Marea left: it waits by the pier, shining, until someone pulls it out
  if (b && S.fish.llave && !S.fish.cofre && !shadows.some(s => s.special)) { const p = spotNear(pierSpot(b)); if (p) addShadow(p[0], p[1], 'l', true); }
  spawnIn -= dt;
  if (spawnIn <= 0) {
    spawnIn = (sp.raft ? 5 : 7) + Math.random() * 7;
    const near = shadows.filter(s => !s.special && s.mode !== 'flee' && Math.hypot(s.x - sp.stand.x, s.z - sp.stand.z) < 7).length;
    if (near < 3) { const p = spotNear(sp); if (p) addShadow(p[0], p[1], rollSize(false, !!deepAt(p[0], p[1]))); }
  }
  for (const s of [...shadows]) {
    s.age += dt;
    // shadows left far behind by the raft fade away
    if (!s.special && s.mode === 'wander' && ses?.target !== s && Math.hypot(s.x - sp.stand.x, s.z - sp.stand.z) > 9 && s.life > s.age + 3) s.life = s.age + 3;
    const mat = s.mesh.material as THREE.MeshBasicMaterial;
    const fadeIn = Math.min(1, s.age / 2), fadeOut = s.mode === 'flee' ? Math.max(0, 1 - (s.age - s.life) / 1.2) : Math.min(1, Math.max(0, (s.life - s.age) / 3));
    mat.opacity = (s.special ? 0.6 : 0.42) * fadeIn * fadeOut;
    if (ses?.target === s && s.mode !== 'flee') s.life = Math.max(s.life, s.age + 5);   // a shadow on the hook does not wander off
    if ((s.mode !== 'flee' && s.age > s.life) || (s.mode === 'flee' && s.age > s.life + 1.2)) { if (ses?.target === s) ses.target = null; removeShadow(s); continue; }
    if (s.mode === 'wander') {
      s.retarget -= dt;
      if (s.retarget <= 0) { s.retarget = 1.5 + Math.random() * 2.5; const a = Math.random() * Math.PI * 2, d = 0.3 + Math.random() * 0.8; const nx = s.x + Math.cos(a) * d, nz = s.z + Math.sin(a) * d; if (openWater(nx, nz, 0.3)) { s.tx = nx; s.tz = nz; } }
      moveTo(s, s.tx, s.tz, 0.22 * dt);
    } else if (s.mode === 'flee') moveTo(s, s.tx, s.tz, 1.8 * dt);
    if (s.special) { s.spark -= dt; if (s.spark <= 0) { s.spark = 0.35; puff(s.x + (Math.random() - 0.5) * 0.6, WATER_Y + 0.05, s.z + (Math.random() - 0.5) * 0.6, '#ffe070', 2, 1.2, 0.4); } }
    s.mesh.position.set(s.x, WATER_Y + 0.012 + Math.sin(T * 2 + s.x) * 0.004, s.z);
  }
}
function moveTo(s: Shadow, tx: number, tz: number, step: number) {
  const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
  if (d < 1e-3) return;
  const k = Math.min(1, step / d); s.x += dx * k; s.z += dz * k;
  s.mesh.rotation.y = Math.atan2(dx, dz) + Math.PI;
}
function flee(s: Shadow | null | undefined) {
  if (!s || s.special && false) return;
  if (s.special) { s.mode = 'wander'; return; }   // the chest does not swim away
  s.mode = 'flee'; s.life = s.age;
  const a = Math.random() * Math.PI * 2; s.tx = s.x + Math.cos(a) * 3; s.tz = s.z + Math.sin(a) * 3;
}

/* ---------- bobber, line and the "!" ---------- */
const bobber = new THREE.Group();
{ const m = (c: string) => new THREE.MeshLambertMaterial({ color: c });
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), m('#f4f0e8')); a.position.y = 0.03; bobber.add(a);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), m('#d9463c')); b.position.y = 0.09; bobber.add(b);
  const c = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.08, 0.025), m('#3a2e24')); c.position.y = 0.16; bobber.add(c); }
bobber.visible = false; scene.add(bobber);
const LINE_N = 14;
const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_N * 3), 3));
const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#f4f0e8', transparent: true, opacity: 0.85 }));
line.visible = false; line.frustumCulled = false; scene.add(line);
const bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(makeCanvas(32, 48, x => { x.fillStyle = '#2a1a08'; x.fillRect(10, 2, 12, 30); x.fillRect(10, 36, 12, 10); x.fillStyle = '#f2c14e'; x.fillRect(13, 5, 6, 24); x.fillRect(13, 39, 6, 5); })), depthTest: false, toneMapped: false }));
bang.scale.set(0.35, 0.5, 1); bang.renderOrder = 999; bang.visible = false; scene.add(bang);
const _tip = new THREE.Vector3();
function rodTip(c: Crew) { const t = c.tools.rod?.getObjectByName('tip'); return t ? t.getWorldPosition(_tip) : _tip.copy(c.root.position).setY(c.root.position.y + 1); }
function drawLine(c: Crew) {
  const a = rodTip(c), b = bobber.position, p = lineGeo.attributes.position as THREE.BufferAttribute;
  const sag = Math.min(0.5, a.distanceTo(b) * 0.12);
  for (let k = 0; k < LINE_N; k++) { const t = k / (LINE_N - 1); p.setXYZ(k, a.x + (b.x - a.x) * t, a.y + (b.y + 0.12 - a.y) * t - Math.sin(Math.PI * t) * sag, a.z + (b.z - a.z) * t); }
  p.needsUpdate = true;
}

/* ---------- the session at the pier ---------- */
type St = 'walking' | 'ready' | 'casting' | 'wait' | 'approach' | 'nibble' | 'bite' | 'pull' | 'card';
interface Session {
  c: Crew; b: Building | null; sp: () => Spot; onEnd: (() => void) | null; st: St; t: number;
  from: THREE.Vector3; to: THREE.Vector3; target: Shadow | null;
  nibbles: number; next: number; dip: number; look: number;
  item: string | null; story: string[]; cam: { target: THREE.Vector3; zoom: number; off: THREE.Vector3 } | null;
}
let ses: Session | null = null;
export const fishingActive = () => !!ses;
export const fishState = () => ses ? { st: ses.st, who: ses.c.id, target: ses.target && { size: ses.target.size, x: ses.target.x, z: ses.target.z } } : null;
export const fisher = () => ses?.c || null;

/** Sends a figure to the pier and enters fishing mode. Returns a reason when it cannot. */
export function startFishing(b: Building): string | null {
  if (ses) { focus(); return null; }
  if (!isDone(b)) return 'El muelle todavía está en obra';
  const sel = selected ? crew.find(c => c.id === selected) : null;
  const tip = pierTip(b);
  const who = sel || crew.find(c => c.id === 'marea' && !c.job) || [...crew].sort((p, q) => (p.job ? 1 : 0) - (q.job ? 1 : 0) || p.root.position.distanceTo(tip) - q.root.position.distanceTo(tip))[0];
  if (!who) return 'No hay nadie para pescar';
  // the session exists before the order: a figure already next to the pier arrives at once
  ses = { c: who, b, sp: () => pierSpot(b), onEnd: null, st: 'walking', t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), target: null, nibbles: 0, next: 0, dip: 0, look: 0, item: null, story: [], cam: { target: controls.target.clone(), zoom: camera.zoom, off: cameraOffset() } };
  const r = order(who, b.tiles[0], 'pescar');
  if (r !== true) { ses = null; return r; }
  select(null);
  focus();
  emit('fishMode', true); bar();
  return null;
}
/** Fishing from the raft: the figure is already on board; `onEnd` hands control back to sailing. */
export function startSpotFishing(c: Crew, sp: () => Spot, onEnd: () => void) {
  if (ses) return;
  ses = { c, b: null, sp, onEnd, st: 'ready', t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), target: null, nibbles: 0, next: 0, dip: 0, look: 0, item: null, story: [], cam: null };
  setTool(c); emit('fishMode', true); bar();
}
function setTool(c: Crew) { c.anim = 'fish'; c.holding = 'rod'; }
/** Looks out to sea from behind the fisher, at the usual isometric height. */
function focus() {
  if (!ses) return;
  const sp = ses.sp(), f = sp.dir, side = new THREE.Vector3(-f.z, 0, f.x), off = cameraOffset();
  const h = off.y, flat = Math.hypot(off.x, off.z);
  const dir = f.clone().multiplyScalar(-Math.SQRT1_2).addScaledVector(side, Math.SQRT1_2).multiplyScalar(flat).setY(h);
  flyTo(ahead(sp, 1.35).setY(0.3), Math.max(camera.zoom, innerWidth < innerHeight ? 1.25 : 1.6), dir);
}

export function stopFishing() {
  if (!ses) return;
  const s = ses; ses = null;
  bobber.visible = line.visible = bang.visible = false; hidePull(); hideCard(); bar();
  if (s.target && s.target.mode === 'approach') s.target.mode = 'wander';
  const c = s.c; c.swing = 0;
  if (s.onEnd) { s.onEnd(); emit('fishMode', false); emit('changed'); return; }   // back to sailing
  // step back onto the island, next to the pier
  const t0 = s.b!.tiles[0];
  const back = DIRS.map(([a, b]) => tileAt(t0.i + a, t0.j + b)).find(t => t && walkable(t));
  if (back) c.root.position.set(back.wx + c.off, topY(back), back.wz + c.offz);
  if (c.job?.kind === 'pescar') finishTask(c);
  if (s.cam) flyTo(s.cam.target, s.cam.zoom, s.cam.off);
  emit('fishMode', false); emit('changed');
}

on('fishArrive', (c: Crew) => {
  if (!ses || ses.c !== c) return;
  const sp = ses.sp();
  c.root.position.copy(sp.stand); c.dir = Math.atan2(sp.dir.x, sp.dir.z); c.holding = 'rod';
  ses.st = 'ready'; bar();
});

/** Throws seeds as bait: a new shadow comes, more often a bigger one. */
export function useBait() {
  if (!ses || ses.st === 'walking') return;
  if (S.res.semilla < 1) { emit('toast', 'No quedan semillas para usar de carnada'); return; }
  const sp = ses.sp(), near = bobber.visible ? bobber.position.clone() : ahead(sp, 1.6);
  const p = spotNear(sp, near); if (!p) { emit('toast', 'Ahí no hay agua abierta'); return; }
  pay({ semilla: 1 } as any);
  puff(near.x, WATER_Y + 0.05, near.z, '#c8a060', 8, 1.2, 1);
  addShadow(p[0], p[1], rollSize(true, !!deepAt(p[0], p[1])));
  emit('toast', 'Tiras unas semillas al agua… algo se acerca'); bar();
}

/** A tap while fishing (the ray already aims at the screen point). Returns true when used. */
export function fishTap(ray: THREE.Raycaster): boolean {
  if (!ses) return false;
  const s = ses;
  switch (s.st) {
    case 'walking': emit('toast', `${s.c.def.name} va camino al muelle`); return true;
    case 'card': closeCard(); return true;
    case 'casting': case 'pull': return true;
    case 'ready': {
      const p = new THREE.Vector3(); if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_Y), p)) return true;
      const sp = s.sp(), tip = ahead(sp, 0.25), d = p.clone().sub(tip).setY(0);
      if (!isWater(p.x, p.z) || d.length() < 0.7 || d.length() > 5.5 || (!sp.raft && d.normalize().dot(sp.dir) < 0.15)) { emit('toast', sp.raft ? 'Lanza al agua, un poco más lejos' : 'Lanza al agua, frente al muelle'); return true; }
      if (sp.raft) { const v = p.clone().sub(sp.stand); s.c.dir = Math.atan2(v.x, v.z); }
      cast(p); return true;
    }
    case 'wait': case 'approach': reel(); return true;
    case 'nibble': emit('toast', '¡Muy pronto! Se asustó'); sfx('splash', 0.4); flee(s.target); s.target = null; s.st = 'wait'; bar(); return true;
    case 'bite': hook(); return true;
  }
  return true;
}
function cast(p: THREE.Vector3) {
  const s = ses!; s.st = 'casting'; s.t = 0; s.from.copy(rodTip(s.c)); s.to.copy(p).setY(WATER_Y);
  bobber.visible = line.visible = true; sfx('cast'); bar();
}
function reel() { const s = ses!; if (s.target && s.target.mode === 'approach') s.target.mode = 'wander'; s.target = null; bobber.visible = line.visible = false; s.st = 'ready'; sfx('tap'); bar(); }

/** What comes out of a shadow of this size, now. */
function roll(sh: Shadow): string {
  if (sh.special) return 'cofre';
  if (sh.deep) {
    // Marea's compass is the first medium thing out of the dark water; her ship's wheel the first big one after it
    if (sh.size === 'm' && !S.fish.brujula) return 'brujula';
    if (sh.size === 'l' && S.fish.brujula && !S.fish.timon) return 'timon';
  }
  // story beats never depend on luck: the key is the first medium catch once the vase is whole,
  // and a vase piece comes at the latest every 5th small catch
  if (sh.size === 'm' && !S.fish.llave && (S.fish.vasija || 0) >= 4 && S.tools.anzuelo) return 'llave';
  if (sh.size === 's' && (S.fish.vasija || 0) < 4) {
    S.stats.sinPieza = (S.stats.sinPieza || 0) + 1;
    if (S.stats.sinPieza >= 5) { S.stats.sinPieza = 0; return 'vasija'; }
  }
  const night = isNight();
  const ok = Object.entries(ITEMS).filter(([id, it]) => {
    if (it.size !== sh.size || (it.tier === 'profunda') !== sh.deep || it.w <= 0) return false;
    if (it.time === 'noche' && !night) return false;
    if (it.time === 'dia' && night) return false;
    if (it.once && S.fish[id]) return false;
    if (it.pieces && (S.fish[id] || 0) >= it.pieces) return false;
    if (it.after) { const need = ITEMS[it.after].pieces || 1; if ((S.fish[it.after] || 0) < need) return false; }
    if (it.after === 'vasija' && !S.tools.anzuelo) return false;
    if (it.lore && S.lore.length >= LORE_TEXT.length) return false;
    return true;
  });
  if (!ok.length) return sh.deep ? (sh.size === 'm' ? 'cobre' : 'hundido') : sh.size === 's' ? 'alga' : sh.size === 'm' ? 'engranaje' : 'ancla';
  let r = Math.random() * ok.reduce((a, [, it]) => a + it.w, 0);
  for (const [id, it] of ok) { r -= it.w; if (r <= 0) { if (id === 'vasija') S.stats.sinPieza = 0; return id; } }
  return ok[0][0];
}
function hook() {
  const s = ses!; const sh = s.target; bang.visible = false;
  if (!sh) { s.st = 'wait'; bar(); return; }
  s.c.swing = -1;
  if (sh.size !== 's' && !S.tools.anzuelo) {
    sfx('snap'); flee(sh); s.target = null; bobber.visible = line.visible = false; s.st = 'ready';
    emit('toast', 'El gancho de madera se dobló y se escapó. En la casa se fabrica el anzuelo de metal.');
    S.flags.anzueloHint = true; bar(); return;
  }
  s.item = roll(sh);
  if (sh.size === 'l') { s.st = 'pull'; startPull(sh.special); bar(); return; }
  land();
}
function land() {
  if (ses?.c.id === 'marea' && !S.flags.pescaMarea) { S.flags.pescaMarea = true; emit('changed'); }
  const s = ses!; const sh = s.target; const id = s.item!;
  if (sh) { puff(sh.x, WATER_Y + 0.1, sh.z, '#bfe6ff', 12, 2.2, 1.4); removeShadow(sh); }
  s.target = null; bobber.visible = line.visible = false; s.c.swing = 0;
  sfx('catch');
  s.st = 'card'; showCard(id, reward(id)); bar();
}
function reward(id: string) {
  const it = ITEMS[id], first = !S.fish[id];
  S.fish[id] = (S.fish[id] || 0) + 1; bump('pescados'); if (it.tier === 'profunda') bump('hondos');
  const at = ses!.c.root.position.clone().setY(ses!.c.root.position.y + 1.1);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(it.gives || {})) { gain(k as ResKey, v as number, at); lines.push(`+${v} ${k === 'algas' ? 'algas' : k}`); }
  if (it.stars) { addStars(it.stars, null); lines.push(`+${it.stars} ★`); }
  let extra = '';
  if (it.lore) { const next = LORE_TEXT.findIndex((_, i) => !S.lore.includes(i)); if (next >= 0) { S.lore.push(next); bump('botellas'); extra = LORE_TEXT[next]; } }
  if (it.pieces) { const n = S.fish[id]; extra = PIECES[n - 1] || ''; lines.push(`Trozo ${n} de ${it.pieces}`); if (n === it.pieces) ses!.story.push('vasija'); }
  if (it.story) ses!.story.push(it.story);
  if (id === 'cofre') S.flags.planoBalsa = true;
  // finishing a row of the collection
  for (const [tier, flag, stars] of [['orilla', 'colOrilla', 3], ['media', 'colMedia', 5], ['profunda', 'colHondo', 8]] as const) {
    if (S.flags[flag]) continue;
    const ids = Object.entries(ITEMS).filter(([, q]) => q.tier === tier).map(([k]) => k);
    if (ids.every(k => S.fish[k])) { S.flags[flag] = true; addStars(stars, null); lines.push(`Fila de ${tier === 'orilla' ? 'la orilla' : tier === 'media' ? 'aguas medias' : 'agua oscura'} completa: +${stars} ★`); }
  }
  emit('fishCaught', id); emit('changed');
  return { first, lines, extra };
}

/* ---------- the tug (big shadows) ---------- */
const pull = { on: false, fish: 0.5, ft: 0.5, fnext: 0, zone: 0.335, zv: 0, prog: 0.4, hold: false, heavy: false, t: 0 };
/* Tuned with a simulated player (scratch pullsim): the green zone is about twice as fast as what bites,
   so it can always be caught; the first second never counts against you. */
const ZONE = 0.33, ZONE_SPEED = 1.1;
function startPull(heavy: boolean) {
  Object.assign(pull, { on: true, fish: 0.5, ft: 0.5, fnext: 0.8, zone: 0.5 - ZONE / 2, zv: 0, prog: 0.4, hold: false, heavy, t: 0 });
  el('fishPull').hidden = false;
}
function hidePull() { pull.on = false; const e = document.getElementById('fishPull'); if (e) e.hidden = true; }
function tickPull(dt: number) {
  if (!pull.on || !ses) return;
  const auto = (globalThis as any).__fishAuto;
  pull.fnext -= dt; pull.t += dt;
  // what bit darts to a new spot every second or two, never across the whole bar at once
  if (pull.fnext <= 0) { pull.fnext = (pull.heavy ? 0.7 : 0.9) + Math.random() * 1.0; pull.ft = Math.max(0.03, Math.min(0.97, pull.fish + (Math.random() * 2 - 1) * 0.75)); }
  pull.fish += Math.sign(pull.ft - pull.fish) * Math.min(Math.abs(pull.ft - pull.fish), dt * (pull.heavy ? 0.74 : 0.55));
  const hold = auto ? pull.zone + ZONE / 2 < pull.fish : pull.hold;
  // the zone answers quickly (a little weight, no long slide)
  pull.zv += ((hold ? ZONE_SPEED : -ZONE_SPEED) - pull.zv) * Math.min(1, dt * 6);
  pull.zone += pull.zv * dt;
  if (pull.zone < 0) { pull.zone = 0; pull.zv = Math.max(0, pull.zv) * 0.3; }
  if (pull.zone > 1 - ZONE) { pull.zone = 1 - ZONE; pull.zv = Math.min(0, pull.zv) * 0.3; }
  const inside = pull.fish >= pull.zone && pull.fish <= pull.zone + ZONE;
  pull.prog += (inside ? 0.22 : pull.t < 1 ? 0 : -0.17) * dt;
  ses.c.swing = inside ? -0.6 + Math.sin(performance.now() / 90) * 0.15 : -0.2;
  if (ses.target) { const tip = ahead(ses.sp(), 0.25); ses.target.x += (tip.x - ses.target.x) * dt * (inside ? 0.15 : -0.05); ses.target.z += (tip.z - ses.target.z) * dt * (inside ? 0.15 : -0.05); bobber.position.set(ses.target.x, WATER_Y - 0.06, ses.target.z); }
  const e = document.getElementById('fishPull');
  if (e) {
    (e.querySelector('.pz') as HTMLElement).style.left = `${pull.zone * 100}%`;
    (e.querySelector('.pf') as HTMLElement).style.left = `${pull.fish * 100}%`;
    (e.querySelector('.pp i') as HTMLElement).style.width = `${Math.max(0, Math.min(1, pull.prog)) * 100}%`;
    e.classList.toggle('in', inside); e.classList.toggle('hold', hold);
  }
  if (pull.prog >= 1) { hidePull(); land(); }
  else if (pull.prog <= 0) {
    hidePull(); sfx('snap'); emit('toast', 'Se soltó… era pesado. Inténtalo de nuevo.');
    flee(ses.target); ses.target = null; bobber.visible = line.visible = false; ses.st = 'ready'; ses.c.swing = 0; bar();
  }
}

/* ---------- per frame ---------- */
export function tickFishing(dt: number, T: number) {
  tickShadows(dt, T);
  if (!ses) return;
  const s = ses, c = s.c;
  const sp = s.sp(), busy = c.job?.kind === 'pescar' || (sp.raft && c.job?.kind === 'navegar');
  if (s.st !== 'walking' && !busy) { stopFishing(); return; }
  if (s.st === 'walking') { if (!busy) { ses = null; emit('fishMode', false); } return; }
  c.root.position.copy(sp.stand);
  if (c.swing) c.swing *= Math.pow(0.02, dt);   // the arm settles back
  if (Math.abs(c.swing || 0) < 0.01) c.swing = 0;
  const auto = (globalThis as any).__fishAuto;
  if ((s.st === 'approach' || s.st === 'nibble' || s.st === 'bite') && !s.target) { s.st = 'wait'; bang.visible = false; bar(); }
  switch (s.st) {
    case 'casting': {
      s.t += dt / 0.55; c.swing = 1 - s.t;
      const k = Math.min(1, s.t);
      bobber.position.lerpVectors(s.from, s.to, k); bobber.position.y = s.from.y + (s.to.y - s.from.y) * k + Math.sin(Math.PI * k) * 0.9;
      if (k >= 1) {
        s.st = 'wait'; s.look = 0.4; sfx('plop'); puff(s.to.x, WATER_Y + 0.05, s.to.z, '#d8f0ff', 6, 1.2, 0.8);
        for (const sh of shadows) if (Math.hypot(sh.x - s.to.x, sh.z - s.to.z) < 0.32 * SCALE[sh.size] / 0.42) { flee(sh); emit('toast', 'Le cayó encima: se asustó'); }
        bar();
      }
      break;
    }
    case 'wait': {
      bobber.position.set(s.to.x, WATER_Y + Math.sin(T * 3) * 0.01, s.to.z);
      s.look -= dt;
      if (s.look <= 0) {
        s.look = 0.5;
        // Marea reads the water: things come to her line from farther and sooner
        const mk = s.c.id === 'marea' ? 1.6 : 1;
        const near = shadows.filter(sh => sh.mode === 'wander' && Math.hypot(sh.x - s.to.x, sh.z - s.to.z) < (sh.special ? 3.5 : 2.4) * mk).sort((a, b) => Math.hypot(a.x - s.to.x, a.z - s.to.z) - Math.hypot(b.x - s.to.x, b.z - s.to.z))[0];
        if (near && Math.random() < (mk > 1 ? 0.95 : 0.6)) { s.target = near; near.mode = 'approach'; s.st = 'approach'; bar(); }
      }
      break;
    }
    case 'approach': {
      const sh = s.target; if (!sh) { s.st = 'wait'; break; }
      bobber.position.set(s.to.x, WATER_Y + Math.sin(T * 3) * 0.01, s.to.z);
      moveTo(sh, s.to.x, s.to.z, (s.c.id === 'marea' ? 0.75 : 0.45) * dt);
      if (Math.hypot(sh.x - s.to.x, sh.z - s.to.z) < 0.25) { s.st = 'nibble'; s.nibbles = 1 + Math.floor(Math.random() * (sh.size === 'l' ? 4 : 3)); s.next = 0.9 + Math.random() * 0.9; bar(); }
      break;
    }
    case 'nibble': {
      s.next -= dt; s.dip = Math.max(0, s.dip - dt * 4);
      bobber.position.set(s.to.x, WATER_Y - s.dip * 0.06 + Math.sin(T * 3) * 0.01, s.to.z);
      if (s.next <= 0) {
        if (s.nibbles > 0) { s.nibbles--; s.dip = 1; s.next = 0.7 + Math.random() * 1.1; sfx('nibble'); }
        else { s.st = 'bite'; s.t = s.target!.size === 's' ? 0.95 : s.target!.size === 'm' ? 0.75 : 0.65; sfx('bite'); puff(s.to.x, WATER_Y + 0.05, s.to.z, '#d8f0ff', 10, 1.8, 1); bang.visible = true; bar(); if (auto) hook(); }
      }
      break;
    }
    case 'bite': {
      bobber.position.set(s.to.x, WATER_Y - 0.14, s.to.z);
      bang.position.copy(c.root.position).setY(c.root.position.y + 1.7 + Math.abs(Math.sin(T * 12)) * 0.08);
      s.t -= dt;
      if (s.t <= 0) { bang.visible = false; emit('toast', 'Se escapó… toca justo cuando el corcho se hunde'); flee(s.target); s.target = null; s.st = 'wait'; bar(); }
      break;
    }
    case 'pull': tickPull(dt); break;
  }
  if (line.visible) drawLine(c);
}

/* ---------- interface: the bottom bar, the tug and the catch card ---------- */
function el(id: string) {
  let e = document.getElementById(id);
  if (e) return e;
  e = document.createElement('div'); e.id = id; e.hidden = true; document.body.appendChild(e);
  if (id === 'fishBar') {
    e.innerHTML = '<span></span><div class="fbtns"><button id="fBait"></button><button id="fExit">Salir</button></div>';
    e.querySelector('#fBait')!.addEventListener('click', ev => { ev.stopPropagation(); useBait(); });
    e.querySelector('#fExit')!.addEventListener('click', ev => { ev.stopPropagation(); stopFishing(); });
  }
  if (id === 'fishPull') {
    e.innerHTML = '<div class="fpbox"><b>¡Algo grande tira!</b><small>Deja el punto dentro de la zona verde hasta llenar la barra</small><div class="pt"><div class="pz"></div><div class="pf"></div></div><div class="pk"><span class="kl">◀ suelta</span><span class="kr">mantén apretado ▶</span></div><div class="pp"><i></i></div></div>';
    const down = (ev: Event) => { ev.preventDefault(); pull.hold = true; }, up = () => { pull.hold = false; };
    e.addEventListener('pointerdown', down); e.addEventListener('pointerup', up); e.addEventListener('pointercancel', up); e.addEventListener('pointerleave', up);
  }
  if (id === 'fishCard') e.addEventListener('click', () => closeCard());
  return e;
}
const STATE_TEXT: Record<St, string> = {
  walking: 'Camino al muelle…', ready: 'Toca el agua para lanzar, cerca de una sombra.', casting: '', wait: 'Espera a que algo se acerque. Toca para recoger.',
  approach: 'Algo se acerca…', nibble: 'Está picando… ¡todavía no!', bite: '¡AHORA! ¡Toca!', pull: '¡Tira!', card: '',
};
function bar() {
  const e = el('fishBar');
  if (!ses) { e.hidden = true; return; }
  e.hidden = false;
  const t = STATE_TEXT[ses.st]; if (t) e.querySelector('span')!.textContent = t;
  e.classList.toggle('now', ses.st === 'bite');
  const b = e.querySelector('#fBait') as HTMLButtonElement;
  b.textContent = `Carnada · ${S.res.semilla}`; b.disabled = S.res.semilla < 1 || ses.st === 'walking';
}
on('changed', () => { if (ses) bar(); });
const icon = (id: string) => `<img class="pix" src="${XICON[id] || XICON.hondo}" alt="">`;
function showCard(id: string, r: { first: boolean; lines: string[]; extra: string }) {
  const it = ITEMS[id], e = el('fishCard');
  e.innerHTML = `<div class="fcard"><div class="fic">${icon(id)}</div><small>${ses?.c.def.name} sacó del mar…</small><b>${it.name}</b>${r.first ? '<em>Nuevo en la colección</em>' : ''}<p>${it.desc}</p>${r.extra ? `<p class="lore sm">${r.extra}</p>` : ''}${r.lines.length ? `<div class="frew">${r.lines.join(' · ')}</div>` : ''}<span class="ftap">Toca para seguir</span></div>`;
  e.hidden = false;
}
function hideCard() { const e = document.getElementById('fishCard'); if (e) e.hidden = true; }
function closeCard() {
  if (!ses || ses.st !== 'card') return;
  hideCard(); ses.st = 'ready'; bar();
  const st = ses.story.shift(); if (st) emit('story', st);
}

/* ---------- for the pointer arrow and the bot ---------- */
export function bestShadow(size?: Size) {
  if (!shadows.length) return null;
  const a = anchor(); if (!a) return null;
  const tip = ahead(a, 0.25);
  const sp = shadows.find(s => s.special && !a.raft); if (sp) return sp;
  return [...shadows].filter(s => s.mode === 'wander' && (!size || s.size === size) && Math.hypot(s.x - tip.x, s.z - tip.z) < 6).sort((a, c) => Math.hypot(a.x - tip.x, a.z - tip.z) - Math.hypot(c.x - tip.x, c.z - tip.z))[0] || null;
}
/** Debug: cast at a point (bot and tests). */
export function castAt(x: number, z: number) { if (ses && ses.st === 'ready') cast(new THREE.Vector3(x, WATER_Y, z)); }
export function clearFishing() { stopFishing(); while (shadows.length) removeShadow(shadows[0]); }
on('built', (b: Building) => { if (b.type === 'muelle' && !S.flags.muelleStory) { S.flags.muelleStory = true; emit('story', 'muelle'); } });
