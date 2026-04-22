<#
.SYNOPSIS
  Scaffolds a new software title directory under titles/<package-id>.

.DESCRIPTION
  Creates all required files and folders for a Windows-only, macOS-only,
  or dual-platform title. All fields are pre-populated with sensible
  Fiserv defaults and clearly marked TODOs so nothing gets missed.

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
  Windows installer type: "msi" or "exe" (default: "msi").
  Affects generated install/uninstall command lines.

.PARAMETER DetectionMode
  Windows Intune detection mode:
    "msi-product-code", "registry-marker", "file", or "script"
  (default: "msi-product-code").

.PARAMETER MacInstallerType
  macOS installer type: "pkg", "dmg", or "zip" (default: "pkg").

.PARAMETER BundleId
  macOS bundle identifier, e.g. "com.google.Chrome".
  Used for detection and Jamf scope.

.PARAMETER ReceiptId
  macOS installer receipt identifier, e.g. "com.google.chrome".
  Used for receipt-based detection. Defaults to BundleId if not specified.

.PARAMETER JamfCategory
  Jamf Pro category for the package and policy.
  If not specified, maps from Category:
    browsers → Browsers, productivity → Productivity, etc.

.PARAMETER GitLabGroup
  Root GitLab group name. Defaults to "euc/software-package-automation".

.PARAMETER OutDir
  Root titles directory. Defaults to "titles" relative to CWD.

.PARAMETER CreateGitLabProject
  When specified, automatically creates the GitLab project under the
  correct subgroup, initializes git, commits all scaffolded files,
  and pushes to origin. Requires -GitLabToken.

.PARAMETER GitLabToken
  GitLab personal access token (PAT) or project token with api scope.
  Required when -CreateGitLabProject is used.
  Can also be set via the GITLAB_TOKEN environment variable.

.PARAMETER GitLabUrl
  GitLab instance base URL. Defaults to "https://gitlab.onefiserv.net".

.EXAMPLE
  # Windows MSI title (scaffold only)
  pwsh -File scripts/New-Title.ps1 `
    -PackageId "7-zip" -DisplayName "7-Zip" `
    -Publisher "Igor Pavlov" -Version "24.08" `
    -Category developer-tools -Platform windows `
    -InstallerType msi -DetectionMode msi-product-code

.EXAMPLE
  # macOS-only title (scaffold only)
  pwsh -File scripts/New-Title.ps1 `
    -PackageId "slack" -DisplayName "Slack" `
    -Publisher "Slack Technologies" -Version "4.38.125" `
    -Category communication -Platform macos `
    -BundleId "com.tinyspeck.slackmacgap" `
    -ReceiptId "com.tinyspeck.slackmacgap"

.EXAMPLE
  # Dual-platform title with automatic GitLab project creation
  pwsh -File scripts/New-Title.ps1 `
    -PackageId "google-chrome" -DisplayName "Google Chrome" `
    -Publisher "Google LLC" -Version "134.0" `
    -Category browsers -Platform both `
    -InstallerType msi -DetectionMode msi-product-code `
    -BundleId "com.google.Chrome" -ReceiptId "com.google.chrome" `
    -CreateGitLabProject -GitLabToken $env:GITLAB_TOKEN

.EXAMPLE
  # Windows EXE with registry-marker detection + auto project creation
  pwsh -File scripts/New-Title.ps1 `
    -PackageId "secure-print-pune" -DisplayName "Secure Print - Pune" `
    -Publisher "Fiserv" -Version "2.3" `
    -Category custom -Platform windows `
    -InstallerType exe -DetectionMode registry-marker `
    -CreateGitLabProject
#>
[CmdletBinding()]
param(
    [string] $PackageId = '',
    [string] $DisplayName = '',
    [string] $Publisher = '',
    [string] $Version = '',
    [ValidateSet('browsers','productivity','developer-tools','security',
                 'communication','utilities','endpoint-management','custom')]
    [string] $Category = '',
    [ValidateSet('windows','macos','both')]
    [string] $Platform = '',
    [ValidateSet('msi','exe')]
    [string] $InstallerType = '',
    [ValidateSet('msi-product-code','registry-marker','file','script')]
    [string] $DetectionMode = '',
    [ValidateSet('pkg','dmg','zip')]
    [string] $MacInstallerType = '',
    [string] $BundleId = '',
    [string] $ReceiptId = '',
    [string] $JamfCategory = '',
    [string] $GitLabGroup = 'euc/software-package-automation',
    [string] $OutDir = 'titles',
    [switch] $CreateGitLabProject,
    [string] $GitLabToken = $env:GITLAB_TOKEN,
    [string] $GitLabUrl = 'https://gitlab.onefiserv.net'
)

$ErrorActionPreference = 'Stop'

# ── Import workbench modules ─────────────────────────────────────────────────
. (Join-Path $PSScriptRoot 'lib' 'Prompt-PackagingLifecycle.ps1')
. (Join-Path $PSScriptRoot 'lib' 'Prompt-DeploymentConfig.ps1')
. (Join-Path $PSScriptRoot 'lib' 'ConvertTo-LifecycleYaml.ps1')

# ══════════════════════════════════════════════════════════════════════════════
#  INTERACTIVE PROMPTS — only shown when parameters are not provided
# ══════════════════════════════════════════════════════════════════════════════

function Show-Menu {
    <#
    .SYNOPSIS
      Displays a numbered menu and returns the selected value.
    #>
    param(
        [Parameter(Mandatory)] [string]   $Title,
        [Parameter(Mandatory)] [string[]] $Options,
        [string] $Default = ''
    )
    Write-Host ""
    Write-Host "$Title" -ForegroundColor Cyan
    for ($i = 0; $i -lt $Options.Count; $i++) {
        $marker = if ($Options[$i] -eq $Default) { ' (default)' } else { '' }
        Write-Host "  [$($i + 1)] $($Options[$i])$marker"
    }
    $prompt = if ($Default) { "Enter number (1-$($Options.Count)) or press Enter for '$Default'" }
              else          { "Enter number (1-$($Options.Count))" }
    do {
        $raw = Read-Host $prompt
        if ($Default -and [string]::IsNullOrWhiteSpace($raw)) {
            return $Default
        }
        $idx = [int]$raw - 1
    } while ($idx -lt 0 -or $idx -ge $Options.Count)

    $selected = $Options[$idx]
    Write-Host "  → $selected" -ForegroundColor Green
    return $selected
}

function Read-Required {
    <#
    .SYNOPSIS
      Prompts for a required text value. Loops until non-empty input.
      Type 't' or 'todo' to defer — marks the field as TODO.
    #>
    param(
        [Parameter(Mandatory)] [string] $Prompt,
        [string] $Default = '',
        [switch] $AllowTodo
    )
    $todoHint   = if ($AllowTodo) { ' — type [T] for TODO' } else { '' }
    $suffix     = if ($Default) { " (default: $Default)$todoHint" } else { $todoHint }
    do {
        $value = Read-Host "$Prompt$suffix"
        if ([string]::IsNullOrWhiteSpace($value) -and $Default) { return $Default }
        if ($AllowTodo -and $value.Trim() -in @('t','T','todo','TODO')) {
            $marker = "TODO: $Prompt"
            Write-Host "  ⏳ Marked as: $marker" -ForegroundColor Yellow
            return $marker
        }
    } while ([string]::IsNullOrWhiteSpace($value))
    return $value.Trim()
}

