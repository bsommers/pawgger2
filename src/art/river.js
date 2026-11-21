// river: logs, turtle, croc raft, bay hazards, treasure pickups. PixBuf only, deterministic.
import { PixBuf, ink, mix, hash2 } from './pixbuf.js';
import { PAL } from '../core/defs.js';

const OL = PAL.outline;
const dither = (x, y) => ((x + y) & 1) === 0;

function log(w) {
  const p = new PixBuf(w, 16);
  // body rows 1..14, bark ramp, light from upper left
  for (let y = 1; y < 15; y++) {
    const c = y <= 3 ? PAL.logRing : y <= 9 ? PAL.log : y <= 12 ? PAL.logD : PAL.trunkD;
    for (let x = 2; x < w - 2; x++) p.set(x, y, c);
  }
  // bark texture: vertical-ish dashes + knots, deterministic
  for (let x = 4; x < w - 4; x++) for (let y = 2; y < 14; y++) {
    const h = hash2(x, y, 11);
    if (h < 0.11) p.set(x, y, PAL.logD);
    else if (h > 0.93) p.set(x, y, PAL.logRing);
    else if (y > 4 && y < 12 && (x + (y >> 2) * 3) % 9 === 0 && h < 0.7) p.set(x, y, PAL.trunk);
  }
  for (let k = 0; k < Math.max(1, (w / 40) | 0); k++) { const kx = 14 + k * 28 + (k & 1) * 5, ky = 6 + (k % 2) * 3; if (kx < w - 10) { p.ellipse(kx, ky, 2, 1, PAL.trunk); p.set(kx, ky, PAL.trunkD); } }
  // end grain ellipses at both ends
  for (const cx of [3, w - 4]) {
    p.ellipse(cx, 7, 3, 6, PAL.logD);
    p.ellipse(cx, 7, 2, 5, PAL.logRing);
    p.ring(cx, 7, 1, 3, PAL.log);
    p.set(cx, 7, PAL.logD);
    p.set(cx - 1, 4, PAL.hatHL);
  }
  // round ends: clip corners
  for (const [x, y] of [[0, 1], [1, 1], [0, 14], [1, 14], [w - 1, 1], [w - 2, 1], [w - 1, 14], [w - 2, 14], [0, 2], [w - 1, 2], [0, 13], [w - 1, 13]]) p.erase(x, y);
  return p.outline(OL);
}

function turtle(f) {
  const p = new PixBuf(16, 16);
  if (f === 4) { // submerged: ripples only
    p.ring(7, 8, 5, 4, PAL.waterL); p.ring(7, 8, 3, 2, PAL.waterL);
    p.set(7, 8, PAL.waterL); p.set(12, 6, PAL.white); p.set(3, 11, PAL.white);
    return p;
  }
  const warn = f >= 2, alt = f & 1;
  const shell = warn ? mix(PAL.turtleShell, PAL.waterD, 0.55) : PAL.turtleShell;
  const shellD = warn ? mix(PAL.turtleShellD, PAL.waterD, 0.55) : PAL.turtleShellD;
  const skin = warn ? mix(PAL.turtleSkin, PAL.waterD, 0.5) : PAL.turtleSkin;
  const cy = warn ? 9 : 8, ry = warn ? 4 : 5;
  // flippers (alternate diagonal pairs)
  const fl = alt ? [[3, -1], [3, 1]] : [[2, 0], [4, 0]];
  p.rect(2 + fl[0][0] - 2, cy - ry - 2 + (alt ? 1 : 0), 3, 2, skin);
  p.rect(2 + fl[1][0] - 2, cy + ry + (alt ? 0 : -1), 3, 2, skin);
  p.rect(9 - (alt ? 1 : 0), cy - ry - 1, 3, 2, skin);
  p.rect(9 + (alt ? 0 : -1), cy + ry - 1, 3, 2, skin);
  p.rect(0, cy - 1, 3, 2, skin); // tail
  p.ellipse(7, cy, 5, ry, shell);
  p.ellipse(7, cy, 5, ry, shell);
  // hex plate pattern
  p.hline(4, cy, 7, shellD); p.vline(7, cy - ry + 1, 2 * ry - 1, shellD);
  p.set(5, cy - 2, shellD); p.set(9, cy - 2, shellD); p.set(5, cy + 2, shellD); p.set(9, cy + 2, shellD);
  if (!warn) { p.set(5, cy - ry + 1, PAL.leafHL); p.set(6, cy - ry + 1, PAL.leafHL); p.set(4, cy - ry + 2, PAL.leafHL); }
  // head at right
  p.ellipse(13, cy, 2, 2, skin);
  p.set(14, cy - 1, PAL.black);
  p.outline(OL);
  if (warn) { // bubbles + water-line dither so the frame reads as sinking
    const b = f === 2 ? [[2, 3], [12, 2], [14, 5]] : [[3, 2], [11, 3], [14, 4]];
    for (const [x, y] of b) { p.set(x, y, PAL.waterL); p.set(x + 1, y, PAL.white); }
    for (let x = 0; x < 15; x++) if (dither(x, 0)) p.set(x, cy + ry + 2, PAL.waterL);
    for (let x = 3; x < 12; x++) if (!dither(x, 1)) p.set(x, cy - 1 + (x % 3), PAL.waterD);
  }
  return p;
}

