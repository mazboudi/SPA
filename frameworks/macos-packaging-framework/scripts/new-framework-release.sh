#!/usr/bin/env bash
# =============================================================================
# new-framework-release.sh — Publish macos-packaging-framework to GitLab
# =============================================================================
# 1. Calls build-framework-bundle.sh to produce the tar.gz artifact
# 2. Uploads to GitLab Package Registry (generic packages API)
# 3. Creates a GitLab release entry
#
# Environment variables required:
#   GITLAB_RELEASE_TOKEN   — Personal/project token with api scope
#   CI_API_V4_URL          — GitLab API base URL (set automatically in CI)
#   CI_PROJECT_ID          — Numeric project ID (set automatically in CI)
#
# Usage: bash scripts/new-framework-release.sh <version>
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION="${1:-}"
[[ -z "$VERSION" ]] && { echo "Usage: $0 <version>"; exit 1; }

: "${GITLAB_RELEASE_TOKEN:?GITLAB_RELEASE_TOKEN is required}"
: "${CI_API_V4_URL:?CI_API_V4_URL is required}"
: "${CI_PROJECT_ID:?CI_PROJECT_ID is required}"

# Build the bundle
bash "$SCRIPT_DIR/build-framework-bundle.sh" "$VERSION"

DIST_DIR="$SCRIPT_DIR/../dist"
source "$DIST_DIR/bundle.env"

echo "Uploading $BUNDLE_NAME to GitLab Package Registry..."
UPLOAD_URI="$CI_API_V4_URL/projects/$CI_PROJECT_ID/packages/generic/macos-packaging-framework/$VERSION/$BUNDLE_NAME"

curl --fail --silent --show-error \
  --header "PRIVATE-TOKEN: $GITLAB_RELEASE_TOKEN" \
  --upload-file "$BUNDLE_PATH" \
  "$UPLOAD_URI"

echo "Upload complete: $UPLOAD_URI"

# Create GitLab release
TAG_NAME="v$VERSION"
RELEASE_JSON=$(python3 -c "
import json
print(json.dumps({
  'name': f'macos-packaging-framework v$VERSION',
  'tag_name': '$TAG_NAME',
  'description': f'macOS Packaging Framework bundle v$VERSION',
  'assets': {
    'links': [{
      'name': '$BUNDLE_NAME',
      'url': '$UPLOAD_URI',
      'link_type': 'package'
    }]
  }
}))
")

echo "Creating GitLab release $TAG_NAME..."
HTTP_CODE=$(curl --silent --output /dev/null --write-out "%{http_code}" \
  --header "PRIVATE-TOKEN: $GITLAB_RELEASE_TOKEN" \
  --header "Content-Type: application/json" \
  --data "$RELEASE_JSON" \
  --request POST \
  "$CI_API_V4_URL/projects/$CI_PROJECT_ID/releases")

if [[ "$HTTP_CODE" == "201" ]]; then
  echo "✅ Release created: $TAG_NAME"
elif [[ "$HTTP_CODE" == "409" ]]; then
  echo "Release $TAG_NAME already exists — skipping."
else
  echo "ERROR: Unexpected HTTP $HTTP_CODE creating release"; exit 1
fi
