// Art module 'colby': SuperColby (top-down), Pete the feral vested rat, bay occupants. PixBuf only, deterministic.
import { PixBuf, hash2 } from './pixbuf.js';
import { PAL } from '../core/defs.js';

const O = PAL.outline;
const P = PAL;
const mir = (b, x, y, c, w = 16) => { b.set(x, y, c); b.set(w - 1 - x, y, c); };
const mirRect = (b, x, y, w, h, c, W = 16) => { b.rect(x, y, w, h, c); b.rect(W - x - w, y, w, h, c); };

// C shield: red diamond, yellow C. (cx,cy) = centre, 5 wide.
function shield(b, cx, cy) {
  b.rect(cx - 2, cy - 1, 5, 3, P.shieldR);
  b.hline(cx - 1, cy - 2, 3, P.shieldR); b.hline(cx - 1, cy + 2, 3, P.shieldR);
  b.set(cx, cy + 3, P.shieldR);
  b.set(cx - 1, cy - 1, P.shieldY); b.set(cx, cy - 1, P.shieldY);
  b.set(cx - 1, cy, P.shieldY); b.set(cx - 1, cy + 1, P.shieldY); b.set(cx, cy + 1, P.shieldY);
}

// Cat head seen from above/front: ears, tabby stripes, green eyes, nose. (cx,cy) centre, r radius x.
function head(b, cx, cy, rx = 3.5, ry = 3, face = true) {
  b.set(cx - 3, cy - ry - 1, P.fur); b.set(cx - 3, cy - ry, P.fur); b.set(cx - 2, cy - ry, P.fur);
  b.set(cx + 3, cy - ry - 1, P.fur); b.set(cx + 3, cy - ry, P.fur); b.set(cx + 2, cy - ry, P.fur);
  b.set(cx - 3, cy - ry + 1, P.nose); b.set(cx + 3, cy - ry + 1, P.nose);
  b.ellipse(cx, cy, rx, ry, P.fur);
  b.hline(cx - 2, cy - ry + 1, 5, P.furL);
  b.set(cx, cy - ry + 1, P.stripe); b.set(cx - 1, cy - ry + 2, P.stripe); b.set(cx + 1, cy - ry + 2, P.stripe);
  if (face) {
    b.set(cx - 2, cy, P.eye); b.set(cx + 2, cy, P.eye); b.set(cx - 2, cy + 1, P.eyeD); b.set(cx + 2, cy + 1, P.eyeD);
    b.hline(cx - 1, cy + 1, 3, P.cream); b.set(cx, cy + 1, P.nose);
  }
}

// Facing UP: head on top, cape + C shield on the back, tail curling out at the bottom.
function up(pose) {
  const b = new PixBuf(16, 16);
  const hy = [4, 3, 5][pose], capeTop = hy + 3, capeBot = [13, 14, 12][pose], half = [5, 4, 6][pose];
  // tail
  b.hline(7, capeBot, 2, P.fur); b.set(9, capeBot + (pose === 1 ? 0 : 0), P.stripe);
  if (pose !== 1) { b.set(10, capeBot, P.fur); b.set(10, capeBot - 1, P.cream); }
  // cape (trapezoid flaring to the bottom)
  for (let y = capeTop; y <= capeBot; y++) {
    const hw = Math.min(half, 3 + Math.floor((y - capeTop) * (half - 2) / Math.max(1, capeBot - capeTop)));
    b.hline(8 - hw, y, hw * 2, P.cape);
    b.set(8 - hw, y, P.capeD); b.set(7 + hw, y, P.capeD);
    if (y > capeTop + 1) b.set(8 - hw + 1, y, P.capeL);
  }
  b.hline(8 - half, capeBot, half * 2, P.capeD);
  // blue shoulders + paws
  b.hline(4, capeTop - 1, 8, P.shirt); b.hline(5, capeTop - 1, 2, P.shirtL);
  b.set(3, capeTop - 1, P.cream); b.set(12, capeTop - 1, P.cream);
  if (pose === 1) { b.set(3, capeTop - 2, P.cream); b.set(12, capeTop - 2, P.cream); }
  shield(b, 8, capeTop + 2 + (pose === 2 ? 0 : 0));
  head(b, 8, hy, 3.5, 3, true);
  return b.outline(O);
}

