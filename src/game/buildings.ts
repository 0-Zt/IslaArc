import * as THREE from 'three';
import { emit } from '../core/events';
import { scene, glowMul } from '../render/renderer';
import { worldGroup, tileAt, topY, rebuildDeco, blocked, type Tile } from '../world/island';
import { removeTree } from '../world/trees';
import { rocks } from '../world/rocks';
import { puff, smoke } from '../world/particles';
import { MODELS } from '../assets/buildings';
import { S, DATA, afford, pay, gain, type Cost, type SavedBuilding } from './state';
import { stumps } from './forest';

export interface Building {
  type: string; i: number; j: number; rot: number; tiles: Tile[];
  group: THREE.Group; glow?: THREE.Mesh; smokeAt: THREE.Vector3;
  queue: number; prog: number; build: number;
}
export const buildings: Building[] = [];
export const has = (type: string) => buildings.some(b => b.type === type);
export const saved = (): SavedBuilding[] => buildings.map(b => ({ type: b.type, i: b.i, j: b.j, rot: b.rot, queue: b.queue, prog: b.prog }));
const def = (type: string) => (DATA.BUILDINGS as any)[type] as { name: string; size: [number, number]; cost: Cost; requires?: string };

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
  const b: Building = { type, i, j, rot, tiles, group: g, glow: m.glow, smokeAt: new THREE.Vector3(...m.smoke), queue: extra.queue || 0, prog: extra.prog || 0, build: animate ? 0 : 1 };
  g.traverse(o => { o.userData.building = b; });
  tiles.forEach(t => { t.building = b; });
  worldGroup.add(g); buildings.push(b);
  if (animate) { g.scale.set(1, 0.02, 1); for (const t of tiles) puff(t.wx, topY(t) + 0.1, t.wz, '#d8c8a8', 8, 1.6, 1.8, topY(t)); }
  rebuildDeco();
  emit('built', b);
  return b;
}
export function clearBuildings() { for (const b of buildings) worldGroup.remove(b.group); buildings.length = 0; }

const _v = new THREE.Vector3();
export function smokePoint(b: Building) { return b.group.localToWorld(_v.copy(b.smokeAt)); }

export function smelt(b: Building) {
  const R = DATA.RECIPES.lingote;
  if (!afford(R.cost) || b.queue >= R.maxQueue) return false;
  pay(R.cost); b.queue++; return true;
}

export function tickBuildings(dt: number) {
  for (const b of buildings) {
    if (b.build < 1) {
      b.build = Math.min(1, b.build + dt * 1.4);
      const k = b.build, e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
      b.group.scale.set(1, b.build >= 1 ? 1 : Math.max(0.02, e), 1);
    }
    if (b.type === 'horno' && b.glow) {
      const on = b.queue > 0;
      if (on) {
        b.prog += dt / DATA.RECIPES.lingote.seconds;
        if (b.prog >= 1) {
          b.prog = 0; b.queue--; S.made++;
          const v = smokePoint(b).clone();
          puff(v.x, v.y, v.z, '#ffd04a', 10, 2.2, 1.4);
          gain('lingote', 1, v);
          emit('smelted', b);
        }
        if (Math.random() < dt * 6) { const v = smokePoint(b); smoke(v.x, v.y, v.z, Math.random() < 0.5 ? '#c8c4be' : '#a8a49e'); }
      }
      const f = on ? 1.6 + 0.5 * Math.sin(performance.now() / 110) + 0.3 * Math.sin(performance.now() / 43) : 0.18;
      (b.glow.material as THREE.MeshBasicMaterial).color.setRGB(2.4 * f * glowMul, 0.9 * f * glowMul, 0.22 * f * glowMul);
    }
    if (b.type === 'casa' && Math.random() < dt * 1.2) { const v = smokePoint(b); smoke(v.x, v.y, v.z, '#d8d4ce', 0.05, 1.8); }
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
  const tiles = footprint(place.type, place.i, place.j, place.rot);
  place.valid = footprintValid(tiles);
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
  const b = createBuilding(place.type, place.i, place.j, place.rot, true)!;
  cancelPlace();
  return b;
}
export const buildingDef = def;
