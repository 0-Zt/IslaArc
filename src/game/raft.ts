import * as THREE from 'three';
import { scene, controls, camera, flyTo, cameraOffset, cancelFly } from '../render/renderer';
import { emit, on } from '../core/events';
import { S } from './state';
import { buildings, isDone, type Building } from './buildings';
import { crew, order, select, selected, finishTask, type Crew } from './crew';
import { tileAt, tileUnder, walkable, topY, DIRS, N } from '../world/island';
import { deepAt, surgeAt, outOfSea } from '../world/sea';
import { startSpotFishing, setRaftSpot, fishingActive, stopFishing, pierTip, type Spot } from './fishing';
import { modelBalsa } from '../assets/buildings';
import { puff } from '../world/particles';
import { sfx } from '../audio/sfx';

/* Marea's raft. Built at the pier (its second level), it waits moored at the end. A figure
   boards it and the player taps the sea to row there; the raft stops at land, at the edge of
   the big waves and at the limit of the open sea. From the raft one can fish anywhere —
   in the dark deep water the rarest things live. */

const WATER_Y = 0.14, DECK = 0.17, SPEED = 2.3;
const raft = modelBalsa(); raft.visible = false; scene.add(raft);
raft.traverse(o => { (o as THREE.Mesh).castShadow = true; o.userData.raft = true; });
export const raftMesh = raft;

const pier = () => buildings.find(b => b.type === 'muelle' && isDone(b) && b.lvl >= 2) || null;
export const hasRaft = () => !!pier();
const facing = (b: Building) => new THREE.Vector3(Math.sin(b.rot * Math.PI / 2), 0, Math.cos(b.rot * Math.PI / 2));
/** Where the raft waits: just past the end of the pier, side on. */
const moorPos = (b: Building) => pierTip(b, 2.05).setY(WATER_Y);
const moorHeading = (b: Building) => b.rot * Math.PI / 2 + Math.PI / 2;

type Mode = 'boarding' | 'sailing' | 'fishing' | 'returning';
interface Sail { c: Crew; b: Building; mode: Mode; pos: THREE.Vector3; heading: number; target: THREE.Vector3 | null; route: THREE.Vector3[]; toWaves: boolean; speed: number; cam: { target: THREE.Vector3; zoom: number; off: THREE.Vector3 }; said: string; deep: string }
let sail: Sail | null = null;
export const sailingActive = () => !!sail;
export const sailState = () => sail ? { mode: sail.mode, x: sail.pos.x, z: sail.pos.z, moving: !!sail.target, deep: sail.deep, who: sail.c.id } : null;
const heading = () => new THREE.Vector3(Math.sin(sail!.heading), 0, Math.cos(sail!.heading));
const stand = () => sail!.pos.clone().setY(WATER_Y + DECK);

setRaftSpot(() => sail && (sail.mode === 'sailing' || sail.mode === 'fishing') ? { stand: stand(), dir: heading(), raft: true } as Spot : null);

/** Sends a figure to the pier to board the raft. Returns a reason when it cannot. */
export function startSailing(b: Building): string | null {
  if (sail) return null;
  if (!hasRaft()) return 'La balsa todavía no está armada';
  if (fishingActive()) stopFishing();
  const sel = selected ? crew.find(c => c.id === selected) : null;
  const tip = pierTip(b);
  const who = sel || [...crew].sort((p, q) => (p.job ? 1 : 0) - (q.job ? 1 : 0) || p.root.position.distanceTo(tip) - q.root.position.distanceTo(tip))[0];
  if (!who) return 'No hay nadie para remar';
  sail = { c: who, b, mode: 'boarding', pos: moorPos(b), heading: moorHeading(b), target: null, route: [], toWaves: false, speed: 0, cam: { target: controls.target.clone(), zoom: camera.zoom, off: cameraOffset() }, said: '', deep: '' };
  const r = order(who, b.tiles[0], 'pescar');
  if (r !== true) { sail = null; return r; }
  select(null);
  flyTo(moorPos(b).setY(0.3), Math.max(camera.zoom, 1.0));
  emit('sailMode', true); bar();
  return null;
}
on('fishArrive', (c: Crew) => { if (sail && sail.c === c && sail.mode === 'boarding') board(); });
function board() {
  const s = sail!, c = s.c;
  c.job = { kind: 'navegar', tile: c.job!.tile }; c.anim = 'fish'; c.holding = 'paddle'; c.row = 0;
  s.mode = 'sailing';
  puff(s.pos.x, WATER_Y + 0.1, s.pos.z, '#d8f0ff', 8, 1.4, 1);
  sfx('plop');
  if (!S.flags.zarpo) { S.flags.zarpo = true; emit('story', 'zarpar'); }
  emit('changed'); bar();
}

