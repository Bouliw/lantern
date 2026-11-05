#!/bin/bash
# Installs the built app outside protected folders and serves it at login (LaunchAgent).
# Usage: scripts/install-mac-service.sh [port]      Remove: scripts/install-mac-service.sh --remove
# Re-run after each build to update the installed copy.
set -euo pipefail
LABEL="app.lantern.web"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HOME/Library/Application Support/Lantern"

if [[ "${1:-}" == "--remove" ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  rm -rf "$APP/web" "$APP/serve.mjs"
  echo "Removed $LABEL"
  exit 0
fi

PORT="${1:-8097}"
NODE="$(command -v node)"
[[ -f "$SRC/dist/index.html" ]] || { echo "Build first: npm run build"; exit 1; }
mkdir -p "$APP" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
rsync -a --delete "$SRC/dist/" "$APP/web/"
cp "$SRC/scripts/serve.mjs" "$APP/serve.mjs"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$APP/serve.mjs</string>
    <string>--dir</string><string>$APP/web</string>
    <string>--port</string><string>$PORT</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/lantern-web.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/lantern-web.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Lantern runs at http://localhost:$PORT (and on your network at http://<this-mac>:$PORT)"
