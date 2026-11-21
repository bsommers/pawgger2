// Menu and name-entry logic (pure, Node-safe, no drawing). Screens draw these; main feeds them UI actions.

/** Vertical list menu. items: [{ id, label(): string, left?(), right?(), confirm?() }]. */
export function createMenu(items) {
  const m = {
    items, index: 0,
    act(a) {
      const it = items[m.index];
      if (a === 'up') { m.index = (m.index + items.length - 1) % items.length; return 'move'; }
      if (a === 'down') { m.index = (m.index + 1) % items.length; return 'move'; }
      if (a === 'left' && it && it.left) { it.left(); return 'change'; }
      if (a === 'right' && it && it.right) { it.right(); return 'change'; }
      if (a === 'confirm' && it && it.confirm) { it.confirm(); return 'select'; }
      return null;
    },
    get current() { return items[m.index]; },
  };
  return m;
}

const clamp01 = (v) => Math.min(1, Math.max(0, Math.round(v * 10) / 10));

/** Options menu bound to a settings object; `onChange(settings)` is called after every change. */
export function createOptionsMenu(settings, onChange = () => {}, onBack = () => {}) {
  const pct = (v) => Math.round(v * 100) + '%';
  const vol = (key, label) => ({
    id: key, label: () => `${label} ${pct(settings[key])}`,
    left() { settings[key] = clamp01(settings[key] - 0.1); onChange(settings); },
    right() { settings[key] = clamp01(settings[key] + 0.1); onChange(settings); },
  });
  const toggle = (key, label) => {
    const f = () => { settings[key] = !settings[key]; onChange(settings); };
    return { id: key, label: () => `${label} ${settings[key] ? 'ON' : 'OFF'}`, left: f, right: f, confirm: f };
  };
  return createMenu([
    vol('master', 'VOLUME'), vol('sfx', 'SOUND FX'), vol('music', 'MUSIC'),
    toggle('mute', 'MUTE'), toggle('crt', 'CRT FILTER'),
    { id: 'back', label: () => 'BACK', confirm: onBack },
  ]);
}

/** Three-letter arcade name entry. */
export function createNameEntry(initial = 'AAA') {
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const e = { letters: [...initial.padEnd(3, 'A').slice(0, 3)], pos: 0, done: false,
    get name() { return e.letters.join(''); },
    act(a, key) {
      if (e.done) return;
      const i = L.indexOf(e.letters[e.pos]);
      if (a === 'up') e.letters[e.pos] = L[(i + 1) % 26];
      else if (a === 'down') e.letters[e.pos] = L[(i + 25) % 26];
      else if (a === 'left') e.pos = Math.max(0, e.pos - 1);
      else if (a === 'right') e.pos = Math.min(2, e.pos + 1);
      else if (a === 'char' && key && /^[A-Za-z]$/.test(key)) { e.letters[e.pos] = key.toUpperCase(); e.pos = Math.min(2, e.pos + 1); }
      else if (a === 'backspace') { e.letters[e.pos] = 'A'; e.pos = Math.max(0, e.pos - 1); }
      else if (a === 'confirm') { if (e.pos < 2) e.pos++; else e.done = true; }
    },
  };
  return e;
}