// Facing DOWN (toward the viewer): head at the bottom, shirt + C on his chest, cape peeking behind, tail up top.
function down(pose) {
  const b = new PixBuf(16, 16);
  const hy = [11, 12, 10][pose], bt = [2, 1, 3][pose], bb = hy - 2, half = [4, 3, 5][pose];
  b.set(8, bt, P.fur); b.set(8, bt + 1, P.fur); b.set(9, bt, P.stripe); b.set(7, bt, P.stripe);
  for (let y = bt + 1; y <= bb; y++) {
    b.hline(8 - half - 1, y, half * 2 + 2, P.capeD);                    // cape behind
  }
  b.rect(8 - half + 1, bt + 2, half * 2 - 2, bb - bt - 1, P.shirt);
  b.vline(8 - half + 1, bt + 2, bb - bt - 1, P.shirtL);
  b.hline(8 - half + 1, bb, half * 2 - 2, P.cream);                     // belly
  shield(b, 8, bt + 4);
  mirRect(b, 2, bb - 1, 2, 2, P.cream);                                 // paws
  head(b, 8, hy, 3.5, 3, true);
  return b.outline(O);
}

// Facing RIGHT (side view): head on the right, cape trailing left, tail up behind.
function side(pose) {
  const b = new PixBuf(16, 16);
  const dy = [0, -1, 1][pose], hx = [10, 10, 9][pose];
  // tail
  b.line(4, 9 + dy, 2, 6 + dy, P.fur); b.set(2, 5 + dy, P.cream); b.set(3, 7 + dy, P.stripe);
  // cape trailing
  b.poly([[3, 6 + dy], [8, 5 + dy], [8, 12 + dy], [3, 13 + dy]], P.cape);
  b.hline(3, 12 + dy, 5, P.capeD); b.vline(3, 7 + dy, 5, P.capeL);
  // body
  b.ellipse(8, 9 + dy, 3.5, 3.5, P.shirt);
  b.hline(6, 11 + dy, 5, P.cream); b.hline(6, 12 + dy, 4, P.cream);
  b.set(10, 8 + dy, P.shirtL);
  b.rect(8, 8 + dy, 2, 2, P.shieldR); b.set(8, 9 + dy, P.shieldY); b.set(9, 8 + dy, P.shieldY);
  b.rect(9, 13 + dy, 3, 1, P.cream);
  // head
  b.ellipse(hx, 6 + dy, 3, 2.5, P.fur);
  b.set(hx - 1, 3 + dy, P.fur); b.set(hx - 1, 4 + dy, P.fur); b.set(hx + 1, 3 + dy, P.nose);
  b.set(hx + 1, 6 + dy, P.eye); b.set(hx + 1, 7 + dy, P.eyeD);
  b.hline(hx + 2, 7 + dy, 1, P.cream); b.set(hx + 3, 6 + dy, P.nose);
  b.set(hx - 1, 5 + dy, P.stripe); b.set(hx, 4 + dy, P.stripe);
  return b.outline(O);
}

function drown(f) {
  const b = new PixBuf(16, 16);
  const wv = (y, x0, x1) => { for (let x = x0; x <= x1; x++) b.set(x, y, (x + y + f) % 3 ? P.waterL : P.white); };
  if (f === 0) {          // flailing
    head(b, 8, 7, 3.5, 3, true); b.set(8, 8, P.nose);
    b.rect(2, 3, 2, 3, P.cream); b.rect(12, 3, 2, 3, P.cream); b.hline(4, 8, 8, P.cape);
    wv(12, 2, 13);
  } else if (f === 1) {   // paws up
    b.rect(3, 2, 2, 4, P.cream); b.rect(11, 2, 2, 4, P.cream);
    head(b, 8, 8, 3.5, 3, true); wv(11, 3, 12); wv(13, 1, 14);
  } else if (f === 2) {   // sinking
    b.ellipse(8, 10, 3, 2, P.fur); b.set(6, 8, P.fur); b.set(10, 8, P.fur); b.set(5, 7, P.cape); b.set(11, 7, P.cape);
    b.set(7, 10, P.eye); b.set(9, 10, P.eye); wv(11, 2, 13); wv(13, 3, 12);
  } else {                // ripples + bubbles
    b.ring(8, 9, 5, 2, P.waterL); b.ring(8, 9, 2, 1, P.white);
    b.set(8, 4, P.white); b.set(10, 3, P.waterL); b.set(6, 5, P.white);
    return b.outline(O, { diagonal: false });
  }
  return b.outline(O);
}

