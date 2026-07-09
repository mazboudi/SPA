# Mac Title Handling — Review, Gaps & Enhancements

## How Mac Titles Work Today

### Step-by-Step Flow

```
Workbench (wizard)
  │
  ├─ 1. Mac Installer Step
  │      ├─ Select installer type: .pkg / .dmg / .zip
  │      ├─ Bundle ID / Receipt ID  (e.g. com.vendor.app)
  │      ├─ Minimum macOS version   (10.15 → 15.0, dropdown)
  │      ├─ Source mode A: file committed to git → macos/src/Files/
  │      └─ Source mode B: SMB file share        → fetch-mac-installer CI job
  │
  ├─ 2. Mac Config Step
  │      ├─ Package
  │      │    ├─ Jamf Category       ← dropdown from bundled jamf-categories.json
  │      │    ├─ Package Notes
  │      │    └─ Reboot Required
  │      ├─ Policy
  │      │    ├─ Policy Triggers     (checkin / login / startup / custom)
  │      │    ├─ Custom Trigger Name (when custom selected)
  │      │    └─ Policy Frequency    (Once Per Computer / Ongoing / etc.)
  │      ├─ Scope
  │      │    ├─ Scope Group IDs     (comma-separated computer group IDs)
  │      │    └─ Exclusion Group IDs (comma-separated)
  │      ├─ Self Service
  │      │    ├─ Enable toggle
  │      │    ├─ Self Service Category ID
  │      │    └─ Self Service Description (free text)
  │      ├─ Install Scripts
  │      │    ├─ Pre-install script  (toggle + inline bash editor)
  │      │    └─ Post-install script (toggle + inline bash editor)
  │      └─ Detection
  │           ├─ Extension Attribute (toggle)
  │           │    ├─ Application Path  (e.g. /Applications/App.app)
  │           │    └─ Plist Version Key (default: CFBundleShortVersionString)
  │           └─ Receipt check script  (always generated)
  │
  └─ 3. Review & Publish
         ├─ Summary card — shows display name, version, publisher, platform
         ├─ "Publish to GitLab" / "Update on GitLab" button
         │    ├─ Calls /api/publish backend endpoint
         │    ├─ Commits all generated scaffolding files to the title's GitLab repo
         │    │    (creates the repo if it doesn't exist yet)
         │    ├─ Optionally triggers a pipeline (Build / Publish / Deploy)
         │    └─ Displays result: project URL, pipeline ID, tag name
         └─ "Open in GitLab" link once committed
```

---

### Generated Scaffolding Files

| File | Purpose |
|---|---|
| `.gitlab-ci.yml` | Pipeline — includes `macos-deploy-jamf.yml`; adds `fetch-mac-installer` job if SMB |
| `macos/package.yaml` | Package metadata (version, source filename, Jamf category, min OS) |
| `macos/jamf/package-inputs.json` | Jamf package record fields (name, category ID, notes, reboot) |
| `macos/jamf/policy-inputs.json` | Jamf policy fields (name, enabled, frequency, triggers, Self Service) |
| `macos/jamf/scope-inputs.json` | Scope + exclusion computer group IDs |
| `macos/jamf/scripts-inputs.json` | Pre/post install script definitions (if enabled) |
| `macos/src/scripts/preinstall` | Pre-install bash script (stub or authored in wizard) |
| `macos/src/scripts/postinstall` | Post-install bash script (stub or authored in wizard) |
| `macos/src/postinstall.sh` | Wrapper script — delegates to `scripts/postinstall` |
| `macos/src/Files/` | Installer binary dir (committed file or `.gitkeep` for SMB) |
| `macos/detection/extension-attribute.sh` | Jamf EA — reads `Info.plist` version key for inventory |
| `macos/detection/receipt-check.sh` | Receipt-based detection (`pkgutil --pkg-info`) |

---

### CI Pipeline Stages

```
[prepare]   fetch-mac-installer      ← only when SMB is configured
               │  Connects to SMB share via smbclient
               │  Downloads .pkg/.dmg → macos/src/Files/  (CI artifact)
               │
[deploy]    macos_deploy_jamf         ← runs on hashicorp/terraform:1.7 (Linux Docker)
               1. Clone terraform-jamf-modules from GitLab
               2. Locate .pkg/.dmg in macos/src/Files/
               3. Run Build-JamfTerraform.sh:
                    - reads macos/jamf/*.json input files
                    - reads macos/package.yaml for metadata
                    - generates Terraform HCL → tf-deploy/
               4. terraform init   (GitLab HTTP backend for state)
               5. terraform plan   -var jamf_instance_url / client_id / secret
               6. terraform apply  -auto-approve
```

---

### What Terraform Deploys to Jamf Pro

`terraform-jamf-modules` provisions the following Jamf resources in a single `apply`:

| Jamf Resource | Driven By | Details |
|---|---|---|
| **Package** (`jamfpro_package`) | `package-inputs.json` | Uploads .pkg/.dmg binary; sets category, notes, reboot flag |
| **Policy** (`jamfpro_policy`) | `policy-inputs.json` | Install policy with triggers, frequency, and Self Service settings |
| **Scope** | `scope-inputs.json` | Computer group IDs and exclusion groups bound to the policy |
| **Pre-install Script** (`jamfpro_script`) | `scripts-inputs.json` | Uploads preinstall script record to Jamf (if enabled) |
| **Post-install Script** (`jamfpro_script`) | `scripts-inputs.json` | Uploads postinstall script record to Jamf (if enabled) |
| **Extension Attribute** (`jamfpro_computer_extension_attribute`) | `extension-attribute.sh` | EA shell script for version inventory reporting (if enabled) |

