import { on, emit } from '../core/events';
import { S, DATA } from './state';
import { has } from './buildings';

/* Guided objectives. Text and order live in data/goals.json; the checks live here. */

export const GOALS = DATA.GOALS as { id: string; text: string; hint?: 'crew' | 'build' }[];
const CHECK: Record<string, () => boolean> = {
  talar: () => S.got.madera >= 2,
  madera10: () => S.res.madera >= 10 || has('casa'),
  casa: () => has('casa'),
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
  llamas: () => S.ruins.lit.every(Boolean),
  brasa: () => !!S.ruins.awake,
};

export const currentGoal = () => GOALS[S.goal] || null;
/** Goal text with its live counter filled in. */
export const goalText = (g: { text: string }) => g.text.replace('{n}', String(S.ruins.lit.filter(Boolean).length));

export function checkGoals() {
  let advanced = false;
  while (S.goal < GOALS.length && CHECK[GOALS[S.goal].id]?.()) { S.goal++; advanced = true; }
  if (!advanced) return;
  emit('goalAdvanced');
  if (S.goal >= GOALS.length && !S.done) { S.done = true; emit('finished'); }
}
on('changed', checkGoals);