function squash(f) {
  const b = new PixBuf(16, 16);
  if (f < 2) {
    const w = f ? 7 : 6;
    b.ellipse(8, 8, w, 3, P.fur); b.ellipse(8, 8, w - 1, 2, P.fur);
    b.rect(3, 7, 10, 2, P.shirt); shield(b, 8, 8);
    b.hline(2, 10, 3, P.cape); b.hline(11, 10, 3, P.cape);
    b.set(1, 8, P.fur); b.set(14, 9, P.furD);
    b.set(5, 6, P.cream); b.set(10, 6, P.cream);
    b.set(5, 7, P.eye); b.set(10, 7, P.eye); b.set(6, 7, P.eyeD); b.set(9, 7, P.eyeD); // swirly eyes
    b.set(2, 5, P.fur); b.set(13, 5, P.fur);
    b.outline(O);
    b.set(5, 6, P.shieldY); b.set(10, 6, P.shieldY);
  } else {                      // stars over a thin pancake
    b.ellipse(8, 11, 6, 1.5, P.fur); b.hline(3, 11, 10, P.shirt);
    const st = (x, y) => { b.set(x, y, P.gold); b.set(x - 1, y, P.goldD); b.set(x + 1, y, P.goldD); b.set(x, y - 1, P.gold); b.set(x, y + 1, P.goldD); };
    b.outline(O); st(4, 6); st(11, 5); st(8, 3);
  }
  return b;
}

function home(f) {
  const b = new PixBuf(16, 16);
  const dy = f ? -1 : 0;
  b.hline(5, 13, 6, P.capeD);
  b.rect(5, 7 + dy, 6, 5, P.shirt); b.hline(5, 11 + dy, 6, P.cream); shield(b, 8, 9 + dy);
  b.rect(3, (f ? 2 : 4), 2, 4, P.cream); b.rect(11, (f ? 2 : 4), 2, 4, P.cream);   // paws up
  b.rect(4, 6 + dy, 1, 3, P.shirt); b.rect(11, 6 + dy, 1, 3, P.shirt);
  head(b, 8, 5 + dy, 3.5, 3, true);
  b.hline(7, 6 + dy, 3, P.black); b.set(8, 6 + dy, P.nose);                         // open grin
  return b.outline(O);
}

function life() {
  const b = new PixBuf(8, 8);
  b.set(2, 1, P.fur); b.set(5, 1, P.fur);
  b.rect(1, 2, 6, 4, P.fur); b.hline(2, 6, 4, P.fur);
  b.set(2, 3, P.eye); b.set(5, 3, P.eye); b.set(3, 5, P.cream); b.set(4, 5, P.cream); b.set(3, 4, P.nose); b.set(4, 4, P.nose);
  b.hline(2, 2, 4, P.furL);
  return b.outline(O);
}

