#!/usr/bin/env node
// Web build: node tools/build-web.mjs [--no-bundle]
//   dist/web/{index.html,app.js,style.css}  minified static build (esbuild via npx, fallback: unbundled copy of src/)
//   dist/pawgger2.html                      ONE self-contained file (JS+CSS inlined), playable from file://
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, statSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let dist = join(root, 'dist'), web = join(dist, 'web');
const ESBUILD = process.env.ESBUILD_SPEC || 'esbuild@0.25';

function esbuild(args) {
  if (process.env.NO_ESBUILD) throw new Error('esbuild disabled by NO_ESBUILD');
  return execFileSync('npx', ['--yes', ESBUILD, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
}
const size = (f) => statSync(f).size;
const gz = (f) => gzipSync(readFileSync(f), { level: 9 }).length;
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

/**
 * The game loads modules with import(variable) (main.js, renderer.js), which a bundler cannot follow. Stage a copy of
 * src/ where each such call first consults a module map (every src module, bundled statically), then boot main.js
 * from a tiny entry. Warns if no import(variable) is found (then the bundle is just main.js and its static imports).
 */
function stageEntry(log) {
  const tmp = join(dist, '.stage');
  rmSync(tmp, { recursive: true, force: true });
  cpSync(join(root, 'src'), join(tmp, 'src'), { recursive: true });
  // Rewrite every import(<identifier>) in src/ to consult the module map first (key = path relative to src/).
  let patchedFiles = 0;
  for (const f of walk(join(tmp, 'src')).filter((x) => x.endsWith('.js'))) {
    const dir = relative(join(tmp, 'src'), dirname(f)).split('\\').join('/') || '.';
    const text = readFileSync(f, 'utf8');
    const out = text.replace(/(?<![\w$.])import\(\s*([A-Za-z_$][\w$]*)\s*\)/g, (_, id) => `(window.__imp ? window.__imp(${JSON.stringify(dir)}, ${id}, () => import(${id})) : import(${id}))`);
    if (out !== text) { writeFileSync(f, out); patchedFiles++; }
  }
  if (!patchedFiles) log('WARN no import(variable) found in src/; bundling as-is');
  const mods = walk(join(tmp, 'src')).map((f) => relative(join(tmp, 'src'), f).split('\\').join('/')).filter((f) => f.endsWith('.js') && f !== 'main.js').sort();
  const lines = mods.map((f, i) => `import * as m${i} from './src/${f}';`);
  lines.push(`const mods = {${mods.map((f, i) => ` ${JSON.stringify(f)}: m${i}`).join(',')} };`,
    `window.__mods = mods;`,
    `window.__imp = (dir, p, fb) => { const k = []; for (const s of (dir + '/' + p).split('/')) { if (s === '..') k.pop(); else if (s && s !== '.') k.push(s); } const m = mods[k.join('/')]; return m ? Promise.resolve(m) : fb(); };`,
    "await import('./src/main.js');");
  writeFileSync(join(tmp, 'entry.js'), lines.join('\n') + '\n');
  return join(tmp, 'entry.js');
}

/** Build everything; returns { bundled, files:[{name,bytes,gzip}] }. */
export function buildWeb({ bundle = true, log = console.log, outDir } = {}) {
  dist = outDir ? resolve(outDir) : join(root, 'dist'); web = join(dist, 'web'); // tests pass a temp outDir so they never clobber dist/
  rmSync(web, { recursive: true, force: true });
  mkdirSync(web, { recursive: true });
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  let bundled = false;
  if (bundle) {
    try {
      // ESM output: the game uses top-level await in places, and inline <script type=module> works from file://.
      const entry = stageEntry(log);
      esbuild([entry, '--bundle', '--minify', '--format=esm', '--target=es2022', '--legal-comments=none', `--outfile=${join(web, 'app.js')}`]);
      esbuild(['style.css', '--minify', `--outfile=${join(web, 'style.css')}`]);
      bundled = true;
    } catch (e) {
      log('WARN esbuild unavailable/failed -> unbundled copy of src/: ' + String(e.stderr || e.message).split('\n')[0]);
    }
  }
  if (!bundled) {
    rmSync(join(dist, 'pawgger2.html'), { force: true }); // no bundler -> no single-file build; never leave a stale one
    cpSync(join(root, 'src'), join(web, 'src'), { recursive: true });
    cpSync(join(root, 'style.css'), join(web, 'style.css'));
    writeFileSync(join(web, 'index.html'), html);
  } else {
    const out = html.replace(/<script type="module" src="src\/main\.js"><\/script>/, '<script type="module" src="app.js"></script>');
    if (out === html) throw new Error('index.html: expected <script type="module" src="src/main.js">');
    writeFileSync(join(web, 'index.html'), out);
    // single file
    const js = readFileSync(join(web, 'app.js'), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
    const css = readFileSync(join(web, 'style.css'), 'utf8').replace(/<\/style/gi, '<\\/style');
    const one = out
      .replace(/<link rel="stylesheet" href="style\.css">/, () => `<style>${css}</style>`)
      .replace(/<script type="module" src="app\.js"><\/script>/, () => `<script type="module">${js}</script>`);
    if (/href="style\.css"|src="app\.js"/.test(one)) throw new Error('single-file inlining failed');
    writeFileSync(join(dist, 'pawgger2.html'), one);
  }
  rmSync(join(dist, '.stage'), { recursive: true, force: true });
  const files = [];
  for (const f of ['web/index.html', 'web/app.js', 'web/style.css', 'pawgger2.html']) {
    const p = join(dist, f);
    if (existsSync(p)) files.push({ name: 'dist/' + f, bytes: size(p), gzip: gz(p) });
  }
  log(`web build (${bundled ? 'esbuild bundle' : 'UNBUNDLED fallback'}):`);
  for (const f of files) log(`  ${f.name.padEnd(24)} ${kb(f.bytes).padStart(10)}  gzip ${kb(f.gzip).padStart(9)}`);
  return { bundled, files };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildWeb({ bundle: !process.argv.includes('--no-bundle') });
}
