import { on, emit } from '../core/events';
import { S, DATA } from './state';
import { has, buildings, isDone } from './buildings';
import { addStars } from './progress';

/* The main route: chapters of guided goals (data/chapters.json). Goals are done in order;
   finishing the last goal of a chapter gives its reward. The checks live here. */

export interface Goal { id: string; text: string; hint?: 'crew' | 'build' }
export interface Chapter { id: string; title: string; desc: string; locked?: boolean; reward?: { stars: number; text: string }; goals: Goal[] }
export const CHAPTERS = DATA.CHAPTERS as Chapter[];
export const GOALS: (Goal & { ch: number })[] = CHAPTERS.flatMap((c, k) => c.goals.map(g => ({ ...g, ch: k })));

const CHECK: Record<string, () => boolean> = {
  talar: () => S.got.madera >= 2,
  madera10: () => S.res.madera >= 10 || has('casa'),
  casa: () => has('casa'),
  tablon: () => has('tablon'),
  claro: () => !!S.flags.claroVisto,
  piedra: () => S.got.piedra >= 6,
  arena: () => S.got.arena >= 6,
  horno: () => has('horno'),
  lingotes: () => S.made >= 2,
  hacha: () => !!S.tools.hacha,
  despejar: () => !!S.flags.claroAbierto,
  desenterrar: () => !!S.flags.musgoFree,
  expandir: () => S.expanded.length > 0,
  islote: () => !!S.flags.islote,
  braseros: () => builtBraziers() >= 5,
  llamas: () => S.ruins.lit.every(Boolean),
  brasa: () => !!S.ruins.awake,
  aserradero: () => has('aserradero'),
  tablas: () => (S.stats.tablas || 0) >= 10,
  ladrillos: () => (S.stats.ladrillo || 0) >= 6,
  vidrio: () => (S.stats.vidrio || 0) >= 4,
  avivar: () => !!S.flags.avivado,
  taller: () => has('taller'),
  inventos: () => Object.keys(S.inv).length >= 3,
  botellas: () => S.lore.length >= 2,
  linterna: () => !!S.inv.linterna,
};
const builtBraziers = () => buildings.filter(b => b.type === 'brasero' && isDone(b)).length;

export const currentGoal = () => GOALS[S.goal] || null;
export const currentChapter = () => { const g = currentGoal(); return g ? g.ch : CHAPTERS.findIndex(c => c.locked); };
/** Position of the current goal inside its chapter, e.g. 3 of 9. */
export function chapterStep() {
  const g = currentGoal(); if (!g) return null;
  const list = GOALS.filter(q => q.ch === g.ch);
  return { n: list.indexOf(g) + 1, of: list.length, ch: g.ch };
}
/** Goal text with its live counters filled in. */
export const goalText = (g: { text: string }) => g.text
  .replace('{n}', String(S.ruins.lit.filter(Boolean).length)).replace('{b}', String(builtBraziers()))
  .replace('{t}', String(Math.min(10, S.stats.tablas || 0))).replace('{l}', String(Math.min(6, S.stats.ladrillo || 0))).replace('{v}', String(Math.min(4, S.stats.vidrio || 0)))
  .replace('{i}', String(Math.min(3, Object.keys(S.inv).length))).replace('{b2}', String(Math.min(2, S.lore.length)));
export const goalDone = (i: number) => i < S.goal;

export function checkGoals(quiet = false) {
  let advanced = false;
  while (S.goal < GOALS.length && CHECK[GOALS[S.goal].id]?.()) {
    const ch = GOALS[S.goal].ch;
    S.goal++; advanced = true;
    // last goal of a chapter: reward
    const nextCh = GOALS[S.goal]?.ch;
    const c = CHAPTERS[ch];
    if (nextCh !== ch && !S.chDone.includes(c.id)) {
      S.chDone.push(c.id);
      if (quiet) S.stars += c.reward?.stars || 0;
      else { emit('chapterDone', c); addStars(c.reward?.stars || 0, `Capítulo ${ch + 1} completo`); }
    }
  }
  if (!advanced || quiet) return;
  emit('goalAdvanced');
  if (S.goal >= GOALS.length && !S.done) { S.done = true; emit('finished'); }
}
on('changed', () => checkGoals());