// ---------------------------------------------------------------- Pete (40x48), facing the viewer
function pete(laugh, f) {
  const b = new PixBuf(40, 48);
  const sh = laugh ? (f ? 1 : -1) : 0;           // body shake
  const oy = laugh && f ? 1 : 0;
  // tail
  b.line(21, 44, 26, 45, P.ratSkin); b.line(26, 45, 33, 43, P.ratSkin); b.line(33, 43, 35, 40, P.ratSkinD);
  // legs + feet
  b.rect(11 + sh, 36 + oy, 7, 8 - oy, P.rat); b.rect(22 + sh, 36 + oy, 7, 8 - oy, P.rat);
  b.rect(8 + sh, 43, 10, 3, P.ratSkin); b.rect(22 + sh, 43, 10, 3, P.ratSkin);
  for (const x of [8, 11, 14, 22, 25, 28]) b.set(x + sh, 46, P.fang);
  // belly + torso
  b.ellipse(20 + sh, 30 + oy, 9, 9, P.rat); b.ellipse(20 + sh, 33 + oy, 6, 6, P.ratBelly);
  for (let i = 0; i < 18; i++) b.set(12 + Math.floor(hash2(i, 1, 7) * 16) + sh, 26 + Math.floor(hash2(i, 2, 7) * 14) + oy, P.ratD);
  // vest
  b.poly([[11 + sh, 20 + oy], [29 + sh, 20 + oy], [28 + sh, 31 + oy], [12 + sh, 31 + oy]], P.vest);
  b.vline(20 + sh, 21 + oy, 10, P.vestD); b.hline(12 + sh, 25 + oy, 16, P.vestL);
  b.rect(14 + sh, 27 + oy, 4, 3, P.vestL); b.rect(23 + sh, 27 + oy, 4, 3, P.vestL);
  b.vline(13 + sh, 15 + oy, 6, P.vestD); b.vline(27 + sh, 15 + oy, 6, P.vestD);   // straps
  // arms: hunched, clawed
  const ay = laugh && f ? -2 : 0;
  b.rect(5 + sh, 20 + oy + ay, 5, 13, P.rat); b.rect(30 + sh, 20 + oy + ay, 5, 13, P.rat);
  b.rect(3 + sh, 32 + oy + ay, 6, 4, P.ratSkin); b.rect(31 + sh, 32 + oy + ay, 6, 4, P.ratSkin);
  for (const x of [3, 5, 7]) { b.set(x + sh, 36 + oy + ay, P.fang); b.set(x + 31 + sh, 36 + oy + ay, P.fang); }
  // head
  const hx = 20 + sh, hy = 10 + oy;
  b.ellipse(hx - 9, hy - 5, 4, 4, P.ratSkinD); b.ellipse(hx + 9, hy - 5, 4, 4, P.ratSkinD);   // ears
  b.ellipse(hx - 9, hy - 5, 2.5, 2.5, P.peteEar); b.ellipse(hx + 9, hy - 5, 2.5, 2.5, P.peteEar);
  b.ellipse(hx, hy, 10, 8, P.rat);
  b.ellipse(hx, hy + 3, 6, 5, P.ratL);                                   // muzzle
  b.hline(hx - 6, hy - 6, 12, P.ratD);                                   // matted brow
  for (let i = 0; i < 10; i++) b.set(hx - 8 + Math.floor(hash2(i, 3, 9) * 16), hy - 7 + Math.floor(hash2(i, 4, 9) * 12), P.ratD);
  // angry red eyes
  for (const s of [-1, 1]) {
    const ex = hx + s * 5;
    b.rect(ex - 1, hy - 3, 3, 3, P.ratEye); b.set(ex, hy - 3, P.ratEyeL);
    b.line(ex - 2 * s - 0, hy - 5 + (s < 0 ? 0 : 0), ex + 2 * s, hy - 3 - 0, P.black);   // scowl
  }
  b.rect(hx - 1, hy + 1, 3, 2, P.ratSkin);                               // nose
  // jaws and fangs
  if (laugh) {
    const jo = f ? 5 : 3;
    b.rect(hx - 4, hy + 4, 9, jo + 2, P.black); b.rect(hx - 3, hy + 4 + jo, 7, 1, P.peteEar);
    b.set(hx - 4, hy + 4, P.fang); b.set(hx - 4, hy + 5, P.fang); b.set(hx + 4, hy + 4, P.fang); b.set(hx + 4, hy + 5, P.fang);
    b.set(hx - 2, hy + 4, P.fang); b.set(hx + 2, hy + 4, P.fang);
    b.set(hx - 3, hy + 6 + jo, P.drool); b.set(hx + 3, hy + 7 + jo, P.drool);
  } else {
    b.hline(hx - 4, hy + 5, 9, P.black);
    b.set(hx - 3, hy + 6, P.fang); b.set(hx - 3, hy + 7, P.fang); b.set(hx + 3, hy + 6, P.fang); b.set(hx + 3, hy + 7, P.fang);
    b.set(hx - 3, hy + 8, P.drool); b.set(hx + 4, hy + 8, P.drool);
  }
  // whiskers
  b.hline(hx - 14, hy + 3, 5, P.ratL); b.hline(hx + 10, hy + 3, 5, P.ratL);
  b.hline(hx - 14, hy + 6, 4, P.ratL); b.hline(hx + 10, hy + 6, 4, P.ratL);
  return b.outline(O);
}

