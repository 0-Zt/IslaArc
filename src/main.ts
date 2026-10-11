import './style.css';
import { on } from './core/events';
import {
  renderer, scene, camera, controls, resize, render, flyTo, cancelFly, lockPixelRatio, benchRender, setGfx, sun, placeSun, applyTime, adaptResolution, tickShadows, pixelRatio, focusOn, gfx, tickFly,
} from './render/renderer';
import { N, setMap, generate, buildTerrain, rebuildDeco, worldGroup, tileAt, tileUnder, landTiles, walkable, grove, terrainDrawCalls, type Tile } from './world/island';
import { plantIsland, clearTrees, tickTrees, tickLeaves, treeDrawCalls, trees } from './world/trees';
import { placeRocks, tickRocks, rocks } from './world/rocks';
import { tickParticles } from './world/particles';
import { updateWater, tickWater } from './world/water';
import { buildIslet, spawnRuins, clearRuins, tickRuins, prepareBrazier, fixBrazierModels, brasaSpot, checkReach, rebuildBrazier, lightFlame, center as ruinCenter, slots as ruinSlots } from './game/ruins';
import { buildHit , startUpgrade, levelOf } from './game/buildings';
import { openFlame, openSheet } from './ui/sheets';
import { unlockAudio, setSound, sfx, tickAmbience } from './audio/sfx';
import { nightK } from './render/daynight';
import { tickDay, refreshDay, phaseName, minutesToNight, isNight, waitForNight, waitingNight } from './render/daynight';
import { S, setState, freshState, loadSave, save, hasSave, clearSave, DATA } from './game/state';
import { crew, spawnCrew, clearCrew, updateCrew, bfs, occupied, order, selected, select, cheer } from './game/crew';
import * as THREE from 'three';
import { buildings, createBuilding, clearBuildings, tickBuildings, cancelPlace, saved, startPlace, movePlace, confirmPlace, smelt, footprint, footprintValid, place } from './game/buildings';
import { spawnGrove, tickGrove, ancients, mound } from './game/grove';
import { onTreeFallen, tickForest, clearForest, setOccupiedTest, restoreForest, markForestZone, buildForestEdge, forestStats, growing } from './game/forest';
import { restorePaths, restoreMarks, clearMarks, exitMarkMode, marks } from './game/marks';
import { restoreExpansions, restoreSites, clearSites, exitExpandMode, pulseMarkers, sites, startSite } from './game/expansion';
import { startInvention } from './game/production';
import { checkGoals } from './game/goals';
import { initProgress, checkAchievements } from './game/progress';
import { fillBoard } from './game/board';
import { restoreBeach, clearBeach, tickBeach } from './game/beach';
import { $, initHUD, refreshHUD, toast } from './ui/hud';
import { initSheets, initSheetEvents, refreshSheet, closeSheet, openMessage, sheetOpen, openStory } from './ui/sheets';
import { tickRaft, clearRaft, sailingActive, startSailing, fishHere, goBack, sailState, sailTap, blowShell } from './game/raft';
import { battleState, battleChoose } from './game/battle';
import { tickSea, DEEP } from './world/sea';
import { tickFishing, clearFishing, startFishing, stopFishing, castAt, fishState, useBait, shadows as fishShadows, bestShadow } from './game/fishing';
import { initInput, centreTile, tickMarker, onTap, debugPick } from './ui/input';
import { tickLabels, clearLabels } from './ui/labels';
import { tickPointer, pointerTarget } from './ui/pointer';
import './game/economy';
import { capOf } from './game/state';
import { tickCave, caveActive, enterCave, exitCave, caveAct, caveState, caveDebugFloor, switchLeader, tapCell, caveStepDir, caveFace, caveHold } from './game/cave';
import { placeCaveMouth, tickCaveMouth, mouth, mouthTap } from './game/cavemouth';
import { GOALS } from './game/goals';

