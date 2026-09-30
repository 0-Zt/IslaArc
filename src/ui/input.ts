import * as THREE from 'three';
import { on, emit } from '../core/events';
import { renderer, camera, scene, controls, flyTo } from '../render/renderer';
import { tileProxies, topY, tileAt as tileAtIJ, type Tile } from '../world/island';
import { pickTree } from '../world/trees';
import { rocks } from '../world/rocks';
import { crew, selected, select, order, tileOf, nextSite, assignIdleBuilder, type JobKind } from '../game/crew';
import { buildings, place, movePlace, rotatePlace, cancelPlace, confirmPlace, isDone, buildingDef } from '../game/buildings';
import { ancients, mound } from '../game/grove';
import { stumps, sproutMeshes, growing, growthProgress } from '../game/forest';
import { marks, markMode, toggleMark, exitMarkMode, nearestMark, type MarkKind } from '../game/marks';
import { sites, expandMode, pickCell, exitExpandMode, startSite, cancelSite, refreshMarkers, expandCost, expandKind, setExpandKind, KINDS, type ExpandKind } from '../game/expansion';
import { S } from '../game/state';
import { ready as readyReq } from '../game/board';
import { ruinPropMeshes, shrineMeshes, slotOf, isIslet } from '../game/ruins';
import { beachMeshes } from '../game/beach';
import { $, toast, refreshHUD, img } from './hud';
import { openSheet, closeSheet, sheetOpen, openRuin, openFlame, openDiario } from './sheets';
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

