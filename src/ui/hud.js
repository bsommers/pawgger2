// HUD (owner ui-shell): top row score/HI, bottom rows lives, time bar, level, Pete taunt banner.
// createHud({ bus, sp, now }) -> { draw(ctx, game), dispose() }. sp is the render sprite cache ({ draw(ctx,name,frame,x,y) }).
import { W, H, PAL } from '../core/defs.js';
import { drawText } from './font.js';

const pad = (n, w) => String(Math.max(0, Math.floor(n))).padStart(w, '0');

export function createHud({ bus = null, sp = null, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) } = {}) {
  let taunt = null;   // { text, until }
  const off = bus ? bus.on('taunt', (e) => { taunt = { text: String(e.text ?? ''), until: now() + (e.dur ?? 2.5) * 1000 }; }) : null;
  const sprite = (ctx, name, frame, x, y) => { try { if (sp) sp.draw(ctx, name, frame, x, y); } catch { /* art missing: skip */ } };

  function draw(ctx, g) {
    if (!g) return;
    const t = now();
    // top row
    drawText(ctx, '1UP', 6, 2, { color: PAL.red });
    drawText(ctx, pad(g.score, 6), 6, 9, { color: PAL.white });
    drawText(ctx, 'HI', 96, 2, { color: PAL.red });
    drawText(ctx, pad(Math.max(g.hi ?? 0, g.score), 6), 96, 9, { color: PAL.white });
    // bottom panel
    ctx.fillStyle = PAL.hudBg; ctx.fillRect(0, 224, W, H - 224);
    ctx.fillStyle = PAL.outline; ctx.fillRect(0, 224, W, 1);
    const lives = Math.max(0, g.lives ?? 0);
    for (let i = 0; i < Math.min(lives, 8); i++) sprite(ctx, 'colby_life', 0, 4 + i * 9, 228);
    // time bar
    const limit = g.timeLimit || 1, f = Math.min(1, Math.max(0, (g.timeLeft ?? 0) / limit));
    const low = (g.timeLeft ?? 0) < 6;
    const bx = 84, bw = 100, by = 229;
    ctx.fillStyle = PAL.outline; ctx.fillRect(bx - 1, by - 1, bw + 2, 8);
    const blink = low && Math.floor(t / 200) % 2 === 0;
    ctx.fillStyle = low ? (blink ? PAL.red : PAL.carRedD) : f < 0.5 ? PAL.carYellow : PAL.green;
    ctx.fillRect(bx, by, Math.round(bw * f), 6);
    drawText(ctx, 'TIME', 58, 229, { color: low ? PAL.red : PAL.hudTxt });
    drawText(ctx, 'LV ' + (g.level ?? 1), W - 6, 229, { color: PAL.hudTxt, align: 'right' });
    // taunt banner (row 15)
    if (taunt && t < taunt.until) {
      sprite(ctx, 'pete_head', Math.floor(t / 250) % 2, 2, 239);
      drawText(ctx, taunt.text, 22, 244, { color: PAL.white });
    } else if (g.state === 'play' && g.stats && g.stats.hops === 0) {
      drawText(ctx, 'ARROWS OR WASD TO HOP', W / 2, 244, { color: PAL.hudDim, align: 'center' });
    }
    // intro banner
    if (g.state === 'intro') {
      ctx.fillStyle = 'rgba(10,7,16,0.7)'; ctx.fillRect(0, 108, W, 36);
      drawText(ctx, 'LEVEL ' + g.level, W / 2, 114, { color: PAL.gold, scale: 2, align: 'center' });
      drawText(ctx, 'GET HOME, COLBY!', W / 2, 132, { color: PAL.white, align: 'center' });
    }
  }
  return { draw, dispose() { if (off) off(); } };
}
