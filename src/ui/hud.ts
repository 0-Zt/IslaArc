import * as THREE from 'three';
import { on } from '../core/events';
import { mkIcon } from '../core/canvas';
import { camera } from '../render/renderer';
import { S, RES_KEYS, DATA, capOf, type ResKey } from '../game/state';
import { REFINED } from '../game/economy';
import { crew, selected, select, statusOf } from '../game/crew';
import { has, place } from '../game/buildings';
import { currentGoal, goalText, chapterStep } from '../game/goals';
import { readyCount, fillBoard } from '../game/board';
import { nightK, phaseName } from '../render/daynight';
import type { CharId } from '../assets/characters';

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
  hondo: mkIcon(['.......', '..DDD..', '.DDDDD.', '.D.D.D.', '.DDDDD.', '..D.D..'], { D: '#2a3a5a' }),
  invento: mkIcon(['..YYY..', '.YHYYY.', '.YHYYY.', '..YYY..', '..GGG..', '...G...'], { Y: '#f2c14e', H: '#fff3c0', G: '#8a8f9a' }),
};
/** Any icon by key: a material or one of the extra ones. */
export const ico = (k: string) => `<img src="${(ICON as Record<string, string>)[k] || XICON[k] || XICON.encargo}" alt="">`;

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

/** A big centered title that pops in and fades out: stage or chapter done. */
let bannerT: number | undefined;
export function banner(title: string, sub: string, prize?: string) {
  let el = document.getElementById('banner');
  if (!el) { el = document.createElement('div'); el.id = 'banner'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.innerHTML = `<b>${title}</b><span>${sub}</span>${prize ? `<em>${prize}</em>` : ''}`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); el.classList.toggle('long', !!prize && prize.length > 8);
  clearTimeout(bannerT); bannerT = window.setTimeout(() => el!.classList.remove('show'), prize && prize.length > 8 ? 3800 : 2600);
}

/* ---------- HUD (updated in place so taps on buttons are never lost) ---------- */
const bumps: Partial<Record<ResKey, number>> = {};

