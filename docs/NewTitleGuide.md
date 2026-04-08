# New Title Guide — SPA Platform

> **Audience:** Engineers onboarding a new Windows application into the Software Package Automation (SPA) platform.  
> This guide covers everything from scaffolding to a live Intune assignment.

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
| Runner VM | Windows runner tagged `[Windows]` with `IntuneWinAppUtil.exe` at `C:\tools\` or bundled in the PSADT framework zip |
| CI Variables | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `GITLAB_READ_TOKEN`, `PSADT_PROJECT_ID`, `INTUNE_MODULES_PROJECT_ID` — set at the GitLab group level |

---

## 2. Scaffold the Title

Run from the **SPA workspace root:**

```powershell
pwsh -File scripts\New-Title.ps1 `
     -PackageId       "7-zip" `
     -DisplayName     "7-Zip" `
     -Publisher       "Igor Pavlov" `
     -Version         "26.00" `
     -Category        developer-tools `
     -InstallerType   msi `
     -DetectionMode   msi-product-code
```

**`-Category`** must be one of:  
`browsers` | `productivity` | `developer-tools` | `security` | `communication` | `utilities` | `endpoint-management` | `custom`

**`-DetectionMode`** options:  
`msi-product-code` | `registry-marker` | `file`

This generates the following structure under `titles/7-zip/`:

```
titles/7-zip/
├── app.json                          ← title identity & platform enablement
├── .gitlab-ci.yml                    ← pipeline config (includes shared templates)
├── .gitignore
└── windows/
    ├── package.yaml                  ← build + deploy metadata
    ├── src/
    │   ├── Deploy-Application.ps1   ← PSADT install/uninstall overlay
    │   └── Files/
    │       └── .gitkeep             ← drop installer binary here (not committed)
    └── intune/
        ├── app.json                 ← Intune display metadata
        ├── assignments.json         ← AAD group assignments
        └── requirements.json        ← hardware/OS minimum requirements
```

---

## 3. Fill In the TODOs

Search for `TODO` in all generated files. Required replacements:

### `windows/package.yaml`

```yaml
# 7-Zip 26.00 — Windows package definition
package_id: 7-zip
display_name: "7-Zip 26.00"
version: "26.00"
packaging_version: "1"
installer_type: msi

install_command: 'msiexec.exe /i "Files\7z2600-x64.msi" /qn /norestart'
uninstall_command: 'msiexec.exe /x "{23170F69-40C1-2702-2408-000001000000}" /qn /norestart'

detection_mode: msi-product-code
detection:
  msi:
    product_code: "{23170F69-40C1-2702-2408-000001000000}"   # ← from Get-MsiMetadata.ps1
    version_operator: greaterThanOrEqual
    version: "26.00"
```

