#!/bin/sh
# usage: tools/sheet.sh <out.jpg> <cols> <img...>   Contact sheet of any screenshots (labels = file names).
set -eu
OUT="${1:?out.jpg}"; COLS="${2:?cols}"; shift 2
montage -label '%t' "$@" -tile "${COLS}x" -geometry 640x360+4+4 -background '#222' -fill white "$OUT"
echo "$OUT"
