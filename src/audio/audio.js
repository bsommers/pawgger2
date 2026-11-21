// Audio shell (ARCHITECTURE §9). Subscribes to bus 'sfx' and 'music' at construction. The WebAudio
// context is created lazily on unlock() (first user gesture). Without an AudioContext (headless,
// tests) every call is a safe no-op. music.js is optional: it is loaded with a dynamic import.
import { SFX_NAMES, describe, schedule } from './sfx.js';

const clamp01 = (v, d) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

export function createAudio(bus, settings = {}) {
  const vol = {
    master: clamp01(settings.master, 0.8),
    sfx: clamp01(settings.sfx, 1),
    music: clamp01(settings.music, 0.7),
  };
  let muted = !!settings.mute;
  let ctx = null;
  let masterGain = null, sfxGain = null, musicGain = null;
  let music = null;          // { play(name|null), stop() } once music.js and the context both exist
  let pendingMusic = null;   // last requested music name, applied when music becomes available
  let disposed = false;

  const musicModP = import('./music.js').then((m) => m, () => null);

  const applyGains = () => {
    if (!ctx) return;
    masterGain.gain.value = muted ? 0 : vol.master;
    sfxGain.gain.value = vol.sfx;
    musicGain.gain.value = vol.music;
  };

  const attachMusic = (mod) => {
    if (music || !mod || typeof mod.createMusic !== 'function' || !ctx) return;
    music = mod.createMusic(ctx, musicGain);
    if (pendingMusic !== null) music.play(pendingMusic);
  };

  const unsubs = [
    bus.on('sfx', (p) => {
      const name = p?.name;
      if (!ctx || muted || !SFX_NAMES.includes(name)) return;
      try {
        schedule(ctx, sfxGain, describe(name), ctx.currentTime + 0.005, { name });
      } catch {
        // a broken audio graph must never take the game down
      }
    }),
    bus.on('music', (p) => {
      pendingMusic = p?.name ?? null;
      if (music) music.play(pendingMusic);
    }),
  ];

  function unlock() {
    if (disposed) return false;
    try {
      if (!ctx) {
        const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Ctor) return false;
        ctx = new Ctor();
        masterGain = ctx.createGain();
        sfxGain = ctx.createGain();
        musicGain = ctx.createGain();
        sfxGain.connect(masterGain);
        musicGain.connect(masterGain);
        masterGain.connect(ctx.destination);
        applyGains();
        musicModP.then(attachMusic);
      }
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  function setVolume(master, sfx, musicV) {
    vol.master = clamp01(master, vol.master);
    vol.sfx = clamp01(sfx, vol.sfx);
    vol.music = clamp01(musicV, vol.music);
    applyGains();
  }

  function setMute(on) {
    muted = !!on;
    applyGains();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    unsubs.forEach((u) => u?.());
    try { music?.stop(); } catch { /* ignore */ }
    try { ctx?.close?.(); } catch { /* ignore */ }
    ctx = null;
    music = null;
  }

  return { unlock, setVolume, setMute, dispose };
}
