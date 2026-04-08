<#
.SYNOPSIS
  Scaffolds a new software title directory under titles/<package-id>.

.DESCRIPTION
  Creates all required files and folders for a Windows-only, macOS-only,
  or dual-platform title. All fields are pre-populated with sensible
  defaults and clearly marked TODOs so nothing gets missed.

  The generated .gitlab-ci.yml uses Category + GitLabGroup to construct
  the full GitLab subgroup project path:
    <GitLabGroup>/software-titles/<Category>/<PackageId>

.PARAMETER PackageId
  Kebab-case identifier, e.g. "7-zip" or "microsoft-teams".

.PARAMETER DisplayName
  Human-readable application name, e.g. "7-Zip".

.PARAMETER Publisher
  Vendor/publisher name, e.g. "Igor Pavlov".

.PARAMETER Version
  Vendor version string, e.g. "24.08".

.PARAMETER Category
  Subgroup category. Used to build the GitLab project path and organise
  the software-titles/ subgroup structure.
  Allowed values:
    browsers, productivity, developer-tools, security,
    communication, utilities, endpoint-management, custom

.PARAMETER Platform
  "windows", "macos", or "both" (default: "windows").

.PARAMETER InstallerType
  "msi" or "exe" (default: "msi"). Affects generated command lines.

.PARAMETER DetectionMode
  "msi-product-code", "registry-marker", or "file" (default: "msi-product-code").

.PARAMETER GitLabGroup
  Root GitLab group name, e.g. "euc/software-package-automation". Defaults to "euc/software-package-automation".

.PARAMETER OutDir
  Root titles directory. Defaults to "titles" relative to CWD.

.EXAMPLE
  # Windows MSI title in the developer-tools category
  .\scripts\New-Title.ps1 -PackageId "7-zip" -DisplayName "7-Zip" `
    -Publisher "Igor Pavlov" -Version "24.08" -Category developer-tools `
    -InstallerType msi -DetectionMode msi-product-code

.EXAMPLE
  # Dual-platform browser title
  .\scripts\New-Title.ps1 -PackageId "google-chrome" -DisplayName "Google Chrome" `
    -Publisher "Google LLC" -Version "134.0" -Category browsers `
    -Platform both -InstallerType msi -DetectionMode msi-product-code
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $PackageId,
    [Parameter(Mandatory)] [string] $DisplayName,
    [Parameter(Mandatory)] [string] $Publisher,
    [Parameter(Mandatory)] [string] $Version,
    [Parameter(Mandatory)]
    [ValidateSet('browsers','productivity','developer-tools','security',
                 'communication','utilities','endpoint-management','custom')]
    [string] $Category,
    [ValidateSet('windows','macos','both')]
    [string] $Platform = 'windows',
    [ValidateSet('msi','exe')]
    [string] $InstallerType = 'msi',
    [ValidateSet('msi-product-code','registry-marker','file')]
    [string] $DetectionMode = 'msi-product-code',
    [string] $GitLabGroup = 'euc/software-package-automation',
    [string] $OutDir = 'titles'
)

$ErrorActionPreference = 'Stop'

# Build paths
$titleDir          = Join-Path $OutDir $PackageId
$gitLabProjectPath = "$GitLabGroup/software-titles/$Category/$PackageId"
$winEnabled        = ($Platform -in @('windows','both')).ToString().ToLower()
$macEnabled        = ($Platform -in @('macos','both')).ToString().ToLower()

if (Test-Path $titleDir) {
    throw "Title directory already exists: $titleDir. Delete it first or use a different PackageId."
}

function Mkd([string] $path) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
}
function Write-File([string] $path, [string] $content) {
    $dir = Split-Path $path -Parent
    if (!(Test-Path $dir)) { Mkd $dir }
    Set-Content -Path $path -Value $content -Encoding UTF8
}

