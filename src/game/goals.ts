import { on, emit } from '../core/events';
import { S, DATA } from './state';
import { has, buildings, isDone, levelOf } from './buildings';
import { addStars } from './progress';
import CAVE from '../data/cave.json';

/* The main route: chapters of guided goals (data/chapters.json). Goals are done in order;
   finishing the last goal of a chapter gives its reward. The checks live here. */

export interface Goal { id: string; text: string; hint?: 'crew' | 'build' }
export interface Chapter { id: string; title: string; desc: string; locked?: boolean; reward?: { stars: number; text: string }; stages?: { name: string; n: number }[]; goals: Goal[] }
export const CHAPTERS = DATA.CHAPTERS as Chapter[];
export const GOALS: (Goal & { ch: number; st: number })[] = CHAPTERS.flatMap((c, k) => {
  // goals are grouped in named stages (data), 3 per stage when the data gives none
  const sizes = c.stages?.map(s => s.n) || Array.from({ length: Math.ceil(c.goals.length / 3) }, (_, i) => Math.min(3, c.goals.length - i * 3));
  let st = 0, left = sizes[0];
  return c.goals.map(g => { if (left === 0) { st++; left = sizes[st]; } left--; return { ...g, ch: k, st }; });
});
export interface Stage { name: string; ch: number; st: number; from: number; to: number }
/** The stages of a chapter, with the global goal range each one covers [from, to). */
export function stagesOf(ch: number): Stage[] {
  const out: Stage[] = [];
  GOALS.forEach((g, i) => {
    if (g.ch !== ch) return;
    const last = out[out.length - 1];
    if (last && last.st === g.st) last.to = i + 1;
    else out.push({ name: CHAPTERS[ch].stages?.[g.st]?.name || `Etapa ${g.st + 1}`, ch, st: g.st, from: i, to: i + 1 });
  });
  return out;
}

const CHECK: Record<string, () => boolean> = {
  talar: () => S.got.madera >= 2,
  madera10: () => S.res.madera >= 20 || has('casa'),
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
  almacen: () => has('almacen'),
  expandir: () => S.expanded.length > 0,
  islote: () => !!S.flags.islote,
  braseros: () => builtBraziers() >= 5,
  llamas: () => S.ruins.lit.every(Boolean),
  brasa: () => !!S.ruins.awake,
  aserradero: () => has('aserradero'),
  tablas: () => (S.stats.tablas || 0) >= 15,
  ladrillos: () => (S.stats.ladrillo || 0) >= 10,
  vidrio: () => (S.stats.vidrio || 0) >= 6,
  carbon: () => (S.stats.carbon || 0) >= 8,
  avivar: () => !!S.flags.avivado,
  horno2: () => levelOf('horno') >= 2,
  almacen2: () => levelOf('almacen') >= 2,
  taller: () => has('taller'),
  inventos: () => Object.keys(S.inv).length >= 3,
  botellas: () => S.lore.length >= 2,
  linterna: () => !!S.inv.linterna,
  muelle: () => has('muelle'),
  pescar1: () => (S.stats.pescados || 0) >= 1,
  pescar6: () => (S.stats.pescados || 0) >= 6,
  anzuelo: () => !!S.tools.anzuelo,
  vasija: () => (S.fish.vasija || 0) >= 4,
  algas: () => (S.got.algas || 0) >= 10,
  llave: () => !!S.fish.llave,
  cofre: () => !!S.fish.cofre,
  coleccion: () => Object.keys(S.fish).filter(k => S.fish[k] > 0).length >= 10,
  balsa: () => levelOf('muelle') >= 2,
  zarpar: () => !!S.flags.zarpo,
  hondo: () => !!S.flags.hondo,
  hondo1: () => (S.stats.hondos || 0) >= 1,
  cobre: () => (S.got.cobre || 0) >= 4,
  almacen3: () => levelOf('almacen') >= 3,
  brujula: () => !!S.fish.brujula,
  olas: () => !!S.flags.olas,
  timon: () => !!S.fish.timon,
  grieta: () => !!S.flags.cuevaAbierta,
  bajar: () => !!S.flags.cuevaEntro,
  cvBraseros: () => !!S.cave?.f[0]?.door,
  cvSalon: () => (S.cave?.max ?? -1) >= 1,
  cvEstatuas: () => !!S.cave?.f[1]?.door,
  cvRio: () => (S.cave?.max ?? -1) >= 2,
  cvCruzar: () => !!S.flags.lavaCruzada,
  cvCaracola: () => !!S.cave?.caracola,
  cvSalir: () => !!S.flags.caracolaIsla,
  soplar: () => !!S.flags.caracolaDebil,
  volverCueva: () => !!S.flags.golemDespierto,
  golem: () => !!S.flags.golemCalmo,
  afinar: () => !!S.inv.caracola,
  abrir: () => !!S.flags.olasAbiertas,
  cruzar: () => !!S.flags.cruzoOlas,
  fLider: () => !!S.flags.liderMusgo,
  fEnredadera: () => !!S.flags.enredadera,
  fSemilla: () => !!S.flags.semilla,
  fPuente: () => !!S.flags.puenteGrieta,
  fMural: () => !!S.flags.mural,
  fBrasas: () => !!S.flags.brasas,
  fCorazon: () => !!S.flags.corazon,
  fObsidiana: () => (S.got.obsidiana || 0) >= 3,
  fPicoO: () => !!S.inv.picoO,
};
/** Guardians of the second cave floor already looking at the altar. */
const statuesRight = () => { const f = S.cave?.f[1]; return f ? (CAVE.floors[1].statues || []).filter(s => f.dirs[`${s.x},${s.z}`] === s.want).length : 0; };
const builtBraziers = () => buildings.filter(b => b.type === 'brasero' && isDone(b)).length;

