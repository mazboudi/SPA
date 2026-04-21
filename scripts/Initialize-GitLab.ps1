<#
.SYNOPSIS
  Initializes a GitLab project for this title, commits all files, and pushes.

.DESCRIPTION
  Run this script from within the scaffolded title directory after filling
  in all TODO placeholders. It will:
    1. Read app.json to get title metadata
    2. Resolve (or create) the GitLab subgroup chain
    3. Create the GitLab project
    4. Initialize git, commit all files, push to main
    5. Optionally tag the initial version and push the tag (triggers pipeline)

  Prerequisites:
    - Set the GITLAB_TOKEN environment variable with a PAT that has 'api' scope.
    - Git credentials must be pre-configured (credential helper, SSH key,
      or git-credential-store). The script does NOT inject tokens into URLs.

.PARAMETER GitLabUrl
  GitLab instance base URL. Defaults to "https://gitlab.onefiserv.net".

.PARAMETER GitLabGroup
  Root GitLab group. Defaults to "euc/software-package-automation".

.PARAMETER Category
  Subgroup category. If not specified, reads from the directory structure
  or prompts interactively.

.PARAMETER Tag
  If specified, creates and pushes the initial version tag after the push.
  Omit this flag to push code only (useful for testing before triggering
  the pipeline).

.EXAMPLE
  pwsh -File Initialize-GitLab.ps1

.EXAMPLE
  pwsh -File Initialize-GitLab.ps1 -Category "utilities" -Tag
#>
[CmdletBinding()]
param(
    [string] $GitLabUrl     = 'https://gitlab.onefiserv.net',
    [string] $GitLabGroup   = 'euc/software-package-automation',
    [string] $Category      = '',
    [switch] $Tag
)

$ErrorActionPreference = 'Stop'
$gitLabApiBase = "$GitLabUrl/api/v4"

# ══════════════════════════════════════════════════════════════════════════════
#  VALIDATE
# ══════════════════════════════════════════════════════════════════════════════
$GitLabToken = $env:GITLAB_TOKEN
if (-not $GitLabToken) {
    throw "GITLAB_TOKEN environment variable is not set. Set it to a PAT with 'api' scope."
}

$appJsonPath = Join-Path $PSScriptRoot 'app.json'
if (!(Test-Path $appJsonPath)) {
    throw "app.json not found in $PSScriptRoot. Run this script from inside the title directory."
}

# ── Read app.json ─────────────────────────────────────────────────────────────
$app = Get-Content $appJsonPath -Raw | ConvertFrom-Json
$packageId   = $app.package_id
$displayName = $app.title
$publisher   = $app.publisher
$version     = $app.version

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Initialize GitLab — $displayName v$version" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ── Check for remaining TODOs ─────────────────────────────────────────────────
$todoFiles = Get-ChildItem -Path $PSScriptRoot -Recurse -File |
    Where-Object { $_.Name -ne 'Initialize-GitLab.ps1' } |
    Where-Object { (Get-Content $_.FullName -Raw) -match 'TODO' }

if ($todoFiles) {
    Write-Host "⚠  The following files still contain TODO placeholders:" -ForegroundColor Yellow
    foreach ($f in $todoFiles) {
        $rel = $f.FullName.Replace($PSScriptRoot + [IO.Path]::DirectorySeparatorChar, '')
        $count = (Select-String -Path $f.FullName -Pattern 'TODO' -AllMatches | 
                  Measure-Object).Count
        Write-Host "   $rel ($count TODOs)" -ForegroundColor Yellow
    }
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -notin @('y', 'Y', 'yes')) {
        Write-Host "Aborted. Fill in the TODOs first." -ForegroundColor Red
        exit 1
    }
}

# ── Resolve category ──────────────────────────────────────────────────────────
if (-not $Category) {
    $categories = @(
        'browsers', 'productivity', 'developer-tools', 'security',
        'communication', 'utilities', 'endpoint-management', 'custom'
    )
    Write-Host "Select a category:" -ForegroundColor Cyan
    for ($i = 0; $i -lt $categories.Count; $i++) {
        Write-Host "  [$($i + 1)] $($categories[$i])"
    }
    do {
        $choice = Read-Host "Enter number (1-$($categories.Count))"
        $idx = [int]$choice - 1
    } while ($idx -lt 0 -or $idx -ge $categories.Count)
    $Category = $categories[$idx]
    Write-Host "  → $Category" -ForegroundColor Green
}

$gitLabProjectPath = "$GitLabGroup/software-titles/$Category/$packageId"
Write-Host ""
Write-Host "Project path: $gitLabProjectPath" -ForegroundColor DarkCyan

