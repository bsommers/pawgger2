// Parity: the validator's supportAt/hitVehicle adapters must agree with sim-core, and with the original standalone
// copies (kept below as a frozen reference) over many sampled (row, x, time) inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel } from '../src/levels/lanegen.js';
import { supportAt as vSupport, hitVehicle as vHit } from '../tools/validate-level.mjs';
import { supportAt as sSupport } from '../src/sim/lanes.js';
import { hitVehicle as sHit } from '../src/sim/collide.js';
import { CELL, W, TUNING, KINDS, itemW, itemLeft, turtleState, crocMouth } from '../src/core/defs.js';

function refHit(lane, x, t) {
  const lo = x - TUNING.frogHalf, hi = x + TUNING.frogHalf;
  for (const it of lane.items) {
    const l = itemLeft(lane, it, t) + TUNING.vehicleInset, r = itemLeft(lane, it, t) + itemW(it.type) - TUNING.vehicleInset;
    if (hi > l && lo < r) return true;
  }
  return false;
}
function refSupport(lane, x, t) {
  for (const it of lane.items) {
    const w = itemW(it.type), l = itemLeft(lane, it, t);
    if (x < l + TUNING.supportInset || x > l + w - TUNING.supportInset) continue;
    if (it.type === 'croc') {
      const inHead = lane.dir > 0 ? x >= l + w - CELL : x <= l + CELL;
      if (inHead && crocMouth(it, t) === 'open') return { item: it, lethal: 'croc' };
      return { item: it, lethal: null };
    }
    if (KINDS[it.type].dives && turtleState(it, t) === 'down') continue;
    return { item: it, lethal: null };
  }
  return null;
}

test('validator adapters match sim-core and the reference copies', () => {
  let n = 0;
  for (let level = 1; level <= 12; level++) for (const seed of [1, 2, 3, 7]) {
    const def = generateLevel(level, seed);
    for (let row = 2; row <= 12; row++) {
      const lane = def.lanes[row];
      if (!lane || lane.kind === 'safe') continue;
      for (let i = 0; i < 400; i++, n++) {
        const x = -12 + ((i * 37.31 + row * 5.7) % (W + 24)), t = (i * 0.173 + row * 0.31 + seed) % 40;
        if (lane.kind === 'road') {
          const h = refHit(lane, x, t);
          assert.equal(vHit(lane, x, t), h, `hit L${level} s${seed} r${row} x${x} t${t}`);
          assert.equal(!!sHit({ lanes: def.lanes }, row, x, t), h);
        } else {
          const r = refSupport(lane, x, t), v = vSupport(lane, x, t), s = sSupport({ lanes: def.lanes }, row, x, t);
          assert.equal(v === null, r === null, `support L${level} s${seed} r${row} x${x} t${t}`);
          if (r) { assert.equal(v.lethal, r.lethal); assert.equal(v.item, r.item); }
          // sim's supportAt is the "standable" subset: non-null and non-lethal
          assert.equal(!!s, !!r && !r.lethal);
        }
      }
    }
  }
  assert.ok(n > 10000);
});
