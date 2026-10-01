import * as THREE from 'three';
import { scene } from '../render/renderer';
import { makeCanvas } from '../core/canvas';
import { landTiles, topY, tileAt, type Tile } from '../world/island';
import { rocks } from '../world/rocks';
import { crew, selected, tileOf, type Crew, type JobKind } from '../game/crew';
import { buildings, isDone, place, type Building } from '../game/buildings';
import { ancients, mound } from '../game/grove';
import { slots, center } from '../game/ruins';
import { currentGoal } from '../game/goals';
import { S } from '../game/state';
import { on } from '../core/events';

/* A bouncing arrow over whatever the current goal needs you to tap next: first the figure
   (when one has to be chosen), then the tree, rock, building or ruin. It hides while the
   island is already doing the job, and while a panel is open. */

const tex = new THREE.CanvasTexture(makeCanvas(64, 80, x => {
  // chunky down arrow, pixel style, dark outline
  const px = (c: string, cells: [number, number, number, number][]) => { x.fillStyle = c; for (const [a, b, w, h] of cells) x.fillRect(a * 4, b * 4, w * 4, h * 4); };
  const shape: [number, number, number, number][] = [[5, 1, 6, 9], [1, 10, 14, 2], [2, 12, 12, 2], [3, 14, 10, 2], [4, 16, 8, 1], [5, 17, 6, 1], [6, 18, 4, 1], [7, 19, 2, 1]];
  x.save(); x.translate(0, 0);
  px('#2a1a08', shape.map(([a, b, w, h]) => [a - 1, b - 1, w + 2, h + 2]));
  px('#f2c14e', shape);
  px('#ffe9a8', [[6, 2, 2, 7], [3, 11, 4, 1]]);
  x.restore();
}));
tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
const arrow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, toneMapped: false }));
arrow.scale.set(0.74, 0.92, 1); arrow.renderOrder = 999; arrow.visible = false;
scene.add(arrow);

const at = (t: Tile, dy = 0.9) => new THREE.Vector3(t.wx, topY(t) + dy, t.wz);
const overBuilding = (b: Building) => b.group.position.clone().setY(b.group.position.y + 1.9);
const overFigure = (c: Crew) => c.root.position.clone().setY(c.root.position.y + 2.3);   // above the status bubble
const busy = (...k: JobKind[]) => crew.some(c => c.job && k.includes(c.job.kind));
const done = (type: string) => buildings.find(b => b.type === type && isDone(b));

function nearest(from: Tile | null, list: Tile[]) {
  if (!from || !list.length) return null;
  return list.reduce((a, t) => Math.abs(t.i - from.i) + Math.abs(t.j - from.j) < Math.abs(a.i - from.i) + Math.abs(a.j - from.j) ? t : a);
}
/** Gathering goals: point at the figure first, then at the thing to work on. */
function gather(kinds: JobKind[], who: string, target: () => THREE.Vector3 | null) {
  if (busy(...kinds)) return null;
  const c = crew.find(q => q.id === selected) || null;
  if (!c) { const f = crew.find(q => q.id === who) || crew.find(q => !q.job) || crew[0]; return f ? overFigure(f) : null; }
  return target();
}
const leader = () => crew.find(q => q.id === selected) || crew.find(q => q.id === 'arci') || crew[0];
const idleAt = (b: Building | undefined) => b && !b.jobs?.length ? overBuilding(b) : null;

export function pointerTarget(): THREE.Vector3 | null {
  const g = currentGoal(); if (!g) return null;
  const here = leader() ? tileOf(leader()!) : null;
  switch (g.id) {
    case 'talar': case 'madera10':
      return gather(['tree'], 'arci', () => { const t = nearest(here, landTiles().filter(t => t.tree && !t.tree.falling)); return t ? at(t, 2.3) : null; });
    case 'piedra':
      return gather(['rock'], 'arci', () => { const r = nearest(here, rocks.map(m => m.userData.tile as Tile).filter(Boolean)); return r ? at(r, 1.4) : null; });
    case 'arena':
      return gather(['sand'], 'arci', () => { const t = nearest(here, landTiles().filter(t => t.type === 'arena' && !t.building && !t.ruin)); return t ? at(t, 0.9) : null; });
    case 'lingotes': return idleAt(done('horno'));
    case 'hacha': return !S.tools.hacha && done('casa') ? overBuilding(done('casa')!) : null;
    case 'claro': return mound ? at(mound.tile, 1.2) : null;
    case 'despejar': {
      const a = ancients.filter(a => !a.falling && a.hp > 0).map(a => a.tile);
      return gather(['ancient'], 'arci', () => { const t = nearest(here, a); return t ? at(t, 3.2) : null; });
    }
    case 'desenterrar': return mound ? gather(['dig'], 'arci', () => at(mound!.tile, 1.2)) : null;
    case 'braseros': { const t = slots.find(t => !t.building); return t ? at(t, 1.6) : null; }
    case 'llamas': { const k = slots.findIndex((t, i) => t.building && isDone(t.building) && !S.ruins.lit[i]); return k >= 0 ? overBuilding(slots[k].building!) : null; }
    case 'brasa': return center ? at(center, 2.4) : null;
    case 'tablas': return idleAt(done('aserradero'));
    case 'ladrillos': case 'vidrio': return idleAt(done('horno'));
    case 'avivar': {
      if (busy('avivar')) return null;
      const b = crew.find(q => q.id === 'brasa'); const h = done('horno');
      if (!b || !h) return null;
      return selected === 'brasa' ? overBuilding(h) : overFigure(b);
    }
    case 'inventos': case 'linterna': { const t = done('taller'); return t && !t.jobs?.some(j => j.startsWith('inv:')) ? overBuilding(t) : null; }
    case 'botellas': { const it = S.beach.items[0]; const t = it && tileAt(it.i, it.j); return t ? at(t, 1.1) : null; }
  }
  return null;
}

let acc = 0, goal: THREE.Vector3 | null = null;
on('changed', () => { acc = 0; });   // a tap or a finished job: look again right away
export function tickPointer(dt: number, T: number, uiOpen: boolean) {
  acc = Math.min(acc, 0.3) - dt;
  if (acc <= 0) { acc = 0.3; goal = place || uiOpen ? null : pointerTarget(); }   // the search runs a few times per second
  arrow.visible = !!goal;
  if (!goal) return;
  arrow.position.set(goal.x, goal.y + Math.abs(Math.sin(T * 3.4)) * 0.28, goal.z);
}