type Hit = { d: number; kind: 'char' | 'building' | 'tree' | 'rock' | 'ancient' | 'mound' | 'stump' | 'sprout' | 'mark' | 'site' | 'ruin' | 'shrine' | 'beach' | 'tile'; mk?: MarkKind; k?: number; tile?: Tile; id?: CharId; b?: any };
function pick(): Hit | null {
  const hits: Hit[] = [];
  const up = (o: THREE.Object3D | null, key: string) => { while (o && o.userData[key] === undefined) o = o.parent; return o ? o.userData[key] : undefined; };
  const ch = ray.intersectObjects(crew.map(c => c.root), true)[0]; if (ch) hits.push({ d: ch.distance - 0.3, kind: 'char', id: ch.object.userData.char });
  const bh = ray.intersectObjects(buildings.map(b => b.group), true)[0]; if (bh) hits.push({ d: bh.distance, kind: 'building', b: up(bh.object, 'building') });
  const th = pickTree(ray); if (th) hits.push({ d: th.distance, kind: 'tree', tile: th.tree.tile });
  const rh = ray.intersectObjects(rocks, false)[0]; if (rh) hits.push({ d: rh.distance, kind: 'rock', tile: rh.object.userData.tile });
  const ah = ray.intersectObjects(ancients.map(a => a.group), true)[0]; if (ah) { const a = up(ah.object, 'ancient'); if (a && !a.falling) hits.push({ d: ah.distance, kind: 'ancient', tile: a.tile }); }
  if (mound) { const mh = ray.intersectObject(mound.group, true)[0]; if (mh) hits.push({ d: mh.distance - 0.2, kind: 'mound', tile: mound.tile }); }
  const sh = ray.intersectObjects([...stumps.values()], true)[0]; if (sh) hits.push({ d: sh.distance - 0.15, kind: 'stump', tile: up(sh.object, 'stumpTile') });
  const xh = ray.intersectObjects(sites.map(s => s.group), true)[0]; if (xh) { const s = up(xh.object, 'site'); if (s) hits.push({ d: xh.distance - 0.6, kind: 'site', tile: s.tile }); }
  const ph = ray.intersectObjects(sproutMeshes(), true)[0]; if (ph) hits.push({ d: ph.distance - 0.3, kind: 'sprout', tile: up(ph.object, 'sproutTile') });
  const mh2 = ray.intersectObjects(marks.map(m => m.group), true)[0]; if (mh2) { const m = up(mh2.object, 'mark'); if (m) hits.push({ d: mh2.distance - 0.3, kind: 'mark', tile: m.tile, mk: m.kind }); }
  const uh = ray.intersectObjects(ruinPropMeshes(), true)[0]; if (uh) hits.push({ d: uh.distance - 0.3, kind: 'ruin', k: up(uh.object, 'ruinSlot') });
  const bh2 = ray.intersectObjects(beachMeshes(), true)[0]; if (bh2) { const it = up(bh2.object, 'beachItem'); if (it) hits.push({ d: bh2.distance - 0.6, kind: 'beach', tile: tileAtIJ(it.i, it.j) }); }
  const qh = ray.intersectObjects(shrineMeshes(), true)[0]; if (qh) hits.push({ d: qh.distance, kind: 'shrine' });
  const gh = ray.intersectObjects(tileProxies, false)[0]; if (gh) hits.push({ d: gh.distance + 0.05, kind: 'tile', tile: gh.object.userData.tile });
  hits.sort((a, b) => a.d - b.d);
  // with a figure selected, tapping "through" it at a job behind it gives the order instead of deselecting
  if (hits[0]?.kind === 'char' && hits[0].id === selected && hits[1] && hits[1].kind !== 'char' && hits[1].kind !== 'tile') return hits[1];
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

export function onTap(x: number, y: number) {
  scene.updateMatrixWorld();
  aim(x, y);
  if (place) { const g = ray.intersectObjects(tileProxies, false)[0]; if (g) movePlace(g.object.userData.tile); return; }
  if (expandMode) {
    // tapping a plot that is only marked takes it back (materials are returned)
    const xh = ray.intersectObjects(sites.map(q => q.group), true)[0];
    if (xh) {
      let o: THREE.Object3D | null = xh.object; while (o && !o.userData.site) o = o.parent;
      const st = o?.userData.site;
      if (st && !cancelSite(st)) toast('Esa parcela ya se está rellenando');
      refreshMarkers(); refreshExpandBar(); return;
    }
    const cell = pickCell(ray);
    if (!cell) { toast('Toca una de las casillas de agua marcadas'); return; }
    const r = startSite(cell[0], cell[1], expandKind);
    if (typeof r === 'string') toast(r);
    refreshMarkers(); refreshExpandBar();
    return;
  }
  if (markMode) {
    const g = ray.intersectObjects(tileProxies, false)[0];
    if (!g) return;
    const r = toggleMark(g.object.userData.tile, markMode.kind, markMode.type);
    if (r) toast(r);
    return;
  }
  if (sheetOpen()) { closeSheet(); return; }
  const h = pick();
  if (!h) { select(null); return; }
  if (h.kind === 'char') { select(selected === h.id ? null : h.id!); return; }
  if (h.kind === 'ruin') { select(null); openRuin(h.k!); return; }
  if (h.kind === 'beach' && h.tile) {
    // the selected figure goes to pick it up, or else the nearest free one
    const sel = selected ? crew.find(q => q.id === selected) : null;
    const who = sel || crew.filter(q => !q.job && !q.path.length).sort((a, b) => a.root.position.distanceTo(h.tile!.proxy!.position) - b.root.position.distanceTo(h.tile!.proxy!.position))[0];
    if (!who) { toast('Toca una figura y luego lo que trajo el mar'); return; }
    const r = order(who, h.tile, 'recoger'); if (r !== true) toast(r); else { select(null); toast(`${who.def.name} va a recogerlo`); }
    return;
  }
  if (h.kind === 'shrine') { toast(S.ruins.awake ? 'El santuario de Brasa. La lava todavía tibia corre hacia el centro.' : 'Una estatua de arcilla oscura, sentada en el centro. Parece dormida.'); return; }
  if (h.kind === 'building') {
    const b = h.b; if (!b) return;
    const c0 = selected ? crew.find(q => q.id === selected) : null;
    if (!isDone(b)) {
      const c = selected && crew.find(q => q.id === selected);
      if (c) { const r = order(c, b.tiles[0], 'build'); if (r !== true) toast(r); else select(null); }
      else toast(`${buildingDef(b.type).name} en obra: ${Math.round(b.work / b.need * 100)}%. Toca una figura y luego la obra.`);
      return;
    }
    if (b.type === 'horno' && c0 && c0.id === 'brasa') { const r = order(c0, b.tiles[0], 'avivar'); if (r !== true) toast(r); else { select(null); toast('Brasa va a avivar el fuego del horno'); } return; }
    if (b.type === 'casa') { select(null); openSheet('casa', b); }
    if (b.type === 'horno' || b.type === 'aserradero') { select(null); openSheet('prod', b); }
    if (b.type === 'taller') { select(null); openSheet('taller', b); }
    if (b.type === 'tablon') { select(null); openDiario('encargos'); }
    if (b.type === 'brasero') { const k = slotOf(b.tiles[0]); select(null); if (S.ruins.lit[k]) toast('Esta llama ya arde.'); else openFlame(k); }
    return;
  }
  if (h.kind === 'ancient' || h.kind === 'mound') seeGrove();
  const c = selected && crew.find(q => q.id === selected);
  const t = h.tile!;
  const kind: JobKind = h.kind === 'tree' ? 'tree' : h.kind === 'rock' ? 'rock' : h.kind === 'ancient' ? 'ancient' : h.kind === 'mound' ? 'dig'
    : h.kind === 'stump' || h.kind === 'sprout' ? 'stump' : h.kind === 'mark' ? h.mk! : h.kind === 'site' ? 'fill' : t.type === 'arena' ? 'sand' : t.type === 'tierra' || (t.type === 'piedras' && !t.rock) ? 'soil' : 'walk';
  if (!c && h.kind === 'sprout') { const g = growing.get(t); if (g) toast(`Retoño de ${g.type}: ${Math.round(growthProgress(g) * 100)}% crecido. Con una figura puedes arrancarlo y recuperar la semilla.`); return; }
  if (!c) { if (kind !== 'walk' && !(h.kind === 'ancient' || h.kind === 'mound')) toast(h.kind === 'site' ? 'Toca una figura y luego la parcela para rellenarla' : h.kind === 'mark' ? 'Toca una figura y luego una marca para que empiece' : crew.length > 1 ? 'Primero toca a una figura' : 'Primero toca a Arci'); return; }
  if ((kind === 'tree' || kind === 'fill' || kind === 'stump' || kind === 'plant' || kind === 'path') && crew.some(o => o !== c && o.job?.tile === t)) { toast('Otra figura ya está trabajando ahí'); return; }
  const r = order(c, t, kind);
  if (r !== true) { toast(r); return; }
  marker.position.set(t.wx, topY(t) + 0.03, t.wz); marker.visible = true; markerT = 1;
  select(null);
}

let lastMode: MarkKind = 'plant';
/** The nearest free figure picks up the hammer; tells the player who, or what to do. */
export function announceBuilder(type: string) {
  if (crew.some(c => c.job?.kind === 'build')) { toast('Obra marcada. Se construirá cuando termine la anterior.'); return; }
  const c = assignIdleBuilder();
  toast(c ? `${c.def.name} va a construir: ${buildingDef(type).name.toLowerCase()}` : 'Obra marcada. Toca una figura y luego la obra para construirla.');
}
function refreshExpandBar() {
  const pending = sites.filter(q => q.hits === 0).length;
  const c = expandCost(expandKind);
  const cost = Object.entries(c).map(([k, v]) => `${v} de ${k}`).join(' y ');
  const t = `Toca el agua marcada para agregar parcelas (la siguiente cuesta ${cost}). Toca una parcela para quitarla.${pending ? ` Marcadas: ${pending}.` : ''}`;
  const span = $('expandBar').querySelector('span')!; if (span.textContent !== t) span.textContent = t;
  const h = (Object.keys(KINDS) as ExpandKind[]).map(k => `<button data-kind="${k}" class="${k === expandKind ? 'on' : ''}">${img(k === 'playa' ? 'arena' : k === 'puente' ? 'madera' : 'tierra')}${KINDS[k].name}</button>`).join('');
  const box = $('xKinds'); if (box.dataset.sig !== h) { box.dataset.sig = h; box.innerHTML = h; }
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
  $('diarioBtn').addEventListener('click', () => openDiario(S.board.list.some(r => readyReq(r)) ? 'encargos' : 'ruta'));
  $('pCancel').addEventListener('click', () => cancelPlace());
  $('pRot').addEventListener('click', () => rotatePlace());
  $('pOk').addEventListener('click', () => {
    const r = confirmPlace();
    if (typeof r === 'string') { toast(r); return; }
    emit('changed');
    announceBuilder(r.type);
  });
  $('xExit').addEventListener('click', () => { exitExpandMode(); exitMarkMode(); });
  $('xKinds').addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('[data-kind]') as HTMLElement | null; if (!b) return;
    setExpandKind(b.dataset.kind as ExpandKind); refreshExpandBar();
  });
  on('changed', () => { if (expandMode) refreshExpandBar(); });
  on('markMode', (m: { kind: MarkKind } | null) => {
    $('bottom').hidden = !!m; $('expandBar').hidden = !m;
    if (m) { $('xKinds').innerHTML = ''; $('xKinds').dataset.sig = ''; $('expandBar').querySelector('span')!.textContent = m.kind === 'plant' ? 'Toca el pasto donde quieras un árbol. Toca una marca para quitarla.' : 'Toca el pasto para trazar el sendero. Toca una marca para quitarla.'; return; }
    refreshHUD();
    // the nearest idle figure gets to work on the new marks
    const kind: MarkKind = lastMode;
    if (!marks.some(q => q.kind === kind) || crew.some(c => c.job?.kind === kind)) return;
    const idle = crew.filter(c => !c.job && !c.path.length);
    for (const c of idle) {
      const here = tileOf(c); const mk = here && nearestMark(here, kind, () => false, 99);
      if (mk && order(c, mk.tile, kind) === true) { toast(`${c.def.name} va a ${kind === 'plant' ? 'plantar' : 'hacer el sendero'}`); return; }
    }
    toast('Toca una figura y luego una marca para que empiece');
  });
  on('markMode', (m: { kind: MarkKind } | null) => { if (m) lastMode = m.kind; });
  let before: { target: THREE.Vector3; zoom: number } | null = null;
  on('expandMode', (on_: boolean) => {
    $('bottom').hidden = on_; $('expandBar').hidden = !on_; refreshHUD();
    if (on_) refreshExpandBar();
    else {
      $('xKinds').innerHTML = ''; $('xKinds').dataset.sig = '';
      // the nearest idle figure starts on the new plots
      if (sites.length && !crew.some(c => c.job?.kind === 'fill')) {
        const idle = crew.find(c => !c.job && !c.path.length);
        if (idle) { nextSite(idle); toast(idle.job?.kind === 'fill' ? `${idle.def.name} va a rellenar ${sites.length === 1 ? 'la parcela' : `${sites.length} parcelas`}` : 'Nadie llega a las parcelas: despeja la orilla (árboles o rocas) junto a ellas'); }
        else toast('Toca una figura y luego una parcela para rellenarla');
      }
    }
    if (on_) { before = { target: controls.target.clone(), zoom: camera.zoom }; flyTo(new THREE.Vector3(0, 0.5, 0), Math.min(camera.zoom, innerWidth < innerHeight ? 0.36 : 0.7)); }
    else if (before) { flyTo(before.target, before.zoom); before = null; }
  });
  on('placeChanged', (p: any) => {
    $('bottom').hidden = !!p; $('placeBar').hidden = !p; $('placeHint').hidden = !p;
    if (p) ($('pOk') as HTMLButtonElement).disabled = !p.valid;
    refreshHUD();
  });
}
export function debugPick(x: number, y: number) { scene.updateMatrixWorld(); aim(x, y); const h = pick(); return h && { kind: h.kind, d: h.d, ij: h.tile && [h.tile.i, h.tile.j], sites: sites.length, siteHits: ray.intersectObjects(sites.map(s => s.group), true).length, origin: ray.ray.origin.toArray() }; }