Write-Host "Scaffolding title : $PackageId" -ForegroundColor Cyan
Write-Host "Category          : $Category  ->  $gitLabProjectPath"
Write-Host "Platform          : $Platform  |  Installer: $InstallerType  |  Detection: $DetectionMode"
Write-Host ""

# ── app.json ────────────────────────────────────────────────────────────────
Write-File (Join-Path $titleDir 'app.json') @"
{
  "title": "$DisplayName",
  "publisher": "$Publisher",
  "package_id": "$PackageId",
  "version": "$Version",
  "owners": {
    "team": "software-packaging-automation",
    "contact_email": "spa-team@yourorg.com"
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
# Only include platform-relevant templates
$includeFiles = [System.Collections.Generic.List[string]]::new()
if ($Platform -in @('windows','both')) {
    $includeFiles.Add("      - 'templates/windows-build.yml'")
    $includeFiles.Add("      - 'templates/windows-deploy-intune.yml'")
}
if ($Platform -in @('macos','both')) {
    $includeFiles.Add("      - 'templates/macos-build.yml'")
    $includeFiles.Add("      - 'templates/macos-deploy-jamf.yml'")
}
$includeBlock = $includeFiles -join "`n"

Write-File (Join-Path $titleDir '.gitlab-ci.yml') @"
include:
  - project: '$GitLabGroup/spa-frameworks/gitlab-ci-templates'
    ref: 'v1.0.0'        # TODO: update to the current template release tag
    file:
$includeBlock

# Declare all stages used by the included templates.
stages:
  - build
  - publish
  - assign

variables:
  WINDOWS_ENABLED: "$winEnabled"
  MACOS_ENABLED:   "$macEnabled"
  PSADT_FRAMEWORK_VERSION: "4.1.0"
  MACOS_FRAMEWORK_VERSION: "1.0.0"
"@

# ── .gitignore ───────────────────────────────────────────────────────────────
Write-File (Join-Path $titleDir '.gitignore') @"
dist/
out/
*.intunewin
*.pkg
*.tar.gz
*.zip
spa-frameworks/psadt-enterprise-*/
spa-frameworks/macos-packaging-framework-*/
tools/
spa-deployment/intune-deployment-modules/
spa-deployment/terraform-jamf-modules/
tf-deploy/
.DS_Store
.vscode/
"@

# ── Windows files ─────────────────────────────────────────────────────────────
if ($Platform -in @('windows','both')) {

    $installCmd   = if ($InstallerType -eq 'msi') {
        'msiexec.exe /i "Files\TODO_INSTALLER.msi" /qn /norestart'
    } else {
        '"Files\TODO_INSTALLER.exe" /S'
    }
    $uninstallCmd = if ($InstallerType -eq 'msi') {
        'msiexec.exe /x "{TODO-PRODUCT-CODE-GUID}" /qn /norestart'
    } else {
        '"C:\Program Files\TODO\uninstall.exe" /S'
    }

    $detectionBlock = switch ($DetectionMode) {
        'msi-product-code' {
@"
detection_mode: msi-product-code
detection:
  product_code: "{TODO-PRODUCT-CODE-GUID}"   # get from Get-MsiMetadata.ps1
  version_operator: greaterThanOrEqual
  version: "$Version"
"@
        }
        'registry-marker' {
@"
detection_mode: registry-marker
detection:
  hive: HKLM
  key_path: "SOFTWARE\\YourOrg\\InstalledApps\\$PackageId"
  value_name: Version
  operator: greaterThanOrEqual
  value: "$Version"
"@
        }
        'file' {
@"
detection_mode: file
detection:
  path: "C:\\Program Files\\TODO"
  file_or_folder: "TODO.exe"
  operator: versionGreaterThanOrEqual
  version: "$Version"
"@
        }
    }

    Write-File (Join-Path $titleDir 'windows\package.yaml') @"
# $DisplayName $Version - Windows package definition
package_id: $PackageId
display_name: "$DisplayName"
version: "$Version"
packaging_version: "1"
installer_type: $InstallerType

install_command: '$installCmd'
uninstall_command: '$uninstallCmd'

$detectionBlock
"@

    Write-File (Join-Path $titleDir 'windows\intune\app.json') @"
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

    Write-File (Join-Path $titleDir 'windows\intune\assignments.json') @"
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

    Write-File (Join-Path $titleDir 'windows\intune\requirements.json') @"
{
  "minimumOs": "1903",
  "architecture": "x64",
  "minimumFreeDiskSpaceInMB": 500,
  "minimumMemoryInMB": 2048
}
"@

    Mkd (Join-Path $titleDir 'windows\src\Files')
    Write-File (Join-Path $titleDir 'windows\src\Deploy-Application.ps1') @"
<#
.SYNOPSIS
  $DisplayName - PSADT Deploy-Application.ps1 overlay.
  Only add app-specific logic here; the framework handles logging,
  restart prompts, and exit code handling.
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

. "`$PSScriptRoot\AppDeployToolkit\AppDeployToolkitMain.ps1"

Switch (`$DeploymentType) {

    'Install' {
        ## TODO: Close running processes before install if needed
        # Show-InstallationWelcome -CloseApps 'processname' -AllowDefer -DeferTimes 3

        ## Install
        Execute-MSI -Action Install -Path 'Files\TODO_INSTALLER.msi'

        ## TODO: Add post-install steps here
        ## (e.g. Invoke-RegistryDetection for registry-marker detection mode)
    }

    'Uninstall' {
        ## TODO: Close running processes if needed
        # Show-InstallationWelcome -CloseApps 'processname' -Silent

        Execute-MSI -Action Uninstall -Path '{TODO-PRODUCT-CODE-GUID}'
    }

    'Repair' {
        Execute-MSI -Action Repair -Path 'Files\TODO_INSTALLER.msi'
    }
}
"@

    Write-File (Join-Path $titleDir 'windows\src\Files\.gitkeep') @"
# Drop installer binary here. Do NOT commit binaries to git.
# Expected: TODO_INSTALLER.msi (or .exe)
#
# To get the MSI ProductCode, run from the SPA workspace:
#   pwsh -File frameworks\psadt-enterprise\tools\Get-MsiMetadata.ps1 ``
#        -MsiPath titles\$PackageId\windows\src\Files\<installer.msi>
"@
}

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host "Scaffolded files:" -ForegroundColor Green
Get-ChildItem -Path $titleDir -Recurse -File | ForEach-Object {
    Write-Host ("  " + $_.FullName.Replace((Resolve-Path $OutDir).Path + '\', ''))
}
Write-Host ""
Write-Host "GitLab project  : $gitLabProjectPath" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Search 'TODO' in the generated files and fill in all placeholders"
if ($InstallerType -eq 'msi') {
    Write-Host "  2. Get the MSI ProductCode:"
    Write-Host "       pwsh -File <SPA>\frameworks\psadt-enterprise\tools\Get-MsiMetadata.ps1 \"
    Write-Host "            -MsiPath windows\src\Files\<installer.msi>"
} else {
    Write-Host "  2. Drop the installer binary into windows\src\Files\ (NOT committed to git)"
}
Write-Host "  3. Replace AAD group IDs in windows\intune\assignments.json"
Write-Host "  4. Create the GitLab project under: $gitLabProjectPath"
Write-Host "     (CI/CD variables are inherited from the euc/software-package-automation/software-titles group)"
Write-Host "  5. Push and tag:"
Write-Host "       cd $titleDir"
Write-Host "       git init -b main && git add -A"
Write-Host "       git commit -m 'feat: add $DisplayName $Version'"
Write-Host "       git remote add origin https://gitlab.onefiserv.net/$gitLabProjectPath.git"
Write-Host "       git push -u origin main"
Write-Host "       git tag v$Version-1 && git push origin v$Version-1"
