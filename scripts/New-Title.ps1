<#
.SYNOPSIS
  Scaffolds a new software title directory under titles/<package-id>.

.DESCRIPTION
  Creates all required files and folders for a Windows-only, macOS-only,
  or dual-platform title. All fields are pre-populated with sensible
  defaults and clearly marked TODOs so nothing gets missed.

.PARAMETER PackageId
  Kebab-case identifier, e.g. "7-zip" or "microsoft-teams".

.PARAMETER DisplayName
  Human-readable application name, e.g. "7-Zip".

.PARAMETER Publisher
  Vendor/publisher name, e.g. "Igor Pavlov".

.PARAMETER Version
  Vendor version string, e.g. "24.08".

.PARAMETER Platform
  "windows", "macos", or "both" (default: "windows").

.PARAMETER InstallerType
  "msi" or "exe" (default: "msi"). Affects generated command lines.

.PARAMETER DetectionMode
  "msi-product-code", "registry-marker", or "file" (default: "msi-product-code").

.PARAMETER OutDir
  Root titles directory. Defaults to "titles" relative to CWD.

.EXAMPLE
  # Windows MSI title with MSI product code detection
  .\scripts\New-Title.ps1 -PackageId "7-zip" -DisplayName "7-Zip" `
    -Publisher "Igor Pavlov" -Version "24.08" `
    -InstallerType msi -DetectionMode msi-product-code

.EXAMPLE
  # Dual-platform EXE title with registry detection
  .\scripts\New-Title.ps1 -PackageId "notepad-plus-plus" -DisplayName "Notepad++" `
    -Publisher "Notepad++ Team" -Version "8.7" `
    -Platform both -InstallerType exe -DetectionMode registry-marker
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $PackageId,
    [Parameter(Mandatory)] [string] $DisplayName,
    [Parameter(Mandatory)] [string] $Publisher,
    [Parameter(Mandatory)] [string] $Version,
    [ValidateSet('windows','macos','both')]
    [string] $Platform = 'windows',
    [ValidateSet('msi','exe')]
    [string] $InstallerType = 'msi',
    [ValidateSet('msi-product-code','registry-marker','file')]
    [string] $DetectionMode = 'msi-product-code',
    [string] $OutDir = 'titles'
)

$ErrorActionPreference = 'Stop'

$titleDir    = Join-Path $OutDir $PackageId
$winEnabled  = ($Platform -in @('windows','both')).ToString().ToLower()
$macEnabled  = ($Platform -in @('macos','both')).ToString().ToLower()

if (Test-Path $titleDir) {
    throw "Title directory already exists: $titleDir. Delete it first or use a different PackageId."
}

function Mkd([string] $path) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
}
function Write([string] $path, [string] $content) {
    $dir = Split-Path $path -Parent
    if (!(Test-Path $dir)) { Mkd $dir }
    Set-Content -Path $path -Value $content -Encoding UTF8
}

Write-Host "Scaffolding title: $PackageId ($Platform)" -ForegroundColor Cyan
Write-Host "Output: $titleDir"

# ── app.json ────────────────────────────────────────────────────────────────
Write (Join-Path $titleDir 'app.json') @"
{
  "title": "$DisplayName",
  "publisher": "$Publisher",
  "package_id": "$PackageId",
  "version": "$Version",
  "owners": {
    "team": "euc-packaging",
    "contact_email": "euc-packaging@yourorg.com"
  },
  "lifecycle": "active",
  "platforms": {
    "windows": {
      "enabled": $winEnabled,
      "framework": "psadt-enterprise",
      "framework_version": "4.1.0"
    },
    "macos": {
      "enabled": $macEnabled,
      "framework": "macos-packaging-framework",
      "framework_version": "1.0.0"
    }
  },
  "deployment": {
    "windows": "intune",
    "macos": "jamf"
  }
}
"@

