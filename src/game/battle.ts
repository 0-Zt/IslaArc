import * as THREE from 'three';
import { camera } from '../render/renderer';
import { setFigureAnim, type Crew } from './crew';
import { GLOW, type Golem } from '../world/cavebuild';
import { sfx } from '../audio/sfx';
import { puff } from '../world/particles';

/* The first turn-based fight: the guardian of the volcano. You do not break it, you cool it down:
   its bar is heat, and the team brings it to zero. Each figure has two moves that match what it
   does on the island (Arci hits and covers, Musgo cools and heals, Brasa takes heat and fans the
   others). The golem shows what it will do next, one turn ahead, so you can plan. Losing costs
   nothing: the team steps back and can try again. */

type MoveId = 'pico' | 'cubrir' | 'musgo' | 'brotes' | 'absorber' | 'avivar';
const MOVES: Record<MoveId, { name: string; desc: string }> = {
  pico: { name: 'Golpe de pico', desc: 'Le quita 10 de calor' },
  cubrir: { name: 'Cubrir', desc: 'El equipo recibe la mitad del próximo golpe' },
  musgo: { name: 'Musgo húmedo', desc: 'Enfría 8; 15 si está al rojo' },
  brotes: { name: 'Brotes', desc: 'Cura 9 a todo el equipo y levanta a quien cayó' },
  absorber: { name: 'Absorber calor', desc: 'Se traga 9 de calor y recupera 5 de vida' },
  avivar: { name: 'Avivar', desc: 'El próximo ataque de otra figura pega ×1,6' },
};
const KIT: Record<string, MoveId[]> = { arci: ['pico', 'cubrir'], musgo: ['musgo', 'brotes'], brasa: ['absorber', 'avivar'], marea: ['musgo', 'brotes'] };
const HP: Record<string, number> = { arci: 40, musgo: 34, brasa: 38, marea: 34 };
const NAME: Record<string, string> = { arci: 'Arci', musgo: 'Musgo', brasa: 'Brasa', marea: 'Marea' };
const MAX_HEAT = 100;

type IntentId = 'puno' | 'pisoton' | 'ola' | 'puno2' | 'recalentar';
interface Intent { id: IntentId; target: number }
const INTENT_TEXT: Record<IntentId, (who: string) => string> = {
  puno: w => `Puño de roca → ${w} (12)`, pisoton: () => 'Pisotón → todos (6)', ola: () => 'Ola de lava → todos (9)',
  puno2: w => `Puño ardiente → ${w} (17)`, recalentar: () => 'Se recalienta (+15 de calor)',
};

interface Fighter { c: Crew; id: string; hp: number; max: number; home: THREE.Vector3; down: boolean }
let fighters: Fighter[] = [], golem: Golem | null = null, heat = MAX_HEAT, phase = 1, intent: Intent = { id: 'puno', target: 0 };
let turn = 0, state: 'off' | 'intro' | 'choose' | 'anim' | 'end' = 'off', cover = false, boost = 0, reheated = false, round = 1;
let onEnd: ((win: boolean) => void) | null = null, focus = new THREE.Vector3(), golemBase = new THREE.Vector3();
let bt = 0; const timers: { at: number; r: () => void }[] = [];
const wait = (s: number) => new Promise<void>(r => timers.push({ at: bt + s, r }));
export const battleActive = () => state !== 'off';
export const battleFocus = () => state === 'off' ? null : focus;

/* golem pose: 0 asleep (leaning forward), 1 standing; arms animate on top */
let pose = 0, poseTo = 0, armR = 0, armL = 0, hop = 0, shake = 0, calm = false;
const lunges: { f: Fighter; t: number; d: number; dir: THREE.Vector3; back?: boolean }[] = [];

