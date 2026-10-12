import HONDO from '../data/hondo.json';

/* The Depths (v0.22): floors under the volcano cave that change on every visit, like the mines of
   the farming games. Each floor is drawn here as the same map of characters the hand-made floors
   use, so the cave engine walks, lights and solves it without knowing it was generated.

   A floor is a few rooms joined by one-cell corridors (a tree, so some corridor cells are the only
   way through). On the way from the stairs up (S) to the stairs down (>) one of those cells holds
   a pass only one figure opens: vines (Musgo), embers (Brasa), water (Marea), a pit and a boulder
   (Arci)… A small room hangs off the side behind another pass, with a chest. Veins of copper,
   quartz crystals and, from the third floor down, blue clay grow against the walls. Floor 5 is the
   camp of the Alfareros (a rope goes up from there to floor 1); floor 10 is drawn by hand: the
   sealed door of the Alfareros. */

export const DEPTHS = 10, CAMP = 4, DOOR = 9;
export interface DepthFloor {
  name: string; intro: string; door: string; map: string[]; theme: 'cueva';
  decor: { mushrooms: number[][]; stalagmites: number[][] };
  lore: string; chest: { gives: Record<string, number>; stars: number };
  chestAt: Record<string, { gives: Record<string, number>; stars: number }>;
  loreAt: Record<string, { title: string; text: string }>;
  marks?: Record<string, string>;
  deep: number;            // 0..9: how deep (the rock gets colder and bluer)
}

/** A small seeded random generator (the same seed always draws the same floor). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
type Room = { x: number; z: number; w: number; h: number };
const K = (x: number, z: number) => `${x},${z}`;
const D4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Things one figure opens (the rest of the team waits or follows). 'OB' = a pit and the boulder that fills it. */
const PASSES = ['V', 'b', 'w', 'x', 'l', 'h', '=', 'OB'] as const;
const ITEMS = 'MCaoNKLtu*';
const PASSABLE = new Set(['.', ',', 'S', '>', 'V', 'b', 'w', 'x', 'l', 'h', '=', 'O', 'B', 'X', 'f']);

/** What a chest holds at this depth. */
function loot(d: number, big: boolean) {
  const g: Record<string, number> = { cuarzo: 2 + Math.floor(d / 2), cobre: 1 + Math.floor(d / 2), mineral: 3, carbon: 2 };
  if (d >= 3) g.arcilla = 1 + Math.floor(d / 3);
  if (d >= 5) g.obsidiana = 2;
  if (big) for (const k of Object.keys(g)) g[k] = Math.ceil(g[k] * 1.8);
  return g;
}

export function genDepth(seed: number, n: number, rope: boolean): DepthFloor {
  if (n === DOOR) {
    const d = HONDO.door as unknown as DepthFloor;
    return { ...d, chestAt: {}, deep: n } as DepthFloor;
  }
  for (let tries = 0; tries < 40; tries++) {
    const f = attempt(seed * 31 + n * 977 + tries * 7919, n, rope);
    if (f) return f;
  }
  return fallback(n);
}

