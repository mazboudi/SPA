# tools/ — Pinned Windows Build Utilities

This directory contains pinned binary/script tools that are bundled with the
`psadt-enterprise` framework to avoid downloading them at runtime.

## Contents

| File | Version | Source | Purpose |
|------|---------|--------|---------|
| `IntuneWinAppUtil.exe` | 1.8.4 | [Microsoft/Microsoft-Win32-Content-Prep-Tool](https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool) | Packages installer + PSADT into `.intunewin` format |
| `Get-MsiMetadata.ps1` | — | SPA internal | Reads ProductCode, ProductVersion, and ProductName from an MSI using Windows Installer COM |
| `ServiceUI.exe` | MDT-versioned | [Microsoft Deployment Toolkit](https://www.microsoft.com/en-us/download/details.aspx?id=54259) | Projects PSADT UI dialogs into the active user session during SYSTEM-context Intune deployments. Required when `use_service_ui: true` is set in `windows/package.yaml`. |

## Upgrading IntuneWinAppUtil.exe

Download the latest release from GitHub and replace the binary:

```powershell
Invoke-WebRequest `
  -Uri "https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool/raw/master/IntuneWinAppUtil.exe" `
  -OutFile tools/IntuneWinAppUtil.exe
```

Then commit and push — the updated tool will be included in the next framework bundle release.

## Adding ServiceUI.exe

`ServiceUI.exe` is shipped as part of the Microsoft Deployment Toolkit (MDT).
Copy it from an MDT installation:

```powershell
# Default MDT install location (x64 build — use this one for Intune)
Copy-Item `
  "C:\Program Files\Microsoft Deployment Toolkit\Templates\Distribution\Tools\x64\ServiceUI.exe" `
  tools\ServiceUI.exe
```

Also copy it to `_template-psadt-win32/tools/ServiceUI.exe` so the build pipeline
can stage it alongside `Invoke-AppDeployToolkit.exe` for packages that require it.