export const currentGoal = () => GOALS[S.goal] || null;
export const currentChapter = () => { const g = currentGoal(); return g ? g.ch : CHAPTERS.findIndex(c => c.locked); };
/** Position of the current goal inside its chapter and stage. */
export function chapterStep() {
  const g = currentGoal(); if (!g) return null;
  const stages = stagesOf(g.ch), stage = stages[g.st];
  return { ch: g.ch, st: g.st, stages: stages.length, name: stage.name, done: S.goal - stage.from, of: stage.to - stage.from };
}
/** Goal text with its live counters filled in. */
export const goalText = (g: { text: string }) => g.text
  .replace('{n}', String(S.ruins.lit.filter(Boolean).length)).replace('{b}', String(builtBraziers()))
  .replace('{t}', String(Math.min(15, S.stats.tablas || 0))).replace('{l}', String(Math.min(10, S.stats.ladrillo || 0))).replace('{v}', String(Math.min(6, S.stats.vidrio || 0)))
  .replace('{i}', String(Math.min(3, Object.keys(S.inv).length))).replace('{b2}', String(Math.min(2, S.lore.length))).replace('{c}', String(Math.min(8, S.stats.carbon || 0)))
  .replace('{p}', String(Math.min(6, S.stats.pescados || 0))).replace('{va}', String(Math.min(4, S.fish.vasija || 0))).replace('{al}', String(Math.min(10, S.got.algas || 0))).replace('{cu}', String(Math.min(4, S.got.cobre || 0))).replace('{ob}', String(Math.min(3, S.got.obsidiana || 0))).replace('{qz}', String(Math.min(6, S.res.cuarzo || 0))).replace('{br}', String(S.cave?.f[0]?.lit.length || 0)).replace('{es}', String(statuesRight())).replace('{co}', String(Math.min(10, Object.keys(S.fish).filter(k => S.fish[k] > 0).length)));
export const goalDone = (i: number) => i < S.goal;

export function checkGoals(quiet = false) {
  let advanced = false, bigStep = false;   // bigStep: a stage or chapter closed (it has its own banner)
  while (S.goal < GOALS.length && CHECK[GOALS[S.goal].id]?.()) {
    const { ch, st } = GOALS[S.goal];
    S.goal++; advanced = true;
    // last goal of a stage (not the chapter's last one): a star
    const next = GOALS[S.goal];
    const sid = CHAPTERS[ch].id + ':' + st;
    if (next?.ch === ch && next.st !== st && !S.stDone.includes(sid)) {
      S.stDone.push(sid); bigStep = true;
      if (quiet) S.stars += 1;
      else { emit('stageDone', stagesOf(ch)[st].name, 1); addStars(1, null); }
    }
    // last goal of a chapter: reward
    const nextCh = GOALS[S.goal]?.ch;
    const c = CHAPTERS[ch];
    if (nextCh !== ch && !S.chDone.includes(c.id)) {
      S.chDone.push(c.id); bigStep = true;
      if (quiet) S.stars += c.reward?.stars || 0;
      else { emit('chapterDone', c); addStars(c.reward?.stars || 0, null); }
    }
  }
  if (!advanced || quiet) return;
  emit('goalAdvanced', bigStep);
  if (S.goal >= GOALS.length && !S.done) { S.done = true; emit('finished'); }
}
on('changed', () => checkGoals());
