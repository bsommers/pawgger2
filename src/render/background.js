// Backdrop painters (owner: render): sky bands, sun/moon, stars, clouds, skyline, jungle strip, and the static ground
// (bank + bays + hedge, median, road, start strip). `sp` is a sprite helper from scene.js createSprites().
import { W, CELL, COLS, ROW, BAY_COLS, PAL, skyForLevel, isNight } from '../core/defs.js';

const roadRows = [8, 9, 10, 11, 12];

/** Sky behind the HUD-top skyline: 7 bands over row 0 (y 0..15), sun/moon, stars, drifting clouds, then the skyline. */
export function drawSky(ctx, sp, level, t = 0) {
  const sky = skyForLevel(level), n = sky.bands.length, h = CELL;
  for (let i = 0; i < n; i++) {
    const y0 = Math.round((i * h) / n), y1 = Math.round(((i + 1) * h) / n);
    ctx.fillStyle = sky.bands[i]; ctx.fillRect(0, y0, W, y1 - y0);
  }
  // sun / moon: tinted disc low on the horizon, moving a little per level
  const sunX = 24 + (((level - 1) % 5) * 44) % (W - 48);
  sp.draw(ctx, 'sun', 0, sunX, -4, { tint: sky.sun });
  if (sky.star > 0.05) {
    const count = Math.round(14 * sky.star);
    for (let i = 0; i < count; i++) {
      const sx = (i * 53 + 17) % (W - 4), sy = (i * 29 + 3) % 12;
      sp.draw(ctx, 'star', Math.floor(t * 2 + i) % 2, sx, sy, { alpha: Math.min(1, sky.star + 0.2) });
    }
  }
  if (sky.star < 0.7) for (let i = 0; i < 3; i++) {
    const cw = 40, x = (((i * 97 + t * (3 + i)) % (W + cw)) + (W + cw)) % (W + cw) - cw;
    sp.draw(ctx, 'cloud', i, Math.round(x), -6 + i * 2, { alpha: 0.9 });
  }
  const sh = sp.size('bg_skyline').h;
  sp.draw(ctx, 'bg_skyline', 0, 0, CELL - sh);
}

/** Static ground: HUD-bottom strip, bank row 1 with bays and hedge, median, road, start. Transparent over row 0. */
export function drawGround(ctx, sp) {
  // bottom HUD backing + jungle canopy
  ctx.fillStyle = PAL.hudBg; ctx.fillRect(0, 14 * CELL, W, 2 * CELL);
  const jh = sp.size('bg_jungle').h;
  sp.draw(ctx, 'bg_jungle', 0, 0, 16 * CELL - jh);
  // water backing (animated tiles are drawn per frame on top)
  ctx.fillStyle = PAL.water; ctx.fillRect(0, 2 * CELL, W, 5 * CELL);
  // bank row 1, then hedge and empty bays (bays are drawn "filled" by the dynamic pass when needed)
  for (let c = 0; c < COLS; c++) {
    const y = ROW.bays * CELL;
    sp.draw(ctx, 'tile_bank', 0, c * CELL, y);
    if (BAY_COLS.includes(c)) sp.draw(ctx, 'bay_empty', 0, c * CELL, y);
    else sp.draw(ctx, 'tile_hedge', (c + (c >> 2)) & 1, c * CELL, y);
  }
  // median row 7
  for (let c = 0; c < COLS; c++) sp.draw(ctx, 'tile_median', (c * 7 + 3) & 1, c * CELL, 7 * CELL);
  // road rows 8..12 with kerbs and lane dividers
  for (const r of roadRows) for (let c = 0; c < COLS; c++) {
    const x = c * CELL, y = r * CELL;
    if (r === 8) sp.draw(ctx, 'tile_road_edge', 1, x, y);
    else if (r === 12) sp.draw(ctx, 'tile_road_edge', 0, x, y);
    else if (r === 9 || r === 10 || r === 11) sp.draw(ctx, 'tile_road_line', 0, x, y);
    else sp.draw(ctx, 'tile_road', (c + r) & 1, x, y);
  }
  // divider between lanes 11 and 12 (row 12 uses the kerb tile, so paint the dashes directly)
  ctx.fillStyle = PAL.lane;
  for (let x = 2; x < W; x += 16) ctx.fillRect(x, 12 * CELL, 8, 1);
  // start strip row 13
  for (let c = 0; c < COLS; c++) sp.draw(ctx, 'tile_start', (c * 5 + 1) & 1, c * CELL, 13 * CELL);
}

export { isNight };
