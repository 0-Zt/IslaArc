import * as THREE from 'three';
import { camera } from '../render/renderer';
import { setFigureAnim, type Crew } from './crew';
import { GLOW, type Golem } from '../world/cavebuild';
import { sfx } from '../audio/sfx';
import { puff } from '../world/particles';

/* Turn-based fights. You never break anything: you cool it down. The enemy's bar is heat, and the
   team brings it to zero. Each figure has two moves that match what it does on the island (Arci
   hits and covers, Musgo cools and heals, Brasa takes heat and fans the others, Marea throws water
   and raises a mist). The enemy shows what it will do next, one turn ahead, so you can plan.
   Losing costs nothing: the team steps back and can try again.
   Enemies: the guardian of the volcano (v0.16), the fire salamanders of the nest and their mother
   who guards the forge (v0.20), the iguanas and the guardian of the roots (v0.21), and the quartz
   lizards of the Depths (v0.22). */

type MoveId = 'pico' | 'cubrir' | 'musgo' | 'brotes' | 'absorber' | 'avivar' | 'agua' | 'neblina';
/* descriptions name the enemy's bar (heat, anger) and its second phase (red-hot, in bloom) */
const MOVES: Record<MoveId, { name: string; desc: (b: string, r: string) => string }> = {
  pico: { name: 'Golpe de pico', desc: b => `Le quita 10 de ${b}` },
  cubrir: { name: 'Cubrir', desc: () => 'El equipo recibe la mitad del próximo golpe' },
  musgo: { name: 'Musgo húmedo', desc: (b, r) => `Baja 8 de ${b}; 15 si está ${r}` },
  brotes: { name: 'Brotes', desc: () => 'Cura 9 a todo el equipo y levanta a quien cayó' },
  absorber: { name: 'Absorber', desc: b => `Se traga 9 de ${b} y recupera 5 de vida` },
  avivar: { name: 'Avivar', desc: () => 'El próximo ataque de otra figura pega ×1,6' },
  agua: { name: 'Chorro de agua', desc: (b, r) => `Baja 9 de ${b}; 16 si está ${r}` },
  neblina: { name: 'Neblina', desc: () => 'El próximo golpe pega la mitad y el equipo recupera 4' },
};
const KIT: Record<string, MoveId[]> = { arci: ['pico', 'cubrir'], musgo: ['musgo', 'brotes'], brasa: ['absorber', 'avivar'], marea: ['agua', 'neblina'] };
const HP: Record<string, number> = { arci: 40, musgo: 34, brasa: 38, marea: 34 };
const NAME: Record<string, string> = { arci: 'Arci', musgo: 'Musgo', brasa: 'Brasa', marea: 'Marea' };

