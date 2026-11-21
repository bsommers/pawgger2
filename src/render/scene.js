// Scene painters (owner: render). Pure functions of (ctx, sprites, game state, time). No DOM at import time.
// Surfaces (canvases) come from a factory so Node tests can inject a fake.
import { W, H, CELL, COLS, ROW, BAY_COLS, PAL, KINDS, itemW, itemLeft, turtleState, crocMouth, isNight, skyForLevel, rowY, TUNING } from '../core/defs.js';
import { drawText } from '../ui/font.js';
import { drawSky, drawGround } from './background.js';

let factory = null;
/** Inject a surface factory (w,h) -> object with getContext('2d') (tests). */
export function setSurfaceFactory(fn) { factory = fn; }
export function makeSurface(w, h) {
  if (factory) return factory(w, h);
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  throw new Error('no canvas available (call setSurfaceFactory in Node)');
}

const hexToRgb = (c) => [1, 3, 5].map((o) => parseInt(c.slice(o, o + 2), 16));

/** Sprite cache over the art registry: PixBuf -> canvas per (name, frame, flip, tint). */
export function createSprites(art) {
  const cache = new Map();
  function surfaceFor(name, frame, flip, tint) {
    const fr = ((Math.floor(frame) % art.frames(name)) + art.frames(name)) % art.frames(name);
    const key = name + '|' + fr + '|' + (flip ? 1 : 0) + '|' + (tint || '');
    let s = cache.get(key);
    if (!s) {
      let pb = art.get(name, fr);
      if (flip) pb = pb.flipX();
      s = makeSurface(pb.w, pb.h);
      const c = s.getContext('2d'), img = c.createImageData(pb.w, pb.h);
      img.data.set(pb.rgba);
      if (tint) {   // multiply the disc by a tint (sun/moon)
        const [r, g, b] = hexToRgb(tint);
        for (let i = 0; i < img.data.length; i += 4) { img.data[i] = img.data[i] * r / 255; img.data[i + 1] = img.data[i + 1] * g / 255; img.data[i + 2] = img.data[i + 2] * b / 255; }
      }
      c.putImageData(img, 0, 0);
      cache.set(key, s);
    }
    return s;
  }
  return {
    cache,
    size: (n) => art.size(n),
    frames: (n) => art.frames(n),
    draw(ctx, name, frame, x, y, o) {
      const s = surfaceFor(name, frame, o && o.flip, o && o.tint);
      if (o && o.alpha !== undefined && o.alpha !== 1) { const a = ctx.globalAlpha; ctx.globalAlpha = o.alpha; ctx.drawImage(s, x, y); ctx.globalAlpha = a; }
      else ctx.drawImage(s, x, y);
    },
  };
}
const spriteCaches = new WeakMap();
export function spritesFor(art) {
  let s = spriteCaches.get(art);
  if (!s) { s = createSprites(art); spriteCaches.set(art, s); }
  return s;
}

const RIVER_ROWS = [2, 3, 4, 5, 6], ROAD_ROWS = [8, 9, 10, 11, 12];

/** Title screen and shot tool: sky + ground + water + lamps for a level at time t (no sim items). */
export function drawStatic(ctx, art, level = 1, t = 0) {
  const sp = spritesFor(art);
  drawSky(ctx, sp, level, t);
  drawGround(ctx, sp);
  drawWater(ctx, sp, t);
  if (isNight(level)) drawLamps(ctx, sp, t);
}

export function drawWater(ctx, sp, t) {
  const fr = Math.floor(t * 4) % 4;
  for (const r of RIVER_ROWS) for (let c = 0; c < COLS; c++) sp.draw(ctx, 'tile_water', fr, c * CELL, r * CELL);
}
export function drawLamps(ctx, sp, t) {
  for (const c of [2, 7, 12]) sp.draw(ctx, 'lamp', Math.floor(t * 2) % 2, c * CELL, ROW.median * CELL);
}

