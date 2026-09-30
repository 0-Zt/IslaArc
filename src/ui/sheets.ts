import { on } from '../core/events';
import { gfx, setGfx, resetGfx } from '../render/renderer';
import { S, DATA, afford, pay, type Cost, type ResKey } from '../game/state';
import { buildings, has, smelt, startPlace, buildingDef, isDone, type Building } from '../game/buildings';
import { refreshTools } from '../game/crew';
import { KINDS, expandCost, startSite, enterExpandMode, exitExpandMode, type ExpandKind } from '../game/expansion';
import { enterMarkMode } from '../game/marks';
import { refreshDay } from '../render/daynight';
import { unlocked } from '../game/progress';
import { diarioHTML, diarioClick, diarioSig, setTab, type DiarioTab } from './diario';
import { BRAZIERS, rebuildBrazier } from '../game/ruins';
import { initPuzzles, openPuzzle, closePuzzle, puzzleHTML, puzzleClick, puzzleSig } from './puzzles';
import { runeSVG } from '../assets/ruins';
import { assignIdleBuilder } from '../game/crew';
import { ICONS } from '../assets/buildings';
import { $, img, toast } from './hud';
import type { Tile } from '../world/island';

/* Bottom sheets: build menu, workshop, furnace, settings and the ending. */

type SheetType = 'build' | 'casa' | 'horno' | 'menu' | 'gfx' | 'expandir' | 'plantar' | 'ruina' | 'puzzle' | 'diario' | 'fin';
let type: SheetType | null = null, arg: Building | null = null, cell: [number, number] | null = null, confirmReset = false, sig = '';
let centreTile: () => Tile | null = () => null;
let onReset: () => void = () => {};
export function initSheets(opts: { centreTile: () => Tile | null; onReset: () => void }) { centreTile = opts.centreTile; onReset = opts.onReset; }

export const sheetOpen = () => type !== null;
export function openSheet(t: SheetType, b: Building | null = null, c: [number, number] | null = null) { if (type === 'puzzle' && t !== 'puzzle') closePuzzle(); type = t; arg = b; cell = c; confirmReset = false; render(); $('sheet').hidden = false; $('sheet').classList.toggle('tall', t === 'puzzle' || t === 'diario'); }
export function closeSheet() { if (type === 'puzzle') closePuzzle(); type = null; $('sheet').hidden = true; }
/** A ruined brazier: what it is and what rebuilding it costs. */
let ruinK = -1;
export function openRuin(k: number) { ruinK = k; openSheet('ruina'); }
export function openFlame(k: number) { openPuzzle(k); openSheet('puzzle'); }
export function openDiario(t: DiarioTab = 'ruta') { setTab(t); openSheet('diario'); }

const costHTML = (c: Cost) => `<div class="cost">${Object.entries(c).map(([k, v]) => `<span class="${S.res[k as ResKey] >= (v as number) ? '' : 'no'}">${img(k as ResKey)}${S.res[k as ResKey]}/${v}</span>`).join('')}</div>`;
// the settings sheet never re-renders by itself, so sliders keep working while dragged
const signature = () => type === 'gfx' ? 'gfx' : type === 'puzzle' ? 'puzzle' + puzzleSig() : type === 'diario' ? 'diario' + diarioSig() : JSON.stringify([type, S.res, S.tools, buildings.map(b => b.type + isDone(b)), arg?.queue, S.expanded.length]);