function attempt(seed: number, n: number, rope: boolean): DepthFloor | null {
  const R = rng(seed), ri = (a: number, b: number) => a + Math.floor(R() * (b - a + 1)), pickOf = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)];
  const d = n + 1, camp = n === CAMP;
  const W = 21 + 2 * ri(0, 2), H = 17 + 2 * ri(0, 1);
  const g: string[][] = Array.from({ length: H }, () => Array(W).fill('#'));
  const at = (x: number, z: number) => (g[z] && g[z][x]) || '#';
  const set = (x: number, z: number, c: string) => { if (x > 0 && z > 0 && x < W - 1 && z < H - 1) g[z][x] = c; };

  /* rooms, none touching another */
  const rooms: Room[] = [];
  const want = 5 + ri(0, 2);
  for (let k = 0; k < 300 && rooms.length < want; k++) {
    const big = camp && rooms.length === 0;
    const w = big ? ri(5, 6) : ri(3, 6), h = big ? ri(4, 5) : ri(3, 5);
    const x = ri(1, W - w - 2), z = ri(1, H - h - 2);
    if (rooms.some(r => x < r.x + r.w + 1 && x + w + 1 > r.x && z < r.z + r.h + 1 && z + h + 1 > r.z)) continue;
    rooms.push({ x, z, w, h });
  }
  if (rooms.length < 4) return null;
  // the first room is the lowest one on screen (the stairs up are there)
  rooms.sort((a, b) => (b.z + b.h) - (a.z + a.h));
  const inRoom = (x: number, z: number) => rooms.findIndex(r => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h);
  for (const r of rooms) for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) g[z][x] = '.';

  /* corridors: each room joins the nearest one already joined (a tree: no loops) */
  const cen = (r: Room): [number, number] => [r.x + Math.floor(r.w / 2), r.z + Math.floor(r.h / 2)];
  const joined = [0];
  const carve = (x: number, z: number) => { if (at(x, z) === '#') set(x, z, '.'); };
  while (joined.length < rooms.length) {
    let best: [number, number, number] | null = null;
    for (let i = 0; i < rooms.length; i++) {
      if (joined.includes(i)) continue;
      for (const j of joined) { const [ax, az] = cen(rooms[i]), [bx, bz] = cen(rooms[j]); const dd = Math.abs(ax - bx) + Math.abs(az - bz); if (!best || dd < best[2]) best = [i, j, dd]; }
    }
    const [i, j] = best!, [ax, az] = cen(rooms[i]), [bx, bz] = cen(rooms[j]);
    if (R() < 0.5) { for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) carve(x, az); for (let z = Math.min(az, bz); z <= Math.max(az, bz); z++) carve(bx, z); }
    else { for (let z = Math.min(az, bz); z <= Math.max(az, bz); z++) carve(ax, z); for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) carve(x, bz); }
    joined.push(i);
  }

  /* stairs up at the bottom of the first room; the cell above stays free */
  const r0 = rooms[0];
  const sx = r0.x + Math.floor(r0.w / 2), sz = r0.z + r0.h - 1;
  g[sz][sx] = 'S';
  const reserved = new Set([K(sx, sz), K(sx, sz - 1)]);
  const bfs = (from: [number, number], pass: (c: string) => boolean) => {
    const dist = new Map<string, number>([[K(...from), 0]]), prev = new Map<string, string>(), q = [from];
    while (q.length) { const [x, z] = q.shift()!; for (const [a, b] of D4) { const k = K(x + a, z + b); if (dist.has(k) || !pass(at(x + a, z + b))) continue; dist.set(k, dist.get(K(x, z))! + 1); prev.set(k, K(x, z)); q.push([x + a, z + b]); } }
    return { dist, prev };
  };
  const open = (c: string) => PASSABLE.has(c);
  /* stairs down: in the room farthest from the start, on its top row (the cell below stays free) */
  const { dist } = bfs([sx, sz], open);
  let far = 1, fd = -1;
  rooms.forEach((r, i) => { if (i === 0) return; const dd = dist.get(K(...cen(r))) ?? -1; if (dd > fd) { fd = dd; far = i; } });
  const rf = rooms[far];
  if (rf.h < 2) return null;
  const gx = rf.x + ri(0, rf.w - 1), gz = rf.z;
  g[gz][gx] = '>'; reserved.add(K(gx, gz)); reserved.add(K(gx, gz + 1));

  /* the path between them, and a pass on one of its corridor cells that is the only way through */
  const walk = bfs([sx, sz], open);
  const path: [number, number][] = [];
  for (let k: string | undefined = K(gx, gz); k; k = walk.prev.get(k)) path.unshift(k.split(',').map(Number) as [number, number]);
  if (path.length < 6) return null;
  const choke = (x: number, z: number) => { const old = g[z][x]; g[z][x] = '#'; const ok = !bfs([sx, sz], open).dist.has(K(gx, gz)); g[z][x] = old; return ok; };
  const order = [...PASSES].sort(() => R() - 0.5);
  let gate = order[n % order.length] as string;
  const lo = Math.floor(path.length * 0.3), hi = Math.floor(path.length * 0.8);
  const cands: number[] = [];
  for (let i = Math.max(2, lo); i <= hi && i < path.length - 2; i++) { const [x, z] = path[i]; if (inRoom(x, z) < 0 && choke(x, z)) cands.push(i); }
  if (!cands.length) return null;
  let gi = pickOf(cands);
  if (gate === 'OB') {
    // a boulder in a straight corridor, one cell before a pit: Arci pushes it in from behind
    const ok = cands.filter(i => { const [a, b, c] = [path[i - 2], path[i - 1], path[i]]; return a[0] - b[0] === b[0] - c[0] && a[1] - b[1] === b[1] - c[1] && at(...a) === '.' && at(...b) === '.' && !reserved.has(K(...a)) && !reserved.has(K(...b)); });
    if (ok.length) { gi = pickOf(ok); const [b, c] = [path[gi - 1], path[gi]]; set(c[0], c[1], 'O'); set(b[0], b[1], 'B'); reserved.add(K(...path[gi - 2])); }
    else gate = 'V';
  }
  if (gate !== 'OB') set(path[gi][0], path[gi][1], gate);
  for (const p of path) reserved.add(K(...p));

  /* a hidden room off the side, behind another pass, with a chest */
  const chestAt: DepthFloor['chestAt'] = {};
  const side: string[] = [...PASSES.filter(p => p !== gate && p !== 'OB'), 'X'];
  for (let k = 0; k < 40; k++) {
    const r = rooms[ri(0, rooms.length - 1)], dir = D4[ri(0, 3)], len = ri(1, 3);
    // the corridor leaves from the middle of one wall of the room
    const ex = dir[0] ? (dir[0] > 0 ? r.x + r.w : r.x - 1) : r.x + Math.floor(r.w / 2), ez = dir[1] ? (dir[1] > 0 ? r.z + r.h : r.z - 1) : r.z + Math.floor(r.h / 2);
    const cells: [number, number][] = []; for (let s = 0; s < len; s++) cells.push([ex + dir[0] * s, ez + dir[1] * s]);
    const [lx, lz] = cells[cells.length - 1], ccx = lx + dir[0] * 2, ccz = lz + dir[1] * 2;   // the centre of a 3×3 room after the corridor
    const box: [number, number][] = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) box.push([ccx + a, ccz + b]);
    const all = [...cells, ...box];
    if (all.some(([x, z]) => x < 2 || z < 2 || x > W - 3 || z > H - 3 || at(x, z) !== '#')) continue;
    // nothing open around it except where the corridor meets the room
    const mine = new Set(all.map(p => K(...p)));
    const touches = all.some(([x, z]) => D4.some(([a, b]) => { const q = K(x + a, z + b); if (mine.has(q)) return false; if (x === cells[0][0] && z === cells[0][1] && x + a === cells[0][0] - dir[0] && z + b === cells[0][1] - dir[1]) return false; return at(x + a, z + b) !== '#'; }))
      || box.some(([x, z]) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].some(([a, b]) => !mine.has(K(x + a, z + b)) && at(x + a, z + b) !== '#'));
    if (touches) continue;
    for (const [x, z] of all) g[z][x] = '.';
    const kind = pickOf(side);
    set(cells[0][0], cells[0][1], kind === 'OB' ? 'V' : kind);
    g[ccz][ccx] = 'K'; chestAt[K(ccx, ccz)] = { gives: loot(d, true), stars: 1 };
    if (R() < 0.6) { const [x, z] = box[pickOf([0, 2, 6, 8])]; g[z][x] = d >= 3 && R() < 0.5 ? 'a' : 'C'; }
    for (const p of all) reserved.add(K(...p));
    break;
  }

  /* things against the walls of the rooms (checked one by one so nothing ever closes a way) */
  const reachCount = () => {
    // how many cells the team can stand on; -1 when some chest, vein or tablet has no free side left
    const seen = bfs([sx, sz], open).dist;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (ITEMS.includes(g[z][x]) && !D4.some(([a, b]) => seen.has(K(x + a, z + b)))) return -1;
    return seen.size;
  };
  let base = reachCount();
  const spots = () => { const out: [number, number][] = []; rooms.forEach(r => { for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) if (at(x, z) === '.' && !reserved.has(K(x, z)) && D4.some(([a, b]) => at(x + a, z + b) === '#')) out.push([x, z]); }); return out; };
  const put = (c: string, count: number) => {
    let placed = 0;
    for (let k = 0; k < count * 8 && placed < count; k++) {
      const s = spots(); if (!s.length) return placed;
      const [x, z] = pickOf(s); g[z][x] = c;
      const now = reachCount();
      if (now === base - 1 && !D4.every(([a, b]) => !open(at(x + a, z + b)))) { base = now; placed++; reserved.add(K(x, z)); }
      else g[z][x] = '.';
    }
    return placed;
  };
  const loreAt: DepthFloor['loreAt'] = {};
  if (camp) {
    // the camp: an old fire, the diary of the Alfareros and the rope that goes up
    put('t', 1); put('u', 1);
    const s = spots().filter(([x, z]) => inRoom(x, z) === 0);
    if (s.length) { const [x, z] = pickOf(s); g[z][x] = 'L'; if (reachCount() === base - 1) { base--; reserved.add(K(x, z)); loreAt[K(x, z)] = { title: 'Diario del campamento', text: HONDO.campDiario }; } else g[z][x] = '.'; }
  } else if (n === 0 && rope) {
    // the rope from the camp hangs next to the stairs
    const near = [[sx - 1, sz], [sx + 1, sz], [sx - 1, sz - 1], [sx + 1, sz - 1]].filter(([x, z]) => at(x, z) === '.');
    for (const [x, z] of near) { g[z][x] = 'u'; if (reachCount() === base - 1) { base--; reserved.add(K(x, z)); break; } g[z][x] = '.'; }
  }
  put('M', 2 + ri(0, 1));
  put('C', 1 + ri(0, 1));
  if (d >= 3) put('a', 2 + ri(0, 1));
  if (d >= 5) put('o', 1 + ri(0, 1));
  if (d >= 2 && R() < 0.65) put('N', 1);
  if (R() < 0.5) { const n2 = put('K', 1); if (n2) { const ks = Object.keys(chestAt); for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (g[z][x] === 'K' && !ks.includes(K(x, z))) chestAt[K(x, z)] = { gives: loot(d, false), stars: 0 }; } }
  if (!camp && R() < 0.45) {
    const before = new Set(Object.keys(loreAt));
    if (put('L', 1)) for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (g[z][x] === 'L' && !before.has(K(x, z))) loreAt[K(x, z)] = { title: 'Nota de un Alfarero', text: pickOf(HONDO.notes) };
  }
  put('*', ri(1, 3));

  /* pools of water in some room (only Marea wades in; sometimes a chest sits in the middle) */
  if (R() < 0.45) {
    for (let k = 0; k < 20; k++) {
      const r = rooms[ri(1, rooms.length - 1)]; if (r.w < 4 || r.h < 4) continue;
      const x0 = r.x + ri(0, r.w - 3), z0 = r.z + ri(0, r.h - 3);
      const box: [number, number][] = []; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) box.push([x0 + a, z0 + b]);
      if (box.some(([x, z]) => at(x, z) !== '.' || reserved.has(K(x, z)))) continue;
      const old = box.map(([x, z]) => g[z][x]);
      for (const [x, z] of box) g[z][x] = 'w';
      const withChest = R() < 0.5; if (withChest) g[z0 + 1][x0 + 1] = 'K';
      const now = reachCount();
      // the pool cells still count as reachable (Marea wades); a chest in the middle is one less
      if (now !== base - (withChest ? 1 : 0)) { box.forEach(([x, z], i) => { g[z][x] = old[i]; }); continue; }
      base = now; box.forEach(p => reserved.add(K(...p)));
      if (withChest) chestAt[K(x0 + 1, z0 + 1)] = { gives: loot(d, false), stars: 1 };
      break;
    }
  }
  /* a patch of tall grass or of moss: Musgo finds things in the grass */
  for (let k = 0; k < 2; k++) {
    const r = rooms[ri(0, rooms.length - 1)];
    for (let q = 0; q < 6; q++) { const x = r.x + ri(0, r.w - 1), z = r.z + ri(0, r.h - 1); if (at(x, z) !== '.' || reserved.has(K(x, z))) continue; g[z][x] = k === 0 && d % 2 === 0 ? 'h' : ','; }
  }

  /* decoration that does not block: glowing mushrooms */
  const floorCells: [number, number][] = []; for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if ('.,'.includes(g[z][x])) floorCells.push([x, z]);
  const mushrooms: number[][] = []; for (let k = 0; k < 8 + ri(0, 6) && floorCells.length; k++) mushrooms.push(pickOf(floorCells));

  const band = d <= 3 ? HONDO.names.top : d <= 6 ? HONDO.names.mid : HONDO.names.deep;
  const name = camp ? HONDO.names.camp : pickOf(band);
  // the chest in the middle of the floor is drawn from chestAt; this is only the fallback
  return { name, intro: '', door: '', theme: 'cueva', map: g.map(r => r.join('')), decor: { mushrooms, stalagmites: [] }, lore: '', chest: { gives: loot(d, false), stars: 0 }, chestAt, loreAt, deep: n };
}

/** If every try failed (it should not), a plain floor: one long room and the stairs. */
function fallback(n: number): DepthFloor {
  const rows = ['#####################', '#.........>.........#', '#...................#', '#...M.......C.......#', '#...................#', '#.........S.........#', '#####################'];
  return { name: 'Un túnel', intro: '', door: '', theme: 'cueva', map: rows, decor: { mushrooms: [], stalagmites: [] }, lore: '', chest: { gives: loot(n + 1, false), stars: 0 }, chestAt: {}, loreAt: {}, deep: n };
}
