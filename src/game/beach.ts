import * as THREE from 'three';
import { emit } from '../core/events';
import { worldGroup, landTiles, tileAt, topY, DIRS, type Tile } from '../world/island';
import { vbox } from '../assets/voxel';
import { group } from '../assets/buildings';
import { puff } from '../world/particles';
import { S, gain, type ResKey } from './state';
import { bump, addStars } from './progress';
import { has } from './buildings';
import LORE from '../data/lore.json';

/* The sea brings things: every few minutes a crate or a bottle washes up on the beach.
   A figure picks it up. Crates hold materials; bottles hold messages from the Alfareros. */

export const LORE_TEXT = LORE as string[];
interface Item { i: number; j: number; kind: 'caja' | 'botella'; group: THREE.Group; t0: number }
const items: Item[] = [];
export const beachMeshes = () => items.map(it => it.group);
const INTERVAL = 150;

function modelCaja() {
  const P: THREE.BufferGeometry[] = [], R: THREE.BufferGeometry[] = [];
  vbox(P, 0, 0.13, 0, 0.32, 0.26, 0.28, '#a8743e'); vbox(P, 0, 0.27, 0, 0.34, 0.03, 0.3, '#8a5a2e');
  for (const x of [-0.15, 0.15]) vbox(P, x, 0.13, 0, 0.03, 0.27, 0.29, '#6a4226');
  vbox(R, 0, 0.14, 0.145, 0.34, 0.03, 0.01, '#d8c8a0'); vbox(R, 0, 0.14, -0.145, 0.34, 0.03, 0.01, '#d8c8a0');
  vbox(R, 0.1, 0.02, 0.2, 0.08, 0.03, 0.06, '#4ea33c');   // a strand of seaweed
  return group({ plank: P, thatch: R });
}
function modelBotella() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.1), new THREE.MeshLambertMaterial({ color: '#7fd0c8', transparent: true, opacity: 0.75 }));
  glass.position.y = 0.12; g.add(glass);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.05), glass.material); neck.position.y = 0.28; g.add(neck);
  const cork = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.04, 0.055), new THREE.MeshLambertMaterial({ color: '#b0804a' })); cork.position.y = 0.33; g.add(cork);
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: '#fff6dc' })); paper.position.y = 0.12; g.add(paper);
  g.rotation.z = 1.2; g.position.y = 0.05;
  const wrap = new THREE.Group(); wrap.add(g);
  return wrap;
}

function spot(): Tile | null {
  const shore = landTiles().filter(t => t.type === 'arena' && !t.ruin && !t.building && !t.tree && !t.mark && !t.solid && DIRS.some(([a, b]) => !tileAt(t.i + a, t.j + b)) && !items.some(it => it.i === t.i && it.j === t.j));
  return shore.length ? shore[Math.floor(Math.random() * shore.length)] : null;
}
function place(t: Tile, kind: Item['kind']) {
  const g = kind === 'caja' ? modelCaja() : modelBotella();
  g.position.set(t.wx + (Math.random() - 0.5) * 0.3, topY(t), t.wz + (Math.random() - 0.5) * 0.3); g.rotation.y = Math.random() * 6.28;
  const it: Item = { i: t.i, j: t.j, kind, group: g, t0: performance.now() };
  g.traverse(o => { o.userData.beachItem = it; });
  worldGroup.add(g); items.push(it);
  return it;
}

export function restoreBeach() { for (const b of S.beach.items) { const t = tileAt(b.i, b.j); if (t) place(t, b.kind); } }
export function clearBeach() { for (const it of items) worldGroup.remove(it.group); items.length = 0; }
const save = () => { S.beach.items = items.map(it => ({ i: it.i, j: it.j, kind: it.kind })); };

export function tickBeach(T: number) {
  // bob and sparkle
  for (const it of items) { it.group.position.y = topY(tileAt(it.i, it.j)!) + Math.max(0, Math.sin(T * 2 + it.i) * 0.02); if (Math.random() < 0.02) puff(it.group.position.x, it.group.position.y + 0.35, it.group.position.z, '#fff6c0', 1, 0.6, 0.3); }
  if (S.time < S.beach.next) return;
  S.beach.next = S.time + INTERVAL / (S.inv.catalejo ? 2 : 1) * (0.8 + Math.random() * 0.4);
  if (items.length >= 2) return;
  const t = spot(); if (!t) return;
  const bottle = S.lore.length < LORE_TEXT.length && (Math.random() < 0.35 || (S.stats.cajas || 0) >= 1 && !S.lore.length);
  place(t, bottle ? 'botella' : 'caja'); save();
  emit('toast', bottle ? 'El mar dejó una botella en la playa' : 'El mar dejó una caja en la playa');
  emit('beachChanged');
}

const rint = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
/** A figure reached the item: open it. */
export function collectAt(t: Tile, c?: { root: THREE.Object3D }) {
  const it = items.find(q => q.i === t.i && q.j === t.j); if (!it) return;
  worldGroup.remove(it.group); items.splice(items.indexOf(it), 1); save();
  const at = it.group.position.clone().add(new THREE.Vector3(0, 0.8, 0));
  puff(at.x, at.y - 0.6, at.z, '#fff0c0', 10, 1.8, 1.2);
  if (it.kind === 'caja') {
    bump('cajas');
    const pool: [ResKey, number, number][] = [['madera', 4, 8], ['piedra', 3, 6], ['arena', 3, 6], ['semilla', 1, 2], ['mineral', 2, 3]];
    if (has('horno')) pool.push(['lingote', 1, 2], ['ladrillo', 2, 3], ['vidrio', 1, 2]);
    if (has('aserradero')) pool.push(['tablas', 2, 4]);
    const n = rint(2, 3), got: string[] = [];
    for (let k = 0; k < n; k++) { const [r, a, b] = pool[Math.floor(Math.random() * pool.length)]; const q = rint(a, b); gain(r, q, at.clone().add(new THREE.Vector3(0, k * 0.3, 0))); got.push(`${q} de ${r}`); }
    emit('toast', `Caja: ${got.join(', ')}`);
    if (Math.random() < 0.12) addStars(1, 'Un tesoro en la caja');
  } else {
    bump('botellas');
    const next = LORE_TEXT.findIndex((_, i) => !S.lore.includes(i));
    if (next >= 0) { S.lore.push(next); emit('bottleRead', next); }
    addStars(1, 'Mensaje en una botella');
  }
  emit('beachChanged'); emit('changed');
}
export const itemAt = (t: Tile) => items.find(q => q.i === t.i && q.j === t.j) || null;
