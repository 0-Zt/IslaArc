import { BRAZIERS, lightFlame } from '../game/ruins';
import { S } from '../game/state';
import { isNight, waitForNight, waitingNight } from '../render/daynight';
import { runeSVG, SYM_NAME, type Sym } from '../assets/ruins';

/* The five flame puzzles. Each renders into the bottom sheet and keeps its own state;
   solving one lights the flame of its brazier. */

let k = -1;                        // which brazier
let solved = false;
let rerender: () => void = () => {};
let closeSheet: () => void = () => {};
export function initPuzzles(opts: { rerender: () => void; close: () => void }) { rerender = opts.rerender; closeSheet = opts.close; }

const ORANGE = '#ffb45a', DIM = '#6a645c', TEAL = '#58c8b8';

/* ---------- 1. runes: repeat the song ---------- */
const RUNAS: Sym[] = ['spiral', 'flame', 'wave', 'moon'];
const R = { seq: [] as number[], round: 0, pos: 0, lit: -1, playing: false, msg: '' };
const ROUNDS = [3, 4, 5];
function runasReset() { R.seq = Array.from({ length: 5 }, () => Math.floor(Math.random() * 4)); R.round = 0; R.pos = 0; R.lit = -1; R.msg = 'Toca «Escuchar» y repite la canción de las runas.'; }
function runasPlay() {
  if (R.playing) return;
  R.playing = true; R.pos = 0;
  const n = ROUNDS[R.round];
  let s = 0;
  const step = () => {
    if (k < 0) { R.playing = false; return; }
    if (s >= n * 2) { R.lit = -1; R.playing = false; R.msg = 'Ahora tú.'; rerender(); return; }
    R.lit = s % 2 === 0 ? R.seq[s / 2] : -1; s++; rerender();
    setTimeout(step, s % 2 ? 520 : 180);
  };
  R.msg = 'Escucha…'; step();
}
function runasTap(i: number) {
  if (R.playing || solved) return;
  R.lit = i; setTimeout(() => { if (R.lit === i) { R.lit = -1; rerender(); } }, 220);
  if (R.seq[R.pos] !== i) { R.pos = 0; R.msg = 'Las runas se apagan. Vuelve a escuchar.'; rerender(); return; }
  R.pos++;
  if (R.pos < ROUNDS[R.round]) { R.msg = `${R.pos} de ${ROUNDS[R.round]}`; rerender(); return; }
  R.round++; R.pos = 0;
  if (R.round >= ROUNDS.length) { win(); return; }
  R.msg = '¡Bien! La canción se alarga. Escucha otra vez.'; rerender();
}
function runasHTML() {
  const btn = (i: number) => `<button class="pz-rune${R.lit === i ? ' on' : ''}" data-pz="rune" data-i="${i}" aria-label="Runa ${SYM_NAME[RUNAS[i]]}">${runeSVG(RUNAS[i], R.lit === i ? ORANGE : TEAL, 54)}</button>`;
  return `<div class="pz-grid2">${[0, 1, 2, 3].map(btn).join('')}</div>
    <div class="pz-dots">${ROUNDS.map((_, q) => `<i class="${q < R.round ? 'on' : ''}"></i>`).join('')}</div>
    <p class="pz-msg">${R.msg}</p><button class="btn main" data-pz="listen" ${R.playing ? 'disabled' : ''} style="width:100%">Escuchar</button>`;
}

