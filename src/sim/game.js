// Pawgger simulation core (ARCHITECTURE section 4). Pure, Node-safe, fixed-step, deterministic.
import { TUNING, SCORES, ROW, BAY_COLS, CELL, W, START_LIVES, EXTRA_LIFE_AT, BAYS, attemptTimeFor, speedScale, musicForLevel, bayHazardOn, bayBonusOn, colX, rowY } from '../core/defs.js';
import { createRng } from '../core/rng.js';
import { createBus } from '../core/events.js';
import { newFrog, stepFrog } from './frog.js';

let peteMod = null;
try { peteMod = await import('./pete.js'); } catch { peteMod = null; }

const DROWN = new Set(['water', 'turtle', 'offscreen']);
const DEATH_SFX = { water: 'splash', turtle: 'splash', offscreen: 'splash', car: 'squash', roller: 'squash', croc: 'croc_snap', snake: 'snake_hiss' };

// Minimal stand-in used only when no levelAt is injected (the real one is levels/lanegen.js).
function fallbackLevel(level, seed) {
  const lanes = [];
  const mk = (row, kind, i) => {
    const dir = row % 2 ? 1 : -1;
    const base = kind === 'road' ? TUNING.roadSpeed[i] : TUNING.riverSpeed[i];
    const items = [];
    for (let k = 0; k < 3; k++) items.push({ id: `${row}-${k}`, type: kind === 'road' ? 'car' : 'log_m', off: k * 7 * CELL * 2 });
    lanes[row] = { row, kind, dir, speed: base * speedScale(level), loop: 24 * CELL, items, tile: kind };
  };
  ROW.river.forEach((r, i) => mk(r, 'river', i));
  ROW.road.forEach((r, i) => mk(r, 'road', i));
  return { level, seed, timeLimit: attemptTimeFor(level), lanes, bays: { cols: BAY_COLS, hazards: [], bonuses: [] }, pete: null };
}

