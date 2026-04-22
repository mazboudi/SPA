# Terraform Jamf Modules — Deployment Overview

This repository contains reusable Terraform modules for deploying macOS applications to **Jamf Pro** as part of the SPA (Software Package Automation) pipeline.

## Architecture

```
Title Repository                        terraform-jamf-modules
┌──────────────────────┐               ┌─────────────────────────┐
│ macos/               │               │ modules/                │
│   package.yaml       │──read by──▶   │   package/              │
│   jamf/              │               │   policy/               │
│     package-inputs   │               │   extension-attribute/  │
│     policy-inputs    │               │   smart-group/          │
│     scope-inputs     │               │   category/             │
│   src/Files/*.pkg    │               │                         │
└──────────┬───────────┘               │ scripts/                │
           │                           │   Build-JamfTerraform   │
           ▼                           │                         │
   GitLab CI Pipeline                  │ templates/              │
   (macos-deploy-jamf.yml)             │   macos-deploy-jamf.yml │
           │                           └─────────────────────────┘
           ▼
    Build-JamfTerraform.ps1
    generates main.tf + variables.tf
           │
           ▼
    terraform init → plan → apply
           │
           ▼
       Jamf Pro
    ┌─────────────────────────┐
    │ Package uploaded (CDP)  │
    │ Policy created          │
    │ Extension Attribute set │
    └─────────────────────────┘
```

## How It Works

1. A packager scaffolds a macOS title using `New-Title.ps1`, which generates `macos/jamf/*.json` input files and `macos/package.yaml`.
2. The packager drops a pre-built `.pkg` or `.dmg` into `macos/src/Files/`.
3. On `git push --tags`, the GitLab CI pipeline runs the `macos_deploy_jamf` job.
4. The job calls `Build-JamfTerraform.ps1`, which reads the JSON inputs and `package.yaml` to generate a `main.tf` wiring up the modules below.
5. `terraform apply` creates/updates all Jamf Pro objects in a single run.
6. Terraform state is managed by GitLab's built-in HTTP backend — no external state storage needed.

---

## Modules

### `modules/package`

**Purpose**: Uploads a `.pkg` or `.dmg` to Jamf Pro's Cloud Distribution Point as a package record.

| Input | Description |
|---|---|
| `package_name` | Display name in Jamf (e.g., "Google Chrome 134.0") |
| `package_file_source` | Local file path or HTTP(S) URL to the installer |
| `category_id` | Jamf category ID (use `"-1"` for none) |
| `notes` | Notes field for the package record |
| `reboot_required` | Whether a reboot is needed after install |
| `os_requirements` | Comma-separated OS requirements (e.g., "macOS 13.0") |
| `upload_timeout` | Terraform timeout for large uploads (default: 90m) |

**Outputs**: `id` (Jamf package ID), `name`

---

### `modules/policy`

**Purpose**: Creates a Jamf Pro policy that installs the uploaded package on target computers.

| Input | Description |
|---|---|
| `policy_name` | Policy name (e.g., "SPA - Install Google Chrome") |
| `package_id` | Package ID from the `package` module output |
| `enabled` | Whether the policy is active |
| `trigger` | `RECURRING_CHECK_IN` or `EVENT` (Self Service) |
| `frequency` | `Once per computer`, `Always`, etc. |
| `scope_group_ids` | List of Jamf smart/static group IDs to target |
| `exclusion_group_ids` | List of group IDs to exclude |
| `run_recon_after_install` | Whether to update inventory after install |
| `reboot_required` | Configures reboot behavior in the policy |
| `self_service_enabled` | Whether to show in Jamf Self Service |
| `self_service_display_name` | Display name in Self Service |
| `self_service_description` | Description shown in Self Service |

**Outputs**: `id` (Jamf policy ID)

---

### `modules/extension-attribute`

**Purpose**: Creates a Jamf Pro Computer Extension Attribute that reports the installed version of an application. Uses a shell script that checks the macOS `pkgutil` receipt database.

This enables Jamf Smart Groups to filter computers by installed version (e.g., "Chrome version < 134.0" → target for upgrade).

| Input | Description |
|---|---|
| `name` | EA name (e.g., "SPA - Google Chrome Version") |
| `description` | Description of the EA |
| `receipt_id` | macOS pkgutil receipt ID (e.g., `com.google.chrome`) |

**Outputs**: `id` (Jamf EA ID)

**Auto-wired**: If `receipt_id` is present in `macos/package.yaml`, `Build-JamfTerraform.ps1` automatically generates this module block. No manual Jamf setup needed.

---

### `modules/smart-group`

**Purpose**: Creates a Jamf Pro Smart Computer Group with dynamic criteria. Useful for targeting computers based on extension attribute values, OS version, or other inventory data.

Uses the `jamfpro_smart_computer_group_v2` resource (the v1 resource is deprecated).

| Input | Description |
|---|---|
| `name` | Smart group name |
| `site_id` | Jamf site ID (default: `-1` for no site) |
| `criteria` | List of criteria objects with `name`, `priority`, `and_or`, `search_type`, `value` |

**Outputs**: `id`, `name`

**Example criteria**: Find computers where Chrome is older than 134.0:
```hcl
criteria = [
  {
    name        = "SPA - Google Chrome Version"
    priority    = 0
    and_or      = "and"
    search_type = "less than"
    value       = "134.0"
  }
]
```

---

### `modules/category`

**Purpose**: Creates or manages a Jamf Pro category for organizing packages and policies (e.g., "Browsers", "Productivity", "Security").

| Input | Description |
|---|---|
| `name` | Category name |
| `priority` | Category priority (default: `9`) |

**Outputs**: `id`, `name`

---

## Scripts

### `scripts/Build-JamfTerraform.ps1`

**Purpose**: Pipeline script that reads the title's declarative JSON inputs and generates a complete Terraform root configuration (`main.tf` + `variables.tf`).

**Inputs**:
- `macos/jamf/package-inputs.json` → feeds `module "package"`
- `macos/jamf/policy-inputs.json` → feeds `module "policy"`
- `macos/jamf/scope-inputs.json` → feeds scope/exclusion group IDs
- `macos/package.yaml` → reads `receipt_id` for `module "extension_attribute"`

**Outputs** (generated into `tf-deploy/`):
- `main.tf` — provider config + module blocks + outputs
- `variables.tf` — credential variables (`jamf_instance_url`, `client_id`, `client_secret`, `package_file_path`)

---

## Templates

### `templates/macos-deploy-jamf.yml`

**Purpose**: GitLab CI template included by title repos. Defines the `macos_deploy_jamf` job that:

1. Clones this repository at the ref specified by `TF_JAMF_MODULES_REF`
2. Locates the `.pkg`/`.dmg` in `macos/src/Files/`
3. Runs `Build-JamfTerraform.ps1` to generate the Terraform config
4. Runs `terraform init` → `plan` → `apply` with GitLab-managed state

**Required CI/CD Variables** (set at group level):

| Variable | Description |
|---|---|
| `JAMF_INSTANCE_URL` | Jamf Pro FQDN (e.g., `yourcompany.jamfcloud.com`) |
| `JAMF_CLIENT_ID` | Jamf API client ID |
| `JAMF_CLIENT_SECRET` | Jamf API client secret |
| `GITLAB_READ_TOKEN` | Token to clone this repo in CI |

---

## Provider

All modules use the [`deploymenttheory/jamfpro`](https://registry.terraform.io/providers/deploymenttheory/jamfpro/latest) Terraform provider at version `~> 0.37`, authenticated via OAuth2 (API client credentials).
