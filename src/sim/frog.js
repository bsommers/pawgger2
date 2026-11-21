// Frog state machine: hop (with one buffered hop), carry, support/collision checks, bays, pickups.
// All functions take the game object `g` (see game.js); the frog lives in g.frog.
import { CELL, W, TUNING, SCORES, ROW, START_COL, START_ROW, FROG_MIN_ROW, FROG_MAX_ROW, colX, rowY } from '../core/defs.js';
import { supportAt, platformAt, crocBiteAt, itemOverlap, laneOf } from './lanes.js';
import { hitVehicle, isRoadRow, isRiverRow } from './collide.js';
import { turtleState, KINDS } from '../core/defs.js';

const POSE_OF = { up: 'up', down: 'down', left: 'side', right: 'side' };

export function newFrog(inv = 0) {
  return { x: colX(START_COL), row: START_ROW, col: START_COL, face: 'up', mode: 'idle', pose: 'up', frame: 0, hopT: 0, fromRow: START_ROW, onItem: null, inv, death: null };
}

const colOf = (x) => Math.max(0, Math.min(14, Math.floor(x / CELL)));

/** Start a hop in direction dir. Returns true if the frog moved. The position is applied now; checks happen at hop end. */
export function startHop(g, dir) {
  const f = g.frog;
  let row = f.row, x = f.x;
  if (dir === 'up') row = Math.max(FROG_MIN_ROW, row - 1);
  else if (dir === 'down') row = Math.min(FROG_MAX_ROW, row + 1);
  else if (dir === 'left') x = Math.max(CELL / 2, x - CELL);
  else if (dir === 'right') x = Math.min(W - CELL / 2, x + CELL);
  else return false;
  f.face = dir; f.pose = POSE_OF[dir];
  if (row === f.row && x === f.x) { f.frame = 0; return false; }   // clamped: nothing to do
  f.fromRow = f.row; f.row = row; f.x = x; f.col = colOf(x);
  f.mode = 'hop'; f.hopT = 0; f.frame = 1; f.onItem = null;
  g.stats.hops++;
  g.bus.emit('hop', { fromRow: f.fromRow, toRow: row, dir });
  g.sfx('hop', f.x, rowY(f.fromRow));
  g.fx('dust', f.x, rowY(f.fromRow));
  return true;
}

function riverDeath(g, row, x, t, wasOn) {
  if (crocBiteAt(g, row, x, t)) return 'croc';
  const p = platformAt(g, row, x, t);
  if (p && wasOn && wasOn.id === p.id && KINDS[p.type]?.dives && turtleState(p, t) === 'down') return 'turtle';
  return 'water';
}

/** Evaluate the cell the frog is in. Returns a death reason or null; sets onItem/mode for river rows. */
function checkSupport(g, justLanded) {
  const f = g.frog, t = g.t;
  if (isRiverRow(f.row)) {
    const it = supportAt(g, f.row, f.x, t);
    if (it) {
      if (justLanded) g.sfx('hop_log', f.x, rowY(f.row));
      f.onItem = { lane: f.row, id: it.id }; f.mode = 'ride';
      return null;
    }
    return riverDeath(g, f.row, f.x, t, f.onItem);
  }
  if (isRoadRow(f.row)) {
    if (hitVehicle(g, f.row, f.x, t)) return 'car';
    if (justLanded && f.fromRow !== f.row && isRoadRow(f.fromRow) && hitVehicle(g, f.fromRow, f.x, t)) return 'car';
  }
  f.onItem = null; f.mode = 'idle';
  return null;
}