> **Get the MSI ProductCode:**
> ```powershell
> pwsh -File frameworks\psadt-enterprise\tools\Get-MsiMetadata.ps1 `
>      -MsiPath titles\7-zip\windows\src\Files\7z2600-x64.msi
> ```

### `windows/intune/app.json`

```json
{
  "displayName": "7-Zip 26.00",
  "description": "Open-source file archiver with high compression ratio.",
  "publisher": "Igor Pavlov",
  "installContext": "system",
  "restartBehavior": "suppress"
}
```

### `windows/intune/assignments.json`

```json
[
  {
    "intent": "required",
    "groupId": "<AAD-Object-ID-of-required-group>",
    "filterMode": "none"
  },
  {
    "intent": "available",
    "groupId": "<AAD-Object-ID-of-selfservice-group>",
    "filterMode": "none"
  }
]
```

> Get group Object IDs from **Entra ID → Groups** in the Azure portal.

### Installer binary

Either:
- Drop `7z2600-x64.msi` into `windows/src/Files/` *(do NOT commit — it's in `.gitignore`)*
- **Or** set the CI variable `WINDOWS_INSTALLER_SOURCE = C:\files\7-zip\7z2600-x64.msi` at the GitLab project level (pre-staged on the runner VM)

---

## 4. Key File Reference

| File | Owner Repo | Purpose |
|---|---|---|
| `app.json` | `software-titles/7-zip` | Title identity, platform flags, lifecycle |
| `windows/package.yaml` | `software-titles/7-zip` | Build metadata + install/uninstall/detection commands |
| `windows/src/Deploy-Application.ps1` | `software-titles/7-zip` | PSADT install logic (title-specific) |
| `windows/intune/app.json` | `software-titles/7-zip` | Intune display metadata (name, description, publisher) |
| `windows/intune/assignments.json` | `software-titles/7-zip` | AAD group assignments |
| `windows/intune/requirements.json` | `software-titles/7-zip` | Hardware/OS minimum requirements |
| `.gitlab-ci.yml` | `software-titles/7-zip` | Includes templates, declares stages & variables |
| `templates/windows-build.yml` | `gitlab-ci-templates` | Build job definition |
| `templates/windows-deploy-intune.yml` | `gitlab-ci-templates` | Publish + assign job definitions |
| `scripts/IntuneDeployment.psm1` | `intune-deployment-modules` | Shared module: YAML parser, Graph auth, HTTP client |
| `scripts/Publish-Win32App.ps1` | `intune-deployment-modules` | Creates Win32 app in Intune via Graph API |
| `scripts/Resolve-DetectionRules.ps1` | `intune-deployment-modules` | Translates `package.yaml` → Graph detection objects |
| `scripts/Set-Win32Assignments.ps1` | `intune-deployment-modules` | Assigns app to AAD groups |
| `psadt-enterprise-4.1.0.zip` | `psadt-enterprise` (Package Registry) | PSADT framework bundle + `IntuneWinAppUtil.exe` |

---

## 5. Pipeline Flow

The pipeline has **3 stages**, triggered by a push to `main` or a version tag (`v26.00-1`):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE: build  (automatic)                                                   │
│   windows_build                                                             │
│     ✓ Validate app.json + windows/package.yaml                             │
│     ✓ Download & cache PSADT framework bundle                               │
│     ✓ Copy installer (from git or WINDOWS_INSTALLER_SOURCE)                │
│     ✓ Run IntuneWinAppUtil.exe → produces .intunewin                       │
│     ✓ Write out/build.env  (INTUNEWIN_PATH, VENDOR_VERSION …)              │
└──────────────────────────────── dotenv injection ───────────────────────────┘
                                        │ INTUNEWIN_PATH, VENDOR_VERSION …
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE: publish  (automatic)                                                 │
│   windows_publish_intune                                                    │
│     ✓ Download intune-deployment-modules scripts                            │
│     ✓ Resolve-DetectionRules.ps1  → detection rule objects                 │
│     ✓ Resolve-Requirements.ps1    → requirement rule objects                │
│     ✓ Publish-Win32App.ps1                                                 │
│         → OAuth2 token from Entra ID                                       │
│         → POST /mobileApps  → app created in Intune                       │
│     ✓ Write out/app.env  (APP_ID=<guid>)                                   │
└──────────────────────────────── dotenv injection ───────────────────────────┘
                                        │ APP_ID
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE: assign  (▶ MANUAL — operator triggers in GitLab UI)                 │
│   windows_assign_intune                                                     │
│     ✓ Download intune-deployment-modules scripts                            │
│     ✓ Set-Win32Assignments.ps1                                              │
│         → POST /mobileApps/{APP_ID}/assign                                 │
│         → AAD groups assigned in Intune                                    │
│     ✓ Set-Win32Supersedence.ps1  (optional, if supersedence.json exists)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Full Call Tree

### Stage: `windows_build`

```
windows_build  (shell: pwsh, runner tag: [Windows])
│
├─ [1] Read & validate app.json
│       ConvertFrom-Json
│       Required fields: title, publisher, package_id, version, platforms, deployment
│       If lifecycle == 'retired' → exit 0 silently
│
├─ [2] Validate windows/package.yaml  (regex — no YAML parser needed here)
│       Required fields: version, packaging_version, installer_type,
│                        install_command, uninstall_command, detection
│       installer_type must be: msi | exe | msix | ps1
│
├─ [3] Download + cache PSADT framework zip
│       GET /api/v4/projects/{PSADT_PROJECT_ID}/packages/generic/
│           psadt-enterprise/4.1.0/psadt-enterprise-4.1.0.zip
│       Cached on runner disk under key: psadt-framework-4.1.0
│       Expands to: psadt-framework-4.1.0/
│
├─ [4] Locate IntuneWinAppUtil.exe
│       Search order:
│         1. C:\tools\IntuneWinAppUtil.exe           ← pre-installed on runner
│         2. psadt-framework-4.1.0\tools\...         ← bundled in zip
│         3. psadt-framework-4.1.0\...               ← legacy location
│
├─ [5] Build staging area  ($env:TEMP\psadt_build_<guid>\)
│       Copy psadt-framework-4.1.0\*   → staging\
│       Overlay windows\src\Deploy-Application.ps1
│       If WINDOWS_INSTALLER_SOURCE set:
│           Copy C:\files\7-zip\7z2600-x64.msi → windows\src\Files\
│       Copy windows\src\Files\*       → staging\Files\
│       Copy windows\src\SupportFiles\ → staging\SupportFiles\
│       Copy windows\src\Assets\       → staging\Assets\
│
├─ [6] Run IntuneWinAppUtil.exe
│       IntuneWinAppUtil.exe -c <staging> -s Invoke-AppDeployToolkit.exe -o out\ -q
│       Produces: out\<random>.intunewin
│
├─ [7] Rename output deterministically
│       version from package.yaml        → 26.00
│       packaging_version from pkg.yaml  → 1
│       package_id from app.json         → 7-zip
│       Rename → out\7-zip_26.00_1.intunewin
│
├─ [8] Write out\build.env
│       INTUNEWIN_PATH=out/7-zip_26.00_1.intunewin
│       INTUNEWIN_FILENAME=7-zip_26.00_1.intunewin
│       INTUNEWIN_SHA256=<sha256>
│       PACKAGE_ID=7-zip
│       VENDOR_VERSION=26.00
│       PACKAGING_VERSION=1
│       PLATFORM=windows
│       BUILT_AT=<iso8601>
│
└─ [9] Cleanup staging temp dir
```

### Stage: `windows_publish_intune`

```
windows_publish_intune  (shell: pwsh, runner tag: [Windows])
│
├─ [A] Download intune-deployment-modules  (*download_intune_modules)
│       GET /api/v4/projects/{INTUNE_MODULES_PROJECT_ID}/repository/files/
│           scripts/<name>/raw?ref=main
│       → intune-modules/  (IntuneDeployment.psm1, Publish-Win32App.ps1,
│                            Resolve-DetectionRules.ps1, Resolve-Requirements.ps1,
│                            Set-Win32Assignments.ps1, Set-Win32Supersedence.ps1)
│
├─ [B] Check $env:INTUNEWIN_PATH  (auto-injected from build.env dotenv)
│
├─ [C] Import-Module intune-modules/IntuneDeployment.psm1
│
├─ [D] & Resolve-DetectionRules.ps1 -PackageYamlPath 'windows/package.yaml'
│       ├─ Import-PackageYaml
│       │     ConvertFrom-SimpleYaml  (pure-PS YAML parser)
│       │     Validates: version, install_command, uninstall_command
│       ├─ detection_mode = "msi-product-code"
│       └─ Returns: [{ productCode, productVersionOperator, productVersion }]
│
├─ [E] & Resolve-Requirements.ps1  (if requirements.json exists)
│       Returns: requirement rule objects
│
└─ [F] & Publish-Win32App.ps1
        ├─ Create out/ and out/publish-logs/ directories
        ├─ Import-PackageYaml 'windows/package.yaml'    → $pkg
        ├─ ConvertFrom-Json 'windows/intune/app.json'   → $intuneMeta
        ├─ Validate $IntuneWinPath exists
        ├─ Get-GraphToken
        │     POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
        │     Returns: Bearer token
        ├─ POST graph.microsoft.com/v1.0/deviceAppManagement/mobileApps
        │     Body: { displayName, installCommandLine, uninstallCommandLine,
        │             detectionRules, requirementRules, installExperience, … }
        │     Returns: { id: "<app-guid>" }
        └─ Write out/app.env: APP_ID=<app-guid>