function Read-Deferrable {
    <#
    .SYNOPSIS
      Prompts for an optional value. Empty = default, 't' = TODO marker.
    #>
    param(
        [Parameter(Mandatory)] [string] $Prompt,
        [string] $Default = '',
        [string] $FieldName = ''
    )
    $todoHint = " — type [T] for TODO, Enter to skip"
    $suffix   = if ($Default) { " (default: $Default)$todoHint" } else { $todoHint }
    $value = Read-Host "$Prompt$suffix"
    if ([string]::IsNullOrWhiteSpace($value) -and $Default) { return $Default }
    if ([string]::IsNullOrWhiteSpace($value)) { return '' }
    $trimmed = $value.Trim()
    if ($trimmed -in @('t','T','todo','TODO')) {
        $label = if ($FieldName) { $FieldName } else { $Prompt }
        $marker = "TODO: $label"
        Write-Host "  ⏳ Marked as: $marker" -ForegroundColor Yellow
        return $marker
    }
    return $trimmed
}

# ── Text inputs ───────────────────────────────────────────────────────────────
if (-not $PackageId)    { $PackageId    = Read-Required "Package ID (kebab-case, e.g. '7-zip')" }
if (-not $DisplayName)  { $DisplayName  = Read-Required "Display Name (e.g. '7-Zip')" }
if (-not $Publisher)    { $Publisher    = Read-Required "Publisher (e.g. 'Igor Pavlov')" -Default 'Fiserv' -AllowTodo }
if (-not $Version)      { $Version      = Read-Required "Version (e.g. '26.00')" -AllowTodo }