export function createGame({ seed = 1, bus = createBus(), level = 1, levelAt = fallbackLevel, hi = 0 } = {}) {
  const g = {
    seed, bus, rng: createRng(seed), levelAt, level, t: 0, state: 'intro', stateT: 0,
    score: 0, hi, lives: START_LIVES, maxRow: ROW.start, timeLeft: 0, timeLimit: 0,
    def: null, lanes: null, frog: null, bays: [], filled: new Array(BAYS).fill(false), pete: null, pickups: new Set(),
    stats: { hops: 0, deaths: 0, baysFilled: 0, levels: 0 }, buf: null, extraGiven: false, _sec: 0, _pete: null,
  };

  // ------------------------------------------------------------ engine hooks
  g.sfx = (name, x, y) => g.bus.emit('sfx', { name, x, y });
  g.fx = (type, x, y, opts) => g.bus.emit('fx', { type, x, y, opts });
  g.popup = (text, x, y, color) => g.bus.emit('popup', { text, x, y, color });
  g.taunt = (text) => g.bus.emit('taunt', { text, dur: 2.5 });
  g.addScore = (n, why) => {
    if (!n) return;
    g.score += n;
    if (g.score > g.hi) g.hi = g.score;
    g.bus.emit('score', { score: g.score, delta: n, why });
    if (!g.extraGiven && g.score >= EXTRA_LIFE_AT) {
      g.extraGiven = true; g.lives++;
      g.sfx('oneup'); g.popup('1UP', g.frog ? g.frog.x : W / 2, g.frog ? rowY(g.frog.row) - 10 : 120);
    }
  };
  g.scoreRow = (row) => {
    if (row < g.maxRow) {
      g.maxRow = row;
      g.addScore(SCORES.forwardRow, 'row');
      g.bus.emit('row', { row, score: g.score });
      g.sfx('row_up');
    }
  };
  const setState = (s) => { g.state = s; g.stateT = 0; g.bus.emit('state', { state: s }); };

  g.kill = (reason) => {
    const f = g.frog;
    if (g.state !== 'play' || !f || f.inv > 0 || f.mode === 'dying' || f.mode === 'dead' || f.mode === 'home') return;
    f.mode = 'dying'; f.death = reason; f.hopT = 0; f.onItem = null; f.frame = 0;
    f.pose = DROWN.has(reason) ? 'drown' : 'squash';
    g.buf = null; g.stats.deaths++;
    g.sfx(DEATH_SFX[reason] ?? 'die', f.x, rowY(f.row));
    g.fx(DROWN.has(reason) ? 'splash' : reason === 'timeout' ? 'poof' : 'squash', f.x, rowY(f.row));
    g.bus.emit('shake', { mag: 3, dur: 0.25 });
    setState('dying');
  };

  g.onBayFilled = () => {
    if (g.filled.every(Boolean)) {
      g.addScore(SCORES.allBays, 'levelclear');
      g.sfx('bay_all'); g.bus.emit('music', { name: 'levelclear' });
      g.bus.emit('levelclear', { level: g.level, score: g.score });
      setState('levelclear');
    } else spawn(0);
  };

  // ------------------------------------------------------------ helpers
  const attachPete = () => {
    g._pete = null;
    g.pete = { state: 'off', t: 0, rollerX: 0, rollerDir: 1 };
    if (!peteMod || typeof peteMod.createPete !== 'function') return;
    try {
      const p = peteMod.createPete(g);
      g._pete = p || null;
      if (p && typeof p === 'object') {
        if (p.state === undefined) p.state = 'off';
        if (p.t === undefined) p.t = 0;
        if (p.rollerX === undefined) p.rollerX = 0;
        if (p.rollerDir === undefined) p.rollerDir = 1;
        g.pete = p;
      }
    } catch { g._pete = null; }
  };
  const petePoke = (fn, ...a) => { try { if (g._pete && typeof g._pete[fn] === 'function') g._pete[fn](...a); } catch { /* guard */ } };

  const refreshBays = () => {
    const hz = g.def.bays?.hazards ?? [], bo = g.def.bays?.bonuses ?? [];
    const cols = g.def.bays?.cols ?? BAY_COLS;
    g.bays = cols.map((col, idx) => {
      const filled = g.filled[idx];
      const h = hz.find((x) => x.bay === idx && bayHazardOn(x, g.t));
      const b = filled ? null : bo.find((x) => x.bay === idx && bayBonusOn(x, g.t));
      return { idx, col, filled, hazard: filled ? null : h ? h.kind : null, bonus: b ? b.kind : null };
    });
  };

  function spawn(inv) {
    g.frog = newFrog(inv);
    g.maxRow = ROW.start; g.buf = null;
    g.timeLeft = g.timeLimit; g._sec = Math.ceil(g.timeLeft);
    petePoke('reset');
  }

  function loadLevel() {
    g.def = g.levelAt(g.level, g.seed);
    g.lanes = g.def.lanes;
    g.timeLimit = g.def.timeLimit ?? attemptTimeFor(g.level);
    g.t = 0; g.filled = new Array(BAYS).fill(false); g.pickups = new Set();
    attachPete();
    spawn(0);
    refreshBays();
    setState('intro');
    g.bus.emit('level', { level: g.level });
    g.bus.emit('banner', { text: `LEVEL ${g.level}`, dur: TUNING.introTime });
    g.bus.emit('music', { name: musicForLevel(g.level) });
  }

  // ------------------------------------------------------------ update
  g.update = (dt, input) => {
    dt = Math.min(dt, 1 / 30);
    g.t += dt; g.stateT += dt;
    refreshBays();
    const f = g.frog;
    switch (g.state) {
      case 'intro':
        if (g.stateT >= TUNING.introTime) setState('play');
        break;
      case 'play': {
        // timer
        g.timeLeft = Math.max(0, g.timeLeft - dt);
        const sec = Math.ceil(g.timeLeft);
        if (sec !== g._sec) {
          g._sec = sec;
          g.bus.emit('timer', { left: sec });
          if (sec <= 6 && sec > 0) g.sfx('tick_low');
        }
        stepFrog(g, dt, input ? input.hop ?? null : null);
        if (g.state === 'play') petePoke('update', dt);
        if (g.state === 'play' && g.timeLeft <= 0) g.kill('timeout');
        break;
      }
      case 'dying': {
        const n = f.pose === 'drown' ? 4 : 3;
        f.frame = Math.min(n - 1, Math.floor((g.stateT / TUNING.deathTime) * n));
        if (g.stateT >= TUNING.deathTime) {
          g.lives--; f.mode = 'dead';
          g.bus.emit('life', { lives: g.lives, reason: f.death });
          if (g.lives > 0) { spawn(TUNING.respawnInvuln); g.sfx('respawn'); setState('play'); }
          else {
            g.bus.emit('gameover', { score: g.score, level: g.level });
            g.bus.emit('music', { name: 'gameover' }); g.sfx('gameover');
            setState('gameover');
          }
        }
        break;
      }
      case 'levelclear':
        if (g.stateT >= TUNING.clearTime) { g.level++; g.stats.levels++; loadLevel(); }
        break;
      default: break;
    }
  };

  loadLevel();
  return g;
}