/* what an enemy can do: hit one, hit everyone, or heat itself up again */
type IntentId = 'puno' | 'pisoton' | 'ola' | 'puno2' | 'recalentar' | 'mordisco' | 'escupir' | 'enroscarse' | 'mordisco2' | 'lluvia' | 'coletazo' | 'colazo' | 'chillido' | 'sol' | 'latigo' | 'esporas' | 'raices' | 'espinas' | 'polen' | 'colaCristal' | 'destello' | 'esconderse';
interface IntentDef { kind: 'one' | 'all' | 'heat'; n: number; text: (w: string) => string; log: (w: string) => string }
const INTENTS: Record<IntentId, IntentDef> = {
  puno: { kind: 'one', n: 12, text: w => `Puño de roca → ${w} (12)`, log: w => `El gólem levanta el puño sobre ${w}…` },
  puno2: { kind: 'one', n: 17, text: w => `Puño ardiente → ${w} (17)`, log: w => `El puño del gólem arde. Va por ${w}…` },
  pisoton: { kind: 'all', n: 6, text: () => 'Pisotón → todos (6)', log: () => 'El gólem salta y golpea el suelo con todo su peso.' },
  ola: { kind: 'all', n: 9, text: () => 'Ola de lava → todos (9)', log: () => 'El gólem golpea el suelo y una ola de lava corre hacia el equipo.' },
  recalentar: { kind: 'heat', n: 15, text: () => 'Se recalienta (+15 de calor)', log: () => 'Respira hondo y las grietas brillan más: ¡se recalienta!' },
  mordisco: { kind: 'one', n: 9, text: w => `Mordisco → ${w} (9)`, log: w => `La salamandra se lanza sobre ${w}…` },
  escupir: { kind: 'all', n: 5, text: () => 'Escupe brasas → todos (5)', log: () => 'La salamandra escupe una lluvia de brasas.' },
  enroscarse: { kind: 'heat', n: 8, text: () => 'Se enrosca en las brasas (+8 de calor)', log: () => 'La salamandra se enrosca en las brasas y se calienta.' },
  mordisco2: { kind: 'one', n: 13, text: w => `Mordisco → ${w} (13)`, log: w => `La madre abre la boca sobre ${w}…` },
  coletazo: { kind: 'one', n: 16, text: w => `Coletazo ardiente → ${w} (16)`, log: w => `La cola de la madre se pone al rojo. Va por ${w}…` },
  lluvia: { kind: 'all', n: 8, text: () => 'Lluvia de brasas → todos (8)', log: () => 'La madre sacude el lomo y llueven brasas sobre el equipo.' },
  colazo: { kind: 'one', n: 9, text: w => `Coletazo → ${w} (9)`, log: w => `Una iguana gira y le da un coletazo a ${w}…` },
  chillido: { kind: 'all', n: 5, text: () => 'Chillido → todos (5)', log: () => 'Las iguanas chillan todas a la vez. ¡Duele en los oídos!' },
  sol: { kind: 'heat', n: 8, text: () => 'Se calienta al sol (+8)', log: () => 'Las iguanas se tiran al sol y recuperan fuerzas.' },
  latigo: { kind: 'one', n: 12, text: w => `Látigo de raíz → ${w} (12)`, log: w => `Una raíz se levanta del suelo y azota a ${w}…` },
  espinas: { kind: 'one', n: 17, text: w => `Lluvia de espinas → ${w} (17)`, log: w => `El guardián abre las flores de los hombros y dispara espinas a ${w}…` },
  esporas: { kind: 'all', n: 6, text: () => 'Esporas → todos (6)', log: () => 'El guardián sacude el musgo del lomo: una nube de esporas.' },
  polen: { kind: 'all', n: 9, text: () => 'Polen pesado → todos (9)', log: () => 'Las flores del guardián sueltan un polen que pica y pesa.' },
  colaCristal: { kind: 'one', n: 10, text: w => `Cola de cristal → ${w} (10)`, log: w => `Un lagarto gira y le pega a ${w} con la cola llena de cristales…` },
  destello: { kind: 'all', n: 6, text: () => 'Destello → todos (6)', log: () => 'Los lagartos erizan los cristales del lomo: un destello que encandila a todos.' },
  esconderse: { kind: 'heat', n: 9, text: () => 'Se esconden entre los cristales (+9)', log: () => 'Los lagartos se meten entre los cristales y recuperan el ánimo.' },
  raices: { kind: 'heat', n: 14, text: () => 'Echa raíces (+14 de enojo)', log: () => 'El guardián hunde los pies en la tierra y bebe fuerza de las raíces.' },
};
export type FoeId = 'golem' | 'salamandra' | 'madre' | 'iguanas' | 'raiz' | 'lagartos';
interface FoeDef { name: string; heat: number; red: number; golem: boolean; pick: (phase: number, heat: number, reheated: boolean) => IntentId; win: string; lose: string; redLog: string; bar?: string; redName?: string; redOn?: string; on?: string }
const FOES: Record<FoeId, FoeDef> = {
  golem: {
    name: 'Gólem del volcán', heat: 100, red: 50, golem: true,
    pick: (ph, h, re) => ph === 1 ? (Math.random() < 0.55 ? 'puno' : 'pisoton') : h < 32 && !re ? 'recalentar' : Math.random() < 0.5 ? 'ola' : 'puno2',
    win: 'El calor se apaga. El gólem se arrodilla despacio, ya tranquilo.', lose: 'El calor es demasiado. Las figuras retroceden para recuperar el aliento.',
    redLog: '¡El gólem se pone al rojo! El musgo húmedo y el agua ahora lo enfrían más.',
  },
  salamandra: {
    name: 'Salamandras del nido', heat: 42, red: 0, golem: false,
    pick: (_ph, h, re) => h < 18 && !re ? 'enroscarse' : Math.random() < 0.6 ? 'mordisco' : 'escupir',
    win: 'Las salamandras se enfrían y se enroscan otra vez, tranquilas.', lose: 'Demasiadas brasas. El equipo se aleja del nido para recuperar el aliento.', redLog: '',
  },
  madre: {
    name: 'La salamandra madre', heat: 90, red: 45, golem: false,
    pick: (ph, h, re) => ph === 1 ? (Math.random() < 0.55 ? 'mordisco2' : 'lluvia') : h < 28 && !re ? 'recalentar' : Math.random() < 0.5 ? 'coletazo' : 'lluvia',
    win: 'La madre se enfría y baja la cabeza. Ya no está enojada.', lose: 'El calor de la madre es demasiado. El equipo retrocede hasta la entrada.',
    redLog: '¡La madre se pone al rojo! El agua y el musgo ahora la enfrían más.', redOn: 'la piel al rojo', on: 'a la salamandra',
  },
  iguanas: {
    name: 'Iguanas de la selva', heat: 40, red: 0, golem: false, on: 'a las iguanas',
    pick: (_ph, h, re) => h < 16 && !re ? 'sol' : Math.random() < 0.6 ? 'colazo' : 'chillido',
    win: 'Las iguanas se cansan y se tiran al sol, panza arriba.', lose: 'Las iguanas ganan esta vez. El equipo se aleja para descansar.', redLog: '',
  },
  lagartos: {
    name: 'Lagartos de cuarzo', heat: 48, red: 0, golem: false, bar: 'Enojo', on: 'a los lagartos',
    pick: (_ph, h, re) => h < 18 && !re ? 'esconderse' : Math.random() < 0.6 ? 'colaCristal' : 'destello',
    win: 'Los lagartos se calman y se enroscan alrededor de sus cristales, brillando bajito.', lose: 'Los lagartos ganan esta vez. El equipo vuelve a la escalera para descansar.', redLog: '',
  },
  raiz: {
    name: 'El guardián de raíces', heat: 95, red: 48, golem: true, bar: 'Enojo', redName: 'en flor', redOn: 'las flores abiertas', on: 'al guardián',
    pick: (ph, h, re) => ph === 1 ? (Math.random() < 0.55 ? 'latigo' : 'esporas') : h < 30 && !re ? 'raices' : Math.random() < 0.5 ? 'espinas' : 'polen',
    win: 'El enojo se va. El guardián baja los brazos y le salen flores nuevas.', lose: 'El enojo del guardián es demasiado. El equipo retrocede hasta la entrada.',
    redLog: '¡Al guardián se le abren las flores de los hombros! El agua y el musgo ahora lo calman más.',
  },
};
const barName = () => foe.bar || 'Calor';
const redName = () => foe.redName || 'al rojo';

