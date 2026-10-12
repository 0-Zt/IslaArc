import * as THREE from 'three';
import { on, emit } from '../core/events';
import { mkIcon } from '../core/canvas';
import { camera } from '../render/renderer';
import { S, RES_KEYS, DATA, capOf, type ResKey } from '../game/state';
import { REFINED } from '../game/economy';
import { crew, selected, select, statusOf, blockedBy, type Crew } from '../game/crew';
import { has, place } from '../game/buildings';
import { currentGoal, goalText, chapterStep } from '../game/goals';
import { readyCount, fillBoard } from '../game/board';
import { nightK, phaseName } from '../render/daynight';
import type { CharId } from '../assets/characters';
import { portrait } from './portraits';
import { sfx } from '../audio/sfx';

export const $ = (id: string) => document.getElementById(id)!;

export const ICON: Record<ResKey, string> = {
  madera: mkIcon(['.......', '.WBBBB.', 'WLWBBBB', 'WWWBBBB', '.WBBBB.'], { W: '#e0b070', L: '#8a5a2a', B: '#7a4a2a' }),
  piedra: mkIcon(['.......', '..GGG..', '.GHGGG.', 'GHGGGDG', 'GGGGGDG', '.GGDDD.'], { G: '#9aa3ad', H: '#d0d8e0', D: '#6a737d' }),
  mineral: mkIcon(['.......', '..GGG..', '.GHBGG.', 'GHGGBDG', 'GBGGGDG', '.GGDDD.'], { G: '#8a8f9a', H: '#c8d0d8', D: '#5a606a', B: '#5ab8ff' }),
  arena: mkIcon(['.......', '.......', '...S...', '..SSL..', '.SSLSS.', 'SSSSSSS'], { S: '#f0d890', L: '#c8a860' }),
  tierra: mkIcon(['.......', '.......', '...D...', '..DLD..', '.DDDLD.', 'DDDDDDD'], { D: '#7a5030', L: '#a8764a' }),
  semilla: mkIcon(['.......', '...L...', '..LGL..', '..SSS..', '.SSHSS.', '..SSS..'], { L: '#8ad96b', G: '#4ea33c', S: '#a8763a', H: '#e0b070' }),
  tablas: mkIcon(['.......', 'LLLLLLL', 'WWWWWWD', '.......', 'LLLLLLL', 'WWWWWWD', '.......'], { L: '#e0b070', W: '#c08a50', D: '#8a5a2a' }),
  ladrillo: mkIcon(['.......', 'RRR.RRR', 'RHR.RHR', '.......', 'RR.RRRR', 'RH.RHRR', '.......'], { R: '#b85a3a', H: '#d87a52' }),
  vidrio: mkIcon(['.......', '..GGG..', '.GHGGG.', '.GHGGG.', '.GGGGG.', '..GGG..', '.......'], { G: '#8fd4e0', H: '#e8fbff' }),
  lingote: mkIcon(['.......', '.......', '..MMMMM', '.MHMMMD', 'MMMMMD.', 'MDDDD..'], { M: '#b8c0cc', H: '#ffffff', D: '#6a7280' }),
  algas: mkIcon(['.G...G.', '.GL.GL.', '..GLG..', '..LGL..', '.GLG.G.', 'GG..GG.'], { G: '#3f8a4a', L: '#7fc955' }),
  cobre: mkIcon(['.......', '..CCC..', '.CHCCC.', 'CCCCCDC', 'CCHCCDC', '.CCDDD.'], { C: '#c8763a', H: '#f0b070', D: '#8a4a22' }),
  obsidiana: mkIcon(['.......', '...K...', '..KHK..', '.KKPKK.', 'KKPKKKK', '.KKKKK.'], { K: '#1e1826', H: '#6a5a8a', P: '#3c3050' }),
  cuarzo: mkIcon(['...Q...', '..QHQ..', '.Q.QH.Q', '.QH.QQH', 'QQHQQQ.', '.DDDDD.'], { Q: '#7ad8f0', H: '#e8fbff', D: '#4a5a6a' }),
  carbon: mkIcon(['.......', '..KK...', '.KHKK.K', '.KKKKKH', 'KKHKKKK', '.KKKDK.'], { K: '#3a3632', H: '#6a625a', D: '#e0602a' }),
};
export const img = (k: ResKey) => `<img src="${ICON[k]}" alt="">`;
/** Pixel icons for things that are not materials (tasks, achievements). */
export const XICON: Record<string, string> = {
  obra: mkIcon(['.......', '.HHHH..', '.HHHHD.', '...W...', '...W...', '...W...'], { H: '#9aa3ad', D: '#6a737d', W: '#a8763a' }),
  adorno: mkIcon(['...P...', '..PYP..', '...P...', '.L.G.L.', '..LGL..', '...G...'], { P: '#e86a8a', Y: '#f2c14e', G: '#4ea33c', L: '#8ad96b' }),
  sendero: mkIcon(['.......', 'G.DD..G', 'G..DD.G', 'G...DDG', 'G..DD.G', 'G.DD..G'], { D: '#d8b880', G: '#6fb04a' }),
  noche: mkIcon(['...YYY.', '..YY...', '.YY....', '.YY....', '..YY...', '...YYY.'], { Y: '#f2e0a0' }),
  encargo: mkIcon(['.......', '.PPPPP.', '.PLLLP.', '.PPPPP.', '.PLLPP.', '.PPPPP.'], { P: '#f0e0b8', L: '#8a7050' }),
  caja: mkIcon(['.......', 'BBBBBBB', 'BLLBLLB', 'BBBBBBB', 'BLLBLLB', 'BBBBBBB'], { B: '#8a5a2e', L: '#c08a50' }),
  botella: mkIcon(['...C...', '..GGG..', '..GHG..', '.GGHGG.', '.GPPGG.', '.GGGGG.'], { C: '#a8763a', G: '#6ab8a0', H: '#d8f8ee', P: '#f0e0b8' }),
  // things from the sea
  alga: mkIcon(['.G...G.', '.GL.GL.', '..GLG..', '..LGL..', '.GLG.G.', 'GG..GG.'], { G: '#3f8a4a', L: '#7fc955' }),
  concha: mkIcon(['.......', '..PPP..', '.PLPLP.', 'PLPLPLP', '.PPPPP.', '...P...'], { P: '#e8a0a8', L: '#fff0f0' }),
  deriva: mkIcon(['.......', '.......', 'WWWWWW.', 'WLLLLLW', '.WWWWWW', '.......'], { W: '#d8d0c0', L: '#b8ac98' }),
  canto: mkIcon(['.......', '..GGG..', '.GHGGG.', '.GGGGD.', '..GDD..', '.......'], { G: '#a8b0b8', H: '#e0e8ee', D: '#7a838d' }),
  bota: mkIcon(['..BBB..', '..BLB..', '..BBB..', '..BBBB.', '.BBBBBB', '.DDDDDD'], { B: '#b07a44', L: '#d4a060', D: '#6a4226' }),
  bota2: mkIcon(['BBB.BBB', 'BLB.BLB', 'BBB.BBB', 'BBBBBBB', 'BBBBBBB', 'DDDDDDD'], { B: '#b07a44', L: '#d4a060', D: '#6a4226' }),
  vasija: mkIcon(['.......', '..RR...', '.RWRR..', 'RRBBRR.', '.RRRR..', '..RR...'], { R: '#c06a42', W: '#f0d0a0', B: '#3a6ab0' }),
  estrella: mkIcon(['...Y...', '..YYY..', 'YYYHYYY', '.YYYYY.', '.YY.YY.', 'Y.....Y'], { Y: '#f2c14e', H: '#fff3c0' }),
  engranaje: mkIcon(['.G.G.G.', 'GGGGGGG', '.GG.GG.', 'GG...GG', '.GG.GG.', 'GGGGGGG'], { G: '#6a9a7a' }),
  caracola: mkIcon(['....PP.', '..PPLPP', '.PLPPP.', 'PPLLP..', '.PPP...', 'PP.....'], { P: '#e8c8a0', L: '#c08868' }),
  perla: mkIcon(['.......', '..WWW..', '.WHWWW.', '.WWWWW.', '..WWD..', '.......'], { W: '#f0e8f0', H: '#ffffff', D: '#c8b8d0' }),
  llave: mkIcon(['.GGG...', 'G.G.G..', '.GGG...', '..G....', '..GG...', '..GGG..'], { G: '#5aa88a' }),
  ancla: mkIcon(['...G...', '..GGG..', '...G...', 'G..G..G', 'GG.G.GG', '.GGGGG.'], { G: '#8a96a4' }),
  cofre: mkIcon(['.......', '.BBBBB.', 'BLLYLLB', 'BBBYBBB', 'BLLLLLB', 'BBBBBBB'], { B: '#6a4226', L: '#a8743e', Y: '#f2c14e' }),
  brujula: mkIcon(['..BBB..', '.BWWWB.', 'BWWRWWB', 'BWWRWWB', '.BWWWB.', '..BBB..'], { B: '#a8743e', W: '#f0e6d0', R: '#d9463c' }),
  hundido: mkIcon(['.......', '.BBBBB.', 'BGGYGGB', 'BBBYBBB', 'BGGGGGB', 'BBBBBBB'], { B: '#3a4a3e', G: '#5a7a5e', Y: '#c8a040' }),
  timon: mkIcon(['B..B..B', '.BBBBB.', '.B.Y.B.', 'BBYYYBB', '.B.Y.B.', '.BBBBB.'], { B: '#8a5a2e', Y: '#c8a040' }),
  cristal: mkIcon(['...C...', '..CHC..', '.CCHCC.', '.CCCCC.', '..CCC..', '...C...'], { C: '#5ab8e8', H: '#e8fbff' }),
  medusa: mkIcon(['..GGG..', '.GHGGG.', 'GGGGGGG', '.G.G.G.', '.G.G.G.', 'G..G..G'], { G: '#a8d8f0', H: '#ffffff' }),
  balsa: mkIcon(['...M...', '...MS..', '...MSS.', 'TTTTTTT', 'TLTLTLT', '.......'], { M: '#6a4226', S: '#f0e6d0', T: '#b08450', L: '#7fc955' }),
  figurita: mkIcon(['...H...', '..HHH..', '...H...', '.HHHHH.', '..HHH..', '..H.H..'], { H: '#d4ac86' }),
  molde: mkIcon(['.......', 'SSSSSSS', 'SDDSDDS', 'SDDSDDS', 'SSSSSSS', '.......'], { S: '#8a8078', D: '#3a3430' }),
  sello: mkIcon(['..BBB..', '.BBBBB.', 'BBYYYBB', 'BBYBYBB', '.BBBBB.', '..BBB..'], { B: '#b08840', Y: '#f0d070' }),
  reliquia: mkIcon(['.......', '...?...', '..???..', '...?...', '.SSSSS.', '.SSSSS.'], { '?': '#4a4048', S: '#5e5650' }),
  hondo: mkIcon(['.......', '..DDD..', '.DDDDD.', '.D.D.D.', '.DDDDD.', '..D.D..'], { D: '#2a3a5a' }),
  invento: mkIcon(['..YYY..', '.YHYYY.', '.YHYYY.', '..YYY..', '..GGG..', '...G...'], { Y: '#f2c14e', H: '#fff3c0', G: '#8a8f9a' }),
};
/** Any icon by key: a material or one of the extra ones. */
export const ico = (k: string) => `<img src="${(ICON as Record<string, string>)[k] || XICON[k] || XICON.encargo}" alt="">`;