/* ---------- 2. channel: rotate the stones until the lava reaches the brazier ---------- */
// sides as bits: N=1 E=2 S=4 W=8
const SOL = [
  [6, 3, 12, 9],
  [10, 12, 5, 6],
  [3, 3, 10, 10],
  [9, 6, 12, 3],
];
const SRC = 1, EXIT = 2, rot = (m: number) => ((m << 1) | (m >> 3)) & 15;
let grid: number[][] = [];
function cauceReset() {
  do grid = SOL.map(row => row.map(m => { let v = m; for (let t = Math.floor(Math.random() * 4); t > 0; t--) v = rot(v); return v; }));
  while (cauceFlow().solved);
}
function cauceFlow() {
  const filled = new Set<string>();
  const q: [number, number, number][] = [[SRC, 0, 8]]; // row, col, side we enter from
  let solved = false;
  while (q.length) {
    const [r, c, from] = q.shift()!;
    if (r < 0 || c < 0 || r > 3 || c > 3) continue;
    const m = grid[r][c]; if (!(m & from) || filled.has(`${r},${c}`)) continue;
    filled.add(`${r},${c}`);
    if (r === EXIT && c === 3 && m & 2) solved = true;
    if (m & 1) q.push([r - 1, c, 4]); if (m & 2) q.push([r, c + 1, 8]); if (m & 4) q.push([r + 1, c, 1]); if (m & 8) q.push([r, c - 1, 2]);
  }
  return { filled, solved };
}
function cauceHTML() {
  const { filled } = cauceFlow(), C = 60, W = 18;
  let svg = '';
  grid.forEach((row, r) => row.forEach((m, c) => {
    const x = c * C, y = r * C, on = filled.has(`${r},${c}`), col = on ? ORANGE : '#3a342c';
    svg += `<g data-pz="pipe" data-r="${r}" data-c="${c}" style="cursor:pointer"><rect x="${x + 2}" y="${y + 2}" width="${C - 4}" height="${C - 4}" rx="6" fill="#8e887c"/><rect x="${x + 6}" y="${y + 6}" width="${C - 12}" height="${C - 12}" rx="4" fill="#9a9488"/>`;
    const cx = x + C / 2, cy = y + C / 2;
    svg += `<rect x="${cx - W / 2}" y="${cy - W / 2}" width="${W}" height="${W}" fill="${col}"/>`;
    if (m & 1) svg += `<rect x="${cx - W / 2}" y="${y}" width="${W}" height="${C / 2}" fill="${col}"/>`;
    if (m & 4) svg += `<rect x="${cx - W / 2}" y="${cy}" width="${W}" height="${C / 2}" fill="${col}"/>`;
    if (m & 2) svg += `<rect x="${cx}" y="${cy - W / 2}" width="${C / 2}" height="${W}" fill="${col}"/>`;
    if (m & 8) svg += `<rect x="${x}" y="${cy - W / 2}" width="${C / 2}" height="${W}" fill="${col}"/>`;
    svg += '</g>';
  }));
  svg += `<rect x="-26" y="${SRC * C + 12}" width="24" height="36" rx="6" fill="${ORANGE}"/><text x="-14" y="${SRC * C + 36}" font-size="11" text-anchor="middle" fill="#3a1a08">lava</text>`;
  svg += `<rect x="${4 * C + 2}" y="${EXIT * C + 10}" width="26" height="40" rx="4" fill="#6a645c"/><rect x="${4 * C + 6}" y="${EXIT * C + 14}" width="18" height="10" fill="${cauceFlow().solved ? ORANGE : '#3a342c'}"/>`;
  return `<svg class="pz-svg" viewBox="-30 0 300 240" role="img" aria-label="Cauce de lava de 4 por 4">${svg}</svg><p class="pz-msg">Toca una piedra para girarla. La lava entra por la izquierda y debe llegar al brasero de la derecha.</p>`;
}

/* ---------- 3. slabs: each one wakes its neighbours; light all nine ---------- */
let slabs: boolean[] = [];
let moves = 0;
const press = (i: number) => { const r = Math.floor(i / 3), c = i % 3; for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + a, cc = c + b; if (rr >= 0 && rr < 3 && cc >= 0 && cc < 3) slabs[rr * 3 + cc] = !slabs[rr * 3 + cc]; } };
function losasReset() { do { slabs = Array(9).fill(true); const picks = new Set<number>(); while (picks.size < 3) picks.add(Math.floor(Math.random() * 9)); picks.forEach(press); } while (slabs.every(Boolean)); moves = 0; }
function losasHTML() {
  return `<div class="pz-grid3">${slabs.map((on, i) => `<button class="pz-slab${on ? ' on' : ''}" data-pz="slab" data-i="${i}" aria-label="Losa ${i + 1}, ${on ? 'encendida' : 'apagada'}"></button>`).join('')}</div>
    <p class="pz-msg">Encendidas: ${slabs.filter(Boolean).length} de 9 · pasos: ${moves}</p>
    <button class="btn" data-pz="reset" style="width:100%">Empezar de nuevo</button>`;
}

