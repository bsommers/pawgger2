// Tiny synchronous event bus. Event types are listed in ARCHITECTURE.md §8.1.
export function createBus() {
  const map = new Map();
  return {
    on(type, fn) {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(fn);
      return () => map.get(type)?.delete(fn);
    },
    emit(type, payload) {
      for (const fn of map.get(type) ?? []) fn(payload);
      for (const fn of map.get('*') ?? []) fn(type, payload);   // wildcard listeners get (type, payload)
    },
  };
}
