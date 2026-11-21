#!/usr/bin/env node
// Integration lint for parallel-built ES-module projects (zero deps).
// node tools/check-imports.mjs [srcDir=src]   Verifies every static relative import resolves to a file AND that each
// named import is actually exported there. Dynamic import('./x.js') targets are checked for existence only (reported as warnings).
// Catches contract drift between swarm agents before the browser does. Exit 1 on errors.
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(process.argv[2] || 'src');
const files = []; (function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); f.isDirectory() ? walk(p) : /\.m?js$/.test(f.name) && files.push(p); } })(root);
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const exportsOf = new Map();
function exp(file) {
  if (exportsOf.has(file)) return exportsOf.get(file);
  const set = new Set(), src = strip(fs.readFileSync(file, 'utf8')); exportsOf.set(file, set);
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) set.add(m[1]);
  // multi-declarator: export const A = 1, B = f(x, y), C;  (split on depth-0 commas up to the statement end)
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([^;]*?)(?:;|\n(?=\S))/g)) {
    let depth = 0, cur = ''; const parts = [];
    for (const ch of m[1]) { if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
    parts.push(cur);
    for (const part of parts) { const id = part.trim().match(/^([A-Za-z_$][\w$]*)\s*(?:=|$)/); if (id) set.add(id[1]); }
  }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}(?:\s*from\s*['"]([^'"]+)['"])?/g)) for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop(); if (n) set.add(n); }
  if (/export\s+default\b/.test(src)) set.add('default');
  for (const m of src.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/g)) { const t = resolve(file, m[1]); if (t) for (const n of exp(t)) set.add(n); }
  return set;
}
function resolve(from, spec) { if (!spec.startsWith('.')) return null; const p = path.resolve(path.dirname(from), spec.split('?')[0]); return [p, p + '.js', path.join(p, 'index.js')].find(x => fs.existsSync(x) && fs.statSync(x).isFile()) || null; }
let errors = 0, warns = 0; const rel = f => path.relative(process.cwd(), f);
for (const f of files) {
  const src = strip(fs.readFileSync(f, 'utf8'));
  for (const m of src.matchAll(/import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+[\w$]+)?\s*from\s*['"]([^'"]+)['"]/g)) {
    if (!m[3].startsWith('.')) continue;
    const t = resolve(f, m[3]); if (!t) { console.log(`ERR  ${rel(f)}: cannot resolve '${m[3]}'`); errors++; continue; }
    const ex = exp(t);
    if (m[1] && !ex.has('default')) { console.log(`ERR  ${rel(f)}: '${m[3]}' has no default export`); errors++; }
    if (m[2]) for (const part of m[2].split(',')) { const n = part.trim().split(/\s+as\s+/)[0]; if (n && !ex.has(n)) { console.log(`ERR  ${rel(f)}: '${n}' is not exported by ${rel(t)}`); errors++; } }
  }
  for (const m of src.matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) if (!resolve(f, m[1])) { console.log(`WARN ${rel(f)}: dynamic import '${m[1]}' not found (ok if optional)`); warns++; }
}
console.log(`${files.length} files, ${errors} error(s), ${warns} warning(s)`); process.exit(errors ? 1 : 0);
