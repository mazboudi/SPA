#!/usr/bin/env bash
# =============================================================================
# detect-receipt.sh — Detect installed package by receipt
# macOS Packaging Framework 1.0.0
# =============================================================================
# Queries pkgutil to determine if a package receipt is registered on this Mac.
# Used by Jamf extension attributes and local testing.
#
# Usage: bash detect-receipt.sh <receipt_id> [expected_version]
#
# Exit codes:
#   0 = installed (optionally: version matches or >= expected)
#   1 = not installed or version mismatch
# =============================================================================

set -euo pipefail

RECEIPT_ID="${1:-}"
EXPECTED_VER="${2:-}"

if [[ -z "$RECEIPT_ID" ]]; then
  echo "Usage: $0 <receipt_id> [expected_version]" >&2
  exit 2
fi

if ! pkgutil --pkg-info "$RECEIPT_ID" &>/dev/null; then
  echo "NOT INSTALLED: $RECEIPT_ID"
  exit 1
fi

INSTALLED_VER=$(pkgutil --pkg-info "$RECEIPT_ID" | awk '/version:/{print $2}')
echo "INSTALLED: $RECEIPT_ID (version: $INSTALLED_VER)"

if [[ -n "$EXPECTED_VER" ]]; then
  # Simple string equality for now; use sort -V for semver if needed
  if [[ "$INSTALLED_VER" != "$EXPECTED_VER" ]]; then
    echo "VERSION MISMATCH: expected=$EXPECTED_VER installed=$INSTALLED_VER"
    exit 1
  fi
  echo "VERSION OK: $INSTALLED_VER == $EXPECTED_VER"
fi

exit 0
