import { DATA, setCapFn, type ResKey } from './state';
import { levelOf } from './buildings';

/* Storage limits. Without an almacén, 40 of each island material and 15 of each refined one
   fit; each almacén level raises both, and the house at level 2 adds a little more. */

export const REFINED: ResKey[] = ['lingote', 'tablas', 'ladrillo', 'vidrio', 'carbon', 'semilla'] as ResKey[];
const C = DATA.BALANCE.caps as { base: [number, number]; almacen: [number, number][]; casa2: [number, number] };

/** [island materials, refined materials] that fit right now. */
export function caps(): [number, number] {
  const a = levelOf('almacen');
  let [raw, ref] = a ? C.almacen[Math.min(a, C.almacen.length) - 1] : C.base;
  if (levelOf('casa') >= 2) { raw += C.casa2[0]; ref += C.casa2[1]; }
  return [raw, ref];
}
export const capFor = (k: ResKey) => caps()[REFINED.includes(k) ? 1 : 0];
setCapFn(capFor);
