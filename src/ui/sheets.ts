import { on } from '../core/events';
import { gfx, setGfx, resetGfx } from '../render/renderer';
import { S, DATA, afford, pay, type Cost, type ResKey } from '../game/state';
import { buildings, has, smelt, startPlace, buildingDef, isDone, nextLevel, startUpgrade, levelLock, type Building } from '../game/buildings';
import { caps, REFINED } from '../game/economy';
import { refreshTools } from '../game/crew';
import { KINDS, expandCost, startSite, enterExpandMode, exitExpandMode, type ExpandKind } from '../game/expansion';
import { enterMarkMode } from '../game/marks';
import { refreshDay } from '../render/daynight';
import { setSound } from '../audio/sfx';
import { unlocked } from '../game/progress';
import { recipesAt, RECIPES, INV, invState, startInvention, jobInfo, MAX_QUEUE } from '../game/production';
import { ICON, XICON } from './hud';
import { diarioHTML, diarioClick, diarioSig, setTab, type DiarioTab } from './diario';
import { BRAZIERS, rebuildBrazier } from '../game/ruins';
import { initPuzzles, openPuzzle, closePuzzle, puzzleHTML, puzzleClick, puzzleSig } from './puzzles';
import { runeSVG } from '../assets/ruins';
import { LORE_TEXT } from '../game/beach';
import { STORY, startFishing } from '../game/fishing';
import { startSailing, hasRaft } from '../game/raft';
import { assignIdleBuilder } from '../game/crew';
import { ICONS } from '../assets/buildings';
import { $, img, toast } from './hud';
import type { Tile } from '../world/island';

/* Bottom sheets: build menu, workshop, furnace, settings and the ending. */

type SheetType = 'build' | 'casa' | 'prod' | 'taller' | 'almacen' | 'historia' | 'muelle' | 'menu' | 'gfx' | 'expandir' | 'plantar' | 'ruina' | 'puzzle' | 'diario' | 'mensaje' | 'fin';
let type: SheetType | null = null, arg: Building | null = null, cell: [number, number] | null = null, confirmReset = false, sig = '';
let centreTile: () => Tile | null = () => null;
let onReset: () => void = () => {};
export function initSheets(opts: { centreTile: () => Tile | null; onReset: () => void }) { centreTile = opts.centreTile; onReset = opts.onReset; }

export const sheetOpen = () => type !== null;
export function openSheet(t: SheetType, b: Building | null = null, c: [number, number] | null = null) { if (type === 'puzzle' && t !== 'puzzle') closePuzzle(); type = t; arg = b; cell = c; confirmReset = false; render(); $('sheet').hidden = false; $('sheet').classList.toggle('tall', t === 'puzzle' || t === 'diario'); }
export function closeSheet() { if (type === 'puzzle') closePuzzle(); type = null; $('sheet').hidden = true; }
/** A ruined brazier: what it is and what rebuilding it costs. */
let ruinK = -1;
const BULB = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="17" r="10" fill="#ffd24a"/><rect x="15" y="26" width="10" height="7" fill="#b9c2cc"/><rect x="17" y="13" width="6" height="2" fill="#fff6c0"/></svg>';
const LOCK = '<svg viewBox="0 0 12 12" width="18" height="18" aria-hidden="true"><rect x="2" y="5" width="8" height="6" rx="1" fill="#8a8478"/><path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="#8a8478" stroke-width="1.5" fill="none"/></svg>';
export function openRuin(k: number) { ruinK = k; openSheet('ruina'); }
export function openFlame(k: number) { openPuzzle(k); openSheet('puzzle'); }
let msgK = 0;
export function openMessage(k: number) { msgK = k; openSheet('mensaje'); }
let storyK = '';
/** A page of a short story (the pier, Marea's vase, the key, the notebook). */
export function openStory(k: string) { storyK = k; openSheet('historia'); }
export function openDiario(t: DiarioTab = 'ruta') { setTab(t); openSheet('diario'); }

