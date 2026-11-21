// Example: a croc pit + rolling log + jumping body. Run: node examples/hazards-and-physics.mjs
import { makeBody, makeConfig, stepBody, pendulum } from '../platformer-physics.js';
import { createRegistry, roller, cycler, resolveContacts, solidTopUnder } from '../hazard-kit.js';

const cfg = makeConfig({ emit: (n, b) => n === 'death' && console.log('death:', b.deathKind) });
const reg = createRegistry()
  .register('log', roller({ speed: 46 }))
  .register('croc', cycler({ period: 2.8, openFrac: 0.45 }));
const ents = [reg.spawn('log', { x: 300, y: 104, dir: -1 }), reg.spawn('croc', { x: 160, y: 112, st: { phase: 0.9 } })];
const world = { groundY: 104, pits: [{ x0: 130, x1: 190, kind: 'water' }], ropes: [pendulum({ px: 160, py: 20, len: 70, amp: 0.6, period: 2.4 })], t: 0 };
const body = makeBody(20, 104);
for (let i = 0; i < 600 && body.mode !== 'dead'; i++) {
  world.t += 1 / 60;
  reg.update(ents, 1 / 60, {});
  stepBody(body, { dx: 1, jumpPressed: body.x > 110 && body.mode === 'ground' }, 1 / 60, world, cfg);
  for (const r of resolveContacts(reg, body, ents, { hitW: 8, hitH: 16 }, { time: world.t })) console.log(r.type, r.ent.kind, 'at t=' + world.t.toFixed(2));
  const top = solidTopUnder(ents, body.x, body.y, body.y);
  if (top) console.log('standing on', top.kind);
}
console.log('final', body.mode, body.x.toFixed(1));
