# tools/ — Pinned Windows Build Utilities

This directory contains pinned binary/script tools that are bundled with the
`psadt-enterprise` framework to avoid downloading them at runtime.

## Contents

| File | Version | Source | Purpose |
|------|---------|--------|---------|
| `IntuneWinAppUtil.exe` | 1.8.4 | [Microsoft/Microsoft-Win32-Content-Prep-Tool](https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool) | Packages installer + PSADT into `.intunewin` format |
| `Get-MsiMetadata.ps1` | — | SPA internal | Reads ProductCode, ProductVersion, and ProductName from an MSI using Windows Installer COM |

## Upgrading IntuneWinAppUtil.exe

Download the latest release from GitHub and replace the binary:

```powershell
Invoke-WebRequest `
  -Uri "https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool/raw/master/IntuneWinAppUtil.exe" `
  -OutFile tools/IntuneWinAppUtil.exe
```

Then commit and push — the updated tool will be included in the next framework bundle release.