/* ---------- finding a way over the water ----------
   A coarse grid of sea cells (the island's tiles, plus a ring of open sea around them).
   Breadth-first search gives the shortest way around the island; then the route is
   straightened wherever the raft can see the next point. */
const PAD = 12, G = N + PAD * 2;
const cw = (k: number) => k - PAD - N / 2 + 0.5;
const seaCell = (ci: number, cj: number) => { const i = ci - PAD, j = cj - PAD; if (tileAt(i, j)) return false; const x = cw(ci), z = cw(cj); return !outOfSea(x, z) && !surgeAt(x, z); };
const toCell = (x: number, z: number) => [Math.floor(x + N / 2) + PAD, Math.floor(z + N / 2) + PAD];
function clearLine(a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a), n = Math.ceil(d.length() / 0.25);
  for (let k = 1; k <= n; k++) { const x = a.x + d.x * k / n, z = a.z + d.z * k / n; if (raftOnTiles(x, z) || surgeAt(x, z) || outOfSea(x, z)) return false; }
  return true;
}
/** Waypoints from `from` to `to` over water, or to the closest reachable water when `to` cannot be reached. */
function route(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
  const [si, sj] = toCell(from.x, from.z), [ti, tj] = toCell(to.x, to.z);
  const K = (i: number, j: number) => j * G + i;
  const prev = new Map<number, number>([[K(si, sj), -1]]), q = [[si, sj]];
  let best = K(si, sj), bestD = Math.hypot(ti - si, tj - sj);
  for (let h = 0; h < q.length; h++) {
    const [i, j] = q[h];
    const d = Math.hypot(ti - i, tj - j); if (d < bestD) { bestD = d; best = K(i, j); }
    if (i === ti && j === tj) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= G || nj >= G || prev.has(K(ni, nj))) continue;
      if (!seaCell(ni, nj)) continue;
      if (di && dj && (!seaCell(i + di, j) || !seaCell(i, j + dj))) continue;   // no cutting corners past land
      prev.set(K(ni, nj), K(i, j)); q.push([ni, nj]);
    }
  }
  const cells: THREE.Vector3[] = [];
  for (let k = best; k >= 0; k = prev.get(k)!) cells.unshift(new THREE.Vector3(cw(k % G), WATER_Y, cw(Math.floor(k / G))));
  if (!cells.length) return null;
  const end = best === K(ti, tj) && !raftOnTiles(to.x, to.z) && !surgeAt(to.x, to.z) ? to.clone().setY(WATER_Y) : cells[cells.length - 1];
  cells[cells.length - 1] = end;
  // straighten: from each point jump to the farthest one in plain sight
  const out: THREE.Vector3[] = []; let cur = from.clone();
  for (let k = 0; k < cells.length;) {
    let far = k; for (let m = cells.length - 1; m > k; m--) if (clearLine(cur, cells[m])) { far = m; break; }
    out.push(cells[far]); cur = cells[far]; k = far + 1;
  }
  return out;
}
function go(to: THREE.Vector3, mode: Mode) {
  const s = sail!; const r = route(s.pos, to);
  if (!r || !r.length || r[r.length - 1].distanceTo(s.pos) < 0.1) { if (surgeAt(to.x, to.z)) waves(); else emit('toast', 'La balsa no encuentra paso por ahí'); return false; }
  s.route = r; s.target = r.shift()!; s.mode = mode; s.said = ''; s.toWaves = surgeAt(to.x, to.z);
  return true;
}
function waves() {
  emit('toast', 'Las olas devuelven la balsa'); sfx('splash');
  const s = sail!; const h = new THREE.Vector3(Math.cos(Math.atan2(s.pos.z, s.pos.x)), 0, Math.sin(Math.atan2(s.pos.z, s.pos.x)));
  puff(s.pos.x + h.x, WATER_Y + 0.2, s.pos.z + h.z, '#ffffff', 14, 2.2, 1.4);
  if (!S.flags.olas) { S.flags.olas = true; emit('story', 'olas'); emit('changed'); }
}