/* ---------- toasts, floating gains, icons that fly to the tray ---------- */
export function toast(m: string) {
  const box = $('toast'), el = document.createElement('div');
  el.className = 'toast'; el.textContent = m; box.appendChild(el);
  setTimeout(() => el.remove(), 2800);
  while (box.children.length > 2) box.firstChild!.remove();
}
const _v = new THREE.Vector3();
function toScreen(v: THREE.Vector3): [number, number] | null {
  _v.copy(v).project(camera); if (_v.z > 1) return null;
  return [(_v.x + 1) / 2 * innerWidth, (1 - _v.y) / 2 * innerHeight];
}
export function floatAt(v: THREE.Vector3, txt: string, icon?: string) {
  const p = toScreen(v); if (!p) return;
  const el = document.createElement('div'); el.className = 'float';
  el.style.left = p[0] + 'px'; el.style.top = p[1] + 'px';
  el.innerHTML = `${icon ? `<img src="${icon}" alt="">` : ''}${txt}`;
  document.body.appendChild(el); el.addEventListener('animationend', () => el.remove());
}
let flying = 0;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The material's icon arcs from where it was gathered to its chip (or to the bag). */
function flyTo(k: ResKey, from: THREE.Vector3) {
  if (reduced || flying >= 8 || document.hidden) return;
  const p = toScreen(from); if (!p) return;
  const chip = $('res').querySelector(`[data-r="${k}"]`) as HTMLElement | null;
  const target = chip && chip.offsetParent ? chip.querySelector('img')! : $('bagBtn');
  const r = target.getBoundingClientRect(); if (!r.width) return;
  const x1 = r.left + r.width / 2, y1 = r.top + r.height / 2, [x0, y0] = p;
  const el = document.createElement('img'); el.className = 'fly'; el.src = ICON[k]; el.alt = '';
  document.body.appendChild(el); flying++;
  const mx = (x0 + x1) / 2 + (x0 < x1 ? -40 : 40), my = Math.min(y0, y1) - 60;
  const a = el.animate([
    { transform: `translate(${x0}px,${y0 - 20}px) scale(.6)`, opacity: 0 },
    { transform: `translate(${x0}px,${y0 - 34}px) scale(1.25)`, opacity: 1, offset: 0.18 },
    { transform: `translate(${mx}px,${my}px) scale(1.05)`, offset: 0.55 },
    { transform: `translate(${x1}px,${y1}px) scale(.8)`, opacity: 1 },
  ], { duration: 780, easing: 'cubic-bezier(.45,0,.7,1)' });
  a.onfinish = () => {
    el.remove(); flying--;
    const host = chip && chip.offsetParent ? chip : $('bagBtn');
    host.classList.remove('bump'); void host.offsetWidth; host.classList.add('bump');
    setTimeout(() => host.classList.remove('bump'), 220);
  };
}

