#!/usr/bin/env node
// Static dev server (zero deps). `node tools/serve.mjs [port=4871]`; also importable: startStatic({root, port}).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm', '.glsl': 'text/plain; charset=utf-8', '.vert': 'text/plain; charset=utf-8', '.frag': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Start a static server. Resolves { server, port, url, close() }. port 0 = ephemeral. */
export function startStatic({ root = REPO_ROOT, port = 0, host = '127.0.0.1', quiet = true } = {}) {
  root = path.resolve(root);
  const server = http.createServer((req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.includes('\0')) throw new Error('bad path');
      let file = path.join(root, p);
      if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end('forbidden'); return; }
      let st = fs.existsSync(file) ? fs.statSync(file) : null;
      if (st && st.isDirectory()) { file = path.join(file, 'index.html'); st = fs.existsSync(file) ? fs.statSync(file) : null; }
      if (!st) { if (!quiet) console.log(`404 ${p}`); res.writeHead(404, { 'content-type': 'text/plain' }).end('not found: ' + p); return; }
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
      if (!quiet) console.log(`200 ${p}`);
    } catch (e) { res.writeHead(400).end('bad request'); }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const p = server.address().port;
      resolve({ server, port: p, url: `http://${host}:${p}`, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); }) });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 4871);
  const s = await startStatic({ port, host: '0.0.0.0', quiet: false }).catch(e => { console.error('serve failed:', e.message); process.exit(1); });
  console.log(`dev server: http://127.0.0.1:${s.port}/  (root ${REPO_ROOT})`);
}
