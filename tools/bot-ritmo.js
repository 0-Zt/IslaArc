// Pacing bot: plays chapters 1-4 through the debug hook, like an attentive player who
// re-plans every few seconds. Puzzles are assumed to take a fixed time each.
window.bot = (() => {
  const I = __isla;
  const S = () => I.S;
  const H = 26;
  const log = [];
  const tOf = c => I.tileAt(Math.floor(c.root.position.x + H), Math.floor(c.root.position.z + H));
  const dist = (a, b) => Math.abs(a.i - b.i) + Math.abs(a.j - b.j);
  const KIND = { madera: 'tree', piedra: 'rock', mineral: 'rock', arena: 'sand', tierra: 'soil' };
  const ONEOFF = ['build', 'fill', 'avivar', 'dig', 'ancient', 'recoger', 'pescar', 'navegar', 'walk'];
  const RECIPE_AT = { lingote: 'horno', ladrillo: 'horno', vidrio: 'horno', tablas: 'aserradero', carbon: 'horno' };
  const RECIPE_COST = { lingote: { mineral: 2, madera: 1 }, ladrillo: { tierra: 2, arena: 1, madera: 1 }, vidrio: { arena: 3, madera: 1 }, tablas: { madera: 2 }, carbon: { madera: 3 } };
  const BCOST = { casa: { madera: 20 }, horno: { piedra: 15, arena: 12, madera: 8 }, tablon: { madera: 12 }, almacen: { madera: 30, piedra: 20 }, muelle: { tablas: 12, madera: 20, piedra: 10 }, aserradero: { madera: 30, piedra: 15, lingote: 3 }, taller: { tablas: 16, ladrillo: 14, lingote: 5, piedra: 20 } };
  const UPC = { horno: { ladrillo: 20, piedra: 25, carbon: 8 }, almacen: { tablas: 25, ladrillo: 15, madera: 40 } };
  const UP3 = { tablas: 40, ladrillo: 30, vidrio: 10 };
  const RAFT = { tablas: 30, algas: 20, madera: 40 };
  let seaTarget = null;
  const INVC = { carretilla: { tablas: 8, lingote: 2 }, palaM: { tablas: 4, lingote: 3 }, martillo: { tablas: 5, lingote: 3 }, catalejo: { vidrio: 4, lingote: 3, tablas: 4 }, linterna: { vidrio: 3, lingote: 2, tablas: 2, carbon: 2 } };
  const BRAZ = [{ piedra: 12 }, { piedra: 10, arena: 8 }, { piedra: 15 }, { piedra: 10, madera: 12 }, { piedra: 10, lingote: 3 }];
  let puzzleUntil = null, puzzleK = -1, claroAt = null, bridgeDone = false;
  const has = t => I.buildings.find(b => b.type === t);
  const done = t => I.buildings.find(b => b.type === t && !b.scaffold && (b.work == null || b.work <= 0 || b.done)) ;
  const isDone = b => b && !b.scaffold;
  const afford = c => Object.entries(c).every(([k, v]) => S().res[k] >= v);
  const add = (a, b, m = 1) => { for (const [k, v] of Object.entries(b)) a[k] = (a[k] || 0) + v * m; return a; };
  const queued = (type, r) => { const b = has(type); return b ? b.jobs.filter(j => j === r).length : 0; };

  function placeNear(type) {
    const anchor = has('casa') ? has('casa').tiles[0] : tOf(I.crew[0]);
    for (let d = 2; d < 14; d++) for (let dj = -d; dj <= d; dj++) for (let di = -d; di <= d; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== d) continue;
      const t = I.tileAt(anchor.i + di, anchor.j + dj);
      if (t && !t.ruin && I.footprintValid(I.footprint(type, t.i, t.j, 0))) { I.startPlace(type, t); const b = I.confirmPlace(); if (typeof b !== 'string') { log.push(`${min()} place ${type}`); return b; } }
    }
    log.push(`${min()} NO SPACE ${type}`); return null;
  }
  const min = () => ((S().time) / 60).toFixed(1) + 'm';

  function gatherTile(c, res) {
    const here = tOf(c); if (!here) return false;
    let pred;
    if (res === 'madera') pred = t => t.tree && !t.tree.falling;
    else if (res === 'piedra' || res === 'mineral') pred = t => t.rock;
    else if (res === 'arena') pred = t => t.type === 'arena' && !t.building && !t.ruin && !t.tree && !t.mark && !t.solid;
    else pred = t => (t.type === 'tierra' || (t.type === 'piedras' && !t.rock)) && !t.building && !t.tree && !t.solid;
    const taken = new Set(I.crew.filter(o => o !== c && o.job).map(o => o.job.tile));
    const cand = I.landTiles().filter(t => pred(t) && (!taken.has(t) || KIND[res] === 'rock')).sort((a, b) => dist(a, here) - dist(b, here));
    for (const t of cand.slice(0, 6)) if (I.order(c, t, KIND[res]) === true) return true;
    return false;
  }

  // the materials a target needs, with refined ones turned into raw ones and queued for production
  function wantFor(need) {
    const want = {};
    for (const [k, v] of Object.entries(need)) {
      const short = v - S().res[k];
      if (RECIPE_COST[k]) {
        const q = queued(RECIPE_AT[k], k);
        const missing = Math.max(0, short - q);
        if (missing > 0) add(want, RECIPE_COST[k], missing);
        // queue production when the building exists
        const b = has(RECIPE_AT[k]);
        if (b && isDone(b) && missing > 0) {
          for (let n = 0; n < missing && b.jobs.length < 4; n++) { if (!afford(RECIPE_COST[k])) break; I.smelt(b, k); }
        }
      } else want[k] = (want[k] || 0) + v;
    }
    return want;
  }

  function assign(want) {
    const full = k => S().res[k === 'mineral' ? 'piedra' : k] >= I.capOf(k === 'mineral' ? 'piedra' : k);
    const def = Object.entries(want).map(([k, v]) => [k, v - S().res[k]]).filter(([k, d]) => d > 0 && !full(k)).sort((a, b) => b[1] - a[1]);
    const gatherers = I.crew.filter(c => !(c.job && ONEOFF.includes(c.job.kind)));
    // who gathers what now
    const doing = c => c.job && Object.keys(KIND).find(k => KIND[k] === c.job.kind && (k !== 'mineral'));
    gatherers.forEach((c, n) => {
      const spare = ['madera', 'piedra', 'arena', 'tierra'].filter(k => !full(k));
      const pick = def.length ? def[n % def.length][0] : (spare[n % Math.max(1, spare.length)] || 'madera');
      const res = pick === 'mineral' ? 'piedra' : pick;
      const cur = doing(c);
      const curRes = cur === 'piedra' ? 'piedra' : cur;
      if (curRes === res && c.job) return;
      if (curRes && def.some(([k]) => (k === 'mineral' ? 'piedra' : k) === curRes) && !(n === 0 && def[0][0] !== curRes && def[0][1] > 4)) return;
      gatherTile(c, res);
    });
  }

  function ensureBuilders() {
    for (const b of I.buildings) {
      if (!b.scaffold) continue;
      if (I.crew.some(c => c.job && c.job.kind === 'build' && c.job.tile.building === b)) continue;
      const free = I.crew.filter(c => !(c.job && ONEOFF.includes(c.job.kind)));
      const c = free.find(q => q.id === 'arci') || free[0];
      if (c) I.order(c, b.tiles[0], 'build');
    }
  }

  function bridgeCells() {
    const inGrid = (i, j) => i >= 0 && j >= 0 && i < 52 && j < 52;
    const water = (i, j) => inGrid(i, j) && !I.tileAt(i, j);
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const prev = new Map(), q = [];
    for (const t of I.landTiles()) if (!t.ruin) for (const [a, b] of D) if (water(t.i + a, t.j + b)) { const k = (t.j + b) * 100 + t.i + a; if (!prev.has(k)) { prev.set(k, null); q.push([t.i + a, t.j + b]); } }
    while (q.length) {
      const [i, j] = q.shift();
      if (D.some(([a, b]) => { const t = I.tileAt(i + a, j + b); return t && t.ruin; })) {
        const path = []; let k = j * 100 + i; while (k != null) { path.unshift([k % 100, Math.floor(k / 100)]); k = prev.get(k); } return path;
      }
      for (const [a, b] of D) { const ni = i + a, nj = j + b, k = nj * 100 + ni; if (water(ni, nj) && !prev.has(k)) { prev.set(k, j * 100 + i); q.push([ni, nj]); } }
    }
    return [];
  }

  function decide() {
    const g = I.nextGoal(); if (!g) return 'done';
    let need = { madera: 10 }, build = null;
    const s = S();
    ensureBuilders();
    // collect beach items as they come (a player taps them)
    if (s.beach.items.length && !I.crew.some(c => c.job && c.job.kind === 'recoger')) {
      const it = s.beach.items[0]; const c = I.crew.find(q => q.id !== 'brasa') || I.crew[0];
      I.order(c, I.tileAt(it.i, it.j), 'recoger');
    }
    switch (g) {
      case 'talar': case 'madera10': need = { madera: 20 }; break;
      case 'casa': need = BCOST.casa; build = 'casa'; break;
      case 'tablon': need = BCOST.tablon; build = 'tablon'; break;
      case 'piedra': need = { piedra: 6, arena: 6, madera: 4 }; break;
      case 'arena': need = { arena: 6, piedra: 6, madera: 4 }; break;
      case 'horno': need = BCOST.horno; build = 'horno'; break;
      case 'lingotes': need = { lingote: 4, madera: 6 }; break;
      case 'hacha': need = { lingote: 2, madera: 6 };
        if (afford(need) && has('casa')) { I.openSheet('casa', has('casa')); const e = document.querySelector('[data-tool=hacha]'); if (e) e.click(); const x = document.querySelector('[data-act=close]'); if (x) x.click(); log.push(`${min()} hacha`); }
        break;
      case 'claro': if (claroAt == null) claroAt = s.time + 8; if (s.time > claroAt) { s.flags.claroVisto = true; I.checkGoals(); } break;
      case 'despejar': {
        const a = I.ancients.find(a => !a.falling);
        if (a && !I.crew.some(c => c.job && c.job.kind === 'ancient')) I.order(I.crew.find(c => c.id === 'arci'), a.tile, 'ancient');
        need = { madera: 20 }; break;
      }
      case 'desenterrar': if (I.mound && !I.crew.some(c => c.job && c.job.kind === 'dig')) I.order(I.crew.find(c => c.id === 'arci'), I.mound.tile, 'dig'); need = { tierra: 3 }; break;
      case 'almacen': need = BCOST.almacen; build = 'almacen'; break;
      case 'expandir': need = { tierra: 3 };
        if (!I.sites.length && afford({ tierra: 3 })) {
          const casa = has('casa').tiles[0]; let best = null;
          for (let j = 0; j < 52; j++) for (let i = 0; i < 52; i++) if (!I.tileAt(i, j) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const t = I.tileAt(i + a, j + b); return t && !t.ruin; })) { const d = Math.abs(i - casa.i) + Math.abs(j - casa.j); if (!best || d < best[2]) best = [i, j, d]; }
          const r = I.startSite(best[0], best[1], 'pradera'); log.push(`${min()} site ${typeof r === 'string' ? r : 'ok'}`);
        }
        if (I.sites.length && !I.crew.some(c => c.job && c.job.kind === 'fill')) I.order(I.crew.find(c => c.id === 'arci'), I.sites[0].tile, 'fill');
        break;
      case 'islote': {
        const cells = bridgeDone ? [] : bridgeCells();
        need = { madera: 3 * Math.max(1, cells.length) };
        if (!bridgeDone && cells.length && afford(need)) { let ok = 0; for (const [i, j] of cells) if (typeof I.startSite(i, j, 'puente') !== 'string') ok++; bridgeDone = true; log.push(`${min()} bridge ${ok}/${cells.length}`); }
        if (I.sites.length) { const fillers = I.crew.filter(c => c.job && c.job.kind === 'fill').length; if (fillers < Math.min(2, I.crew.length)) { const c = I.crew.find(c => !(c.job && c.job.kind === 'fill')); I.order(c, I.sites[0].tile, 'fill'); } }
        break;
      }
      case 'braseros': {
        need = {};
        I.ruinSlots.forEach((t, k) => { if (!t.building) add(need, BRAZ[k]); });
        I.ruinSlots.forEach((t, k) => { if (!t.building && afford(BRAZ[k])) { const r = I.rebuildBrazier(k); log.push(`${min()} brasero ${k} ${typeof r === 'string' ? r : 'ok'}`); } });
        if (!Object.keys(need).length) need = { madera: 10 };
        break;
      }
      case 'llamas': {
        need = { madera: 20 };
        const lit = s.ruins.lit;
        if (puzzleUntil == null) {
          const k = lit.findIndex((l, i) => !l && i < 4);
          if (k >= 0) { puzzleK = k; puzzleUntil = s.time + 45; }
          else if (!lit[4] && I.isNight()) { puzzleK = 4; puzzleUntil = s.time + 60; }
          else if (!lit[4] && !I.waitingNight()) { I.waitForNight(); log.push(min() + ' wait for night'); }
        } else if (s.time >= puzzleUntil) { I.lightFlame(puzzleK); log.push(`${min()} flame ${puzzleK}${puzzleK === 4 ? ' (night)' : ''}`); puzzleUntil = null; }
        break;
      }
      case 'brasa': need = { madera: 20 }; break;
      case 'aserradero': need = BCOST.aserradero; build = 'aserradero'; break;
      case 'tablas': need = { tablas: 15 - (s.stats.tablas || 0) + s.res.tablas }; break;
      case 'ladrillos': need = { ladrillo: 10 - (s.stats.ladrillo || 0) + s.res.ladrillo, tablas: 8 }; break;
      case 'vidrio': need = { vidrio: 6 - (s.stats.vidrio || 0) + s.res.vidrio, ladrillo: 6, tablas: 8 }; break;
      case 'carbon': need = { carbon: 8 - (s.stats.carbon || 0) + s.res.carbon, ladrillo: 20 }; break;
      case 'horno2': case 'almacen2': { const t = g === 'horno2' ? 'horno' : 'almacen'; need = Object.assign({}, UPC[t]); const b = has(t); if (b && isDone(b) && b.lvl < 2 && !b.up && afford(UPC[t])) { const r = I.startUpgrade(b); log.push(min() + ' upgrade ' + t + ' ' + (r || 'ok')); } if (g === 'almacen2') add(need, { carbon: 0 }); break; }
      case 'avivar': { const b = I.crew.find(c => c.id === 'brasa'); if (b && !(b.job && b.job.kind === 'avivar')) I.order(b, has('horno').tiles[0], 'avivar'); need = UPC.horno; break; }
      case 'taller': need = BCOST.taller; build = 'taller'; break;
      case 'muelle': need = BCOST.muelle; build = 'muelle'; break;
      case 'pescar1': case 'pescar6': case 'anzuelo': case 'vasija': case 'algas': case 'llave': case 'cofre': case 'coleccion': {
        need = g === 'anzuelo' ? { lingote: 3, tablas: 4 } : { madera: 20 };
        if (!S().tools.anzuelo && afford({ lingote: 3, tablas: 4 }) && has('casa')) { I.openSheet('casa', has('casa')); const e = document.querySelector('[data-tool=anzuelo]'); if (e) e.click(); const x = document.querySelector('[data-act=close]'); if (x) x.click(); log.push(min() + ' anzuelo'); }
        globalThis.__fishAuto = true;
        const st = I.fishState();
        if (!st) { const m = has('muelle'); if (m) I.startFishing(m); break; }
        // close catch cards and story pages like a player would
        const card = document.getElementById('fishCard'); if (card && !card.hidden) card.click();
        const sh = document.querySelector('#sheet:not([hidden]) [data-act=close]'); if (sh) sh.click();
        if (st.st === 'ready') { const want = (g === 'vasija' || g === 'algas' || g === 'pescar1' || g === 'pescar6') ? 's' : (g === 'llave' ? 'm' : undefined); const b = I.bestShadow(want) || (g === 'coleccion' || g === 'cofre' ? I.bestShadow() : null); if (b) { const m = has('muelle'), mp = m.group.position, dx = mp.x - b.x, dz = mp.z - b.z, d = Math.hypot(dx, dz) || 1; I.castAt(b.x + dx / d * 0.6, b.z + dz / d * 0.6); } else if (S().res.semilla > 3 && g !== 'vasija' && g !== 'algas') I.useBait(); }
        break;
      }
      case 'balsa': {
        need = { tablas: 30, madera: 40 };
        const m = has('muelle');
        if (S().res.algas < 20) { need = { tablas: 30, madera: 40 }; globalThis.__fishAuto = true; const st = I.fishState(); if (!st) I.startFishing(m); else { const card = document.getElementById('fishCard'); if (card && !card.hidden) card.click(); const sh = document.querySelector('#sheet:not([hidden]) [data-act=close]'); if (sh) sh.click(); if (st.st === 'ready') { const b = I.bestShadow('s'); if (b) { const mp = m.group.position, dx = mp.x - b.x, dz = mp.z - b.z, d = Math.hypot(dx, dz) || 1; I.castAt(b.x + dx / d * 0.6, b.z + dz / d * 0.6); } } } break; }
        if (I.fishState()) I.stopFishing();
        if (m && !m.up && m.lvl < 2 && afford(RAFT)) { const r = I.startUpgrade(m); log.push(min() + ' balsa ' + (r || 'ok')); }
        break;
      }
      case 'zarpar': case 'hondo': case 'hondo1': case 'cobre': case 'almacen3': case 'brujula': case 'olas': case 'timon': {
        need = g === 'almacen3' ? Object.assign({}, UP3) : { madera: 20 };
        const sh = document.querySelector('#sheet:not([hidden]) [data-act=close]'); if (sh) sh.click();
        const card = document.getElementById('fishCard'); if (card && !card.hidden) card.click();
        if (g === 'almacen3') { const a = has('almacen'); if (a && a.lvl === 2 && !a.up && afford({ tablas: 40, ladrillo: 30, vidrio: 10, cobre: 4 })) { const r = I.startUpgrade(a); log.push(min() + ' almacen3 ' + (r || 'ok')); } if (S().got.cobre >= 4) break; }
        globalThis.__fishAuto = true;
        const st = I.sailState();
        if (!st) { if (I.fishState()) I.stopFishing(); I.startSailing(has('muelle')); break; }
        if (st.mode !== 'sailing' && st.mode !== 'fishing') break;
        if (g === 'olas') { if (I.fishState()) { I.stopFishing(); break; } if (!st.moving) I.sailTo(Math.cos(-2.36) * 30, Math.sin(-2.36) * 30); break; }
        if (!st.deep) { if (I.fishState()) { I.stopFishing(); break; } if (!st.moving) { const d = [...I.DEEP].sort((a, b) => Math.hypot(a.x - st.x, a.z - st.z) - Math.hypot(b.x - st.x, b.z - st.z))[0]; I.sailTo(d.x, d.z); } break; }
        if (st.mode === 'sailing' && !st.moving) { I.fishHere(); break; }
        const fs = I.fishState();
        if (fs && fs.st === 'ready') { const b = I.bestShadow(); if (b) { const dx = st.x - b.x, dz = st.z - b.z, d = Math.hypot(dx, dz) || 1; I.castAt(b.x + dx / d * 0.6, b.z + dz / d * 0.6); } }
        break;
      }
      case 'inventos': case 'botellas': case 'linterna': {
        const order = ['carretilla', 'martillo', 'palaM', 'catalejo', 'linterna'];
        const next = order.find(id => !s.inv[id]);
        need = next ? INVC[next] : { madera: 10 };
        const t = has('taller');
        if (next && t && isDone(t) && !t.jobs.some(j => j.startsWith('inv:')) && afford(INVC[next])) { const r = I.startInvention(next, t.jobs); log.push(`${min()} invent ${next} ${r || 'ok'}`); }
        break;
      }
    }
    if (build && !has(build) && afford(BCOST[build])) placeNear(build);
    // Brasa keeps the furnace stoked once she's here and it has work
    const br = I.crew.find(c => c.id === 'brasa'); const h = has('horno');
    if (br && h && h.jobs.length && !br.job) I.order(br, h.tiles[0], 'avivar');
    assign(wantFor(need));
    return g;
  }

  let lastG = null, since = 0, lastStage = 0, nextSample = 0; const series = []; let busy = 0, blocked = 0, idleN = 0, samples = 0;
  function run(seconds) {
    for (let k = 0; k < seconds; k += 3) {
      const g = decide();
      if (g === 'done') return 'done';
      if (g !== lastG) { log.push(`${min()} goal ${g}`); lastG = g; since = S().time; }
      if (S().stDone.length + S().chDone.length !== lastStage) { lastStage = S().stDone.length + S().chDone.length; log.push(`${min()} === ${S().stDone.slice(-1)[0] || ''} ${S().chDone.join(',')}`); }
      if (S().time - since > 900) { log.push(`${min()} STUCK on ${g} fish=${JSON.stringify(I.fishState())} shadows=${I.fishShadows.map(q=>q.size).join('')} muelle=${(()=>{const m=has('muelle');return m?[m.i,m.j,m.rot]:null})()} caught=${S().stats.pescados||0} res=${JSON.stringify(S().res)} jobs=${JSON.stringify(I.crew.map(c => [c.id, c.job && c.job.kind]))}`); since = S().time; }
      const cs = I.crew; samples += cs.length;
      for (const c of cs) { if (!c.job && !c.path.length) idleN++; else if (c.job && ['tree','rock','sand','soil'].includes(c.job.kind) && !c.path.length && c.anim === 'idle') blocked++; else busy++; }
      if (S().time >= nextSample) { nextSample = S().time + 30; series.push({ t: +(S().time / 60).toFixed(2), res: Object.assign({}, S().res), cap: [I.capOf('madera'), I.capOf('tablas')], goal: S().goal, crew: cs.length, blocked: blocked / Math.max(1, samples), idle: idleN / Math.max(1, samples) }); busy = blocked = idleN = samples = 0; }
      I.step(60);
    }
    return lastG;
  }
  return { run, log, decide, series };
})();