/* ---------- 4. obelisks: the riddle on the base ---------- */
const OB_SYMS: Sym[] = ['flame', 'wave', 'leaf', 'stone', 'moon', 'spiral'];
const OB_ANSWER = [2, 1, 3];   // leaf, wave, stone (mountain)
let ob = [0, 0, 0];
function obHTML() {
  return `<p class="pz-riddle">«Primero lo que da el árbol, luego lo que trae el mar, al final lo que guarda la montaña.»</p>
    <div class="pz-obs">${ob.map((v, i) => `<button class="pz-ob" data-pz="ob" data-i="${i}" aria-label="Obelisco ${i + 1}: ${SYM_NAME[OB_SYMS[v]]}">${runeSVG(OB_SYMS[v], solved ? ORANGE : '#e8e2d4', 46)}<small>${SYM_NAME[OB_SYMS[v]]}</small></button>`).join('')}</div>
    <p class="pz-msg">Toca un obelisco para girar su cara.</p>`;
}

/* ---------- 5. moon: guide the moonbeam with the mirrors (only at night) ---------- */
const MIR: Record<string, 0 | 1> = {};   // "r,c" → 0 = '/', 1 = '\'
const MIR_CELLS = ['2,1', '2,3', '3,3', '1,3', '4,1', '0,3'];
const BEAM_COL = 1, TARGET_ROW = 3;
function lunaReset() { for (const c of MIR_CELLS) MIR[c] = 0; }
/** Follows the moonbeam through the mirrors. Points are in cell units (x = column, y = row). */
function traceBeam() {
  let r = -1, c = BEAM_COL, dr = 1, dc = 0; const pts: [number, number][] = [[c + 0.5, 0]];
  for (let n = 0; n < 40; n++) {
    r += dr; c += dc;
    if (r < 0 || r > 4 || c < 0 || c > 4) { pts.push([c - dc + 0.5 + dc * 0.5, r - dr + 0.5 + dr * 0.5]); return { pts, hit: c > 4 && r === TARGET_ROW }; }
    const m = MIR[`${r},${c}`];
    if (m !== undefined) { pts.push([c + 0.5, r + 0.5]); if (m === 1) { const t = dr; dr = dc; dc = t; } else { const t = dr; dr = -dc; dc = -t; } }
  }
  return { pts, hit: false };
}
function lunaHTML() {
  const night = isNight(), others = S.ruins.lit.filter((l, i) => l && i !== k).length;
  const C = 48; let svg = `<rect x="0" y="0" width="${5 * C}" height="${5 * C}" rx="8" fill="${night ? '#1c2440' : '#6a7488'}"/>`;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) svg += `<rect x="${c * C + 2}" y="${r * C + 2}" width="${C - 4}" height="${C - 4}" rx="4" fill="${night ? '#26304f' : '#7a8498'}"/>`;
  for (const key of MIR_CELLS) {
    const [r, c] = key.split(',').map(Number), x = c * C, y = r * C;
    const l = MIR[key] === 1 ? `M${x + 8} ${y + 8}L${x + C - 8} ${y + C - 8}` : `M${x + C - 8} ${y + 8}L${x + 8} ${y + C - 8}`;
    svg += `<g data-pz="mirror" data-k="${key}" style="cursor:pointer"><rect x="${x + 2}" y="${y + 2}" width="${C - 4}" height="${C - 4}" rx="4" fill="#8e887c"/><path d="${l}" stroke="#e8f0ff" stroke-width="6" stroke-linecap="square"/></g>`;
  }
  let hit = false;
  if (night && others >= 4) {
    const t = traceBeam(); hit = t.hit;
    svg += `<polyline points="${t.pts.map(([x, y]) => `${x * C},${y * C}`).join(' ')}" fill="none" stroke="#cfe0ff" stroke-width="5" opacity=".9"/>`;
  }
  svg += `<circle cx="${BEAM_COL * C + C / 2}" cy="-14" r="11" fill="${night ? '#eef3ff' : '#9aa4b8'}"/>`;
  svg += `<rect x="${5 * C + 4}" y="${TARGET_ROW * C + 6}" width="22" height="${C - 12}" rx="4" fill="#6a645c"/><rect x="${5 * C + 8}" y="${TARGET_ROW * C + 10}" width="14" height="10" fill="${hit ? ORANGE : '#3a342c'}"/>`;
  const msg = others < 4 ? 'La quinta llama solo despierta cuando las otras cuatro arden.' : !night ? 'Ahora el sol es muy fuerte. Vuelve de noche, cuando la luna ilumine los espejos.' : 'Toca los espejos para desviar la luz de la luna hasta el brasero.';
  const wait = others >= 4 && !night ? `<button class="btn main" data-pz="sleep" style="width:100%;margin-top:6px" ${waitingNight() ? 'disabled' : ''}>${waitingNight() ? 'Esperando la noche…' : 'Esperar a la noche'}</button>` : '';
  return `<svg class="pz-svg" viewBox="-6 -30 ${5 * C + 36} ${5 * C + 36}" role="img" aria-label="Espejos de luna de 5 por 5">${svg}</svg><p class="pz-msg">${msg}</p>${wait}`;
}
function lunaCheck() { if (isNight() && S.ruins.lit.filter((l, i) => l && i !== k).length >= 4 && traceBeam().hit) win(); }

