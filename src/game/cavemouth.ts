import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { worldGroup, landTiles, tileAt, topY, N, MAP, grove, type Tile } from '../world/island';
import { vbox, MAT } from '../assets/voxel';
import { S } from './state';
import { emit, on } from '../core/events';
import { puff, smoke } from '../world/particles';
import { sfx } from '../audio/sfx';
import { GOALS } from './goals';
import { crew, selected, select, order, tileOf, type Crew } from './crew';
import { enterCave, caveSave, setExitPoint } from './cave';
import { lightDecal } from '../world/cavebuild';

/* The way into the volcano: on the north of the island a mound of black rock breathes warm air
   through a crack. With the metal pick it can be opened (a dozen blows); then it is a dark mouth
   with orange light deep inside, and tapping it takes the team down. */

const HITS = 12;
export let mouth: { tile: Tile; group: THREE.Group; shake: number; glow: THREE.Mesh[]; open: boolean } | null = null;
const glowMat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.9, 0.2) });

const free = (t: Tile | null) => !!t && !t.tree && !t.rock && !t.building && !t.ancient && !t.mound && !t.solid && !t.ruin && !t.sprout && !t.mark && !(t as any).site;
function pickSpot(): Tile | null {
  const c = N / 2, R = MAP.r, tx = c + R * 0.18, tz = c - R * 0.62;
  const ring = new Set(grove ? [grove.center, ...grove.ring] : []);
  const ok = (t: Tile) => {
    if (!free(t) || ring.has(t) || ['arena', 'sendero', 'arada', 'musgo'].includes(t.type)) return false;
    const f = tileAt(t.i, t.j + 1);
    if (!f || !free(f) || Math.abs(f.h - t.h) > 1 || f.type === 'arena') return false;
    // nothing tall between it and the camera (which looks from the south-east)
    if ([[1, 0], [1, 1], [0, 1], [2, 1], [1, 2]].some(([a, b]) => tileAt(t.i + a, t.j + b)?.tree)) return false;
    // rock behind and to the sides is fine; the front must stay open
    return S.beach.items.every(it => it.i !== t.i || it.j !== t.j);
  };
  const list = landTiles().filter(ok).sort((a, b) => Math.hypot(a.i - tx, a.j - tz) - Math.hypot(b.i - tx, b.j - tz));
  return list[0] || null;
}

export function placeCaveMouth() {
  mouth = null;
  const save = caveSave();
  let t = save.at ? tileAt(save.at[0], save.at[1]) : null;
  if (!t) { t = pickSpot(); if (!t) return; save.at = [t.i, t.j]; }
  t.solid = true;
  const group = new THREE.Group(); group.position.set(t.wx, topY(t), t.wz); group.userData.caveMouth = true;
  worldGroup.add(group);
  mouth = { tile: t, group, shake: 0, glow: [], open: !!S.flags.cuevaAbierta };
  buildModel();
}
function buildModel() {
  if (!mouth) return;
  const g = mouth.group; while (g.children.length) g.remove(g.children[0]);
  const L: THREE.BufferGeometry[] = [];
  const R = ['#3b322c', '#443a33', '#332b26', '#4a3f37'];
  // a small cone of dark volcanic rock, a little crater on top
  vbox(L, 0, 0.2, 0, 1.5, 0.4, 1.4, R[0]); vbox(L, -0.55, 0.16, 0.25, 0.5, 0.32, 0.7, R[3]); vbox(L, 0.55, 0.18, 0.2, 0.5, 0.36, 0.7, R[1]);
  vbox(L, 0, 0.58, -0.1, 1.2, 0.38, 1.1, R[1]); vbox(L, 0, 0.92, -0.15, 0.9, 0.32, 0.8, R[2]); vbox(L, 0, 1.18, -0.18, 0.62, 0.22, 0.56, R[0]);
  vbox(L, -0.24, 1.33, -0.18, 0.14, 0.1, 0.56, R[3]); vbox(L, 0.24, 1.33, -0.18, 0.14, 0.1, 0.56, R[3]); vbox(L, 0, 1.33, -0.42, 0.62, 0.1, 0.1, R[3]); vbox(L, 0, 1.33, 0.06, 0.62, 0.1, 0.1, R[3]);
  vbox(L, 0.42, 0.86, 0.05, 0.3, 0.2, 0.3, R[3]); vbox(L, -0.55, 0.5, -0.35, 0.3, 0.3, 0.4, R[2]);
  // ash and pebbles around it
  for (const [x, z, s] of [[0.62, 0.55, 0.14], [-0.6, 0.5, 0.1], [0.7, -0.4, 0.12], [-0.68, -0.5, 0.16], [0.1, 0.68, 0.08]]) vbox(L, x, s / 2, z, s, s, s, '#5a4e44');
  if (mouth.open) {
    // the opening: a dark hole in the front face, worn steps going down
    vbox(L, 0, 0.02, 0.76, 0.62, 0.04, 0.24, '#2a221d');
    for (const [x, z] of [[0.55, 0.75], [-0.48, 0.78], [0.3, 0.9]]) vbox(L, x, 0.06, z, 0.16, 0.12, 0.14, '#4a3f37');
  }
  const m = new THREE.Mesh(mergeGeometries(L), MAT.stone); m.castShadow = true; m.receiveShadow = true; g.add(m);
  mouth.glow = [];
  const crater = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.38), glowMat()); crater.position.set(0, 1.3, -0.18); g.add(crater); mouth.glow.push(crater);
  if (mouth.open) {
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.52, 0.06), new THREE.MeshBasicMaterial({ color: '#060403' })); hole.position.set(0, 0.3, 0.715); g.add(hole);
    const deep = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.02), glowMat()); deep.position.set(0, 0.12, 0.75); g.add(deep); mouth.glow.push(deep);
    const d = lightDecal(1.6, '#ff9a50'); d.position.set(0, 0.03, 0.95); g.add(d);
  } else {
    // a crack that glows orange on the front of the rock
    for (const [x, y, w, h] of [[0.02, 0.2, 0.06, 0.34], [-0.04, 0.48, 0.06, 0.2], [0.05, 0.66, 0.06, 0.2], [0.12, 0.3, 0.14, 0.05]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), glowMat()); c.position.set(x, y, z0(y)); g.add(c); mouth.glow.push(c);
    }
  }
}
const z0 = (y: number) => y < 0.4 ? 0.71 : 0.46;   // front face of the lower or the upper block

