import * as THREE from 'three';
import { emit } from '../core/events';
import { scene } from '../render/renderer';
import { worldGroup, tileWorld, canExpand, addLand, buildTerrain, rebuildDeco, landTiles, DIRS, type Tile } from '../world/island';
import { vbox } from '../assets/voxel';
import { group } from '../assets/buildings';
import { puff } from '../world/particles';
import EXPANSION from '../data/expansion.json';
import { S, DATA, afford, pay, type Cost } from './state';

/* Growing the island: pick a sea cell next to the coast, pay soil (and sand for a beach),
   then send a figure to fill it in. The plot rises a little with every shovelful. */

export type ExpandKind = keyof typeof EXPANSION;
export const KINDS = EXPANSION;
export interface Site { i: number; j: number; kind: ExpandKind; hits: number; tile: Tile; group: THREE.Group; fill: THREE.Mesh }
export const sites: Site[] = [];

/** Each finished expansion makes the next one cost a little more soil. */
export function expandCost(kind: ExpandKind): Cost {
  const extra = DATA.BALANCE.expandCostStep * S.expanded.length;
  const c: Cost = { ...(KINDS[kind].cost as Cost) };
  c.tierra = (c.tierra || 0) + extra;
  return c;
}

function siteModel(kind: ExpandKind) {
  const P: THREE.BufferGeometry[] = [];
  for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) { vbox(P, x, 0.35, z, 0.07, 0.7, 0.07, '#8a5a2e'); vbox(P, x, 0.72, z, 0.09, 0.04, 0.09, '#e0b050'); }
  for (const s of [-1, 1]) { vbox(P, 0, 0.6, s * 0.42, 0.84, 0.02, 0.02, '#d8c8a0'); vbox(P, s * 0.42, 0.6, 0, 0.02, 0.02, 0.84, '#d8c8a0'); }
  const g = group({ plank: P });
  const fill = new THREE.Mesh(new THREE.BoxGeometry(0.96, 1, 0.96), new THREE.MeshStandardMaterial({ color: kind === 'playa' ? '#dcc084' : '#7a5030', roughness: 1 }));
  fill.castShadow = true; fill.receiveShadow = true;
  g.add(fill);
  const pick = new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, 1), new THREE.MeshBasicMaterial({ visible: false }));
  pick.position.y = 0.3; g.add(pick); // easy to tap even while the plot is still under water
  return { g, fill };
}

function setFill(s: Site) {
  const k = s.hits / DATA.BALANCE.fillHits;           // 0..1
  const top = -0.35 + k * 0.85;                        // from under water up to land level (0.5)
  const h = top + 0.5;
  s.fill.scale.y = Math.max(0.01, h); s.fill.position.y = top - h / 2;
}

function makeSite(i: number, j: number, kind: ExpandKind, hits = 0) {
  const [wx, wz] = tileWorld(i, j);
  const tile = { i, j, h: 1, type: 'site', variant: 0, rot: 0, wx, wz } as Tile;
  const { g, fill } = siteModel(kind);
  g.position.set(wx, 0, wz);
  const s: Site = { i, j, kind, hits, tile, group: g, fill };
  g.traverse(o => { o.userData.site = s; });
  (tile as any).site = s;
  worldGroup.add(g); sites.push(s); setFill(s);
  return s;
}

/** Pays and marks a plot. Returns a reason when it cannot. */
export function startSite(i: number, j: number, kind: ExpandKind): Site | string {
  if (!canExpand(i, j) || sites.some(s => s.i === i && s.j === j)) return 'Ahí no se puede expandir';
  const cost = expandCost(kind);
  if (!afford(cost)) return 'Te faltan materiales';
  pay(cost);
  const s = makeSite(i, j, kind);
  S.sites.push({ i, j, kind, hits: 0 });
  puff(s.tile.wx, 0.3, s.tile.wz, '#9fd4ff', 10, 1.6, 1.4);
  emit('siteChanged'); emit('changed');
  return s;
}

/** One shovelful. Returns true when the plot becomes land. */
export function fillHit(s: Site) {
  s.hits++;
  const saved = S.sites.find(q => q.i === s.i && q.j === s.j); if (saved) saved.hits = s.hits;
  puff(s.tile.wx, s.fill.position.y + s.fill.scale.y / 2, s.tile.wz, s.kind === 'playa' ? '#f0d890' : '#8a6040', 6, 1.4, 1.2);
  setFill(s);
  if (s.hits < DATA.BALANCE.fillHits) return false;
  worldGroup.remove(s.group); sites.splice(sites.indexOf(s), 1);
  S.sites = S.sites.filter(q => !(q.i === s.i && q.j === s.j));
  S.expanded.push({ i: s.i, j: s.j, kind: s.kind });
  const t = addLand(s.i, s.j, KINDS[s.kind].tile);
  buildTerrain(); rebuildDeco();
  puff(t.wx, 0.6, t.wz, '#8ad96b', 14, 2, 1.6, 0.5);
  emit('expanded', t); emit('changed');
  return true;
}

/** Re-applies saved expansions to a freshly generated island (before the terrain is built). */
export function restoreExpansions() {
  for (const e of S.expanded) addLand(e.i, e.j, KINDS[e.kind as ExpandKind]?.tile || 'pasto');
}
export function restoreSites() { for (const s of S.sites) makeSite(s.i, s.j, s.kind as ExpandKind, s.hits); }
export function clearSites() { for (const s of sites) worldGroup.remove(s.group); sites.length = 0; }

/* ---------- expand mode: sea cells that can become land glow softly ---------- */
export let expandMode = false;
const markerGeo = new THREE.PlaneGeometry(0.9, 0.9); markerGeo.rotateX(-Math.PI / 2);
const markerTex = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d')!; x.fillStyle = 'rgba(255,236,150,0.35)'; x.fillRect(0, 0, 32, 32); x.strokeStyle = '#ffe07a'; x.lineWidth = 4; x.strokeRect(2, 2, 28, 28); return c; })());
markerTex.colorSpace = THREE.SRGBColorSpace;
const markerMat = new THREE.MeshBasicMaterial({ map: markerTex, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
let markers: THREE.InstancedMesh | null = null;
let cells: [number, number][] = [];
export function enterExpandMode() {
  exitExpandMode();
  const seen = new Set<string>();
  cells = [];
  for (const t of landTiles()) for (const [a, b] of DIRS) {
    const i = t.i + a, j = t.j + b, k = `${i},${j}`;
    if (seen.has(k) || !canExpand(i, j) || sites.some(s => s.i === i && s.j === j)) continue;
    seen.add(k); cells.push([i, j]);
  }
  markers = new THREE.InstancedMesh(markerGeo, markerMat, Math.max(1, cells.length));
  const m = new THREE.Matrix4();
  cells.forEach(([i, j], k) => { const [x, z] = tileWorld(i, j); m.makeTranslation(x, 0.18, z); markers!.setMatrixAt(k, m); });
  markers.count = cells.length; markers.renderOrder = 4;
  scene.add(markers); expandMode = true; emit('expandMode', true);
}
export function exitExpandMode() {
  if (markers) { scene.remove(markers); markers.dispose(); markers = null; }
  if (expandMode) { expandMode = false; emit('expandMode', false); }
}
export function pickCell(ray: THREE.Raycaster): [number, number] | null {
  if (!markers) return null;
  const h = ray.intersectObject(markers, false)[0];
  return h && h.instanceId != null ? cells[h.instanceId] : null;
}
export function pulseMarkers(T: number) { markerMat.opacity = 0.75 + 0.25 * Math.sin(T * 4); }