/** A big centered title that pops in and fades out: stage done. */
let bannerT: number | undefined;
export function banner(title: string, sub: string, prize?: string) {
  let el = document.getElementById('banner');
  if (!el) { el = document.createElement('div'); el.id = 'banner'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.innerHTML = `<b>${title}</b><span>${sub}</span>${prize ? `<em>${prize}</em>` : ''}`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); el.classList.toggle('long', !!prize && prize.length > 8);
  clearTimeout(bannerT); bannerT = window.setTimeout(() => el!.classList.remove('show'), prize && prize.length > 8 ? 3800 : 2600);
}

/** A chapter is done: a clay card with confetti over the island. It never blocks a tap:
    any touch (or a few seconds) sends it away. */
export function chapterCard(n: number, title: string, reward?: string, stars = 0) {
  document.getElementById('chCard')?.remove();
  const el = document.createElement('div'); el.id = 'chCard'; el.setAttribute('aria-live', 'polite');
  const COL = ['#f5b941', '#d98b55', '#7cb85a', '#4a86c0', '#e86a8a', '#fff8ea'];
  let conf = '';
  if (!reduced) for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 160;
    conf += `<i style="background:${COL[i % COL.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 60}px;--r:${Math.round(Math.random() * 720 - 360)}deg;animation-delay:${Math.random() * 0.15}s"></i>`;
  }
  const st = stars > 0 ? '<i>★</i><i>★</i><i>★</i>' : '';
  el.innerHTML = `<div class="chc clay"><div class="confetti">${conf}</div><span class="rib">¡Capítulo ${n} completo!</span><small>Capítulo ${n}</small><b>${title}</b>${st ? `<div class="stars">${st}</div>` : ''}${reward ? `<p>${reward}</p>` : ''}<div class="tap">Toca para seguir</div></div>`;
  document.body.appendChild(el);
  let gone = false;
  const close = () => { if (gone) return; gone = true; removeEventListener('pointerdown', close, true); el.classList.add('out'); setTimeout(() => el.remove(), 360); };
  setTimeout(() => addEventListener('pointerdown', close, true), 400);
  setTimeout(close, 6000);
}

