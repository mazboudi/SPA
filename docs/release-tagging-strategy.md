# SPA Release & Tagging Strategy

> **Status**: Deferred — branch fallback rules added for testing. Implement tagging when moving to production releases.

---

## Overview

Every shared SPA component uses **semantic version tags** (`vX.Y.Z`) to trigger release pipelines and enable consumers to pin to a specific version. During testing, all pipelines fall back to the `main` branch so tags are not required.

## Tag Format

```
v<major>.<minor>.<patch>
```

Examples: `v4.1.0`, `v1.0.0`, `v2.3.1`

Tags must match the regex: `^v\d+\.\d+\.\d+$`

---

## Tagging Matrix

| Repository | Tag triggers | What it produces | Consumers |
|-----------|-------------|-----------------|-----------|
| **psadt-enterprise** | `build` → `publish` | `.zip` bundle in Generic Package Registry | Title pipelines via `PSADT_FRAMEWORK_VERSION` |
| **gitlab-ci-templates** | `release` | GitLab Release (no artifact — consumed via `include: project:`) | Title `.gitlab-ci.yml` via `ref:` |
| **intune-deployment-modules** | `release` | GitLab Release (scripts cloned at runtime) | `windows-deploy-intune.yml` via `INTUNE_MODULES_REF` |
| **macos-packaging-framework** | `build` → `publish` | `.tar.gz` bundle in Generic Package Registry | macOS title pipelines |
| **terraform-jamf-modules** | `release` | GitLab Release (modules cloned at runtime) | `macos-deploy-jamf.yml` via `TF_JAMF_MODULES_REF` |

## Version Derivation

When a tag is present, the version is extracted by stripping the `v` prefix:

| Language | Code |
|----------|------|
| PowerShell | `$VERSION = $env:CI_COMMIT_TAG -replace '^v', ''` |
| Bash | `VERSION="${CI_COMMIT_TAG#v}"` |

When **no tag** is present (branch fallback), the version is derived as:

| Repository | Fallback |
|-----------|----------|
| psadt-enterprise | Latest `versions/` directory name |
| macos-packaging-framework | Latest `versions/` directory name (via `sort -V`) |
| Others | `0.0.0-dev` or N/A (release stage skipped) |

---

## Current State: Testing Mode

All pipelines have `main` branch fallback rules so that every stage runs on every push to `main`, **without requiring a tag**:

```yaml
rules:
  - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/   # Production: tag-triggered
  - if: $CI_COMMIT_BRANCH == "main"               # Testing: branch fallback
```

Release/publish stages use `when: manual` on branch pushes to prevent accidental production releases.

> [!IMPORTANT]
> Remove branch fallback rules (or switch to `when: manual`) before moving to production. Tags should be the sole trigger for publishing artifacts and creating releases.

---

## How to Implement Tagging for Production

### Step 1: Remove Branch Fallback Rules

For each pipeline's build/publish/release stages, remove the `main` branch fallback rule:

```diff
  rules:
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/
-   - if: $CI_COMMIT_BRANCH == "main"
```

### Step 2: Create a Tag

```bash
# From the repo root, on the main branch
git tag v4.1.0
git push origin v4.1.0
```

### Step 3: Verify Pipeline

The tag push triggers the full pipeline (test → build → publish/release). Verify:
- Artifacts are uploaded to the GitLab Package Registry
- GitLab Release is created with the tag name
- Consumer pipelines can reference the new version

### Step 4: Pin Consumers

Update consumer pipelines to reference the tagged version:

```yaml
# Title .gitlab-ci.yml
include:
  - project: 'euc/software-package-automation/spa-frameworks/gitlab-ci-templates'
    ref: 'v1.0.0'           # ← pin to tagged release
    file:
      - 'templates/windows-build.yml'

variables:
  PSADT_FRAMEWORK_VERSION: "4.1.0"   # ← must match psadt-enterprise tag
  INTUNE_MODULES_REF: "v1.0.0"      # ← pin intune-deployment-modules
  TF_JAMF_MODULES_REF: "v1.0.0"     # ← pin terraform-jamf-modules
```

---

## Version Bumping Checklist

When preparing a release:

1. **Update version directories** (psadt-enterprise, macos-packaging-framework):
   - Copy `versions/<current>` → `versions/<new>`
   - Make changes in the new version directory
2. **Commit and push** to `main`
3. **Create and push the tag**: `git tag v<new> && git push origin v<new>`
4. **Verify** the pipeline completes all stages
5. **Update consumers** to reference the new version

---

## Protected Tags (Recommended for Production)

Configure GitLab protected tags to prevent accidental or unauthorized releases:

```
Settings → Repository → Protected tags
  Tag: v*
  Allowed to create: Maintainers
```

This ensures only maintainers can create version tags.
