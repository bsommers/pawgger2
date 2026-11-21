#!/usr/bin/env node
// Swarm scheduler helper: what is running/done/queued, and what to launch next under the caps.
// TRACKER_ROOT=<proj> node swarm-next.mjs [--cap 5] [--fable 1] [--opus 2]
// Phases order the queue (p1<p2<...). Prints ready-to-paste one-line spawn prompts + the model to pass. Never launches anything.
import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(process.env.TRACKER_ROOT || '.'); const T = path.join(ROOT, '.tracker');
const a = process.argv.slice(2); const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? Number(a[i + 1]) : d; };
const cap = opt('cap', 5), capFable = opt('fable', 1), capOpus = opt('opus', 2);
const plan = JSON.parse(fs.readFileSync(path.join(T, 'plan.json'), 'utf8'));
const state = id => { try { const L = fs.readFileSync(path.join(T, 'events', id + '.jsonl'), 'utf8').trim().split('\n').filter(Boolean); return L.length ? JSON.parse(L.at(-1)) : null; } catch { return null; } };
const rows = plan.agents.map(g => { const e = state(g.id); const st = !e ? 'queued' : ['done', 'failed', 'blocked'].includes(e.state) ? e.state : 'running'; return { ...g, st, pct: e?.pct, msg: e?.msg, t: e?.t }; });
const running = rows.filter(r => r.st === 'running'), done = new Set(rows.filter(r => r.st === 'done').map(r => r.id));
const cnt = m => running.filter(r => r.model === m).length;
console.log(`running ${running.length}/${cap}  (fable ${cnt('fable')}/${capFable}, opus ${cnt('opus')}/${capOpus})   done ${done.size}/${rows.length}`);
for (const r of rows.filter(r => r.st !== 'queued')) console.log(`  ${r.st.padEnd(8)} ${r.id.padEnd(14)} ${r.model.padEnd(6)} ${String(r.pct ?? '').padStart(3)}% ${(r.msg || '').slice(0, 60)}`);
let free = cap - running.length, f = cnt('fable'), o = cnt('opus'); const launch = [];
for (const r of rows.filter(r => r.st === 'queued').sort((x, y) => String(x.phase).localeCompare(String(y.phase)))) {
  if (free <= 0) break; if (r.model === 'fable' && f >= capFable) continue; if (r.model === 'opus' && o >= capOpus) continue;
  launch.push(r); free--; if (r.model === 'fable') f++; if (r.model === 'opus') o++;
}
console.log(launch.length ? '\nLaunch now:' : '\nNothing to launch (caps full or queue empty).');
for (const r of launch) console.log(`  model=${r.model}  "Read ${ROOT}/docs/swarm/prompts/${r.id}.md and execute it exactly."   # ${r.name}`);
const stalled = running.filter(r => r.t && Date.now() - Date.parse(r.t) > 20 * 60e3);
if (stalled.length) console.log('\nStalled >20min (no event):', stalled.map(r => r.id).join(', '), '-> check progress/<id>.md, resume via SendMessage');