# ── Output directory ──────────────────────────────────────────────────────────
if ($OutDir -eq 'titles') {
    $customDir = Read-Host "Output folder for scaffolded files (default: titles)"
    if ($customDir -and $customDir.Trim()) {
        $OutDir = $customDir.Trim()
    }
}
if (!(Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
    Write-Host "  Created: $OutDir" -ForegroundColor Green
}

# ── Windows-specific prompts ──────────────────────────────────────────────────────
$CloseApps          = ''
$RestartBehavior    = 'suppress'
$MaxInstallTime     = 60
$ReturnCodes        = ''
$SupersedesAppId    = ''
$SupersedenceType   = 'update'
$MsiPath            = ''
$MsiProductCode     = ''
$MsiProductVersion  = ''
$MsiProductName     = ''
$MsiUpgradeCode     = ''
$MsiManufacturer    = ''
$MsiFileName        = ''
# EXE-specific fields
$ExeSourceFilename  = ''
$ExeInstallArgs     = ''
$ExeUninstallPath   = ''
$ExeUninstallArgs   = ''
# File detection sub-fields
$FileDetPath        = ''
$FileDetName        = ''
$FileDetType        = ''
$FileDetOperator    = ''
$FileDetValue       = ''
# Registry detection sub-fields
$RegCheck32Bit      = $false
# Script detection sub-fields
$ScriptRunAs32Bit           = $false
$ScriptEnforceSignature     = $false

# ── Choice menus ──────────────────────────────────────────────────────────────
if (-not $Category) {
    $Category = Show-Menu -Title "Select a category:" -Options @(
        'browsers', 'productivity', 'developer-tools', 'security',
        'communication', 'utilities', 'endpoint-management', 'custom'
    )
}

if (-not $Platform) {
    $Platform = Show-Menu -Title "Select target platform:" -Options @(
        'windows', 'macos', 'both'
    ) -Default 'windows'
}

if ($Platform -in @('windows','both')) {
    if (-not $InstallerType) {
        $InstallerType = Show-Menu -Title "Windows installer type:" -Options @(
            'msi', 'exe'
        ) -Default 'msi'
    }

    # MSI metadata extraction
    if ($InstallerType -eq 'msi') {
        Write-Host ""
        $MsiPath = Read-Host "Path to MSI file (drag & drop or type path) — press Enter to skip"
        $MsiPath = $MsiPath.Trim().Trim('"').Trim("'")

        if ($MsiPath -and (Test-Path $MsiPath)) {
            Write-Host "  Extracting MSI metadata..." -ForegroundColor DarkCyan
            $msiScript = Join-Path $PSScriptRoot 'Get-MsiMetadata.ps1'
            if (Test-Path $msiScript) {
                $msiJson = & pwsh -File $msiScript -MsiPath $MsiPath -Json 2>&1
                try {
                    $msiRaw  = ($msiJson -join "`n")
                    $msiMeta = $msiRaw | ConvertFrom-Json
                    $MsiProductCode    = [string]$msiMeta.ProductCode
                    $MsiProductVersion = [string]$msiMeta.ProductVersion
                    $MsiProductName    = [string]$msiMeta.ProductName
                    $MsiUpgradeCode    = [string]$msiMeta.UpgradeCode
                    $MsiManufacturer   = [string]$msiMeta.Manufacturer
                    $MsiFileName       = [string][System.IO.Path]::GetFileName($MsiPath)

                    Write-Host "  ✓ ProductCode    : $MsiProductCode" -ForegroundColor Green
                    Write-Host "    ProductVersion : $MsiProductVersion" -ForegroundColor White
                    Write-Host "    ProductName    : $MsiProductName" -ForegroundColor White
                    Write-Host "    UpgradeCode    : $MsiUpgradeCode" -ForegroundColor White
                    Write-Host "    Manufacturer   : $MsiManufacturer" -ForegroundColor White
                    Write-Host "    FileName       : $MsiFileName" -ForegroundColor White
                } catch {
                    Write-Host "  ⚠ Could not parse MSI metadata. You'll need to fill in ProductCode manually." -ForegroundColor Yellow
                }
            } else {
                Write-Host "  ⚠ Get-MsiMetadata.ps1 not found at $msiScript" -ForegroundColor Yellow
            }
        } elseif ($MsiPath) {
            Write-Host "  ⚠ File not found: $MsiPath — skipping extraction" -ForegroundColor Yellow
            $MsiPath = ''
        }
    }

    # EXE-specific prompts
    if ($InstallerType -eq 'exe') {
        Write-Host ""
        Write-Host "── EXE Installer Details ──" -ForegroundColor DarkCyan
        $ExeSourceFilename = Read-Required "EXE installer filename (e.g. 'Setup.exe')" -AllowTodo
        $ExeInstallArgs    = Read-Deferrable "Silent install arguments (e.g. '/S /v/qn')" -Default '/S' -FieldName 'install_arguments'
        $ExeUninstallPath  = Read-Deferrable "Uninstall executable path (e.g. 'C:\Program Files\App\uninstall.exe')" -FieldName 'uninstall_path'
        $ExeUninstallArgs  = Read-Deferrable "Uninstall arguments (e.g. '/S')" -Default '/S' -FieldName 'uninstall_arguments'
    }

    if (-not $DetectionMode) {
        $DetectionMode = Show-Menu -Title "Windows detection mode:" -Options @(
            'msi-product-code', 'registry-marker', 'file', 'script'
        ) -Default $(if ($InstallerType -eq 'msi') { 'msi-product-code' } else { 'registry-marker' })
    }

    # Registry detection sub-prompts
    if ($DetectionMode -eq 'registry-marker') {
        $regCheck32Choice = Show-Menu -Title "Check 32-bit registry on 64-bit systems?" -Options @(
            'no', 'yes'
        ) -Default 'no'
        $RegCheck32Bit = ($regCheck32Choice -eq 'yes')
    }

    # File detection sub-prompts
    if ($DetectionMode -eq 'file') {
        $FileDetPath = Read-Required "File detection — folder path (e.g. 'C:\Program Files\MyApp')" -AllowTodo
        $FileDetName = Read-Required "File detection — file or folder name (e.g. 'MyApp.exe')" -AllowTodo
        $FileDetType = Show-Menu -Title "File detection — what to check:" -Options @(
            'exists', 'doesNotExist', 'version', 'sizeInMB', 'modifiedDate'
        ) -Default 'exists'
        if ($FileDetType -in @('version', 'sizeInMB', 'modifiedDate')) {
            $FileDetOperator = Show-Menu -Title "Comparison operator:" -Options @(
                'greaterThanOrEqual', 'equal', 'notEqual', 'greaterThan', 'lessThan', 'lessThanOrEqual'
            ) -Default 'greaterThanOrEqual'
            if ($FileDetType -eq 'modifiedDate') {
                $FileDetValue = Read-Required "Comparison date (ISO 8601, e.g. '2025-01-15T00:00:00Z')" -AllowTodo
            } else {
                $FileDetValue = Read-Required "Comparison value (version string or size in MB)" -AllowTodo
            }
        }
    }

    # Script detection sub-prompts
    if ($DetectionMode -eq 'script') {
        Write-Host ""
        Write-Host "── Script Detection Options ──" -ForegroundColor DarkCyan
        $scriptRunAs32Choice = Show-Menu -Title "Run detection script as 32-bit?" -Options @(
            'no', 'yes'
        ) -Default 'no'
        $ScriptRunAs32Bit = ($scriptRunAs32Choice -eq 'yes')

        $scriptSigChoice = Show-Menu -Title "Enforce script signature check?" -Options @(
            'no', 'yes'
        ) -Default 'no'
        $ScriptEnforceSignature = ($scriptSigChoice -eq 'yes')
    }

    # Close apps
    Write-Host ""
    $CloseApps = Read-Deferrable "Processes to close before install (comma-separated, e.g. 'chrome,msedge')" -FieldName 'close_apps'

    # Restart behavior
    $RestartBehavior = Show-Menu -Title "Device restart behavior after install:" -Options @(
        'suppress', 'allow', 'basedOnReturnCode', 'force'
    ) -Default 'suppress'

    # Max install time
    Write-Host ""
    $maxInput = Read-Host "Max install time in minutes (default: 60)"
    if ($maxInput -and $maxInput -match '^\d+$') {
        $MaxInstallTime = [int]$maxInput
    }

    # Return codes (optional)
    Write-Host ""
    Write-Host "Custom return codes (Intune defaults: 0=success, 3010=softReboot, 1618=retry)" -ForegroundColor DarkGray
    $ReturnCodes = Read-Host "Custom return codes (format: '3010=softReboot,1234=success') — press Enter for defaults"
    $ReturnCodes = $ReturnCodes.Trim()

    # Supersedence (optional — skip entire section if not applicable)
    Write-Host ""
    $SupersedesAppId = Read-Deferrable "Intune App ID this title supersedes (press Enter to skip)" -FieldName 'supersedes_app_id'
    if ($SupersedesAppId -and $SupersedesAppId -notmatch '^TODO:') {
        $SupersedenceType = Show-Menu -Title "Supersedence type:" -Options @(
            'update', 'replace'
        ) -Default 'update'
    }
}
# Apply defaults for non-interactive use when Platform is Windows-only
if (-not $InstallerType)  { $InstallerType  = 'msi' }
if (-not $DetectionMode)  { $DetectionMode  = 'msi-product-code' }

# ── macOS-specific prompts ────────────────────────────────────────────────────
$MacSelfService = $false

if ($Platform -in @('macos','both')) {
    if (-not $MacInstallerType) {
        $MacInstallerType = Show-Menu -Title "macOS installer type:" -Options @(
            'pkg', 'dmg', 'zip'
        ) -Default 'pkg'
    }
    if (-not $BundleId) {
        $BundleId = Read-Required "macOS Bundle ID (e.g. 'com.google.Chrome')" -AllowTodo
    }
    if (-not $ReceiptId) {
        $ReceiptId = Read-Required "macOS Receipt ID" -Default $BundleId.ToLower() -AllowTodo
    }
    $ssChoice = Show-Menu -Title "Enable Jamf Self Service?" -Options @(
        'no', 'yes'
    ) -Default 'no'
    $MacSelfService = ($ssChoice -eq 'yes')
}
# Apply defaults for non-interactive use
if (-not $MacInstallerType) { $MacInstallerType = 'pkg' }

# ══════════════════════════════════════════════════════════════════════════════
#  PACKAGING LIFECYCLE & DEPLOYMENT CONFIG PROMPTS
# ══════════════════════════════════════════════════════════════════════════════

$lifecycleConfig = $null
$deploymentConfig = $null

if ($Platform -in @('windows','both')) {
    # Packaging lifecycle prompts (all 9 PSADT phases)
    $lifecycleConfig = Invoke-PackagingLifecyclePrompts `
        -InstallerType $InstallerType `
        -MsiFile $(if ($MsiFileName) { $MsiFileName } else { '' }) `
        -ProductCode $(if ($MsiProductCode) { $MsiProductCode } else { '' }) `
        -PackageId $PackageId `
        -DisplayName $DisplayName `
        -Publisher $Publisher `
        -Version $Version `
        -CloseApps $CloseApps

    # Intune deployment configuration prompts
    $deploymentConfig = Invoke-DeploymentConfigPrompts `
        -DisplayName $DisplayName `
        -Publisher $Publisher `
        -Version $Version `
        -RestartBehavior $RestartBehavior

    # Carry forward any updated values from deployment config
    if ($deploymentConfig.RestartBehavior) {
        $RestartBehavior = $deploymentConfig.RestartBehavior
    }
}

# ── Validate GitLab params ────────────────────────────────────────────────────
if ($CreateGitLabProject -and -not $GitLabToken) {
    throw "-CreateGitLabProject requires -GitLabToken or the GITLAB_TOKEN environment variable."
}

# ── Derived values ────────────────────────────────────────────────────────────
$titleDir          = Join-Path $OutDir $PackageId
$gitLabProjectPath = "$GitLabGroup/software-titles/$Category/$PackageId"
$gitLabApiBase     = "$GitLabUrl/api/v4"
$winEnabled        = ($Platform -in @('windows','both')).ToString().ToLower()
$macEnabled        = ($Platform -in @('macos','both')).ToString().ToLower()

if (Test-Path $titleDir) {
    throw "Title directory already exists: $titleDir. Delete it first or use a different PackageId."
}

# Default ReceiptId to BundleId if not specified
if ($Platform -in @('macos','both') -and -not $ReceiptId -and $BundleId) {
    $ReceiptId = $BundleId.ToLower()
}

# Map Category → Jamf category if not explicitly provided
if (-not $JamfCategory) {
    $categoryMap = @{
        'browsers'             = 'Browsers'
        'productivity'         = 'Productivity'
        'developer-tools'      = 'Developer Tools'
        'security'             = 'Security'
        'communication'        = 'Communication'
        'utilities'            = 'Utilities'
        'endpoint-management'  = 'Endpoint Management'
        'custom'               = 'Custom'
    }
    $JamfCategory = $categoryMap[$Category] ?? 'No category'
}

# ── Helpers ───────────────────────────────────────────────────────────────────
function Mkd([string] $path) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
}
function Write-File([string] $path, [string] $content) {
    $dir = Split-Path $path -Parent
    if (!(Test-Path $dir)) { Mkd $dir }
    Set-Content -Path $path -Value $content -Encoding UTF8
}

