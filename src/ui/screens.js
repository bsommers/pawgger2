// Screens (owner ui-shell): title, how to play, options, pause, game over, level clear. All drawn into the 240x256 buffer.
// createScreens({ sp }) -> { drawTitle, drawHowTo, drawOptions, drawPause, drawGameOver, drawLevelClear }
import { W, PAL, SCORES } from '../core/defs.js';
import { drawText } from './font.js';

const shade = (ctx, y, h, a = 0.72) => { ctx.fillStyle = `rgba(10,7,16,${a})`; ctx.fillRect(0, y, W, h); };
const pad = (n, w) => String(Math.max(0, Math.floor(n))).padStart(w, '0');

export function createScreens({ sp = null, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) } = {}) {
  const sprite = (ctx, name, frame, x, y, o) => { try { if (sp) sp.draw(ctx, name, frame, x, y, o); } catch { /* art missing: skip */ } };
  const blink = (ms = 450) => Math.floor(now() / ms) % 2 === 0;
  const title = (ctx, text, y, color = PAL.gold) => drawText(ctx, text, W / 2, y, { color, scale: 2, align: 'center' });

  function menuList(ctx, menu, x, y, step = 12) {
    menu.items.forEach((it, i) => {
      const sel = i === menu.index;
      if (sel) sprite(ctx, 'cursor_paw', Math.floor(now() / 300) % 2, x - 14, y + i * step - 1);
      drawText(ctx, it.label(), x, y + i * step, { color: sel ? PAL.gold : PAL.white });
    });
  }

  return {
    /** Title overlay over the attract scene. menu = createMenu(...), hi = hi-score list. */
    drawTitle(ctx, menu, hi = []) {
      shade(ctx, 0, 60, 0.55);
      sprite(ctx, 'logo', 0, 16, 6);
      drawText(ctx, 'COLBY VS PERRING PARKWAY PETE', W / 2, 56, { color: PAL.white, align: 'center' });
      shade(ctx, 140, 84, 0.78);
      menuList(ctx, menu, 78, 148);
      drawText(ctx, 'HI-SCORES', W / 2, 188, { color: PAL.red, align: 'center' });
      hi.slice(0, 3).forEach((e, i) => drawText(ctx, `${i + 1}. ${e.name}  ${pad(e.score, 6)}`, W / 2, 198 + i * 10, { color: PAL.white, align: 'center' }));
      if (blink()) drawText(ctx, 'PRESS SPACE', W / 2, 232, { color: PAL.hudTxt, align: 'center' });
    },
    drawHowTo(ctx) {
      shade(ctx, 0, 256, 0.9);
      title(ctx, 'HOW TO PLAY', 10);
      const L = ['ARROWS OR WASD: HOP ONE TILE', 'SPACE: CONFIRM   P: PAUSE', 'M: MUTE  C: CRT  F: FULLSCREEN', '',
        'DODGE PETE\'S TRAFFIC ON', 'PERRING PARKWAY, THEN RIDE', 'LOGS AND TURTLES ACROSS THE', 'RIVER. CROCS BITE, TURTLES DIVE.', '',
        'FILL ALL 5 HOME BAYS BEFORE', 'THE TIMER RUNS OUT.', 'DONT HOP IN THE HEDGE!', '', `BAY ${SCORES.bay}  ROW ${SCORES.forwardRow}  ALL ${SCORES.allBays}`];
      L.forEach((s, i) => drawText(ctx, s, W / 2, 36 + i * 11, { color: PAL.white, align: 'center' }));
      if (blink()) drawText(ctx, 'PRESS SPACE', W / 2, 232, { color: PAL.hudTxt, align: 'center' });
    },
    drawOptions(ctx, menu) {
      shade(ctx, 0, 256, 0.9);
      title(ctx, 'OPTIONS', 20);
      menuList(ctx, menu, 56, 70, 16);
      drawText(ctx, 'LEFT/RIGHT CHANGES', W / 2, 220, { color: PAL.hudDim, align: 'center' });
    },
    drawPause(ctx) {
      shade(ctx, 96, 64);
      title(ctx, 'PAUSED', 106);
      drawText(ctx, 'P OR ESC TO RESUME', W / 2, 130, { color: PAL.white, align: 'center' });
      drawText(ctx, 'Q: QUIT TO TITLE', W / 2, 142, { color: PAL.hudDim, align: 'center' });
    },
    /** info: { score, level, entry (createNameEntry or null), hi (list), rank (-1 none) } */
    drawGameOver(ctx, info) {
      shade(ctx, 0, 256, 0.82);
      title(ctx, 'GAME OVER', 16, PAL.red);
      drawText(ctx, 'SCORE ' + pad(info.score, 6), W / 2, 44, { color: PAL.white, align: 'center' });
      drawText(ctx, 'LEVEL ' + info.level, W / 2, 55, { color: PAL.white, align: 'center' });
      let y = 72;
      if (info.entry && !info.entry.done) {
        drawText(ctx, 'NEW HI-SCORE! ENTER NAME', W / 2, y, { color: PAL.gold, align: 'center' });
        info.entry.letters.forEach((c, i) => {
          const x = 96 + i * 18, sel = i === info.entry.pos;
          drawText(ctx, c, x, y + 16, { color: sel ? PAL.gold : PAL.white, scale: 2 });
          if (sel && blink(300)) { ctx.fillStyle = PAL.gold; ctx.fillRect(x, y + 32, 10, 2); }
        });
        y += 46;
      } else y += 6;
      drawText(ctx, 'HI-SCORES', W / 2, y, { color: PAL.red, align: 'center' }); y += 12;
      (info.hi || []).slice(0, 8).forEach((e, i) => {
        const me = i === info.rank;
        drawText(ctx, `${i + 1}. ${e.name}  ${pad(e.score, 6)}`, W / 2, y + i * 10, { color: me ? PAL.gold : PAL.white, align: 'center' });
      });
      if (!info.entry || info.entry.done) { if (blink()) drawText(ctx, 'PRESS SPACE', W / 2, 232, { color: PAL.hudTxt, align: 'center' }); }
      else drawText(ctx, 'ARROWS/LETTERS + SPACE', W / 2, 232, { color: PAL.hudDim, align: 'center' });
    },
    /** Level clear overlay; g is the game (state 'levelclear'). */
    drawLevelClear(ctx, g) {
      shade(ctx, 88, 80, 0.7);
      title(ctx, `LEVEL ${g.level} CLEAR!`, 96);
      for (let i = 0; i < 5; i++) sprite(ctx, 'colby_home', Math.floor(now() / 200 + i) % 2, 40 + i * 32, 118);
      drawText(ctx, 'SCORE ' + pad(g.score, 6), W / 2, 142, { color: PAL.white, align: 'center' });
      drawText(ctx, `BAYS ${g.stats ? g.stats.baysFilled : 0}   HOPS ${g.stats ? g.stats.hops : 0}`, W / 2, 153, { color: PAL.hudDim, align: 'center' });
    },
  };
}