# ── .gitlab-ci.yml ───────────────────────────────────────────────────────────
Write (Join-Path $titleDir '.gitlab-ci.yml') @"
include:
  - project: 'yourgroup/gitlab-ci-templates'  # TODO: set your real GitLab group path
    ref: 'v1.0.0'                              # TODO: pin to desired template release
    file:
      - 'templates/metadata-validate.yml'
      - 'templates/windows-build.yml'
      - 'templates/windows-deploy-intune.yml'
      - 'templates/macos-build.yml'
      - 'templates/macos-deploy-jamf.yml'

variables:
  WINDOWS_ENABLED: "$winEnabled"
  MACOS_ENABLED:   "$macEnabled"
  PSADT_FRAMEWORK_VERSION: "4.1.0"
  MACOS_FRAMEWORK_VERSION: "1.0.0"
"@

# ── .gitignore ───────────────────────────────────────────────────────────────
Write (Join-Path $titleDir '.gitignore') @"
dist/
out/
*.intunewin
*.pkg
*.tar.gz
*.zip
psadt-framework-*/
macos-framework-*/
tools/
intune-modules/
terraform-jamf-modules/
tf-deploy/
.DS_Store
.vscode/
"@

if ($Platform -in @('windows','both')) {

    $installCmd   = if ($InstallerType -eq 'msi') { 'msiexec.exe /i "Files\TODO_INSTALLER.msi" /qn /norestart' } else { '"Files\TODO_INSTALLER.exe" /S' }
    $uninstallCmd = if ($InstallerType -eq 'msi') { 'msiexec.exe /x "{TODO-PRODUCT-CODE-GUID}" /qn /norestart' } else { '"C:\Program Files\TODO\uninstall.exe" /S' }

    $detectionBlock = switch ($DetectionMode) {
        'msi-product-code' { @"
detection_mode: msi-product-code
detection:
  msi:
    product_code: "{TODO-PRODUCT-CODE-GUID}"   # replace with real MSI ProductCode
    version_operator: greaterThanOrEqual
    version: "$Version"
"@ }
        'registry-marker' { @"
detection_mode: registry-marker
detection:
  registry:
    hive: HKLM
    key_path: "SOFTWARE\\YourOrg\\InstalledApps\\$PackageId"
    value_name: Version
    operator: greaterThanOrEqual
    value: "$Version"
"@ }
        'file' { @"
detection_mode: file
detection:
  file:
    path: "C:\\Program Files\\TODO"
    file_or_folder: "TODO.exe"
    operator: versionGreaterThanOrEqual
    version: "$Version"
"@ }
    }

    # windows/package.yaml
    Write (Join-Path $titleDir 'windows\package.yaml') @"
# $DisplayName $Version — Windows package definition
package_id: $PackageId
display_name: "$DisplayName"
version: "$Version"
packaging_version: "1"
installer_type: $InstallerType

install:
  command_line: '$installCmd'
  return_codes:
    success: [0, 3010]
    soft_reboot: [3010]

uninstall:
  command_line: '$uninstallCmd'
  return_codes:
    success: [0]

$detectionBlock

intune:
  display_name: "$DisplayName"
  description: "TODO: Add description"
  restart_behavior: basedOnReturnCode    # suppress|allow|force|basedOnReturnCode
  install_experience: system             # system|user
  max_run_time_in_minutes: 60
  allowed_to_reinstall: true
  uninstall_previous_version_of_app: true
"@

    # windows/intune/app.json
    Write (Join-Path $titleDir 'windows\intune\app.json') @"
{
  "displayName": "$DisplayName",
  "description": "TODO: Add application description.",
  "publisher": "$Publisher",
  "appVersion": "$Version",
  "informationUrl": "https://TODO-vendor-url",
  "isFeatured": false,
  "privacyInformationUrl": "",
  "notes": "Managed by SPA pipeline.",
  "owner": "EUC Packaging",
  "installCommandLine": "$installCmd",
  "uninstallCommandLine": "$uninstallCmd",
  "applicableArchitectures": "x64",
  "minimumSupportedWindowsRelease": "1903",
  "displayVersion": "$Version",
  "allowAvailableUninstall": true
}
"@

    # windows/intune/assignments.json
    Write (Join-Path $titleDir 'windows\intune\assignments.json') @"
[
  {
    "intent": "required",
    "groupId": "TODO-AAD-GROUP-OBJECT-ID",
    "filterMode": "none"
  },
  {
    "intent": "available",
    "groupId": "TODO-AAD-SELFSERVICE-GROUP-OBJECT-ID",
    "filterMode": "none"
  }
]
"@

    # windows/intune/requirements.json
    Write (Join-Path $titleDir 'windows\intune\requirements.json') @"
{
  "minimumOs": "1903",
  "architecture": "x64",
  "minimumFreeDiskSpaceInMB": 500,
  "minimumMemoryInMB": 2048
}
"@

    # windows/src/Deploy-Application.ps1
    Mkd (Join-Path $titleDir 'windows\src\Files')
    Write (Join-Path $titleDir 'windows\src\Deploy-Application.ps1') @"
<#
.SYNOPSIS
  $DisplayName — PSADT Deploy-Application.ps1 overlay.
  Inherits all defaults from the psadt-enterprise framework template.
  Only add app-specific logic here; the framework handles logging, restart
  prompts, and exit code handling.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = `$false)] [ValidateSet('Install','Uninstall','Repair')]
    [string] `$DeploymentType = 'Install',
    [Parameter(Mandatory = `$false)] [ValidateSet('Interactive','Silent','NonInteractive')]
    [string] `$DeployMode = 'Interactive',
    [Parameter(Mandatory = `$false)] [switch] `$AllowRebootPassThru,
    [Parameter(Mandatory = `$false)] [switch] `$TerminalServerMode,
    [Parameter(Mandatory = `$false)] [switch] `$DisableLogging
)

# Load the PSADT framework
. "`$PSScriptRoot\AppDeployToolkit\AppDeployToolkitMain.ps1"

Switch (`$DeploymentType) {

    'Install' {
        ## TODO: Add any pre-install steps here (e.g. close running processes)
        # Show-InstallationWelcome -CloseApps 'processname' -AllowDefer -DeferTimes 3

        ## Install the application
        If (`$InstallerType -eq 'msi') {
            Execute-MSI -Action Install -Path "Files\TODO_INSTALLER.msi"
        } Else {
            Execute-Process -Path "Files\TODO_INSTALLER.exe" -Parameters '/S'
        }

        ## Write registry detection marker (if using registry-marker detection mode)
        # Invoke-RegistryDetection -Action Write -PackageId '$PackageId' -Version '$Version'

        ## TODO: Add any post-install steps here
    }

    'Uninstall' {
        ## TODO: Close processes if needed
        # Show-InstallationWelcome -CloseApps 'processname' -Silent

        ## Uninstall the application
        If (`$InstallerType -eq 'msi') {
            Execute-MSI -Action Uninstall -Path '{TODO-PRODUCT-CODE-GUID}'
        } Else {
            Execute-Process -Path "`$envProgramFiles\TODO\uninstall.exe" -Parameters '/S'
        }

        ## Remove registry detection marker (if using registry-marker detection mode)
        # Invoke-RegistryDetection -Action Remove -PackageId '$PackageId'
    }

    'Repair' {
        ## TODO: Add repair logic if needed
        Execute-MSI -Action Repair -Path "Files\TODO_INSTALLER.msi"
    }
}
"@

    # windows/src/Files placeholder
    Write (Join-Path $titleDir 'windows\src\Files\.gitkeep') '# Drop installer binaries here. Do NOT commit binaries to git.'
}

Write-Host ""
Write-Host "✅ Title scaffolded: $titleDir" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Search 'TODO' in $titleDir and fill in all placeholders"
Write-Host "  2. Drop installer binary into windows\src\Files\ (not committed)"
$msiHint = if ($InstallerType -eq 'msi') { "     Run: pwsh frameworks\psadt-enterprise\tools\Get-MsiMetadata.ps1 -MsiPath windows\src\Files\<installer.msi>" } else { "" }
if ($msiHint) { Write-Host $msiHint }
Write-Host "  3. Update assignments.json with real AAD group object IDs"
Write-Host "  4. Update .gitlab-ci.yml with your real GitLab group path"
Write-Host "  5. git init, commit, push, then: git tag v$Version-1 && git push --tags"
