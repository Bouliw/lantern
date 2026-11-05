#!/bin/bash
# Renders public/icons/icon.svg to the PNG sizes used by browsers, iOS and webOS (macOS only).
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
SVG="$DIR/public/icons/icon.svg"
TMP="$(mktemp -d)"
qlmanage -t -s 1024 -o "$TMP" "$SVG" >/dev/null 2>&1
SRC="$TMP/icon.svg.png"
[[ -f "$SRC" ]] || { echo "Could not render the SVG"; exit 1; }
out() { sips -z "$1" "$1" "$SRC" --out "$2" >/dev/null; }
out 512 "$DIR/public/icons/icon-512.png"
out 192 "$DIR/public/icons/icon-192.png"
out 180 "$DIR/public/icons/apple-touch-icon.png"
out 80 "$DIR/webos/icon.png"
out 130 "$DIR/webos/largeIcon.png"
rm -rf "$TMP"
echo "Icons written."
