<#
.SYNOPSIS
  Uploads a new content version to an existing Win32 LOB app in Intune.

.DESCRIPTION
  Finds an existing app by displayName, then uploads a new .intunewin binary
  as a new content version. Useful when the app metadata hasn't changed but
  the installer has been updated (packaging_version bump).

.PARAMETER IntuneWinPath
  Path to the new .intunewin artifact.

.PARAMETER AppJsonPath
  Path to windows/intune/app.json (for displayName lookup).

.PARAMETER TenantId / ClientId / ClientSecret
  Graph API credentials.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $IntuneWinPath,
    [Parameter(Mandatory)] [string] $TenantId,
    [Parameter(Mandatory)] [string] $ClientId,
    [Parameter(Mandatory)] [string] $ClientSecret,
    [string] $AppJsonPath = 'windows/intune/app.json'
)

$ErrorActionPreference = 'Stop'

Write-Host "Update-Win32App: delegating to Publish-Win32App.ps1 (upsert behaviour)..." -ForegroundColor Cyan

# Publish-Win32App already handles create-or-update by checking for existing app.
# We delegate entirely to it to avoid code duplication.
$publishScript = Join-Path $PSScriptRoot 'Publish-Win32App.ps1'

& $publishScript `
    -IntuneWinPath   $IntuneWinPath `
    -AppJsonPath     $AppJsonPath `
    -TenantId        $TenantId `
    -ClientId        $ClientId `
    -ClientSecret    $ClientSecret

Write-Host "✅ Update complete." -ForegroundColor Green
