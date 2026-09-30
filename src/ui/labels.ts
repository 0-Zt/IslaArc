import * as THREE from 'three';
import { on, emit } from '../core/events';
import { camera } from '../render/renderer';
import { buildings, smokePoint, isDone, buildingDef, type Building } from '../game/buildings';
import { crew, select, selected, type Crew } from '../game/crew';
import { sites, expandMode, hitsFor } from '../game/expansion';
import { marks } from '../game/marks';
import { S, DATA, afford } from '../game/state';
import { ICON } from './hud';
import { openSheet, sheetOpen } from './sheets';

/* Status bubbles pinned to the world: what a building is doing, who is idle, what is ready. */

interface Bubble { el: HTMLButtonElement; seen: boolean; onTap: () => void }
const bubbles = new Map<object, Bubble>();
const _v = new THREE.Vector3();
const layer = document.createElement('div');
layer.id = 'labels';
document.body.appendChild(layer);

function show(key: object, at: THREE.Vector3, html: string, cls: string, label: string, onTap: () => void) {
  let b = bubbles.get(key);
  if (!b) {
    const el = document.createElement('button'); el.type = 'button';
    const bb: Bubble = { el, seen: true, onTap };
    el.addEventListener('click', () => bb.onTap());
    layer.appendChild(el); bubbles.set(key, bb); b = bb;
  }
  b.seen = true; b.onTap = onTap;
  _v.copy(at).project(camera);
  if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) { b.el.hidden = true; return; }
  b.el.hidden = false;
  b.el.style.transform = `translate(${(_v.x + 1) / 2 * innerWidth}px, ${(1 - _v.y) / 2 * innerHeight}px) translate(-50%, -100%)`;
  const c = 'bubble ' + cls;
  if (b.el.className.replace(' pop', '') !== c) b.el.className = c;
  if (b.el.dataset.h !== html) { b.el.dataset.h = html; b.el.innerHTML = html; b.el.setAttribute('aria-label', label); }
}
function pop(key: object) { const b = bubbles.get(key); if (b) { b.el.classList.remove('pop'); void b.el.offsetWidth; b.el.classList.add('pop'); } }

/* ---------- furnace ---------- */
const doneUntil = new Map<Building, number>();
on('smelted', (b: Building) => {
  _v.copy(smokePoint(b)).project(camera);
  if (_v.z > 1 || Math.abs(_v.x) > 1 || Math.abs(_v.y) > 1) emit('toast', 'Lingote listo en el horno');
  doneUntil.set(b, performance.now() + 3500); pop(b);
});

/* ---------- idle figures ---------- */
const idleSince = new Map<Crew, number>();

const HAMMER = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="4" width="11" height="6" rx="1.5" fill="#8a5a2e"/><rect x="11" y="9" width="3" height="12" rx="1" fill="#c9a06a"/></svg>';
const SHOVEL = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="11" y="2" width="2.5" height="13" fill="#c9a06a"/><path d="M7 14h10v4a5 5 0 0 1-10 0z" fill="#b9c2cc"/></svg>';

const KEYS = { plant: {}, path: {} };
const SEED = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 14Q5 14 4 7Q11 6 12 14Z" fill="#6fc955"/><path d="M12 12Q18 11 20 5Q14 4 12 12Z" fill="#8ad96b"/><rect x="11" y="12" width="2" height="6" fill="#6a4a2a"/><rect x="6" y="18" width="12" height="4" rx="2" fill="#7a5030"/></svg>';

