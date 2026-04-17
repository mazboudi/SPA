# New Title Guide — SPA Platform

> **Audience:** Engineers onboarding a new application into the Software Package Automation (SPA) platform.  
> This guide covers scaffolding for Windows (Intune), macOS (Jamf), or dual-platform titles.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Scaffold the Title](#2-scaffold-the-title)
3. [Fill In the TODOs](#3-fill-in-the-todos)
4. [Key File Reference](#4-key-file-reference)
5. [Pipeline Flow](#5-pipeline-flow)
6. [Full Call Tree](#6-full-call-tree)
7. [Data Flow Between Jobs](#7-data-flow-between-jobs)
8. [Triggering the Pipeline](#8-triggering-the-pipeline)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Prerequisites

| Requirement | Details |
|---|---|
| PowerShell 7+ | Required to run `New-Title.ps1` |
| GitLab access | Write access to `euc/software-package-automation/software-titles/<category>` |
| Windows runner | Tagged `[Windows]` with `IntuneWinAppUtil.exe` at `C:\tools\` (for Windows titles) |
| macOS runner | Tagged `[macOS]` with Xcode CLI + Terraform 1.5+ (for macOS titles) |
| CI Variables | Set at the `software-titles` group level — see table below |

### Required CI Variables (Group Level)

| Variable | Windows | macOS | Purpose |
|---|---|---|---|
| `GITLAB_READ_TOKEN` | ✅ | ✅ | Download frameworks and modules |
| `AZURE_TENANT_ID` | ✅ | — | Entra ID tenant |
| `AZURE_CLIENT_ID` | ✅ | — | SPA app registration |
| `AZURE_CLIENT_SECRET` | ✅ | — | SPA app secret (protected) |
| `PSADT_PROJECT_ID` | ✅ | — | psadt-enterprise GitLab project ID |
| `INTUNE_MODULES_PROJECT_ID` | ✅ | — | intune-deployment-modules project ID |
| `JAMF_URL` | — | ✅ | Jamf Pro base URL |
| `JAMF_CLIENT_ID` | — | ✅ | Jamf API client ID |
| `JAMF_CLIENT_SECRET` | — | ✅ | Jamf API client secret (protected) |
| `MACOS_FRAMEWORK_PROJECT_ID` | — | ✅ | macos-packaging-framework project ID |
| `TF_JAMF_MODULES_PROJECT_ID` | — | ✅ | terraform-jamf-modules project ID |

---

## 2. Scaffold the Title

Run from the **SPA workspace root** (or the `new-title` project root):

### Windows-only title (MSI)

```powershell
pwsh -File scripts/New-Title.ps1 `
     -PackageId       "7-zip" `
     -DisplayName     "7-Zip" `
     -Publisher       "Igor Pavlov" `
     -Version         "26.00" `
     -Category        developer-tools `
     -Platform        windows `
     -InstallerType   msi `
     -DetectionMode   msi-product-code
```

### Windows-only title (EXE with registry-marker detection)

```powershell
pwsh -File scripts/New-Title.ps1 `
     -PackageId       "secure-print-pune" `
     -DisplayName     "Secure Print - Pune" `
     -Publisher       "Fiserv" `
     -Version         "2.3" `
     -Category        custom `
     -Platform        windows `
     -InstallerType   exe `
     -DetectionMode   registry-marker
```

### macOS-only title

```powershell
pwsh -File scripts/New-Title.ps1 `
     -PackageId       "slack" `
     -DisplayName     "Slack" `
     -Publisher       "Slack Technologies" `
     -Version         "4.38.125" `
     -Category        communication `
     -Platform        macos `
     -BundleId        "com.tinyspeck.slackmacgap" `
     -ReceiptId       "com.tinyspeck.slackmacgap"
```

### Dual-platform title

```powershell
pwsh -File scripts/New-Title.ps1 `
     -PackageId       "google-chrome" `
     -DisplayName     "Google Chrome" `
     -Publisher       "Google LLC" `
     -Version         "134.0.6998.89" `
     -Category        browsers `
     -Platform        both `
     -InstallerType   msi `
     -DetectionMode   msi-product-code `
     -BundleId        "com.google.Chrome" `
     -ReceiptId       "com.google.chrome"
```

### Parameter Reference

| Parameter | Required | Default | Description |
|---|---|---|---|
| `-PackageId` | ✅ | — | Kebab-case ID (e.g. `7-zip`, `google-chrome`) |
| `-DisplayName` | ✅ | — | Human-readable name |
| `-Publisher` | ✅ | — | Vendor/publisher |
| `-Version` | ✅ | — | Vendor version string |
| `-Category` | ✅ | — | GitLab subgroup: `browsers`, `productivity`, `developer-tools`, `security`, `communication`, `utilities`, `endpoint-management`, `custom` |
| `-Platform` | — | `windows` | `windows`, `macos`, or `both` |
| `-InstallerType` | — | `msi` | Windows: `msi` or `exe` |
| `-DetectionMode` | — | `msi-product-code` | Windows: `msi-product-code`, `registry-marker`, `file`, `script` |
| `-MacInstallerType` | — | `pkg` | macOS: `pkg`, `dmg`, or `zip` |
| `-BundleId` | — | — | macOS bundle ID (e.g. `com.google.Chrome`) |
| `-ReceiptId` | — | — | macOS receipt ID (defaults to BundleId) |
| `-JamfCategory` | — | Auto-mapped | Jamf category (auto-mapped from `-Category` if omitted) |
| `-GitLabGroup` | — | `euc/software-package-automation` | Root GitLab group |

---

### Generated Directory Structure

**Windows-only:**

``` text
titles/<package-id>/
├── app.json
├── .gitlab-ci.yml
├── .gitignore
└── windows/
    ├── package.yaml
    ├── src/
    │   ├── Deploy-Application.ps1
    │   └── Files/
    │       └── .gitkeep
    └── intune/
        ├── app.json
        ├── assignments.json
        └── requirements.json
```

**macOS-only:**

``` text
titles/<package-id>/
├── app.json
├── .gitlab-ci.yml
├── .gitignore
└── macos/
    ├── package.yaml
    ├── src/
    │   ├── postinstall.sh
    │   ├── scripts/
    │   │   ├── preinstall
    │   │   └── postinstall
    │   └── Files/
    │       └── .gitkeep
    ├── jamf/
    │   ├── package-inputs.json
    │   ├── policy-inputs.json
    │   └── scope-inputs.json
    └── detection/
        ├── extension-attribute.sh
        └── receipt-check.sh
```

**Dual-platform (`-Platform both`):** both `windows/` and `macos/` directories are generated.

---

## 3. Fill In the TODOs

Search for `TODO` in all generated files. Required replacements by platform:

### Windows TODOs

#### `windows/package.yaml`

```yaml
# 7-Zip 26.00 — Windows package definition
package_id: 7-zip
display_name: "7-Zip"
version: "26.00"
packaging_version: "1"
installer_type: msi

install_command: 'msiexec.exe /i "Files\7z2600-x64.msi" /qn /norestart'
uninstall_command: 'msiexec.exe /x "{23170F69-40C1-2702-2408-000001000000}" /qn /norestart'

detection_mode: msi-product-code
detection:
  product_code: "{23170F69-40C1-2702-2408-000001000000}"
  version_operator: greaterThanOrEqual
  version: "26.00"
```

> **Get the MSI ProductCode:**
>
> ```powershell
> pwsh -File frameworks\psadt-enterprise\tools\Get-MsiMetadata.ps1 `
>      -MsiPath titles\7-zip\windows\src\Files\7z2600-x64.msi
> ```

#### `windows/intune/app.json`

```json
{
  "displayName": "7-Zip",
  "description": "Open-source file archiver with high compression ratio.",
  "publisher": "Igor Pavlov"
}
```

#### `windows/intune/assignments.json`

```json
[
  {
    "intent": "available",
    "groupId": "<Entra-ID-Group-Object-ID>",
    "filterMode": "none"
  }
]
```

> Get group Object IDs from **Entra ID → Groups** in the Azure portal.

#### Installer binary

Either:

- Drop `7z2600-x64.msi` into `windows/src/Files/` *(do NOT commit — it's in `.gitignore`)*
- **Or** set the CI variable `WINDOWS_INSTALLER_SOURCE = C:\files\7-zip\7z2600-x64.msi` at the project level (pre-staged on the runner VM)

### macOS TODOs

#### `macos/package.yaml`

```yaml
vendor_version: "4.38.125"
packaging_version: 1
source_type: pkg
source_filename: Slack-4.38.125.pkg
receipt_id: com.tinyspeck.slackmacgap
bundle_id: com.tinyspeck.slackmacgap
minimum_os: "13.0"
architecture: universal
jamf_category: Communication
post_install_script: postinstall.sh
```

#### `macos/jamf/scope-inputs.json`

```json
{
  "scope_groups": {
    "computer_groups": [1001, 1002]
  }
}
```

> Get smart group IDs from **Jamf Pro → Smart Computer Groups**.

#### `macos/detection/extension-attribute.sh`

Update the `APP_PATH` variable to point to the actual application:

```bash
APP_PATH="/Applications/Slack.app"
```

> Upload this script to **Jamf Pro → Settings → Extension Attributes** for inventory reporting.

#### Installer binary

Drop the `.pkg` file into `macos/src/Files/` *(do NOT commit — it's in `.gitignore`)*

---

## 4. Key File Reference

### Windows Files

| File | Purpose |
|---|---|
| `windows/package.yaml` | Build metadata + install/uninstall/detection commands |
| `windows/src/Deploy-Application.ps1` | PSADT v4 install/uninstall logic (title-specific overlay) |
| `windows/src/Files/` | Installer binary location (not committed to git) |
| `windows/intune/app.json` | Intune display metadata (name, description, publisher) |
| `windows/intune/assignments.json` | Entra ID group assignments |
| `windows/intune/requirements.json` | Hardware/OS minimum requirements |
| `windows/intune/supersedence.json` | *(optional)* Links new app as superseding an older Intune app |
| `windows/detection/detect.ps1` | *(only for `script` detection mode)* Custom detection script |

### macOS Files

| File | Purpose |
|---|---|
| `macos/package.yaml` | Build metadata: source type, bundle ID, receipt ID, architecture |
| `macos/src/scripts/preinstall` | Bash script run before payload extraction |
| `macos/src/scripts/postinstall` | Bash script run after payload extraction |
| `macos/src/postinstall.sh` | Wrapper referenced by `package.yaml` |
| `macos/src/Files/` | Installer .pkg binary (not committed to git) |
| `macos/jamf/package-inputs.json` | Jamf package name, category, notes |
| `macos/jamf/policy-inputs.json` | Jamf policy name, trigger, frequency |
| `macos/jamf/scope-inputs.json` | Jamf smart group targeting |
| `macos/detection/extension-attribute.sh` | Jamf EA for version reporting |
| `macos/detection/receipt-check.sh` | Receipt-based detection script |

### Shared / Infrastructure Files

| File | Owner Repo | Purpose |
|---|---|---|
| `app.json` | Title repo | Title identity, platform flags, lifecycle |
| `.gitlab-ci.yml` | Title repo | Includes shared templates, declares stages + variables |
| `templates/windows-build.yml` | `gitlab-ci-templates` | Windows build job definition |
| `templates/windows-deploy-intune.yml` | `gitlab-ci-templates` | Intune publish + assign jobs |
| `templates/macos-build.yml` | `gitlab-ci-templates` | macOS .pkg build job definition |
| `templates/macos-deploy-jamf.yml` | `gitlab-ci-templates` | Jamf deploy via Terraform |
| `scripts/IntuneDeployment.psm1` | `intune-deployment-modules` | Shared module: YAML parser, Graph auth |
| `scripts/Publish-Win32App.ps1` | `intune-deployment-modules` | Creates Win32 app in Intune via Graph API |
| `scripts/Resolve-DetectionRules.ps1` | `intune-deployment-modules` | Translates package.yaml → Graph detection objects |
| `scripts/Set-Win32Assignments.ps1` | `intune-deployment-modules` | Assigns app to Entra ID groups |

---

## 5. Pipeline Flow

### Windows Pipeline (3 stages)

Triggered by a push to `main` or a version tag (`v26.00-1`):

``` text
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE: build  (automatic)                                                   │
│   windows_build                                                             │
│     ✓ Validate app.json + windows/package.yaml                             │
│     ✓ Download & cache PSADT framework bundle                               │
│     ✓ Copy installer (from git or WINDOWS_INSTALLER_SOURCE)                │
│     ✓ Run IntuneWinAppUtil.exe → produces .intunewin                       │
│     ✓ Write out/build.env  (INTUNEWIN_PATH, VENDOR_VERSION …)              │
└──────────────────────────────── dotenv injection ───────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE: publish  (automatic)                                                 │
│   windows_publish_intune                                                    │
│     ✓ Download intune-deployment-modules scripts                            │
│     ✓ Resolve-DetectionRules.ps1 → detection rule objects                  │
│     ✓ Publish-Win32App.ps1 → app created in Intune                         │
│     ✓ Write out/app.env  (APP_ID=<guid>)                                   │
└──────────────────────────────── dotenv injection ───────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE: assign  (▶ MANUAL — operator triggers in GitLab UI)                 │
│   windows_assign_intune                                                     │
│     ✓ Set-Win32Assignments.ps1 → AAD groups assigned                       │
│     ✓ Set-Win32Supersedence.ps1 (optional, if supersedence.json exists)    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### macOS Pipeline (2 stages)

Triggered by a version tag (`v4.38.125-1`):

``` text
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE: build  (automatic)                                                   │
│   macos_build                                                               │
│     ✓ Validate app.json + macos/package.yaml                               │
│     ✓ Download macos-packaging-framework bundle                             │
│     ✓ Run build-pkg.sh → produces .pkg in out/                             │
│     ✓ Write out/build.env  (PKG_PATH, PKG_FILENAME …)                     │
└──────────────────────────────── dotenv injection ───────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE: deploy  (automatic)                                                  │
│   macos_deploy_jamf                                                         │
│     ✓ Clone terraform-jamf-modules                                         │
│     ✓ Generate Terraform root config from jamf/*.json                      │
│     ✓ terraform init → plan → apply                                        │
│     ✓ Package uploaded + policy created in Jamf Pro                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Dual-platform — both flows run in parallel within the same pipeline

---

## 6. Full Call Tree

### Stage: `windows_build`

``` text
windows_build  (shell: pwsh, runner tag: [Windows])
│
├─ [1] Read & validate app.json
│       Required fields: title, publisher, package_id, version, platforms
│       If lifecycle == 'retired' → exit 0 silently
│
├─ [2] Validate windows/package.yaml
│       Required fields: version, packaging_version, installer_type,
│                        install_command, uninstall_command, detection
│
├─ [3] Download + cache PSADT framework zip
│       GET /api/v4/projects/{PSADT_PROJECT_ID}/packages/generic/
│           psadt-enterprise/4.1.0/psadt-enterprise-4.1.0.zip
│
├─ [4] Build staging area ($env:TEMP\psadt_build_<guid>\)
│       Copy framework       → staging\
│       Overlay src/Deploy-Application.ps1
│       Copy src/Files/*     → staging\Files\
│       Copy src/Assets/*    → staging\Assets\
│
├─ [5] Run IntuneWinAppUtil.exe → out/<id>_<ver>_<pkg>.intunewin
│
└─ [6] Write out/build.env (dotenv artifact)
```

### Stage: `windows_publish_intune`

``` text
windows_publish_intune  (shell: pwsh, runner tag: [Windows])
│
├─ [A] Download intune-deployment-modules
├─ [B] Resolve-DetectionRules.ps1 → detection rule objects
├─ [C] Resolve-Requirements.ps1  → requirement rule objects
└─ [D] Publish-Win32App.ps1
        ├─ Get-GraphToken → Bearer token
        ├─ POST /mobileApps → app created in Intune
        └─ Write out/app.env: APP_ID=<guid>
```

### Stage: `windows_assign_intune`

``` text
windows_assign_intune  (shell: pwsh, runner tag: [Windows], MANUAL)
│
├─ [A] Set-Win32Assignments.ps1 → POST /mobileApps/{APP_ID}/assign
└─ [B] Set-Win32Supersedence.ps1 (optional)
```

### Stage: `macos_build`

``` text
macos_build  (shell: bash, runner tag: [macOS])
│
├─ [1] Validate app.json + macos/package.yaml
├─ [2] Download macos-packaging-framework bundle (tar.gz)
├─ [3] Run helpers/validate-inputs.sh
└─ [4] Run build-pkg.sh → out/<name>.pkg + out/build.env
```

### Stage: `macos_deploy_jamf`

``` text
macos_deploy_jamf  (Terraform container, runner tag: [macOS])
│
├─ [A] Clone terraform-jamf-modules
├─ [B] Read macos/jamf/*.json → generate main.tf + variables.tf
├─ [C] terraform init (GitLab HTTP backend for state)
├─ [D] terraform plan
└─ [E] terraform apply → category + package + policy created in Jamf
```

---

## 7. Data Flow Between Jobs

### Windows data flow (dotenv artifacts)

``` text  
windows_build
  writes ──► out/build.env
             ├── INTUNEWIN_PATH=out/7-zip_26.00_1.intunewin
             ├── VENDOR_VERSION=26.00
             ├── PACKAGE_ID=7-zip
             └── …
                    │  GitLab dotenv injection
                    ▼
windows_publish_intune
  reads  ──► $env:INTUNEWIN_PATH
  writes ──► out/app.env
             └── APP_ID=<intune-app-guid>
                    │  GitLab dotenv injection
                    ▼
windows_assign_intune
  reads  ──► $env:APP_ID
```

### macOS data flow (dotenv artifacts)

``` text
macos_build
  writes ──► out/build.env
             ├── PKG_PATH=out/Slack-4.38.125.pkg
             ├── PKG_FILENAME=Slack-4.38.125.pkg
             └── PKG_SHA256=<sha256>
                    │  GitLab dotenv injection
                    ▼
macos_deploy_jamf
  reads  ──► $PKG_PATH
             Used in terraform.tfvars as pkg_path
```

---

## 8. Triggering the Pipeline

### Test run (no tag required)

Push to `main`:

``` bash
git add -A
git commit -m "feat: add 7-Zip 26.00"
git push origin main
```

All stages will appear in the GitLab pipeline. `assign` (Windows) requires a manual click.

### Production release (tagged)

```bash
git tag v26.00-1
git push origin v26.00-1
```

### Trigger by stage

| Stage | Platform | Trigger | Who |
|---|---|---|---|
| `build` | Both | Automatic on push/tag | CI |
| `publish` | Windows | Automatic after build | CI |
| `assign` | Windows | **Manual** — click ▶ in GitLab | Engineer |
| `deploy` | macOS | Automatic after build | CI |

---

## 9. Troubleshooting

### Windows Errors

| Error | Cause | Fix |
|---|---|---|
| `app.json: missing required field 'X'` | Field absent in app.json | Add the missing field |
| `windows/package.yaml: missing required field 'X'` | Field absent in package.yaml | Add the field at top level (not nested) |
| `WINDOWS_INSTALLER_SOURCE set but file not found` | Installer not pre-staged on runner | Copy installer to the path in the CI variable |
| `No .intunewin file produced` | IntuneWinAppUtil failed | Check staging area; verify .exe or .ps1 entry point exists |
| `INTUNEWIN_PATH not set` | `build.env` not injected | Ensure `windows_build` succeeded |
| `IntuneWin file not found` | Path mismatch | Verify `out/build.env` path matches actual file location |
| `Token acquisition failed` | Wrong tenant/client/secret | Verify CI vars at group level |
| `APP_ID not set` | Publish failed | Check `out/publish-logs/publish.log` |
| `ModelValidationFailure: 'greaterThanOrEqual' was not found` | Wrong Graph API field | Update `Resolve-DetectionRules.ps1` — `detectionType` must be `version`, not the operator |
| `out/app.env: no matching files` | Publish failed before writing env | Non-fatal warning; check publish logs |

### macOS Errors

| Error | Cause | Fix |
|---|---|---|
| `macos/package.yaml not found` | Missing file | Run `New-Title.ps1` with `-Platform macos` or both |
| `Framework bundle download failed` | Wrong `MACOS_FRAMEWORK_PROJECT_ID` | Verify project ID at group level |
| `validate-inputs.sh failed` | Missing required fields | Check `macos/package.yaml` has all required fields |
| `build-pkg.sh failed` | Installer binary missing | Drop `.pkg` into `macos/src/Files/` |
| `Terraform init failed` | State backend misconfigured | Verify `CI_JOB_TOKEN` has API access |
| `jamfpro provider auth failed` | Wrong Jamf credentials | Verify `JAMF_URL`, `JAMF_CLIENT_ID`, `JAMF_CLIENT_SECRET` |
| `category module failed` | Category doesn't exist in Jamf | Create the category in Jamf Pro first, or let Terraform create it |
| `scope_groups invalid` | Wrong smart group IDs | Get IDs from Jamf Pro → Smart Computer Groups |
