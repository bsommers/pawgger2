// Pawgger entry point (owner ui-shell). Boots art, audio, bus, renderer and game; fixed-step loop; screens; input.
// Query params: autostart=1 level=N seed=N bot=1 time=SECONDS nosound=1 poll touch=1. window.__pawgger for QA tools.
import { createBus } from './core/events.js';
import { createInput } from './core/input.js';
import { loadSettings, saveSettings, loadHi, saveHi, hiRank, insertHi } from './core/settings.js';
import { TUNING, musicForLevel } from './core/defs.js';
import { createGame } from './sim/game.js';
import { generateLevel } from './levels/lanegen.js';
import { buildAll } from './art/registry.js';
import { createRenderer } from './render/renderer.js';
import { spritesFor } from './render/scene.js';
import { createHud } from './ui/hud.js';
import { createScreens } from './ui/screens.js';
import { createMenu, createOptionsMenu, createNameEntry } from './ui/menus.js';
import { createTouch } from './ui/touch.js';

const STEP = 1 / 60, MAX_STEPS = 5;

/** Parse the query string into typed boot options. */
export function parseParams(search = '') {
  const q = new URLSearchParams(search);
  const num = (k, d) => { const v = Number(q.get(k)); return q.has(k) && isFinite(v) ? v : d; };
  return { autostart: q.get('autostart') === '1', level: Math.max(1, Math.floor(num('level', 1))), seed: Math.floor(num('seed', 1)),
    bot: q.get('bot') === '1', time: q.has('time') ? num('time', 0) : null, nosound: q.get('nosound') === '1', poll: q.has('poll'), touch: q.get('touch') === '1' };
}