/* ---------- interface ---------- */
const $ = (id: string) => document.getElementById(id)!;
function ui() {
  if (document.getElementById('battle')) return;
  const d = document.createElement('div'); d.id = 'battle'; d.hidden = true;
  d.innerHTML = '<div class="bTop"><b>Gólem del volcán</b><div class="bHeat"><i></i><span></span></div><div class="bIntent"></div></div>'
    + '<div class="bLog"></div><div class="bBottom"><div class="bTeam"></div><div class="bMoves"></div></div>';
  document.body.appendChild(d);
  d.querySelector('.bMoves')!.addEventListener('click', e => { const b = (e.target as HTMLElement).closest('[data-move]') as HTMLElement | null; if (b) choose(b.dataset.move as MoveId); });
}
function log(t: string) { $('battle').querySelector('.bLog')!.textContent = t; }
function render() {
  const el = $('battle');
  (el.querySelector('.bHeat i') as HTMLElement).style.width = `${Math.max(0, heat) / MAX_HEAT * 100}%`;
  el.querySelector('.bHeat span')!.textContent = `Calor ${Math.max(0, Math.round(heat))}/${MAX_HEAT}${phase === 2 ? ' · al rojo' : ''}`;
  el.classList.toggle('red', phase === 2);
  el.querySelector('.bIntent')!.innerHTML = state === 'end' ? '' : `<small>Lo próximo que hará:</small> ${INTENT_TEXT[intent.id](NAME[fighters[intent.target]?.id] || '')}`;
  el.querySelector('.bTeam')!.innerHTML = fighters.map((f, k) => `<div class="bF${k === turn && state === 'choose' ? ' on' : ''}${f.down ? ' down' : ''}"><b>${NAME[f.id]}</b><div class="bHp"><i style="width:${f.hp / f.max * 100}%"></i></div><small>${f.down ? 'caída' : `${f.hp}/${f.max}`}</small></div>`).join('');
  const f = fighters[turn];
  el.querySelector('.bMoves')!.innerHTML = state === 'choose' && f ? KIT[f.id].map(m => `<button data-move="${m}"><b>${MOVES[m].name}</b><small>${MOVES[m].desc}</small></button>`).join('') : '';
}
/** A number that floats up from a point in the world (damage, healing, heat). */
function float(at: THREE.Vector3, text: string, cls: string) {
  const v = at.clone().project(camera);
  const e = document.createElement('div'); e.className = 'bNum ' + cls; e.textContent = text;
  e.style.left = `${(v.x + 1) / 2 * innerWidth}px`; e.style.top = `${(1 - v.y) / 2 * innerHeight}px`;
  document.body.appendChild(e); setTimeout(() => e.remove(), 1100);
}

