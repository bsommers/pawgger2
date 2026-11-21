// grid-hop-validate: fairness checks for generated lanes. Structural checks (no overlap, loop size, river gap, stagger)
// plus a time-expanded crossing search over (row, x, step) using the real predicates from createGridHop.
// A "level" here is { lanes: Lane[] indexed by row, timeLimit }. Config: { hop, startRow, goalRow, startX, viewW, rows } below.

export function structural(gh, lanes, { viewW, maxGapCells = 2, divePeriod } = {}) {
  const errs = [], cell = gh.cfg.cell;
  for (const lane of lanes) {
    if (!lane || !lane.items.length) continue;
    if (lane.loop % cell) errs.push(`row ${lane.row}: loop not a multiple of cell`);
    if (lane.loop < viewW + gh.maxItemW) errs.push(`row ${lane.row}: loop too short for seamless wrap`);
    const spans = lane.items.map((it) => [it.off, it.off + gh.itemWidth(it), it]).sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < spans.length; i++) {
      const [, e] = spans[i], [ns] = spans[(i + 1) % spans.length];
      const gap = ((i + 1 === spans.length ? ns + lane.loop : ns) - e) / cell;
      if (gap < 0) errs.push(`row ${lane.row}: items overlap`);
      if (lane.kind === 'river' && gap > maxGapCells) errs.push(`row ${lane.row}: water gap ${gap} > ${maxGapCells}`);
    }
    if (divePeriod && lane.kind === 'river') {
      const d = spans.filter((s) => gh.cfg.kinds[s[2].type].dives);
      for (let i = 0; i < d.length && d.length > 1; i++) {
        const a = d[i][2], b = d[(i + 1) % d.length][2];
        const diff = Math.abs(((a.phase || 0) - (b.phase || 0)) % divePeriod);
        if (Math.min(diff, divePeriod - diff) < 1e-6) errs.push(`row ${lane.row}: neighbouring divers dive together`);
      }
    }
  }
  return errs;
}

/**
 * Is there a safe path from startRow up to goalRow? State (row, x bucket, step); moves: wait, hop up/down/left/right.
 * opts: { startRow, goalRow, startX, viewW, dt=1/25, hopSteps=3, maxSteps, edge=8 }. Returns earliest arrival step or Infinity.
 */
export function crossingTime(gh, lanes, opts) {
  const { startRow, goalRow, startX, viewW, dt = 1 / 25, hopSteps = 3, maxSteps = 25 * 30, edge = 8 } = opts;
  const cell = gh.cfg.cell, dir = goalRow < startRow ? -1 : 1;
  const safe = (row, x, t) => {
    const lane = lanes[row];
    if (!lane || lane.kind === 'safe') return true;
    if (x < -edge || x > viewW + edge) return false;
    return lane.kind === 'road' ? !gh.hitAt(lane, x, t) : !!gh.supportAt(lane, x, t);
  };
  let cur = new Map([[`${startRow}|${Math.round(startX * 2)}`, [startRow, startX]]]);
  for (let s = 0; s < maxSteps; s++) {
    const t = s * dt, nxt = new Map();
    const put = (row, x) => { nxt.set(`${row}|${Math.round(x * 2)}`, [row, x]); };
    for (const [row, x] of cur.values()) {
      if (row === goalRow) return s;
      const lane = lanes[row], carried = lane && lane.kind === 'river' && gh.supportAt(lane, x, t) ? gh.carry(lane, x, dt) : x;
      if (safe(row, carried, t + dt)) put(row, carried);
      for (const [dr, dx] of [[dir, 0], [-dir, 0], [0, -cell], [0, cell]]) {
        const nr = row + dr, nx = carried + dx;
        if (!lanes[nr] || nx < 0 || nx > viewW) continue;
        if (safe(nr, nx, t + hopSteps * dt) && safe(row, carried, t + hopSteps * dt * 0.5)) put(nr, nx);
      }
    }
    cur = nxt;
    if (!cur.size) return Infinity;
  }
  return Infinity;
}
