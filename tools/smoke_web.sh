#!/bin/sh
# usage: tools/smoke_web.sh [dist/<single-file>.html]   Smoke-test the SHIPPED single-file build (not src/): loads it via file:// in
# headless Chrome with tools/shot.mjs --strict (fails on any console error/uncaught exception), checks the frame is not blank.
# Born from cheesefantasy's smoke_linux.sh: test the package, not the build dir.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
F="${1:-$(ls -t "$ROOT"/dist/*.html | head -1)}"
OUT="$ROOT/out/shots/smoke_web.png"; mkdir -p "$(dirname "$OUT")"
node "$ROOT/tools/shot.mjs" --url "file://$F?autostart=1&seed=1" --out "$OUT" --wait 2500 --strict
[ -s "$OUT" ] && echo "SMOKE_WEB OK $(basename "$F") $(wc -c <"$OUT") bytes" || { echo "SMOKE_WEB FAIL"; exit 1; }
