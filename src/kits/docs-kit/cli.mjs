#!/usr/bin/env node
// usage: node src/kits/docs-kit/cli.mjs <config.json> [outDir=.] [--reports docs/swarm/reports] [--shots out/shots]
// Reads the config, every *.md in --reports (each becomes a report entry), copies PNGs from --shots into <outDir>/docs/screenshots.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { generateDocs } from './index.js';

const args = process.argv.slice(2), flag = (n) => { const i = args.indexOf(n); return i < 0 ? null : args.splice(i, 2)[1]; };
const reportsDir = flag('--reports'), shotsDir = flag('--shots');
const [cfgPath, out = '.'] = args;
if (!cfgPath) { console.error('usage: cli.mjs <config.json> [outDir] [--reports dir] [--shots dir]'); process.exit(2); }
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
if (reportsDir && existsSync(reportsDir)) cfg.reports = [...(cfg.reports || []), ...readdirSync(reportsDir).filter((f) => f.endsWith('.md')).sort().map((f) => ({ name: f.replace(/\.md$/, ''), markdown: readFileSync(join(reportsDir, f), 'utf8') }))];
if (shotsDir && existsSync(shotsDir)) {
  mkdirSync(join(out, 'docs/screenshots'), { recursive: true });
  cfg.screenshots = [...(cfg.screenshots || [])];
  for (const f of readdirSync(shotsDir).filter((x) => x.endsWith('.png')).sort()) {
    copyFileSync(join(shotsDir, f), join(out, 'docs/screenshots', f));
    if (!cfg.screenshots.some((s) => s.file === f)) cfg.screenshots.push({ file: f, caption: f.replace(/\.png$/, '').replace(/[-_]/g, ' ') });
  }
}
for (const [path, text] of Object.entries(generateDocs(cfg))) {
  const dest = join(out, path); mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, text); console.log('wrote', dest);
}