```

### Stage: `windows_assign_intune`

```
windows_assign_intune  (shell: pwsh, runner tag: [Windows], MANUAL)
│
├─ [A] Download intune-deployment-modules  (same anchor as publish)
│
├─ [B] Check $env:APP_ID  (auto-injected from out/app.env dotenv)
│
├─ [C] & Set-Win32Assignments.ps1
│       ├─ Get-GraphToken
│       ├─ Read windows/intune/assignments.json
│       └─ POST /mobileApps/{APP_ID}/assign
│             { mobileAppAssignments: [required-group, available-group] }
│
└─ [D] & Set-Win32Supersedence.ps1  (optional)
          If windows/intune/supersedence.json exists
          Links app as superseding an older Intune app
```

---

## 7. Data Flow Between Jobs

GitLab **dotenv artifacts** pass data between stages automatically — no manual variable copying needed.

```
windows_build
  writes ──► out/build.env
             ├── INTUNEWIN_PATH=out/7-zip_26.00_1.intunewin
             ├── VENDOR_VERSION=26.00
             ├── PACKAGE_ID=7-zip
             └── …
                    │
                    │  GitLab dotenv injection
                    │  (vars available as $env:INTUNEWIN_PATH etc.)
                    ▼
windows_publish_intune
  reads  ──► $env:INTUNEWIN_PATH
  writes ──► out/app.env
             └── APP_ID=<intune-app-guid>
                    │
                    │  GitLab dotenv injection
                    │  (APP_ID available as $env:APP_ID)
                    ▼
