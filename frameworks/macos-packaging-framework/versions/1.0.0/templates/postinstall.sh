#!/usr/bin/env bash
# =============================================================================
# postinstall.sh — Default post-install script template
# macOS Packaging Framework 1.0.0
# =============================================================================
# Runs after the pkg payload is installed.
# Override by placing a custom postinstall.sh in macos/src/ and referencing it
# as post_install_script in package.yaml.
# =============================================================================

set -euo pipefail

echo "[postinstall] Running default post-install tasks..."

# Set ownership on installed files if needed
# Example: chown -R root:wheel /Applications/YourApp.app

# Update macOS App Store cache (important for apps in /Applications)
# /System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister \
#   -f /Applications/YourApp.app 2>/dev/null || true

echo "[postinstall] Post-install complete."
exit 0