const SEED = 4242;
let T = 0; // game clock in seconds (declared early: newGame uses it)
$('scene').appendChild(renderer.domElement);
renderer.info.autoReset = false;
setOccupiedTest(occupied);

function newGame(state: typeof S | null) {
  exitCave(true); cancelPlace(); closeSheet(); exitExpandMode(); exitMarkMode(); clearFishing(); clearRaft(); clearSites(); clearMarks(); clearRuins(); clearBeach();
  clearCrew(); clearBuildings(); clearForest(); clearLabels();
  while (worldGroup.children.length) worldGroup.remove(worldGroup.children[0]);
  clearTrees();
  setState(state || freshState());
  setMap(S.map);
  generate(SEED);
  buildIslet(SEED);          // the ruins islet, far out to sea
  plantIsland(SEED);
  spawnGrove();
  placeRocks(SEED, S.map === 2 ? 7 : 5);
  markForestZone(SEED);      // before paths change tile types, so the zone is always the same
  restorePaths();
  restoreForest(T);          // felled trees stay felled, cleared stumps stay cleared
  restoreExpansions();       // land the player added
  buildTerrain();
  updateWater();
  restoreSites();
  restoreBeach();
  restoreMarks();
  buildForestEdge();
  for (const b of S.buildings) { if (b.type === 'brasero') prepareBrazier(b.i, b.j); createBuilding(b.type, b.i, b.j, b.rot, false, b); }
  spawnRuins(); fixBrazierModels();
  placeCaveMouth();          // the way into the volcano (v0.15)
  rebuildDeco();
  // start near the centre, on open flat ground
  const c0 = tileAt(Math.floor(N / 2), Math.floor(N / 2)) || landTiles()[0];
  const good = (t: Tile) => walkable(t) && t.type !== 'arena' && t.h === 1 && [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => walkable(tileAt(t.i + a, t.j + b))).length >= 3;
  const path = bfs(c0, good);
  const start = path === null ? landTiles().find(walkable)! : path.length ? path[path.length - 1] : c0;
  spawnCrew('arci', start);
  if (S.flags.musgoFree && grove) spawnCrew('musgo', grove.center);
  if (S.ruins.awake && brasaSpot()) spawnCrew('brasa', brasaSpot()!);
  checkReach(start, bfs, true);
  controls.target.set(start.wx, 0.5, start.wz);
  camera.position.set(start.wx + 18, 18, start.wz + 18);
  camera.zoom = innerWidth < innerHeight ? 0.85 : 1.35;
  camera.updateProjectionMatrix(); controls.update(); placeSun();
  refreshDay();
  checkGoals(true); checkAchievements(true); fillBoard();   // older saves: recount the route and achievements quietly
  refreshHUD();
}

let running = false;
function startGame(state: typeof S | null) {
  newGame(state); $('title').hidden = true; running = true; persist();
}
const persist = () => save(saved());

initHUD(); initSheetEvents(); initInput(); initProgress();
initSheets({ centreTile, onReset: () => { clearSave(); newGame(null); persist(); } });
on('built', () => persist());
on('placed', () => persist());
on('expanded', () => { updateWater(); checkReach(crew[0] ? tileUnder(crew[0].root.position.x, crew[0].root.position.z) : null, bfs); persist(); });
on('flameLit', () => persist());
on('boardChanged', () => persist());
on('beachChanged', () => persist());
on('invented', () => persist());
on('bottleRead', (i: number) => openMessage(i));
on('story', (k: string) => openStory(k));
on('fishMode', (f: boolean) => { $('bottom').hidden = f || sailingActive(); });
on('sailMode', (f: boolean) => { $('bottom').hidden = f; });
on('fishCaught', () => persist());
on('levelUp', () => persist());
on('finaleStart', (c: Tile) => { closeSheet(); select(null); flyTo(new THREE.Vector3(c.wx, 1, c.wz), Math.max(camera.zoom, 1.1)); toast('La tierra tiembla en las ruinas…'); });
on('brasaAwake', (c: Tile) => {
  const b = spawnCrew('brasa', c); b.anim = 'wave'; b.t = 0; S.crew.push('brasa');
  setTimeout(() => { if (!b.job) { b.anim = 'idle'; } }, 2800);
  toast('Brasa despierta, se estira y se une al equipo'); persist();
});
on('forestChanged', () => persist());
on('siteChanged', () => persist());
on('marksChanged', () => persist());
on('pathsChanged', () => { buildTerrain(); rebuildDeco(); buildForestEdge(); persist(); });
on('goalAdvanced', () => persist());
on('caveChanged', () => persist());