/* ---------- HUD (updated in place so taps on buttons are never lost) ---------- */
const bumps: Partial<Record<ResKey, number>> = {};
/* The tray shows only the few materials that matter now: what the goal names, what is full,
   and what was gathered or spent most recently. Everything else lives in the bag. */
const touched: Partial<Record<ResKey, number>> = {};
let prevRes: Record<string, number> | null = null;
let shown: ResKey[] = [], resSig = '';
const fmt = (n: number) => n >= 10000 ? Math.floor(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n);
function goalRes(keys: ResKey[]): ResKey[] {
  const g = currentGoal(); if (!g) return [];
  const t = goalText(g).toLowerCase();
  return keys.filter(k => { const n = String((DATA.RESOURCES as any)[k].name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); return t.normalize('NFD').replace(/[̀-ͯ]/g, '').includes(n.slice(0, Math.max(4, n.length - 2))); });
}
function slots() {
  const w = $('hudL').clientWidth || innerWidth - 70;
  return Math.max(3, Math.min(9, Math.floor((w - 50) / 54)));
}
export const visibleRes = () => RES_KEYS.filter(k => { const d = (DATA.RESOURCES as any)[k]; return !d.nohud && (!d.hiddenUntil && !d.hidden) || S.got[k] > 0 || (d.hiddenUntil && has(d.hiddenUntil)); });