export async function boot({ win = window, doc = document } = {}) {
  const P = parseParams(win.location.search);
  const canvas = doc.getElementById('game');
  const bus = createBus();
  const settings = loadSettings();
  let hiList = loadHi();
  const art = await buildAll();
  const renderer = createRenderer(canvas, { bus, art, settings });
  const sp = spritesFor(art);
  const input = createInput({ target: win });
  const hud = createHud({ bus, sp });
  const screens = createScreens({ sp });
  const touch = createTouch({ input, sp, enabled: P.touch });
  touch.attach(canvas, () => renderer.view, () => input.act('confirm'));

  // optional modules: audio and autopilot may be missing or broken; the game still runs
  let audio = null, createAutopilot = null;
  if (!P.nosound) { try { const m = await import('./audio/audio.js'); audio = m.createAudio(bus, settings); } catch (e) { console.warn('audio unavailable', e); } }
  try { createAutopilot = (await import('./sim/autopilot.js')).createAutopilot; } catch { createAutopilot = null; }
  const applySettings = () => {
    renderer.setCRT(settings.crt); saveSettings(settings);
    try { if (audio) { audio.setVolume(settings.master, settings.sfx, settings.music); audio.setMute(settings.mute); } } catch { /* ignore */ }
  };
  applySettings();
  const unlock = () => { try { if (audio) audio.unlock(); } catch { /* ignore */ } };
  win.addEventListener('keydown', unlock); canvas.addEventListener('pointerdown', unlock);
  const sfx = (name) => bus.emit('sfx', { name });

  // ---- game lifecycle
  let mode = 'title', game = null, pilot = null, attract = null, attractPilot = null, entry = null, rank = -1;
  const makeGame = (b, level, seed) => createGame({ seed, bus: b, level, levelAt: generateLevel, hi: hiList[0] ? hiList[0].score : 0 });
  const makePilot = (g, seed) => { try { return createAutopilot ? createAutopilot(g, { skill: 0.9, seed }) : null; } catch { return null; } };
  function newAttract() {
    attract = makeGame(createBus(), 1, (Date.now() & 0xffff) | 1);   // own bus: attract stays silent
    attractPilot = makePilot(attract, 7);
  }
  function startGame() {
    game = makeGame(bus, P.level, P.seed);
    pilot = P.bot ? makePilot(game, P.seed) : null;
    mode = 'play'; entry = null; rank = -1; pending = null;
    sfx('start'); bus.emit('music', { name: musicForLevel(P.level) });
  }
  function toTitle() {
    mode = 'title'; game = null; pilot = null; newAttract(); titleMenu.index = 0;
    bus.emit('music', { name: 'title' });
  }
  function setPause(on) {
    if (on && mode === 'play') { mode = 'pause'; bus.emit('pause', { on: true }); bus.emit('music', { name: null }); }
    else if (!on && mode === 'pause') { mode = 'play'; bus.emit('pause', { on: false }); bus.emit('music', { name: musicForLevel(game.level) }); }
  }

  const titleMenu = createMenu([
    { id: 'start', label: () => 'START GAME', confirm: startGame },
    { id: 'help', label: () => 'HOW TO PLAY', confirm: () => { mode = 'howto'; } },
    { id: 'options', label: () => 'OPTIONS', confirm: () => { mode = 'options'; } },
  ]);
  const optMenu = createOptionsMenu(settings, applySettings, () => { mode = 'title'; });

  const toggleFullscreen = () => { try { if (doc.fullscreenElement) doc.exitFullscreen(); else (doc.documentElement.requestFullscreen || (() => {})).call(doc.documentElement); } catch { /* ignore */ } };
  input.on((e) => {
    const a = e.act;
    if (a === 'mute') { settings.mute = !settings.mute; applySettings(); return; }
    if (a === 'crt') { settings.crt = !settings.crt; applySettings(); return; }
    if (a === 'fullscreen') { toggleFullscreen(); return; }
    if (mode === 'title') {
      if (a === 'help') { mode = 'howto'; return; }
      const r = titleMenu.act(a); if (r) sfx(r === 'select' ? 'menu_select' : 'menu_move');
    } else if (mode === 'howto') { if (a === 'confirm' || a === 'back') { mode = 'title'; sfx('menu_select'); } }
    else if (mode === 'options') {
      if (a === 'back') { mode = 'title'; return; }
      const r = optMenu.act(a); if (r) sfx(r === 'select' ? 'menu_select' : 'menu_move');
    } else if (mode === 'play') { if (a === 'pause' || a === 'back') setPause(true); }
    else if (mode === 'pause') {
      if (a === 'pause' || a === 'back' || a === 'confirm') setPause(false);
      else if (a === 'char' && e.key === 'Q') toTitle();
    } else if (mode === 'gameover') {
      if (entry && !entry.done) {
        entry.act(a, a === 'char' ? e.key : undefined);
        if (a === 'char' || a === 'up' || a === 'down') sfx('menu_move');
        if (entry.done) { hiList = insertHi(hiList, entry.name, game.score); saveHi(hiList); rank = hiList.findIndex((x) => x.name === entry.name && x.score === Math.floor(game.score)); sfx('menu_select'); }
      } else if (a === 'confirm') { sfx('menu_select'); toTitle(); }
    }
  });
  win.addEventListener('blur', () => setPause(true));
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) setPause(true); });

  renderer.hud = (ctx, g) => { if (mode !== 'title' && mode !== 'howto' && mode !== 'options') hud.draw(ctx, g); };
  renderer.overlay = (ctx) => {
    if (mode === 'title') screens.drawTitle(ctx, titleMenu, hiList);
    else if (mode === 'howto') screens.drawHowTo(ctx);
    else if (mode === 'options') screens.drawOptions(ctx, optMenu);
    else if (mode === 'pause') screens.drawPause(ctx);
    else if (mode === 'gameover') screens.drawGameOver(ctx, { score: game.score, level: game.level, entry, hi: hiList, rank });
    else if (game && game.state === 'levelclear') screens.drawLevelClear(ctx, game);
    if (mode !== 'title' && mode !== 'howto' && mode !== 'options') touch.draw(ctx);
  };

  // ---- loop
  let pending = null, forced = null, acc = 0, lastT = null;
  const applyTime = (g) => { if (P.time != null && g.timeLimit > P.time) { g.timeLimit = P.time; g.timeLeft = Math.min(g.timeLeft, P.time); } };
  function stepGame(g, p, hop) {
    const inp = p ? (p.step(STEP) || { hop: null }) : { hop };
    g.update(STEP, { hop: inp.hop ?? null });
    if (g === game) applyTime(g);
  }
  function simStep(hop) {
    if (mode === 'play') {
      stepGame(game, pilot, forced ? forced.hop ?? null : hop);
      if (forced) forced.hop = null;
      if (game.state === 'gameover' && game.stateT > 1.2) {
        rank = hiRank(hiList, game.score);
        entry = rank >= 0 ? createNameEntry('AAA') : null; mode = 'gameover';
      }
    } else if (mode === 'title' || mode === 'howto' || mode === 'options') {
      if (!attract || attract.state === 'gameover') newAttract();
      stepGame(attract, attractPilot, null);
    } else if (mode === 'gameover' && game) { game.update(STEP, { hop: null }); }
  }
  function frame(ts) {
    const dt = lastT === null ? 0 : Math.min(0.25, (ts - lastT) / 1000); lastT = ts;
    const polled = input.poll();
    if (polled.hop) pending = polled.hop;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < MAX_STEPS) { simStep(pending); pending = null; acc -= STEP; n++; }
    if (n === MAX_STEPS) acc = 0;
    const g = (mode === 'title' || mode === 'howto' || mode === 'options') ? attract : game;
    if (g) renderer.draw(g, acc / STEP);
    if (P.poll && game) win.__pawgger.status = { mode, state: game.state, level: game.level, score: game.score, lives: game.lives, row: game.frog && game.frog.row, bays: game.bays.filter((b) => b.filled).length };
    win.requestAnimationFrame(frame);
  }

  win.__pawgger = {
    get game() { return game || attract; }, renderer, bus, input, get mode() { return mode; },
    step(n = 1) { for (let i = 0; i < n; i++) { simStep(pending); pending = null; } },
    setInput(i) { forced = i ? { hop: i.hop ?? null } : null; },
    start: startGame,
  };
  win.addEventListener('resize', () => renderer.resize());
  renderer.resize();
  newAttract();
  if (P.autostart) startGame(); else bus.emit('music', { name: 'title' });
  win.requestAnimationFrame(frame);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.getElementById('game')) {
  boot().catch((e) => { console.error(e); });
}
