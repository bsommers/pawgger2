// character-kit: a character spec -> sprites + animator.
//
// spec = {
//   name, size: [w, h],
//   palette: { key: '#rrggbb' },
//   outline?: '#rrggbb',
//   poses: { poseName: { rows: ['ascii', ...] }            // ASCII pose, chars looked up in palette
//                    | { draw(p, pal, pose) , ...params } },  // draw-fn pose (a "rig": params such as legA, bob are free-form)
//   anims: { animName: { frames: ['poseName', ...], fps: 8, loop: true } },
// }
import { PixBuf } from '../art-kit/pixbuf.js';
import { spriteFromAscii } from '../art-kit/index.js';

/** Validate a spec; -> string[] of problems. */
export function validateSpec(spec) {
  const errs = [];
  if (!spec.size || spec.size.length !== 2) errs.push('size must be [w,h]');
  if (!spec.palette) errs.push('palette missing');
  for (const [n, po] of Object.entries(spec.poses || {})) {
    if (!po.rows && typeof po.draw !== 'function') errs.push(`pose ${n}: needs rows or draw`);
    if (po.rows) for (const r of po.rows) if (spec.size && r.length > spec.size[0]) errs.push(`pose ${n}: row wider than size`);
  }
  for (const [n, a] of Object.entries(spec.anims || {})) {
    if (!a.frames?.length) errs.push(`anim ${n}: no frames`);
    for (const f of a.frames || []) if (!spec.poses?.[f]) errs.push(`anim ${n}: unknown pose ${f}`);
    if (!(a.fps > 0)) errs.push(`anim ${n}: fps must be > 0`);
  }
  return errs;
}

/** Render one pose to a PixBuf of spec.size. */
export function renderPose(spec, poseName) {
  const po = spec.poses[poseName], [w, h] = spec.size;
  if (!po) throw new Error('unknown pose ' + poseName);
  let p;
  if (po.rows) { const s = spriteFromAscii(po.rows, spec.palette); p = new PixBuf(w, h).blit(s, 0, h - s.h); }
  else { p = new PixBuf(w, h); po.draw(p, spec.palette, po); }
  return spec.outline ? p.outline(spec.outline) : p;
}

/** Build everything: -> { poses: {name: PixBuf}, anims: {name: {frames: PixBuf[], fps, loop}}, sprites: {animName: PixBuf[]} (ready for art-kit packSheet) }. */
export function buildCharacter(spec) {
  const errs = validateSpec(spec);
  if (errs.length) throw new Error(`character "${spec.name}": ${errs.join('; ')}`);
  const poses = {};
  for (const n of Object.keys(spec.poses)) poses[n] = renderPose(spec, n);
  const anims = {}, sprites = {};
  for (const [n, a] of Object.entries(spec.anims)) {
    const frames = a.frames.map((f) => poses[f]);
    anims[n] = { frames, fps: a.fps, loop: a.loop !== false };
    sprites[`${spec.name}_${n}`] = frames;
  }
  return { name: spec.name, poses, anims, sprites };
}

/** Animator over an anim table { name: { frames: [...any], fps, loop } }. Frames can be sprites or indices; pure and deterministic. */
export function createAnimator(anims, initial) {
  let cur = null, t = 0, idx = 0, done = false, name = null;
  const a = {
    get name() { return name; }, get done() { return done; }, get index() { return idx; },
    /** play(name, {restart}) — no-op if already playing and not restarting. */
    play(n, { restart = false } = {}) {
      if (!anims[n]) throw new Error('unknown anim ' + n);
      if (n === name && !restart) return a;
      name = n; cur = anims[n]; t = 0; idx = 0; done = false; return a;
    },
    update(dt) {
      if (!cur || done) return a;
      t += dt;
      const f = Math.floor(t * cur.fps), n = cur.frames.length;
      if (cur.loop !== false) idx = f % n; else { idx = Math.min(f, n - 1); if (f >= n) done = true; }
      return a;
    },
    frame() { return cur ? cur.frames[idx] : null; },
  };
  if (initial) a.play(initial);
  return a;
}