export function collectPickups(g) {
  const f = g.frog;
  const lane = laneOf(g, f.row);
  if (!lane || (f.mode !== 'idle' && f.mode !== 'ride')) return;
  for (const it of lane.items) {
    if (!it.pickup || g.pickups.has(it.id)) continue;
    const hit = itemOverlap({ items: [it], dir: lane.dir, speed: lane.speed, loop: lane.loop }, f.x, g.t, 0);
    if (!hit) continue;
    g.pickups.add(it.id);
    const value = SCORES.treasure[it.pickup] ?? 0;
    g.addScore(value, 'pickup');
    g.bus.emit('pickup', { type: it.pickup, value, x: f.x, y: rowY(f.row) });
    g.sfx('pickup', f.x, rowY(f.row));
    g.fx('sparkle', f.x, rowY(f.row));
    g.popup('+' + value, f.x, rowY(f.row) - 8);
  }
}

function resolveBay(g) {
  const f = g.frog;
  let best = 0, bd = Infinity;
  for (let i = 0; i < g.bays.length; i++) { const d = Math.abs(f.x - colX(g.bays[i].col)); if (d < bd) { bd = d; best = i; } }
  const bay = g.bays[best];
  if (bd > TUNING.bayReach || bay.filled) return 'hedge';
  if (bay.hazard) return bay.hazard;
  const timeBonus = Math.max(0, Math.floor(g.timeLeft)) * SCORES.bayTimePerSec;
  bay.filled = true; g.filled[best] = true;
  let bonusScore = 0;
  const bonus = bay.bonus;
  if (bonus) bonusScore = SCORES[bonus] ?? 0;
  const total = SCORES.bay + timeBonus + bonusScore;
  g.addScore(total, 'bay');
  g.stats.baysFilled++;
  f.mode = 'home'; f.pose = 'home'; f.frame = 0; f.hopT = 0; f.onItem = null; f.x = colX(bay.col);
  g.bus.emit('bay', { idx: best, bonus: bonus || undefined, timeBonus, score: total });
  g.sfx(bonus ? 'bonus' : 'bay_fill', f.x, rowY(1));
  g.fx('confetti', f.x, rowY(1));
  g.popup('+' + total, f.x, rowY(1) + 4);
  return null;
}

/** Landing at the end of a hop. Returns a death reason or null. */
function land(g) {
  const f = g.frog;
  f.hopT = 0; f.frame = 2; f.mode = 'idle';
  if (f.row === ROW.bays) {
    const r = resolveBay(g);
    if (r) return r;
    g.scoreRow(1);
    g.onBayFilled();
    return null;
  }
  const r = checkSupport(g, true);
  if (r) return r;
  g.scoreRow(f.row);
  collectPickups(g);
  return null;
}

/** One frog step. Called only in state 'play'. */
export function stepFrog(g, dt, hop) {
  let f = g.frog;
  if (f.inv > 0) f.inv = Math.max(0, f.inv - dt);
  if ((f.mode === 'idle' || f.mode === 'ride') && f.frame === 2) f.frame = 0;

  if (f.mode === 'hop') {
    if (hop) g.buf = { dir: hop, left: TUNING.hopBuffer + dt };   // dt compensates for this tick's decay below
    if (g.buf) g.buf.left -= dt;
    f.hopT = Math.min(1, f.hopT + dt / TUNING.hopTime);
    if (f.hopT >= 1) {
      const r = land(g);
      if (r) { g.kill(r); return; }
      f = g.frog;
      if (f.mode === 'home') return;
      const b = g.buf; g.buf = null;
      if (b && b.left > 0 && (f.mode === 'idle' || f.mode === 'ride')) startHop(g, b.dir);
    }
    return;
  }
  if (f.mode !== 'idle' && f.mode !== 'ride') return;

  if (hop && startHop(g, hop)) { g.buf = null; return; }

  if (f.mode === 'ride') {
    const lane = g.lanes[f.row];
    if (lane) f.x += lane.dir * lane.speed * dt;
    f.col = colOf(f.x);
    if (f.x < -TUNING.edgeDeath || f.x > W + TUNING.edgeDeath) { g.kill('offscreen'); return; }
  }
  const r = checkSupport(g, false);
  if (r) { g.kill(r); return; }
  collectPickups(g);
}

