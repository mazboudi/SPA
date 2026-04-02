<#
.SYNOPSIS
  Creates a new versioned release of psadt-enterprise and publishes the bundle
  to the GitLab Package Registry.

.DESCRIPTION
  1. Validates the target version directory exists.
  2. Calls build-framework-bundle.ps1 to produce the zip artifact.
  3. Uploads the zip to the GitLab Package Registry (generic packages API).
  4. Creates a GitLab release entry linking to the uploaded asset.

.PARAMETER Version
  Framework version to release (e.g. '4.1.0').

.PARAMETER GitLabApiUrl
  GitLab API base URL (e.g. 'https://gitlab.onefiserv.net/api/v4').

.PARAMETER ProjectId
  GitLab project ID (numeric) for this repo.

.PARAMETER PrivateToken
  GitLab personal/project access token with api scope.
  Defaults to $env:GITLAB_RELEASE_TOKEN.

.EXAMPLE
  pwsh -File scripts/New-FrameworkRelease.ps1 -Version 4.1.0 `
       -GitLabApiUrl https://gitlab.onefiserv.net/api/v4 -ProjectId 42
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $Version,
    [Parameter(Mandatory)] [string] $GitLabApiUrl,
    [Parameter(Mandatory)] [string] $ProjectId,
    [string] $PrivateToken = $env:GITLAB_RELEASE_TOKEN
)

$ErrorActionPreference = 'Stop'

if (-not $PrivateToken) { throw 'GITLAB_RELEASE_TOKEN is not set.' }

$headers = @{ 'PRIVATE-TOKEN' = $PrivateToken }

# Step 1 — Build the bundle
Write-Host "Building bundle for version $Version..." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'build-framework-bundle.ps1') -Version $Version

$bundleEnv = @{}
Get-Content (Join-Path 'dist' 'bundle.env') | ForEach-Object {
    if ($_ -match '^\s*([^=]+)=(.*)$') {
        $bundleEnv[$matches[1]] = $matches[2]
    }
}
$bundlePath = $bundleEnv['BUNDLE_PATH']
$bundleName = Split-Path $bundlePath -Leaf

# Step 2 — Upload to GitLab Package Registry (generic packages)
Write-Host "Uploading $bundleName to Package Registry..." -ForegroundColor Cyan
$uploadUri = "$GitLabApiUrl/projects/$ProjectId/packages/generic/psadt-enterprise/$Version/$bundleName"
Invoke-RestMethod -Method Put -Uri $uploadUri -Headers $headers `
    -InFile $bundlePath -ContentType 'application/octet-stream'
Write-Host "Upload complete: $uploadUri" -ForegroundColor Green

# Step 3 — Create GitLab Release
$tagName = "v$Version"
$releaseBody = @{
    name        = "psadt-enterprise v$Version"
    tag_name    = $tagName
    description = "psadt-enterprise framework bundle v$Version"
    assets      = @{
        links = @(
            @{
                name     = $bundleName
                url      = $uploadUri
                link_type = 'package'
            }
        )
    }
} | ConvertTo-Json -Depth 10

Write-Host "Creating GitLab release $tagName..." -ForegroundColor Cyan
$releaseUri = "$GitLabApiUrl/projects/$ProjectId/releases"
try {
    Invoke-RestMethod -Method Post -Uri $releaseUri -Headers $headers `
        -Body $releaseBody -ContentType 'application/json'
    Write-Host "Release created: $tagName" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Warning "Release $tagName already exists — skipping creation."
    } else { throw }
}
