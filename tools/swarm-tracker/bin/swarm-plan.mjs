#!/usr/bin/env node
// Generates <root>/<prompts dir>/<id>.md and <root>/.tracker/plan.json from a swarm manifest.
//   swarm-plan.mjs [--manifest docs/swarm/SWARM.md] [--out docs/swarm/prompts] [--phase p1=active,p0=done]
// <root> = $TRACKER_ROOT, else the current directory.
// Manifest: `## @preamble`, optional `## @meta` (lines `project: ...`, `tagline: ...`),
// optional `## @role:<role>` appendices, and agent sections `## id | model | phase | role | Name`
// followed by an `owns:` line and the task text. {{id}} {{name}} {{model}} {{owns}} {{root}} are substituted.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(process.env.TRACKER_ROOT || process.cwd());
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const manifest = opt('--manifest', 'docs/swarm/SWARM.md');
const outDir = opt('--out', 'docs/swarm/prompts');

const src = readFileSync(join(root, manifest), 'utf8');
const sections = src.split(/^## /m).slice(1).map((s) => { const nl = s.indexOf('\n'); return [s.slice(0, nl).trim(), s.slice(nl + 1).trim()]; });
const special = Object.fromEntries(sections.filter(([h]) => h.startsWith('@')).map(([h, b]) => [h.slice(1), b]));
if (!special.preamble) throw new Error('manifest has no "## @preamble" section');
const meta = {};
for (const line of (special.meta || '').split('\n')) { const m = line.match(/^(\w+):\s*(.*)$/); if (m) meta[m[1]] = m[2].trim(); }
const agents = sections.filter(([h]) => !h.startsWith('@')).map(([h, body]) => {
  const [id, model, phase, role, name] = h.split('|').map((x) => x.trim());
  const m = body.match(/^owns:\s*(.*)\n?/);
  if (!m || !name) throw new Error('bad agent section: ' + h);
  return { id, model, phase, role, name, owns: m[1].split(',').map((x) => x.trim()).filter(Boolean), task: body.slice(m[0].length).trim() };
});
const ids = new Set(); for (const a of agents) { if (ids.has(a.id)) throw new Error('duplicate id ' + a.id); ids.add(a.id); }

mkdirSync(join(root, outDir), { recursive: true });
for (const a of agents) {
  const fill = (t) => t.replaceAll('{{id}}', a.id).replaceAll('{{name}}', a.name).replaceAll('{{model}}', a.model).replaceAll('{{root}}', root).replaceAll('{{owns}}', a.owns.map((o) => '`' + o + '`').join(', '));
  const extra = special['role:' + a.role] ? '\n\n' + fill(special['role:' + a.role]) : '';
  writeFileSync(join(root, outDir, a.id + '.md'), `# ${a.id} — ${a.name}\n\n${fill(special.preamble)}\n\n${fill(a.task)}${extra}\n`);
}

const planPath = join(root, '.tracker/plan.json');
const old = existsSync(planPath) ? JSON.parse(readFileSync(planPath, 'utf8')) : {};
const over = Object.fromEntries(opt('--phase', '').split(',').filter(Boolean).map((kv) => kv.split('=')));
let phases = (old.phases || []).map((p) => ({ ...p, status: over[p.id] || p.status }));
if (!phases.length) {                                   // derive phases from the agents' phase ids
  phases = [...new Set(agents.map((a) => a.phase))].map((id) => ({ id, name: id, status: over[id] || 'pending' }));
}
const keep = (old.agents || []).filter((a) => !ids.has(a.id));          // orchestrator and earlier one-offs
const plan = { ...old, ...(meta.project ? { project: meta.project } : {}), ...(meta.tagline ? { tagline: meta.tagline } : {}),
  startedAt: old.startedAt || new Date().toISOString(), phases,
  agents: [...keep, ...agents.map(({ task, ...a }) => ({ ...a, desc: task.split('\n').slice(0, 2).join(' ').slice(0, 220) }))] };
mkdirSync(dirname(planPath), { recursive: true });
writeFileSync(planPath, JSON.stringify(plan, null, 1) + '\n');
const byModel = {}; for (const a of agents) byModel[a.model] = (byModel[a.model] || 0) + 1;
console.log(`${agents.length} agents -> ${outDir}/, plan.json updated`, JSON.stringify(byModel));
console.log(agents.map((a) => `${a.id}:${a.model}`).join(' '));