/** A tap while sailing: row towards that point of the sea. */
export function sailTap(ray: THREE.Raycaster) {
  if (!sail) return false;
  if (sail.mode === 'boarding') { emit('toast', `${sail.c.def.name} va camino a la balsa`); return true; }
  if (sail.mode !== 'sailing' && sail.mode !== 'returning') return true;
  const p = new THREE.Vector3();
  if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_Y), p)) return true;
  if (tileUnder(p.x, p.z)) { emit('toast', 'Eso es tierra: toca el agua para navegar'); return true; }
  if (go(p, 'sailing')) { cancelFly(); sfx('tap'); puff(p.x, WATER_Y + 0.04, p.z, '#ffffff', 4, 0.8, 0.6); }
  bar(); return true;
}
/** Fish from where the raft is. */
export function fishHere() {
  const s = sail; if (!s || s.mode !== 'sailing' || s.target) return;
  s.mode = 'fishing'; s.c.holding = 'rod';
  startSpotFishing(s.c, () => ({ stand: stand(), dir: heading(), raft: true }), () => { if (!sail) return; sail.mode = 'sailing'; sail.c.holding = 'paddle'; sail.c.anim = 'fish'; bar(); });
  bar();
}
/** Row back to the pier and step off. */
export function goBack() {
  const s = sail; if (!s) return;
  if (s.mode === 'boarding') { if (s.c.job?.kind === 'pescar') finishTask(s.c); end(); return; }
  if (s.mode === 'fishing') stopFishing();
  if (!go(moorPos(s.b), 'returning')) { emit('toast', 'No se ve camino de vuelta: acércate al muelle'); }
  bar();
}
function disembark() {
  const s = sail!, c = s.c;
  const t0 = s.b.tiles[0];
  const back = DIRS.map(([a, b]) => tileAt(t0.i + a, t0.j + b)).find(t => t && walkable(t));
  if (back) c.root.position.set(back.wx + c.off, topY(back), back.wz + c.offz);
  c.holding = undefined; c.row = 0; c.swing = 0;
  finishTask(c);
  end();
}
function end() {
  const s = sail!; sail = null;
  flyTo(s.cam.target, s.cam.zoom, s.cam.off);
  emit('sailMode', false); emit('changed'); bar();
}

const blockedReason = (x: number, z: number, dx: number, dz: number) => {
  if (tileUnder(x, z) || tileUnder(x + dx * 0.55, z + dz * 0.55) || raftOnTiles(x, z)) return 'tierra';
  if (surgeAt(x + dx * 0.6, z + dz * 0.6)) return 'olas';
  if (outOfSea(x, z)) return 'lejos';
  return '';
};
// the bridge and the islet are tiles too, so the same test keeps the raft off them
const raftOnTiles = (x: number, z: number) => !!tileUnder(x + 0.35, z) || !!tileUnder(x - 0.35, z) || !!tileUnder(x, z + 0.45) || !!tileUnder(x, z - 0.45);

