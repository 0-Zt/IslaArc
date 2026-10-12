import * as THREE from 'three';
import HONDO from '../data/hondo.json';
import { emit } from '../core/events';
import { scene } from '../render/renderer';
import { vbox, MAT, type MatKey } from '../assets/voxel';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { S, afford, pay, gain, type ResKey, type Cost } from './state';
import { buildings, isDone, type Building } from './buildings';
import { addStars } from './progress';
import { currentGoal } from './goals';
import { sfx } from '../audio/sfx';
import { puff } from '../world/particles';

/* The trading boat (v0.22): Tito, a clay snail in a straw hat, sails a little striped boat from
   island to island. Once the way to the Depths is open he moors next to the pier now and then,
   with three offers that turn what is left over into things that are hard to find. Each offer can
   be taken once per visit. */

export interface Offer { give: Record<string, number>; get: Record<string, number>; done?: boolean }
const TRADES = HONDO.trades as (Offer & { rare?: boolean })[];
const STAY = 240, AWAY = 330;

let boat: THREE.Group | null = null, at: Building | null = null, wasHere = false;
export const traderHere = () => !!S.trade && S.time < S.trade.until && !!pier();
export const offers = (): Offer[] => traderHere() ? S.trade!.offers : [];
const pier = () => buildings.find(b => b.type === 'muelle' && isDone(b)) || null;

function pickOffers(): Offer[] {
  const pool = TRADES.filter(t => !t.rare || Math.random() < 0.18), out: Offer[] = [];
  while (out.length < 3 && pool.length) { const k = Math.floor(Math.random() * pool.length); const t = pool.splice(k, 1)[0]; out.push({ give: { ...t.give }, get: { ...t.get } }); }
  return out;
}

/** Clock of the boat: it comes, stays a few minutes, leaves, comes back later. */
export function tickTrader(dt: number, T: number) {
  const on = !!S.flags.hondoAbierto && !!pier();
  if (!on) { hideBoat(); return; }
  if (!S.trade) S.trade = { next: S.time + 25, until: 0, offers: [] };
  const tr = S.trade;
  // when the chapter asks for a trade, do not make the player wait long
  if (currentGoal()?.id === 'hoTrueque' && S.time >= tr.until && tr.next - S.time > 20) tr.next = S.time + 12;
  if (S.time >= tr.next && S.time >= tr.until) {
    tr.until = S.time + STAY; tr.next = tr.until + AWAY; tr.offers = pickOffers();
    emit('toast', 'Llegó el barco de trueques de Tito. Está amarrado junto al muelle.');
    if (!S.flags.barcoVisto) { S.flags.barcoVisto = true; setTimeout(() => emit('story', 'barco'), 1200); }
    sfx('coin', 0.6); emit('changed');
  }
  const here = traderHere();
  if (wasHere && !here) { emit('toast', 'El barco de Tito se va mar adentro. Volverá más tarde.'); emit('changed'); }
  wasHere = here;
  if (here) showBoat(T); else hideBoat();
  void dt;
}

/** Takes one offer: pays what it asks and gives what it promises. Returns a reason when it cannot. */
export function trade(i: number): string | null {
  const o = offers()[i]; if (!o) return 'El barco ya no está';
  if (o.done) return 'Ya hiciste ese trueque';
  if (!afford(o.give as Cost)) return 'Te faltan materiales';
  pay(o.give as Cost); o.done = true;
  const p = boat ? boat.getWorldPosition(new THREE.Vector3()).setY(1.2) : undefined;
  for (const [k, n] of Object.entries(o.get)) {
    if (k === 'estrella') addStars(n, 'Trueque con Tito');
    else gain(k as ResKey, n, p);
  }
  if (o.get.ayudante && !S.flags.ayudanteListo) { S.flags.ayudanteListo = true; setTimeout(() => emit('story', 'ayudante'), 600); }
  S.stats.trueques = (S.stats.trueques || 0) + 1;
  sfx('coin'); if (p) puff(p.x, p.y, p.z, '#f2c14e', 12, 1.8, 1.2);
  emit('changed');
  return null;
}

