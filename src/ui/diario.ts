import { RELICS, ARD_RELICS } from '../game/cave';
import { S } from '../game/state';
import { CHAPTERS, GOALS, goalText, goalDone, currentChapter, stagesOf } from '../game/goals';
import { LEVELS, ACHIEVEMENTS, TIER_NAMES, levelProgress, achProgress, boardSlots } from '../game/progress';
import { boardOpen, progressOf, ready, claim, swap } from '../game/board';
import { img, ico } from './hud';
import { LORE_TEXT } from '../game/beach';
import { INV } from '../game/production';
import { ITEMS, sizeLabel } from '../game/fishing';
import { XICON } from './hud';
import { portrait } from './portraits';

/* The island's diary: the route by chapters, the notice board requests and the achievements. */

export type DiarioTab = 'ruta' | 'encargos' | 'logros' | 'equipo' | 'mar';
let tab: DiarioTab = 'ruta';
let viewCh: number | null = null, viewSt: number | null = null;   // chapter / stage being looked at (null: the current one)
export function setTab(t: DiarioTab) { tab = t; viewCh = viewSt = null; }
export const diarioSig = () => tab + viewCh + ':' + viewSt + JSON.stringify([S.goal, S.stars, S.board.list, S.ach, S.res, S.crew, S.lore, Math.floor(S.time / 5), S.fish]);

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

/* The route, kept short: a row of chapter blocks, and inside the chapter a row of stage
   blocks. Only one stage's goals are listed at a time (3 at most). */
function ruta() {
  const cur = currentChapter();
  const chState = (k: number) => S.chDone.includes(CHAPTERS[k].id) ? 'done' : CHAPTERS[k].locked ? 'locked' : k === cur ? 'now' : k < cur ? 'done' : 'next';
  const ch = viewCh ?? cur;
  let h = levelCard() + '<div class="chstrip" role="tablist" aria-label="Capítulos">';
  CHAPTERS.forEach((c, k) => {
    const st = chState(k);
    const inner = st === 'done' ? check : st === 'locked' ? lock : String(k + 1);
    let bar = '';
    if (st === 'now') { const all = GOALS.filter(g => g.ch === k), d = all.filter(g => goalDone(GOALS.indexOf(g))).length; bar = `<em><i style="width:${Math.round(d / all.length * 100)}%"></i></em>`; }
    h += `<button class="chb ${st}${k === ch ? ' sel' : ''}" data-ch="${k}" role="tab" aria-selected="${k === ch}" aria-label="Capítulo ${k + 1}: ${c.title}">${inner}${bar}</button>`;
  });
  h += '</div>';

  const c = CHAPTERS[ch], st = chState(ch);
  h += `<div class="chcard ${st}"><small class="chnum">Capítulo ${ch + 1}${st === 'done' ? ' · completo' : ''}</small><b class="chtitle">${c.title}</b>`;
  if (st === 'locked' || st === 'next') {
    h += `<p class="chdesc">${c.desc}</p><div class="chlock">${lock} ${st === 'locked' ? 'Llega en una próxima versión' : `Se abre al terminar el capítulo ${ch}`}</div>`;
    if (c.reward) h += `<div class="chrew">${STAR} Al terminarlo: ${c.reward.text}</div>`;
    return h + '</div>';
  }
  const stages = stagesOf(ch);
  const curSt = stages.findIndex(s => S.goal < s.to);
  const nowSt = st === 'done' ? -1 : curSt;
  const sel = viewSt ?? (nowSt >= 0 ? nowSt : stages.length - 1);
  h += '<div class="stgs">';
  stages.forEach((s, i) => {
    const done = S.goal >= s.to, now = i === nowSt;
    let pips = '';
    for (let g = s.from; g < s.to; g++) pips += `<i class="${goalDone(g) ? 'on' : g === S.goal ? 'cur' : ''}"></i>`;
    h += `<button class="stg${done ? ' done' : now ? ' now' : ' next'}${i === sel ? ' sel' : ''}" data-st="${i}" ${!done && !now ? 'disabled' : ''} aria-label="Etapa ${i + 1}: ${s.name}"><span class="pips">${pips}</span><small>${done || now ? s.name : 'Etapa ' + (i + 1)}</small></button>`;
  });
  h += '</div>';
  const s = stages[sel];
  h += `<div class="stname">Etapa ${sel + 1} de ${stages.length} · <b>${s.name}</b></div><ul class="gls">`;
  for (let i = s.from; i < s.to; i++) {
    const d = goalDone(i), a = i === S.goal;
    h += a ? `<li class="a"><small>Ahora</small>${goalText(GOALS[i])}</li>`
      : d ? `<li class="d">${check}<span>${goalText(GOALS[i])}</span></li>`
      : `<li class="n"><span>Después:</span> ${goalText(GOALS[i])}</li>`;
  }
  h += '</ul>';
  if (c.reward) h += `<div class="chrew">${STAR} ${st === 'done' ? 'Recibiste' : 'Al terminar el capítulo'}: ${c.reward.text}</div>`;
  if (st !== 'done' && sel === nowSt && sel < stages.length - 1) h += `<div class="stnote">Cada etapa completa da +1 ${STAR}</div>`;
  return h + '</div>';
}