/* ---------- start and end ---------- */
export function startBattle(opts: { party: Crew[]; homes: THREE.Vector3[]; golem: Golem; onEnd: (win: boolean) => void }) {
  ui();
  golem = opts.golem; onEnd = opts.onEnd; golemBase.copy(golem.g.position);
  fighters = opts.party.map((c, k) => ({ c, id: c.id, hp: HP[c.id] || 36, max: HP[c.id] || 36, home: opts.homes[k].clone(), down: false }));
  for (const f of fighters) { f.c.root.position.copy(f.home); f.c.dir = Math.PI; f.c.root.rotation.set(0, Math.PI, 0); setFigureAnim(f.c, 'idle'); }
  heat = MAX_HEAT; phase = 1; turn = 0; cover = false; boost = 0; reheated = false; round = 1; calm = false;
  const gw = golem.g.getWorldPosition(new THREE.Vector3());
  focus.copy(gw).add(opts.homes[0]).multiplyScalar(0.5);
  state = 'intro'; pose = 0; poseTo = 0;
  $('battle').hidden = false; $('battle').classList.remove('red'); log('');
  render();
  (async () => {
    await wait(0.3);
    log('El suelo tiembla…'); shake = 0.6; sfx('fall', 0.6);
    await wait(0.8);
    poseTo = 1; for (const e of golem!.eyes) e.material = GLOW.eyeOn; sfx('roar');
    puff(gw.x, 1.2, gw.z, '#3a2c24', 18, 2.4, 1.6, 0);
    await wait(1.2);
    log('¡El gólem despierta! Elige qué hace cada figura. Arriba ves lo que hará el gólem después.');
    intent = pickIntent(); turn = firstAlive(0); state = 'choose'; render();
  })();
}
function finish(win: boolean) {
  state = 'end'; render();
  (async () => {
    if (win) {
      calm = true; poseTo = 0.55; sfx('solve');
      for (const c of golem!.cracks) c.material = GLOW.orb;
      for (const e of golem!.eyes) e.material = GLOW.orbOn;
      log('El calor se apaga. El gólem se arrodilla despacio, ya tranquilo.');
      for (const f of fighters) { f.c.cheer = 2.2; if (f.down) { f.down = false; f.c.root.rotation.z = 0; } }
      await wait(2.4);
    } else {
      log('El calor es demasiado. Las figuras retroceden para recuperar el aliento.');
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
  if (phase === 1) return { id: Math.random() < 0.55 ? 'puno' : 'pisoton', target };
  if (heat < 32 && !reheated) return { id: 'recalentar', target };
  return { id: Math.random() < 0.5 ? 'ola' : 'puno2', target };
}
function choose(m: MoveId) {
  if (state !== 'choose') return;
  const f = fighters[turn]; if (!f || !KIT[f.id].includes(m)) return;
  state = 'anim'; render(); sfx('tap');
  (async () => {
    await act(f, m);
    if (heat <= 0) { finish(true); return; }
    const next = firstAlive(turn + 1);
    if (next >= 0) { turn = next; state = 'choose'; render(); return; }
    await golemTurn();
    if (!alive().length) { finish(false); return; }
    round++; intent = pickIntent(); turn = firstAlive(0); state = 'choose'; render();
  })();
}
const golemAt = (dy = 1.2) => golem!.g.getWorldPosition(new THREE.Vector3()).setY(dy);
function cool(n: number, by: Fighter) {
  heat -= n; float(golemAt(1.9), `−${n} calor`, 'cool'); shake = 0.25;
  const g = golemAt(1); puff(g.x, 1, g.z, '#d8d0c8', 10, 1.8, 1, 0);
  if (phase === 1 && heat <= 50) { phase = 2; for (const c of golem!.cracks) c.material = GLOW.flameCore; log(`¡El gólem se pone al rojo! El musgo húmedo ahora lo enfría más.`); sfx('roar', 0.7); }
  void by;
}
async function lunge(f: Fighter) { const dir = golemAt(0).sub(f.home).setY(0).normalize(); lunges.push({ f, t: 0, d: 0.45, dir }); await wait(0.22); }
async function act(f: Fighter, m: MoveId) {
  const mult = boost && f.id !== 'brasa' ? 1.6 : 1;
  switch (m) {
    case 'pico': {
      log(`${NAME[f.id]} golpea con el pico${mult > 1 ? ', avivado por Brasa' : ''}.`);
      f.c.toolKey = 'pickM'; setFigureAnim(f.c, 'work'); await lunge(f); sfx('hit');
      cool(Math.round(10 * mult), f); if (mult > 1) boost = 0;
      await wait(0.4); setFigureAnim(f.c, 'idle'); break;
    }
    case 'cubrir': {
      cover = true; log('Arci se planta delante del equipo: el próximo golpe pegará la mitad.'); sfx('guard');
      for (const o of alive()) puff(o.home.x, 0.5, o.home.z, '#c8b090', 8, 1.2, 0.8, 0);
      f.c.cheer = 0.5; await wait(0.7); break;
    }
    case 'musgo': {
      const n = Math.round((phase === 2 ? 15 : 8) * mult);
      log(phase === 2 ? 'Musgo lanza musgo húmedo sobre la piedra al rojo: ¡vapor!' : 'Musgo lanza musgo húmedo.');
      await lunge(f); sfx('splash', 0.7); const g = golemAt(1); puff(g.x, 1.2, g.z, '#7ac060', 10, 1.6, 1, 0); if (phase === 2) puff(g.x, 1.4, g.z, '#f0f0f0', 16, 2.6, 1.2, 0);
      cool(n, f); if (mult > 1) boost = 0; await wait(0.5); break;
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
      log('Brasa se pega al gólem y se traga su calor.');
      await lunge(f); sfx('fire'); cool(9, f);
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
  const dmg = cover ? Math.ceil(n / 2) : n;
  f.hp = Math.max(0, f.hp - dmg); float(f.home.clone().setY(1.4), `−${dmg}`, 'dmg'); sfx('hit', 0.8);
  puff(f.home.x, 0.6, f.home.z, '#e86a5a', 8, 1.6, 1, 0);
  lunges.push({ f, t: 0, d: 0.35, dir: golemAt(0).sub(f.home).setY(0).normalize().multiplyScalar(-0.6), back: true });
  if (f.hp <= 0) { f.down = true; f.c.root.rotation.z = 1.35; setFigureAnim(f.c, 'idle'); log(`${NAME[f.id]} cae, sin fuerzas. Los brotes de Musgo la pueden levantar.`); }
}
async function golemTurn() {
  const t = fighters[intent.target];
  const target = t && !t.down ? t : alive()[0];
  switch (intent.id) {
    case 'puno': case 'puno2': {
      log(intent.id === 'puno' ? `El gólem levanta el puño sobre ${NAME[target.id]}…` : `El puño del gólem arde. Va por ${NAME[target.id]}…`);
      armR = 1; sfx('whoosh'); await wait(0.6); armR = -0.5; shake = 0.6; sfx('bighit');
      await hurt(target, intent.id === 'puno' ? 12 : 17); await wait(0.7); armR = 0; break;
    }
    case 'pisoton': case 'ola': {
      log(intent.id === 'pisoton' ? 'El gólem salta y golpea el suelo con todo su peso.' : 'El gólem golpea el suelo y una ola de lava corre hacia el equipo.');
      armR = armL = 1; hop = 1; sfx('whoosh'); await wait(0.6); armR = armL = -0.5; shake = 0.8; sfx('bighit');
      const g = golemAt(0);
      for (let k = 0; k < 14; k++) { const a = Math.PI / 2 + (Math.random() - 0.5) * 1.6, r = 0.8 + Math.random() * 2; puff(g.x + Math.cos(a) * r, 0.1, g.z + Math.sin(a) * r, intent.id === 'ola' ? '#ff8a20' : '#6a5c50', 3, 1.2, 1, 0); }
      for (const f of alive()) await hurt(f, intent.id === 'pisoton' ? 6 : 9);
      await wait(0.7); armR = armL = 0; break;
    }
    case 'recalentar': {
      log('El gólem respira hondo y las grietas brillan más: ¡se recalienta!'); reheated = true;
      sfx('fire'); heat = Math.min(MAX_HEAT, heat + 15); float(golemAt(1.9), '+15 calor', 'dmg');
      const g = golemAt(1); puff(g.x, 1.3, g.z, '#ffb040', 16, 2, 1, 0); await wait(1); break;
    }
  }
  cover = false; render();
}

/* ---------- every frame ---------- */
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export function tickBattle(dt: number) {
  if (state === 'off' && !calm && pose === poseTo) return;
  bt += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= bt) { const r = timers[i].r; timers.splice(i, 1); r(); }
  if (!golem) return;
  pose = Math.abs(poseTo - pose) < 0.01 ? poseTo : lerp(pose, poseTo, Math.min(1, dt * 2.5));
  // asleep: leaning forward, head down; awake: tall; calm: kneeling
  const p = pose, sway = state !== 'off' && p > 0.9 ? Math.sin(bt * 1.6) * 0.04 : 0;
  golem.torso.rotation.x = lerp(0.42, -0.05, p) + sway; golem.head.rotation.x = lerp(0.35, -0.1, p);
  golem.torso.position.y = lerp(0.4, 0.62, p);
  const ar = (v: number) => v > 0 ? -2.5 * v : -0.2 - v * -1.6;
  golem.armR.rotation.x += (ar(armR) - golem.armR.rotation.x) * Math.min(1, dt * (armR < 0 ? 22 : 7));
  golem.armL.rotation.x += (ar(armL) - golem.armL.rotation.x) * Math.min(1, dt * (armL < 0 ? 22 : 7));
  hop = Math.max(0, hop - dt * 2.2);
  golem.g.position.y = golemBase.y + Math.sin(hop * Math.PI) * 0.35;
  if (shake > 0) { shake = Math.max(0, shake - dt * 2); golem.g.position.x = golemBase.x + (Math.random() - 0.5) * 0.06 * shake; camera.position.x += (Math.random() - 0.5) * 0.1 * shake; camera.position.y += (Math.random() - 0.5) * 0.08 * shake; }
  else golem.g.position.x = golemBase.x;
  if (phase === 2 && state !== 'off' && Math.random() < dt * 3) { const g = golemAt(1.2); puff(g.x + (Math.random() - 0.5) * 0.8, 1.2, g.z, '#ff9a30', 2, 1.2, 0.6, 0); }
  for (const l of lunges) {
    l.t = Math.min(1, l.t + dt / l.d);
    const k = Math.sin(l.t * Math.PI) * (l.back ? 0.35 : 0.9);
    l.f.c.root.position.copy(l.f.home).addScaledVector(l.dir, k);
  }
  for (let i = lunges.length - 1; i >= 0; i--) if (lunges[i].t >= 1) { lunges[i].f.c.root.position.copy(lunges[i].f.home); lunges.splice(i, 1); }
}
/** Puts the golem in a pose without fighting: asleep (0), awake and waiting (1) or calm, kneeling (0.55). */
export function golemPose(g: Golem, kind: 'sleep' | 'awake' | 'calm') {
  golem = g; golemBase.copy(g.g.position);
  pose = poseTo = kind === 'sleep' ? 0 : kind === 'awake' ? 1 : 0.55; calm = kind === 'calm';
  g.torso.rotation.x = lerp(0.42, -0.05, pose); g.head.rotation.x = lerp(0.35, -0.1, pose); g.torso.position.y = lerp(0.4, 0.62, pose);
  if (kind === 'calm') { for (const c of g.cracks) c.material = GLOW.orb; for (const e of g.eyes) e.material = GLOW.orbOn; }
  if (kind === 'awake') for (const e of g.eyes) e.material = GLOW.eyeOn;
}
/** Debug and tests. */
export function battleState() { return state === 'off' ? null : { state, heat, phase, round, turn: fighters[turn]?.id, intent: intent.id, hp: fighters.map(f => f.hp) }; }
export function battleChoose(m: string) { choose(m as MoveId); }