/** Bays: filled bays (+ Colby cheering), hazards and bonuses from g.bays. */
export function drawBays(ctx, sp, g) {
  const t = g.t ?? 0, bays = g.bays || [];
  for (const b of bays) {
    const x = (b.col ?? BAY_COLS[b.idx]) * CELL, y = CELL;
    if (b.filled) {
      sp.draw(ctx, 'bay_filled', 0, x, y);
      sp.draw(ctx, 'colby_home', Math.floor(t * 4) % 2, x, y);
    } else if (b.hazard) {
      const h = (g.def?.bays?.hazards || []).find((q) => q.bay === b.idx);
      const el = h ? (((t + h.phase) % TUNING.bayHazardPeriod) + TUNING.bayHazardPeriod) % TUNING.bayHazardPeriod : 0;
      sp.draw(ctx, b.hazard === 'snake' ? 'bay_snake' : 'bay_croc', el > 1.0 ? 1 : 0, x, y);
    } else if (b.bonus) {
      sp.draw(ctx, b.bonus === 'fish' ? 'bay_fish' : 'bay_mouse', Math.floor(t * 4) % 2, x, y);
    }
  }
}

function visible(left, w) { return left < W && left + w > 0; }

/** River lanes: logs, turtles (one sprite per cell), crocs. Mirrored when dir < 0 (logs excepted). */
export function drawRiverItems(ctx, sp, g) {
  const t = g.t ?? 0;
  for (const row of RIVER_ROWS) {
    const lane = g.lanes?.[row];
    if (!lane) continue;
    const y = row * CELL, flip = lane.dir < 0;
    for (const it of lane.items) {
      const k = KINDS[it.type]; if (!k) continue;
      const w = itemW(it.type), left = Math.round(itemLeft(lane, it, t));
      if (!visible(left, w)) continue;
      if (k.dives) {
        const st = turtleState(it, t), fr = st === 'up' ? Math.floor(t * 3 + it.off / CELL) % 2 : st === 'warn' ? 2 + (Math.floor(t * 6) % 2) : 4;
        for (let c = 0; c < k.cells; c++) sp.draw(ctx, 'turtle', fr, left + c * CELL, y);
      } else if (it.type === 'croc') {
        sp.draw(ctx, 'croc_raft', crocMouth(it, t) === 'open' ? 1 : 0, left, y, { flip });
      } else sp.draw(ctx, k.sprite, 0, left, y, { flip: flip && !k.sprite.startsWith('log') });
    }
  }
}

/** Collectable pickups bob on their platform (not yet in g.pickups). */
export function drawPickups(ctx, sp, g) {
  const t = g.t ?? 0;
  for (const row of RIVER_ROWS) {
    const lane = g.lanes?.[row];
    if (!lane) continue;
    for (const it of lane.items) {
      if (!it.pickup || (g.pickups && g.pickups.has(it.id))) continue;
      const w = itemW(it.type), left = itemLeft(lane, it, t);
      if (!visible(left, w)) continue;
      sp.draw(ctx, 'tr_' + it.pickup, Math.floor(t * 4) % 3, Math.round(left + w / 2 - 6), row * CELL + 2);
    }
  }
}

function vehicleFrame(it, k, lane, left, t) {
  const wheel = Math.floor(t * 6 + it.off / CELL) % 2, v = it.variant ?? 0;
  switch (it.type) {
    case 'car': return (v % 3) * 2 + wheel;
    case 'truck': return (v % 2) * 2 + wheel;
    case 'cheese_roll': return ((Math.floor(Math.abs(left) / 4) % 4) + 4) % 4;
    case 'limo': {   // frame 1 = honk flash while sliding in from the entry edge
      const edge = lane.dir > 0 ? left + itemW('limo') : W - left;
      return edge > 0 && edge < 40 && Math.floor(t * 8) % 2 ? 1 : 0;
    }
    default: return wheel;
  }
}

