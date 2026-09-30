import * as THREE from 'three';
import { on } from '../core/events';
import { mkIcon } from '../core/canvas';
import { camera } from '../render/renderer';
import { S, RES_KEYS, DATA, type ResKey } from '../game/state';
import { crew, selected, select, statusOf } from '../game/crew';
import { has, place } from '../game/buildings';
import { currentGoal, GOALS } from '../game/goals';
import type { CharId } from '../assets/characters';

export const $ = (id: string) => document.getElementById(id)!;

export const ICON: Record<ResKey, string> = {
  madera: mkIcon(['.......', '.WBBBB.', 'WLWBBBB', 'WWWBBBB', '.WBBBB.'], { W: '#e0b070', L: '#8a5a2a', B: '#7a4a2a' }),
  piedra: mkIcon(['.......', '..GGG..', '.GHGGG.', 'GHGGGDG', 'GGGGGDG', '.GGDDD.'], { G: '#9aa3ad', H: '#d0d8e0', D: '#6a737d' }),
  mineral: mkIcon(['.......', '..GGG..', '.GHBGG.', 'GHGGBDG', 'GBGGGDG', '.GGDDD.'], { G: '#8a8f9a', H: '#c8d0d8', D: '#5a606a', B: '#5ab8ff' }),
  arena: mkIcon(['.......', '.......', '...S...', '..SSL..', '.SSLSS.', 'SSSSSSS'], { S: '#f0d890', L: '#c8a860' }),
  tierra: mkIcon(['.......', '.......', '...D...', '..DLD..', '.DDDLD.', 'DDDDDDD'], { D: '#7a5030', L: '#a8764a' }),
  semilla: mkIcon(['.......', '...L...', '..LGL..', '..SSS..', '.SSHSS.', '..SSS..'], { L: '#8ad96b', G: '#4ea33c', S: '#a8763a', H: '#e0b070' }),
  lingote: mkIcon(['.......', '.......', '..MMMMM', '.MHMMMD', 'MMMMMD.', 'MDDDD..'], { M: '#b8c0cc', H: '#ffffff', D: '#6a7280' }),
};
export const img = (k: ResKey) => `<img src="${ICON[k]}" alt="">`;

/* ---------- toasts and floating gains ---------- */
export function toast(m: string) {
  const box = $('toast'), el = document.createElement('div');
  el.className = 'toast'; el.textContent = m; box.appendChild(el);
  setTimeout(() => el.remove(), 2800);
  while (box.children.length > 2) box.firstChild!.remove();
}
const _v = new THREE.Vector3();
export function floatAt(v: THREE.Vector3, txt: string, icon?: string) {
  _v.copy(v).project(camera); if (_v.z > 1) return;
  const el = document.createElement('div'); el.className = 'float';
  el.style.left = (_v.x + 1) / 2 * innerWidth + 'px'; el.style.top = (1 - _v.y) / 2 * innerHeight + 'px';
  el.innerHTML = `${icon ? `<img src="${icon}" alt="">` : ''}${txt}`;
  document.body.appendChild(el); el.addEventListener('animationend', () => el.remove());
}

/* ---------- HUD (updated in place so taps on buttons are never lost) ---------- */
const bumps: Partial<Record<ResKey, number>> = {};
let resSig = '';
export function refreshHUD(dt = 0) {
  for (const k in bumps) bumps[k as ResKey]! -= dt;
  const keys = RES_KEYS.filter(k => { const d = (DATA.RESOURCES as any)[k]; return (!d.hiddenUntil && !d.hidden) || S.got[k] > 0 || (d.hiddenUntil && has(d.hiddenUntil)); });
  const sig = keys.join();
  if (sig !== resSig) { resSig = sig; $('res').innerHTML = keys.map(k => `<span class="chip" data-r="${k}" title="${(DATA.RESOURCES as any)[k].name}">${img(k)}<b>0</b></span>`).join(''); }
  for (const k of keys) {
    const el = $('res').querySelector(`[data-r="${k}"]`)!; const b = el.querySelector('b')!;
    if (b.textContent !== String(S.res[k])) b.textContent = String(S.res[k]);
    el.classList.toggle('bump', (bumps[k] || 0) > 0);
  }
  const g = currentGoal();
  $('goalN').textContent = g ? `${S.goal + 1}/${GOALS.length}` : 'Listo';
  const gt = g ? g.text : 'Isla despierta. Sigue jugando libremente.';
  if ($('goalT').textContent !== gt) $('goalT').textContent = gt;
  const hint = g && !place ? g.hint : undefined;
  // crew cards
  const sig2 = crew.map(c => c.id).join();
  const box = $('crew');
  if (box.dataset.sig !== sig2) {
    box.dataset.sig = sig2;
    box.innerHTML = crew.map(c => `<button class="wcard" data-c="${c.id}"><i style="background:${c.def.color}">${c.def.name[0]}</i><div style="min-width:0"><b>${c.def.name}</b><span></span></div></button>`).join('')
      + (S.flags.musgoFree ? '' : `<div class="wcard locked"><i>?</i><div><b>???</b><span>${S.flags.claroVisto ? 'Enterrado en el claro' : 'Alguien falta'}</span></div></div>`);
  }
  const lockedSpan = box.querySelector('.locked span'); if (lockedSpan) { const t = S.flags.claroVisto ? 'Enterrado en el claro' : 'Alguien falta'; if (lockedSpan.textContent !== t) lockedSpan.textContent = t; }
  for (const c of crew) {
    const el = box.querySelector(`[data-c="${c.id}"]`); if (!el) continue;
    el.classList.toggle('sel', selected === c.id);
    el.classList.toggle('hint', hint === 'crew' && !selected && c.id === 'arci');
    const s = selected === c.id ? 'Toca dónde trabajar' : statusOf(c);
    const sp = el.querySelector('span')!; if (sp.textContent !== s) sp.textContent = s;
  }
  $('buildBtn').classList.toggle('hint', hint === 'build' && $('sheet').hidden);
}

export function initHUD() {
  $('crew').addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('[data-c]') as HTMLElement | null; if (!b) return;
    const id = b.dataset.c as CharId; select(selected === id ? null : id);
  });
  on('gain', (k: ResKey, n: number, at?: THREE.Vector3) => { bumps[k] = 0.5; if (at) floatAt(at, '+' + n, ICON[k]); });
  on('toast', toast);
  on('goalAdvanced', () => { $('goal').classList.add('flash'); setTimeout(() => $('goal').classList.remove('flash'), 700); if (S.goal < GOALS.length) toast('Objetivo cumplido'); });
  on('changed', () => refreshHUD());
}
