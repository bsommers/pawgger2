// Lane geometry and support predicates. Pure functions of (lane, item, t); reused by lane-gen's validator and the autopilot.
import { KINDS, CELL, TUNING, itemLeft, turtleState, crocMouth } from '../core/defs.js';

export const laneOf = (gameOrLane, row) => (gameOrLane && gameOrLane.lanes ? gameOrLane.lanes[row] : gameOrLane);
export const itemWidth = (item) => (KINDS[item.type] ? KINDS[item.type].cells * CELL : CELL);

/** [left, right] pixel span of an item at time t. */
export function itemSpan(lane, item, t) {
  const left = itemLeft(lane, item, t);
  return [left, left + itemWidth(item)];
}

/** Span [a, b] of the croc head cell (first cell in the travel direction). */
export function crocHeadSpan(lane, item, t) {
  const [l, r] = itemSpan(lane, item, t);
  return lane.dir >= 0 ? [r - CELL, r] : [l, l + CELL];
}

/** Does the platform item hold a frog standing at x? (head cell of a croc only while the mouth is closed) */
export function supports(item, t, lane, x) {
  if (item.type === 'croc') {
    if (lane && x !== undefined) {
      const [a, b] = crocHeadSpan(lane, item, t);
      if (x >= a && x <= b && crocMouth(item, t) === 'open') return false;
    }
    return true;
  }
  if (KINDS[item.type]?.dives) return turtleState(item, t) !== 'down';
  return true;
}

/** Reason the frog at x dies on a river row, if the head of an open croc is under it (else null). */
export function crocBiteAt(gameOrLane, row, x, t) {
  const lane = laneOf(gameOrLane, row);
  if (!lane || lane.kind !== 'river') return null;
  const ins = TUNING.supportInset;
  for (const it of lane.items) {
    if (it.type !== 'croc') continue;
    const [l, r] = itemSpan(lane, it, t);
    if (x < l + ins || x > r - ins) continue;
    const [a, b] = crocHeadSpan(lane, it, t);
    if (x >= a && x <= b && crocMouth(it, t) === 'open') return it;
  }
  return null;
}

/** The platform item supporting x on a river row at time t, or null (open water, open croc head, sunk turtle). */
export function supportAt(gameOrLane, row, x, t) {
  const lane = laneOf(gameOrLane, row);
  if (!lane || lane.kind !== 'river') return null;
  const ins = TUNING.supportInset;
  for (const it of lane.items) {
    const [l, r] = itemSpan(lane, it, t);
    if (x < l + ins || x > r - ins) continue;
    if (supports(it, t, lane, x)) return it;
  }
  return null;
}

/** Platform under x ignoring turtle dives (used to tell 'turtle' deaths from 'water'). */
export function platformAt(gameOrLane, row, x, t) {
  const lane = laneOf(gameOrLane, row);
  if (!lane || lane.kind !== 'river') return null;
  const ins = TUNING.supportInset;
  for (const it of lane.items) {
    const [l, r] = itemSpan(lane, it, t);
    if (x >= l + ins && x <= r - ins) return it;
  }
  return null;
}

/** Item (any kind) whose rect (inset) overlaps the frog hitbox at x, or null. */
export function itemOverlap(lane, x, t, inset = 0, half = TUNING.frogHalf) {
  if (!lane) return null;
  for (const it of lane.items) {
    const [l, r] = itemSpan(lane, it, t);
    if (x + half > l + inset && x - half < r - inset) return it;
  }
  return null;
}
