<#
.SYNOPSIS
  Stages PSADT v4 template + src overlays into a temp folder, then builds an .intunewin
  Output: out/<name>_<version>.intunewin

.EXAMPLE
  pwsh -File pipeline/build-intunewin.ps1
#>

[CmdletBinding()]
param(
  [string] $AppJsonPath  = "app.json",
  [string] $PsadtDir     = "psadt",
  [string] $SrcDir       = "src",
  [string] $ToolsDir     = "tools",
  [string] $OutDir       = "out",
  [string] $SetupFile    = "Invoke-AppDeployToolkit.exe",
  [switch] $CleanOut
)

$ErrorActionPreference = "Stop"

function Ensure-Dir([string] $Path) {
  if (!(Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Copy-Tree {
  param(
    [Parameter(Mandatory)] [string] $From,
    [Parameter(Mandatory)] [string] $To
  )
  if (!(Test-Path $From)) { return }
  Ensure-Dir $To
  Copy-Item -Path (Join-Path $From "*") -Destination $To -Recurse -Force
}

function Copy-FileIfExists {
  param(
    [Parameter(Mandatory)] [string] $From,
    [Parameter(Mandatory)] [string] $To
  )
  if (Test-Path $From) {
    Ensure-Dir (Split-Path $To -Parent)
    Copy-Item -Path $From -Destination $To -Force
  }
}

function Sanitize-FileName([string] $s) {
  # replace invalid filename chars with underscore
  $invalid = [System.IO.Path]::GetInvalidFileNameChars()
  foreach ($c in $invalid) {
    $s = $s.Replace($c, '_')
  }
  # also reduce whitespace
  return ($s -replace '\s+', '_')
}

# --- Preconditions ---
if (!(Test-Path $AppJsonPath)) { throw "Missing $AppJsonPath" }
if (!(Test-Path $PsadtDir))    { throw "Missing PSADT directory: $PsadtDir (expected extracted Template_v4 contents here)" }
if (!(Test-Path $SrcDir))      { throw "Missing src directory: $SrcDir" }

$intuneUtil = Join-Path $ToolsDir "IntuneWinAppUtil.exe"
if (!(Test-Path $intuneUtil))  { throw "Missing IntuneWinAppUtil.exe at: $intuneUtil" }

# Read app metadata
$app = Get-Content $AppJsonPath -Raw | ConvertFrom-Json
if (-not $app.name -or -not $app.version) { throw "app.json must include 'name' and 'version'." }

# Prepare output folder
Ensure-Dir $OutDir
if ($CleanOut) {
  Get-ChildItem -Path $OutDir -Filter "*.intunewin" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
}

# Create staging folder
$staging = Join-Path $env:TEMP ("psadt_stage_" + [guid]::NewGuid().ToString())
Ensure-Dir $staging

try {
  # 1) Copy psadt/ root contents into staging root
  Copy-Item -Path (Join-Path $PsadtDir "*") -Destination $staging -Recurse -Force

  # Verify setup file exists after PSADT copy
  $setupPath = Join-Path $staging $SetupFile
  if (!(Test-Path $setupPath)) {
    throw "Setup file '$SetupFile' not found in staging root. Expected: $setupPath"
  }

  # 2) Overlay src content
  Copy-Tree -From (Join-Path $SrcDir "Files")        -To (Join-Path $staging "Files")
  Copy-Tree -From (Join-Path $SrcDir "SupportFiles") -To (Join-Path $staging "SupportFiles")
  Copy-Tree -From (Join-Path $SrcDir "Assets")       -To (Join-Path $staging "Assets")

  # 3) Overlay org defaults (Config/Strings)
  Copy-FileIfExists -From (Join-Path $SrcDir "Config\config.psd1")   -To (Join-Path $staging "Config\config.psd1")
  Copy-FileIfExists -From (Join-Path $SrcDir "Strings\strings.psd1") -To (Join-Path $staging "Strings\strings.psd1")

  # Build with IntuneWinAppUtil
  # -c = source folder (staging)
  # -s = setup file (relative to -c)
  # -o = output folder
  & $intuneUtil -c $staging -s $SetupFile -o (Resolve-Path $OutDir) -q

  # Find produced .intunewin and rename deterministically
  $built = Get-ChildItem -Path $OutDir -Filter "*.intunewin" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $built) { throw "No .intunewin produced in $OutDir" }

  $safeName    = Sanitize-FileName $app.name
  $safeVersion = Sanitize-FileName $app.version
  $targetName  = "${safeName}_${safeVersion}.intunewin"
  $targetPath  = Join-Path $OutDir $targetName

  Move-Item -Path $built.FullName -Destination $targetPath -Force

  Write-Host "✅ Built: $targetPath" -ForegroundColor Green

  # Helpful for GitLab dotenv / downstream jobs
  # (If you want: add artifacts:reports:dotenv in .gitlab-ci.yml)
  "INTUNEWIN_PATH=$targetPath" | Out-File -FilePath (Join-Path $OutDir "build.env") -Encoding ascii -Force

} finally {
  # Clean staging
  if (Test-Path $staging) {
    Remove-Item -Path $staging -Recurse -Force -ErrorAction SilentlyContinue
  }
}