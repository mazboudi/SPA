# Terraform Jamf Template — How It Works & What Features We Implement

## Overview

```
macos-deploy-jamf.yml (CI pipeline)
  │
  └─ Calls Build-JamfTerraform.sh
         │  Reads macos/jamf/*.json + package.yaml
         │  Conditionally includes Terraform modules
         │  Generates tf-deploy/main.tf + variables.tf
         │
         └─ terraform init + plan + apply
                └─ deploymenttheory/jamfpro provider (~> 0.37)
                       └─ Calls Jamf Pro API to create/update resources
```

The `terraform-jamf-modules` repo contains:
- **6 reusable modules** — each wraps one Jamf Pro resource type
- **1 orchestration script** — `Build-JamfTerraform.sh` decides which modules to include based on the title's JSON files
- **Provider**: `deploymenttheory/jamfpro` ~> 0.37 via Terraform Registry

---

## The 6 Modules

### 1. `modules/package` — Jamf Package Record

**Jamf resource:** `jamfpro_package`

**What it does:** Uploads the .pkg or .dmg binary to Jamf Pro distribution points and creates the package record.

**Variables wired from `package-inputs.json`:**

| Variable | Source | Notes |
|---|---|---|
| `package_name` | `package_name` | Display name in Jamf |
| `package_file_source` | CLI `--package-path` arg | Absolute path to .pkg/.dmg |
| `category_id` | `category_id` | Jamf category ID |
| `notes` | `notes` | Package record notes |
| `os_requirements` | `os_requirements` | Min OS string |
| `reboot_required` | `reboot_required` | Post-install reboot |

**Always included** — every title gets a package module.

---

### 2. `modules/policy` — Jamf Policy

**Jamf resource:** `jamfpro_policy`

**What it does:** Creates the install policy that delivers the package to devices. References the package by ID from module.package.id (automatically linked).

**Variables wired from `policy-inputs.json`:**

| Variable | Source | Notes |
|---|---|---|
| `policy_name` | `policy_name` | e.g. "SPA - Install Google Chrome" |
| `package_id` | `module.package.id` | Auto-linked — no manual ID needed |
| `enabled` | `enabled` | true/false |
| `frequency` | `frequency` | "Once per computer", "Ongoing", etc. |
| `triggers` | `triggers[]` | checkin / login / startup / enrollment / custom |
| `custom_trigger` | `custom_trigger` | Event name when trigger = custom |
| `scope_group_ids` | `scope-inputs.json` | Computer group IDs |
| `exclusion_group_ids` | `scope-inputs.json` | Exclusion group IDs |
| `run_recon_after_install` | `run_recon_after_install` | Inventory update post-install |
| `reboot_required` | `reboot_required` | Post-install reboot |
| `self_service_enabled` | `self_service_enabled` | Jamf Self Service toggle |
| `self_service_display_name` | `self_service_display_name` | Name in Self Service catalog |
| `self_service_description` | `self_service_description` | Description in Self Service |
| `self_service_category_id` | `self_service_category_id` | Self Service category |

**Always included** — every title gets a policy module.

---

### 3. `modules/script` — Jamf Script Record

**Jamf resource:** `jamfpro_script`

**What it does:** Uploads a shell script to Jamf Pro as a named script record. Used for pre-install and post-install scripts. Priority can be `"Before"` or `"After"` the package install.

**Variables:**

| Variable | Source | Notes |
|---|---|---|
| `script_name` | `scripts-inputs.json` | e.g. "SPA - Chrome preinstall" |
| `script_contents` | `scripts-inputs.json` / .sh file | Full bash script body |
| `priority` | hardcoded per module block | "Before" (pre) or "After" (post) |
| `notes` | hardcoded | "Managed by SPA pipeline." |

**Conditionally included** — only added to `main.tf` if `scripts-inputs.json` exists and `preinstall.enabled == true` or `postinstall.enabled == true`.

> Script content is written to `macos/jamf/preinstall.sh` / `postinstall.sh` by the build script so Terraform can `file()` reference them.

---

### 4. `modules/extension-attribute` — Jamf Computer Extension Attribute

**Jamf resource:** `jamfpro_computer_extension_attribute`

**What it does:** Creates an EA that runs on each managed Mac to report the installed version of the app using `pkgutil --pkg-info <receipt_id>`. The result appears in Jamf inventory and can be used in smart group criteria.

**EA script (auto-generated, hardcoded pattern):**
```bash
RECEIPT="com.google.chrome"
VERSION=$(pkgutil --pkg-info "$RECEIPT" 2>/dev/null | awk '/version:/{print $2}')
if [[ -n "$VERSION" ]]; then
  echo "<result>$VERSION</result>"
else
  echo "<result>NOT INSTALLED</result>"
fi
```

**Variables:**

| Variable | Source | Notes |
|---|---|---|
| `name` | auto-built: "SPA - {pkg_name} Version" | EA display name in Jamf |
| `receipt_id` | `package.yaml → receipt_id` | e.g. "com.google.chrome" |
| `description` | hardcoded | "Reports installed application version. Managed by SPA pipeline." |

