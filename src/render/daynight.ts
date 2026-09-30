import { applyBlend, applyTime, gfx, type TimeKey } from './renderer';
import { S, DATA } from '../game/state';
import { emit } from '../core/events';

/* The day turns on its own: morning → noon → sunset → night → dawn.
   S.clock is the fraction of the current day (0..1) and is saved with the game. */

const KEYS: [number, TimeKey][] = [
  [0.0, 'manana'], [0.2, 'mediodia'], [0.44, 'mediodia'], [0.56, 'atardecer'],
  [0.64, 'noche'], [0.9, 'noche'], [1.0, 'manana'],
];
export let nightK = 0;           // 0 by day, 1 in full night
export let lampK = 0;            // lanterns: they come on during the sunset, full at night
let acc = 1, wasNight = false;

export const phaseName = (f = S.clock) => f < 0.16 ? 'Mañana' : f < 0.46 ? 'Mediodía' : f < 0.6 ? 'Atardecer' : f < 0.92 ? 'Noche' : 'Amanecer';
export const isNight = () => nightK > 0.5;
/** Minutes of play until the next night begins. */
export function minutesToNight() {
  const f = S.clock, start = 0.62;
  const left = f < start ? start - f : 1 - f + start;
  return left * DATA.BALANCE.dayMinutes;
}

function applyClock(f: number) {
  let k = 0; while (k < KEYS.length - 2 && f > KEYS[k + 1][0]) k++;
  const [fa, a] = KEYS[k], [fb, b] = KEYS[k + 1];
  const t = fb > fa ? (f - fa) / (fb - fa) : 0, e = t * t * (3 - 2 * t);
  // the sun crosses the sky by day; the moon takes a lower arc by night
  const az = f < 0.62 ? 80 - 190 * (f / 0.62) : 70 - 100 * ((f - 0.62) / 0.38);
  applyBlend(a, b, e, az);
  nightK = (a === 'noche' ? 1 - e : 0) + (b === 'noche' ? e : 0);
  if (a === 'noche' && b === 'noche') nightK = 1;
  const dusk = (a === 'atardecer' ? 1 - e : 0) + (b === 'atardecer' ? e : 0);
  lampK = Math.min(1, nightK + dusk * 0.55);
}

export function tickDay(dt: number) {
  if (!gfx.daycycle) { if (nightK !== 0 || acc >= 0) { nightK = 0; lampK = 0; applyTime('manana'); acc = -1; } return; }
  S.clock = (S.clock + dt / (DATA.BALANCE.dayMinutes * 60)) % 1;
  acc += dt;
  if (acc < 0.2) return;
  acc = 0;
  applyClock(S.clock);
  const night = nightK > 0.5;
  if (night !== wasNight) { wasNight = night; emit('nightChanged', night); if (night) emit('toast', 'Cae la noche'); }
}
/** Forces a redraw of the lighting right away (after loading a game or changing the setting). */
export function refreshDay() { acc = 1; wasNight = S.clock > 0.6 && S.clock < 0.92; if (gfx.daycycle) applyClock(S.clock); else { nightK = 0; lampK = 0; applyTime('manana'); } }
