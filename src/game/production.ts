import { emit } from '../core/events';
import { S, DATA, afford, pay, type Cost } from './state';
import INVENTIONS from '../data/inventions.json';

/* Production at buildings: the furnace (ingots, bricks, glass), the sawmill (planks) and the
   workshop (inventions). Each building works through its own queue, one item at a time. */

export interface Recipe { name: string; desc: string; cost: Cost; out: string; seconds: number; at: string; n?: number; lvl?: number; maxLvl?: number }
export interface Invention { name: string; desc: string; cost: Cost; seconds?: number; tier: number; needs?: string[]; locked?: string; needsFlag?: string; flagText?: string }
export const RECIPES = DATA.RECIPES as Record<string, Recipe>;
export const INV = INVENTIONS as Record<string, Invention>;
export const MAX_QUEUE = 6;

/** Recipes a building offers at its level (some appear or are replaced after an upgrade). */
export const recipesAt = (type: string, lvl = 1) => Object.entries(RECIPES).filter(([, r]) => r.at === type && lvl >= (r.lvl || 1) && lvl <= (r.maxLvl || 99));
export const makesThings = (type: string) => type === 'horno' || type === 'aserradero' || type === 'taller';

/** How long one job takes at this building, after inventions and helpers. */
export function jobSeconds(type: string, job: string, stoked = false) {
  if (job.startsWith('inv:')) return INV[job.slice(4)]?.seconds || 20;
  let s = RECIPES[job]?.seconds || 8;
  if (type === 'horno') { if (S.inv.fuelle) s /= 1.5; if (stoked) s /= 2; }
  if (type === 'aserradero' && S.inv.sierra) s /= 2;
  return s;
}

/** Name and output of a queued job (a recipe or an invention). */
export function jobInfo(job: string) {
  if (job.startsWith('inv:')) { const d = INV[job.slice(4)]; return { name: d?.name || '?', out: null as string | null }; }
  const r = RECIPES[job]; return { name: r?.name || '?', out: r?.out || null };
}

/* ---------- inventions ---------- */
export type InvState = 'done' | 'working' | 'ready' | 'needs' | 'locked';
export function invState(id: string, queued: string[]): InvState {
  const d = INV[id];
  if (S.inv[id]) return 'done';
  if (queued.includes('inv:' + id)) return 'working';
  if (d.locked || (d.needsFlag && !S.flags[d.needsFlag])) return 'locked';
  if ((d.needs || []).some(n => !S.inv[n])) return 'needs';
  return 'ready';
}
/** Queues an invention at the workshop. Returns a reason when it cannot. */
export function startInvention(id: string, jobs: string[]): string | null {
  const d = INV[id];
  if (invState(id, jobs) !== 'ready') return 'Todavía no se puede inventar';
  if (jobs.some(j => j.startsWith('inv:'))) return 'El taller ya está trabajando en un invento';
  if (!afford(d.cost)) return 'Te faltan materiales';
  pay(d.cost); jobs.push('inv:' + id); emit('changed');
  return null;
}
export function finishInvention(id: string) {
  S.inv[id] = true;
  S.stats.inventos = (S.stats.inventos || 0) + 1;
  emit('toast', `Invento listo: ${INV[id].name}. ${INV[id].desc}`);
  emit('invented', id); emit('changed');
}

/* ---------- effects of inventions, read by the rest of the game ---------- */
export const walkBoost = () => (S.inv.carretilla ? 1.25 : 1);
/** Shovel jobs (dig, plant, path, fill, stumps) need fewer blows with the metal shovel. */
export const shovelHits = (n: number) => (S.inv.palaM ? Math.max(1, Math.ceil(n / 2)) : n);
export const hammerPower = () => (S.inv.martillo ? 2 : 1);
