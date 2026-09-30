/* Tiny event bus: game logic announces what happened, the UI listens. */
type Fn = (...a: any[]) => void;
const subs = new Map<string, Fn[]>();
export function on(name: string, fn: Fn) { const l = subs.get(name) || []; l.push(fn); subs.set(name, l); }
export function emit(name: string, ...a: any[]) { for (const fn of subs.get(name) || []) fn(...a); }
