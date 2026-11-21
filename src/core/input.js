// Input: keyboard + gamepad + virtual (touch) -> the sim `input` object of ARCHITECTURE §4, plus UI actions for menus.
// Node-safe: nothing touches the DOM at import time; pass a `target` (anything with addEventListener) and optional `getPads`.
//
//   const inp = createInput({ target: window });
//   inp.poll()      -> { dx, dy, jump, jumpPressed }   call ONCE per rendered frame; jumpPressed is a latched edge
//   inp.on(fn)      -> unsubscribe; fn({ act, key?, repeat? }) with act in
//                      left|right|up|down|confirm|back|pause|mute|crt|fullscreen|help|char|backspace
//   inp.virtual     -> touch overlay writes here: { dx, dy, jump }
//   inp.act(name)   -> inject a UI action (touch buttons)

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyZ: 'jump', KeyX: 'jump', Enter: 'confirm', NumpadEnter: 'confirm', Escape: 'back', KeyP: 'pause',
  KeyM: 'mute', KeyC: 'crt', KeyF: 'fullscreen', KeyH: 'help', Backspace: 'backspace', Delete: 'backspace',
};
const PREVENT = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Backspace', 'Enter']);

export function createInput({ target = null, getPads = null } = {}) {
  const down = new Set();                 // currently held logical keys: left,right,up,down,jump
  const listeners = new Set();
  const virtual = { dx: 0, dy: 0, jump: false };
  let jumpLatch = false, prevJump = false, padPrev = {}, lastDevice = 'keys';
  const pads = getPads || (() => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []));

  const emit = (e) => { for (const fn of [...listeners]) { try { fn(e); } catch (err) { if (typeof console !== 'undefined') console.error(err); } } };
  const act = (name, extra) => emit({ act: name, ...extra });

  function onKeyDown(ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const code = ev.code || '';
    const m = KEYMAP[code];
    if (PREVENT.has(code) && ev.preventDefault) ev.preventDefault();
    lastDevice = 'keys';
    if (m === 'jump') {
      if (!down.has('jump') && !ev.repeat) jumpLatch = true;
      down.add('jump');
      if (!ev.repeat) act('confirm', { key: code });          // jump keys confirm in menus too
    } else if (m === 'left' || m === 'right' || m === 'up' || m === 'down') {
      down.add(m);
      act(m, { repeat: !!ev.repeat });
    } else if (m) {
      if (m === 'confirm' || m === 'back' || m === 'backspace' || !ev.repeat) act(m, { repeat: !!ev.repeat });
    }
    if (/^Key[A-Z]$/.test(code) && !ev.repeat) act('char', { key: code.slice(3) });
  }
  function onKeyUp(ev) {
    const m = KEYMAP[ev.code || ''];
    if (m === 'jump' || m === 'left' || m === 'right' || m === 'up' || m === 'down') down.delete(m);
  }
  function clear() { down.clear(); virtual.dx = 0; virtual.dy = 0; virtual.jump = false; jumpLatch = false; prevJump = false; }

  if (target && target.addEventListener) {
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', clear);
  }

  /** Gamepad snapshot (edge-detected UI actions are emitted from here, once per poll). */
  function readPad() {
    let dx = 0, dy = 0, jump = false;
    let list = [];
    try { list = Array.from(pads() || []); } catch { list = []; }
    const cur = {};
    for (const p of list) {
      if (!p || !p.connected) continue;
      const ax = p.axes || [], b = (i) => !!(p.buttons && p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
      if (b(14) || (ax[0] ?? 0) < -0.5) { dx = -1; cur.left = true; }
      if (b(15) || (ax[0] ?? 0) > 0.5) { dx = 1; cur.right = true; }
      if (b(12) || (ax[1] ?? 0) < -0.5) { dy = -1; cur.up = true; }
      if (b(13) || (ax[1] ?? 0) > 0.5) { dy = 1; cur.down = true; }
      if (b(0) || b(1) || b(2) || b(3)) { jump = true; cur.confirm = true; }
      if (b(9)) cur.pause = true;
      if (b(8)) cur.back = true;
    }
    for (const k of ['left', 'right', 'up', 'down', 'confirm', 'pause', 'back']) {
      if (cur[k] && !padPrev[k]) { lastDevice = 'pad'; act(k); }
    }
    padPrev = cur;
    return { dx, dy, jump };
  }

  /** Called once per rendered frame. */
  function poll() {
    const pad = readPad();
    const kx = (down.has('right') ? 1 : 0) - (down.has('left') ? 1 : 0);
    const ky = (down.has('down') ? 1 : 0) - (down.has('up') ? 1 : 0);
    const dx = Math.sign(kx + virtual.dx + pad.dx), dy = Math.sign(ky + virtual.dy + pad.dy);
    const jump = down.has('jump') || virtual.jump || pad.jump;
    const edge = (jump && !prevJump) || jumpLatch;
    prevJump = jump; jumpLatch = false;
    return { dx, dy, jump, jumpPressed: edge };
  }

  return {
    poll, act, clear, virtual,
    /** Make the next poll() report a jump edge even when the press was shorter than a frame (touch taps). */
    latchJump() { jumpLatch = true; },
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

/** Build the sim input for the k-th fixed step of a frame: the jump edge applies to the first step only. */
export function stepInput(frameInput, k) {
  return { dx: frameInput.dx, dy: frameInput.dy, jump: frameInput.jump, jumpPressed: !!frameInput.jumpPressed && k === 0 };
}