function peteHead(grin) {
  const b = new PixBuf(16, 16);
  b.ellipse(3.5, 4.5, 2.5, 2.5, P.ratSkinD); b.ellipse(12.5, 4.5, 2.5, 2.5, P.ratSkinD);
  b.set(3, 4, P.peteEar); b.set(12, 4, P.peteEar);
  b.ellipse(8, 8.5, 6, 5.5, P.rat);
  b.ellipse(8, 10.5, 3.5, 3, P.ratL);
  b.hline(3, 5, 4, P.ratD); b.hline(9, 5, 4, P.ratD);
  b.rect(4, 6, 2, 2, P.ratEye); b.rect(10, 6, 2, 2, P.ratEye); b.set(4, 6, P.ratEyeL); b.set(10, 6, P.ratEyeL);
  b.set(7, 9, P.ratSkin); b.set(8, 9, P.ratSkin);
  if (grin) { b.hline(5, 11, 6, P.black); b.hline(5, 12, 6, P.black); b.set(5, 11, P.fang); b.set(10, 11, P.fang); b.set(7, 11, P.fang); b.set(8, 11, P.fang); b.set(5, 12, P.fang); b.set(10, 12, P.fang); }
  else { b.hline(5, 11, 6, P.black); b.set(5, 12, P.fang); b.set(10, 12, P.fang); }
  return b.outline(O);
}

function mouse(f) {
  const b = new PixBuf(16, 16);
  const e = f ? 1 : 0;
  b.line(2, 11, 0, 9 + e, P.ratSkin);                                   // tail
  b.ellipse(7.5, 9.5, 5, 3.5, P.mouse); b.hline(4, 11, 7, P.mouseD);
  b.poly([[10, 7], [15, 9], [10, 12]], P.mouse);
  b.ellipse(8, 5 + e, 2, 2 - e * 0.0, P.peteEar); b.ellipse(8, 5 + e, 1, 1, P.mouse);
  b.ellipse(5.5, 6 - e, 1.8, 1.8, P.peteEar); b.set(5, 6 - e, P.mouseD);
  b.set(12, 9, P.black); b.set(14, 10, P.nose); b.set(11, 11, P.white);
  b.set(5, 12, P.ratSkin); b.set(9, 13, P.ratSkin);
  return b.outline(O);
}

function fish(f) {
  const b = new PixBuf(16, 16);
  const tf = f ? 1 : -1;
  b.ellipse(7, 8 + (f ? 0 : 1), 5.5, 3.5, P.fish);
  b.poly([[11, 8], [15, 8 - 3 * tf], [15, 8 + 3 * tf], [11, 9]], P.fishD);
  b.hline(3, 10 + (f ? 0 : 1), 8, P.white);
  b.vline(7, 5 + (f ? 0 : 1), 3, P.fishD); b.vline(4, 7, 3, P.fishD);
  b.set(3, 7 + (f ? 0 : 1), P.white); b.set(3, 8 + (f ? 0 : 1), P.black);
  b.set(2 + f, 3, P.waterL); b.set(1, 12, P.waterL); b.set(13, 12 + f, P.waterL);
  return b.outline(O);
}

export function build() {
  return {
    colby_up: [0, 1, 2].map(up), colby_down: [0, 1, 2].map(down), colby_side: [0, 1, 2].map(side),
    colby_drown: [0, 1, 2, 3].map(drown), colby_squash: [0, 1, 2].map(squash), colby_home: [0, 1].map(home),
    colby_life: life(),
    pete_idle: [0, 1].map((f) => pete(false, f)), pete_laugh: [0, 1].map((f) => pete(true, f)),
    pete_head: [0, 1].map(peteHead), bay_mouse: [0, 1].map(mouse), bay_fish: [0, 1].map(fish),
  };
}
