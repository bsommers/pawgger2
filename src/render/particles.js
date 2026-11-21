// Particles, popups and screen shake (owner: render). Driven by bus events 'fx', 'popup', 'shake'.
// Node-safe: no DOM. Advance with update(dt) (wall time), paint with draw(ctx, sprites, drawText).
import { PAL } from '../core/defs.js';

const FX = {   // event type -> sprite name, duration (s), frames come from the art registry
  splash: ['fx_splash', 0.45], dust: ['fx_dust', 0.3], sparkle: ['fx_sparkle', 0.5], squash: ['fx_squash', 0.5],
  poof: ['fx_poof', 0.45], ripple: ['fx_ripple', 0.7], smoke: ['fx_smoke', 0.5],
};
const CONFETTI = [PAL.shieldY, PAL.shieldR, PAL.shirtL, PAL.leafHL, PAL.nose, PAL.white];
export const MAX_PARTICLES = 160;   // hard cap (bounded even if the bus floods)

export function createParticles(bus) {
  const list = [];   // { kind:'sprite'|'confetti'|'popup', ... , t, dur }
  let shakeMag = 0, shakeDur = 0, shakeT = 0, clock = 0;
  const push = (p) => { if (list.length >= MAX_PARTICLES) list.shift(); list.push(p); };

  const onFx = (e) => {
    if (!e) return;
    const type = e.type;
    if (type === 'confetti') {
      const n = Math.min(28, e.opts?.n ?? 20);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + i * 0.7, sp = 40 + ((i * 37) % 50);
        push({ kind: 'confetti', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, c: CONFETTI[i % CONFETTI.length], t: 0, dur: 0.9 + (i % 5) * 0.1 });
      }
      return;
    }
    const f = FX[type];
    if (f) push({ kind: 'sprite', name: f[0], x: e.x, y: e.y, t: 0, dur: f[1] });
  };
  const onPopup = (e) => { if (e && e.text != null) push({ kind: 'popup', text: String(e.text), x: e.x, y: e.y, color: e.color ?? PAL.hudTxt, t: 0, dur: 0.9 }); };
  const onShake = (e) => { if (!e) return; shakeMag = Math.max(shakeMag * (shakeT < shakeDur ? 1 - shakeT / shakeDur : 0), e.mag ?? 2); shakeDur = e.dur ?? 0.25; shakeT = 0; };
  const offs = bus ? [bus.on('fx', onFx), bus.on('popup', onPopup), bus.on('shake', onShake)] : [];

  return {
    list, onFx, onPopup, onShake,
    update(dt) {
      dt = Math.max(0, Math.min(dt, 0.1)); clock += dt;
      if (shakeT < shakeDur) shakeT += dt;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]; p.t += dt;
        if (p.kind === 'confetti') { p.vy += 120 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
        if (p.t >= p.dur) list.splice(i, 1);
      }
    },
    /** Integer pixel offset for this frame (deterministic in clock). */
    shakeOffset() {
      if (shakeT >= shakeDur || shakeMag <= 0) return { x: 0, y: 0 };
      const k = 1 - shakeT / shakeDur, m = shakeMag * k, s = Math.floor(clock * 60);
      return { x: Math.round(Math.sin(s * 12.9898) * m), y: Math.round(Math.cos(s * 78.233) * m) };
    },
    /** sprites.draw(ctx, name, frame, x, y, opts); text(ctx, str, x, y, opts). */
    draw(ctx, sprites, text) {
      for (const p of list) {
        const u = p.t / p.dur;
        if (p.kind === 'sprite') {
          const n = sprites.frames(p.name), fr = Math.min(n - 1, Math.floor(u * n)), s = sprites.size(p.name);
          sprites.draw(ctx, p.name, fr, Math.round(p.x - s.w / 2), Math.round(p.y - s.h / 2));
        } else if (p.kind === 'confetti') {
          ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
        } else if (p.kind === 'popup' && text) {
          text(ctx, p.text, Math.round(p.x), Math.round(p.y - 14 * u - 4), { align: 'center', color: p.color, shadow: PAL.black });
        }
      }
    },
    clear() { list.length = 0; shakeT = shakeDur = 0; },
    dispose() { offs.forEach((o) => o && o()); },
  };
}
