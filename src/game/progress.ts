import { on, emit } from '../core/events';
import { S, DATA } from './state';

/* Progress that spans the whole game:
   - stats: counters of what the player has done (trees felled, nights, requests…)
   - stars: earned from chapters, requests and achievements; they set the island level
   - island level: each level unlocks something (a decoration, a board slot, faster work)
   - achievements: bronze / silver / gold thresholds on a stat */

export interface Level { stars: number; text: string; unlock?: string[]; slots?: number; speed?: number }
export interface Achievement { id: string; name: string; desc: string; stat: string; tiers: number[] }
export const LEVELS = DATA.LEVELS as Level[];
export const ACHIEVEMENTS = DATA.ACHIEVEMENTS as Achievement[];
export const TIER_NAMES = ['bronce', 'plata', 'oro'];

/* ---------- stats ---------- */
export function bump(key: string, n = 1) { S.stats[key] = (S.stats[key] || 0) + n; emit('statChanged', key); }
/** Current value of a stat, including the ones kept elsewhere in the state. */
export function stat(key: string): number {
  switch (key) {
    case 'piedra': case 'arena': case 'madera': case 'tierra': case 'mineral': return S.got[key as 'piedra'] || 0;
    case 'lingotes': return S.made;
    case 'parcelas': return S.expanded.length;
    case 'senderos': return S.paths.length;
    default: return S.stats[key] || 0;
  }
}

/* ---------- stars and island level ---------- */
export function levelOf(stars = S.stars) { let l = 0; while (l + 1 < LEVELS.length && stars >= LEVELS[l + 1].stars) l++; return l + 1; }
export const islandLevel = () => levelOf();
export function levelProgress() {
  const l = islandLevel(), cur = LEVELS[l - 1].stars, next = LEVELS[l]?.stars;
  return { level: l, stars: S.stars, from: cur, to: next ?? null, k: next ? (S.stars - cur) / (next - cur) : 1 };
}
export function addStars(n: number, why: string) {
  if (n <= 0) return;
  const before = islandLevel();
  S.stars += n;
  emit('toast', `+${n} ★ · ${why}`);
  const after = islandLevel();
  for (let l = before + 1; l <= after; l++) emit('levelUp', l, LEVELS[l - 1]);
  emit('changed');
}
/** Everything unlocked up to the current level. */
export const unlocked = (building: string) => {
  const need = (DATA.BUILDINGS as any)[building]?.level || 1;
  return islandLevel() >= need;
};
export const boardSlots = () => 3 + LEVELS.slice(0, islandLevel()).reduce((a, l) => a + (l.slots || 0), 0);
export const workSpeed = () => 1 + LEVELS.slice(0, islandLevel()).reduce((a, l) => a + (l.speed || 0), 0);

/* ---------- achievements ---------- */
export function checkAchievements(quiet = false) {
  for (const a of ACHIEVEMENTS) {
    const v = stat(a.stat); let t = S.ach[a.id] || 0;
    while (t < a.tiers.length && v >= a.tiers[t]) {
      t++; S.ach[a.id] = t;
      if (!quiet) { emit('achievement', a, t); addStars(t, `Logro ${a.name} (${TIER_NAMES[t - 1]})`); }
      else S.stars += t;
    }
  }
}
/** Achievements close to their next tier and not yet seen: used to hint the player. */
export const achProgress = (a: Achievement) => {
  const t = S.ach[a.id] || 0, v = stat(a.stat);
  return { tier: t, value: v, next: a.tiers[t] ?? null, prev: t ? a.tiers[t - 1] : 0 };
};

/* ---------- counters fed by game events ---------- */
export function initProgress() {
  on('treeFelled', () => bump('talados'));
  on('planted', () => bump('plantados'));
  on('obraDone', (deco: boolean) => { bump('obras'); if (deco) bump('adornos'); });
  on('nightChanged', (night: boolean) => { if (night) bump('noches'); });
  let t: any = 0;
  on('changed', () => { clearTimeout(t); t = setTimeout(() => checkAchievements(), 300); });
  on('statChanged', () => { clearTimeout(t); t = setTimeout(() => checkAchievements(), 300); });
}
