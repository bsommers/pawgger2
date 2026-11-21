// Renderer (owner: render). Draws 240x256 into an offscreen buffer, integer-scales it (pixelated) onto the canvas,
// letterboxed black, with optional CRT. Subscribes to the bus at construction (particles). Browser-oriented, but the
// painters it calls are Node-testable (see test/render.test.mjs, which injects a fake surface factory).
import { W, H } from '../core/defs.js';
import { drawText } from '../ui/font.js';
import { createParticles } from './particles.js';
import { createCRT } from './crt.js';
import { makeSurface, spritesFor, paintWorld } from './scene.js';
import { drawGround } from './background.js';

export function createRenderer(canvas, { bus, art, settings } = {}) {
  const ctx = canvas.getContext('2d');
  const buf = makeSurface(W, H), bctx = buf.getContext('2d');
  const sp = spritesFor(art);
  const particles = createParticles(bus);
  const crt = createCRT(makeSurface);
  const memo = {};
  const r = { hud: null, overlay: null, particles, crt: !!(settings && settings.crt), view: { x: 0, y: 0, w: W, h: H, scale: 1 } };
  let ground = null, last = null;

  function getGround() {   // static layers cached once (they do not depend on the level)
    if (!ground) { ground = makeSurface(W, H); const c = ground.getContext('2d'); c.imageSmoothingEnabled = false; drawGround(c, sp); }
    return ground;
  }
  function resize() {
    const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1;
    const cw = Math.max(W, Math.floor((canvas.clientWidth || (typeof innerWidth === 'number' ? innerWidth : W)) * dpr));
    const ch = Math.max(H, Math.floor((canvas.clientHeight || (typeof innerHeight === 'number' ? innerHeight : H)) * dpr));
    canvas.width = cw; canvas.height = ch;
    const scale = Math.max(1, Math.floor(Math.min(cw / W, ch / H)));
    r.view = { scale, w: W * scale, h: H * scale, x: Math.floor((cw - W * scale) / 2), y: Math.floor((ch - H * scale) / 2) };
  }
  function draw(game, alpha = 1) {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    particles.update(last === null ? 0 : (now - last) / 1000); last = now;
    if (!canvas.width || !r.view.scale) resize();
    bctx.imageSmoothingEnabled = false;
    bctx.fillStyle = '#000'; bctx.fillRect(0, 0, W, H);
    const sh = particles.shakeOffset();
    bctx.save(); bctx.translate(sh.x, sh.y);
    paintWorld(bctx, sp, game, getGround(), memo, particles);
    bctx.restore();
    if (r.hud) r.hud(bctx, game);
    if (r.overlay) r.overlay(bctx);
    const v = r.view;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buf, 0, 0, W, H, v.x, v.y, v.w, v.h);
    if (r.crt) crt.draw(ctx, v.x, v.y, v.w, v.h, v.scale);
  }
  Object.assign(r, {
    draw, resize,
    setCRT(on) { r.crt = !!on; },
    shot() { return typeof canvas.toDataURL === 'function' ? canvas.toDataURL('image/png') : null; },
    buffer: buf,
    dispose() { particles.dispose(); },
  });
  resize();
  return r;
}
export { drawText };
