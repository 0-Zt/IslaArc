import { S } from '../game/state';
import { CHAPTERS, GOALS, goalText, goalDone, currentChapter } from '../game/goals';
import { LEVELS, ACHIEVEMENTS, TIER_NAMES, levelProgress, achProgress, boardSlots } from '../game/progress';
import { boardOpen, progressOf, ready, claim, swap } from '../game/board';
import { img } from './hud';

/* The island's diary: the route by chapters, the notice board requests and the achievements. */

export type DiarioTab = 'ruta' | 'encargos' | 'logros';
let tab: DiarioTab = 'ruta';
export function setTab(t: DiarioTab) { tab = t; }
export const diarioSig = () => tab + JSON.stringify([S.goal, S.stars, S.board.list, S.ach, S.res, Math.floor(S.time / 5)]);

const check = '<svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true"><path d="M2 6l3 3 5-6" stroke="#8ae070" stroke-width="2" fill="none"/></svg>';
const lock = '<svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true"><rect x="2" y="5" width="8" height="6" rx="1" fill="#8a8478"/><path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="#8a8478" stroke-width="1.5" fill="none"/></svg>';
const STAR = '<span class="dstar">★</span>';
const MEDAL = ['#8a8478', '#c8844a', '#c8ccd4', '#f2c14e'];

function levelCard() {
  const p = levelProgress();
  const next = LEVELS[p.level];
  return `<div class="dlevel"><div class="dlv"><small>Nivel de isla</small><b>${p.level}</b></div>
    <div class="dlinfo"><div class="dbar"><i style="width:${Math.round(p.k * 100)}%"></i></div>
    <small>${p.to ? `${S.stars} / ${p.to} ${STAR} · próximo: ${next.text}` : `${S.stars} ${STAR} · nivel máximo por ahora`}</small></div></div>`;
}

function ruta() {
  const cur = currentChapter();
  let h = '';
  CHAPTERS.forEach((c, k) => {
    const done = S.chDone.includes(c.id), now = k === cur && !done && !c.locked;
    const state = done ? 'done' : now ? 'now' : c.locked || k > cur ? 'locked' : '';
    h += `<div class="dch ${state}"><div class="dnode">${done ? check : c.locked ? lock : k + 1}</div><div class="dbody">`
      + `<b>Capítulo ${k + 1} · ${c.title}</b><small>${c.locked ? `Próximamente. ${c.desc}` : c.desc}</small>`;
    if (now) {
      h += '<ul class="dgoals">';
      GOALS.forEach((g, i) => { if (g.ch !== k) return; const d = goalDone(i), a = i === S.goal; h += `<li class="${d ? 'd' : a ? 'a' : ''}">${d ? check : a ? '▸' : '·'} ${goalText(g)}</li>`; });
      h += '</ul>';
    }
    if (c.reward && !c.locked) h += `<small class="drew">${done ? 'Recompensa recibida' : 'Recompensa'}: ${c.reward.text}</small>`;
    h += '</div></div>';
  });
  return levelCard() + `<div class="droute">${h}</div>`;
}

function encargos() {
  if (!boardOpen()) return levelCard() + '<p>Construye el <b>tablón de encargos</b> (Construir, después de la casa). Ahí llegan pedidos de la isla que dan estrellas y regalos.</p>';
  let h = levelCard() + `<p>Cumple pedidos para ganar estrellas. Tienes ${boardSlots()} a la vez; cada nivel de isla suma más.</p>`;
  S.board.list.forEach((r, i) => {
    const ok = ready(r), p = progressOf(r);
    const cost = r.cost ? `<div class="cost">${Object.entries(r.cost).map(([k, v]) => `<span class="${(S.res as any)[k] >= (v as number) ? '' : 'no'}">${img(k as any)}${(S.res as any)[k]}/${v}</span>`).join('')}</div>` : `<div class="dbar sm"><i style="width:${Math.round(p / r.need * 100)}%"></i></div><small>${p} de ${r.need}</small>`;
    const rew = `+${r.reward.stars} ${STAR}` + Object.entries(r.reward.res || {}).map(([k, v]) => ` · ${img(k as any)}${v}`).join('');
    h += `<div class="row dreq${ok ? ' ok' : ''}"><div class="info"><b>${r.text}</b>${cost}<small class="drew">${rew}</small></div>`
      + `<div class="dbtns"><button class="btn${ok ? ' main' : ''}" data-claim="${i}" ${ok ? '' : 'disabled'}>${r.kind === 'entrega' ? 'Entregar' : 'Cobrar'}</button>`
      + `<button class="btn sm" data-swap="${i}" aria-label="Cambiar este encargo">Cambiar</button></div></div>`;
  });
  return h;
}

function logros() {
  let h = levelCard();
  for (const a of ACHIEVEMENTS) {
    const p = achProgress(a), k = p.next ? (p.value - p.prev) / (p.next - p.prev) : 1;
    h += `<div class="row dach"><div class="dmedal" style="background:${MEDAL[p.tier]}">${p.tier ? '★' : '·'}</div><div class="info"><b>${a.name}</b>`
      + `<small>${a.desc}: ${p.value}${p.next ? ` / ${p.next}` : ' · completo'}${p.tier ? ` · ${TIER_NAMES[p.tier - 1]}` : ''}</small>`
      + `<div class="dbar sm"><i style="width:${Math.round(Math.min(1, k) * 100)}%"></i></div></div></div>`;
  }
  return h;
}

export function diarioHTML() {
  const tabs: [DiarioTab, string][] = [['ruta', 'Ruta'], ['encargos', 'Encargos'], ['logros', 'Logros']];
  return `<h2>Diario de la isla</h2><div class="seg dtabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" data-tab="${k}" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}">${n}</button>`).join('')}</div>`
    + (tab === 'ruta' ? ruta() : tab === 'encargos' ? encargos() : logros());
}

/** Handles a tap inside the diary. Returns a message to show, if any. */
export function diarioClick(b: HTMLElement): string | null | undefined {
  if (b.dataset.tab) { tab = b.dataset.tab as DiarioTab; return null; }
  if (b.dataset.claim) return claim(Number(b.dataset.claim));
  if (b.dataset.swap) return swap(Number(b.dataset.swap));
  return undefined;
}