interface Intent { id: IntentId; target: number }
interface Fighter { c: Crew; id: string; hp: number; max: number; home: THREE.Vector3; down: boolean }
let foe: FoeDef = FOES.golem;
let fighters: Fighter[] = [], golem: Golem | null = null, heat = 100, phase = 1, intent: Intent = { id: 'puno', target: 0 };
let turn = 0, state: 'off' | 'intro' | 'choose' | 'anim' | 'end' = 'off', cover = false, mist = false, boost = 0, reheated = false, round = 1;
let onEnd: ((win: boolean) => void) | null = null, focus = new THREE.Vector3(), golemBase = new THREE.Vector3(), golemRotY = 0;
let bt = 0; const timers: { at: number; r: () => void }[] = [];
const wait = (s: number) => new Promise<void>(r => timers.push({ at: bt + s, r }));
export const battleActive = () => state !== 'off';
export const battleFocus = () => state === 'off' ? null : focus;

/* enemy pose: 0 asleep, 1 awake; arms (or front legs) and a strike animate on top */
let pose = 0, poseTo = 0, armR = 0, armL = 0, hop = 0, shake = 0, calm = false, strike = 0;
const lunges: { f: Fighter; t: number; d: number; dir: THREE.Vector3; back?: boolean }[] = [];