const costHTML = (c: Cost) => `<div class="cost">${Object.entries(c).map(([k, v]) => `<span class="${S.res[k as ResKey] >= (v as number) ? '' : 'no'}">${img(k as ResKey)}${S.res[k as ResKey]}/${v}</span>`).join('')}</div>`;
// the settings sheet never re-renders by itself, so sliders keep working while dragged
const signature = () => type === 'gfx' ? 'gfx' : type === 'historia' ? 'historia' + storyK : type === 'puzzle' ? 'puzzle' + puzzleSig() : type === 'diario' ? 'diario' + diarioSig() : JSON.stringify([type, S.res, S.tools, buildings.map(b => b.type + isDone(b)), arg?.jobs?.length, arg?.jobs?.[0], arg?.lvl, arg?.up, arg && Math.floor(arg.work), S.inv, S.expanded.length]);

/** The level block shown in a building's sheet: what the next level does, its cost, or the upgrade in progress. */
function upgradeHTML(b: Building) {
  const d = buildingDef(b.type); if (!d.levels) return '';
  const L = nextLevel(b);
  let h = `<h3>Nivel ${b.up ? `${b.lvl} → ${b.up}` : b.lvl}</h3>`;
  if (b.up) return h + `<div class="row"><div class="thumb lvl">${b.up}</div><div class="info"><b>Mejora en obra</b><small>Una figura la levanta a martillazos. Mientras tanto el edificio no trabaja.</small><div class="dbar sm"><i style="width:${Math.round(b.work / b.need * 100)}%"></i></div></div></div>`;
  if (!L) return h + '<p style="color:var(--muted)">Ya está en su nivel más alto por ahora.</p>';
  const lock = levelLock(L), title = L.title || `Mejorar a nivel ${b.lvl + 1}`;
  if (lock) return h + `<div class="row dim"><div class="thumb lvl">${b.lvl + 1}</div><div class="info"><b>${L.title || `Nivel ${b.lvl + 1}`}</b><small>${L.text}. ${lock}.</small></div><span class="done">${LOCK}</span></div>`;
  const ok = afford(L.cost) && isDone(b);
  return h + `<div class="row"><div class="thumb lvl">${b.lvl + 1}</div><div class="info"><b>${title}</b><small>${L.text}</small>${costHTML(L.cost)}</div><button class="btn${ok ? ' main' : ''}" data-upgrade="1" ${ok ? '' : 'disabled'}>${L.title ? 'Armar' : 'Mejorar'}</button></div>`;
}

