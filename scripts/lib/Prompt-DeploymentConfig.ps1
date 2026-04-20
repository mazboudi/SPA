<#
.SYNOPSIS
  Interactive prompts for Intune deployment configuration.
  Returns a hashtable with all Intune app settings.

.DESCRIPTION
  Captures the full set of Intune Win32 app properties that go into
  intune/app.json, intune/dependencies.json, and related files.

.PARAMETER DisplayName
  Pre-filled display name.

.PARAMETER Publisher
  Pre-filled publisher.

.PARAMETER Version
  Pre-filled version string.

.PARAMETER RestartBehavior
  Pre-filled restart behavior from earlier prompts (if any).

.OUTPUTS
  Hashtable with Intune configuration properties.
#>
function Invoke-DeploymentConfigPrompts {
    [CmdletBinding()]
    param(
        [string] $DisplayName = '',
        [string] $Publisher = '',
        [string] $Version = '',
        [string] $RestartBehavior = 'suppress'
    )

    function Read-OptionalInput {
        param(
            [string] $Prompt,
            [string] $Default = ''
        )
        $todoHint = ' — [T] for TODO, Enter to skip'
        $suffix = if ($Default) { " (default: $Default)$todoHint" } else { $todoHint }
        $value = Read-Host "$Prompt$suffix"
        if ([string]::IsNullOrWhiteSpace($value) -and $Default) { return $Default }
        if ([string]::IsNullOrWhiteSpace($value)) { return '' }
        $trimmed = $value.Trim()
        if ($trimmed -in @('t','T','todo','TODO')) {
            $marker = "TODO: $Prompt"
            Write-Host "  ⏳ Marked as: $marker" -ForegroundColor Yellow
            return $marker
        }
        return $trimmed
    }

    function Show-ChoiceMenu {
        param(
            [string]   $Title,
            [string[]] $Options,
            [string]   $Default = ''
        )
        Write-Host ""
        Write-Host "${Title}" -ForegroundColor Cyan
        for ($i = 0; $i -lt $Options.Count; $i++) {
            $marker = if ($Options[$i] -eq $Default) { ' (default)' } else { '' }
            Write-Host "  [$($i + 1)] $($Options[$i])$marker"
        }
        $raw = Read-Host "Enter number"
        if ([string]::IsNullOrWhiteSpace($raw)) {
            return $(if ($Default) { $Default } else { $Options[0] })
        }
        $idx = [int]$raw - 1
        if ($idx -ge 0 -and $idx -lt $Options.Count) { return $Options[$idx] }
        return $(if ($Default) { $Default } else { $Options[0] })
    }

    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Yellow
    Write-Host "║  INTUNE DEPLOYMENT CONFIGURATION             ║" -ForegroundColor Yellow
    Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Yellow

    # ── App metadata ──────────────────────────────────────────────────────────
    Write-Host ""
    Write-Host "── App Metadata ──" -ForegroundColor DarkCyan

    $description = Read-OptionalInput "App description" -Default "TODO: Add application description."
    $infoUrl     = Read-OptionalInput "Information URL (press Enter to skip)"
    $privacyUrl  = Read-OptionalInput "Privacy URL (press Enter to skip)"
    $owner       = Read-OptionalInput "App owner" -Default 'EUC Packaging'
    $notes       = Read-OptionalInput "Notes" -Default 'Managed by SPA pipeline.'

    # ── Install context ───────────────────────────────────────────────────────
    $installContext = Show-ChoiceMenu -Title "Install context:" -Options @(
        'system', 'user'
    ) -Default 'system'

    # ── Featured ──────────────────────────────────────────────────────────────
    Write-Host ""
    $featuredChoice = Read-Host "Featured app in Company Portal? (y/N)"
    $isFeatured = ($featuredChoice -in @('y', 'Y', 'yes'))

    # ── Restart override ──────────────────────────────────────────────────────
    if (-not $RestartBehavior -or $RestartBehavior -eq 'suppress') {
        $RestartBehavior = Show-ChoiceMenu -Title "Device restart behavior:" -Options @(
            'suppress', 'allow', 'basedOnReturnCode', 'force'
        ) -Default 'suppress'
    } else {
        Write-Host ""
        Write-Host "  Restart behavior: $RestartBehavior (from packaging prompts)" -ForegroundColor DarkGray
    }

    # ── Scope tags ────────────────────────────────────────────────────────────
    Write-Host ""
    $scopeTagsRaw = Read-Host "Scope tag IDs (comma-separated, press Enter to skip)"
    $scopeTags = @()
    if ($scopeTagsRaw -and $scopeTagsRaw.Trim()) {
        $scopeTags = @($scopeTagsRaw -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    }

    # ── App categories ────────────────────────────────────────────────────────
    Write-Host ""
    $categoriesRaw = Read-Host "Intune app category IDs (comma-separated, press Enter to skip)"
    $categories = @()
    if ($categoriesRaw -and $categoriesRaw.Trim()) {
        $categories = @($categoriesRaw -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    }

    # ── Dependencies ──────────────────────────────────────────────────────────
    Write-Host ""
    Write-Host "── Dependencies ──" -ForegroundColor DarkCyan
    $dependencies = @()
    $addMore = $true
    $depInput = Read-Host "Dependency Intune App ID (press Enter to skip)"
    while ($depInput -and $depInput.Trim() -and $addMore) {
        $depType = Show-ChoiceMenu -Title "  Dependency type:" -Options @(
            'autoInstall', 'detect'
        ) -Default 'autoInstall'
        $dependencies += @{
            AppId = $depInput.Trim()
            DependencyType = $depType
        }
        $depInput = Read-Host "Another dependency App ID (press Enter to finish)"
        if ([string]::IsNullOrWhiteSpace($depInput)) { $addMore = $false }
    }

    # ── Assignments overview ──────────────────────────────────────────────────
    Write-Host ""
    Write-Host "── Assignments ──" -ForegroundColor DarkCyan
    $assignments = @()
    $addMore = $true
    $groupInput = Read-Host "Entra ID Group Object ID for assignment (press Enter to skip)"
    while ($groupInput -and $groupInput.Trim() -and $addMore) {
        $intent = Show-ChoiceMenu -Title "  Assignment intent:" -Options @(
            'available', 'required', 'uninstall'
        ) -Default 'available'
        $filterMode = Show-ChoiceMenu -Title "  Filter mode:" -Options @(
            'none', 'include', 'exclude'
        ) -Default 'none'
        $filterId = ''
        if ($filterMode -ne 'none') {
            $filterId = Read-OptionalInput "  Filter ID"
        }
        $assignments += @{
            GroupId    = $groupInput.Trim()
            Intent     = $intent
            FilterMode = $filterMode
            FilterId   = $filterId
        }
        $groupInput = Read-Host "Another Group ID (press Enter to finish)"
        if ([string]::IsNullOrWhiteSpace($groupInput)) { $addMore = $false }
    }
    # Default placeholder if none provided
    if ($assignments.Count -eq 0) {
        $assignments += @{
            GroupId    = 'TODO-ENTRA-ID-GROUP-OBJECT-ID'
            Intent     = 'available'
            FilterMode = 'none'
            FilterId   = ''
        }
    }

    # ── Build result ──────────────────────────────────────────────────────────
    return @{
        Description      = $description
        InformationUrl   = $infoUrl
        PrivacyUrl       = $privacyUrl
        Owner            = $owner
        Notes            = $notes
        InstallContext   = $installContext
        IsFeatured       = $isFeatured
        RestartBehavior  = $RestartBehavior
        ScopeTags        = $scopeTags
        Categories       = $categories
        Dependencies     = $dependencies
        Assignments      = $assignments
    }
}
