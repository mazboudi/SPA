# schemas/packaging-standards — Schema Guide

This repo publishes the canonical JSON schemas that govern all software title metadata across the packaging automation platform.

## Schema Overview

| Schema | Purpose | Used by |
|--------|---------|---------|
| `app.schema.json` | Root title metadata (`app.json`) | All pipelines (validate stage) |
| `windows-package.schema.json` | Windows build config (`windows/package.yaml`) | Windows build job |
| `macos-package.schema.json` | macOS build config (`macos/package.yaml`) | macOS build job |
| `intune-app.schema.json` | Intune app metadata (`windows/intune/app.json`) | Windows deploy job |
| `intune-requirements.schema.json` | Intune requirements (`windows/intune/requirements.json`) | Windows deploy job |
| `intune-assignments.schema.json` | Intune assignments (`windows/intune/assignments.json`) | Windows deploy job |
| `intune-dependencies.schema.json` | Intune dependencies (`windows/intune/dependencies.json`) | Windows deploy job (optional) |
| `build-manifest.schema.json` | CI artifact descriptor (auto-generated) | Deploy jobs (via dotenv) |

## How to Use

### In a title repo

Your `app.json` must satisfy `app.schema.json`. Your `windows/package.yaml` must satisfy `windows-package.schema.json`, and so on. The CI `metadata-validate` job will fail the pipeline if any schema constraint is violated.

### Validate locally (requires Node.js)

```bash
# Install ajv-cli once
npm install -g ajv-cli

# Validate the root title metadata
ajv validate \
  -s schemas/packaging-standards/schemas/app.schema.json \
  -d titles/google-chrome/app.json

# Validate Windows package metadata
ajv validate \
  -s schemas/packaging-standards/schemas/windows-package.schema.json \
  -d titles/google-chrome/windows/package.yaml

# Validate macOS package metadata
ajv validate \
  -s schemas/packaging-standards/schemas/macos-package.schema.json \
  -d titles/google-chrome/macos/package.yaml

# Validate Intune app config
ajv validate \
  -s schemas/packaging-standards/schemas/intune-app.schema.json \
  -d titles/google-chrome/windows/intune/app.json

# Validate Intune assignments
ajv validate \
  -s schemas/packaging-standards/schemas/intune-assignments.schema.json \
  -d titles/google-chrome/windows/intune/assignments.json

# Validate Intune dependencies (only if file exists)
ajv validate \
  -s schemas/packaging-standards/schemas/intune-dependencies.schema.json \
  -d titles/google-chrome/windows/intune/dependencies.json
```

## Schema Versioning

Schemas are versioned via the packaging-standards repo tag (e.g. `v1.0.0`).  
The CI templates reference a pinned schema tag via the `$SCHEMA_VERSION` variable.  
Breaking schema changes must bump the major version.

## Field Reference

### app.json

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | ✅ | Human-readable name |
| `publisher` | string | ✅ | Vendor/publisher |
| `package_id` | string | ✅ | Kebab-case unique ID |
| `version` | string | ✅ | Vendor version |
| `owners.team` | string | | Responsible packaging team |
| `owners.contact_email` | email | | Contact address |
| `lifecycle` | enum | | `active` / `deprecated` / `retired` |
| `platforms.windows.enabled` | bool | ✅ if windows | Enables Windows jobs |
| `platforms.windows.framework_version` | string | | e.g. `4.1.0` |
| `platforms.macos.enabled` | bool | ✅ if macos | Enables macOS jobs |
| `platforms.macos.framework_version` | string | | e.g. `1.0.0` |
| `deployment.windows` | enum | | `intune` |
| `deployment.macos` | enum | | `jamf` |

### windows/package.yaml

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | ✅ | Installer version |
| `packaging_version` | integer | ✅ | Packaging iteration |
| `installer_type` | enum | ✅ | `msi`, `exe`, `msix`, `ps1` |
| `source_filename` | string | | File in `windows/src/Files/` |
| `install_command` | string | ✅ | Silent install cmdline |
| `uninstall_command` | string | ✅ | Silent uninstall cmdline |
| `detection_mode` | enum | ✅ | `registry-marker`, `file`, `msi-product-code`, `script` |
| `detection` | object | ✅ | Detection parameters (keys vary by mode) |
| `max_runtime_minutes` | integer | | Default: 60 |
| `restart_behavior` | enum | | `suppress`, `allow`, `basedOnReturnCode`, `force` |
| `install_experience` | enum | | `system` or `user` |
| `close_apps` | string | | Processes to close before install/uninstall |
| `return_codes` | array | | Custom return code → type mappings |
| `supersedes.app_id` | string | | Intune App ID this title replaces |
| `supersedes.uninstall_previous` | bool | | Whether to uninstall the old version |

### windows/intune/app.json

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `displayName` | string | ✅ | Name shown in Intune / Company Portal |
| `description` | string | | App description for Company Portal |
| `publisher` | string | ✅ | Publisher name |
| `appVersion` | string | | Version string |
| `informationUrl` | string | | More-info URL |
| `privacyInformationUrl` | string | | Privacy statement URL |
| `isFeatured` | bool | | Featured in Company Portal (default: false) |
| `notes` | string | | Internal admin notes |
| `owner` | string | | Owner team (default: EUC Packaging) |
| `installCommandLine` | string | ✅ | Install command |
| `uninstallCommandLine` | string | ✅ | Uninstall command |
| `applicableArchitectures` | enum | | `x86`, `x64`, `arm`, `neutral` |
| `displayVersion` | string | | Version shown to users |
| `allowAvailableUninstall` | bool | | User can uninstall (default: true) |
| `installContext` | enum | | `system` or `user` |
| `restartBehavior` | enum | | `suppress`, `allow`, `basedOnReturnCode`, `force` |

### windows/intune/assignments.json

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `intent` | enum | ✅ | `available`, `required`, or `uninstall` |
| `groupId` | string | ✅ | Entra ID group object ID |
| `filterMode` | enum | | `none`, `include`, `exclude` |
| `filterId` | string | | Filter ID (when filterMode ≠ none) |

### windows/intune/dependencies.json (optional)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `appId` | string | ✅ | Intune App ID of the dependency |
| `dependencyType` | enum | ✅ | `autoInstall` or `detect` |

### macos/package.yaml

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `vendor_version` | string | ✅ | Installer version |
| `packaging_version` | integer | ✅ | Packaging iteration |
| `source_type` | enum | ✅ | `pkg`, `dmg`, `zip`, `app` |
| `source_filename` | string | ✅ | File in `macos/src/Files/` |
| `receipt_id` | string | ✅ | e.g. `com.google.chrome` |
| `bundle_id` | string | ✅ | e.g. `com.google.Chrome` |
| `minimum_os` | string | ✅ | e.g. `13.0` |
| `architecture` | enum | | `universal`, `arm64`, `x86_64` |
| `jamf_category` | string | | Default Jamf category |