const JOB_ICON: Record<string, string> = { tree: 'madera', ancient: 'madera', stump: 'madera', rock: 'piedra', cueva: 'piedra', sand: 'arena', soil: 'tierra', dig: 'tierra', fill: 'tierra', plant: 'semilla', path: 'sendero', build: 'obra', avivar: 'carbon', recoger: 'caja', pescar: 'caracola', navegar: 'balsa' };
function badge(c: Crew): [string, string] {
  if (blockedBy(c)) return ['warn', '!'];
  if (c.path.length) return ['', ''];
  if (!c.job || c.job.kind === 'walk') return ['zz', 'zz'];
  const k = JOB_ICON[c.job.kind]; return k ? ['work', ico(k)] : ['', ''];
}

export function refreshHUD(dt = 0) {
  for (const k in bumps) bumps[k as ResKey]! -= dt;
  const keys = visibleRes();
  // what changed since the last look (a whole new save changes everything at once: not "recent")
  const now = performance.now();
  if (prevRes) { const ch = keys.filter(k => S.res[k] !== prevRes![k]); if (ch.length < 5) for (const k of ch) touched[k] = now; }
  prevRes = { ...S.res };
  const pin = goalRes(keys), n = slots();
  const score = (k: ResKey) => (pin.includes(k) ? 4e12 : 0) + (S.res[k] >= capOf(k) ? 2e12 : 0) + (touched[k] || 0) - RES_KEYS.indexOf(k);
  const pick = keys.slice().sort((a, b) => score(b) - score(a)).slice(0, n).sort((a, b) => RES_KEYS.indexOf(a) - RES_KEYS.indexOf(b));
  const sig = pick.join();
  if (sig !== resSig) {
    const before = shown; resSig = sig; shown = pick;
    $('res').innerHTML = pick.map(k => `<span class="chip${resSig && before.length && !before.includes(k) ? ' in' : ''}" data-r="${k}" title="${(DATA.RESOURCES as any)[k].name}">${img(k)}<b>0</b></span>`).join('');
  }
  for (const k of shown) {
    const el = $('res').querySelector(`[data-r="${k}"]`) as HTMLElement; const b = el.querySelector('b')!;
    const v = S.res[k], cap = capOf(k), txt = fmt(v);
    if (b.textContent !== txt) b.textContent = txt;
    el.classList.toggle('near', v >= cap * 0.8 && v < cap); el.classList.toggle('full', v >= cap);
    el.classList.toggle('bump', (bumps[k] || 0) > 0);
  }
  // a chip that does not fit is left for the bag
  const res = $('res'); let vis = [...res.children] as HTMLElement[];
  vis.forEach(c => c.hidden = false);
  for (let i = vis.length - 1; i >= 3 && res.scrollWidth > res.clientWidth + 1; i--) vis[i].hidden = true;
  const full = keys.filter(k => S.res[k] >= capOf(k) && !shown.includes(k)).length, bb = $('bagBadge');
  bb.hidden = !full; if (full && bb.textContent !== '!') bb.textContent = '!';

  const g = currentGoal();
  const st = chapterStep();
  const gn = st ? `Cap. ${st.ch + 1}<span class="gp">${Array.from({ length: st.of }, (_, i) => `<i class="${i < st.done ? 'on' : i === st.done ? 'cur' : ''}"></i>`).join('')}</span>` : 'Listo';
  if ($('goalN').innerHTML !== gn) $('goalN').innerHTML = gn;
  const gt = g ? goalText(g) : 'Sigue con los encargos del tablón. La Isla Ardiente llega pronto.';
  if ($('goalT').textContent !== gt) $('goalT').textContent = gt;
  const hint = g && !place ? g.hint : undefined;
  // crew portraits
  const lockedHint = !S.flags.musgoFree ? (S.flags.claroVisto ? 'Enterrado en el claro' : 'Alguien falta') : !S.ruins.awake ? (S.flags.islote ? 'Duerme en las ruinas' : 'Algo brilla mar adentro') : '';
  const sig2 = crew.map(c => c.id).join() + '|' + lockedHint;
  const box = $('crewRow');
  if (box.dataset.sig !== sig2) {
    box.dataset.sig = sig2;
    const face = (id: CharId, name: string) => { const u = portrait(id); return u ? `<img src="${u}" alt="">` : `<em>${name[0]}</em>`; };
    box.innerHTML = crew.map(c => `<button class="wcard" data-c="${c.id}" style="--c:${c.def.color}"><span class="face">${face(c.id, c.def.name)}</span><b>${c.def.name}</b><span class="st"></span></button>`).join('')
      + (lockedHint ? `<button class="wcard locked" data-locked="${lockedHint}" aria-label="Figura por descubrir: ${lockedHint}"><span class="face"><em>?</em></span><b>???</b></button>` : '');
  }
  for (const c of crew) {
    const el = box.querySelector(`[data-c="${c.id}"]`) as HTMLElement | null; if (!el) continue;
    el.classList.toggle('sel', selected === c.id);
    el.classList.toggle('hint', hint === 'crew' && !selected && c.id === 'arci');
    const s = statusOf(c), al = `${c.def.name}: ${selected === c.id ? 'toca dónde trabajar' : s}`;
    if (el.getAttribute('aria-label') !== al) el.setAttribute('aria-label', al);
    const [cls, html] = badge(c), sp = el.querySelector('.st') as HTMLElement;
    if (sp.dataset.h !== cls + html) { sp.dataset.h = cls + html; sp.className = 'st ' + cls; sp.innerHTML = html; }
  }
  const sel = selected && crew.find(c => c.id === selected);
  let tip = document.getElementById('crewTip');
  const tipHTML = sel ? `<b>${sel.def.name}</b> · toca dónde trabajar` : '';
  if (tipHTML && !tip) { tip = document.createElement('div'); tip.id = 'crewTip'; tip.className = 'clay'; $('crew').appendChild(tip); }
  if (tip) { if (!tipHTML) tip.remove(); else if (tip.innerHTML !== tipHTML) tip.innerHTML = tipHTML; }
  $('buildBtn').classList.toggle('hint', hint === 'build' && $('sheet').hidden);
  // time of day: a sun that sinks into a moon
  const ck = nightK > 0.5 ? 'moon' : 'sun';
  const clk = $('clock');
  if (clk.dataset.k !== ck) {
    clk.dataset.k = ck;
    clk.innerHTML = ck === 'moon'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3a9 9 0 1 0 6 15A8 8 0 0 1 15 3z" fill="#dfe6ff" stroke="#3a3a6a" stroke-width="1.6"/><rect x="9" y="9" width="2" height="2" fill="#b8c2e8"/><rect x="12" y="14" width="3" height="2" fill="#b8c2e8"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4M4.5 4.5l2.8 2.8M16.7 16.7l2.8 2.8M4.5 19.5l2.8-2.8M16.7 7.3l2.8-2.8" stroke="#e09a1a" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="5" fill="#ffd24a" stroke="#5e3b22" stroke-width="1.6"/></svg>';
  }
  clk.setAttribute('aria-label', `Hora del día: ${phaseName()}`);
  // diary badge: requests ready to claim
  const rc = readyCount(), bd = $('diarioBadge');
  bd.hidden = rc === 0; if (rc && bd.textContent !== String(rc)) bd.textContent = String(rc);
}

