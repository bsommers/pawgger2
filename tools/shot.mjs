#!/usr/bin/env node
// Headless Chrome screenshot/driver (zero deps): CDP over Node's built-in WebSocket.
// node tools/shot.mjs --url "/index.html?autostart=1" --out out/shots/x.png [--size 1280x720] [--wait-for "<js>"] [--wait ms]
//   [--eval "<js>"] [--keys "w:800,ArrowLeft:300"] [--click x,y] [--frames N --interval ms] [--timeout ms] [--strict]
//   [--gpu vulkan|gl|swiftshader|none] [--chrome path]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { startStatic, REPO_ROOT } from './serve.mjs';

const SCRATCH = process.env.SCRATCH || path.join(os.tmpdir(), 'game-shot');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseArgs(argv) {
  const o = { size: '1280x720', wait: 0, timeout: 30000, frames: 1, interval: 500, gpu: 'vulkan', strict: false, keys: '' };
  const flags = new Set(['strict', 'help']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { (o._ ??= []).push(a); continue; }
    let k = a.slice(2), v;
    const eq = k.indexOf('=');
    if (eq >= 0) { v = k.slice(eq + 1); k = k.slice(0, eq); }
    k = k.replace(/-(\w)/g, (_, c) => c.toUpperCase());
    if (flags.has(k)) o[k] = v === undefined ? true : v !== 'false';
    else o[k] = v ?? argv[++i];
  }
  for (const k of ['wait', 'timeout', 'frames', 'interval']) o[k] = Number(o[k]);
  return o;
}

const KEYS = {
  ArrowLeft: [37, 'ArrowLeft', 'ArrowLeft'], ArrowUp: [38, 'ArrowUp', 'ArrowUp'], ArrowRight: [39, 'ArrowRight', 'ArrowRight'], ArrowDown: [40, 'ArrowDown', 'ArrowDown'],
  Enter: [13, 'Enter', 'Enter'], Escape: [27, 'Escape', 'Escape'], Tab: [9, 'Tab', 'Tab'], Shift: [16, 'ShiftLeft', 'Shift'], Control: [17, 'ControlLeft', 'Control'],
  ' ': [32, 'Space', ' '], Space: [32, 'Space', ' '],
};
function keyInfo(k) {
  if (KEYS[k]) { const [vk, code, key] = KEYS[k]; return { key, code, windowsVirtualKeyCode: vk, text: key === ' ' ? ' ' : undefined }; }
  if (k.length === 1) {
    const up = k.toUpperCase();
    const code = /[a-z]/i.test(k) ? 'Key' + up : /[0-9]/.test(k) ? 'Digit' + k : k;
    return { key: k, code, windowsVirtualKeyCode: up.charCodeAt(0), text: k };
  }
  return { key: k, code: k, windowsVirtualKeyCode: 0 };
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = [];
    ws.addEventListener('message', ev => {
      const m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? rej(new Error(`${m.error.message} (${m.error.code})`)) : res(m.result);
      } else if (m.method) for (const h of this.handlers) h(m.method, m.params);
    });
    ws.addEventListener('close', () => { for (const { rej } of this.pending.values()) rej(new Error('CDP socket closed')); this.pending.clear(); });
  }
  on(h) { this.handlers.push(h); }
  send(method, params = {}) {
    return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  static open(url) {
    return new Promise((res, rej) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => res(new CDP(ws)), { once: true });
      ws.addEventListener('error', () => rej(new Error('websocket error ' + url)), { once: true });
    });
  }
}

