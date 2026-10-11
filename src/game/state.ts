import * as THREE from 'three';
import { emit } from '../core/events';
import RESOURCES from '../data/resources.json';
import BUILDINGS from '../data/buildings.json';
import TOOLS from '../data/tools.json';
import RECIPES from '../data/recipes.json';
import BALANCE from '../data/balance.json';
import CHAPTERS from '../data/chapters.json';
import LEVELS from '../data/levels.json';
import ACHIEVEMENTS from '../data/achievements.json';

export const DATA = { RESOURCES, BUILDINGS, TOOLS, RECIPES, BALANCE, CHAPTERS, LEVELS, ACHIEVEMENTS };
export type ResKey = keyof typeof RESOURCES;
export const RES_KEYS = Object.keys(RESOURCES) as ResKey[];
export type Cost = Partial<Record<ResKey, number>>;

export interface Req {
  kind: string; text: string; need: number; base: number; stat?: string;
  cost?: Partial<Record<string, number>>; reward: { stars: number; res?: Partial<Record<string, number>> };
}
export interface SavedBuilding { type: string; i: number; j: number; rot: number; queue?: number; jobs?: string[]; prog: number; prog2?: number; work?: number; lvl?: number; up?: number }
/** One floor of the volcano cave: where its boulders are and what was solved there. */
export interface CaveFloorSave { b: ([number, number] | null)[]; fill: string[]; broken: string[]; lit: string[]; dirs: Record<string, string>; mined: string[]; opened: string[]; read: string[]; door: boolean; cut?: Record<string, number>; minedAt?: Record<string, number>; built?: Record<string, string> }
export interface CaveSave { at?: [number, number]; hits: number; max: number; f: CaveFloorSave[]; caracola: boolean; chests: number; relics?: string[] }
export interface State {
  res: Record<ResKey, number>;
  got: Record<ResKey, number>;
  buildings: SavedBuilding[];
  tools: Record<string, boolean>;
  goal: number;
  made: number;
  crew: string[];
  flags: Record<string, boolean>;
  ancientLeft: number;
  gone: string[];                      // tiles whose original tree was felled ("i,j")
  stumps: string[];                    // tiles that still hold a stump (the tree will regrow)
  sites: { i: number; j: number; kind: string; hits: number }[];   // expansion plots being filled
  expanded: { i: number; j: number; kind: string }[];              // finished expansions
  grown: { i: number; j: number; type: string; stage: number; at: number }[]; // seedlings and trees that were not on the original island
  paths: string[];                     // grass tiles turned into dirt paths ("i,j")
  marks: { i: number; j: number; kind: 'plant' | 'path'; type?: string }[];  // orders waiting for a figure
  time: number;
  clock: number;                       // time of day, 0..1 (0 = morning)
  grid: number;                        // 3 = coordinates on the 52×52 grid (v0.10)
  map: number;                         // island layout: 1 = classic (older saves), 2 = the bigger island
  ruins: { lit: boolean[]; awake: boolean; seen: boolean };
  stats: Record<string, number>;       // counters for achievements and requests (felled trees, nights…)
  stars: number;                       // earned from chapters, requests and achievements; sets the island level
  ach: Record<string, number>;         // achievement id → tier reached (0..3)
  chDone: string[];                    // finished chapters (their reward was given)
  stDone: string[];                    // finished stages inside chapters ('barro:0'), their star was given
  board: { list: Req[]; next: number[] };   // notice board requests; `next` = game time a slot may be swapped again
  inv: Record<string, boolean>;        // inventions made in the workshop
  beach: { next: number; items: { i: number; j: number; kind: 'caja' | 'botella' }[] };  // what the sea brought
  lore: number[];                      // messages in bottles already read
  fish: Record<string, number>;        // what came out of the sea: item id → how many (the Sea collection)
  cave?: CaveSave;                     // the volcano cave (v0.15): entrance, floors, puzzles
  done: boolean;
}

const zero = () => Object.fromEntries(RES_KEYS.map(k => [k, 0])) as Record<ResKey, number>;
export function freshState(): State {
  return { res: zero(), got: zero(), buildings: [], tools: {}, goal: 0, made: 0, crew: ['arci'], flags: {}, ancientLeft: 4, gone: [], stumps: [], sites: [], expanded: [], grown: [], paths: [], marks: [], time: 0, clock: 0.04, grid: 3, map: 2, ruins: { lit: [false, false, false, false, false], awake: false, seen: false }, stats: {}, stars: 0, ach: {}, chDone: [], stDone: [], board: { list: [], next: [] }, inv: {}, beach: { next: 45, items: [] }, lore: [], fish: {}, done: false };
}
export let S: State = freshState();
export function setState(s: State) { S = s; }

const KEY = 'isla-arcilla-v05'; // the island grid grew in v0.5, so older saves start fresh
export function save(buildings: SavedBuilding[]) {
  S.buildings = buildings;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage may be blocked */ }
}
export function loadSave(): State | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s) return null;
    const f = freshState();
    if (!s.map) s.map = 1;                       // saves from before v0.10 keep the classic island
    if (s.grid !== 3) migrateGrid(s, s.grid === 2 ? 4 : 11);
    return { ...f, ...s, ruins: { ...f.ruins, ...(s.ruins || {}) }, stats: { ...(s.stats || {}) }, ach: { ...(s.ach || {}) }, chDone: s.chDone || [], stDone: s.stDone || [], board: s.board || f.board, inv: { ...(s.inv || {}) }, beach: s.beach || f.beach, lore: s.lore || [], fish: { ...(s.fish || {}) }, goal: 0, res: { ...f.res, ...s.res }, got: { ...f.got, ...s.got }, tools: { ...s.tools }, flags: { ...s.flags }, gone: s.gone || [], stumps: s.stumps || [], sites: s.sites || [], expanded: s.expanded || [], grown: s.grown || [], paths: s.paths || [], marks: s.marks || [] };
  } catch { return null; }
}
/** Older saves used smaller grids (30×30 until v0.7, 44×44 in v0.8–v0.9): shift every stored cell into the 52×52 grid. */
function migrateGrid(s: any, OFF: number) {
  const k = (x: string) => { const [i, j] = x.split(',').map(Number); return `${i + OFF},${j + OFF}`; };
  for (const list of [s.buildings, s.sites, s.expanded, s.grown, s.marks]) for (const o of list || []) { o.i += OFF; o.j += OFF; }
  for (const key of ['gone', 'stumps', 'paths']) if (s[key]) s[key] = s[key].map(k);
  s.grid = 3;
}
export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
export function hasSave() { try { return !!localStorage.getItem(KEY); } catch { return false; } }

export const afford = (c: Cost) => Object.entries(c).every(([k, v]) => S.res[k as ResKey] >= (v as number));
export function pay(c: Cost) { for (const [k, v] of Object.entries(c)) S.res[k as ResKey] -= v as number; emit('changed'); }

/** Storage limit per material; set by the economy module (almacén levels). */
let capFn: (k: ResKey) => number = () => Infinity;
export function setCapFn(f: (k: ResKey) => number) { capFn = f; }
export const capOf = (k: ResKey) => capFn(k);
export const isFull = (k: ResKey) => S.res[k] >= capFn(k);

/** Adds resources up to the storage limit; `at` is where the "+n" should float. */
export function gain(k: ResKey, n: number, at?: THREE.Vector3) {
  const room = Math.max(0, capFn(k) - S.res[k]), add = Math.min(n, room);
  S.res[k] += add; S.got[k] += add;
  if (add > 0) emit('gain', k, add, at);
  if (add < n) emit('full', k, at);
  emit('changed');
}
