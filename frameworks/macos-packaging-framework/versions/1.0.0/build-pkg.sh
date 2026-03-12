#!/usr/bin/env bash
# =============================================================================
# build-pkg.sh — macOS Packaging Framework 1.0.0
# =============================================================================
# Reads macos/package.yaml from the title repo overlay, then builds a flat .pkg
# using pkgbuild (and optionally productbuild for distribution packages).
#
# Called by the CI macos-build job after it:
#   1. Downloads and unzips this framework bundle
#   2. Overlays title's macos/src/ content
#   3. Invokes: bash build-pkg.sh --title-path <path> --out-dir <out>
#
# Required tools: pkgbuild, plutil, shasum (all standard on macOS)
# Optional:       yq (for YAML parsing)    brew install yq
# =============================================================================

set -euo pipefail

# ── Usage ────────────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
Usage: $0 --title-path <path> --out-dir <out> [--pkg-version <ver>]

  --title-path    Absolute or relative path to the title's macos/ directory
                  (must contain package.yaml and src/)
  --out-dir       Directory to write the final .pkg and build.env
  --pkg-version   Override vendor_version from package.yaml (optional)
EOF
  exit 1
}

TITLE_PATH=""
OUT_DIR=""
PKG_VERSION_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title-path)   TITLE_PATH="$2";           shift 2 ;;
    --out-dir)      OUT_DIR="$2";              shift 2 ;;
    --pkg-version)  PKG_VERSION_OVERRIDE="$2"; shift 2 ;;
    -h|--help)      usage ;;
    *) echo "Unknown argument: $1"; usage ;;
  esac
done

[[ -z "$TITLE_PATH" ]] && { echo "ERROR: --title-path is required"; usage; }
[[ -z "$OUT_DIR"    ]] && { echo "ERROR: --out-dir is required";    usage; }

PACKAGE_YAML="$TITLE_PATH/package.yaml"
SRC_DIR="$TITLE_PATH/src"

[[ -f "$PACKAGE_YAML" ]] || { echo "ERROR: package.yaml not found: $PACKAGE_YAML"; exit 1; }
[[ -d "$SRC_DIR"      ]] || { echo "ERROR: src/ directory not found: $SRC_DIR";    exit 1; }

# ── Parse package.yaml ───────────────────────────────────────────────────────
# Requires yq (brew install yq) or falls back to grep-based parsing
if command -v yq &>/dev/null; then
  VENDOR_VERSION=$(yq '.vendor_version'   "$PACKAGE_YAML")
  PACKAGING_VER=$(yq  '.packaging_version' "$PACKAGE_YAML")
  SOURCE_TYPE=$(yq    '.source_type'       "$PACKAGE_YAML")
  SOURCE_FILE=$(yq    '.source_filename'   "$PACKAGE_YAML")
  RECEIPT_ID=$(yq     '.receipt_id'        "$PACKAGE_YAML")
  BUNDLE_ID=$(yq      '.bundle_id'         "$PACKAGE_YAML")
  MIN_OS=$(yq         '.minimum_os'        "$PACKAGE_YAML")
  POST_INSTALL=$(yq   '.post_install_script // ""' "$PACKAGE_YAML")
  PRE_INSTALL=$(yq    '.pre_install_script  // ""' "$PACKAGE_YAML")
else
  # Fallback: naive grep (works for simple scalar YAML)
  _yaml_val() { grep "^${1}:" "$PACKAGE_YAML" | head -1 | sed "s/^${1}:[[:space:]]*//" | tr -d "'\""; }
  VENDOR_VERSION=$(_yaml_val vendor_version)
  PACKAGING_VER=$(_yaml_val  packaging_version)
  SOURCE_TYPE=$(_yaml_val    source_type)
  SOURCE_FILE=$(_yaml_val    source_filename)
  RECEIPT_ID=$(_yaml_val     receipt_id)
  BUNDLE_ID=$(_yaml_val      bundle_id)
  MIN_OS=$(_yaml_val         minimum_os)
  POST_INSTALL=$(_yaml_val   post_install_script || echo "")
  PRE_INSTALL=$(_yaml_val    pre_install_script  || echo "")
fi

# Apply optional version override
PKG_VERSION="${PKG_VERSION_OVERRIDE:-${VENDOR_VERSION}}"
PACKAGE_ID="$RECEIPT_ID"

echo "─────────────────────────────────────────────"
echo " macOS Packaging Framework 1.0.0"
echo " Title source : $TITLE_PATH"
echo " Source type  : $SOURCE_TYPE"
echo " Source file  : $SOURCE_FILE"
echo " Version      : $PKG_VERSION (packaging: $PACKAGING_VER)"
echo " Receipt ID   : $RECEIPT_ID"
echo " Bundle ID    : $BUNDLE_ID"
echo " Min OS       : $MIN_OS"
echo "─────────────────────────────────────────────"