function render() {
  sig = signature();
  const seg = (key: string, opts: [string, string][], cur: string) => `<div class="seg" role="group">${opts.map(([v, n]) => `<button data-set="${key}" data-val="${v}" class="${cur === v ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  const onoff = (key: 'bloom' | 'vignette' | 'shadows' | 'fps' | 'cap60' | 'daycycle' | 'sound') => seg(key, [['1', 'Sí'], ['0', 'No']], gfx[key] ? '1' : '0');
  let h = '<div class="grab"></div><button class="x" data-act="close" aria-label="Cerrar">×</button>';
  if (type === 'build') {
    h += '<h2>Construir</h2><p>Paga los materiales, ubica la obra con la guía amarilla y una figura la levanta a martillazos.</p>';
    const row = (k: string, d: any) => {
      const count = buildings.filter(b => b.type === k).length, working = buildings.some(b => b.type === k && !isDone(b));
      const unique = !d.deco, built = unique && count > 0, locked = d.requires && !has(d.requires), lowLevel = !unlocked(k);
      const size = d.size[0] * d.size[1] > 1 ? ` · ocupa ${d.size[0]}×${d.size[1]}` : '';
      const extra = d.deco && count ? ` · tienes ${count}` : built && d.levels ? ' · tócalo en la isla para mejorarlo' : '';
      return `<div class="row"><div class="thumb">${ICONS[k]}</div><div class="info"><b>${d.name}</b><small>${d.desc}${size}${extra}</small>${built ? '' : costHTML(d.cost)}</div>`
        + (built ? `<span class="done">${working ? 'En obra' : d.levels ? `Nivel ${Math.max(...buildings.filter(b => b.type === k).map(b => b.lvl))}` : 'Construida'}</span>` : lowLevel ? `<span class="done" style="color:var(--muted)">Nivel de isla ${d.level}</span>` : locked ? `<span class="done" style="color:var(--muted)">Necesita ${buildingDef(d.requires).name.toLowerCase()}</span>`
          : `<button class="btn${afford(d.cost) ? ' main' : ''}" data-place="${k}" ${afford(d.cost) ? '' : 'disabled'}>Ubicar</button>`) + '</div>';
    };
    const all = Object.entries(DATA.BUILDINGS) as [string, any][];
    for (const [k, d] of all) if (!d.deco && !d.hidden) h += row(k, d);
    h += '<h3>Decoración</h3>';
    for (const [k, d] of all) if (d.deco) h += row(k, d);
    h += '<h3>Isla</h3>';
    const cheapest = Math.min(...(Object.keys(KINDS) as ExpandKind[]).map(k => expandCost(k).tierra || 0));
    h += `<div class="row"><div class="thumb">${ICONS.expandir}</div><div class="info"><b>Expandir la isla</b><small>Marca una o varias casillas de mar junto a la costa y una figura las rellena. Desde ${cheapest} de tierra cada una; la tierra se saca cavando en suelo café.</small></div><button class="btn main" data-act="expand">Marcar</button></div>`;
    h += '<h3>Jardín</h3>';
    h += `<div class="row"><div class="thumb">${ICONS.plantar}</div><div class="info"><b>Plantar semillas</b><small>${S.res.semilla > 0 ? `Tienes ${S.res.semilla}. Elige la especie y dónde plantar; crece sola.` : 'Las semillas salen al talar árboles grandes.'}</small></div><button class="btn${S.res.semilla > 0 ? ' main' : ''}" data-act="plant" ${S.res.semilla > 0 ? '' : 'disabled'}>Plantar</button></div>`;
    h += `<div class="row"><div class="thumb">${ICONS.sendero}</div><div class="info"><b>Senderos</b><small>Una figura cava el pasto con la pala. Ahí no crecen árboles y se camina más rápido.</small></div><button class="btn main" data-act="path">Trazar</button></div>`;
  } else if (type === 'casa') {
    h += '<h2>Casa · Herramientas</h2><p>Con lingotes del horno se fabrican herramientas de metal. Cambian lo que rinde cada figura. Los inventos más grandes se hacen en el taller.</p>';
    for (const [k, d] of Object.entries(DATA.TOOLS) as [string, any][]) {
      const ok = S.tools[k];
      h += `<div class="row"><div class="thumb">${ICONS[k]}</div><div class="info"><b>${d.name}</b><small>${d.desc}</small>${ok ? '' : costHTML(d.cost)}</div>`
        + (ok ? '<span class="done">Hecho</span>' : `<button class="btn${afford(d.cost) ? ' main' : ''}" data-tool="${k}" ${afford(d.cost) ? '' : 'disabled'}>Fabricar</button>`) + '</div>';
    }
    if (arg) h += upgradeHTML(arg);
  } else if (type === 'prod' && arg) {
    const b = arg, d = buildingDef(b.type);
    h += `<h2>${d.name}${b.lvl > 1 ? ` · nivel ${b.lvl}` : ''}</h2><p>${b.type === 'horno' && b.lvl >= 2 ? 'Con dos fuegos hace dos cosas a la vez' : 'Cada cosa se hace una tras otra'}; puedes dejar hasta ${MAX_QUEUE} en cola.${b.type === 'horno' ? (S.crew.includes('brasa') ? ' Toca a Brasa y luego el horno: avivará el fuego y todo sale el doble de rápido.' : '') : ''}</p>`;
    const fires = b.type === 'horno' && b.lvl >= 2 ? 2 : 1;
    if (!isDone(b)) h += '<p><b>En obra:</b> mientras se mejora no trabaja; la cola sigue después.</p>';
    if (b.jobs.length) h += `<div class="qline">${b.jobs.map((j, k) => { const o = jobInfo(j).out; return `<span class="q${k < fires ? ' now' : ''}">${o ? `<img src="${(ICON as any)[o]}" alt="">` : ''}</span>`; }).join('')}<div class="bar"><i id="hbar" style="width:${Math.round(b.prog * 100)}%"></i></div>${fires > 1 && b.jobs.length > 1 ? `<div class="bar"><i style="width:${Math.round(b.prog2 * 100)}%"></i></div>` : ''}</div>`;
    for (const [id, r] of recipesAt(b.type, b.lvl)) {
      const ok = afford(r.cost) && b.jobs.length < MAX_QUEUE;
      h += `<div class="row"><div class="thumb"><img class="pix" src="${(ICON as any)[r.out]}" alt=""></div><div class="info"><b>${r.name}</b><small>${r.desc} · ${r.seconds} s</small>${costHTML(r.cost)}</div>`
        + `<button class="btn${ok ? ' main' : ''}" data-recipe="${id}" ${ok ? '' : 'disabled'}>Hacer</button></div>`;
    }
    if (b.type === 'horno' && S.res.mineral < 2) h += '<p>El mineral sale al picar las rocas grises con vetas azules.</p>';
    h += upgradeHTML(b);
  } else if (type === 'almacen' && arg) {
    const [raw, ref] = caps();
    h += `<h2>Almacén</h2><p>Caben <b>${raw}</b> de cada material de la isla y <b>${ref}</b> de cada refinado. Con un material lleno, la figura que lo junta se detiene hasta que haya espacio.</p><div class="stock">`;
    for (const k of Object.keys(DATA.RESOURCES) as ResKey[]) {
      const d = (DATA.RESOURCES as any)[k]; if (d.nohud || (S.got[k] <= 0 && S.res[k] <= 0)) continue;
      const cap = REFINED.includes(k) ? ref : raw, v = S.res[k], pct = Math.min(100, Math.round(v / cap * 100));
      h += `<div class="stk${v >= cap ? ' full' : ''}"><img class="pix" src="${(ICON as any)[k]}" alt=""><div><div class="dbar sm"><i style="width:${pct}%"></i></div><small>${v}/${cap}</small></div></div>`;
    }
    h += '</div>' + upgradeHTML(arg);
  } else if (type === 'muelle' && arg) {
    const raft = hasRaft();
    h += `<h2>Muelle</h2><p>Desde la punta se pesca lo que el mar devuelve.${raft ? ' La balsa de Marea espera amarrada al final.' : ''}</p>`
      + `<div class="row"><div class="thumb">${ICONS.anzuelo}</div><div class="info"><b>Pescar desde el muelle</b><small>Orilla y aguas medias. Lanza cerca de una sombra y toca cuando el corcho se hunda.</small></div><button class="btn main" data-act="fish">Pescar</button></div>`
      + (raft ? `<div class="row"><div class="thumb"><img class="pix" src="${(XICON as any).balsa}" alt=""></div><div class="info"><b>Zarpar en la balsa</b><small>Toca el mar para navegar. En las manchas oscuras está lo más raro.</small></div><button class="btn main" data-act="sail">Zarpar</button></div>` : '')
      + `<div class="row"><div class="info"><b>Colección del mar</b><small>Lo que ya sacaste y lo que falta.</small></div><button class="btn" data-act="coleccion">Ver</button></div>`
      + upgradeHTML(arg);
  } else if (type === 'taller' && arg) {
    const b = arg;
    h += '<h2>Taller de inventos</h2><p>Cada invento cambia algo para siempre. El taller trabaja en uno a la vez.</p>';
    const cur = b.jobs.find(j => j.startsWith('inv:'));
    if (cur) h += `<div class="qline"><span class="q now">${BULB}</span><b style="flex:1">${INV[cur.slice(4)].name}</b><div class="bar"><i id="hbar" style="width:${Math.round(b.prog * 100)}%"></i></div></div>`;
    const tiers = [...new Set(Object.values(INV).map(d => d.tier))].sort();
    for (const t of tiers) {
      h += `<h3>Nivel ${t}</h3>`;
      for (const [id, d] of Object.entries(INV)) {
        if (d.tier !== t) continue;
        const st = invState(id, b.jobs);
        const right = st === 'done' ? '<span class="done">Hecho</span>' : st === 'working' ? '<span class="done">Inventando…</span>'
          : st === 'locked' ? `<span class="done" style="color:var(--muted)">${LOCK}</span>`
          : st === 'needs' ? `<span class="done" style="color:var(--muted)">Necesita ${d.needs!.filter(n => !S.inv[n]).map(n => INV[n].name.toLowerCase()).join(', ')}</span>`
          : `<button class="btn${afford(d.cost) && !cur ? ' main' : ''}" data-invent="${id}" ${afford(d.cost) && !cur ? '' : 'disabled'}>Inventar</button>`;
        h += `<div class="row${st === 'locked' ? ' dim' : ''}"><div class="thumb">${BULB}</div><div class="info"><b>${d.name}</b><small>${st === 'locked' ? d.locked : d.desc}${d.seconds && st !== 'done' && st !== 'locked' ? ` · ${d.seconds} s` : ''}</small>${st === 'ready' || st === 'needs' ? costHTML(d.cost) : ''}</div>${right}</div>`;
      }
    }
  } else if (type === 'menu') {
    h += '<h2>Menú</h2><p>La partida se guarda sola en este navegador.</p>'
      + `<div class="row col"><div class="info"><b>Sonido</b><small>Efectos al trabajar, olas, pájaros de día y grillos de noche.</small></div>${onoff('sound')}</div>`
      + '<div class="row"><div class="info"><b>Ajustes gráficos</b><small>Efecto maqueta, sombras, brillo y calidad.</small></div><button class="btn" data-act="gfx">Abrir</button></div>'
      + `<div class="row"><div class="info"><b>Nueva partida</b><small>Borra el progreso y empieza de cero.</small></div>${confirmReset ? '<button class="btn main" data-act="reset2">Sí, borrar</button>' : '<button class="btn" data-act="reset">Empezar de cero</button>'}</div>`;
  } else if (type === 'gfx') {
    h += '<h2>Ajustes gráficos</h2><p>Se guardan en este dispositivo.</p>'
      + `<div class="row col"><div class="info"><b>Efecto maqueta</b><small>Desenfoque arriba y abajo que da aspecto de miniatura. En 0 queda todo nítido.</small></div>
         <div class="slide"><input type="range" id="gTilt" min="0" max="100" step="5" value="${Math.round(gfx.tilt * 100)}" aria-label="Intensidad del efecto maqueta"><output id="gTiltOut">${Math.round(gfx.tilt * 100)}</output></div></div>`
      + `<div class="row col"><div class="info"><b>Enfoque</b><small>Dónde queda la franja nítida del efecto maqueta.</small></div>${seg('tiltFollow', [['1', 'Sigue a la figura'], ['0', 'Centro de pantalla']], gfx.tiltFollow ? '1' : '0')}</div>`
      + `<div class="row col"><div class="info"><b>Sombra de contacto extra</b><small>Los bloques ya traen su sombra de contacto incluida. Esto suma una capa calculada en cada cuadro: se ve un poco más suave, pero es el efecto más pesado.</small></div>${seg('ao', [['off', 'No'], ['suave', 'Suave'], ['marcada', 'Marcada']], gfx.ao)}</div>`
      + `<div class="row col"><div class="info"><b>Sombras del sol</b></div>${onoff('shadows')}</div>`
      + `<div class="row col"><div class="info"><b>Resplandor</b><small>Brillo en luces, brasas y el horno.</small></div>${onoff('bloom')}</div>`
      + `<div class="row col"><div class="info"><b>Viñeta</b><small>Bordes de la pantalla un poco más oscuros.</small></div>${onoff('vignette')}</div>`
      + `<div class="row col"><div class="info"><b>Calidad</b><small>Alta: resolución completa y sombras más finas. Baja: la isla se dibuja a 1,5× (la interfaz sigue nítida), bastante más liviano.</small></div>${seg('quality', [['alta', 'Alta'], ['baja', 'Baja']], gfx.quality)}</div>`
      + `<div class="row col"><div class="info"><b>Ciclo de día y noche</b><small>Un día completo dura unos ${DATA.BALANCE.dayMinutes} minutos. Algunas cosas solo pasan de noche.</small></div>${onoff('daycycle')}</div>`
      + `<div class="row col"><div class="info"><b>Limitar a 60 cuadros por segundo</b><small>En pantallas de 120 Hz evita que el celular se caliente y se ponga lento.</small></div>${onoff('cap60')}</div>`
      + `<div class="row col"><div class="info"><b>Mostrar cuadros por segundo</b><small>Útil para probar qué tan fluido va.</small></div>${onoff('fps')}</div>`
      + '<div class="row"><button class="btn" data-act="gfxReset" style="width:100%">Volver a los valores recomendados</button></div>';
  } else if (type === 'expandir' && cell) {
    h += '<h2>Nueva parcela</h2><p>Paga los materiales y después envía una figura a rellenarla con la pala.</p>';
    for (const k of Object.keys(KINDS) as ExpandKind[]) {
      const d = KINDS[k], c = expandCost(k);
      h += `<div class="row"><div class="info"><b>${d.name}</b><small>${d.desc}</small>${costHTML(c)}</div><button class="btn${afford(c) ? ' main' : ''}" data-expand="${k}" ${afford(c) ? '' : 'disabled'}>Marcar</button></div>`;
    }
  } else if (type === 'plantar') {
    h += `<h2>Plantar semillas</h2><p>Tienes ${S.res.semilla} ${S.res.semilla === 1 ? 'semilla' : 'semillas'}. Cada una se vuelve un retoño y luego un árbol. Dentro del bosque (borde verde) los árboles también se esparcen solos; fuera, solo crece lo que plantas.</p>`;
    const SP: [string, string, string][] = [['roble', 'Roble', 'Copa ancha y redonda.'], ['pino', 'Pino', 'Alto y oscuro, bueno para bordes.'], ['abedul', 'Abedul', 'Tronco blanco y hojas claras.']];
    for (const [k, n, d] of SP) h += `<div class="row"><div class="thumb">${ICONS[k]}</div><div class="info"><b>${n}</b><small>${d}</small></div><button class="btn main" data-species="${k}" ${S.res.semilla > 0 ? '' : 'disabled'}>Elegir</button></div>`;
  } else if (type === 'ruina' && ruinK >= 0) {
    const d = BRAZIERS[ruinK];
    h += `<h2>Brasero en ruinas</h2><p>${d.name}. La piedra está rota y la runa, casi borrada.</p>`
      + `<div class="row"><div class="thumb">${runeSVG(d.sym, '#ffb45a', 34)}</div><div class="info"><b>Reconstruir</b><small>Una figura lo levanta con el martillo. Después habrá que encender su llama.</small>${costHTML(d.cost)}</div><button class="btn${afford(d.cost) ? ' main' : ''}" data-rebuild="${ruinK}" ${afford(d.cost) ? '' : 'disabled'}>Reconstruir</button></div>`;
  } else if (type === 'puzzle') {
    h += puzzleHTML();
  } else if (type === 'mensaje') {
    h += `<h2>Mensaje en una botella</h2><p class="lore">${LORE_TEXT[msgK]}</p><p style="color:var(--muted)">Mensaje ${S.lore.length} de ${LORE_TEXT.length}. Los guardas en el Diario, pestaña Equipo.</p><button class="btn main" data-act="close" style="width:100%">Guardar</button>`;
  } else if (type === 'historia' && STORY[storyK]) {
    const st = STORY[storyK];
    h += `<h2>${st.title}</h2><div class="lore story">${st.text.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}</div>`
      + (storyK === 'cofre' ? '<p style="color:var(--muted)">Con este plano se arma la balsa en el capítulo 6, Mar adentro (próxima versión).</p>' : '')
      + '<button class="btn main" data-act="close" style="width:100%">Seguir</button>';
  } else if (type === 'diario') {
    h += diarioHTML();
  } else if (type === 'fin') {
    const m = Math.max(1, Math.round(S.time / 60));
    h += `<h2>¡La isla despierta!</h2><p>Fundiste metal, desenterraste a Musgo, llegaste a las ruinas y despertaste a Brasa en ${m === 1 ? 'un minuto' : `unos ${m} minutos`}.</p>`
      + '<p>Sigue expandiendo y ordenando tu isla: planta semillas, traza senderos y deja espacio para lo que viene: decoración, la cueva del volcán y el secreto de Brasa.</p>'
      + '<button class="btn main" data-act="close" style="width:100%">Seguir jugando</button>';
  }
  $('sheet').innerHTML = h;
}