/* ---------- interface ---------- */
const $ = (id: string) => document.getElementById(id)!;
function ui() {
  if (document.getElementById('battle')) return;
  const d = document.createElement('div'); d.id = 'battle'; d.hidden = true;
  d.innerHTML = '<div class="bTop"><b class="bName"></b><div class="bHeat"><i></i><span></span></div><div class="bIntent"></div></div>'
    + '<div class="bLog"></div><div class="bBottom"><div class="bTeam"></div><div class="bMoves"></div></div>';
  document.body.appendChild(d);
  d.querySelector('.bMoves')!.addEventListener('click', e => { const b = (e.target as HTMLElement).closest('[data-move]') as HTMLElement | null; if (b) choose(b.dataset.move as MoveId); });
}
function log(t: string) { $('battle').querySelector('.bLog')!.textContent = t; }
function render() {
  const el = $('battle');
  el.querySelector('.bName')!.textContent = foe.name;
  (el.querySelector('.bHeat i') as HTMLElement).style.width = `${Math.max(0, heat) / foe.heat * 100}%`;
  el.querySelector('.bHeat span')!.textContent = `${barName()} ${Math.max(0, Math.round(heat))}/${foe.heat}${phase === 2 ? ` · ${redName()}` : ''}`;
  el.classList.toggle('red', phase === 2);
  el.querySelector('.bIntent')!.innerHTML = state === 'end' ? '' : `<small>Lo próximo que hará:</small> ${INTENTS[intent.id].text(NAME[fighters[intent.target]?.id] || '')}`;
  el.querySelector('.bTeam')!.innerHTML = fighters.map((f, k) => `<div class="bF${k === turn && state === 'choose' ? ' on' : ''}${f.down ? ' down' : ''}"><b>${NAME[f.id]}</b><div class="bHp"><i style="width:${f.hp / f.max * 100}%"></i></div><small>${f.down ? 'caída' : `${f.hp}/${f.max}`}</small></div>`).join('');
  const f = fighters[turn];
  el.querySelector('.bMoves')!.innerHTML = state === 'choose' && f ? (KIT[f.id] || KIT.arci).map(m => `<button data-move="${m}"><b>${MOVES[m].name}</b><small>${MOVES[m].desc(barName().toLowerCase(), redName())}</small></button>`).join('') : '';
}
/** A number that floats up from a point in the world (damage, healing, heat). */
function float(at: THREE.Vector3, text: string, cls: string) {
  const v = at.clone().project(camera);
  const e = document.createElement('div'); e.className = 'bNum ' + cls; e.textContent = text;
  e.style.left = `${(v.x + 1) / 2 * innerWidth}px`; e.style.top = `${(1 - v.y) / 2 * innerHeight}px`;
  document.body.appendChild(e); setTimeout(() => e.remove(), 1100);
}