**Conditionally included** — only added if `receipt_id` is present in `package.yaml` and is not the placeholder `com.vendor.todo`.

---

### 5. `modules/smart-group` — Jamf Smart Computer Group

**Jamf resource:** `jamfpro_smart_computer_group_v2`

**What it does:** Creates a smart group with dynamic membership criteria. Supports any combination of Jamf criteria (EA value, OS version, application presence, etc.).

**Variables:**

| Variable | Notes |
|---|---|
| `name` | Smart group name |
| `criteria[]` | List of criteria objects: name, priority, and_or, search_type, value |
| `site_id` | -1 = Full Jamf Pro |

**⚠️ Module exists but is NOT called by `Build-JamfTerraform.sh`.**
The module is built and ready but no JSON input file (`smart-group-inputs.json`) is defined, and `Build-JamfTerraform.sh` has no code to conditionally include it.

---

### 6. `modules/category` — Jamf Category

**Jamf resource:** `jamfpro_category`

**What it does:** Creates a new category in Jamf Pro with a name and priority.

**Variables:**

| Variable | Notes |
|---|---|
| `name` | Category name (e.g. "Browsers") |
| `priority` | 1–20, default 9 |

**⚠️ Module exists but is NOT called by `Build-JamfTerraform.sh`.**
Categories are currently passed as IDs from `jamf-categories.json` — the module for creating new categories is unused.

---

## Feature Matrix — What's Wired vs Available

| Feature | Module | Wired in Pipeline? | Controlled By |
|---|---|---|---|
| Upload package binary | `package` | ✅ Always | `package-inputs.json` |
| Create install policy | `policy` | ✅ Always | `policy-inputs.json` |
| Policy scope (groups) | `policy` | ✅ Always | `scope-inputs.json` |
| Policy exclusions | `policy` | ✅ Always | `scope-inputs.json` |
| Policy triggers (checkin/login/startup/custom) | `policy` | ✅ Always | `policy-inputs.json` |
| Policy frequency | `policy` | ✅ Always | `policy-inputs.json` |
| Run recon after install | `policy` | ✅ Always | `policy-inputs.json` |
| Reboot after install | `policy` + `package` | ✅ Always | `policy-inputs.json` |
| Jamf Self Service | `policy` | ✅ Conditional | `policy-inputs.json → self_service_enabled` |
| Self Service description + category | `policy` | ✅ Conditional | `policy-inputs.json` |
| Pre-install script | `script` | ✅ Conditional | `scripts-inputs.json → preinstall.enabled` |
| Post-install script | `script` | ✅ Conditional | `scripts-inputs.json → postinstall.enabled` |
| Extension Attribute (version tracking) | `extension-attribute` | ✅ Conditional | `package.yaml → receipt_id` present |
| Smart Group creation | `smart-group` | ❌ Module ready, not wired | No input file / no build-script code |
| Category creation | `category` | ❌ Module ready, not wired | Categories passed as IDs only |

---

## How `Build-JamfTerraform.sh` Decides What to Include

```
Required (always):
  package-inputs.json  ─────► module "package" block in main.tf
  policy-inputs.json   ─────► module "policy" block
  scope-inputs.json    ─────► scope_group_ids + exclusion_group_ids in policy

Conditional (script modules):
  scripts-inputs.json exists?
    └─ preinstall.enabled == true?  ─► module "preinstall_script" block
    └─ postinstall.enabled == true? ─► module "postinstall_script" block

Conditional (extension attribute):
  package.yaml has receipt_id AND != "com.vendor.todo"?
    └─ module "extension_attribute" block

Not wired (modules exist but Build-JamfTerraform.sh has no code for them):
    smart-group, category
```

---

## State Management

- **Backend:** GitLab HTTP Terraform backend (per-project, per `TF_STATE_NAME`)
- **Re-run behavior:** `terraform plan` detects drift — existing resources are updated in-place, not duplicated
- **Lock:** GitLab-managed state locking via POST/DELETE on state URL

---

## Gaps in the Terraform Layer

| # | Gap | Fix |
|---|---|---|
| 1 | `smart-group` module unused | Add `smart-group-inputs.json` schema and wire it in `Build-JamfTerraform.sh` |
| 2 | `category` module unused | Could auto-create categories rather than relying on pre-existing IDs |
| 3 | Extension Attribute EA script is hardcoded to `pkgutil` receipt pattern | .app bundle / defaults read pattern not supported (workaround: wizard also generates `extension-attribute.sh` but the Terraform EA ignores that file) |
| 4 | No `terraform destroy` / cleanup step | No pipeline stage to remove old Jamf resources when a title is retired |
| 5 | Policy category always set to `-1` (hardcoded in `main.tf`) | The policy module supports `category_id` but Build-JamfTerraform.sh always passes `-1` |