/** Re-render only when something shown changed, so buttons are not swapped under a finger. */
export function refreshSheet() {
  if (!type) return;
  if (signature() !== sig) render();
  else if ((type === 'prod' || type === 'taller') && arg) { const bar = document.getElementById('hbar'); if (bar) bar.style.width = Math.round(arg.prog * 100) + '%'; }
}

export function initSheetEvents() {
  initPuzzles({ rerender: () => { if (type === 'puzzle') render(); }, close: () => { if (type === 'puzzle') closeSheet(); } });
  $('sheet').addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (type === 'puzzle' && !(b && b.dataset.act === 'close')) { puzzleClick(e.target as HTMLElement); return; }
    if (!b || b.disabled) return;
    if (b.dataset.act === 'close') return closeSheet();
    if (type === 'diario') { const r = diarioClick(b); if (r !== undefined) { if (r) toast(r); render(); return; } }
    if (b.dataset.rebuild) {
      const r = rebuildBrazier(Number(b.dataset.rebuild));
      if (typeof r === 'string') { toast(r); return; }
      closeSheet();
      const c = assignIdleBuilder();
      toast(c ? `${c.def.name} va a reconstruir el brasero` : 'Obra marcada. Toca una figura y luego el brasero.');
      return;
    }
    if (b.dataset.place) { const t = centreTile(); if (t) { closeSheet(); startPlace(b.dataset.place, t); } return; }
    if (b.dataset.tool) {
      const d = (DATA.TOOLS as any)[b.dataset.tool];
      if (!afford(d.cost)) return;
      pay(d.cost); S.tools[b.dataset.tool] = true; refreshTools();
      toast(`Fabricaste: ${d.name}`); render(); return;
    }
    if (b.dataset.upgrade && arg) { const r = startUpgrade(arg); if (r) toast(r); else assignIdleBuilder(); render(); return; }
    if (b.dataset.recipe && arg) { if (!smelt(arg, b.dataset.recipe)) toast('No se puede ahora'); render(); return; }
    if (b.dataset.invent && arg) { const r = startInvention(b.dataset.invent, arg.jobs); if (r) toast(r); render(); return; }
    if (b.dataset.act === 'fish' && arg) { const m = arg; closeSheet(); const r = startFishing(m); if (r) toast(r); return; }
    if (b.dataset.act === 'sail' && arg) { const m = arg; closeSheet(); const r = startSailing(m); if (r) toast(r); return; }
    if (b.dataset.act === 'coleccion') { openDiario('mar'); return; }
    if (b.dataset.act === 'gfx') { openSheet('gfx'); return; }
    if (b.dataset.act === 'expand') { closeSheet(); enterExpandMode(); return; }
    if (b.dataset.act === 'plant') { openSheet('plantar'); return; }
    if (b.dataset.act === 'path') { closeSheet(); enterMarkMode('path'); return; }
    if (b.dataset.species) { closeSheet(); enterMarkMode('plant', b.dataset.species as any); return; }
    if (b.dataset.expand && cell) {
      const r = startSite(cell[0], cell[1], b.dataset.expand as ExpandKind);
      if (typeof r === 'string') { toast(r); return; }
      closeSheet(); exitExpandMode(); toast('Parcela marcada. Toca una figura y luego la parcela para rellenarla'); return;
    }
    if (b.dataset.act === 'gfxReset') { resetGfx(); render(); return; }
    if (b.dataset.set) {
      const k = b.dataset.set, v = b.dataset.val!;
      setGfx(k === 'ao' || k === 'quality' ? { [k]: v } as any : { [k]: v === '1' });
      if (k === 'daycycle') refreshDay();
      if (k === 'sound') setSound(gfx.sound);
      render(); return;
    }
    if (b.dataset.act === 'reset') { confirmReset = true; render(); return; }
    if (b.dataset.act === 'reset2') { closeSheet(); onReset(); }
  });
  $('sheet').addEventListener('input', e => {
    const el = e.target as HTMLInputElement;
    if (el.id !== 'gTilt') return;
    $('gTiltOut').textContent = el.value;
    setGfx({ tilt: Number(el.value) / 100 });
  });
  on('finished', () => setTimeout(() => openSheet('fin'), 900));
}