# Ensure output directory
mkdir -p "$OUT_DIR"

# ── Staging area ─────────────────────────────────────────────────────────────
STAGING=$(mktemp -d)
SCRIPTS_STAGING="$STAGING/scripts"
PAYLOAD_STAGING="$STAGING/payload"
mkdir -p "$SCRIPTS_STAGING" "$PAYLOAD_STAGING"

# Copy source installer / app into payload
SOURCE_PATH="$SRC_DIR/Files/$SOURCE_FILE"
[[ -e "$SOURCE_PATH" ]] || { echo "ERROR: Source file not found: $SOURCE_PATH"; rm -rf "$STAGING"; exit 1; }
cp -a "$SOURCE_PATH" "$PAYLOAD_STAGING/"

# ── Scripts: preinstall ───────────────────────────────────────────────────────
FRAMEWORK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE_PREINSTALL="$FRAMEWORK_DIR/templates/preinstall.sh"

if [[ -n "$PRE_INSTALL" && -f "$SRC_DIR/$PRE_INSTALL" ]]; then
  echo "Using title-defined preinstall: $PRE_INSTALL"
  cp "$SRC_DIR/$PRE_INSTALL" "$SCRIPTS_STAGING/preinstall"
elif [[ -f "$TEMPLATE_PREINSTALL" ]]; then
  cp "$TEMPLATE_PREINSTALL" "$SCRIPTS_STAGING/preinstall"
fi

if [[ -f "$SCRIPTS_STAGING/preinstall" ]]; then
  chmod +x "$SCRIPTS_STAGING/preinstall"
fi

# ── Scripts: postinstall ──────────────────────────────────────────────────────
TEMPLATE_POSTINSTALL="$FRAMEWORK_DIR/templates/postinstall.sh"

if [[ -n "$POST_INSTALL" && -f "$SRC_DIR/$POST_INSTALL" ]]; then
  echo "Using title-defined postinstall: $POST_INSTALL"
  cp "$SRC_DIR/$POST_INSTALL" "$SCRIPTS_STAGING/postinstall"
elif [[ -f "$TEMPLATE_POSTINSTALL" ]]; then
  cp "$TEMPLATE_POSTINSTALL" "$SCRIPTS_STAGING/postinstall"
fi

if [[ -f "$SCRIPTS_STAGING/postinstall" ]]; then
  chmod +x "$SCRIPTS_STAGING/postinstall"
fi

# ── Build .pkg ───────────────────────────────────────────────────────────────
SAFE_NAME=$(echo "$RECEIPT_ID" | tr '.' '-')
PKG_FILENAME="${SAFE_NAME}-${PKG_VERSION}-${PACKAGING_VER}.pkg"
PKG_OUTPATH="$OUT_DIR/$PKG_FILENAME"

PKG_ARGS=(
  --root       "$PAYLOAD_STAGING"
  --identifier "$PACKAGE_ID"
  --version    "$PKG_VERSION"
  --install-location "/tmp/spa-install/$SAFE_NAME"
)

if ls "$SCRIPTS_STAGING"/* &>/dev/null; then
  PKG_ARGS+=(--scripts "$SCRIPTS_STAGING")
fi

if [[ "$SOURCE_TYPE" == "pkg" ]]; then
  # Wrap existing .pkg in a distribution for re-signing
  pkgbuild "${PKG_ARGS[@]}" "$PKG_OUTPATH"
else
  pkgbuild "${PKG_ARGS[@]}" "$PKG_OUTPATH"
fi

rm -rf "$STAGING"

# ── Checksum & dotenv ─────────────────────────────────────────────────────────
SHA256=$(shasum -a 256 "$PKG_OUTPATH" | awk '{print $1}')
BUILT_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "✅ Built: $PKG_OUTPATH"
echo "SHA-256 : $SHA256"

cat >"$OUT_DIR/build.env" <<ENVFILE
PKG_PATH=$PKG_OUTPATH
PKG_FILENAME=$PKG_FILENAME
PKG_SHA256=$SHA256
VENDOR_VERSION=$VENDOR_VERSION
PACKAGING_VERSION=$PACKAGING_VER
RECEIPT_ID=$RECEIPT_ID
BUNDLE_ID=$BUNDLE_ID
BUILT_AT=$BUILT_AT
ENVFILE

echo "Dotenv written: $OUT_DIR/build.env"
