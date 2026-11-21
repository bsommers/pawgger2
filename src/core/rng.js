// Seeded RNG (mulberry32). Sim code must use this, never Math.random.
export function createRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,                                            // [0, 1)
    range: (a, b) => a + (b - a) * next(),           // float in [a, b)
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),   // integer in [a, b]
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}