let wake = 0;
export function tickRaft(dt: number, T: number) {
  const b = pier();
  if (!sail) {
    raft.visible = !!b;
    if (b) { const p = moorPos(b); raft.position.set(p.x, WATER_Y + Math.sin(T * 1.7) * 0.02, p.z); raft.rotation.set(Math.sin(T * 1.3) * 0.02, moorHeading(b), Math.sin(T * 1.1) * 0.03); }
    return;
  }
  const s = sail, c = s.c;
  raft.visible = true;
  if (s.mode === 'boarding') {
    if (c.job?.kind !== 'pescar') { sail = null; emit('sailMode', false); bar(); }
    const p = moorPos(s.b); raft.position.set(p.x, WATER_Y + Math.sin(T * 1.7) * 0.02, p.z);
    return;
  }
  if (c.job?.kind !== 'navegar') { end(); return; }
  if (s.target) {
    const d = s.target.clone().sub(s.pos).setY(0), dist = d.length();
    s.speed = Math.min(SPEED, s.speed + dt * 2.5);
    if (dist < 0.08) {
      if (s.route.length) { s.target = s.route.shift()!; return; }
      s.target = null; s.speed = 0;
      if (s.mode === 'returning') { disembark(); return; }
      if (s.toWaves) { s.toWaves = false; waves(); }
      bar();
    } else {
      d.normalize();
      const step = Math.min(dist, s.speed * dt), nx = s.pos.x + d.x * step, nz = s.pos.z + d.z * step;
      // the way home goes along the pier, which is not "land" for the raft
      const why = s.mode === 'returning' && !s.route.length && dist < 1.2 ? '' : blockedReason(nx, nz, d.x, d.z);
      if (why) {
        s.target = null; s.route = []; s.speed = 0;
        if (s.said !== why) {
          s.said = why;
          if (why === 'tierra') emit('toast', 'La balsa toca fondo: ahí es tierra');
          if (why === 'lejos') emit('toast', 'Más allá es mar abierto: la balsa no se aleja tanto');
          if (why === 'olas') { emit('toast', 'Las olas devuelven la balsa'); sfx('splash'); puff(nx, WATER_Y + 0.2, nz, '#ffffff', 14, 2.2, 1.4); if (!S.flags.olas) { S.flags.olas = true; emit('story', 'olas'); emit('changed'); } }
        }
        if (s.mode === 'returning') s.mode = 'sailing';
        bar();
      } else {
        s.pos.set(nx, WATER_Y, nz);
        let want = Math.atan2(d.x, d.z), dh = want - s.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
        s.heading += dh * Math.min(1, dt * 5);
        wake -= dt; if (wake <= 0) { wake = 0.12; const h = heading(); puff(s.pos.x - h.x * 0.65, WATER_Y + 0.04, s.pos.z - h.z * 0.65, '#e8f6ff', 2, 0.6, 0.5, WATER_Y); }
      }
    }
  }
  // the camera keeps the raft in view
  { const off = s.pos.clone().sub(controls.target).setY(0); if (off.length() > 0.3) { const delta = off.multiplyScalar(Math.min(1, dt * 2.2)); controls.target.add(delta); camera.position.add(delta); } }
  // dark water: the first time is worth a note
  const dz = deepAt(s.pos.x, s.pos.z), name = dz?.name || '';
  if (name !== s.deep) { s.deep = name; if (name && !S.flags.hondo) { S.flags.hondo = true; emit('toast', 'El agua aquí es oscura y fría. Lo que hay abajo nunca vio la luz.'); emit('changed'); } bar(); }
  c.row = s.target ? 1 : Math.max(0, (c.row || 0) - dt * 2);
  if (s.mode !== 'fishing') { c.root.position.copy(stand()); c.dir = s.heading; c.anim = 'fish'; c.holding = 'paddle'; }
  raft.position.set(s.pos.x, WATER_Y + Math.sin(T * 1.7) * 0.025, s.pos.z);
  raft.rotation.set(Math.sin(T * 1.3) * 0.025 + (s.target ? -0.03 : 0), s.heading, Math.sin(T * 1.1) * 0.035);
}

/* ---------- the bottom bar while sailing ---------- */
function el() {
  let e = document.getElementById('sailBar');
  if (e) return e;
  e = document.createElement('div'); e.id = 'sailBar'; e.hidden = true; document.body.appendChild(e);
  e.innerHTML = '<span></span><div class="fbtns"><button id="sFish">Pescar aquí</button><button id="sBack">Volver</button></div>';
  e.querySelector('#sFish')!.addEventListener('click', ev => { ev.stopPropagation(); fishHere(); });
  e.querySelector('#sBack')!.addEventListener('click', ev => { ev.stopPropagation(); goBack(); });
  return e;
}
function bar() {
  const e = el();
  if (!sail || sail.mode === 'fishing') { e.hidden = true; return; }
  e.hidden = false;
  const s = sail;
  e.querySelector('span')!.textContent = s.mode === 'boarding' ? `${s.c.def.name} va a la balsa…`
    : s.mode === 'returning' ? 'Volviendo al muelle…'
    : s.target ? 'Remando…'
    : s.deep ? `${s.deep}: agua oscura. Pesca aquí, lo raro vive en lo hondo.` : 'Toca el mar para navegar. Las manchas oscuras son agua profunda.';
  (e.querySelector('#sFish') as HTMLButtonElement).disabled = s.mode !== 'sailing' || !!s.target;
  e.classList.toggle('deep', !!s.deep);
}
export function clearRaft() { if (sail) { sail = null; emit('sailMode', false); } bar(); }
