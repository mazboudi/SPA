# tools/ — Pinned Windows Build Utilities

This directory is the **source reference** for build utilities used with the
`psadt-enterprise` framework.

The CI pipeline (`windows-build.yml`) expects tools to be **pre-installed on the GitLab runner**
at `C:\tools\<tool>.exe`. They are not bundled into the framework zip.

## Contents

| File | Version | Source | Purpose |
|------|---------|--------|---------|
| `IntuneWinAppUtil.exe` | 1.8.4 | [Microsoft/Microsoft-Win32-Content-Prep-Tool](https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool) | Packages installer + PSADT into `.intunewin` format |
| `Get-MsiMetadata.ps1` | — | SPA internal | Reads ProductCode, ProductVersion, and ProductName from an MSI using Windows Installer COM |
| `ServiceUI.exe` | MDT-versioned | [Microsoft Deployment Toolkit](https://www.microsoft.com/en-us/download/details.aspx?id=54259) | Projects PSADT UI dialogs into the active user session during SYSTEM-context Intune deployments. Required when `use_service_ui: true` is set in `windows/package.yaml`. |

## Runner Setup

All tools must be installed on the Windows GitLab runner at `C:\tools\`:

```powershell
# IntuneWinAppUtil.exe
Invoke-WebRequest `
  -Uri "https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool/raw/master/IntuneWinAppUtil.exe" `
  -OutFile "C:\tools\IntuneWinAppUtil.exe"

# ServiceUI.exe (from MDT — x64 build)
Copy-Item `
  "C:\Program Files\Microsoft Deployment Toolkit\Templates\Distribution\Tools\x64\ServiceUI.exe" `
  "C:\tools\ServiceUI.exe"
```

`ServiceUI.exe` is only invoked by the pipeline when a package has `use_service_ui: true`
in `windows/package.yaml`. Runners that never build such packages do not require it.