/* Requests as cards: a big icon, the goal, a bar or the materials, the prize. "Cobrar" only
   appears when it can be claimed; changing a request is the small round button. */
const REQ_ICON: Record<string, string> = { talar: 'madera', piedra: 'piedra', arena: 'arena', lingotes: 'lingote', plantar: 'semilla', adornos: 'adorno', parcelas: 'tierra', senderos: 'sendero', noche: 'noche' };
function encargos() {
  if (!boardOpen()) return levelCard() + `<div class="rq lockcard"><div class="rqi">${ico('encargo')}</div><div class="rqb"><b>Construye el tablón de encargos</b><small>Está en Construir, después de la casa. Ahí llegan pedidos que dan estrellas y regalos.</small></div></div>`;
  let h = levelCard() + `<div class="dsub">Encargos · ${boardSlots()} a la vez</div>`;
  S.board.list.forEach((r, i) => {
    const ok = ready(r), p = progressOf(r);
    const icon = r.kind === 'entrega' ? Object.keys(r.cost || {})[0] : REQ_ICON[r.kind] || 'encargo';
    const body = r.cost
      ? `<div class="rqcost">${Object.entries(r.cost).map(([k, v]) => `<span class="${(S.res as any)[k] >= (v as number) ? 'have' : ''}">${img(k as any)}${Math.min((S.res as any)[k], v as number)}/${v}</span>`).join('')}</div>`
      : `<div class="rqbar"><div class="dbar sm"><i style="width:${Math.round(Math.min(1, p / r.need) * 100)}%"></i></div><small>${Math.min(p, r.need)}/${r.need}</small></div>`;
    const prize = `<span class="rqp">+${r.reward.stars}${STAR}${Object.entries(r.reward.res || {}).map(([k, v]) => ` ${img(k as any)}${v}`).join('')}</span>`;
    h += `<div class="rq${ok ? ' ok' : ''}"><div class="rqi">${ico(icon)}</div><div class="rqb"><b>${r.text}</b>${body}</div>`
      + `<div class="rqa">${ok ? `<button class="btn main sm" data-claim="${i}">${r.kind === 'entrega' ? 'Entregar' : 'Cobrar'}</button>` : prize}`
      + `<button class="rqswap" data-swap="${i}" aria-label="Cambiar este encargo" title="Cambiar"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M13 5.5A5.5 5.5 0 0 0 3 4M3 10.5A5.5 5.5 0 0 0 13 12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M2 1.5v3h3M14 14.5v-3h-3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg></button></div>`
      + (ok ? `<div class="rqok">${prize}</div>` : '') + '</div>';
  });
  return h;
}

