import { on } from '../core/events';
import { quality, setQuality } from '../render/renderer';
import { S, DATA, afford, pay, type Cost, type ResKey } from '../game/state';
import { buildings, has, smelt, startPlace, buildingDef, type Building } from '../game/buildings';
import { refreshTools } from '../game/crew';
import { ICONS } from '../assets/buildings';
import { $, img, toast } from './hud';
import type { Tile } from '../world/island';

/* Bottom sheets: build menu, workshop, furnace, settings and the ending. */

type SheetType = 'build' | 'casa' | 'horno' | 'menu' | 'fin';
let type: SheetType | null = null, arg: Building | null = null, confirmReset = false, sig = '';
let centreTile: () => Tile | null = () => null;
let onReset: () => void = () => {};
export function initSheets(opts: { centreTile: () => Tile | null; onReset: () => void }) { centreTile = opts.centreTile; onReset = opts.onReset; }

export const sheetOpen = () => type !== null;
export function openSheet(t: SheetType, b: Building | null = null) { type = t; arg = b; confirmReset = false; render(); $('sheet').hidden = false; }
export function closeSheet() { type = null; $('sheet').hidden = true; }

const costHTML = (c: Cost) => `<div class="cost">${Object.entries(c).map(([k, v]) => `<span class="${S.res[k as ResKey] >= (v as number) ? '' : 'no'}">${img(k as ResKey)}${S.res[k as ResKey]}/${v}</span>`).join('')}</div>`;
const signature = () => JSON.stringify([type, S.res, S.tools, buildings.map(b => b.type), arg?.queue]);

function render() {
  sig = signature();
  let h = '<div class="grab"></div><button class="x" data-act="close" aria-label="Cerrar">×</button>';
  if (type === 'build') {
    h += '<h2>Construir</h2><p>Elige un edificio y ubícalo en la isla. La guía amarilla muestra dónde cabe.</p>';
    for (const [k, d] of Object.entries(DATA.BUILDINGS) as [string, any][]) {
      const built = has(k), locked = d.requires && !has(d.requires);
      const size = d.size[0] * d.size[1] > 1 ? ` · ocupa ${d.size[0]}×${d.size[1]}` : '';
      h += `<div class="row"><div class="thumb">${ICONS[k]}</div><div class="info"><b>${d.name}</b><small>${d.desc}${size}</small>${built ? '' : costHTML(d.cost)}</div>`
        + (built ? '<span class="done">Construida</span>' : locked ? `<span class="done" style="color:var(--muted)">Necesita ${buildingDef(d.requires).name.toLowerCase()}</span>`
          : `<button class="btn${afford(d.cost) ? ' main' : ''}" data-place="${k}" ${afford(d.cost) ? '' : 'disabled'}>Ubicar</button>`) + '</div>';
    }
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
      + `<div class="row"><div class="info"><b>Calidad gráfica</b><small>Alta suma sombras más finas y más suavizado de bordes. Baja rinde mejor en celulares antiguos.</small></div><button class="btn" data-act="quality">${quality === 'alta' ? 'Alta' : 'Baja'}</button></div>`
      + `<div class="row"><div class="info"><b>Nueva partida</b><small>Borra el progreso y empieza de cero.</small></div>${confirmReset ? '<button class="btn main" data-act="reset2">Sí, borrar</button>' : '<button class="btn" data-act="reset">Empezar de cero</button>'}</div>`;
  } else if (type === 'fin') {
    const m = Math.max(1, Math.round(S.time / 60));
    h += `<h2>¡Musgo está libre!</h2><p>Talaste, construiste, fundiste metal, abriste el claro y desenterraste a Musgo en ${m === 1 ? 'un minuto' : `unos ${m} minutos`}.</p>`
      + '<p>Ahora tienes dos figuras. Los árboles que tala Musgo vuelven a crecer mucho más rápido. Lo que viene: expansión de tierra, la cueva del volcán y el secreto de Brasa.</p>'
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
  $('sheet').addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    if (b.dataset.act === 'close') return closeSheet();
    if (b.dataset.place) { const t = centreTile(); if (t) { closeSheet(); startPlace(b.dataset.place, t); } return; }
    if (b.dataset.tool) {
      const d = (DATA.TOOLS as any)[b.dataset.tool];
      if (!afford(d.cost)) return;
      pay(d.cost); S.tools[b.dataset.tool] = true; refreshTools();
      toast(`Fabricaste: ${d.name}`); render(); return;
    }
    if (b.dataset.act === 'smelt' && arg) { smelt(arg); render(); return; }
    if (b.dataset.act === 'quality') { setQuality(quality === 'alta' ? 'baja' : 'alta'); render(); return; }
    if (b.dataset.act === 'reset') { confirmReset = true; render(); return; }
    if (b.dataset.act === 'reset2') { closeSheet(); onReset(); }
  });
  on('finished', () => setTimeout(() => openSheet('fin'), 900));
}