/** Road lanes. Returns the list of headlight placements so the night pass can draw them after the dark overlay. */
export function drawRoadItems(ctx, sp, g, level = g.level ?? 1) {
  const t = g.t ?? 0, lights = [];
  for (const row of ROAD_ROWS) {
    const lane = g.lanes?.[row];
    if (!lane) continue;
    const y = row * CELL, flip = lane.dir < 0;
    for (const it of lane.items) {
      const k = KINDS[it.type]; if (!k) continue;
      const w = itemW(it.type), left = Math.round(itemLeft(lane, it, t));
      if (!visible(left, w)) continue;
      sp.draw(ctx, k.sprite, vehicleFrame(it, k, lane, left, t), left, y, { flip });
      if (it.type !== 'cheese_roll') lights.push({ x: flip ? left - CELL : left + w, y, flip });
    }
  }
  return lights;
}
export function drawHeadlights(ctx, sp, lights) {
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) sp.draw(ctx, 'headlight', 0, l.x, l.y, { flip: l.flip, alpha: 0.75 });
  ctx.globalCompositeOperation = op;
}

/** Pete's cheese roller and its warning on median row 7. */
export function drawRoller(ctx, sp, g) {
  const p = g.pete; if (!p) return;
  const y = 7 * CELL, dir = p.rollerDir ?? 1, t = g.t ?? 0;
  if (p.state === 'rollerWarn') sp.draw(ctx, 'roller_warn', Math.floor(t * 8) % 2, dir > 0 ? 0 : W - CELL, y, { flip: dir < 0 });
  else if (p.state === 'roller' && typeof p.rollerX === 'number') {
    const x = Math.round(p.rollerX - CELL / 2);
    sp.draw(ctx, 'cheese_roll', ((Math.floor(Math.abs(p.rollerX) / 4) * (dir > 0 ? 1 : -1)) % 4 + 4) % 4, x, y);
  }
}

/** Colby: pose/frame from state, blink while invulnerable, hop arc. `memo` carries the hop start x between frames. */
export function drawFrog(ctx, sp, g, memo = {}) {
  const f = g.frog; if (!f || f.mode === 'home' || !f.pose) return;
  let x = f.x, y = rowY(f.row), lift = 0;
  if (f.mode === 'hop') {
    const u = Math.max(0, Math.min(1, f.hopT || 0));
    if (memo.fromX === undefined) memo.fromX = memo.lastX ?? f.x;
    if (Math.abs(memo.fromX - f.x) <= CELL * 1.6) x = memo.fromX + (f.x - memo.fromX) * u;
    y = rowY(f.fromRow ?? f.row) + (rowY(f.row) - rowY(f.fromRow ?? f.row)) * u;
    lift = Math.sin(Math.PI * u) * 3;
  } else { memo.fromX = undefined; memo.lastX = f.x; }
  if (f.inv > 0 && Math.floor((g.t ?? 0) * 12) % 2) return;
  const name = 'colby_' + f.pose, flip = f.pose === 'side' && f.face === 'left';
  if (lift > 0.5) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(Math.round(x - 4), Math.round(y + 5), 8, 2); }
  sp.draw(ctx, name, f.frame ?? 0, Math.round(x - 8), Math.round(y - 8 - lift), { flip });
}

/** Dark blue wash over the playfield on dusk/night levels (strength follows the sky's star value). */
export function drawNightOverlay(ctx, level) {
  const a = 0.36 * skyForLevel(level).star;
  if (a <= 0.02) return;
  ctx.fillStyle = `rgba(8,10,44,${a.toFixed(3)})`;
  ctx.fillRect(0, CELL, W, 13 * CELL);
}

/** Whole world in painter order (everything below the shake/CRT/HUD stages). Returns nothing. */
export function paintWorld(ctx, sp, g, ground, memo, particles, dt) {
  const level = g.level ?? 1, t = g.t ?? 0, night = isNight(level);
  drawSky(ctx, sp, level, t);
  if (ground) ctx.drawImage(ground, 0, 0); else drawGround(ctx, sp);
  drawBays(ctx, sp, g);
  drawWater(ctx, sp, t);
  drawRiverItems(ctx, sp, g);
  drawPickups(ctx, sp, g);
  if (night) drawLamps(ctx, sp, t);
  const lights = drawRoadItems(ctx, sp, g, level);
  drawRoller(ctx, sp, g);
  drawFrog(ctx, sp, g, memo);
  if (particles) particles.draw(ctx, sp, drawText);
  drawNightOverlay(ctx, level);
  if (night) drawHeadlights(ctx, sp, lights);
}
export { W, H };