/* ---------- the boat ---------- */
function model(): THREE.Group {
  const parts: Partial<Record<MatKey, THREE.BufferGeometry[]>> = { plank: [], bark: [], thatch: [], brick: [], stone: [] };
  const P = parts as Record<string, THREE.BufferGeometry[]>;
  // hull: a short wide boat in two tones, a deck and a little cabin
  vbox(P.plank, 0, 0.1, 0, 0.9, 0.26, 1.7, '#8a5a2e'); vbox(P.plank, 0, 0.26, 0, 0.98, 0.08, 1.78, '#6a4226');
  vbox(P.plank, 0, 0.12, 0.92, 0.6, 0.2, 0.2, '#8a5a2e'); vbox(P.plank, 0, 0.12, -0.92, 0.7, 0.2, 0.16, '#8a5a2e');
  vbox(P.plank, 0, 0.31, 0, 0.82, 0.03, 1.6, '#c49660');
  vbox(P.brick, 0, 0.48, -0.5, 0.56, 0.36, 0.46, '#d9a066'); vbox(P.thatch, 0, 0.72, -0.5, 0.64, 0.1, 0.54, '#d4a444');
  // mast and a striped sail
  vbox(P.bark, 0, 1.15, 0.15, 0.07, 1.7, 0.07, '#5e3a1e');
  for (let k = 0; k < 5; k++) vbox(P.thatch, 0.02, 0.55 + k * 0.22, 0.42, 0.03, 0.22, 0.5, k % 2 ? '#f0e6d0' : '#d9463c');
  vbox(P.bark, 0, 1.98, 0.15, 0.04, 0.2, 0.3, '#f2c14e');
  // crates of wares and Tito: a clay snail with a straw hat
  vbox(P.plank, 0.25, 0.42, 0.55, 0.22, 0.2, 0.22, '#c08a50'); vbox(P.plank, -0.25, 0.42, 0.62, 0.2, 0.2, 0.2, '#b07a44'); vbox(P.thatch, -0.25, 0.54, 0.62, 0.16, 0.04, 0.16, '#7fc955');
  vbox(P.brick, 0.18, 0.42, -0.05, 0.3, 0.2, 0.26, '#c9a07a'); vbox(P.brick, 0.18, 0.62, -0.12, 0.34, 0.3, 0.3, '#b07a52'); vbox(P.brick, 0.18, 0.62, -0.12, 0.2, 0.18, 0.32, '#d4ac86');
  vbox(P.brick, 0.18, 0.62, 0.12, 0.14, 0.26, 0.14, '#c9a07a');
  vbox(P.thatch, 0.18, 0.78, 0.12, 0.3, 0.03, 0.3, '#e0c070'); vbox(P.thatch, 0.18, 0.83, 0.12, 0.14, 0.08, 0.14, '#d4a444');
  vbox(P.stone, 0.13, 0.68, 0.19, 0.03, 0.03, 0.01, '#2a1e18'); vbox(P.stone, 0.23, 0.68, 0.19, 0.03, 0.03, 0.01, '#2a1e18');
  const g = new THREE.Group();
  for (const [k, list] of Object.entries(P)) { if (!list.length) continue; const m = new THREE.Mesh(mergeGeometries(list), (MAT as any)[k]); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  // a lantern at the stern
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.6) })); l.position.set(-0.32, 0.6, -0.85); g.add(l);
  return g;
}
function showBoat(T: number) {
  const p = pier(); if (!p) return;
  if (!boat || at !== p) {
    hideBoat(); boat = model(); at = p; scene.add(boat);
    // taps on the boat open the pier's sheet (where the offers are)
    boat.traverse(o => { o.userData.building = p; });
  }
  // moored across the end of the pier (always open water there), bobbing on the swell
  const base = p.group.localToWorld(new THREE.Vector3(0, 0, 2.5));
  boat.position.set(base.x, -0.08 + Math.sin(T * 1.3) * 0.04, base.z);
  boat.rotation.set(Math.sin(T * 1.1) * 0.03, p.group.rotation.y + Math.PI / 2, Math.sin(T * 0.9 + 1) * 0.04);
}
function hideBoat() { if (boat) { scene.remove(boat); boat = null; at = null; } }
/** For the pier's sheet and the tap code: the boat's meshes (so a tap on it counts as the pier). */
export const boatObject = () => boat;