/* ---------- start and end ---------- */
export function startBattle(opts: { party: Crew[]; homes: THREE.Vector3[]; golem: Golem; onEnd: (win: boolean) => void; foe?: FoeId }) {
  ui();
  foe = FOES[opts.foe || 'golem'];
  golem = opts.golem; onEnd = opts.onEnd; golemBase.copy(golem.g.position); golemRotY = golem.g.rotation.y;
  fighters = opts.party.map((c, k) => ({ c, id: c.id, hp: HP[c.id] || 36, max: HP[c.id] || 36, home: opts.homes[k].clone(), down: false }));
  for (const f of fighters) { f.c.root.position.copy(f.home); f.c.dir = Math.PI; f.c.root.rotation.set(0, Math.PI, 0); setFigureAnim(f.c, 'idle'); }
  heat = foe.heat; phase = 1; turn = 0; cover = false; mist = false; boost = 0; reheated = false; round = 1; calm = false; strike = 0;
  const gw = golem.g.getWorldPosition(new THREE.Vector3());
  const mid = opts.homes.reduce((a, h) => a.add(h), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, opts.homes.length));
  focus.copy(gw).add(mid).multiplyScalar(0.5);
  state = 'intro'; pose = 0; poseTo = 0; intent = pickIntent();
  $('battle').hidden = false; $('battle').classList.remove('red'); log('');
  render();
  (async () => {
    await wait(0.3);
    log(foe.golem ? 'El suelo tiembla…' : 'Algo se mueve…'); shake = 0.6; sfx('fall', 0.6);
    await wait(0.8);
    poseTo = 1; for (const e of golem!.eyes) e.material = GLOW.eyeOn; sfx('roar', foe.golem ? 1 : 0.6);
    puff(gw.x, 1.2, gw.z, foe.bar ? '#6fb04a' : foe.golem ? '#3a2c24' : '#ff9a40', 18, 2.4, 1.6, 0);
    await wait(1.2);
    log(foe === FOES.golem ? '¡El gólem despierta! Elige qué hace cada figura. Arriba ves lo que hará el gólem después.' : `¡${foe.name}! Elige qué hace cada figura. Arriba ves lo que hará después.`);
    intent = pickIntent(); turn = firstAlive(0); state = 'choose'; render();
  })();
}
function finish(win: boolean) {
  state = 'end'; render();
  (async () => {
    if (win) {
      calm = foe.golem; poseTo = foe.golem ? 0.55 : 0; sfx('solve');
      for (const c of golem!.cracks) c.material = GLOW.orb;
      for (const e of golem!.eyes) e.material = foe.golem ? GLOW.orbOn : GLOW.eye;
      log(foe.win);
      for (const f of fighters) { f.c.cheer = 2.2; if (f.down) { f.down = false; f.c.root.rotation.z = 0; } }
      await wait(2.4);
    } else {
      log(foe.lose);
      poseTo = 1; await wait(2);
    }
    $('battle').hidden = true; state = 'off';
    for (const f of fighters) { f.c.root.rotation.set(0, f.c.dir, 0); }
    onEnd?.(win);
  })();
}

