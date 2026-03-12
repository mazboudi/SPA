#!/usr/bin/env bash
# =============================================================================
# postinstall.sh — Google Chrome macOS post-install
# Runs after the GoogleChrome.pkg installs.
# =============================================================================
set -euo pipefail

echo "[postinstall] Google Chrome post-install starting..."

# Register Chrome in the LaunchServices database
CHROME_APP="/Applications/Google Chrome.app"
if [[ -d "$CHROME_APP" ]]; then
  /System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister \
    -f "$CHROME_APP" 2>/dev/null || true
  echo "[postinstall] Chrome registered with LaunchServices."
fi

# Remove quarantine attribute if present (common for downloaded .pkg files)
if [[ -d "$CHROME_APP" ]]; then
  xattr -r -d com.apple.quarantine "$CHROME_APP" 2>/dev/null || true
fi

echo "[postinstall] Google Chrome post-install complete."
exit 0