function croc(open) {
  const p = new PixBuf(64, 16);
  // tail tapers left, body 3 cells (x 4..47), head 48..63
  p.poly([[0, 8], [6, 5], [6, 11]], PAL.croc);
  p.rect(6, 4, 42, 8, PAL.croc);
  p.rect(6, 4, 42, 2, PAL.leafL === undefined ? PAL.croc : mix(PAL.croc, PAL.leafHL, 0.35));
  p.rect(6, 10, 42, 2, PAL.crocD);
  for (let x = 8; x < 46; x += 4) { p.rect(x, 5, 2, 2, PAL.crocD); p.set(x, 5, PAL.crocD); p.set(x + 1, 8, PAL.crocD); }
  for (let x = 9; x < 46; x += 4) p.set(x, 7, mix(PAL.croc, PAL.crocD, 0.5));
  // legs
  for (const lx of [14, 34]) { p.rect(lx, 2, 3, 2, PAL.crocD); p.rect(lx, 12, 3, 2, PAL.crocD); }
  // head
  if (!open) {
    p.rect(48, 4, 15, 8, PAL.croc); p.rect(48, 4, 15, 2, mix(PAL.croc, PAL.leafHL, 0.35)); p.rect(48, 10, 15, 2, PAL.crocD);
    p.hline(50, 8, 13, PAL.crocD); // closed mouth line
    p.set(52, 3, PAL.croc); p.set(53, 3, PAL.croc);
    p.set(52, 4, PAL.eye); p.set(53, 4, PAL.black);
    p.set(61, 5, PAL.black); p.set(60, 5, PAL.crocD);
    for (let x = 52; x < 62; x += 3) p.set(x, 9, PAL.tooth);
  } else {
    p.rect(48, 3, 15, 3, PAL.croc); p.rect(48, 3, 15, 1, mix(PAL.croc, PAL.leafHL, 0.35));
    p.rect(48, 11, 15, 3, PAL.crocD);
    p.rect(50, 6, 13, 5, PAL.crocMouth);
    p.hline(50, 8, 10, mix(PAL.crocMouth, PAL.red, 0.5));
    for (let x = 51; x < 63; x += 2) { p.set(x, 6, PAL.tooth); p.set(x, 7, PAL.tooth); p.set(x, 10, PAL.tooth); p.set(x, 9, PAL.tooth); }
    p.set(52, 2, PAL.croc); p.set(53, 2, PAL.croc); p.set(52, 3, PAL.eye); p.set(53, 3, PAL.black);
    p.set(61, 4, PAL.black);
  }
  return p.outline(OL);
}

function bayCroc(open) {
  const p = new PixBuf(16, 16);
  // water line: ripple at y 11..12
  if (!open) {
    p.ellipse(8, 10, 6, 2, PAL.croc);
    p.rect(3, 10, 11, 3, PAL.bayWater); // submerged lower half
    p.ellipse(4, 8, 2, 2, PAL.croc); p.ellipse(11, 8, 2, 2, PAL.croc); // eye bumps
    p.set(4, 8, PAL.eye); p.set(11, 8, PAL.eye); p.set(5, 8, PAL.black); p.set(12, 8, PAL.black);
    p.outline(OL);
    for (let x = 1; x < 15; x++) if (dither(x, 0)) p.set(x, 12, PAL.waterL);
    return p;
  }
  p.rect(1, 2, 14, 5, PAL.croc); p.rect(1, 2, 14, 1, mix(PAL.croc, PAL.leafHL, 0.35));
  p.rect(1, 10, 14, 4, PAL.crocD);
  p.rect(2, 7, 12, 3, PAL.crocMouth);
  for (let x = 2; x < 14; x += 2) { p.set(x, 7, PAL.tooth); p.set(x, 6, PAL.tooth); p.set(x, 9, PAL.tooth); p.set(x + 1, 9, PAL.tooth); }
  p.set(3, 3, PAL.eye); p.set(12, 3, PAL.eye); p.set(4, 3, PAL.black); p.set(13, 3, PAL.black);
  return p.outline(OL);
}

