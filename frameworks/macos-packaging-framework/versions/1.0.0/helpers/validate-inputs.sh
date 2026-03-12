#!/usr/bin/env bash
# =============================================================================
# validate-inputs.sh — Pre-flight validation for macOS build inputs
# macOS Packaging Framework 1.0.0
# =============================================================================
# Validates that package.yaml contains all required fields and that the
# referenced source file exists.
#
# Usage: bash validate-inputs.sh --title-path <macos_dir>
# =============================================================================

set -euo pipefail

TITLE_PATH=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --title-path) TITLE_PATH="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

[[ -z "$TITLE_PATH" ]] && { echo "ERROR: --title-path is required"; exit 1; }

PACKAGE_YAML="$TITLE_PATH/package.yaml"
SRC_DIR="$TITLE_PATH/src"

echo "Validating inputs for: $TITLE_PATH"

# 1 — package.yaml must exist
[[ -f "$PACKAGE_YAML" ]] || { echo "ERROR: package.yaml not found: $PACKAGE_YAML"; exit 1; }
echo "  ✓ package.yaml found"

# 2 — required fields
_check_field() {
  local field="$1"
  if command -v yq &>/dev/null; then
    local val; val=$(yq ".$field" "$PACKAGE_YAML")
    [[ -n "$val" && "$val" != "null" ]] || { echo "  ✗ Missing required field: $field"; return 1; }
  else
    grep -q "^${field}:" "$PACKAGE_YAML" || { echo "  ✗ Missing required field: $field"; return 1; }
  fi
  echo "  ✓ $field"
}

REQUIRED_FIELDS=(vendor_version packaging_version source_type source_filename receipt_id bundle_id minimum_os)
ERRORS=0
for f in "${REQUIRED_FIELDS[@]}"; do
  _check_field "$f" || ERRORS=$((ERRORS+1))
done

# 3 — source file must exist
if command -v yq &>/dev/null; then
  SOURCE_FILE=$(yq '.source_filename' "$PACKAGE_YAML")
else
  SOURCE_FILE=$(grep "^source_filename:" "$PACKAGE_YAML" | head -1 | sed 's/^source_filename:[[:space:]]*//' | tr -d '"'"'"'')
fi

SOURCE_PATH="$SRC_DIR/Files/$SOURCE_FILE"
if [[ -e "$SOURCE_PATH" ]]; then
  echo "  ✓ Source file found: $SOURCE_PATH"
else
  echo "  ✗ Source file NOT found: $SOURCE_PATH"
  ERRORS=$((ERRORS+1))
fi

if [[ $ERRORS -gt 0 ]]; then
  echo ""
  echo "❌ Validation failed with $ERRORS error(s)."
  exit 1
fi

echo ""
echo "✅ All inputs validated successfully."