export function tickLabels() {
  const now = performance.now();
  for (const b of bubbles.values()) b.seen = false;

  for (const b of buildings) {
    if (!isDone(b)) {
      const worker = crew.find(c => c.job?.kind === 'build' && c.job.tile.building === b);
      const at = _v.copy(b.group.position); at.y += (b.tiles.length > 1 ? 1.6 : 1.1);
      const pct = Math.round(b.work / b.need * 100), name = buildingDef(b.type).name;
      if (worker) show(b, at.clone(), `${HAMMER}<span class="meter"><i style="width:${pct}%"></i></span><small>${name}</small>`, '', `${name} en obra, ${pct} por ciento`, () => {});
      else show(b, at.clone(), `${HAMMER}<small>${name} · envía una figura</small>`, 'wait', `${name} esperando una figura`, () => emit('toast', 'Toca una figura y luego la obra para construirla'));
      continue;
    }
    if (b.type === 'horno') {
      const done = now < (doneUntil.get(b) || 0), working = b.queue > 0;
      if (!done && !working) continue;
      const at = _v.copy(smokePoint(b)); at.y += 0.35;
      const pct = Math.round(b.prog * 100), secs = Math.ceil((1 - b.prog) * DATA.RECIPES.lingote.seconds);
      if (working) show(b, at.clone(), `<img src="${ICON.lingote}" alt=""><span class="meter"><i style="width:${pct}%"></i></span><small>${secs}s${b.queue > 1 ? ` · ${b.queue} en cola` : ''}</small>`, '', `Horno fundiendo, ${pct} por ciento`, () => { if (!sheetOpen()) openSheet('horno', b); });
      else show(b, at.clone(), `<img src="${ICON.lingote}" alt=""><b>¡Lingote listo!</b>`, 'done', 'Lingote listo', () => { if (!sheetOpen()) openSheet('horno', b); });
    }
    if (b.type === 'casa') {
      const ready = Object.entries(DATA.TOOLS).some(([k, d]: [string, any]) => !S.tools[k] && afford(d.cost));
      if (!ready) continue;
      const at = _v.copy(smokePoint(b)); at.y += 0.2;
      show(b, at.clone(), `${HAMMER}<b>¡Puedes fabricar!</b>`, 'done', 'Herramienta disponible en la casa', () => { if (!sheetOpen()) openSheet('casa', b); });
    }
  }

  for (const c of crew) {
    const idle = !c.job && !c.path.length && selected !== c.id;
    if (!idle) { idleSince.delete(c); continue; }
    if (!idleSince.has(c)) idleSince.set(c, now);
    if (now - idleSince.get(c)! < 5000) continue;
    const at = _v.copy(c.root.position); at.y += 1.15;
    show(c, at.clone(), '<b class="zz">z<small>z</small>z</b>', 'idle', `${c.def.name} no tiene trabajo`, () => select(c.id));
  }

  for (const s of expandMode ? [] : sites) {
    const worker = crew.find(c => c.job?.tile === s.tile);
    const at = _v.set(s.tile.wx, 1.05, s.tile.wz);
    const pct = Math.round(s.hits / hitsFor(s.kind) * 100);
    if (worker) show(s, at.clone(), `${SHOVEL}<span class="meter"><i style="width:${pct}%"></i></span><small>${worker.def.name}</small>`, '', `Parcela ${pct} por ciento rellena`, () => {});
    else show(s, at.clone(), `${SHOVEL}<small>Envía una figura</small>`, 'wait', 'Parcela esperando una figura', () => emit('toast', 'Toca una figura y luego la parcela para rellenarla'));
  }

  // marks nobody is working on: one bubble per kind, on the first mark
  for (const kind of ['plant', 'path'] as const) {
    const m = marks.find(q => q.kind === kind);
    if (!m || crew.some(c => c.job?.kind === kind)) continue;
    const n = marks.filter(q => q.kind === kind).length;
    show(KEYS[kind], _v.set(m.tile.wx, m.tile.h * 0.5 + 0.75, m.tile.wz).clone(), `${kind === 'plant' ? SEED : SHOVEL}<small>${n} ${kind === 'plant' ? (n === 1 ? 'semilla' : 'semillas') : (n === 1 ? 'tramo' : 'tramos')} · envía una figura</small>`, 'wait', 'Marcas esperando una figura', () => emit('toast', 'Toca una figura y luego una marca para que empiece'));
  }

  for (const [k, b] of bubbles) if (!b.seen) { if (buildings.includes(k as any) || crew.includes(k as any) || sites.includes(k as any) || k === KEYS.plant || k === KEYS.path) b.el.hidden = true; else { b.el.remove(); bubbles.delete(k); } }
}
export function clearLabels() { for (const b of bubbles.values()) b.el.remove(); bubbles.clear(); idleSince.clear(); doneUntil.clear(); }