function gpuFlags(mode) {
  switch (mode) {
    case 'vulkan': return ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'];
    case 'gl': return ['--use-angle=gl', '--ignore-gpu-blocklist'];
    case 'swiftshader': return ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
    default: return [];
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || (!o.url && !o._?.length)) {
    console.log('usage: node tools/shot.mjs --url <repo-path|http-url> --out file.png [--size WxH] [--wait-for js] [--wait ms] [--eval js] [--keys "w:800,ArrowLeft:300"] [--click x,y] [--frames N --interval ms] [--timeout ms] [--strict] [--gpu vulkan|gl|swiftshader|none]');
    return 2;
  }
  const target = o.url ?? o._[0];
  const out = path.resolve(o.out ?? path.join(REPO_ROOT, 'out/shots/shot.png'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const [W, H] = o.size.split('x').map(Number);
  if (!(W > 0 && H > 0)) throw new Error('bad --size ' + o.size);

  const result = { ok: false, url: null, out: null, files: [], console: [], errors: [], eval: undefined, waitFor: undefined, ms: 0 };
  const t0 = Date.now();
  let srv = null, chrome = null, profile = null, cdp = null;
  const cleanup = async () => {
    try { cdp?.ws.close(); } catch {}
    if (chrome && chrome.pid) { try { process.kill(-chrome.pid, 'SIGKILL'); } catch { try { chrome.kill('SIGKILL'); } catch {} } }
    if (profile) { for (let i = 0; i < 5; i++) { try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(100); } } }
    if (srv) { try { await srv.close(); } catch {} }
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, async () => { await cleanup(); process.exit(130); });

  let timer;
  const deadline = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout after ${o.timeout} ms`)), o.timeout); });
  const run = async () => {
    let url = target;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      srv = await startStatic({ root: REPO_ROOT, port: 0 });
      url = srv.url + (url.startsWith('/') ? '' : '/') + url.replace(/^\.\//, '');
    }
    result.url = url;

    fs.mkdirSync(SCRATCH, { recursive: true });
    profile = fs.mkdtempSync(path.join(fs.existsSync(SCRATCH) ? SCRATCH : os.tmpdir(), 'shot-profile-'));
    const chromeBin = o.chrome ?? ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].map(n => ['/usr/bin/', '/usr/local/bin/'].map(d => d + n).find(p => fs.existsSync(p))).find(Boolean) ?? 'google-chrome';
    const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--mute-audio', '--disable-extensions', '--disable-sync',
      `--window-size=${W},${H}`, ...gpuFlags(o.gpu), 'about:blank'];
    if (process.getuid?.() === 0) args.unshift('--no-sandbox');
    chrome = spawn(chromeBin, args, { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
    let chromeErr = '';
    chrome.stderr.on('data', d => { chromeErr += d; if (chromeErr.length > 20000) chromeErr = chromeErr.slice(-10000); });
    let exited = false; chrome.on('exit', () => { exited = true; });
    chrome.on('error', e => { chromeErr += String(e); exited = true; });

    const portFile = path.join(profile, 'DevToolsActivePort');
    let port;
    while (!port) {
      if (exited) throw new Error('chrome exited early: ' + chromeErr.slice(-500));
      if (fs.existsSync(portFile)) { const l = fs.readFileSync(portFile, 'utf8').split('\n'); if (l[0] && l[1]) port = Number(l[0]); }
      if (!port) await sleep(50);
    }
    let pageWs;
    for (let i = 0; i < 100 && !pageWs; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        pageWs = list.find(t => t.type === 'page')?.webSocketDebuggerUrl;
      } catch {}
      if (!pageWs) await sleep(50);
    }
    if (!pageWs) throw new Error('no page target');
    cdp = await CDP.open(pageWs);

    cdp.on((m, p) => {
      if (m === 'Runtime.consoleAPICalled') {
        const text = p.args.map(a => a.value !== undefined ? (typeof a.value === 'string' ? a.value : JSON.stringify(a.value)) : (a.description ?? a.type)).join(' ');
        result.console.push({ type: p.type, text });
        if (p.type === 'error' || p.type === 'assert') result.errors.push('console.' + p.type + ': ' + text);
      } else if (m === 'Runtime.exceptionThrown') {
        const d = p.exceptionDetails;
        result.errors.push('exception: ' + (d.exception?.description ?? d.text) + (d.url ? ` @ ${d.url}:${d.lineNumber + 1}` : ''));
      } else if (m === 'Log.entryAdded') {
        const e = p.entry;
        if (e.level === 'error' && /\/favicon\.ico/.test(e.url ?? '')) result.console.push({ type: 'log.ignored', text: e.text });
        else if (e.level === 'error') result.errors.push(`log: ${e.text}${e.url ? ' @ ' + e.url : ''}`);
        else result.console.push({ type: 'log.' + e.level, text: e.text });
      } else if (m === 'Network.loadingFailed' && !p.canceled) {
        result.errors.push('network: ' + p.errorText + ' ' + (p.type ?? ''));
      }
    });
    await Promise.all(['Runtime', 'Page', 'Log', 'Network'].map(d => cdp.send(d + '.enable')));
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url });
    // wait for load
    await new Promise(res => { cdp.on(m => { if (m === 'Page.loadEventFired') res(); }); setTimeout(res, Math.min(o.timeout / 2, 15000)); });

    const evalJs = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
      return r.result.value;
    };

    if (o.waitFor) {
      let v;
      for (;;) {
        try { v = await evalJs(o.waitFor); } catch (e) { v = false; }
        if (v) break;
        await sleep(100);
      }
      result.waitFor = true;
    }
    if (o.wait) await sleep(o.wait);

    if (o.click) {
      const [x, y] = o.click.split(',').map(Number);
      for (const [type, extra] of [['mouseMoved', {}], ['mousePressed', { button: 'left', clickCount: 1 }], ['mouseReleased', { button: 'left', clickCount: 1 }]])
        await cdp.send('Input.dispatchMouseEvent', { type, x, y, ...extra });
      await sleep(100);
    }

    if (o.keys) {
      for (const part of o.keys.split(',').map(s => s.trim()).filter(Boolean)) {
        const ix = part.lastIndexOf(':');
        const k = ix > 0 ? part.slice(0, ix) : part, ms = ix > 0 ? Number(part.slice(ix + 1)) : 80;
        const info = keyInfo(k);
        await cdp.send('Input.dispatchKeyEvent', { type: info.text ? 'keyDown' : 'rawKeyDown', ...info });
        await sleep(ms);
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...info, text: undefined });
      }
    }

    if (o.eval) result.eval = await evalJs(o.eval);

    const n = Math.max(1, o.frames);
    const ext = path.extname(out), base = out.slice(0, out.length - ext.length);
    for (let i = 0; i < n; i++) {
      if (i) await sleep(o.interval);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const file = n === 1 ? out : `${base}-${String(i + 1).padStart(3, '0')}${ext || '.png'}`;
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      result.files.push(file);
    }
    result.out = result.files[0];
    result.ok = true;
  };

  let exitCode = 0;
  try { await Promise.race([run(), deadline]); }
  catch (e) { result.ok = false; result.fatal = String(e.message ?? e); exitCode = 1; }
  finally { clearTimeout(timer); await cleanup(); }
  result.ms = Date.now() - t0;
  if (o.strict && result.errors.length) exitCode = 1;
  console.log(JSON.stringify(result, null, 2));
  return exitCode;
}

process.exitCode = await main();
process.exit(process.exitCode);
