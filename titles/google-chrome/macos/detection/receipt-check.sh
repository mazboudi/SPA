#!/usr/bin/env bash
# =============================================================================
# receipt-check.sh — Receipt-based detection
# Checks if the macOS installer receipt exists for Google Chrome Test.
# Use in Jamf Smart Groups or Script criteria.
# =============================================================================

RECEIPT_ID="com.google.chrome"

if pkgutil --pkg-info "$RECEIPT_ID" &>/dev/null; then
    echo "Installed"
    exit 0
else
    echo "Not Installed"
    exit 1
fi