> **Re-run safety:** State is managed per-project via the GitLab Terraform HTTP backend.
> Re-running the pipeline updates existing resources rather than creating duplicates —
> `terraform plan` detects drift and only changes what's different.

---

## Gaps Identified

### 🔴 Critical

| # | Gap | Impact |
|---|---|---|
| 1 | **No App Store / VPP awareness** | Engineer packages an app that should be VPP — wasted effort, wrong delivery method |
| 2 | **No code signing / notarization check** | Gatekeeper rejects unsigned/unnotarized binaries silently on the endpoint |
| 3 | **`macos-build.yml` is a no-op stub** | No pre-processing, signing validation, or re-packaging step exists at all |

### 🟡 Medium

| # | Gap | Impact |
|---|---|---|
| 4 | **No version comparison against Jamf** | Packager can't see if version being submitted is older than what's already in Jamf |
| 5 | **No pkg/dmg metadata auto-extraction** | Bundle ID, version, receipt filled in manually — unlike Windows MSI auto-extraction |
| 6 | **Scope uses raw group IDs** | Computer group IDs must be looked up and typed manually — no live Jamf group picker |
| 7 | **SMB-only installer source** | No support for direct URL download, vendor CDN, or S3/GCS bucket |
| 8 | **No update/supersedence concept** | No equivalent to Intune supersedence — old policies are not automatically retired |

### 🟢 Minor

| # | Gap | Impact |
|---|---|---|
| 9 | **No dry-run mode** | No equivalent to `INTUNE_DRY_RUN` — every trigger runs a live `terraform apply` |
| 10 | **Jamf categories are bundled, not live** | `jamf-categories.json` is a static JSON file baked into the workbench build at deploy time — categories added/renamed in Jamf won't appear until the workbench is rebuilt |
| 11 | **No Jamf smart group auto-creation** | Cannot auto-create a smart group keyed on bundle ID receipt for scoping |

---

## Answering the Question: "Should I package this — is it in the App Store or already published?"

### Currently: No check exists.

### Proposed Solution — Pre-flight Check in the Mac Installer Step

Add a **"Check Before Packaging"** panel with two live lookups:

---

#### Check 1 — Apple App Store / VPP Availability

Query the **public iTunes Search API** (no auth required, no cost):

```
GET https://itunes.apple.com/search?term=<appName>&entity=macSoftware&limit=5
```

**If results return, show:**
- App name, developer, current App Store version
- Banner: *"⚠️ This app is available on the Mac App Store. Consider deploying via Apple Business Manager (VPP) instead of packaging."*
- Direct link to the App Store listing

**Why this matters:**
- VPP apps are automatically updated by Apple — no packaging, signing, or version tracking needed
- Packaging an App Store app creates version drift and potential license compliance issues
- Common enterprise titles (Slack, Zoom, Chrome, Teams, 1Password) are best delivered via VPP

---

#### Check 2 — Already in Jamf?

Query the **Jamf Pro API** using workbench settings credentials:

```
GET <JAMF_INSTANCE_URL>/api/v1/packages?filter=packageName=="<name>"
```

**Version comparison display:**

| Scenario | Workbench shows |
|---|---|
| Not in Jamf | ✅ Safe to publish as new |
| Same version already in Jamf | ⚠️ v3.2.1 already published — re-deploy only if content changed |
| Older version in Jamf | ✅ v3.2.0 in Jamf — this will update to v3.2.1 |
| Newer version already in Jamf | 🔴 v3.3.0 already in Jamf — this would downgrade! |
| Available on App Store | ℹ️ Available via VPP — consider managed app instead of packaging |

---

## Enhancement Roadmap

### P1 — Before next Mac title goes live
1. **App Store / VPP check** — iTunes Search API in the Mac Installer step (no auth, no cost)
2. **Jamf version detection** — compare submitted version against existing Jamf package via API
3. **Code signing validation** in CI — `codesign -v` / `spctl --assess` before `terraform apply`
4. **Dry-run mode** — `TF_MAC_DRY_RUN=true` → `terraform plan` only, no apply

### P2 — Near-term
5. **Auto-extract pkg metadata** — parse `PackageInfo` XML from .pkg to auto-fill bundle ID, version, receipt (mirrors Windows MSI extraction)
6. **Live Jamf group picker** — call Jamf API to list computer groups as a searchable dropdown instead of manual ID entry
7. **Live category refresh** — replace static `jamf-categories.json` with a live Jamf API call so new/renamed categories appear immediately without a workbench rebuild
8. **URL installer source** — vendor CDN / S3 direct download as an alternative to SMB

### P3 — Strategic
9. **Notarization check** — verify stapled notarization ticket with `stapler validate` in CI
10. **Jamf smart group generation** — auto-create a smart group keyed on bundle ID receipt for deployment scoping
11. **VPP/managed app path** — if App Store app detected, offer to generate a Jamf managed app assignment instead of package + policy
12. **Supersedence/retirement** — when updating a title, auto-scope the old policy to 0 groups and generate a deprecation policy note
