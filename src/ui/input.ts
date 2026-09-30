import * as THREE from 'three';
import { on, emit } from '../core/events';
import { renderer, camera, scene } from '../render/renderer';
import { tileProxies, topY, type Tile } from '../world/island';
import { pickTree } from '../world/trees';
import { rocks } from '../world/rocks';
import { crew, selected, select, order, type JobKind } from '../game/crew';
import { buildings, place, movePlace, rotatePlace, cancelPlace, confirmPlace } from '../game/buildings';
import { ancients, mound } from '../game/grove';
import { S } from '../game/state';
import { $, toast, refreshHUD } from './hud';
import { openSheet, closeSheet, sheetOpen } from './sheets';
import type { CharId } from '../assets/characters';

/* Touch-first input: a quick tap selects or orders; drags and pinches move the camera. */

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function aim(x: number, y: number) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
export function centreTile(): Tile | null {
  scene.updateMatrixWorld();
  ray.setFromCamera(new THREE.Vector2(0, -0.1), camera);
  const h = ray.intersectObjects(tileProxies, false)[0];
  return h ? h.object.userData.tile : null;
}

type Hit = { d: number; kind: 'char' | 'building' | 'tree' | 'rock' | 'ancient' | 'mound' | 'tile'; tile?: Tile; id?: CharId; b?: any };
function pick(): Hit | null {
  const hits: Hit[] = [];
  const up = (o: THREE.Object3D | null, key: string) => { while (o && o.userData[key] === undefined) o = o.parent; return o ? o.userData[key] : undefined; };
  const ch = ray.intersectObjects(crew.map(c => c.root), true)[0]; if (ch) hits.push({ d: ch.distance - 0.3, kind: 'char', id: ch.object.userData.char });
  const bh = ray.intersectObjects(buildings.map(b => b.group), true)[0]; if (bh) hits.push({ d: bh.distance, kind: 'building', b: up(bh.object, 'building') });
  const th = pickTree(ray); if (th) hits.push({ d: th.distance, kind: 'tree', tile: th.tree.tile });
  const rh = ray.intersectObjects(rocks, false)[0]; if (rh) hits.push({ d: rh.distance, kind: 'rock', tile: rh.object.userData.tile });
  const ah = ray.intersectObjects(ancients.map(a => a.group), true)[0]; if (ah) { const a = up(ah.object, 'ancient'); if (a && !a.falling) hits.push({ d: ah.distance, kind: 'ancient', tile: a.tile }); }
  if (mound) { const mh = ray.intersectObject(mound.group, true)[0]; if (mh) hits.push({ d: mh.distance - 0.2, kind: 'mound', tile: mound.tile }); }
  const gh = ray.intersectObjects(tileProxies, false)[0]; if (gh) hits.push({ d: gh.distance + 0.05, kind: 'tile', tile: gh.object.userData.tile });
  hits.sort((a, b) => a.d - b.d);
  return hits[0] || null;
}

const marker = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 28), new THREE.MeshBasicMaterial({ color: '#f2c14e', transparent: true, side: THREE.DoubleSide, depthWrite: false }));
marker.rotation.x = -Math.PI / 2; marker.visible = false; scene.add(marker);
let markerT = 0;
export function tickMarker(dt: number) {
  if (markerT <= 0) return;
  markerT -= dt * 1.2; (marker.material as THREE.MeshBasicMaterial).opacity = Math.max(0, markerT);
  const s = 1 + (1 - markerT) * 0.4; marker.scale.set(s, s, s); if (markerT <= 0) marker.visible = false;
}

function seeGrove() {
  if (S.flags.claroVisto) return;
  S.flags.claroVisto = true;
  toast('Entre los árboles antiguos asoma un brote verde. Hay alguien enterrado ahí.');
  emit('changed');
}

function onTap(x: number, y: number) {
  scene.updateMatrixWorld();
  aim(x, y);
  if (place) { const g = ray.intersectObjects(tileProxies, false)[0]; if (g) movePlace(g.object.userData.tile); return; }
  if (sheetOpen()) { closeSheet(); return; }
  const h = pick();
  if (!h) { select(null); return; }
  if (h.kind === 'char') { select(selected === h.id ? null : h.id!); return; }
  if (h.kind === 'building') { if (h.b && h.b.build >= 1) { select(null); openSheet(h.b.type, h.b); } return; }
  if (h.kind === 'ancient' || h.kind === 'mound') seeGrove();
  const c = selected && crew.find(q => q.id === selected);
  const t = h.tile!;
  const kind: JobKind = h.kind === 'tree' ? 'tree' : h.kind === 'rock' ? 'rock' : h.kind === 'ancient' ? 'ancient' : h.kind === 'mound' ? 'dig' : t.type === 'arena' ? 'sand' : 'walk';
  if (!c) { if (kind !== 'walk' && !(h.kind === 'ancient' || h.kind === 'mound')) toast(crew.length > 1 ? 'Primero toca a una figura' : 'Primero toca a Arci'); return; }
  if (kind === 'tree' && crew.some(o => o !== c && o.job?.tile === t)) { toast('Otra figura ya trabaja ese árbol'); return; }
  const r = order(c, t, kind);
  if (r !== true) { toast(r); return; }
  marker.position.set(t.wx, topY(t) + 0.03, t.wz); marker.visible = true; markerT = 1;
  select(null);
}

export function initInput() {
  const el = renderer.domElement;
  let down: { x: number; y: number; t: number; multi: boolean } | null = null;
  el.addEventListener('pointerdown', e => { if (e.isPrimary) down = { x: e.clientX, y: e.clientY, t: performance.now(), multi: false }; else if (down) down.multi = true; });
  el.addEventListener('pointerup', e => {
    if (!e.isPrimary || !down) return; const d = down; down = null;
    if (d.multi || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || performance.now() - d.t > 500) return;
    onTap(e.clientX, e.clientY);
  });
  $('buildBtn').addEventListener('click', () => openSheet('build'));
  $('menuBtn').addEventListener('click', () => openSheet('menu'));
  $('pCancel').addEventListener('click', () => cancelPlace());
  $('pRot').addEventListener('click', () => rotatePlace());
  $('pOk').addEventListener('click', () => {
    const r = confirmPlace();
    if (typeof r === 'string') { toast(r); return; }
    toast(`${r.type === 'casa' ? 'Casa construida' : 'Horno construido'}`); emit('changed');
  });
  on('placeChanged', (p: any) => {
    $('bottom').hidden = !!p; $('placeBar').hidden = !p; $('placeHint').hidden = !p;
    if (p) ($('pOk') as HTMLButtonElement).disabled = !p.valid;
    refreshHUD();
  });
}