$('clock').addEventListener('click', () => {
  const m = Math.max(1, Math.round(minutesToNight()));
  toast(isNight() ? `${phaseName()}: algunas cosas solo pasan de noche` : `${phaseName()} · la noche llega en ${m === 1 ? 'un minuto' : `unos ${m} minutos`}`);
});
$('tContinue').hidden = !hasSave();
$('tContinue').addEventListener('click', () => startGame(loadSave()));
$('tNew').addEventListener('click', () => { clearSave(); startGame(null); });

resize(); addEventListener('resize', resize);
/* sound: browsers only allow it after the first tap */
setSound(gfx.sound);
addEventListener('pointerdown', () => unlockAudio(), { capture: true });
on('treeFelled', () => sfx('fall'));
on('gain', () => sfx('pop'));
on('levelUp', () => sfx('level'));
on('chapterDone', () => { sfx('level'); cheer(2.6); });
on('stageDone', () => { sfx('solve'); cheer(); });
on('achievement', () => sfx('coin'));
on('obraDone', () => sfx('coin', 0.7));
on('flameLit', () => sfx('solve'));
on('expanded', () => sfx('splash'));
on('boardChanged', () => sfx('tap'));
on('invented', () => sfx('solve'));
on('beachChanged', () => sfx('tap'));
newGame(loadSave());

/* the sharp band of the miniature effect follows what matters: the ghost, the selected figure, or the figure nearest the view */
const _f = new THREE.Vector3();
function focusTarget(): THREE.Vector3 | null {
  if (place) return _f.copy(place.ghost.position);
  const sel = selected && crew.find(c => c.id === selected);
  if (sel) return _f.copy(sel.root.position);
  let best: THREE.Object3D | null = null, bd = 1e9;
  for (const c of crew) { const d = c.root.position.distanceTo(controls.target); if (d < bd) { bd = d; best = c.root; } }
  return best && bd < 9 / camera.zoom ? _f.copy(best.position) : null;
}
let fpsAcc = 0, fpsFrames = 0;

/* keep the camera over the island */
function clampCamera() {
  if (caveActive()) return;
  const t = controls.target, lim = sailingActive() ? 36 : N / 2 - 1;
  const cx = Math.max(-lim, Math.min(lim, t.x)), cz = Math.max(-lim, Math.min(lim, t.z));
  if (cx !== t.x || cz !== t.z) { camera.position.x += cx - t.x; camera.position.z += cz - t.z; t.x = cx; t.z = cz; }
}

