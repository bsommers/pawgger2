#!/usr/bin/env node
// swarm-tracker progress reporter. Appends one JSON line to <root>/.tracker/events/<agentId>.jsonl.
//   track.mjs <agentId> <start|progress|done|blocked|failed|note> [pct 0-100] "<message>"
//   track.mjs --check <name> <pass|fail|running|skip> "<detail>"
// <root> = $TRACKER_ROOT, else the current directory.
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.env.TRACKER_ROOT || process.cwd());
const args = process.argv.slice(2);
const t = new Date().toISOString();
const STATES = ['start', 'progress', 'done', 'blocked', 'failed', 'note'];
const CHECKS = ['pass', 'fail', 'running', 'skip'];

function usage(msg) {
  console.error(msg + '\nusage: track.mjs <agentId> <' + STATES.join('|') + '> [pct] "<msg>"\n       track.mjs --check <name> <' + CHECKS.join('|') + '> "<detail>"');
  process.exit(2);
}

if (args[0] === '--check') {
  const [, name, status, ...rest] = args;
  if (!name || !CHECKS.includes(status)) usage('bad check');
  mkdirSync(join(root, '.tracker/checks'), { recursive: true });
  writeFileSync(join(root, '.tracker/checks', name.replace(/[^\w.-]/g, '_') + '.json'),
    JSON.stringify({ name, status, detail: rest.join(' '), t }) + '\n');
} else {
  const [agent, state, ...rest] = args;
  if (!agent || !STATES.includes(state)) usage('bad event');
  let pct = null;
  if (rest.length > 1 && /^\d{1,3}$/.test(rest[0])) pct = Math.min(100, Number(rest.shift()));
  if (state === 'done') pct = 100;
  if (state === 'start' && pct === null) pct = 0;
  mkdirSync(join(root, '.tracker/events'), { recursive: true });
  appendFileSync(join(root, '.tracker/events', agent.replace(/[^\w.-]/g, '_') + '.jsonl'),
    JSON.stringify({ t, agent, state, pct, msg: rest.join(' ') }) + '\n');
}
