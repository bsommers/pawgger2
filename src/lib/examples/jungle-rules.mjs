// Example rule table (PawFall-style jungle run) + fairness predicate. Run: node examples/jungle-rules.mjs
import { generateWorld, validateWorld } from '../world-gen.js';
import { jumpRange, makeConfig } from '../platformer-physics.js';

export const cfg = makeConfig({ runSpeed: 60, jumpV: 190, gravity: 480, hitW: 8 });
export const MAX_PIT = Math.floor(jumpRange(cfg) - cfg.hitW - 4) & ~1;

export const rules = {
  seed: 4242, count: 48, start: 0,
  blocks: { size: 12, deck: ['pit', 'pit', 'plain', 'plain', 'plain', 'rest', 'rest', 'plain', 'plain', 'plain', 'pit'], fixed: { 6: 'boss' }, firstSlot: 'rest' },
  spacing: { edgeClear: 36, gap: 48, step: 4 },
  slots: {
    rest: {},
    plain: { place: [
      { mode: 'rolling', chance: 0.5, kinds: [{ kind: 'log', weight: 4 }, { kind: 'logs2', weight: 2, minT: 0.25, perT: 3 }] },
      { chance: { base: 0.3, perT: 0.4 }, kinds: [{ kind: 'stilllog', weight: 2 }, { kind: 'fire', weight: 2, minT: 0.1 }] },
    ] },
    pit: { build(def, ctx) {
      const w = Math.round((24 + ctx.t * (MAX_PIT - 24)) / 2) * 2, cx = 160 + ctx.rng.int(-6, 6) * 2;
      def.pit = { kind: ctx.rng.pick(['tar', 'water']), x0: cx - w / 2, w };
    } },
    boss: { set: { boss: true }, place: [{ mode: 'rolling', kinds: [{ kind: 'cheese' }] }] },
  },
  collectibles: { count: 8, exclude: (d) => d.boss, tiers: [{ type: 'tuna', upTo: 4 }, { type: 'gold', upTo: 8 }] },
};

export const crossable = (def) => !def.pit || def.pit.w <= MAX_PIT || `pit ${def.pit.w} > ${MAX_PIT}`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const world = generateWorld(rules);
  const res = validateWorld(world, { crossable, rollingSweepsCollectible: true });
  console.log(`screens=${world.screens.length} collectibles=${world.collectibles.length} ok=${res.ok}`);
  for (const f of res.failures.slice(0, 10)) console.log(' ', f.screen, f.rule, f.msg);
}
