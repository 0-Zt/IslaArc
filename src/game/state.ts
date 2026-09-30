import * as THREE from 'three';
import { emit } from '../core/events';
import RESOURCES from '../data/resources.json';
import BUILDINGS from '../data/buildings.json';
import TOOLS from '../data/tools.json';
import RECIPES from '../data/recipes.json';
import BALANCE from '../data/balance.json';
import GOALS from '../data/goals.json';

export const DATA = { RESOURCES, BUILDINGS, TOOLS, RECIPES, BALANCE, GOALS };
export type ResKey = keyof typeof RESOURCES;
export const RES_KEYS = Object.keys(RESOURCES) as ResKey[];
export type Cost = Partial<Record<ResKey, number>>;

export interface SavedBuilding { type: string; i: number; j: number; rot: number; queue: number; prog: number }
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
  time: number;
  done: boolean;
}

const zero = () => Object.fromEntries(RES_KEYS.map(k => [k, 0])) as Record<ResKey, number>;
export function freshState(): State {
  return { res: zero(), got: zero(), buildings: [], tools: {}, goal: 0, made: 0, crew: ['arci'], flags: {}, ancientLeft: 4, gone: [], stumps: [], sites: [], expanded: [], time: 0, done: false };
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
    return { ...f, ...s, res: { ...f.res, ...s.res }, got: { ...f.got, ...s.got }, tools: { ...s.tools }, flags: { ...s.flags }, gone: s.gone || [], stumps: s.stumps || [], sites: s.sites || [], expanded: s.expanded || [] };
  } catch { return null; }
}
export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
export function hasSave() { try { return !!localStorage.getItem(KEY); } catch { return false; } }

export const afford = (c: Cost) => Object.entries(c).every(([k, v]) => S.res[k as ResKey] >= (v as number));
export function pay(c: Cost) { for (const [k, v] of Object.entries(c)) S.res[k as ResKey] -= v as number; emit('changed'); }

/** Adds resources; `at` is where the "+n" should float. */
export function gain(k: ResKey, n: number, at?: THREE.Vector3) {
  S.res[k] += n; S.got[k] += n;
  emit('gain', k, n, at);
  emit('changed');
}