/* ---------- the turn ---------- */
const alive = () => fighters.filter(f => !f.down);
const firstAlive = (from: number) => { for (let k = from; k < fighters.length; k++) if (!fighters[k].down) return k; return -1; };
function pickIntent(): Intent {
  const live = fighters.map((f, k) => [f, k] as const).filter(([f]) => !f.down);
  const target = live.length ? live[Math.floor(Math.random() * live.length)][1] : 0;
  return { id: foe.pick(phase, heat, reheated), target };
}
function choose(m: MoveId) {
  if (state !== 'choose') return;
  const f = fighters[turn]; if (!f || !(KIT[f.id] || KIT.arci).includes(m)) return;
  state = 'anim'; render(); sfx('tap');
  (async () => {
    await act(f, m);
    if (heat <= 0) { finish(true); return; }
    const next = firstAlive(turn + 1);
    if (next >= 0) { turn = next; state = 'choose'; render(); return; }
    await foeTurn();
    if (!alive().length) { finish(false); return; }
    round++; intent = pickIntent(); turn = firstAlive(0); state = 'choose'; render();
  })();
}
const golemAt = (dy = 1.2) => golem!.g.getWorldPosition(new THREE.Vector3()).setY(dy);
function cool(n: number) {
  heat -= n; float(golemAt(foe.golem ? 1.9 : 1.2), `−${n} ${barName().toLowerCase()}`, 'cool'); shake = 0.25;
  const g = golemAt(1); puff(g.x, foe.golem ? 1 : 0.5, g.z, '#d8d0c8', 10, 1.8, 1, 0);
  if (phase === 1 && foe.red && heat <= foe.red) { phase = 2; for (const c of golem!.cracks) c.material = GLOW.flameCore; log(foe.redLog); sfx('roar', 0.7); }
}
async function lunge(f: Fighter) { const dir = golemAt(0).sub(f.home).setY(0).normalize(); lunges.push({ f, t: 0, d: 0.45, dir }); await wait(0.22); }
async function act(f: Fighter, m: MoveId) {
  const mult = boost && f.id !== 'brasa' ? 1.6 : 1;
  const red = phase === 2;
  switch (m) {
    case 'pico': {
      log(`${NAME[f.id]} golpea con el pico${mult > 1 ? ', avivado por Brasa' : ''}.`);
      f.c.toolKey = 'pickM'; setFigureAnim(f.c, 'work'); await lunge(f); sfx('hit');
      cool(Math.round(10 * mult)); if (mult > 1) boost = 0;
      await wait(0.4); setFigureAnim(f.c, 'idle'); break;
    }
    case 'cubrir': {
      cover = true; log('Arci se planta delante del equipo: el próximo golpe pegará la mitad.'); sfx('guard');
      for (const o of alive()) puff(o.home.x, 0.5, o.home.z, '#c8b090', 8, 1.2, 0.8, 0);
      f.c.cheer = 0.5; await wait(0.7); break;
    }
    case 'musgo': {
      const n = Math.round((red ? 15 : 8) * mult);
      log(red ? `Musgo lanza musgo húmedo sobre ${foe.redOn || 'la piedra al rojo'}: ¡vapor!` : 'Musgo lanza musgo húmedo.');
      await lunge(f); sfx('splash', 0.7); const g = golemAt(1); puff(g.x, 1.2, g.z, '#7ac060', 10, 1.6, 1, 0); if (red) puff(g.x, 1.4, g.z, '#f0f0f0', 16, 2.6, 1.2, 0);
      cool(n); if (mult > 1) boost = 0; await wait(0.5); break;
    }
    case 'agua': {
      const n = Math.round((red ? 16 : 9) * mult);
      log(red ? `Marea lanza un chorro de agua sobre ${foe.redOn || 'la piedra al rojo'}: ¡una nube de vapor!` : 'Marea lanza un chorro de agua de mar.');
      await lunge(f); sfx('splash'); const g = golemAt(1);
      for (let k = 0; k < 6; k++) puff(f.home.x + (g.x - f.home.x) * k / 6, 0.9, f.home.z + (g.z - f.home.z) * k / 6, '#7ec8f0', 3, 0.6, 0.4, 0);
      puff(g.x, 1.2, g.z, '#f4f8ff', red ? 20 : 10, 2.4, 1.2, 0);
      cool(n); if (mult > 1) boost = 0; await wait(0.5); break;
    }
    case 'neblina': {
      mist = true; log('Marea levanta una neblina fresca: el próximo golpe pegará la mitad.'); sfx('splash', 0.5);
      for (const o of alive()) { const h = Math.min(4, o.max - o.hp); o.hp += h; if (h) float(o.home.clone().setY(1.3), `+${h}`, 'heal'); puff(o.home.x, 0.6, o.home.z, '#e8f4ff', 10, 0.9, 1.2, 0); }
      await wait(0.8); break;
    }
    case 'brotes': {
      log('Brotes verdes salen del suelo y curan al equipo.'); sfx('heal');
      for (const o of fighters) {
        if (o.down) { o.down = false; o.hp = 8; o.c.root.rotation.z = 0; setFigureAnim(o.c, 'idle'); float(o.home.clone().setY(1.3), '¡de pie!', 'heal'); }
        else { const h = Math.min(9, o.max - o.hp); o.hp += h; if (h) float(o.home.clone().setY(1.3), `+${h}`, 'heal'); }
        puff(o.home.x, 0.2, o.home.z, '#8ad96b', 8, 1.4, 0.8, 0);
      }
      await wait(0.8); break;
    }
    case 'absorber': {
      log(`Brasa se pega ${foe.on || 'al gólem'} y se traga su ${barName().toLowerCase()}.`);
      await lunge(f); sfx('fire'); cool(9);
      const h = Math.min(5, f.max - f.hp); f.hp += h; if (h) float(f.home.clone().setY(1.3), `+${h}`, 'heal');
      const g = golemAt(1); for (let k = 0; k < 6; k++) puff(g.x + (f.home.x - g.x) * k / 6, 1, g.z + (f.home.z - g.z) * k / 6, '#ffb040', 2, 0.6, 0.4, 0);
      await wait(0.5); break;
    }
    case 'avivar': {
      boost = 1; log('Brasa sopla chispas: el próximo ataque de otra figura pegará más fuerte.'); sfx('fire', 0.6);
      for (const o of alive()) if (o !== f) puff(o.home.x, 0.9, o.home.z, '#ffb040', 6, 1.2, 0.6, 0);
      await wait(0.7); break;
    }
  }
  render();
}
async function hurt(f: Fighter, n: number) {
  if (f.down) return;
  const dmg = cover || mist ? Math.ceil(n / 2) : n;
  f.hp = Math.max(0, f.hp - dmg); float(f.home.clone().setY(1.4), `−${dmg}`, 'dmg'); sfx('hit', 0.8);
  puff(f.home.x, 0.6, f.home.z, '#e86a5a', 8, 1.6, 1, 0);
  lunges.push({ f, t: 0, d: 0.35, dir: golemAt(0).sub(f.home).setY(0).normalize().multiplyScalar(-0.6), back: true });
  if (f.hp <= 0) { f.down = true; f.c.root.rotation.z = 1.35; setFigureAnim(f.c, 'idle'); log(`${NAME[f.id]} cae, sin fuerzas. Los brotes de Musgo la pueden levantar.`); }
}
async function foeTurn() {
  const t = fighters[intent.target];
  const target = t && !t.down ? t : alive()[0];
  const d = INTENTS[intent.id];
  log(d.log(NAME[target.id]));
  if (d.kind === 'one') {
    armR = 1; sfx('whoosh'); await wait(0.6); armR = -0.5; strike = 1; shake = 0.6; sfx('bighit');
    await hurt(target, d.n); await wait(0.7); armR = 0;
  } else if (d.kind === 'all') {
    armR = armL = 1; hop = 1; sfx('whoosh'); await wait(0.6); armR = armL = -0.5; shake = 0.8; sfx('bighit');
    const g = golemAt(0), lava = intent.id === 'ola' || intent.id === 'lluvia' || intent.id === 'escupir';
    for (let k = 0; k < 14; k++) { const a = Math.PI / 2 + (Math.random() - 0.5) * 1.6, r = 0.8 + Math.random() * 2; puff(g.x + Math.cos(a) * r, 0.1, g.z + Math.sin(a) * r, lava ? '#ff8a20' : intent.id === 'esporas' || intent.id === 'polen' ? '#e8e070' : '#6a5c50', 3, 1.2, 1, 0); }
    for (const f of alive()) await hurt(f, d.n);
    await wait(0.7); armR = armL = 0;
  } else {
    reheated = true; sfx(foe.bar ? 'heal' : 'fire'); heat = Math.min(foe.heat, heat + d.n); float(golemAt(1.6), `+${d.n} ${barName().toLowerCase()}`, 'dmg');
    const g = golemAt(1); puff(g.x, 1, g.z, foe.bar ? '#8ad96b' : '#ffb040', 16, 2, 1, 0); await wait(1);
  }
  cover = false; mist = false; render();
}

