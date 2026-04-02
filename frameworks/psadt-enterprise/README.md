# psadt-enterprise

Versioned enterprise overlay for [PSAppDeployToolkit (PSADT) 4.x](https://psappdeploytoolkit.com/).

This repo packages the PSADT runtime together with org-wide defaults and helpers into a single `.zip` bundle. Every Windows title pipeline downloads this bundle at build time and uses it as the staging base before overlaying the title's own `Deploy-Application.ps1` and installer files.

---

## How It Works

### 1 — Repo Structure

```
psadt-enterprise/
├── versions/
│   └── 4.1.0/                         ← Versioned bundle content
│       ├── PSAppDeployToolkit/         ← Full PSADT 4.1.0 runtime
│       ├── Invoke-AppDeployToolkit.exe ← PSADT 4.x launcher
│       ├── Invoke-AppDeployToolkit.ps1
│       ├── Deploy-Application.ps1     ← Enterprise base template
│       ├── Config/config.psd1         ← Org-wide config defaults
│       ├── Strings/strings.psd1       ← Custom strings / branding
│       ├── helpers/                   ← Org helpers (Invoke-RegistryDetection, etc.)
│       └── manifest.json             ← Version metadata
│
├── tools/                             ← Pre-installed on runner at C:\tools
│   ├── IntuneWinAppUtil.exe           ← Microsoft Win32 Content Prep Tool
│   └── Get-MsiMetadata.ps1           ← Extracts MSI ProductCode for titles
│
└── scripts/
    ├── build-framework-bundle.ps1    ← Creates dist/psadt-enterprise-<ver>.zip
    └── New-FrameworkRelease.ps1      ← Uploads zip + creates GitLab Release
```

### 2 — CI Pipeline (triggered by `vX.Y.Z` tag)

```
git tag v4.1.0 && git push origin v4.1.0
        │
        ▼
[test]    Syntax-check all .ps1 files in versions/4.1.0/
        │
        ▼
[build]   build-framework-bundle.ps1
          → zips versions/4.1.0/* → dist/psadt-enterprise-4.1.0.zip
          → computes SHA-256 → dist/checksums.json
        │
        ▼
[publish] New-FrameworkRelease.ps1
          → uploads zip to GitLab Package Registry
          → creates GitLab Release entry v4.1.0
```

### 3 — How Title Pipelines Consume This Bundle

When a title's `windows_build` job runs, it:

1. Downloads `psadt-enterprise-4.1.0.zip` from the Package Registry using `PSADT_PROJECT_ID` and `GITLAB_READ_TOKEN`
2. Extracts it to a temporary staging directory
3. Overlays the title's `Deploy-Application.ps1` and `src/Files/` on top
4. Resolves `IntuneWinAppUtil.exe` — checking `C:\tools\` on the runner first, then the bundle's `tools\` directory as fallback
5. Runs `IntuneWinAppUtil.exe` on the staging directory → produces `out/*.intunewin`
6. Passes the `.intunewin` to the deploy job via GitLab artifact dotenv

---

## Required Runner Setup

The Windows runner (`tags: [Windows]`) must have the following pre-installed:

| Tool | Path | Notes |
|------|------|-------|
| `IntuneWinAppUtil.exe` | `C:\tools\IntuneWinAppUtil.exe` | [Download from Microsoft](https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool) |
| PowerShell 7.4+ | System PATH | `winget install Microsoft.PowerShell` |
| .NET Framework 4.8 | System | Required by PSADT runtime |

> **VMSS:** Bake `C:\tools` into the VMSS base image. Everything else works identically.

---

## Required CI Variables

Set at `euc/software-package-automation` group level:

| Variable | Scope | Notes |
|----------|-------|-------|
| `GITLAB_RELEASE_TOKEN` | Protected + Masked | API-scoped token; used by `New-FrameworkRelease.ps1` to upload the bundle and create the release. `CI_JOB_TOKEN` is not sufficient for release creation. |
| `GITLAB_READ_TOKEN` | Protected + Masked | Used by title pipelines to download the bundle from this repo's Package Registry. |

---

## Publishing a New Version

### Branching / tagging convention

| Tag | Meaning |
|-----|---------|
| `v4.1.0` | PSADT upstream version 4.1.0, initial enterprise build |
| `v4.1.1` | Patch to the enterprise overlay (org config, helpers) — no upstream change |
| `v4.2.0` | Upgrade to PSADT upstream 4.2.0 |

### Steps

```powershell
# 1. Create the new version directory
cp -r versions\4.1.0 versions\4.2.0

# 2. Drop in the new PSADT runtime
# Copy the contents of the upstream PSADT 4.2.0 release into:
#   versions\4.2.0\PSAppDeployToolkit\

# 3. Update manifest.json
#    Set "framework_version" and "upstream_psadt_version" to "4.2.0"

# 4. Commit and tag
git add -A
git commit -m "feat: add PSADT 4.2.0"
git tag v4.2.0
git push origin main
git push origin v4.2.0
```

The CI pipeline will run automatically. Once `publish` completes, opt titles in by updating their `.gitlab-ci.yml`:

```yaml
variables:
  PSADT_FRAMEWORK_VERSION: "4.2.0"   # ← bump this
```

---

## Local Development

### Build the bundle locally (Windows)

```powershell
cd frameworks\psadt-enterprise
pwsh -File scripts\build-framework-bundle.ps1 -Version 4.1.0
# Output: dist\psadt-enterprise-4.1.0.zip
```

### Get MSI ProductCode for a title

```powershell
pwsh -File tools\Get-MsiMetadata.ps1 -MsiPath "C:\path\to\installer.msi"
```

---

## See Also

- [`frameworks/gitlab-ci-templates/templates/windows-build.yml`](../gitlab-ci-templates/templates/windows-build.yml) — how the bundle is downloaded and used
- [`docs/integration-guide.md`](../../docs/integration-guide.md) — full platform setup guide
