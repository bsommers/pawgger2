#!/usr/bin/env node
// Autopilot soak: plays levels 1..N over several seeds with the real sim and reports bays, deaths and time per level.
// Usage: node tools/botplay.mjs [--levels 12] [--seeds 4] [--skill 1] [--limit 240] [--lives 99] [--verbose]
// Exit code 1 if any level times out (exceeds --limit sim seconds), ends in gameover, or the bot throws.
import { createGame } from '../src/sim/game.js';
import { createAutopilot } from '../src/sim/autopilot.js';
import { generateLevel } from '../src/levels/lanegen.js';
import { START_LIVES } from '../src/core/defs.js';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (typeof d === 'boolean' ? true : Number(process.argv[i + 1])); };
const LEVELS = arg('levels', 12), SEEDS = arg('seeds', 4), SKILL = arg('skill', 1), LIMIT = arg('limit', 240), VERBOSE = arg('verbose', false);
const BOT_LIVES = arg('lives', START_LIVES);

export function playLevel(level, seed, { skill = SKILL, limit = LIMIT, lives = BOT_LIVES } = {}) {
  const g = createGame({ seed, level, levelAt: generateLevel });
  g.lives = lives;
  const ap = createAutopilot(g, { skill, seed });
  const dt = 1 / 60, max = Math.ceil(limit * 60);
  let n = 0, result = 'timeout';
  const ms0 = Date.now();
  const deaths = {};
  g.bus.on('life', (e) => { deaths[e.reason] = (deaths[e.reason] ?? 0) + 1; });
  try {
    while (n < max) {
      g.update(dt, ap.step(dt)); n++;
      if (g.level !== level) { result = 'clear'; break; }
      if (g.state === 'gameover') { result = 'gameover'; break; }
    }
  } catch (e) { result = 'error: ' + e.message; }
  return { level, seed, result, bays: g.stats.baysFilled, deaths: g.stats.deaths, deathReasons: deaths, time: +(n * dt).toFixed(1), ms: Date.now() - ms0, ...ap.stats };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0; const rows = [];
  for (let L = 1; L <= LEVELS; L++) {
    const rs = [];
    for (let s = 1; s <= SEEDS; s++) { const r = playLevel(L, s); rs.push(r); if (r.result !== 'clear') bad++; if (VERBOSE || r.result !== 'clear') console.log(JSON.stringify(r)); }
    const sum = (k) => rs.reduce((a, r) => a + r[k], 0);
    const clears = rs.filter((r) => r.result === 'clear').length;
    rows.push(`L${String(L).padStart(2)}  clear ${clears}/${SEEDS}  bays ${sum('bays')}/${5 * SEEDS}  deaths ${sum('deaths')}  avg time ${(sum('time') / SEEDS).toFixed(1)}s  max ${Math.max(...rs.map((r) => r.time)).toFixed(1)}s  cpu ${sum('ms')}ms`);
    console.log(rows[rows.length - 1]);
  }
  console.log(bad ? `FAIL: ${bad} level runs did not clear` : `OK: all ${LEVELS * SEEDS} level runs cleared (skill ${SKILL})`);
  process.exit(bad ? 1 : 0);
}
