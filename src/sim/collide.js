// Collision predicates (pure). Frog hitbox is a frogHalf square around x at the row centre; rows are 16 px tall so only x matters.
import { TUNING, ROW } from '../core/defs.js';
import { laneOf, itemOverlap } from './lanes.js';

export const isRoadRow = (row) => row >= ROW.road[0] && row <= ROW.road[ROW.road.length - 1];
export const isRiverRow = (row) => row >= ROW.river[0] && row <= ROW.river[ROW.river.length - 1];

/** The vehicle item hit by a frog at x on road row `row` at time t, or null. */
export function hitVehicle(gameOrLane, row, x, t) {
  const lane = laneOf(gameOrLane, row);
  if (!lane || lane.kind !== 'road') return null;
  return itemOverlap(lane, x, t, TUNING.vehicleInset);
}

/** Roller (median) hit test: roller is a 1-cell wheel centred at rollerX. */
export function hitRoller(rollerX, x, half = TUNING.frogHalf, rollerHalf = 7) {
  return Math.abs(rollerX - x) < half + rollerHalf;
}