windows_assign_intune
  reads  ──► $env:APP_ID
```

---

## 8. Triggering the Pipeline

### Test run (no tag required)
Push to `main`:
```powershell
git add -A
git commit -m "feat: add 7-Zip 26.00"
git push origin main
```
All three stages will appear in the GitLab pipeline. `assign` requires a manual click.

### Production release (tagged)
```powershell
git tag v26.00-1
git push origin v26.00-1
```
Same stages, but the tag is the canonical release marker and can be used with `INTUNE_MODULES_REF` for pinned versions.

### Trigger by stage

| Stage | Trigger | Who |
|---|---|---|
| `build` | Automatic on push | CI |
| `publish` | Automatic after build passes | CI |
| `assign` | **Manual** — click ▶ in GitLab | Engineer |

---

## 9. Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `app.json: missing required field 'X'` | Field absent in app.json | Add the missing field |
| `windows/package.yaml: missing required field 'X'` | Field absent in package.yaml | Add the field (all fields must be at the **top level** — do not nest `install_command` under `install:`) |
| `WINDOWS_INSTALLER_SOURCE set but file not found` | Installer not pre-staged on runner | Copy installer to the path specified in the CI variable |
| `No .intunewin file produced` | IntuneWinAppUtil failed silently | Check staging area; verify `Invoke-AppDeployToolkit.exe` or `Deploy-Application.ps1` is present |
| `INTUNEWIN_PATH not set` | `build.env` dotenv not injected | Ensure `windows_build` succeeded and `needs: windows_build` + `artifacts: true` is set in the publish job |
| `package.yaml missing required field: version` | `version` absent or misspelled | Check field is `version:` at column 0 (not indented, not `vendor_version`) |
| `IntuneWin file not found` | `INTUNEWIN_PATH` points to wrong location | Verify the path in `out/build.env` matches where the file actually lands |
| `Token acquisition failed` | Wrong tenant/client/secret CI vars | Verify `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` at the GitLab group level |
| `APP_ID not set` | Publish job failed before writing `out/app.env` | Check `out/publish-logs/publish.log` artifact from the publish job |
| `out/app.env: no matching files` (warning) | Publish job failed mid-execution | Non-fatal warning; check `out/publish-logs/publish.log` for the actual error |
