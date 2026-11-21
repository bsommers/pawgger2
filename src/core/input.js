// Input: keyboard + gamepad + virtual (touch) -> the sim `input` of ARCHITECTURE section 4 ({ hop }), plus UI actions for menus.
// Node-safe: nothing touches the DOM at import time; pass a `target` (anything with addEventListener) and optional `getPads`.
//
//   const inp = createInput({ target: window });
//   inp.poll()      -> { hop }  call ONCE per rendered frame; hop is null or 'up'|'down'|'left'|'right', a latched edge:
//                      one per press, never repeated while held (hold-to-repeat is off), kept until the next poll.
//   inp.on(fn)      -> unsubscribe; fn({ act, key?, repeat? }) with act in
//                      left|right|up|down|confirm|back|pause|mute|crt|fullscreen|help|char|backspace
//   inp.press(dir)  -> inject a hop press (touch buttons); inp.act(name) injects a UI action

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'confirm', Enter: 'confirm', NumpadEnter: 'confirm', Escape: 'back', KeyP: 'pause',
  KeyM: 'mute', KeyC: 'crt', KeyF: 'fullscreen', KeyH: 'help', Backspace: 'backspace', Delete: 'backspace',
};
const PREVENT = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Backspace', 'Enter']);

export function createInput({ target = null, getPads = null } = {}) {
  const down = new Set();                 // currently held logical keys (for edge detection only)
  const listeners = new Set();
  let hopLatch = null, padPrev = {}, lastDevice = 'keys';
  const pads = getPads || (() => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []));

  const emit = (e) => { for (const fn of [...listeners]) { try { fn(e); } catch (err) { if (typeof console !== 'undefined') console.error(err); } } };
  const act = (name, extra) => emit({ act: name, ...extra });

  function onKeyDown(ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const code = ev.code || '';
    const m = KEYMAP[code];
    if (PREVENT.has(code) && ev.preventDefault) ev.preventDefault();
    lastDevice = 'keys';
    if (m === 'left' || m === 'right' || m === 'up' || m === 'down') {
      if (!down.has(m) && !ev.repeat) hopLatch = m;        // one hop per press, never on key repeat
      down.add(m);
      act(m, { repeat: !!ev.repeat });
    } else if (m) {
      if (m === 'confirm' || m === 'back' || m === 'backspace' || !ev.repeat) act(m, { repeat: !!ev.repeat });
    }
    if (/^Key[A-Z]$/.test(code) && !ev.repeat) act('char', { key: code.slice(3) });
  }
  function onKeyUp(ev) {
    const m = KEYMAP[ev.code || ''];
    if (m === 'left' || m === 'right' || m === 'up' || m === 'down') down.delete(m);
  }
  function clear() { down.clear(); hopLatch = null; }

  if (target && target.addEventListener) {
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', clear);
  }

  /** Gamepad: edge-detected UI actions and hop presses, once per poll. */
  function readPad() {
    let list = [];
    try { list = Array.from(pads() || []); } catch { list = []; }
    const cur = {};
    for (const p of list) {
      if (!p || !p.connected) continue;
      const ax = p.axes || [], b = (i) => !!(p.buttons && p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
      if (b(14) || (ax[0] ?? 0) < -0.5) cur.left = true;
      if (b(15) || (ax[0] ?? 0) > 0.5) cur.right = true;
      if (b(12) || (ax[1] ?? 0) < -0.5) cur.up = true;
      if (b(13) || (ax[1] ?? 0) > 0.5) cur.down = true;
      if (b(0) || b(1) || b(2) || b(3)) cur.confirm = true;
      if (b(9)) cur.pause = true;
      if (b(8)) cur.back = true;
    }
    for (const k of ['left', 'right', 'up', 'down', 'confirm', 'pause', 'back']) {
      if (cur[k] && !padPrev[k]) {
        lastDevice = 'pad'; act(k);
        if (k === 'left' || k === 'right' || k === 'up' || k === 'down') hopLatch = k;
      }
    }
    padPrev = cur;
  }

  /** Called once per rendered frame. Returns the latched hop edge and clears it. */
  function poll() {
    readPad();
    const hop = hopLatch; hopLatch = null;
    return { hop };
  }

  return {
    poll, act, clear,
    /** Inject a hop press (touch buttons): latched like a key press. */
    press(dir) { if (dir === 'left' || dir === 'right' || dir === 'up' || dir === 'down') { hopLatch = dir; lastDevice = 'touch'; } },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Test/QA hooks. */
    keyDown: onKeyDown, keyUp: onKeyUp,
    get device() { return lastDevice; },
    dispose() {
      if (target && target.removeEventListener) {
        target.removeEventListener('keydown', onKeyDown); target.removeEventListener('keyup', onKeyUp); target.removeEventListener('blur', clear);
      }
      listeners.clear();
    },
  };
}

/** Sim input for the k-th fixed step of a frame: the hop edge applies to the first step only. */
export function stepInput(frameInput, k) {
  return { hop: k === 0 ? (frameInput.hop ?? null) : null };
}