/** Taps on the rock: open it with the pick, or go down once it is open. */
export function mouthTap() {
  if (!mouth) return;
  if (!mouth.open) {
    const gi = GOALS.findIndex(g => g.id === 'grieta');
    if (gi < 0 || S.goal < gi) { emit('toast', 'Una grieta en la roca negra. Sale aire tibio… algo respira ahí abajo.'); return; }
    if (!S.tools.pico) { emit('toast', 'La roca volcánica es muy dura: hace falta el pico de metal (en la casa)'); return; }
    const t = mouth.tile;
    const sel: Crew | null | undefined = selected ? crew.find(q => q.id === selected) : null;
    const who = sel || crew.filter(q => !q.job && !q.path.length).sort((a, b) => dist(a, t) - dist(b, t))[0] || [...crew].sort((a, b) => dist(a, t) - dist(b, t))[0];
    if (!who) return;
    const r = order(who, t, 'cueva');
    if (r !== true) { emit('toast', r); return; }
    select(null); emit('toast', `${who.def.name} va a abrir la grieta con el pico`);
    return;
  }
  if (!S.inv.linterna) { emit('toast', 'Adentro está muy oscuro: primero inventa la linterna en el taller'); return; }
  enterCave();
}
const dist = (c: Crew, t: Tile) => { const h = tileOf(c); return h ? Math.abs(h.i - t.i) + Math.abs(h.j - t.j) : 999; };

on('caveHit', (c: Crew) => {
  if (!mouth || mouth.open) return;
  const s = caveSave(); s.hits++;
  mouth.shake = 1;
  const p = mouth.group.position;
  puff(p.x, p.y + 0.5, p.z + 0.5, '#5a4e44', 6, 1.6, 1.2, p.y); puff(p.x, p.y + 0.4, p.z + 0.55, '#ffb040', 3, 2, 1, p.y);
  if (s.hits === Math.floor(HITS / 2)) emit('toast', 'La grieta se ensancha. Sale más calor.');
  if (s.hits >= HITS) {
    S.flags.cuevaAbierta = true; mouth.open = true; buildModel();
    sfx('fall'); puff(p.x, p.y + 0.6, p.z + 0.4, '#3b322c', 22, 2.4, 2, p.y);
    for (let k = 0; k < 8; k++) smoke(p.x + (Math.random() - 0.5) * 0.6, p.y + 0.6, p.z + 0.5, '#b8b0a8', 0.12, 2.2);
    emit('story', 'cueva'); emit('changed'); emit('caveChanged');
  }
  void c;
});

let smokeAcc = 0;
export function tickCaveMouth(dt: number, T: number) {
  if (!mouth) return;
  const p = mouth.group.position;
  if (mouth.shake > 0) { mouth.shake = Math.max(0, mouth.shake - dt * 4); mouth.group.children[0].position.x = Math.sin(T * 60) * 0.03 * mouth.shake; }
  const k = 0.7 + 0.3 * Math.sin(T * 1.7) + 0.1 * Math.sin(T * 7.1);
  for (const g of mouth.glow) (g.material as THREE.MeshBasicMaterial).color.setRGB(2.6 * k, 0.9 * k, 0.2 * k);
  smokeAcc -= dt;
  if (smokeAcc <= 0) { smokeAcc = mouth.open ? 0.5 : 1.6; smoke(p.x + (Math.random() - 0.5) * 0.3, p.y + (mouth.open ? 0.5 : 1.35), p.z + (mouth.open ? 0.7 : -0.18), mouth.open ? '#8a8078' : '#a8a098', 0.08, 2); }
}
export const mouthTarget = () => mouth ? mouth.group.position.clone().setY(mouth.group.position.y + 1.9) : null;
setExitPoint(() => mouth ? new THREE.Vector3(mouth.tile.wx, topY(mouth.tile) + 0.5, mouth.tile.wz + 1) : null);
