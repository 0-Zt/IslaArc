import { emit } from '../core/events';
import { S, afford, pay, gain, type Req, type ResKey } from './state';
import { has } from './buildings';
import { stat, bump, addStars, boardSlots, islandLevel } from './progress';
import { gfx } from '../render/renderer';

/* The notice board: a few small requests at a time. Deliveries use materials; tasks count what
   you do after accepting them. Each one pays stars and a small bonus, then a new one takes its place. */

const rint = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pickOne = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const RES_NAME: Record<string, string> = { madera: 'madera', piedra: 'piedra', arena: 'arena', tierra: 'tierra', lingote: 'lingotes', semilla: 'semillas', mineral: 'mineral' };

type Maker = () => Req | null;
const scale = () => 1 + 0.2 * (islandLevel() - 1);
function task(kind: string, statKey: string, n: number, text: string, stars: number): Req {
  return { kind, stat: statKey, need: n, base: stat(statKey), text, reward: { stars, res: bonus() } };
}
function bonus(): Partial<Record<string, number>> {
  const opts: [string, number][] = [['semilla', 1], ['mineral', 2], ['madera', 5], ['piedra', 4]];
  if (has('horno')) opts.push(['lingote', 1]);
  const [k, n] = pickOne(opts); return { [k]: n };
}
const MAKERS: Record<string, Maker> = {
  entrega: () => {
    const pool: [ResKey, number, number][] = [['madera', 8, 14]];
    if (S.got.piedra > 0) pool.push(['piedra', 6, 10]);
    if (S.got.arena > 0) pool.push(['arena', 6, 10]);
    if (has('casa')) pool.push(['tierra', 4, 7]);
    if (has('horno')) pool.push(['lingote', 1, 3]);
    const two = pool.length > 1 && Math.random() < 0.5;
    const a = pickOne(pool), b = two ? pickOne(pool.filter(p => p !== a)) : null;
    const cost: Record<string, number> = { [a[0]]: Math.round(rint(a[1], a[2]) * scale()) };
    if (b) cost[b[0]] = Math.round(rint(b[1], b[2]) * scale());
    const text = 'Entrega ' + Object.entries(cost).map(([k, v]) => `${v} de ${RES_NAME[k]}`).join(' y ');
    return { kind: 'entrega', need: 1, base: 0, cost, text, reward: { stars: two ? 2 : 1, res: bonus() } };
  },
  talar: () => { const n = Math.round(rint(3, 7) * scale()); return task('talar', 'talados', n, `Tala ${n} árboles`, 1); },
  piedra: () => S.got.piedra > 0 ? (() => { const n = Math.round(rint(6, 12) * scale()); return task('piedra', 'piedra', n, `Pica ${n} de piedra`, 1); })() : null,
  arena: () => S.got.arena > 0 ? (() => { const n = Math.round(rint(6, 10) * scale()); return task('arena', 'arena', n, `Junta ${n} de arena en la playa`, 1); })() : null,
  lingotes: () => has('horno') ? (() => { const n = rint(2, 4); return task('lingotes', 'lingotes', n, `Funde ${n} lingotes`, 2); })() : null,
  plantar: () => S.got.semilla > 0 ? (() => { const n = rint(2, 4); return task('plantar', 'plantados', n, `Planta ${n} semillas`, 1); })() : null,
  adornos: () => has('casa') && islandLevel() >= 2 ? (() => { const n = rint(1, 3); return task('adornos', 'adornos', n, `Construye ${n} ${n === 1 ? 'adorno' : 'adornos'}`, 2); })() : null,
  parcelas: () => has('casa') ? (() => { const n = rint(1, 3); return task('parcelas', 'parcelas', n, `Gana ${n} ${n === 1 ? 'parcela' : 'parcelas'} al mar`, 2); })() : null,
  senderos: () => { const n = rint(2, 5); return task('senderos', 'senderos', n, `Traza ${n} tramos de sendero`, 1); },
  noche: () => gfx.daycycle ? task('noche', 'noches', 1, 'Pasa una noche en la isla', 1) : null,
};

function make(exclude: string[]): Req {
  const kinds = Object.keys(MAKERS).filter(k => !exclude.includes(k) || k === 'entrega');
  for (let t = 0; t < 20; t++) { const r = MAKERS[pickOne(kinds)](); if (r) return r; }
  return MAKERS.entrega()!;
}
export const boardOpen = () => has('tablon');

/** Keeps the board full (called often; cheap when nothing is missing). */
export function fillBoard() {
  if (!boardOpen()) return;
  const n = boardSlots();
  let added = false;
  while (S.board.list.length < n) { S.board.list.push(make(S.board.list.map(r => r.kind))); S.board.next.push(0); added = true; }
  if (added) emit('boardChanged');
}
export function progressOf(r: Req) { return r.kind === 'entrega' ? (afford(r.cost as any) ? 1 : 0) : Math.min(r.need, stat(r.stat!) - r.base); }
export const ready = (r: Req) => r.kind === 'entrega' ? afford(r.cost as any) : progressOf(r) >= r.need;
export const readyCount = () => S.board.list.filter(ready).length;

/** Delivers or claims a request. */
export function claim(i: number): string | null {
  const r = S.board.list[i]; if (!r) return null;
  if (!ready(r)) return r.kind === 'entrega' ? 'Te faltan materiales' : 'Todavía no está cumplido';
  if (r.kind === 'entrega') pay(r.cost as any);
  for (const [k, v] of Object.entries(r.reward.res || {})) gain(k as ResKey, v as number);
  bump('encargos');
  S.board.list[i] = make(S.board.list.map(q => q.kind));
  S.board.next[i] = 0;
  addStars(r.reward.stars, 'Encargo cumplido');
  emit('boardChanged'); emit('changed');
  return null;
}
/** Swaps a request for another; each slot can do it once every 90 seconds of play. */
export function swap(i: number): string | null {
  if (S.time < (S.board.next[i] || 0)) return `Podrás cambiarlo en ${Math.ceil(S.board.next[i] - S.time)} s`;
  S.board.list[i] = make(S.board.list.map(q => q.kind));
  S.board.next[i] = S.time + 90;
  emit('boardChanged'); emit('changed');
  return null;
}
