# intune-deployment-modules

Reusable PowerShell scripts for Intune Win32 app publishing, updating, and assignment via Microsoft Graph API.

## Scripts

| Script | Purpose |
|--------|---------|
| `IntuneDeployment.psm1` | Shared module: Graph auth, HTTP client, logging, naming, hashing |
| `Publish-Win32App.ps1` | Create or update a Win32LobApp + upload .intunewin via Graph |
| `Update-Win32App.ps1` | Delegate wrapper for Publish-Win32App.ps1 (upsert semantics) |
| `Resolve-DetectionRules.ps1` | Build Graph detection rule objects from `windows/package.yaml` |
| `Resolve-Requirements.ps1` | Build Graph requirement rule objects from `windows/intune/requirements.json` |
| `Set-Win32Assignments.ps1` | Assign the app to AAD groups from `windows/intune/assignments.json` |
| `Set-Win32Supersedence.ps1` | Set supersedence relationships from `windows/intune/supersedence.json` |

## Required Graph API Permissions

App registration needs the following **application permissions** (admin consent required):

- `DeviceManagementApps.ReadWrite.All`

## How Detection Rules Work

1. `windows/package.yaml` specifies `detection_mode` (e.g. `registry-marker`)
2. `Resolve-DetectionRules.ps1` converts that to a Graph-compatible detection rule array
3. `Publish-Win32App.ps1` attaches the array to the Win32LobApp POST/PATCH body

### Detection Modes

| Mode | YAML fields needed | Graph type |
|------|--------------------|------------|
| `registry-marker` | `detection.registry.{key_path, value_name, operator}` | `win32LobAppRegistryDetection` |
| `file` | `detection.file.{path, file_or_folder, operator}` | `win32LobAppFileSystemDetection` |
| `msi-product-code` | `detection.msi.{product_code, version}` | `win32LobAppProductCodeDetection` |
| `script` | `windows/detection/detect.ps1` | `win32LobAppPowerShellScriptDetection` |

## Content Upload Flow

`Publish-Win32App.ps1` implements the full Graph .intunewin upload:

1. POST `mobileApps` → create app record  
2. POST `contentVersions` → create content version  
3. POST `contentVersions/{id}/files` → create file entry → receive SAS URI  
4. PUT blocks to Azure Blob (`comp=block`) in 6 MB chunks  
5. PUT block list (`comp=blocklist`)  
6. POST `files/{id}/commit` with encryption metadata from `.intunewin` Detection.xml  
7. PATCH `mobileApps/{id}` → set `committedContentVersion`

## CI Usage

The `windows-deploy-intune.yml` template in `gitlab-ci-templates` downloads these scripts at runtime using the `GITLAB_READ_TOKEN` variable and calls them in sequence.