/* Achievements as a grid of medals: icon, name, bar, and three dots for bronze, silver, gold. */
const ACH_ICON: Record<string, string> = { talador: 'madera', cantero: 'piedra', arenero: 'arena', fundidor: 'lingote', jardinero: 'semilla', arquitecto: 'obra', decorador: 'adorno', tierra: 'tierra', caminante: 'sendero', noctambulo: 'noche', vecino: 'encargo', playero: 'caja', lector: 'botella', inventor: 'invento' };
function logros() {
  const list = ACHIEVEMENTS.map(a => ({ a, p: achProgress(a) }));
  const medals = list.reduce((n, q) => n + q.p.tier, 0), max = list.length * 3;
  let h = levelCard() + `<div class="dsub">Medallas · ${medals} de ${max}</div><div class="achg">`;
  for (const { a, p } of list) {
    const k = p.next ? (p.value - p.prev) / (p.next - p.prev) : 1;
    const dots = [0, 1, 2].map(t => `<i class="${t < p.tier ? 't' + (t + 1) : ''}"></i>`).join('');
    h += `<div class="ach t${p.tier}${p.next ? '' : ' full'}"><div class="achi">${ico(ACH_ICON[a.id] || 'encargo')}</div><div class="achb"><b>${a.name}</b><small>${a.desc}</small>`
      + `<div class="dbar sm"><i style="width:${Math.round(Math.min(1, k) * 100)}%"></i></div><div class="achn"><span>${p.value}${p.next ? `/${p.next}` : ''}</span><span class="tdots" aria-label="${p.tier ? TIER_NAMES[p.tier - 1] : 'sin medalla'}">${dots}</span></div></div></div>`;
  }
  return h + '</div>';
}

