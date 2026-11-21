// Touch overlay (owner ui-shell): d-pad of four touch_btn + touch_arrow drawn into the 240x256 buffer, hit-tested in logical coords.
// createTouch({ input, sp, enabled }) -> { enabled, draw(ctx), hit(x, y), down(x, y, id), up(id), attach(canvas, getView), dispose() }
import { W } from '../core/defs.js';

const B = 32;
// Left/right bottom-left, up/down bottom-right. Drawn semi-transparent so the playfield stays readable.
export const BUTTONS = Object.freeze([
  { dir: 'left', x: 4, y: 186, arrow: 3 }, { dir: 'right', x: 40, y: 186, arrow: 1 },
  { dir: 'up', x: W - B - 4, y: 154, arrow: 0 }, { dir: 'down', x: W - B - 4, y: 190, arrow: 2 },
]);

export function createTouch({ input, sp = null, enabled = false } = {}) {
  const held = new Map();   // pointer id -> dir
  const t = {
    enabled,
    hit(x, y) { for (const b of BUTTONS) if (x >= b.x && x < b.x + B && y >= b.y && y < b.y + B) return b.dir; return null; },
    /** Pointer down in logical coords: returns the dir pressed (hop latched + UI action), or null. */
    down(x, y, id = 0) {
      const d = t.hit(x, y);
      if (d) { held.set(id, d); if (input) { input.press(d); input.act(d); } }
      return d;
    },
    up(id = 0) { held.delete(id); },
    draw(ctx) {
      if (!t.enabled || !sp) return;
      const pressed = new Set(held.values());
      const a = ctx.globalAlpha; ctx.globalAlpha = 0.5;
      try {
        for (const b of BUTTONS) {
          sp.draw(ctx, 'touch_btn', pressed.has(b.dir) ? 1 : 0, b.x, b.y);
          sp.draw(ctx, 'touch_arrow', b.arrow, b.x + 8, b.y + 8);
        }
      } catch { /* art missing */ }
      ctx.globalAlpha = a;
    },
    /** Wire pointer events on the canvas; getView() returns the renderer view { x, y, scale } in canvas pixels. */
    attach(canvas, getView, onTapElsewhere = () => {}) {
      const to = (ev) => {
        const r = canvas.getBoundingClientRect(), v = getView();
        const sx = canvas.width / (r.width || 1), sy = canvas.height / (r.height || 1);
        return [((ev.clientX - r.left) * sx - v.x) / v.scale, ((ev.clientY - r.top) * sy - v.y) / v.scale];
      };
      const pd = (ev) => {
        if (ev.pointerType === 'touch' || ev.pointerType === 'pen') t.enabled = true;
        const [x, y] = to(ev);
        if (!t.down(x, y, ev.pointerId)) onTapElsewhere(x, y);
        if (ev.preventDefault) ev.preventDefault();
      };
      const pu = (ev) => t.up(ev.pointerId);
      canvas.addEventListener('pointerdown', pd); canvas.addEventListener('pointerup', pu); canvas.addEventListener('pointercancel', pu);
      t.dispose = () => { canvas.removeEventListener('pointerdown', pd); canvas.removeEventListener('pointerup', pu); canvas.removeEventListener('pointercancel', pu); };
    },
    dispose() {},
  };
  return t;
}