let last = performance.now(), saveAcc = 0, uiAcc = 0, sunAcc = 0, due = 0;
function frame(now: number) {
  // 60 fps cap: on 120 Hz screens every other refresh is skipped, which keeps phones cool and steady
  if (gfx.cap60) {
    if (now < due - 2) { requestAnimationFrame(frame); return; }
    due = Math.max(due + 1000 / 60, now);
  }
  const raw = Math.max(0, Math.min(0.25, (now - last) / 1000)); last = now;   // the first frame's timestamp can be older than the load time
  const dt = Math.min(0.05, raw); T += dt;
  if (running) { tickDay(dt); S.time += dt; saveAcc += dt; if (saveAcc > DATA.BALANCE.saveEverySeconds) { saveAcc = 0; persist(); } }
  updateCrew(dt, T);
  tickTrees(dt, T, t => onTreeFallen(t, T));
  tickForest(T);
  tickRuins(dt);
  if (running) tickBeach(T);
  tickGrove(dt, T);
  tickRocks(dt, T);
  tickBuildings(dt);
  tickParticles(dt);
  tickLeaves(dt);
  tickMarker(dt);
  pulseMarkers(T);
  tickLabels();
  tickFishing(dt, T);
  tickRaft(dt, T);
  tickSea(dt, T);
  tickCaveMouth(dt, T);
  tickCave(dt, T);
  tickPointer(dt, T, sheetOpen());
  uiAcc += dt; if (uiAcc > 0.25) { refreshHUD(uiAcc); refreshSheet(); uiAcc = 0; }
  tickWater(T);
  tickAmbience(raw, nightK);
  tickFly(raw); controls.update(); clampCamera();
  sunAcc += dt; if (sunAcc > 0.5) { sunAcc = 0; placeSun(); }
  const ft = focusTarget(); focusOn(ft ? ft.setY(ft.y + 0.5).project(camera).y : null, raw, !!place || caveActive());
  fpsAcc += raw; fpsFrames++;
  if (fpsAcc > 0.5) { const el = $('fps'); el.hidden = !gfx.fps; if (gfx.fps) el.textContent = `${Math.round(fpsFrames / fpsAcc)} fps · ${pixelRatio().toFixed(2)}x`; fpsAcc = 0; fpsFrames = 0; }
  adaptResolution(raw); // resizing clears the canvas, so it must happen before drawing
  tickShadows();
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
    step: (n: number) => { for (let k = 0; k < n; k++) { T += 0.05; S.time += 0.05; if (running) tickDay(0.05); updateCrew(0.05, T); tickTrees(0.05, T, t => onTreeFallen(t, T)); tickForest(T); tickRuins(0.05); tickBeach(T); tickGrove(0.05, T); tickRocks(0.05, T); tickBuildings(0.05); tickFishing(0.05, T); tickRaft(0.05, T); tickCaveMouth(0.05, T); tickCave(0.05, T); tickParticles(0.05); tickLeaves(0.05); } refreshHUD(); },
    screen: (x: number, y: number, z: number) => { scene.updateMatrixWorld(); camera.updateMatrixWorld(); const v = camera.position.clone().set(x, y, z).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; },
    scene, sites, marks, refreshDay, ruinCenter: () => ruinCenter, fillBoard, spawnCrew, rebuildBrazier, lightFlame, buildHit, openFlame, lockPixelRatio, benchRender, setGfx, sun, updateCrew, tickTrees, tickLabelsFn: tickLabels, growing, forestStats, onTap, debugPick, tickLabels, startPlace, movePlace, confirmPlace, smelt, footprint, footprintValid, openSheet, cheer, select, pointerTarget, sheetOpen, isNight, startSite, startInvention, ruinSlots, persist, cancelFly, startSailing, fishHere, goBack, sailState, DEEP, sailTo: (x: number, z: number) => { const r = new THREE.Raycaster(); r.ray.origin.set(x, 5, z); r.ray.direction.set(0, -1, 0); return sailTap(r); }, startFishing, stopFishing, castAt, fishState, useBait, fishShadows, bestShadow, waitForNight, waitingNight, startUpgrade, levelOf, capOf, nextGoal: () => GOALS[S.goal]?.id || null, achs: () => S.ach,
    enterCave, exitCave, caveAct, caveState, caveDebugFloor, tapCell, caveStepDir, caveFace, caveHold, caveActive, mouthTap, blowShell, switchLeader, battleState, battleChoose, mouth: () => mouth && { i: mouth.tile.i, j: mouth.tile.j, open: mouth.open, x: mouth.tile.wx, z: mouth.tile.wz },
  };
}
