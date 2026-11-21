// CRT filter (owner: render): scanlines + vignette, drawn on the final (scaled) canvas. Node-safe import.
export function createCRT(makeSurface) {
  let vig = null, vigKey = '';
  return {
    /** ctx = destination context; (x,y,w,h) = the image rect on screen; scale = integer pixel scale. */
    draw(ctx, x, y, w, h, scale) {
      const lh = Math.max(1, Math.floor(scale / 3));
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (let py = y + scale - lh; py < y + h; py += scale) ctx.fillRect(x, py, w, lh);
      const key = w + 'x' + h;
      if (!vig || vigKey !== key) {
        vigKey = key; vig = null;
        try {
          const s = makeSurface(w, h), c = s.getContext('2d');
          const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
          g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
          c.fillStyle = g; c.fillRect(0, 0, w, h); vig = s;
        } catch { vig = null; }
      }
      if (vig) ctx.drawImage(vig, x, y);
      ctx.restore();
    },
  };
}
