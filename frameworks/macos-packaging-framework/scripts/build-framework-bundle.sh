#!/usr/bin/env bash
# =============================================================================
# build-framework-bundle.sh — Package macos-packaging-framework version
# =============================================================================
# Creates a distributable tar.gz bundle of the specified framework version,
# computes a SHA-256 checksum, and writes a dotenv for CI consumption.
#
# Usage: bash scripts/build-framework-bundle.sh [version]
#   version  — Optional. Defaults to the latest directory under versions/
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSIONS_DIR="$SCRIPT_DIR/../versions"
OUT_DIR="$SCRIPT_DIR/../dist"

# Resolve version
VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  VERSION=$(ls -1 "$VERSIONS_DIR" | sort -V | tail -1)
fi

VERSION_DIR="$VERSIONS_DIR/$VERSION"
[[ -d "$VERSION_DIR" ]] || { echo "ERROR: Version directory not found: $VERSION_DIR"; exit 1; }
[[ -f "$VERSION_DIR/manifest.json" ]] || { echo "ERROR: manifest.json missing in $VERSION_DIR"; exit 1; }

echo "Bundling macos-packaging-framework $VERSION..."

mkdir -p "$OUT_DIR"

BUNDLE_NAME="macos-packaging-framework-${VERSION}.tar.gz"
BUNDLE_PATH="$OUT_DIR/$BUNDLE_NAME"

# Create tar.gz from version directory contents
tar -czf "$BUNDLE_PATH" -C "$VERSION_DIR" .

echo "Bundle created: $BUNDLE_PATH"

# SHA-256
SHA256=$(shasum -a 256 "$BUNDLE_PATH" | awk '{print $1}')
echo "SHA-256: $SHA256"

# Write checksums.json
CHECKSUM_FILE="$OUT_DIR/checksums.json"
# Build JSON incrementally (append key)
if [[ -f "$CHECKSUM_FILE" ]]; then
  # Use python (always available on macOS) to update JSON
  python3 -c "
import json, sys
with open('$CHECKSUM_FILE') as f: d = json.load(f)
d['$BUNDLE_NAME'] = '$SHA256'
with open('$CHECKSUM_FILE', 'w') as f: json.dump(d, f, indent=2)
"
else
  python3 -c "
import json
with open('$CHECKSUM_FILE', 'w') as f:
    json.dump({'$BUNDLE_NAME': '$SHA256'}, f, indent=2)
"
fi
echo "Checksums written: $CHECKSUM_FILE"

# Write dotenv
cat >"$OUT_DIR/bundle.env" <<ENVFILE
BUNDLE_PATH=$BUNDLE_PATH
BUNDLE_NAME=$BUNDLE_NAME
BUNDLE_SHA256=$SHA256
FRAMEWORK_VERSION=$VERSION
ENVFILE

echo "Dotenv written: $OUT_DIR/bundle.env"
echo "✅ Bundle complete: $BUNDLE_NAME"