function render() {
  sig = signature();
  let h = '<div class="grab"></div><button class="x" data-act="close" aria-label="Cerrar">×</button>';
  if (type === 'build') {
    h += '<h2>Construir</h2><p>Paga los materiales, ubica la obra con la guía amarilla y una figura la levanta a martillazos.</p>';
    const row = (k: string, d: any) => {
      const count = buildings.filter(b => b.type === k).length, working = buildings.some(b => b.type === k && !isDone(b));
      const unique = !d.deco, built = unique && count > 0, locked = d.requires && !has(d.requires), lowLevel = !unlocked(k);
      const size = d.size[0] * d.size[1] > 1 ? ` · ocupa ${d.size[0]}×${d.size[1]}` : '';
      const extra = d.deco && count ? ` · tienes ${count}` : '';
      return `<div class="row"><div class="thumb">${ICONS[k]}</div><div class="info"><b>${d.name}</b><small>${d.desc}${size}${extra}</small>${built ? '' : costHTML(d.cost)}</div>`
        + (built ? `<span class="done">${working ? 'En obra' : 'Construida'}</span>` : lowLevel ? `<span class="done" style="color:var(--muted)">Nivel de isla ${d.level}</span>` : locked ? `<span class="done" style="color:var(--muted)">Necesita ${buildingDef(d.requires).name.toLowerCase()}</span>`
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
    h += '<h2>Casa · Taller</h2><p>Con lingotes del horno se fabrican herramientas de metal. Cambian lo que rinde cada figura.</p>';
    for (const [k, d] of Object.entries(DATA.TOOLS) as [string, any][]) {
      const ok = S.tools[k];
      h += `<div class="row"><div class="thumb">${ICONS[k]}</div><div class="info"><b>${d.name}</b><small>${d.desc}</small>${ok ? '' : costHTML(d.cost)}</div>`
        + (ok ? '<span class="done">Hecho</span>' : `<button class="btn${afford(d.cost) ? ' main' : ''}" data-tool="${k}" ${afford(d.cost) ? '' : 'disabled'}>Fabricar</button>`) + '</div>';
    }
  } else if (type === 'horno' && arg) {
    const R = DATA.RECIPES.lingote, b = arg;
    h += `<h2>Horno</h2><p>Cada lingote tarda ${R.seconds} segundos. Puedes dejar varios en cola.</p>`
      + `<div class="row"><div class="thumb">${ICONS.lingote}</div><div class="info"><b>${R.name}</b><small>${R.desc}</small>${costHTML(R.cost)}`
      + (b.queue ? `<div class="bar"><i id="hbar" style="width:${Math.round(b.prog * 100)}%"></i></div><small>En el horno: ${b.queue}</small>` : '')
      + `</div><button class="btn${afford(R.cost) ? ' main' : ''}" data-act="smelt" ${afford(R.cost) && b.queue < R.maxQueue ? '' : 'disabled'}>Fundir</button></div>`
      + (S.res.mineral < 2 ? '<p>El mineral sale al picar las rocas grises con vetas azules.</p>' : '');
  } else if (type === 'menu') {
    h += '<h2>Menú</h2><p>La partida se guarda sola en este navegador.</p>'
      + '<div class="row"><div class="info"><b>Ajustes gráficos</b><small>Efecto maqueta, sombras, brillo y calidad.</small></div><button class="btn" data-act="gfx">Abrir</button></div>'
      + `<div class="row"><div class="info"><b>Nueva partida</b><small>Borra el progreso y empieza de cero.</small></div>${confirmReset ? '<button class="btn main" data-act="reset2">Sí, borrar</button>' : '<button class="btn" data-act="reset">Empezar de cero</button>'}</div>`;
  } else if (type === 'gfx') {
    const seg = (key: string, opts: [string, string][], cur: string) => `<div class="seg" role="group">${opts.map(([v, n]) => `<button data-set="${key}" data-val="${v}" class="${cur === v ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    const onoff = (key: 'bloom' | 'vignette' | 'shadows' | 'fps' | 'cap60' | 'daycycle') => seg(key, [['1', 'Sí'], ['0', 'No']], gfx[key] ? '1' : '0');
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
  else if (type === 'horno' && arg) { const bar = document.getElementById('hbar'); if (bar) bar.style.width = Math.round(arg.prog * 100) + '%'; }
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
    if (b.dataset.act === 'smelt' && arg) { smelt(arg); render(); return; }
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
