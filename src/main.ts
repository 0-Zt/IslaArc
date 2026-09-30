import './style.css';
import { on } from './core/events';
import {
  renderer, scene, camera, controls, resize, render, placeSun, applyTime, adaptResolution, waterTex, pixelRatio,
} from './render/renderer';
import { N, generate, buildTerrain, rebuildDeco, worldGroup, tileAt, landTiles, walkable, grove, terrainDrawCalls, type Tile } from './world/island';
import { plantIsland, clearTrees, tickTrees, tickLeaves, treeDrawCalls, trees } from './world/trees';
import { placeRocks, tickRocks, rocks } from './world/rocks';
import { tickParticles } from './world/particles';
import { S, setState, freshState, loadSave, save, hasSave, clearSave, DATA } from './game/state';
import { crew, spawnCrew, clearCrew, updateCrew, bfs, occupied, order } from './game/crew';
import { buildings, createBuilding, clearBuildings, tickBuildings, cancelPlace, saved, startPlace, movePlace, confirmPlace, smelt, footprint, footprintValid } from './game/buildings';
import { spawnGrove, tickGrove, ancients, mound } from './game/grove';
import { onTreeFallen, tickForest, clearForest, setOccupiedTest } from './game/forest';
import { checkGoals } from './game/goals';
import { $, initHUD, refreshHUD } from './ui/hud';
import { initSheets, initSheetEvents, refreshSheet, closeSheet } from './ui/sheets';
import { initInput, centreTile, tickMarker } from './ui/input';

const SEED = 4242;
$('scene').appendChild(renderer.domElement);
renderer.info.autoReset = false;
setOccupiedTest(occupied);

function newGame(state: typeof S | null) {
  cancelPlace(); closeSheet();
  clearCrew(); clearBuildings(); clearForest();
  while (worldGroup.children.length) worldGroup.remove(worldGroup.children[0]);
  clearTrees();
  setState(state || freshState());
  generate(SEED);
  plantIsland(SEED);
  spawnGrove();
  placeRocks(SEED);
  buildTerrain();
  for (const b of S.buildings) createBuilding(b.type, b.i, b.j, b.rot, false, b);
  rebuildDeco();
  // start near the centre, on open flat ground
  const c0 = tileAt(Math.floor(N / 2), Math.floor(N / 2)) || landTiles()[0];
  const good = (t: Tile) => walkable(t) && t.type !== 'arena' && t.h === 1 && [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => walkable(tileAt(t.i + a, t.j + b))).length >= 3;
  const path = bfs(c0, good);
  const start = path === null ? landTiles().find(walkable)! : path.length ? path[path.length - 1] : c0;
  spawnCrew('arci', start);
  if (S.flags.musgoFree && grove) spawnCrew('musgo', grove.center);
  controls.target.set(start.wx, 0.5, start.wz);
  camera.position.set(start.wx + 18, 18, start.wz + 18);
  camera.zoom = innerWidth < innerHeight ? 0.85 : 1.35;
  camera.updateProjectionMatrix(); controls.update(); placeSun();
  refreshHUD();
}

let running = false;
function startGame(state: typeof S | null) {
  newGame(state); $('title').hidden = true; running = true; persist();
}
const persist = () => save(saved());

initHUD(); initSheetEvents(); initInput();
initSheets({ centreTile, onReset: () => { clearSave(); newGame(null); persist(); } });
on('built', () => persist());
on('goalAdvanced', () => persist());

$('tContinue').hidden = !hasSave();
$('tContinue').addEventListener('click', () => startGame(loadSave()));
$('tNew').addEventListener('click', () => { clearSave(); startGame(null); });

resize(); addEventListener('resize', resize);
applyTime('manana');
newGame(loadSave());

/* keep the camera over the island */
function clampCamera() {
  const t = controls.target, lim = N / 2 - 1;
  const cx = Math.max(-lim, Math.min(lim, t.x)), cz = Math.max(-lim, Math.min(lim, t.z));
  if (cx !== t.x || cz !== t.z) { camera.position.x += cx - t.x; camera.position.z += cz - t.z; t.x = cx; t.z = cz; }
}

let T = 0, last = performance.now(), saveAcc = 0, uiAcc = 0, sunAcc = 0;
function frame(now: number) {
  const raw = Math.min(0.25, (now - last) / 1000); last = now;
  const dt = Math.min(0.05, raw); T += dt;
  if (running) { S.time += dt; saveAcc += dt; if (saveAcc > DATA.BALANCE.saveEverySeconds) { saveAcc = 0; persist(); } }
  updateCrew(dt, T);
  tickTrees(dt, T, t => onTreeFallen(t, T));
  tickForest(T);
  tickGrove(dt, T);
  tickRocks(dt, T);
  tickBuildings(dt);
  tickParticles(dt);
  tickLeaves(dt);
  tickMarker(dt);
  uiAcc += dt; if (uiAcc > 0.25) { refreshHUD(uiAcc); refreshSheet(); uiAcc = 0; }
  waterTex.offset.x = (T * 0.012) % 1; waterTex.offset.y = Math.sin(T * 0.4) * 0.01;
  controls.update(); clampCamera();
  sunAcc += dt; if (sunAcc > 0.5) { sunAcc = 0; placeSun(); }
  adaptResolution(raw); // resizing clears the canvas, so it must happen before drawing
  renderer.info.reset(); render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* debug hook for automated checks: open with #debug */
if (location.hash === '#debug') {
  (window as any).__isla = {
    get S() { return S; }, crew, buildings, trees, rocks, ancients, get mound() { return mound; }, grove: () => grove,
    renderer, camera, controls, order, tileAt, landTiles, checkGoals, pixelRatio,
    drawCalls: () => ({ terrain: terrainDrawCalls(), trees: treeDrawCalls(), frame: renderer.info.render.calls }),
    step: (n: number) => { for (let k = 0; k < n; k++) { T += 0.05; S.time += 0.05; updateCrew(0.05, T); tickTrees(0.05, T, t => onTreeFallen(t, T)); tickForest(T); tickGrove(0.05, T); tickRocks(0.05, T); tickBuildings(0.05); tickParticles(0.05); tickLeaves(0.05); } refreshHUD(); },
    screen: (x: number, y: number, z: number) => { const v = camera.position.clone().set(x, y, z).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; },
    scene, startPlace, movePlace, confirmPlace, smelt, footprint, footprintValid,
  };
}