function baySnake(strike) {
  const p = new PixBuf(16, 16);
  const S = PAL.snake, D = PAL.snakeD;
  if (!strike) { // coiled
    p.ellipse(8, 12, 6, 3, S); p.ellipse(8, 9, 4, 2, S); p.ellipse(8, 12, 3, 1, D);
    for (let x = 3; x < 14; x += 3) p.set(x, 13, D);
    p.set(7, 9, PAL.snakeBelly); p.set(9, 9, D);
    p.ellipse(10, 6, 2, 2, S); p.set(11, 5, PAL.ratEye); p.set(12, 6, PAL.black); p.set(13, 7, PAL.red);
    return p.outline(OL);
  }
  // body S-curve rising, head striking right with open mouth and tongue
  p.ellipse(6, 13, 5, 2, S); p.rect(5, 6, 3, 7, S); p.rect(6, 3, 3, 4, S);
  p.rect(7, 1, 7, 4, S); p.rect(12, 3, 3, 2, PAL.crocMouth);
  p.set(13, 2, PAL.tooth); p.set(14, 2, PAL.tooth); p.set(14, 5, PAL.tooth);
  p.set(9, 2, PAL.ratEye); p.set(10, 2, PAL.black);
  for (let y = 4; y < 13; y += 2) p.set(6, y, D);
  p.set(7, 6, PAL.snakeBelly); p.set(7, 8, PAL.snakeBelly); p.set(7, 10, PAL.snakeBelly);
  p.outline(OL);
  p.set(15, 3, PAL.red);
  return p;
}

function sparkle(p, f, spots) { // shimmer: moving sparkle plus fixed twinkle
  const [x, y] = spots[f];
  p.set(x, y, ink(PAL.white, { emit: 1, spark: 1 }));
  p.set(x - 1, y, PAL.white); p.set(x + 1, y, PAL.white); p.set(x, y - 1, PAL.white); p.set(x, y + 1, PAL.white);
}
const SPOTS = [[3, 3], [8, 4], [5, 8]];
const edge = (p) => { const q = new PixBuf(12, 12); q.blit(p, 1, 1); return q.outline(OL); };

function tuna(f) {
  const p = new PixBuf(10, 10);
  p.rect(1, 2, 8, 6, PAL.can); p.rect(1, 2, 8, 1, PAL.white); p.rect(1, 7, 8, 1, PAL.silverD);
  p.rect(2, 3, 6, 4, PAL.tuna); p.hline(3, 4, 4, PAL.fireL); p.hline(3, 6, 4, PAL.fireD);
  p.rect(1, 1, 8, 1, PAL.silverD); p.rect(1, 8, 8, 1, PAL.silverD);
  const q = edge(p); sparkle(q, f, [[2, 2], [9, 3], [5, 9]]); return q;
}
function sardine(f) {
  const p = new PixBuf(10, 10);
  p.ellipse(4, 5, 4, 2, PAL.silver); p.poly([[8, 5], [10, 2], [10, 8]], PAL.silverD);
  p.hline(1, 4, 6, PAL.white); p.hline(1, 6, 6, PAL.silverD); p.set(2, 4, PAL.black); p.set(3, 5, PAL.black);
  const q = edge(p); sparkle(q, f, [[3, 2], [8, 3], [5, 9]]); return q;
}
function gold(f) {
  const p = new PixBuf(10, 10);
  p.poly([[1, 8], [9, 8], [8, 3], [2, 3]], PAL.gold);
  p.hline(2, 3, 6, PAL.hatHL); p.hline(1, 7, 8, PAL.goldD); p.hline(1, 8, 8, PAL.goldD); p.vline(1, 7, 2, PAL.goldD);
  p.set(4, 5, PAL.goldD); p.set(5, 5, PAL.goldD); p.set(3, 4, PAL.white);
  const q = edge(p); sparkle(q, f, SPOTS); return q;
}
function collar(f) {
  const p = new PixBuf(10, 10);
  p.ring(5, 6, 4, 3, PAL.scarf); p.ring(5, 6, 3, 2, PAL.shieldR);
  p.ellipse(5, 9, 1, 1, PAL.gem); p.set(5, 9, PAL.white); p.set(4, 9, PAL.gemD);
  p.set(1, 5, PAL.gold); p.set(9, 5, PAL.gold); p.set(5, 3, PAL.gold);
  const q = edge(p); sparkle(q, f, [[3, 3], [9, 9], [2, 9]]); return q;
}

export function build() {
  return {
    log_s: log(48), log_m: log(80), log_l: log(112),
    turtle: [0, 1, 2, 3, 4].map(turtle),
    croc_raft: [croc(false), croc(true)],
    bay_croc: [bayCroc(false), bayCroc(true)],
    bay_snake: [baySnake(false), baySnake(true)],
    tr_tuna: [0, 1, 2].map(tuna), tr_sardine: [0, 1, 2].map(sardine),
    tr_gold: [0, 1, 2].map(gold), tr_collar: [0, 1, 2].map(collar),
  };
}