const TEAM = [
  { id: 'arci', name: 'Arci', color: '#c98655', skill: 'Manos de alfarera', desc: 'Construye un 50 % más rápido que las demás.', how: 'Está desde el principio.' },
  { id: 'musgo', name: 'Musgo', color: '#7e9c58', skill: 'Pulgar verde', desc: 'Lo que planta nace un paso más crecido, al talar suelta el doble de semillas y en el bosque los tocones que deja rebrotan antes.', how: 'Duerme enterrado en el claro de los árboles antiguos.' },
  { id: 'brasa', name: 'Brasa', color: '#5c3d31', skill: 'Corazón de brasa', desc: 'Al picar roca, a veces funde el mineral ahí mismo y sale un lingote. Si lo mandas al horno, aviva el fuego: todo sale el doble de rápido. De noche da luz.', how: 'Una estatua en las ruinas, mar adentro.' },
  { id: 'marea', name: 'Marea', color: '#4a86c0', skill: 'Ojo de agua', desc: 'Lo que vive en el agua se acerca antes a su anzuelo, y desde más lejos.', how: 'Una figura azul pintada en una vasija, pescando desde una balsa mar adentro.', when: () => (S.fish.vasija || 0) >= 4 || S.crew.includes('marea') },
  { id: 'golem', name: 'El gólem', color: '#4a3a30', skill: 'Guardián de la montaña', desc: 'Se quedó cuidando el corazón del volcán. Gracias a él, la caracola grande ya calma las olas.', how: 'Duerme en el río de lava, junto al pedestal de la caracola.', when: () => !!S.cave?.caracola },
  { id: 'espectro', name: '???', color: '#6a7488', skill: '???', desc: 'Dicen que un barco aparece de noche cuando el faro está apagado.', how: 'Más adelante.' },
];
const FIELD: Record<string, string> = { arci: 'empuja rocas (también al agua, a la lava y a los géiseres), tiende puentes de tablas.', musgo: 'aparta enredaderas, corta la hierba alta y los matorrales secos.', brasa: 'camina sobre las brasas y enciende el fuego (braseros, chimeneas, la forja).', marea: 'camina por el agua baja y enfría la lava que corre.' };
const UPS: Record<string, { flag: string; text: string }> = {
  musgo: { flag: 'semilla', text: 'Semilla antigua: puentes de raíces sobre las grietas, y lo que planta nace dos pasos más crecido.' },
  brasa: { flag: 'corazon', text: 'Corazón de magma: su luz llega lejos en la oscuridad, y funde mineral el doble de seguido.' },
};
function equipo() {
  let h = '<h3>Figuras</h3>';
  for (const f of TEAM as { id: string; name: string; color: string; skill: string; desc: string; how: string; when?: () => boolean }[]) {
    if (f.when && !f.when()) continue;
    const has = f.id === 'golem' ? !!S.flags.golemCalmo : S.crew.includes(f.id);
    const up = has && UPS[f.id]?.flag && S.flags[UPS[f.id].flag] ? `<br><span style="color:var(--good)">${UPS[f.id].text}</span>` : '';
    const field = has && FIELD[f.id] ? `<br>En exploración: ${FIELD[f.id]}` : '';
    const face = has && ['arci', 'musgo', 'brasa', 'marea'].includes(f.id) ? portrait(f.id as any) : '';
    h += `<div class="row${has ? '' : ' dim'}"><div class="dmedal" style="background:${face ? `radial-gradient(circle at 50% 30%,#fff8ea,${f.color} 140%)` : f.color};color:#fff">${face ? `<img src="${face}" alt="">` : has ? f.name[0] : '?'}</div><div class="info"><b>${has ? f.name : '???'} · ${has ? f.skill : 'habilidad oculta'}</b><small>${has ? f.desc : f.how}${field}${up}</small></div></div>`;
  }
  h += `<h3>Inventos (${Object.keys(S.inv).length}/${Object.values(INV).filter(d => !d.locked).length})</h3>`;
  const made = Object.keys(S.inv).filter(k => S.inv[k]);
  h += made.length ? `<p>${made.map(k => INV[k].name).join(' · ')}</p>` : '<p style="color:var(--muted)">Construye el taller (después del aserradero) para inventar mejoras.</p>';
  h += `<h3>Mensajes en botellas (${S.lore.length}/${LORE_TEXT.length})</h3>`;
  h += S.lore.length ? S.lore.slice().sort((a, b) => a - b).map(i => `<p class="lore sm">${LORE_TEXT[i]}</p>`).join('') : '<p style="color:var(--muted)">A veces el mar deja botellas en la playa. Cada una trae un pedazo de la historia de los Alfareros.</p>';
  return h;
}

export /* The Sea collection: every thing the sea can give back, as a silhouette until it is caught. */
const TIER_NAME = { orilla: 'Orilla · gancho de madera', media: 'Aguas medias · anzuelo de metal', profunda: 'Agua oscura · desde la balsa' };
function mar() {
  const sea = !!S.flags.zarpo, all = Object.entries(ITEMS), got = all.filter(([k]) => S.fish[k]).length, total = all.filter(([, it]) => sea || it.tier !== 'profunda').length;
  let h = `<div class="dsub">Colección del mar · ${Math.min(got, total)} de ${total}</div>`;
  if (!S.fish || !Object.keys(S.fish).length) h += '<p style="color:var(--muted)">Construye el muelle (Construir, después del aserradero) y tócalo para pescar. Las figuras no sacan peces: el mar devuelve cosas.</p>';
  for (const tier of ['orilla', 'media', 'profunda'] as const) {
    const list = all.filter(([, it]) => it.tier === tier);
    const n = list.filter(([k]) => S.fish[k]).length;
    h += `<div class="mtier"><b>${TIER_NAME[tier]}</b>${tier !== 'profunda' || sea ? `<small>${n}/${list.length}${(tier === 'orilla' ? S.flags.colOrilla : tier === 'media' ? S.flags.colMedia : S.flags.colHondo) ? ' · completa' : ` · completarla da +${tier === 'orilla' ? 3 : tier === 'media' ? 5 : 8} ★`}</small>` : ''}</div><div class="mgrid">`;
    for (const [k, it] of list) {
      const c = S.fish[k] || 0;
      const hint = tier === 'profunda' && !sea ? 'Mar adentro' : `${sizeLabel(it.size)}${it.time === 'noche' ? ' · de noche' : ''}${it.after ? ' · más adelante' : ''}`;
      h += `<div class="mcell${c ? ' got' : ''}" title="${c ? it.name : hint}"><img class="pix${c ? '' : ' sil'}" src="${XICON[k] || XICON.hondo}" alt=""><b>${c ? it.name : '???'}</b><small>${c ? (it.pieces ? `${Math.min(c, it.pieces)}/${it.pieces}` : `×${c}`) : hint}</small></div>`;
    }
    h += '</div>';
  }
  if (S.flags.cuevaEntro) {
    const got = RELICS.filter(r => S.cave?.relics?.includes(r.id));
    h += `<div class="mtier"><b>Reliquias de la cueva</b><small>${got.length}/${RELICS.length} · tras paredes huecas</small></div><div class="mgrid">`;
    for (const r of RELICS) { const c = S.cave?.relics?.includes(r.id); h += `<div class="mcell${c ? ' got' : ''}"><img class="pix${c ? '' : ' sil'}" src="${XICON[c ? r.id : 'reliquia']}" alt=""><b>${c ? r.name : '???'}</b><small>${c ? 'Cueva del volcán' : 'En algún piso'}</small></div>`; }
    h += '</div>';
  }
  if (S.flags.ardVisitado) {
    const got = ARD_RELICS.filter(r => S.ardiente?.relics?.includes(r.id));
    h += `<div class="mtier"><b>Reliquias de la Isla Ardiente</b><small>${got.length}/${ARD_RELICS.length}</small></div><div class="mgrid">`;
    for (const r of ARD_RELICS) { const c = S.ardiente?.relics?.includes(r.id); h += `<div class="mcell${c ? ' got' : ''}"><img class="pix${c ? '' : ' sil'}" src="${XICON[c ? r.id : 'reliquia'] || XICON.reliquia}" alt=""><b>${c ? r.name : '???'}</b><small>${c ? 'Isla Ardiente' : 'Detrás de una roca hueca'}</small></div>`; }
    h += '</div>';
  }
  return h;
}

export function diarioHTML() {
  const tabs: [DiarioTab, string, string][] = [['ruta', 'Ruta', 'brujula'], ['encargos', 'Encargos', 'encargo'], ['logros', 'Logros', 'estrella'], ['equipo', 'Equipo', 'figurita'], ['mar', 'Hallazgos', 'concha']];
  return `<h2>Diario de la isla</h2><div class="seg dtabs" role="tablist">${tabs.map(([k, n, i]) => `<button role="tab" data-tab="${k}" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}"><img src="${XICON[i]}" alt="">${n}</button>`).join('')}</div>`
    + (tab === 'ruta' ? ruta() : tab === 'encargos' ? encargos() : tab === 'logros' ? logros() : tab === 'mar' ? mar() : equipo());
}

/** Handles a tap inside the diary. Returns a message to show, if any. */
export function diarioClick(b: HTMLElement): string | null | undefined {
  if (b.dataset.tab) { tab = b.dataset.tab as DiarioTab; viewCh = viewSt = null; return null; }
  if (b.dataset.ch) { const k = Number(b.dataset.ch); viewCh = k === currentChapter() ? null : k; viewSt = null; return null; }
  if (b.dataset.st) { viewSt = Number(b.dataset.st); return null; }
  if (b.dataset.claim) return claim(Number(b.dataset.claim));
  if (b.dataset.swap) return swap(Number(b.dataset.swap));
  return undefined;
}