let resSig = '';
export function refreshHUD(dt = 0) {
  for (const k in bumps) bumps[k as ResKey]! -= dt;
  const keys = RES_KEYS.filter(k => { const d = (DATA.RESOURCES as any)[k]; return !d.nohud && (!d.hiddenUntil && !d.hidden) || S.got[k] > 0 || (d.hiddenUntil && has(d.hiddenUntil)); });
  const sig = keys.join();
  if (sig !== resSig) {
    // two fixed rows: what the island gives (raw) and what the buildings make (refined)
    resSig = sig;
    const chip = (k: ResKey) => `<span class="chip" data-r="${k}" title="${(DATA.RESOURCES as any)[k].name}">${img(k)}<b>0</b></span>`;
    const raw = keys.filter(k => !REFINED.includes(k)), ref = keys.filter(k => REFINED.includes(k));
    $('res').innerHTML = `<div class="rrow">${raw.map(chip).join('')}</div>` + (ref.length ? `<div class="rrow ref">${ref.map(chip).join('')}</div>` : '');
  }
  for (const k of keys) {
    const el = $('res').querySelector(`[data-r="${k}"]`)!; const b = el.querySelector('b')!;
    const v = S.res[k], cap = capOf(k), fmt = (n: number) => n >= 10000 ? Math.floor(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n);
    // close to the storage limit: the chip shows the limit and turns amber when full
    const near = v >= cap * 0.8, txt = near ? `${fmt(v)}<small>/${fmt(cap)}</small>` : fmt(v);
    if (b.innerHTML !== txt) b.innerHTML = txt;
    el.classList.toggle('near', near && v < cap); el.classList.toggle('full', v >= cap);
    el.classList.toggle('bump', (bumps[k] || 0) > 0);
  }
  const g = currentGoal();
  const st = chapterStep();
  const gn = st ? `Cap. ${st.ch + 1}<span class="gp">${Array.from({ length: st.of }, (_, i) => `<i class="${i < st.done ? 'on' : i === st.done ? 'cur' : ''}"></i>`).join('')}</span>` : 'Listo';
  if ($('goalN').innerHTML !== gn) $('goalN').innerHTML = gn;
  const gt = g ? goalText(g) : 'Sigue con los encargos del tablón. La isla del faro llega pronto.';
  if ($('goalT').textContent !== gt) $('goalT').textContent = gt;
  const hint = g && !place ? g.hint : undefined;
  // crew cards
  const sig2 = crew.map(c => c.id).join() + (S.flags.musgoFree ? 'm' : '') + (S.ruins.awake ? 'b' : '');
  const box = $('crew');
  if (box.dataset.sig !== sig2) {
    box.dataset.sig = sig2;
    box.innerHTML = crew.map(c => `<button class="wcard" data-c="${c.id}"><i style="background:${c.def.color}">${c.def.name[0]}</i><div style="min-width:0"><b>${c.def.name}</b><span></span></div></button>`).join('')
      + (!S.flags.musgoFree ? `<div class="wcard locked"><i>?</i><div><b>???</b><span></span></div></div>`
        : !S.ruins.awake ? `<div class="wcard locked"><i>?</i><div><b>???</b><span></span></div></div>` : '');
  }
  const lockedSpan = box.querySelector('.locked span');
  if (lockedSpan) { const t = !S.flags.musgoFree ? (S.flags.claroVisto ? 'Enterrado en el claro' : 'Alguien falta') : S.flags.islote ? 'Duerme en las ruinas' : 'Algo brilla mar adentro'; if (lockedSpan.textContent !== t) lockedSpan.textContent = t; }
  for (const c of crew) {
    const el = box.querySelector(`[data-c="${c.id}"]`); if (!el) continue;
    el.classList.toggle('sel', selected === c.id);
    el.classList.toggle('hint', hint === 'crew' && !selected && c.id === 'arci');
    const s = selected === c.id ? 'Toca dónde trabajar' : statusOf(c);
    const sp = el.querySelector('span')!; if (sp.textContent !== s) sp.textContent = s;
  }
  $('buildBtn').classList.toggle('hint', hint === 'build' && $('sheet').hidden);
  // time of day: a sun that sinks into a moon
  const ck = nightK > 0.5 ? 'moon' : 'sun';
  const clk = $('clock');
  if (clk.dataset.k !== ck) {
    clk.dataset.k = ck;
    clk.innerHTML = ck === 'moon'
      ? '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 3a9 9 0 1 0 6 15A8 8 0 0 1 15 3z" fill="#dfe6ff"/><rect x="9" y="9" width="2" height="2" fill="#b8c2e8"/><rect x="12" y="14" width="3" height="2" fill="#b8c2e8"/></svg>'
      : '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="#ffd24a"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4M4 4l3 3M17 17l3 3M4 20l3-3M17 7l3-3" stroke="#ffd24a" stroke-width="2"/></svg>';
  }
  clk.setAttribute('aria-label', `Hora del día: ${phaseName()}`);
  // diary badge: requests ready to claim
  const rc = readyCount(), bd = $('diarioBadge');
  bd.hidden = rc === 0; if (rc && bd.textContent !== String(rc)) bd.textContent = String(rc);
}

export function initHUD() {
  $('crew').addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('[data-c]') as HTMLElement | null; if (!b) return;
    const id = b.dataset.c as CharId; select(selected === id ? null : id);
  });
  on('gain', (k: ResKey, n: number, at?: THREE.Vector3) => { bumps[k] = 0.5; if (at) floatAt(at, '+' + n, ICON[k]); });
  on('toast', toast);
  on('goalAdvanced', (big?: boolean) => { $('goal').classList.add('flash'); setTimeout(() => $('goal').classList.remove('flash'), 700); if (currentGoal() && !big) toast('Objetivo cumplido'); });
  on('levelUp', (l: number, d: { text: string }) => toast(`¡Nivel de isla ${l}! Nuevo: ${d.text}`));
  on('chapterDone', (c: { title: string; reward?: { text: string } }) => banner('¡Capítulo completo!', c.title, c.reward?.text));
  on('stageDone', (name: string, stars: number) => banner('¡Etapa completa!', name, `+${stars} ★`));
  on('achievement', (a: { name: string }, t: number) => toast(`Logro: ${a.name} (${['bronce', 'plata', 'oro'][t - 1]})`));
  on('changed', () => fillBoard());
  on('changed', () => refreshHUD());
}