export function initHUD() {
  $('crew').addEventListener('click', e => {
    const lk = (e.target as HTMLElement).closest('[data-locked]') as HTMLElement | null;
    if (lk) { toast(`Falta alguien: ${lk.dataset.locked!.toLowerCase()}`); return; }
    const b = (e.target as HTMLElement).closest('[data-c]') as HTMLElement | null; if (!b) return;
    const id = b.dataset.c as CharId; select(selected === id ? null : id); sfx('tap');
  });
  $('tray').addEventListener('click', () => { sfx('tap'); emit('openBag'); });
  on('gain', (k: ResKey, n: number, at?: THREE.Vector3) => { bumps[k] = 0.5; touched[k] = performance.now(); if (at) { floatAt(at, '+' + n, ICON[k]); refreshHUD(); flyTo(k, at); } });
  on('toast', toast);
  on('goalAdvanced', (big?: boolean) => { $('goal').classList.add('flash'); setTimeout(() => $('goal').classList.remove('flash'), 700); if (currentGoal() && !big) toast('Objetivo cumplido'); });
  on('levelUp', (l: number, d: { text: string }) => toast(`¡Nivel de isla ${l}! Nuevo: ${d.text}`));
  on('chapterDone', (c: { id: string; title: string; reward?: { text: string; stars?: number } }) => chapterCard(Math.max(1, (DATA.CHAPTERS as any[]).findIndex(x => x.id === c.id) + 1), c.title, c.reward?.text, c.reward?.stars || 0));
  on('stageDone', (name: string, stars: number) => banner('¡Etapa completa!', name, `+${stars} ★`));
  on('achievement', (a: { name: string }, t: number) => toast(`Logro: ${a.name} (${['bronce', 'plata', 'oro'][t - 1]})`));
  on('changed', () => fillBoard());
  on('changed', () => refreshHUD());
}