/* ---------- every frame ---------- */
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export function tickBattle(dt: number) {
  if (state === 'off' && !calm && pose === poseTo) return;
  bt += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= bt) { const r = timers[i].r; timers.splice(i, 1); r(); }
  if (!golem) return;
  pose = Math.abs(poseTo - pose) < 0.01 ? poseTo : lerp(pose, poseTo, Math.min(1, dt * 2.5));
  const p = pose;
  if (foe.golem) {
    // asleep: leaning forward, head down; awake: tall; calm: kneeling
    const sway = state !== 'off' && p > 0.9 ? Math.sin(bt * 1.6) * 0.04 : 0;
    golem.torso.rotation.x = lerp(0.42, -0.05, p) + sway; golem.head.rotation.x = lerp(0.35, -0.1, p);
    golem.torso.position.y = lerp(0.4, 0.62, p);
    const ar = (v: number) => v > 0 ? -2.5 * v : -0.2 - v * -1.6;
    golem.armR.rotation.x += (ar(armR) - golem.armR.rotation.x) * Math.min(1, dt * (armR < 0 ? 22 : 7));
    golem.armL.rotation.x += (ar(armL) - golem.armL.rotation.x) * Math.min(1, dt * (armL < 0 ? 22 : 7));
  } else {
    // a salamander: head up when awake, tail swinging, a snap forward when it bites
    strike = Math.max(0, strike - dt * 3);
    golem.head.rotation.x = lerp(0.25, -0.25, p) - (armR > 0 ? 0.35 : 0);
    golem.torso.rotation.x = lerp(0.05, -0.08, p);
    const tail = (golem as any).tail as THREE.Group | undefined;
    if (tail) tail.rotation.y = Math.sin(bt * (state !== 'off' ? 3.2 : 0.8)) * (0.15 + 0.25 * p);
    golem.armR.rotation.x += ((armR > 0 ? -0.9 : 0) - golem.armR.rotation.x) * Math.min(1, dt * 10);
    golem.armL.rotation.x += ((armL > 0 ? -0.9 : 0) - golem.armL.rotation.x) * Math.min(1, dt * 10);
  }
  hop = Math.max(0, hop - dt * 2.2);
  golem.g.position.y = golemBase.y + Math.sin(hop * Math.PI) * (foe.golem ? 0.35 : 0.2);
  const fwd = Math.sin(strike * Math.PI) * 0.45;
  golem.g.position.z = golemBase.z + Math.cos(golemRotY) * fwd; golem.g.position.x = golemBase.x + Math.sin(golemRotY) * fwd;
  if (shake > 0) { shake = Math.max(0, shake - dt * 2); golem.g.position.x += (Math.random() - 0.5) * 0.06 * shake; camera.position.x += (Math.random() - 0.5) * 0.1 * shake; camera.position.y += (Math.random() - 0.5) * 0.08 * shake; }
  if (phase === 2 && state !== 'off' && Math.random() < dt * 3) { const g = golemAt(1.2); puff(g.x + (Math.random() - 0.5) * 0.8, foe.golem ? 1.2 : 0.5, g.z, foe.bar ? '#f8a8c8' : '#ff9a30', 2, 1.2, 0.6, 0); }
  for (const l of lunges) {
    l.t = Math.min(1, l.t + dt / l.d);
    const k = Math.sin(l.t * Math.PI) * (l.back ? 0.35 : 0.9);
    l.f.c.root.position.copy(l.f.home).addScaledVector(l.dir, k);
  }
  for (let i = lunges.length - 1; i >= 0; i--) if (lunges[i].t >= 1) { lunges[i].f.c.root.position.copy(lunges[i].f.home); lunges.splice(i, 1); }
}
/** Puts the golem in a pose without fighting: asleep (0), awake and waiting (1) or calm, kneeling (0.55). */
export function golemPose(g: Golem, kind: 'sleep' | 'awake' | 'calm') {
  foe = FOES.golem;
  golem = g; golemBase.copy(g.g.position); golemRotY = g.g.rotation.y;
  pose = poseTo = kind === 'sleep' ? 0 : kind === 'awake' ? 1 : 0.55; calm = kind === 'calm';
  g.torso.rotation.x = lerp(0.42, -0.05, pose); g.head.rotation.x = lerp(0.35, -0.1, pose); g.torso.position.y = lerp(0.4, 0.62, pose);
  if (kind === 'calm') { for (const c of g.cracks) c.material = GLOW.orb; for (const e of g.eyes) e.material = GLOW.orbOn; }
  if (kind === 'awake') for (const e of g.eyes) e.material = GLOW.eyeOn;
}
/** After a fight the enemy is free to be moved (a calmed guardian stepping aside): stop holding it in place. */
export function releaseFoe() {
  calm = false; pose = poseTo;
  if (golem && foe.golem) { golem.torso.rotation.x = lerp(0.42, -0.05, pose); golem.head.rotation.x = lerp(0.35, -0.1, pose); golem.torso.position.y = lerp(0.4, 0.62, pose); golem.g.position.copy(golemBase); }
}
/** A salamander resting (eyes dark, head down) or awake (eyes lit). */
export function salamanderPose(g: Golem, awake: boolean) {
  g.head.rotation.x = awake ? -0.2 : 0.25;
  for (const e of g.eyes) e.material = awake ? GLOW.eyeOn : GLOW.eye;
}
/** Debug and tests. */
export function battleState() { return state === 'off' ? null : { state, heat, phase, round, turn: fighters[turn]?.id, intent: intent.id, hp: fighters.map(f => f.hp), foe: foe.name }; }
export function battleChoose(m: string) { choose(m as MoveId); }
/** The moves of whoever chooses now (tests). */
export function battleMoves() { const f = fighters[turn]; return state === 'choose' && f ? KIT[f.id] || [] : []; }
