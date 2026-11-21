# Learnings, mistakes & fixes

Running log. Format: **what happened -> why -> fix / rule for next time**. Per-agent detail lives in `docs/swarm/reports/<agentId>.md`.

## 1. <short title> (<timestamp>)
- **What happened:**
- **Why:**
- **Fix / rule:**

## Parallel module integration (CATXZZON)
- Run `tools/check-imports.mjs` after every wave: modules written against a contract in parallel drift on export names; this finds it in 1 second instead of a blank browser page.
- Use `swarm-next.mjs` instead of counting agents by hand; it enforces caps (5 total, 1 fable, 2 opus).
