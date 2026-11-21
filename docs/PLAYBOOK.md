# Playbook: running an agent swarm

Each rule is followed by the reason, learned the hard way (a real build hit the usage limit four times).

## 1. Contract first, with disjoint file ownership
Write the shared contract (architecture doc, type/definition file) before launching anyone. Give every agent an `owns:` list
that no other agent shares. Why: agents run in parallel and cannot see each other's work. Overlapping files get clobbered;
a fixed contract lets agents code against files that do not exist yet. Scope growth then means adding rows to the
manifest, not rewriting. An agent that needs something from a file it does not own writes a "Requests" note in its report.

## 2. One manifest, generated prompt files
Keep a single `docs/swarm/SWARM.md` (preamble + one section per agent) and run `swarm-plan.mjs`. It writes one prompt
file per agent and `plan.json` for the dashboard. Spawn with a one-line prompt: "Read <path>/prompts/<id>.md and execute it exactly."
Why: prompts stay out of the orchestrator's context (they were once written inline and burned a large share of it),
rule changes apply to everyone by regenerating, and the plan and the prompts cannot drift apart.

## 3. Concurrency cap and model tiers
Start with at most 4 agents running, and use the cheapest model that is adequate: small model for tooling and mechanical
work, mid model for the bulk, a top model only for the one piece that defines the product, and only if justified.
Why: concurrency does not create budget, total tokens do. 20 concurrent agents, then 8, drained a 5-hour window in minutes
and killed everything mid-task; half-finished agents pay their start-up cost again on every restart. Finished modules per
window is the metric. Launch critical-path agents first. Subagent launches beyond the platform cap (20 in the
observed setup) are rejected, so plan waves.

## 4. Checkpoint files, `CONTINUE:`, fresh contexts
Every agent keeps a 30-line `progress/<id>.md` (Done, Next steps, Gotchas, Commands to verify), updates it at each
milestone, and after about 25 tool calls ends with `CONTINUE: <next step>`. A fresh agent reads the checkpoint and carries on.
Do not resume (SendMessage) a big transcript. Why: a resumed agent re-sends a 100-190k-token transcript on a cold
cache at its original, expensive model; that drained a window in about ten minutes. Resuming is acceptable only for an
agent a few tool calls from done.

## 5. Context-budget rules for agents
Read files with offset/limit or grep, never whole large files; cap command output at about 40 lines; look at images only
when acting on them (about 6 in total) and prefer numeric checks; never re-read a file just written; list contract headings
first and read only the needed sections. Why: the whole context is re-sent on every tool call, so every extra line is paid many times.

## 6. Orchestrator checkpoint and compaction
The orchestrator keeps `docs/CHECKPOINT.md` (append timestamped `## UPDATE` sections, list running agent ids) and writes the
expensive design work to files early, in a small context. Compact or clear before launching a wave. Handle each completion
notice with one launch plus one checkpoint append. Why: the orchestrator's own 200-300k-token context, re-sent on every
wake-up, was a major share of the burn, and a compaction without a checkpoint loses the state of the swarm.

## 7. Unit-test shared foundations before the swarm
Every method of the shared library, not a demo. Tell agents in the preamble to report shared-library defects in their final
message, and when fixing shared code mid-swarm, hash dependants before and after. Why: a bug in a frozen library went
unnoticed by five agents who each worked around it silently.

## 8. Stamp times with `date -u`
Use `date -u +%Y-%m-%dT%H:%M:%SZ` or `new Date().toISOString()`; never type a time. Why: guessed timestamps were about
40 minutes fast, and a local time with a `Z` suffix was 5 hours off. `track.mjs` always stamps for you.

## 9. Verify the loop before committing to it
Prove the verification path exists (for example headless browser rendering) before choosing an architecture. Any page
with a persistent connection needs a test-mode switch (`?poll`). Why: both were learned after the fact.

## 10. Record usage per agent as it finishes
Write tokens and seconds per agent into the checkpoint when each completion notice arrives. Why: timestamps include
limit-reset waits and no token counts exist afterwards, so a cost table built at the end is mostly guesses.

## 11. Real-time bots and renders: bound parallelism and time caps
Run at most about 6 real-time bots or soak runs at once, and give boss or long levels a generous time cap. Render or analyse
large asset sets one item per process, in parallel, never all in one page. Judge loops and fights by a relative metric and
check the log before calling a timeout a failure. Why: 12 parallel bots starved the CPU so the simulation lagged, an
all-in-one render exceeded its timeout, and a too-short cap read as a broken level.

## Running it
1. Copy `templates/SWARM.md` to `docs/swarm/SWARM.md`, fill the preamble, add agents.
2. `node <tracker>/bin/swarm-plan.mjs`, then `node <tracker>/dashboard/server.mjs` and open `http://127.0.0.1:4780/`.
3. Spawn agents in waves of at most 4; each runs `track.mjs <id> start/progress/done`.
4. Append to `docs/CHECKPOINT.md` after every completion; collect `docs/swarm/reports/<id>.md`; record mistakes in `docs/LEARNINGS.md`.

## 12. Trust, then verify (from cheesefantasy)
Re-run the whole test suite yourself before committing; an agent's "tests pass" is a claim, not evidence. Mutation-check new guard tests (reintroduce the bug, see the test fail). Smoke-test the SHIPPED artifact (`smoke_web.sh`, `smoke_linux.sh`, `smoke_windows.sh`), never the build dir. Shot harnesses take absolute output paths. Pin cross-agent conventions (orientation, axes, units) in the contract AND in a test.
