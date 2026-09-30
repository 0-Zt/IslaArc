import * as THREE from 'three';
import { on, emit } from '../core/events';
import { camera } from '../render/renderer';
import { buildings, smokePoint, type Building } from '../game/buildings';
import { DATA } from '../game/state';
import { ICON } from './hud';
import { openSheet, sheetOpen } from './sheets';

/* Status bubbles pinned above buildings: the furnace shows its work and says when a bar is ready. */

interface Bubble { el: HTMLButtonElement; b: Building; doneUntil: number }
const bubbles = new Map<Building, Bubble>();
const _v = new THREE.Vector3();
const layer = document.createElement('div');
layer.id = 'labels';
document.body.appendChild(layer);

function ensure(b: Building) {
  let x = bubbles.get(b);
  if (!x) {
    const el = document.createElement('button');
    el.className = 'bubble'; el.type = 'button';
    el.addEventListener('click', () => { if (!sheetOpen()) openSheet('horno', b); });
    layer.appendChild(el);
    x = { el, b, doneUntil: 0 }; bubbles.set(b, x);
  }
  return x;
}

on('smelted', (b: Building) => {
  _v.copy(smokePoint(b)).project(camera);
  if (_v.z > 1 || Math.abs(_v.x) > 1 || Math.abs(_v.y) > 1) emit('toast', 'Lingote listo en el horno');
  const x = ensure(b); x.doneUntil = performance.now() + 3500; x.el.classList.remove('pop'); void x.el.offsetWidth; x.el.classList.add('pop'); });

export function tickLabels() {
  for (const [b, x] of bubbles) if (!buildings.includes(b)) { x.el.remove(); bubbles.delete(b); }
  for (const b of buildings) {
    if (b.type !== 'horno') continue;
    const x = ensure(b), now = performance.now();
    const done = now < x.doneUntil, working = b.queue > 0;
    if (!done && !working) { x.el.hidden = true; continue; }
    _v.copy(smokePoint(b)); _v.y += 0.35; _v.project(camera);
    if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) { x.el.hidden = true; continue; }
    x.el.hidden = false;
    x.el.style.transform = `translate(${(_v.x + 1) / 2 * innerWidth}px, ${(1 - _v.y) / 2 * innerHeight}px) translate(-50%, -100%)`;
    const pct = Math.round(b.prog * 100);
    const secs = Math.ceil((1 - b.prog) * DATA.RECIPES.lingote.seconds);
    const html = done && !working
      ? `<img src="${ICON.lingote}" alt=""><b>¡Lingote listo!</b>`
      : `<img src="${ICON.lingote}" alt=""><span class="meter"><i style="width:${pct}%"></i></span><small>${secs}s${b.queue > 1 ? ` · ${b.queue} en cola` : ''}</small>`;
    if (x.el.dataset.h !== html) { x.el.dataset.h = html; x.el.innerHTML = html; }
    x.el.classList.toggle('done', done && !working);
    x.el.setAttribute('aria-label', done && !working ? 'Lingote listo' : `Horno fundiendo, ${pct} por ciento`);
  }
}
export function clearLabels() { for (const x of bubbles.values()) x.el.remove(); bubbles.clear(); }