/* ---------- common ---------- */
function win() {
  if (solved) return;
  solved = true; rerender();
  const kk = k;
  setTimeout(() => { lightFlame(kk); if (k === kk) { k = -1; closeSheet(); } }, 900);
}

export function openPuzzle(i: number) {
  k = i; solved = false;
  const p = BRAZIERS[i].puzzle;
  if (p === 'runas') runasReset(); else if (p === 'cauce') cauceReset(); else if (p === 'losas') losasReset(); else if (p === 'obeliscos') ob = [0, 0, 0]; else lunaReset();
}
export function closePuzzle() { k = -1; }

export function puzzleHTML() {
  if (k < 0) return '';
  const d = BRAZIERS[k];
  const body = d.puzzle === 'runas' ? runasHTML() : d.puzzle === 'cauce' ? cauceHTML() : d.puzzle === 'losas' ? losasHTML() : d.puzzle === 'obeliscos' ? obHTML() : lunaHTML();
  return `<h2>${d.name}</h2><p>${d.hint}</p><div class="pz${solved ? ' solved' : ''}">${body}</div>${solved ? '<p class="pz-win">¡La llama despierta!</p>' : ''}`;
}
/** Re-render signature: the moon puzzle changes with the time of day. */
export const puzzleSig = () => (k >= 0 && BRAZIERS[k].puzzle === 'luna' ? `luna${isNight()}${waitingNight()}` : '');

export function puzzleClick(t: HTMLElement) {
  const el = t.closest('[data-pz]') as HTMLElement | null; if (!el || solved || k < 0) return false;
  const a = el.dataset.pz;
  if (a === 'listen') runasPlay();
  else if (a === 'rune') runasTap(Number(el.dataset.i));
  else if (a === 'pipe') { const r = Number(el.dataset.r), c = Number(el.dataset.c); grid[r][c] = rot(grid[r][c]); rerender(); if (cauceFlow().solved) win(); }
  else if (a === 'slab') { press(Number(el.dataset.i)); moves++; rerender(); if (slabs.every(Boolean)) win(); }
  else if (a === 'reset') { losasReset(); rerender(); }
  else if (a === 'ob') { const i = Number(el.dataset.i); ob[i] = (ob[i] + 1) % OB_SYMS.length; rerender(); if (ob.every((v, q) => v === OB_ANSWER[q])) win(); }
  else if (a === 'sleep') { waitForNight(); rerender(); }
  else if (a === 'mirror') { const key = el.dataset.k!; MIR[key] = MIR[key] === 1 ? 0 : 1; rerender(); lunaCheck(); }
  return true;
}
