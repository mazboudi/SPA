#!/usr/bin/env bash
# =============================================================================
# postinstall.sh — wrapper script referenced by package.yaml
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/scripts/postinstall"
