#!/usr/bin/env node
// swarm-tracker — zero-dependency live dashboard server.
//   node dashboard/server.mjs   (TRACKER_ROOT=<project dir, default cwd>, TRACKER_PORT=4780, TRACKER_HOST=127.0.0.1)
import http from 'node:http';
import { promises as fsp, createReadStream } from 'node:fs';
import { join, dirname, resolve, relative, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.TRACKER_ROOT || process.cwd());
const PORT = Number(process.env.TRACKER_PORT || 4870);
const HOST = process.env.TRACKER_HOST || '127.0.0.1';
const TRK = join(ROOT, '.tracker');
const CODE_DIRS = (process.env.TRACKER_CODE_DIRS || 'src,lib,bin,tools,scripts,test,tests,app,docs').split(',').map(x => x.trim()).filter(Boolean);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', '.tracker']);
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.json', '.html', '.css', '.md', '.glsl', '.wgsl', '.frag', '.vert', '.sh', '.ps1', '.txt', '.yml', '.yaml', '.toml', '.c', '.h', '.rs', '.py', '.bat', '.cmd', '.svg', '.xml', '.plist']);
const MAX_LOC_BYTES = 4 * 1024 * 1024;

const log = (...a) => console.log(new Date().toISOString(), ...a);
process.on('uncaughtException', e => log('uncaught', e && e.stack || e));
process.on('unhandledRejection', e => log('unhandled', e && e.stack || e));

// ---------- helpers ----------
async function readText(p) { try { return await fsp.readFile(p, 'utf8'); } catch { return null; } }
async function readJSON(p) {
  const s = await readText(p);
  if (!s || !s.trim()) return null;
  try { return JSON.parse(s); } catch { return null; }
}
async function listDir(p) { try { return await fsp.readdir(p, { withFileTypes: true }); } catch { return []; } }
const str = (v, d = '') => (typeof v === 'string' ? v : v == null ? d : String(v));
const isoOk = s => typeof s === 'string' && !Number.isNaN(Date.parse(s));

// ---------- plan / events / checks ----------
let lastGoodPlan = null;
async function loadPlan() {
  const p = await readJSON(join(TRK, 'plan.json'));
  if (p && typeof p === 'object') lastGoodPlan = p; // keep last good copy across mid-write reads
  return lastGoodPlan || {};
}

const eventCache = new Map(); // file -> {size, mtimeMs, events}
async function loadEvents() {
  const dir = join(TRK, 'events');
  const out = {};
  const seen = new Set();
  for (const d of await listDir(dir)) {
    if (!d.isFile() || !d.name.endsWith('.jsonl')) continue;
    const f = join(dir, d.name);
    seen.add(f);
    let st; try { st = await fsp.stat(f); } catch { continue; }
    const c = eventCache.get(f);
    let events;
    if (c && c.size === st.size && c.mtimeMs === st.mtimeMs) events = c.events;
    else {
      const txt = (await readText(f)) || '';
      events = [];
      for (const line of txt.split('\n')) {
        const l = line.trim();
        if (!l) continue;
        try {
          const e = JSON.parse(l);
          if (e && typeof e === 'object') events.push(e);
        } catch { /* truncated / malformed line */ }
      }
      eventCache.set(f, { size: st.size, mtimeMs: st.mtimeMs, events });
    }
    const fileId = d.name.replace(/\.jsonl$/, '');
    for (const e of events) {
      const id = str(e.agent || fileId);
      (out[id] ||= []).push({
        t: isoOk(e.t) ? e.t : null,
        agent: id,
        state: ['start', 'progress', 'done', 'blocked', 'failed', 'note'].includes(e.state) ? e.state : 'note',
        pct: typeof e.pct === 'number' && Number.isFinite(e.pct) ? Math.max(0, Math.min(100, e.pct)) : null,
        msg: str(e.msg).slice(0, 2000),
      });
    }
  }
  for (const k of eventCache.keys()) if (!seen.has(k)) eventCache.delete(k);
  for (const k in out) out[k].sort((a, b) => (Date.parse(a.t) || 0) - (Date.parse(b.t) || 0));
  return out;
}

