#!/usr/bin/env bash
# =============================================================================
# preinstall.sh — Default pre-install script template
# macOS Packaging Framework 1.0.0
# =============================================================================
# Runs before the pkg payload is installed.
# Override by placing a custom preinstall.sh in macos/src/ and referencing it
# as pre_install_script in package.yaml.
# =============================================================================

set -euo pipefail

echo "[preinstall] Running default pre-install checks..."

# Check macOS version compatibility
OS_VERSION=$(sw_vers -productVersion)
echo "[preinstall] macOS version: $OS_VERSION"

# Kill running instances of this app if needed.
# Uncomment and customise the line below:
# pkill -x "YourAppName" 2>/dev/null || true

echo "[preinstall] Pre-install complete."
exit 0