# ── GitLab API Helpers ────────────────────────────────────────────────────────
function Invoke-GitLabApi {
    <#
    .SYNOPSIS
      Wrapper for GitLab REST API calls with consistent auth and error handling.
    #>
    param(
        [Parameter(Mandatory)] [string] $Method,
        [Parameter(Mandatory)] [string] $Endpoint,
        [hashtable] $Body,
        [switch] $AllowNotFound
    )
    $headers = @{ 'PRIVATE-TOKEN' = $GitLabToken }
    $uri     = "$gitLabApiBase$Endpoint"
    $params  = @{
        Method      = $Method
        Uri         = $uri
        Headers     = $headers
        ContentType = 'application/json'
    }
    if ($Body) {
        $params['Body'] = ($Body | ConvertTo-Json -Depth 10)
    }
    try {
        Invoke-RestMethod @params
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($AllowNotFound -and $status -eq 404) {
            return $null
        }
        Write-Error "GitLab API $Method $Endpoint failed (HTTP $status): $($_.Exception.Message)"
        throw
    }
}

function Resolve-GitLabNamespace {
    <#
    .SYNOPSIS
      Resolves (and optionally creates) a nested GitLab group/subgroup path.
      Returns the namespace_id of the deepest group.
    .DESCRIPTION
      Given a path like "euc/software-package-automation/software-titles/utilities",
      walks each segment. If a segment doesn't exist, creates it as a subgroup.
    #>
    param(
        [Parameter(Mandatory)] [string] $FullPath
    )
    $segments    = $FullPath -split '/'
    $currentPath = ''
    $parentId    = $null

    foreach ($segment in $segments) {
        $currentPath = if ($currentPath) { "$currentPath/$segment" } else { $segment }
        $encoded     = [System.Uri]::EscapeDataString($currentPath)

        # Try to find the group
        $group = Invoke-GitLabApi -Method GET -Endpoint "/groups/$encoded" -AllowNotFound

        if ($group) {
            $parentId = $group.id
            Write-Host "  ✓ Group exists: $currentPath (id: $parentId)" -ForegroundColor DarkGray
        } else {
            # Create the subgroup
            Write-Host "  + Creating subgroup: $currentPath" -ForegroundColor Yellow
            $body = @{
                name       = $segment
                path       = $segment
                visibility = 'private'
            }
            if ($parentId) {
                $body['parent_id'] = $parentId
            }
            $newGroup = Invoke-GitLabApi -Method POST -Endpoint '/groups' -Body $body
            $parentId = $newGroup.id
            Write-Host "  ✓ Created: $currentPath (id: $parentId)" -ForegroundColor Green
        }
    }

    return $parentId
}

Write-Host "Scaffolding title : $PackageId" -ForegroundColor Cyan
Write-Host "Category          : $Category  ->  $gitLabProjectPath"
Write-Host "Platform          : $Platform"
if ($Platform -in @('windows','both')) {
    Write-Host "  Windows         : InstallerType=$InstallerType  DetectionMode=$DetectionMode"
}
if ($Platform -in @('macos','both')) {
    Write-Host "  macOS           : InstallerType=$MacInstallerType  BundleId=$BundleId"
}
Write-Host ""

# ══════════════════════════════════════════════════════════════════════════════
#  COMMON FILES — always generated
# ══════════════════════════════════════════════════════════════════════════════