# ══════════════════════════════════════════════════════════════════════════════
#  GITLAB API HELPERS
# ══════════════════════════════════════════════════════════════════════════════
function Invoke-GitLabApi {
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
    param(
        [Parameter(Mandatory)] [string] $FullPath
    )
    $segments    = $FullPath -split '/'
    $currentPath = ''
    $parentId    = $null

    foreach ($segment in $segments) {
        $currentPath = if ($currentPath) { "$currentPath/$segment" } else { $segment }
        $encoded     = [System.Uri]::EscapeDataString($currentPath)

        $group = Invoke-GitLabApi -Method GET -Endpoint "/groups/$encoded" -AllowNotFound

        if ($group) {
            $parentId = $group.id
            Write-Host "  ✓ Group exists: $currentPath (id: $parentId)" -ForegroundColor DarkGray
        } else {
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

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 1: Resolve namespace
# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "[1/4] Resolving namespace..." -ForegroundColor Cyan
$namespacePath = "$GitLabGroup/software-titles/$Category"
$namespaceId   = Resolve-GitLabNamespace -FullPath $namespacePath

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 2: Create project
# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "[2/4] Creating GitLab project..." -ForegroundColor Cyan

$encodedPath = [System.Uri]::EscapeDataString($gitLabProjectPath)
$existing    = Invoke-GitLabApi -Method GET -Endpoint "/projects/$encodedPath" -AllowNotFound

if ($existing) {
    Write-Host "  ⚠ Project already exists: $($existing.web_url)" -ForegroundColor Yellow
    $projectUrl    = $existing.web_url
    $httpUrlToRepo = $existing.http_url_to_repo
} else {
    $projectBody = @{
        name                   = $packageId
        path                   = $packageId
        namespace_id           = $namespaceId
        visibility             = 'private'
        initialize_with_readme = $false
        description            = "SPA title: $displayName ($publisher) — managed by the packaging factory."
        default_branch         = 'main'
    }
    $project = Invoke-GitLabApi -Method POST -Endpoint '/projects' -Body $projectBody
    $projectUrl    = $project.web_url
    $httpUrlToRepo = $project.http_url_to_repo
    Write-Host "  ✓ Project created: $projectUrl" -ForegroundColor Green
}

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 3: Git init, commit, push
# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "[3/4] Initializing git and pushing..." -ForegroundColor Cyan

$origLocation = Get-Location
try {
    Set-Location $PSScriptRoot

    # Use the plain HTTP URL — git credentials must be pre-configured
    $remoteUrl = $httpUrlToRepo

    # Check if already a git repo
    $isGitRepo = Test-Path (Join-Path $PSScriptRoot '.git')
    
    if (-not $isGitRepo) {
        & git init -b main 2>&1 | Out-Null
    }

    & git add -A 2>&1 | Out-Null
    & git commit -m "feat: scaffold $displayName $version" 2>&1 | Out-Null

    # Set or update remote
    $remoteExists = & git remote 2>&1 | Where-Object { $_ -eq 'origin' }
    if ($remoteExists) {
        & git remote set-url origin $remoteUrl 2>&1 | Out-Null
    } else {
        & git remote add origin $remoteUrl 2>&1 | Out-Null
    }

    Write-Host "  Pushing to origin/main..." -ForegroundColor DarkCyan
    $pushOutput = & git push -u origin main 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Git push failed: $pushOutput"
    } else {
        Write-Host "  ✓ Pushed to: $projectUrl" -ForegroundColor Green
    }

} finally {
    Set-Location $origLocation
}

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 4: Tag and push (optional — triggers pipeline)
# ══════════════════════════════════════════════════════════════════════════════
if ($Tag) {
    Write-Host ""
    Write-Host "[4/4] Tagging initial version..." -ForegroundColor Cyan

    $origLocation = Get-Location
    try {
        Set-Location $PSScriptRoot

        $tagName = "v$version-1"
        & git tag $tagName 2>&1 | Out-Null
        $tagOutput = & git push origin $tagName 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Tag push failed: $tagOutput"
        } else {
            Write-Host "  ✓ Tagged: $tagName (pipeline will trigger)" -ForegroundColor Green
        }
    } finally {
        Set-Location $origLocation
    }
} else {
    Write-Host ""
    Write-Host "[4/4] Skipping tag (pass -Tag when ready to trigger the pipeline)" -ForegroundColor DarkGray
    Write-Host "      To tag later: git tag v$version-1 && git push origin v$version-1" -ForegroundColor DarkGray
}

# ══════════════════════════════════════════════════════════════════════════════
#  DONE
# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✓ Done! Project is live at:" -ForegroundColor Green
Write-Host "  $projectUrl" -ForegroundColor White
Write-Host "" 
Write-Host "  CI/CD variables are inherited from the software-titles group." -ForegroundColor DarkGray
if (-not $Tag) {
    Write-Host "  Run with -Tag when ready to trigger the build pipeline." -ForegroundColor DarkGray
} else {
    Write-Host "  The pipeline will trigger automatically from the tag push." -ForegroundColor DarkGray
}
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
