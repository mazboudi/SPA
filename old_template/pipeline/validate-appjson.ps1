<#
.SYNOPSIS
  Lightweight validation for app.json:
    - required fields
    - detection type validation (msi/registry/file)
    - basic sanity checks
    - required repo paths exist

.EXAMPLE
  pwsh -File pipeline/validate-appjson.ps1
#>

[CmdletBinding()]
param(
  [string] $AppJsonPath = "app.json",
  [string] $PsadtDir    = "psadt",
  [string] $SrcDir      = "src",
  [string] $ToolsDir    = "tools"
)

$ErrorActionPreference = "Stop"

function Require($cond, [string] $msg) {
  if (-not $cond) { throw $msg }
}

function Exists($path) { Test-Path $path }

# --- Load JSON ---
Require (Exists $AppJsonPath) "Missing $AppJsonPath"
$appRaw = Get-Content $AppJsonPath -Raw -Encoding UTF8
try {
  $app = $appRaw | ConvertFrom-Json -ErrorAction Stop
} catch {
  throw "Invalid JSON in ${AppJsonPath}: $($_.Exception.Message)"
}

# --- Required fields ---
Require ($app.name)      "app.json missing required field: name"
Require ($app.publisher) "app.json missing required field: publisher"
Require ($app.version)   "app.json missing required field: version"

# install/uninstall command lines (support either {install:{commandLine}} or legacy flat keys)
$installCmd   = $app.install.commandLine
$uninstallCmd = $app.uninstall.commandLine
Require ($installCmd)   "app.json missing required field: install.commandLine"
Require ($uninstallCmd) "app.json missing required field: uninstall.commandLine"

# --- Detection validation ---
Require ($app.detection) "app.json missing required object: detection"
Require ($app.detection.type) "detection.type is required (msi|registry|file)"

switch ($app.detection.type) {
  "msi" {
    Require ($app.detection.productCode) "MSI detection requires detection.productCode"
    Require ($app.detection.productCode -match '^\{[0-9A-Fa-f\-]{36}\}$') "detection.productCode must be a GUID in braces, e.g. {xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}"
  }
  "registry" {
    Require ($app.detection.hive)      "Registry detection requires detection.hive (HKLM|HKCU)"
    Require ($app.detection.keyPath)   "Registry detection requires detection.keyPath"
    Require ($app.detection.valueName) "Registry detection requires detection.valueName"
    Require ($app.detection.operator)  "Registry detection requires detection.operator (equals|contains|greaterThanOrEqual|exists)"
    Require ($app.detection.hive -in @("HKLM","HKCU")) "detection.hive must be HKLM or HKCU"
  }
  "file" {
    Require ($app.detection.path)         "File detection requires detection.path"
    Require ($app.detection.fileOrFolder) "File detection requires detection.fileOrFolder"
    Require ($app.detection.operator)     "File detection requires detection.operator (exists|versionGreaterThanOrEqual|versionEquals)"
    if ($app.detection.operator -match '^version') {
      Require ($app.detection.version) "File detection with version operator requires detection.version"
    }
  }
  default {
    throw "Unsupported detection.type: $($app.detection.type) (allowed: msi|registry|file)"
  }
}

# --- Repo structure checks (fast fail) ---
Require (Exists $PsadtDir) "Missing PSADT directory: $PsadtDir (expected extracted Template_v4 contents here)"
Require (Exists (Join-Path $PsadtDir "Invoke-AppDeployToolkit.exe")) "Missing $PsadtDir\Invoke-AppDeployToolkit.exe"
Require (Exists (Join-Path $PsadtDir "Invoke-AppDeployToolkit.ps1")) "Missing $PsadtDir\Invoke-AppDeployToolkit.ps1"

Require (Exists $SrcDir) "Missing src directory: $SrcDir"
Require (Exists (Join-Path $SrcDir "Files")) "Missing src\Files (installer payload folder)"

$intuneUtil = Join-Path $ToolsDir "IntuneWinAppUtil.exe"
Require (Exists $intuneUtil) "Missing tools\IntuneWinAppUtil.exe"

Write-Host "✅ validate-appjson OK: $($app.name) $($app.version)" -ForegroundColor Green