# ── app.json ──────────────────────────────────────────────────────────────────
Write-File (Join-Path $titleDir 'app.json') @"
{
  "title": "$DisplayName",
  "publisher": "$Publisher",
  "package_id": "$PackageId",
  "version": "$Version",
  "owners": {
    "team": "euc-packaging",
    "contact_email": "euc-packaging@fiserv.com"
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

# ── .gitlab-ci.yml ────────────────────────────────────────────────────────────
$includeFiles = [System.Collections.Generic.List[string]]::new()
if ($Platform -in @('windows','both')) {
    $includeFiles.Add("      - 'templates/windows-build.yml'")
    $includeFiles.Add("      - 'templates/windows-deploy-intune.yml'")
}
if ($Platform -in @('macos','both')) {
    $includeFiles.Add("      - 'templates/macos-deploy-jamf.yml'")
}
$includeBlock = $includeFiles -join "`n"

# Build stages list based on platform
$stageLines = @("  - build")
if ($Platform -in @('windows','both')) {
    $stageLines += "  - publish"
    $stageLines += "  - assign"
}
if ($Platform -in @('macos','both')) {
    $stageLines += "  - deploy"
}
# Deduplicate while preserving order
$stageLines = $stageLines | Select-Object -Unique
$stagesBlock = $stageLines -join "`n"

Write-File (Join-Path $titleDir '.gitlab-ci.yml') @"
include:
  - project: '$GitLabGroup/spa-frameworks/gitlab-ci-templates'
    ref: 'main'
    file:
$includeBlock

stages:
$stagesBlock

variables:
  WINDOWS_ENABLED: "$winEnabled"
  MACOS_ENABLED:   "$macEnabled"
  PSADT_FRAMEWORK_VERSION: "4.1.0"
  MACOS_FRAMEWORK_VERSION: "1.0.0"
"@

# ── .gitignore ────────────────────────────────────────────────────────────────
Write-File (Join-Path $titleDir '.gitignore') @"
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

# Generated at build time from lifecycle.yaml — do not commit
windows/src/Invoke-AppDeployToolkit.ps1
"@

# ── Initialize-GitLab.ps1 ────────────────────────────────────────────────────
# Copy the standalone script into the title so the packager can run it later
$initScript = Join-Path $PSScriptRoot 'Initialize-GitLab.ps1'
if (Test-Path $initScript) {
    Copy-Item $initScript (Join-Path $titleDir 'Initialize-GitLab.ps1') -Force
} else {
    Write-Host "  ⚠ Initialize-GitLab.ps1 not found at $initScript — skipping copy" -ForegroundColor Yellow
}

# (Get-MsiMetadata.ps1 is called inline during prompts — not copied into titles)

# ══════════════════════════════════════════════════════════════════════════════
#  WINDOWS FILES
# ══════════════════════════════════════════════════════════════════════════════
if ($Platform -in @('windows','both')) {

    # ── Resolve MSI-specific values ───────────────────────────────────────────
    $productCode = if ($MsiProductCode) { $MsiProductCode } else { '{TODO-PRODUCT-CODE-GUID}' }
    $msiFile     = if ($MsiFileName)    { $MsiFileName }    else { 'TODO_INSTALLER.msi' }

    # ── Install / uninstall commands (what Intune actually runs — PSADT wrapper) ─
    $installCmd   = 'Invoke-AppDeployToolkit.exe'
    $uninstallCmd = 'Invoke-AppDeployToolkit.exe -DeploymentType Uninstall'

    # ── Detection block ───────────────────────────────────────────────────────
    $detectionBlock = switch ($DetectionMode) {
        'msi-product-code' {
@"
detection_mode: msi-product-code
detection:
  product_code: "$productCode"
  version_operator: greaterThanOrEqual
  version: "$Version"
"@
        }
        'registry-marker' {
@"
detection_mode: registry-marker
detection:
  hive: HKLM
  key_path: "SOFTWARE\\Fiserv\\InstalledApps\\$PackageId"
  value_name: Version
  operator: greaterThanOrEqual
  value: "$Version"
  check32BitOn64System: $($RegCheck32Bit.ToString().ToLower())
"@
        }
        'file' {
            # Use values from interactive prompts or defaults
            $fdPath = if ($FileDetPath) { $FileDetPath } else { 'C:\\Program Files\\TODO' }
            $fdName = if ($FileDetName) { $FileDetName } else { 'TODO.exe' }
            $fdType = if ($FileDetType) { $FileDetType } else { 'exists' }

            if ($fdType -in @('version', 'sizeInMB', 'modifiedDate')) {
                $fdOp  = if ($FileDetOperator) { $FileDetOperator } else { 'greaterThanOrEqual' }
                $fdVal = if ($FileDetValue) { $FileDetValue } else { $Version }
@"
detection_mode: file
detection:
  path: "$fdPath"
  file_or_folder: "$fdName"
  detection_type: $fdType
  operator: $fdOp
  value: "$fdVal"
  check_32bit: false
"@
            } else {
@"
detection_mode: file
detection:
  path: "$fdPath"
  file_or_folder: "$fdName"
  detection_type: $fdType
  check_32bit: false
"@
            }
        }
        'script' {
@"
detection_mode: script
detection:
  run_as_32bit: $($ScriptRunAs32Bit.ToString().ToLower())
  enforce_signature_check: $($ScriptEnforceSignature.ToString().ToLower())
# Place your detection script at: windows/detection/detect.ps1
# Script must output to stdout and exit 0 (detected) or 1 (not detected).
"@
        }
    }

    # ── Return codes block (for package.yaml) ─────────────────────────────────
    $returnCodesBlock = ''
    if ($ReturnCodes) {
        # Parse "3010=softReboot,1234=success" into structured YAML
        $rcLines = @('return_codes:')
        foreach ($entry in ($ReturnCodes -split ',')) {
            $parts = $entry.Trim() -split '='
            if ($parts.Count -eq 2) {
                $rcLines += "  - returnCode: $($parts[0].Trim())"
                $rcLines += "    type: $($parts[1].Trim())"
            }
        }
        $returnCodesBlock = $rcLines -join "`n"
    }

    # ── Close apps block ──────────────────────────────────────────────────────
    $closeAppsBlock = ''
    if ($CloseApps) {
        $closeAppsBlock = "close_apps: '$CloseApps'"
    }

    # ── Behavioral blocks ─────────────────────────────────────────────────────
    $restartBlock = "restart_behavior: $RestartBehavior"
    $appInstCtxResolved = if ($deploymentConfig.InstallContext) { $deploymentConfig.InstallContext } else { 'system' }
    $installExpBlock = "install_experience: $appInstCtxResolved"

    # ── Max install time block ────────────────────────────────────────────────
    $maxTimeBlock = "max_install_time: $MaxInstallTime"

    # ── Supersedes block (conditional) ────────────────────────────────────────
    $supersedesBlock = ''
    if ($SupersedesAppId -and $SupersedesAppId.Trim() -ne '' -and $SupersedesAppId -notmatch '^TODO:') {
        $supersedesBlock = @"
supersedes:
  app_id: "$SupersedesAppId"
  uninstall_previous: true
"@
    }

    # ── MSI information block (conditional) ───────────────────────────────────
    $msiInfoBlock = ''
    if ($InstallerType -eq 'msi' -and $MsiProductCode) {
        $msiInfoLines = @('msi_information:')
        $msiInfoLines += "  product_code: `"$MsiProductCode`""
        if ($MsiProductVersion) { $msiInfoLines += "  product_version: `"$MsiProductVersion`"" }
        if ($MsiProductName)    { $msiInfoLines += "  product_name: `"$MsiProductName`"" }
        if ($MsiUpgradeCode)    { $msiInfoLines += "  upgrade_code: `"$MsiUpgradeCode`"" }
        if ($MsiManufacturer)   { $msiInfoLines += "  manufacturer: `"$MsiManufacturer`"" }
        $msiInfoBlock = $msiInfoLines -join "`n"
    }

    # ── Resolve source filename ────────────────────────────────────────────────
    $sourceFile = if ($InstallerType -eq 'msi') {
        if ($msiFile -and $msiFile -ne 'TODO_INSTALLER.msi') { $msiFile } else { 'TODO_INSTALLER.msi' }
    } else {
        if ($ExeSourceFilename) { $ExeSourceFilename } else { 'TODO_INSTALLER.exe' }
    }

    # ── windows/package.yaml ──────────────────────────────────────────────────
    # Build optional lines — only include when values are present
    $yamlOptionalLines = @()
    if ($closeAppsBlock)    { $yamlOptionalLines += $closeAppsBlock }
    $yamlOptionalLines += $restartBlock
    $yamlOptionalLines += $installExpBlock
    if ($returnCodesBlock)  { $yamlOptionalLines += ''; $yamlOptionalLines += $returnCodesBlock }
    if ($supersedesBlock)   { $yamlOptionalLines += ''; $yamlOptionalLines += $supersedesBlock }
    if ($msiInfoBlock)      { $yamlOptionalLines += ''; $yamlOptionalLines += $msiInfoBlock }
    $yamlOptionalContent = $yamlOptionalLines -join "`n"

    Write-File (Join-Path $titleDir 'windows\package.yaml') @"
# $DisplayName $Version — Windows package definition
package_id: $PackageId
display_name: "$DisplayName"
version: "$Version"
packaging_version: "1"
installer_type: $InstallerType
source_filename: $sourceFile
$maxTimeBlock

install_command: '$installCmd'
uninstall_command: '$uninstallCmd'

$detectionBlock

$yamlOptionalContent
"@

    # ── windows/intune/app.json ───────────────────────────────────────────────
    $appDescription  = if ($deploymentConfig.Description)    { $deploymentConfig.Description }    else { 'TODO: Add application description.' }
    $appInfoUrl      = if ($deploymentConfig.InformationUrl) { $deploymentConfig.InformationUrl } else { '' }
    $appPrivacyUrl   = if ($deploymentConfig.PrivacyUrl)     { $deploymentConfig.PrivacyUrl }     else { '' }
    $appOwner        = if ($deploymentConfig.Owner)          { $deploymentConfig.Owner }          else { 'EUC Packaging' }
    $appDeveloper    = if ($deploymentConfig.Developer)      { $deploymentConfig.Developer }      else { '' }
    $appNotes        = if ($deploymentConfig.Notes)          { $deploymentConfig.Notes }          else { 'Managed by SPA pipeline.' }
    $appInstCtx      = if ($deploymentConfig.InstallContext) { $deploymentConfig.InstallContext } else { 'system' }
    $appFeatured     = if ($deploymentConfig -and $deploymentConfig.IsFeatured) { 'true' } else { 'false' }
    $appArch         = if ($deploymentConfig.Architecture)   { $deploymentConfig.Architecture }   else { 'x64' }
    $appMinWin       = if ($deploymentConfig.MinWinRelease)  { $deploymentConfig.MinWinRelease }  else { '22H2' }

    # Build optional JSON fields — only include when values are present
    $appJsonOptional = @()
    if ($appDeveloper)    { $appJsonOptional += "  `"developer`": `"$appDeveloper`"" }
    # Scope tags (only if provided)
    if ($deploymentConfig -and $deploymentConfig.ScopeTags -and $deploymentConfig.ScopeTags.Count -gt 0) {
        $stJson = ($deploymentConfig.ScopeTags | ForEach-Object { "`"$_`"" }) -join ', '
        $appJsonOptional += "  `"roleScopeTagIds`": [$stJson]"
    }
    # Categories (only if provided)
    if ($deploymentConfig -and $deploymentConfig.Categories -and $deploymentConfig.Categories.Count -gt 0) {
        $catJson = ($deploymentConfig.Categories | ForEach-Object { "`"$_`"" }) -join ', '
        $appJsonOptional += "  `"categories`": [$catJson]"
    }
    $appJsonOptionalBlock = ''
    if ($appJsonOptional.Count -gt 0) {
        $appJsonOptionalBlock = ",`n" + ($appJsonOptional -join ",`n")
    }

    Write-File (Join-Path $titleDir 'windows\intune\app.json') @"
{
  "displayName": "$DisplayName",
  "description": "$appDescription",
  "publisher": "$Publisher",
  "appVersion": "$Version",
  "informationUrl": "$appInfoUrl",
  "isFeatured": $appFeatured,
  "privacyInformationUrl": "$appPrivacyUrl",
  "notes": "$appNotes",
  "owner": "$appOwner",
  "installCommandLine": "Invoke-AppDeployToolkit.exe",
  "uninstallCommandLine": "Invoke-AppDeployToolkit.exe -DeploymentType Uninstall",
  "applicableArchitectures": "$appArch",
  "minimumSupportedWindowsRelease": "$appMinWin",
  "displayVersion": "$Version",
  "allowAvailableUninstall": true,
  "installContext": "$appInstCtx",
  "restartBehavior": "$RestartBehavior"$appJsonOptionalBlock
}
"@

    # ── windows/intune/assignments.json ───────────────────────────────────────
    $assignmentEntries = @()
    if ($deploymentConfig -and $deploymentConfig.Assignments.Count -gt 0) {
        foreach ($a in $deploymentConfig.Assignments) {
            $filterBlock = ''
            if ($a.FilterMode -ne 'none' -and $a.FilterId) {
                $filterBlock = ",`n    `"filterMode`": `"$($a.FilterMode)`",`n    `"filterId`": `"$($a.FilterId)`""
            } else {
                $filterBlock = ",`n    `"filterMode`": `"none`""
            }
            # Per-assignment optional fields
            $notifVal = if ($a.Notifications) { $a.Notifications } else { 'showAll' }
            $delOptVal = if ($a.DeliveryOptimizationPriority) { $a.DeliveryOptimizationPriority } else { 'notConfigured' }
            $assignmentEntries += @"
  {
    "intent": "$($a.Intent)",
    "groupId": "$($a.GroupId)"$filterBlock,
    "notifications": "$notifVal",
    "deliveryOptimizationPriority": "$delOptVal"
  }
"@
        }
    } else {
        $assignmentEntries += @"
  {
    "intent": "available",
    "groupId": "TODO-ENTRA-ID-GROUP-OBJECT-ID",
    "filterMode": "none",
    "notifications": "showAll",
    "deliveryOptimizationPriority": "notConfigured"
  }
"@
    }
    $assignmentsJson = $assignmentEntries -join ",`n"
    Write-File (Join-Path $titleDir 'windows\intune\assignments.json') @"
[
$assignmentsJson
]
"@

    # ── windows/intune/dependencies.json (only if dependencies specified) ────
    if ($deploymentConfig -and $deploymentConfig.Dependencies.Count -gt 0) {
        $depEntries = @()
        foreach ($d in $deploymentConfig.Dependencies) {
            $depEntries += @"
  {
    "appId": "$($d.AppId)",
    "dependencyType": "$($d.DependencyType)"
  }
"@
        }
        $depsJson = $depEntries -join ",`n"
        Write-File (Join-Path $titleDir 'windows\intune\dependencies.json') @"
[
$depsJson
]
"@
    }

    # ── windows/intune/requirements.json ──────────────────────────────────────
    Write-File (Join-Path $titleDir 'windows\intune\requirements.json') @"
{
  "minimumSupportedWindowsRelease": "$appMinWin",
  "applicableArchitectures": "$appArch",
  "minimumFreeDiskSpaceInMB": 500,
  "minimumMemoryInMB": 2048,
  "minimumNumberOfProcessors": null,
  "minimumCpuSpeedInMHz": null
}
"@

    # ── windows/intune/supersedence.json (always generated — fill in when updating) ─
    $resolvedSuperId = if ($SupersedesAppId -and $SupersedesAppId.Trim() -ne '' -and $SupersedesAppId -notmatch '^TODO:') {
        $SupersedesAppId
    } else { '' }
    Write-File (Join-Path $titleDir 'windows\intune\supersedence.json') @"
{
  "supersededAppId": "$resolvedSuperId",
  "supersedenceType": "$SupersedenceType"
}
"@

    # ── windows/src/Files/.gitkeep ────────────────────────────────────────────
    Mkd (Join-Path $titleDir 'windows\src\Files')
    Write-File (Join-Path $titleDir 'windows\src\Files\.gitkeep') @"
# Drop installer binary here. Do NOT commit binaries to git.
# Expected: $sourceFile
"@

    # ── windows/lifecycle.yaml (declarative — PSADT script generated at build time) ──
    $lifecycleToSerialize = if ($lifecycleConfig) {
        $lifecycleConfig
    } else {
        # Fallback: build a lifecycle config from the legacy prompts
        @{
            PreInstall    = @{
                Actions = @(@{ Type = 'CloseApps'; Apps = $CloseApps })
                CloseApps = $CloseApps
            }
            Install       = @{ Actions = @(
                if ($InstallerType -eq 'msi') {
                    @{ Type = 'MsiInstall'; FilePath = $sourceFile; ArgumentList = '/QN /norestart' }
                } else {
                    $exeF = if ($ExeSourceFilename) { $ExeSourceFilename } else { 'TODO_INSTALLER.exe' }
                    $exeA = if ($ExeInstallArgs) { $ExeInstallArgs } else { '/S' }
                    @{ Type = 'ExeInstall'; FilePath = $exeF; ArgumentList = $exeA }
                }
            )}
            PostInstall   = @{ Actions = @(
                if ($DetectionMode -eq 'registry-marker') {
                    @{ Type = 'RegistryMarker'; PackageId = $PackageId; DisplayName = $DisplayName; Publisher = $Publisher; Version = $Version }
                }
            )}
            PreUninstall  = @{
                Actions = @(@{ Type = 'CloseApps'; Apps = $CloseApps })
            }
            Uninstall     = @{ Actions = @(
                if ($InstallerType -eq 'msi') {
                    @{ Type = 'MsiUninstall'; AppName = $DisplayName; ProductCode = $productCode }
                } else {
                    $euPath = if ($ExeUninstallPath) { $ExeUninstallPath } else { 'C:\Program Files\TODO\uninstall.exe' }
                    $euArgs = if ($ExeUninstallArgs) { $ExeUninstallArgs } else { '/S' }
                    @{ Type = 'ExeUninstall'; FilePath = $euPath; ArgumentList = $euArgs }
                }
            )}
            PostUninstall = @{ Actions = @(
                if ($DetectionMode -eq 'registry-marker') {
                    @{ Type = 'RemoveRegistryMarker'; PackageId = $PackageId }
                }
            )}
            RepairMode    = 'mirror'
            PreRepair     = @{ Actions = @() }
            Repair        = @{ Actions = @() }
            PostRepair    = @{ Actions = @() }
        }
    }

    $lifecycleYaml = ConvertTo-LifecycleYaml -Lifecycle $lifecycleToSerialize
    Write-File (Join-Path $titleDir 'windows\lifecycle.yaml') $lifecycleYaml

    # ── windows/src/scripts/ (custom lifecycle scripts, if any) ──────────────
    Mkd (Join-Path $titleDir 'windows\src\scripts')

    # ── windows/detection/detect.ps1 (only for script detection mode) ─────────
    if ($DetectionMode -eq 'script') {
        Write-File (Join-Path $titleDir 'windows\detection\detect.ps1') @"
<#
.SYNOPSIS
  Intune detection script for $DisplayName.
  Exit 0 + stdout = detected (installed).
  Exit 1 = not detected (not installed).
#>

# TODO: Replace with your detection logic
`$appPath = "C:\Program Files\TODO\$PackageId.exe"

if (Test-Path `$appPath) {
    Write-Host "$DisplayName is installed."
    exit 0
} else {
    exit 1
}
"@

        # Detection config sidecar — consumed by Resolve-DetectionRules.ps1
        $scriptRunAs32   = $ScriptRunAs32Bit.ToString().ToLower()
        $scriptEnforceSig = $ScriptEnforceSignature.ToString().ToLower()
        Write-File (Join-Path $titleDir 'windows\detection\detection-config.json') @"
{
  "runAs32Bit": $scriptRunAs32,
  "enforceSignatureCheck": $scriptEnforceSig
}
"@
    }
}

# ══════════════════════════════════════════════════════════════════════════════
#  MACOS FILES
# ══════════════════════════════════════════════════════════════════════════════
if ($Platform -in @('macos','both')) {

    $sourceFilename = "TODO_INSTALLER.$MacInstallerType"
    $bundlePlaceholder = if ($BundleId) { $BundleId } else { "com.vendor.TODO" }
    $receiptPlaceholder = if ($ReceiptId) { $ReceiptId } else { "com.vendor.todo" }

    # ── macos/package.yaml ────────────────────────────────────────────────────
    Write-File (Join-Path $titleDir 'macos\package.yaml') @"
# $DisplayName $Version — macOS package definition
vendor_version: "$Version"
packaging_version: 1
source_type: $MacInstallerType
source_filename: $sourceFilename
receipt_id: $receiptPlaceholder
bundle_id: $bundlePlaceholder
minimum_os: "13.0"
architecture: universal
jamf_category: $JamfCategory
post_install_script: postinstall.sh
"@

    # ── macos/jamf/package-inputs.json ────────────────────────────────────────
    Write-File (Join-Path $titleDir 'macos\jamf\package-inputs.json') @"
{
  "package_name": "$DisplayName $Version",
  "category_id": "-1",
  "notes": "Deployed by SPA pipeline. Do not modify directly in Jamf.",
  "reboot_required": false,
  "os_requirements": ""
}
"@

    # ── macos/jamf/policy-inputs.json ─────────────────────────────────────────
    Write-File (Join-Path $titleDir 'macos\jamf\policy-inputs.json') @"
{
  "policy_name": "SPA - Install $DisplayName",
  "enabled": true,
  "trigger": "RECURRING_CHECK_IN",
  "frequency": "Once per computer",
  "run_recon_after_install": true,
  "self_service_enabled": $($MacSelfService.ToString().ToLower()),
  "self_service_display_name": "$DisplayName",
  "self_service_description": ""
}
"@

    # ── macos/jamf/scope-inputs.json ──────────────────────────────────────────
    Write-File (Join-Path $titleDir 'macos\jamf\scope-inputs.json') @"
{
  "_comment": "Replace computer_groups values with real Jamf smart/static group IDs",
  "scope_groups": {
    "computer_groups": [
      "TODO-JAMF-SMART-GROUP-ID"
    ]
  },
  "exclusion_groups": {
    "computer_groups": []
  }
}
"@

    # ── macos/src/scripts/preinstall ──────────────────────────────────────────
    Write-File (Join-Path $titleDir 'macos\src\scripts\preinstall') @"
#!/usr/bin/env bash
# =============================================================================
# preinstall — $DisplayName macOS pre-install
# Runs before the installer payload is extracted.
# =============================================================================
set -euo pipefail

echo "[preinstall] $DisplayName pre-install starting..."

# TODO: Add pre-install logic here, e.g.:
# - Kill running app processes
# - Remove previous versions
# - Check prerequisites

echo "[preinstall] $DisplayName pre-install complete."
exit 0
"@

    # ── macos/src/scripts/postinstall ─────────────────────────────────────────
    Write-File (Join-Path $titleDir 'macos\src\scripts\postinstall') @"
#!/usr/bin/env bash
# =============================================================================
# postinstall — $DisplayName macOS post-install
# Runs after the installer payload is extracted.
# =============================================================================
set -euo pipefail

echo "[postinstall] $DisplayName post-install starting..."

# TODO: Add post-install logic here, e.g.:
# - Register app with LaunchServices
# - Remove quarantine attributes
# - Set default preferences

# Example: Remove quarantine attribute
# APP_PATH="/Applications/TODO.app"
# if [[ -d "`$APP_PATH" ]]; then
#   xattr -r -d com.apple.quarantine "`$APP_PATH" 2>/dev/null || true
# fi

echo "[postinstall] $DisplayName post-install complete."
exit 0
"@

    # ── macos/src/postinstall.sh (wrapper referenced by package.yaml) ─────────
    Write-File (Join-Path $titleDir 'macos\src\postinstall.sh') @"
#!/usr/bin/env bash
# =============================================================================
# postinstall.sh — wrapper script referenced by package.yaml
# =============================================================================
set -euo pipefail

SCRIPT_DIR="`$(cd "`$(dirname "`$0")" && pwd)"
bash "`$SCRIPT_DIR/scripts/postinstall"
"@

    # ── macos/src/Files/.gitkeep ──────────────────────────────────────────────
    Mkd (Join-Path $titleDir 'macos\src\Files')
    Write-File (Join-Path $titleDir 'macos\src\Files\.gitkeep') @"
# Drop macOS installer binary here. Do NOT commit binaries to git.
# Expected: $sourceFilename
"@

    # ── macos/detection/extension-attribute.sh ────────────────────────────────
    Write-File (Join-Path $titleDir 'macos\detection\extension-attribute.sh') @"
#!/usr/bin/env bash
# =============================================================================
# extension-attribute.sh — Jamf Extension Attribute
# Returns the installed version of $DisplayName for inventory reporting.
# Upload this script to Jamf Pro > Settings > Extension Attributes.
# =============================================================================

APP_PATH="/Applications/TODO.app"  # TODO: Update with actual app path
PLIST_KEY="CFBundleShortVersionString"

if [[ -d "`$APP_PATH" ]]; then
    version=`$(defaults read "`$APP_PATH/Contents/Info" "`$PLIST_KEY" 2>/dev/null)
    if [[ -n "`$version" ]]; then
        echo "<result>`$version</result>"
    else
        echo "<result>Installed (version unknown)</result>"
    fi
else
    echo "<result>Not Installed</result>"
fi
"@

    # ── macos/detection/receipt-check.sh ──────────────────────────────────────
    Write-File (Join-Path $titleDir 'macos\detection\receipt-check.sh') @"
#!/usr/bin/env bash
# =============================================================================
# receipt-check.sh — Receipt-based detection
# Checks if the macOS installer receipt exists for $DisplayName.
# Use in Jamf Smart Groups or Script criteria.
# =============================================================================

RECEIPT_ID="$receiptPlaceholder"

if pkgutil --pkg-info "`$RECEIPT_ID" &>/dev/null; then
    echo "Installed"
    exit 0
else
    echo "Not Installed"
    exit 1
fi
"@
}

# ══════════════════════════════════════════════════════════════════════════════
#  SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "Scaffolded files:" -ForegroundColor Green
Get-ChildItem -Path $titleDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Replace((Resolve-Path $OutDir).Path + [IO.Path]::DirectorySeparatorChar, '')
    Write-Host ("  " + $rel)
}
Write-Host ""
Write-Host "GitLab project  : $gitLabProjectPath" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Search 'TODO' in the generated files and fill in all placeholders"

if ($Platform -in @('windows','both')) {
    Write-Host ""
    Write-Host "  WINDOWS:" -ForegroundColor Magenta
    if ($InstallerType -eq 'msi' -and $MsiProductCode) {
        Write-Host "  ✓ MSI ProductCode auto-filled: $MsiProductCode" -ForegroundColor Green
        Write-Host "  2w. Copy $MsiFileName into windows\src\Files\ (NOT committed to git)"
    } elseif ($InstallerType -eq 'msi') {
        Write-Host "  2w. Extract ProductCode (MSI path was not provided during scaffold):"
        Write-Host "       pwsh -File scripts\Get-MsiMetadata.ps1 -MsiPath <path-to-installer.msi>"
        Write-Host "       Then update ProductCode in windows\package.yaml"
    } else {
        Write-Host "  2w. Drop the installer binary into windows\src\Files\ (NOT committed to git)"
    }
    Write-Host "  3w. Replace Entra ID group IDs in windows\intune\assignments.json"
    if ($DetectionMode -eq 'registry-marker') {
        Write-Host "  4w. Verify the registry marker path in package.yaml"
    }
}

if ($Platform -in @('macos','both')) {
    Write-Host ""
    Write-Host "  MACOS:" -ForegroundColor Magenta
    Write-Host "  2m. Drop the .$MacInstallerType installer into macos\src\Files\"
    Write-Host "  3m. Update bundle_id and receipt_id in macos\package.yaml"
    Write-Host "  4m. Replace Jamf smart group IDs in macos\jamf\scope-inputs.json"
    Write-Host "  5m. Customize macos\src\scripts\postinstall if needed"
    Write-Host "  6m. Upload macos\detection\extension-attribute.sh to Jamf Pro"
}

# ══════════════════════════════════════════════════════════════════════════════
#  GITLAB PROJECT CREATION & GIT PUSH
# ══════════════════════════════════════════════════════════════════════════════
if ($CreateGitLabProject) {

    Write-Host ""
    Write-Host "Creating GitLab project..." -ForegroundColor Cyan

    # ── Resolve the parent namespace (create subgroups if needed) ─────────
    $namespacePath = "$GitLabGroup/software-titles/$Category"
    Write-Host "Resolving namespace: $namespacePath" -ForegroundColor DarkCyan
    $namespaceId = Resolve-GitLabNamespace -FullPath $namespacePath

    # ── Check if project already exists ───────────────────────────────────
    $encodedPath = [System.Uri]::EscapeDataString($gitLabProjectPath)
    $existing    = Invoke-GitLabApi -Method GET -Endpoint "/projects/$encodedPath" -AllowNotFound

    if ($existing) {
        Write-Host "  ⚠ Project already exists: $($existing.web_url)" -ForegroundColor Yellow
        $projectUrl  = $existing.web_url
        $httpUrlToRepo = $existing.http_url_to_repo
    } else {
        # ── Create the project ────────────────────────────────────────────
        Write-Host "  + Creating project: $PackageId in namespace $namespaceId" -ForegroundColor Yellow
        $projectBody = @{
            name                   = $PackageId
            path                   = $PackageId
            namespace_id           = $namespaceId
            visibility             = 'private'
            initialize_with_readme = $false
            description            = "SPA title: $DisplayName ($Publisher) — managed by the packaging factory."
            default_branch         = 'main'
        }
        $project = Invoke-GitLabApi -Method POST -Endpoint '/projects' -Body $projectBody
        $projectUrl    = $project.web_url
        $httpUrlToRepo = $project.http_url_to_repo
        Write-Host "  ✓ Project created: $projectUrl" -ForegroundColor Green
    }

    # ── Git init, commit, and push ────────────────────────────────────────
    Write-Host ""
    Write-Host "Initializing git and pushing..." -ForegroundColor Cyan

    $origLocation = Get-Location
    try {
        Set-Location $titleDir

        # Build the authenticated remote URL
        $remoteUrl = $httpUrlToRepo -replace '(https?://)', "`$1oauth2:$GitLabToken@"

        & git init -b main 2>&1 | Out-Null
        & git add -A 2>&1 | Out-Null
        & git commit -m "feat: scaffold $DisplayName $Version" 2>&1 | Out-Null
        & git remote add origin $remoteUrl 2>&1 | Out-Null

        Write-Host "  Pushing to origin..." -ForegroundColor DarkCyan
        $pushOutput = & git push -u origin main 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Git push failed: $pushOutput"
        } else {
            Write-Host "  ✓ Pushed to: $projectUrl" -ForegroundColor Green
        }

        # Tag the initial version
        $tagName = "v$Version-1"
        & git tag $tagName 2>&1 | Out-Null
        $tagOutput = & git push origin $tagName 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Tag push failed: $tagOutput"
        } else {
            Write-Host "  ✓ Tagged: $tagName" -ForegroundColor Green
        }
    } finally {
        Set-Location $origLocation
    }

    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host "  Done! Project is live at:" -ForegroundColor Green
    Write-Host "  $projectUrl" -ForegroundColor White
    Write-Host "  Pipeline will trigger automatically from the tag push." -ForegroundColor Green
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green

} else {

    # ── Deploy instructions (no -CreateGitLabProject) ───────────────────────
    Write-Host ""
    Write-Host "  DEPLOY:" -ForegroundColor Magenta
    Write-Host "  After filling in all TODOs, run the included script:"
    Write-Host ""
    Write-Host "       cd $titleDir" -ForegroundColor White
    Write-Host "       pwsh -File Initialize-GitLab.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "  This will create the GitLab project, commit, push, and tag automatically."
    Write-Host "  You'll need a GitLab token — set GITLAB_TOKEN or pass -GitLabToken." -ForegroundColor DarkGray
}