async function loadChecks() {
  const dir = join(TRK, 'checks');
  const out = [];
  for (const d of await listDir(dir)) {
    if (!d.isFile() || !d.name.endsWith('.json')) continue;
    const c = await readJSON(join(dir, d.name));
    if (!c || typeof c !== 'object') continue;
    const name = str(c.name || d.name.replace(/\.json$/, ''));
    out.push({
      name,
      status: ['pass', 'fail', 'running', 'skip'].includes(c.status) ? c.status : 'skip',
      detail: str(c.detail).slice(0, 1000),
      t: isoOk(c.t) ? c.t : null,
      group: (name.match(/^([a-z]+)-/) || [, 'other'])[1],
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// ---------- file tree / LOC ----------
async function walk(dir, rel, acc) {
  for (const d of await listDir(dir)) {
    if (d.name.startsWith('.') || SKIP_DIRS.has(d.name)) continue;
    const p = join(dir, d.name), r = rel ? rel + '/' + d.name : d.name;
    if (d.isDirectory()) await walk(p, r, acc);
    else if (d.isFile()) acc.push({ p, r });
  }
}
const locCache = new Map(); // path -> {mtimeMs,size,lines}
async function countLines(p, st) {
  const c = locCache.get(p);
  if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) return c.lines;
  let lines = 0;
  if (TEXT_EXT.has(extname(p).toLowerCase()) && st.size <= MAX_LOC_BYTES) {
    try {
      const buf = await fsp.readFile(p);
      for (let i = 0; i < buf.length; i++) if (buf[i] === 10) lines++;
      if (buf.length && buf[buf.length - 1] !== 10) lines++;
    } catch { lines = 0; }
  }
  locCache.set(p, { mtimeMs: st.mtimeMs, size: st.size, lines });
  return lines;
}
let scanCache = null, scanAt = 0, scanning = null;
async function scanTree() {
  if (scanCache && Date.now() - scanAt < 5000) return scanCache;
  if (scanning) return scanning;
  scanning = (async () => {
    const acc = [];
    for (const d of CODE_DIRS) await walk(join(ROOT, d), d, acc);
    // also include top-level files for ownership (ARCHITECTURE.md etc.) but not totals
    const files = [];
    for (const f of acc) {
      let st; try { st = await fsp.stat(f.p); } catch { continue; }
      files.push({ path: f.r, mtime: st.mtimeMs, size: st.size, lines: await countLines(f.p, st) });
    }
    const top = [];
    for (const d of await listDir(ROOT)) {
      if (!d.isFile() || d.name.startsWith('.')) continue;
      const p = join(ROOT, d.name);
      let st; try { st = await fsp.stat(p); } catch { continue; }
      top.push({ path: d.name, mtime: st.mtimeMs, size: st.size, lines: await countLines(p, st) });
    }
    const byDir = {};
    for (const d of CODE_DIRS) byDir[d] = { files: 0, loc: 0 };
    let loc = 0;
    for (const f of files) { loc += f.lines; const k = f.path.split('/')[0]; byDir[k].files++; byDir[k].loc += f.lines; }
    scanCache = { files, top, totals: { files: files.length, loc, byDir } };
    scanAt = Date.now();
    scanning = null;
    return scanCache;
  })().catch(e => { scanning = null; log('scan', e); return scanCache || { files: [], top: [], totals: { files: 0, loc: 0, byDir: {} } }; });
  return scanning;
}
function ownedLoc(owns, scan) {
  if (!Array.isArray(owns)) return { loc: 0, files: 0 };
  let loc = 0, files = 0;
  const all = scan.files.concat(scan.top);
  const seen = new Set();
  for (const o of owns) {
    const own = str(o).replace(/^\.\//, '');
    if (!own) continue;
    for (const f of all) {
      if (seen.has(f.path)) continue;
      if (own.endsWith('/') ? f.path.startsWith(own) : (f.path === own || f.path.startsWith(own + '/'))) {
        seen.add(f.path); loc += f.lines; files++;
      }
    }
  }
  return { loc, files };
}

// ---------- LOC history ----------
const HIST_FILE = join(TRK, 'loc-history.json');
let history = [];
async function loadHistory() {
  const h = await readJSON(HIST_FILE);
  if (Array.isArray(h)) history = h.filter(x => x && typeof x.t === 'number' && typeof x.loc === 'number');
}
async function sampleHistory() {
  try {
    const s = await scanTree();
    const last = history[history.length - 1];
    const pt = { t: Date.now(), loc: s.totals.loc, files: s.totals.files };
    // keep a point every 10s, but collapse long flat runs
    if (last && history.length >= 2 && history[history.length - 2].loc === last.loc && last.loc === pt.loc && last.files === pt.files) history[history.length - 1] = pt;
    else history.push(pt);
    if (history.length > 5000) history = history.filter((_, i) => i % 2 === 0 || i > history.length - 500);
    try {
      await fsp.mkdir(TRK, { recursive: true });
      const tmp = HIST_FILE + '.tmp' + process.pid;
      await fsp.writeFile(tmp, JSON.stringify(history));
      await fsp.rename(tmp, HIST_FILE);
    } catch { /* read-only is fine */ }
  } catch (e) { log('history', e); }
}

// ---------- images / artifacts ----------
async function walkImages(base, kind, acc) {
  const stack = [base];
  while (stack.length) {
    const dir = stack.pop();
    for (const d of await listDir(dir)) {
      if (d.name.startsWith('.')) continue;
      const p = join(dir, d.name);
      if (d.isDirectory()) stack.push(p);
      else if (d.isFile() && /\.(png|gif|jpe?g|webp)$/i.test(d.name)) {
        let st; try { st = await fsp.stat(p); } catch { continue; }
        if (!st.size) continue;
        acc.push({ kind, path: relative(ROOT, p).split(sep).join('/'), name: d.name, mtime: st.mtimeMs, size: st.size });
      }
    }
  }
}
async function loadGallery() {
  const acc = [];
  await walkImages(join(ROOT, 'out', 'previews'), 'preview', acc);
  await walkImages(join(ROOT, 'out', 'shots'), 'shot', acc);
  acc.sort((a, b) => b.mtime - a.mtime);
  return acc.slice(0, 200);
}
async function loadArtifacts() {
  const acc = [];
  const stack = [[join(ROOT, 'dist'), 0]];
  while (stack.length) {
    const [dir, depth] = stack.pop();
    for (const d of await listDir(dir)) {
      if (d.name.startsWith('.')) continue;
      const p = join(dir, d.name);
      let st; try { st = await fsp.stat(p); } catch { continue; }
      if (d.isDirectory()) {
        if (/\.app$/.test(d.name)) acc.push({ path: relative(ROOT, p).split(sep).join('/'), name: d.name, size: null, mtime: st.mtimeMs, dir: true });
        else if (depth < 3) stack.push([p, depth + 1]);
      } else if (d.isFile()) acc.push({ path: relative(ROOT, p).split(sep).join('/'), name: d.name, size: st.size, mtime: st.mtimeMs });
    }
  }
  acc.sort((a, b) => b.mtime - a.mtime);
  return acc.slice(0, 100);
}


// ---------- media (audio / totals) ----------
function parseWav(buf) {
  // returns {rate, ch, bits, dataOff, dataLen} or null (PCM 8/16/24/32-bit or float32)
  if (buf.length < 44 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') return null;
  let off = 12, fmt = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('latin1', off, off + 4); let len = buf.readUInt32LE(off + 4); const body = off + 8;
    if (id === 'fmt ' && body + 16 <= buf.length) fmt = { tag: buf.readUInt16LE(body), ch: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    else if (id === 'data' && fmt) { if (body + len > buf.length) len = buf.length - body; return { ...fmt, dataOff: body, dataLen: len }; }
    off = body + len + (len & 1);
  }
  return null;
}
function wavDuration(w) { return w && w.rate && w.ch && w.bits ? w.dataLen / (w.rate * w.ch * (w.bits / 8)) : 0; }
const peakCache = new Map(); // abs -> {mtimeMs, size, n, out}
function computePeaks(buf, n) {
  const w = parseWav(buf); if (!w) return null;
  const bps = w.bits / 8, frame = bps * w.ch, frames = Math.floor(w.dataLen / frame);
  const rd = (o) => w.tag === 3 && w.bits === 32 ? buf.readFloatLE(o) : w.bits === 16 ? buf.readInt16LE(o) / 32768 : w.bits === 8 ? (buf[o] - 128) / 128 : w.bits === 24 ? buf.readIntLE(o, 3) / 8388608 : w.bits === 32 ? buf.readInt32LE(o) / 2147483648 : 0;
  const peaks = new Array(n).fill(0);
  if (!frames) return { duration: 0, rate: w.rate, peaks };
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * frames / n), b = Math.max(a + 1, Math.floor((i + 1) * frames / n));
    const step = Math.max(1, Math.floor((b - a) / 64)); let m = 0;
    for (let f = a; f < b && f < frames; f += step) { const v = Math.abs(rd(w.dataOff + f * frame)); if (v > m) m = v; }
    peaks[i] = Math.round(Math.min(1, m) * 255) / 255;
  }
  return { duration: wavDuration(w), rate: w.rate, peaks };
}
async function loadAudio() {
  const acc = [];
  for (const kind of ['sfx', 'music']) {
    for (const d of await listDir(join(ROOT, 'out', kind))) {
      if (!d.isFile() || !/\.wav$/i.test(d.name) || d.name.startsWith('.')) continue;
      const p = join(ROOT, 'out', kind, d.name);
      let st; try { st = await fsp.stat(p); } catch { continue; }
      if (st.size < 44) continue;
      let c = peakCache.get(p);
      if (!c || c.mtimeMs !== st.mtimeMs || c.size !== st.size) {
        let dur = 0;
        try { const fh = await fsp.open(p, 'r'); const b = Buffer.alloc(Math.min(st.size, 4096)); await fh.read(b, 0, b.length, 0); await fh.close(); const w = parseWav(b); if (w) w.dataLen = Math.max(0, Math.min(st.size - w.dataOff, 0xFFFFFFFF)); dur = wavDuration(w); } catch { /* */ }
        c = { mtimeMs: st.mtimeMs, size: st.size, dur, out: null, n: 0 }; peakCache.set(p, c);
      }
      acc.push({ kind, path: relative(ROOT, p).split(sep).join('/'), name: d.name, size: st.size, mtime: st.mtimeMs, duration: c.dur });
    }
  }
  acc.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'music' ? -1 : 1));
  return acc;
}
async function loadMedia(gallery, audio) {
  const previews = gallery.filter(g => g.kind === 'preview' && !/\.mat\.png$/i.test(g.name));
  const sheets = new Set(previews.map(g => g.name.replace(/\.png$/i, '')));
  let sprites = 0, frames = 0, tracked = false;
  const defs = await readText(join(ROOT, 'src', 'core', 'defs.js'));
  if (defs) {
    const re = /\bA\(\s*'([\w-]+)'\s*,\s*'([\w-]+)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'(\w+)'/g; let m;
    while ((m = re.exec(defs))) { tracked = true; if (sheets.has(m[1])) { sprites++; frames += +m[5]; } }
  }
  if (!tracked) { sprites = sheets.size; frames = sheets.size; }
  return {
    sprites, frames, sheets: sheets.size,
    sfx: audio.filter(a => a.kind === 'sfx').length, music: audio.filter(a => a.kind === 'music').length,
    shots: gallery.filter(g => g.kind === 'shot' && !/\.gif$/i.test(g.name)).length,
    gifs: gallery.filter(g => /\.gif$/i.test(g.name)).length,
  };
}

// ---------- state assembly ----------
const RANK = { failed: 0, blocked: 1, running: 2, queued: 3, done: 4 };
async function buildState() {
  const [plan, evs, checks, scan, gallery, artifacts, audio] = await Promise.all([
    loadPlan(), loadEvents(), loadChecks(), scanTree(), loadGallery(), loadArtifacts(), loadAudio(),
  ]);
  const media = await loadMedia(gallery, audio);
  const planAgents = Array.isArray(plan.agents) ? plan.agents.filter(a => a && a.id) : [];
  const ids = new Set(planAgents.map(a => str(a.id)));
  const agentsIn = planAgents.map(a => ({ ...a, id: str(a.id), inPlan: true }));
  for (const id of Object.keys(evs)) if (!ids.has(id)) agentsIn.push({ id, name: id, role: 'unplanned', model: '', owns: [], inPlan: false });

  const feed = [];
  const agents = agentsIn.map((a, idx) => {
    const list = evs[a.id] || [];
    let state = 'queued', pct = null, lastMsg = '', lastT = null, startedAt = null, endedAt = null;
    const segs = [];
    for (const e of list) {
      if (e.t && !startedAt) startedAt = e.t;
      if (e.state !== 'note') {
        const s = e.state === 'start' || e.state === 'progress' ? 'running' : e.state;
        if (s !== state && e.t) {
          if (segs.length) segs[segs.length - 1].to = e.t;
          segs.push({ state: s, from: e.t, to: null });
        }
        state = s;
        endedAt = (s === 'done' || s === 'failed') ? e.t : null;
      }
      if (e.pct != null) pct = e.pct;
      if (e.msg) lastMsg = e.msg;
      if (e.t) lastT = e.t;
    }
    if (list.length && state === 'queued') state = 'running'; // only notes so far
    if (segs.length && endedAt) segs[segs.length - 1].to = endedAt;
    for (const e of list.slice(-120)) feed.push(e);
    const own = ownedLoc(a.owns, scan);
    return {
      id: a.id, name: str(a.name, a.id), role: str(a.role, 'misc') || 'misc', model: str(a.model).toLowerCase(),
      phase: str(a.phase), desc: str(a.desc), owns: Array.isArray(a.owns) ? a.owns.map(x => str(x)) : [],
      inPlan: a.inPlan, order: idx,
      state, pct: state === 'done' ? 100 : pct, lastMsg, lastT, startedAt, endedAt,
      eventCount: list.length, loc: own.loc, ownedFiles: own.files, segments: segs,
      marks: list.filter(e => e.t && e.state !== 'start').slice(-60).map(e => [e.t, e.state]),
    };
  });

  feed.sort((a, b) => (Date.parse(b.t) || 0) - (Date.parse(a.t) || 0));
  const counts = { queued: 0, running: 0, done: 0, blocked: 0, failed: 0 };
  for (const a of agents) counts[a.state]++;
  const progress = agents.length ? agents.reduce((s, a) => s + (a.state === 'done' ? 100 : a.pct || 0), 0) / agents.length : 0;

  const recent = scan.files.slice().sort((a, b) => b.mtime - a.mtime).slice(0, 25);
  let firstEvent = null;
  for (const a of agents) if (a.startedAt && (!firstEvent || a.startedAt < firstEvent)) firstEvent = a.startedAt;

  return {
    project: str(plan.project, 'Untitled swarm'),
    tagline: str(plan.tagline),
    startedAt: isoOk(plan.startedAt) ? plan.startedAt : firstEvent,
    firstEvent,
    phases: Array.isArray(plan.phases) ? plan.phases.filter(Boolean).map(p => { const pa = agents.filter(a => a.phase === str(p.id)); return { id: str(p.id), name: str(p.name, p.id), status: ['pending', 'active', 'done'].includes(p.status) ? p.status : 'pending', total: pa.length, done: pa.filter(a => a.state === 'done').length, running: pa.filter(a => a.state === 'running').length }; }) : [],
    agents, counts, progress,
    feed: feed.slice(0, 120),
    checks, gallery, artifacts, audio, media,
    totals: scan.totals,
    loc: history.slice(-1500),
    recent,
    hasPlan: !!lastGoodPlan,
  };
}

let current = null, currentJSON = 'null', currentHash = '';
const clients = new Set();
async function refresh() {
  try {
    const s = await buildState();
    const body = JSON.stringify(s);
    const h = createHash('sha1').update(body).digest('hex');
    current = s;
    if (h !== currentHash) {
      currentHash = h;
      currentJSON = body;
      broadcast();
    }
  } catch (e) { log('refresh', e && e.stack || e); }
}
function payload() {
  // serverTime is stamped at send time so the hash isn't perturbed by the clock
  return currentJSON.replace(/^\{/, '{"serverTime":' + JSON.stringify(new Date().toISOString()) + ',"hash":"' + currentHash + '",');
}
function broadcast() {
  const data = 'event: state\ndata: ' + payload() + '\n\n';
  for (const res of clients) { try { res.write(data); } catch { clients.delete(res); } }
}

// ---------- HTTP ----------
const MIME = { '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.zip': 'application/zip', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    if (path === '/' || path === '/index.html') {
      const html = await readText(join(HERE, 'index.html'));
      res.writeHead(html ? 200 : 503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html || '<h1>index.html missing</h1>');
    }
    if (path === '/api/state') {
      if (!current) await refresh();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(payload());
    }
    if (path === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      if (!current) await refresh();
      res.write('event: state\ndata: ' + payload() + '\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (path === '/api/wav-peaks') {
      const rel = url.searchParams.get('f') || '';
      const n = Math.max(8, Math.min(512, parseInt(url.searchParams.get('n') || '96', 10) || 96));
      const abs = resolve(ROOT, rel);
      const okBase = ['out', 'dist'].some(b => abs.startsWith(join(ROOT, b) + sep));
      if (!rel || rel.includes('\0') || !okBase || !/\.wav$/i.test(abs)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); return res.end('forbidden'); }
      let st; try { st = await fsp.stat(abs); } catch { st = null; }
      if (!st || !st.isFile() || st.size > 64 * 1024 * 1024) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
      let c = peakCache.get(abs);
      if (!c) { c = { mtimeMs: 0, size: 0, dur: 0, out: null, n: 0 }; peakCache.set(abs, c); }
      if (!c.out || c.mtimeMs !== st.mtimeMs || c.size !== st.size || c.n !== n) {
        const r = computePeaks(await fsp.readFile(abs), n);
        if (!r) { res.writeHead(422, { 'Content-Type': 'text/plain' }); return res.end('not a wav'); }
        Object.assign(c, { mtimeMs: st.mtimeMs, size: st.size, n, out: r, dur: r.duration });
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      return res.end(JSON.stringify(c.out));
    }
    if (path.startsWith('/files/')) {
      let rel;
      try { rel = decodeURIComponent(path.slice(7)); } catch { rel = ''; }
      const abs = resolve(ROOT, rel);
      const okBase = ['out', 'dist'].some(b => abs.startsWith(join(ROOT, b) + sep));
      if (!rel || rel.includes('\0') || !okBase) { res.writeHead(403, { 'Content-Type': 'text/plain' }); return res.end('forbidden'); }
      let st;
      try { st = await fsp.stat(abs); } catch { st = null; }
      if (!st || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
      const real = await fsp.realpath(abs).catch(() => abs);
      const bases = [];
      for (const b of ['out', 'dist']) {
        bases.push(join(ROOT, b) + sep);
        const rb = await fsp.realpath(join(ROOT, b)).catch(() => null); // out/ and dist/ may be symlinks to another disk
        if (rb) bases.push(rb + sep);
      }
      if (!bases.some(b => real.startsWith(b))) { res.writeHead(403, { 'Content-Type': 'text/plain' }); return res.end('forbidden'); }
      const hdr = {
        'Content-Type': MIME[extname(abs).toLowerCase()] || 'application/octet-stream',
        'Accept-Ranges': 'bytes',
        'Cache-Control': url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'no-cache',
      };
      const rm = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (rm && (rm[1] || rm[2])) { // Range support so <audio> can seek
        let a = rm[1] ? +rm[1] : Math.max(0, st.size - +rm[2]), b = rm[1] && rm[2] ? Math.min(+rm[2], st.size - 1) : st.size - 1;
        if (a > b || a >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
        res.writeHead(206, { ...hdr, 'Content-Length': b - a + 1, 'Content-Range': `bytes ${a}-${b}/${st.size}` });
        const rs = createReadStream(abs, { start: a, end: b }); rs.on('error', () => res.destroy()); return rs.pipe(res);
      }
      res.writeHead(200, { ...hdr, 'Content-Length': st.size });
      const s = createReadStream(abs);
      s.on('error', () => res.destroy());
      return s.pipe(res);
    }
    if (path.startsWith('/api/agent/')) {
      let id = ''; try { id = decodeURIComponent(path.slice(11)); } catch { /* */ }
      const evs = await loadEvents();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ id, events: (evs[id] || []).slice(-2000) }));
    }
    if (path === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found');
  } catch (e) {
    log('req', e && e.stack || e);
    try { res.writeHead(500); res.end('error'); } catch { /* */ }
  }
});

await loadHistory();
await refresh();
await sampleHistory();
let busy = false;
setInterval(async () => { if (busy) return; busy = true; try { await refresh(); } finally { busy = false; } }, 1000);
setInterval(sampleHistory, 10000);
setInterval(() => { for (const res of clients) { try { res.write(': ping\n\n'); } catch { clients.delete(res); } } }, 15000);
server.on('error', e => { log('server error', e.message); process.exit(1); });
server.listen(PORT, HOST, () => log(`tracker on http://${HOST}:${PORT}/  root=${ROOT}`));
