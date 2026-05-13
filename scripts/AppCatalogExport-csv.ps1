<#
.SYNOPSIS
Export Intune Applications (Win32 program/requirements/detection, relationships, scope tags, assignments)
+ Full JSON bundle per app.

FEATURES
- App selection modes:
  * All apps (default)
  * Limit (interactive prompt or -Limit)
  * CatalogOnly (-CatalogOnly)
  * CSV-driven by AppId (-AppIdCsv)  <-- NEW

OUTPUT
  1) Apps summary CSV
  2) Assignments CSV
  3) One JSON bundle per app (App + Assignments + Relationships + ScopeTagsResolved + optional counts)

SECURITY
- Provide client secret via environment variable GRAPH_CLIENT_SECRET (recommended)
  Example:
    $env:GRAPH_CLIENT_SECRET = "xxxx"
    .\AppCatalogExport-csv.ps1 -TenantId "..." -ClientId "..."
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$TenantId,

    [Parameter(Mandatory=$true)]
    [string]$ClientId,

    # Prefer env var; you may pass explicitly but do NOT hardcode in script.
    [Parameter(Mandatory=$false)]
    [string]$ClientSecret = $env:GRAPH_CLIENT_SECRET,

    [Parameter(Mandatory=$false)]
    #[string]$OutputRoot = ".\Intune_App_Export",
    [string]$OutputRoot = "C:\Users\F7NXPWL\EUC\software-packaging-automation\software-titles\RefactorList-Intune",
    

    # Optional non-interactive limit. If omitted or 0, script will prompt (unless -AppIdCsv is used).
    [Parameter(Mandatory=$false)]
    [int]$Limit = 0, # 0 = prompt / ALL

    [Parameter(Mandatory=$false)]
    [switch]$CatalogOnly, # include only win32CatalogApp (published from enterprise app catalog)

    # NEW: CSV containing AppId column. If provided, ONLY these apps are processed.
    [Parameter(Mandatory=$false)]
    [ValidateScript({ Test-Path $_ })]
    [string]$AppIdCsv,

    [Parameter(Mandatory=$false)]
    [switch]$IncludeDeviceCounts,

    [Parameter(Mandatory=$false)]
    [int]$ReportDelaySeconds = 0,

    [Parameter(Mandatory=$false)]
    [int]$JsonDepth = 40,

    [Parameter(Mandatory=$false)]
    [int]$MaxRetries = 8
)


# ----------------------------
# Prompt for CSV if not supplied
# ----------------------------
if (-not $AppIdCsv) {
    Write-Host "`nDo you want to process only specific apps from a CSV file?" -ForegroundColor Cyan
    $resp = Read-Host "Enter path to CSV (or press ENTER to process all apps)"

    if (-not [string]::IsNullOrWhiteSpace($resp)) {
        if (-not (Test-Path $resp)) {
            throw "CSV file not found: $resp"
        }
        $AppIdCsv = $resp
        Write-Host "✅ Using AppId CSV: $AppIdCsv" -ForegroundColor Green
    }
}

# ----------------------------
# Output paths
# ----------------------------
$timestamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
$OutDir = Join-Path $OutputRoot $timestamp

$AppsCsvPath        = Join-Path $OutDir "Intune_Apps.csv"
$AssignmentsCsvPath = Join-Path $OutDir "Intune_App_Assignments.csv"
$JsonDir            = Join-Path $OutDir "Apps_JSON"

New-Item -ItemType Directory -Path $OutDir  -Force | Out-Null
New-Item -ItemType Directory -Path $JsonDir -Force | Out-Null

# ----------------------------
# Validate secret
# ----------------------------
if ([string]::IsNullOrWhiteSpace($ClientSecret)) {
    throw "ClientSecret not provided. Set `$env:GRAPH_CLIENT_SECRET or pass -ClientSecret (not recommended)."
}

# ----------------------------
# Auth
# ----------------------------
Write-Host "🔐 Authenticating to Microsoft Graph..." -ForegroundColor Cyan

$token = Invoke-RestMethod `
    -Method POST `
    -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" `
    -Body @{
        grant_type    = "client_credentials"
        client_id     = $ClientId
        client_secret = $ClientSecret
        scope         = "https://graph.microsoft.com/.default"
    } `
    -ContentType "application/x-www-form-urlencoded"

$Headers = @{
    Authorization  = "Bearer $($token.access_token)"
    "Content-Type" = "application/json"
    Accept         = "application/json"
}

# ----------------------------
# Helpers
# ----------------------------
function Invoke-GraphRequest {
    param(
        [Parameter(Mandatory=$true)][ValidateSet("GET","POST","PATCH","PUT","DELETE")]
        [string]$Method,
        [Parameter(Mandatory=$true)]
        [string]$Uri,
        [Parameter(Mandatory=$false)]
        $Body = $null
    )

    $attempt = 0
    while ($true) {
        $attempt++
        try {
            if ($null -ne $Body) {
                $json = $Body | ConvertTo-Json -Depth $JsonDepth
                return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers -Body $json
            } else {
                return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers
            }
        }
        catch {
            $resp = $_.Exception.Response
            $statusCode = $null
            $retryAfter = $null

            if ($resp -and $resp.StatusCode) {
                $statusCode = [int]$resp.StatusCode
                try { $retryAfter = $resp.Headers["Retry-After"] } catch {}
            }

            $isThrottle = ($statusCode -eq 429 -or $statusCode -eq 503 -or $statusCode -eq 504)

            if ($isThrottle -and $attempt -le $MaxRetries) {
                $sleep = 0
                if ($retryAfter) { [int]::TryParse($retryAfter, [ref]$sleep) | Out-Null }
                if ($sleep -le 0) {
                    $sleep = [Math]::Min(60, [Math]::Pow(2, [Math]::Min(6,$attempt))) + (Get-Random -Minimum 0 -Maximum 3)
                }
                Write-Host "⏳ Throttled/Transient ($statusCode). Retry $attempt/$MaxRetries in $sleep sec: $Uri" -ForegroundColor Yellow
                Start-Sleep -Seconds $sleep
                continue
            }

            Write-Host "❌ Graph call failed: $Method $Uri" -ForegroundColor Red
            throw
        }
    }
}

function Get-AllPages {
    param([string]$FirstUri)

    $all = @()
    $uri = $FirstUri
    $page = 1

    while ($uri) {
        Write-Progress -Activity "Downloading results" -Status "Page $page" -PercentComplete 0
        $r = Invoke-GraphRequest -Method GET -Uri $uri
        if ($r.value) { $all += $r.value }
        $uri = $r.'@odata.nextLink'
        $page++
    }

    Write-Progress -Activity "Downloading results" -Completed
    return $all
}

function ConvertTo-SafeFileName {
    param([string]$Name)

    if ([string]::IsNullOrWhiteSpace($Name)) { return "unknown" }
    $invalid = [System.IO.Path]::GetInvalidFileNameChars()
    foreach ($c in $invalid) { $Name = $Name.Replace($c, '_') }
    if ($Name.Length -gt 120) { $Name = $Name.Substring(0,120) }
    return $Name.Trim()
}

# Group lookup cache
$groupLookup = @{}
function Get-GroupName {
    param([string]$Id)
    if ([string]::IsNullOrWhiteSpace($Id)) { return $null }
    if ($groupLookup.ContainsKey($Id)) { return $groupLookup[$Id] }

    try {
        $g = Invoke-GraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/groups/$Id"
        $groupLookup[$Id] = $g.displayName
        return $g.displayName
    } catch {
        $groupLookup[$Id] = "NOT FOUND"
        return "NOT FOUND"
    }
}

# ----------------------------
# Scope Tags: robust resolution (non-fatal)
# ----------------------------
$scopeTagLookup = @{}
$ScopeTagResolutionMode = "Unknown" # will become: Action, Prefetch, Disabled

function Initialize-ScopeTagsPrefetch {
    try {
        $tags = Get-AllPages -FirstUri "https://graph.microsoft.com/beta/deviceManagement/roleScopeTags"
        foreach ($t in $tags) {
            if ($t.id -and -not $scopeTagLookup.ContainsKey($t.id)) {
                $scopeTagLookup[$t.id] = $t.displayName
            }
        }
        $script:ScopeTagResolutionMode = "Prefetch"
        Write-Host "🏷️ Scope tags prefetched via GET /deviceManagement/roleScopeTags" -ForegroundColor DarkCyan
        return $true
    } catch {
        return $false
    }
}

function Get-ScopeTagNames {
    param([string[]]$RoleScopeTagIds)

    if (-not $RoleScopeTagIds -or $RoleScopeTagIds.Count -eq 0) { return $null }

    $missing = @()
    foreach ($id in $RoleScopeTagIds) {
        if (-not $scopeTagLookup.ContainsKey($id)) { $missing += $id }
    }

    if ($missing.Count -gt 0) {
        try {
            $resp = Invoke-GraphRequest -Method POST -Uri "https://graph.microsoft.com/beta/deviceManagement/roleScopeTags/getRoleScopeTagsById" -Body @{
                roleScopeTagIds = $missing
            }
            foreach ($t in $resp.value) { $scopeTagLookup[$t.id] = $t.displayName }
            foreach ($id in $missing) {
                if (-not $scopeTagLookup.ContainsKey($id)) { $scopeTagLookup[$id] = "NOT FOUND" }
            }
            $script:ScopeTagResolutionMode = "Action"
        }
        catch {
            if ($script:ScopeTagResolutionMode -ne "Prefetch") {
                $ok = Initialize-ScopeTagsPrefetch
                if (-not $ok) {
                    $script:ScopeTagResolutionMode = "Disabled"
                    foreach ($id in $missing) { $scopeTagLookup[$id] = "UNRESOLVED" }
                }
            } else {
                foreach ($id in $missing) { $scopeTagLookup[$id] = "UNRESOLVED" }
            }
        }
    }

    return ($RoleScopeTagIds | ForEach-Object { $scopeTagLookup[$_] }) -join ", "
}

function Get-AppRelationships {
    param([string]$AppId)
    try {
        $rel = Invoke-GraphRequest -Method GET -Uri "https://graph.microsoft.com/beta/deviceAppManagement/mobileApps/$AppId/relationships"
        return @($rel.value)
    } catch {
        return @()
    }
}

function Resolve-EffectiveVersion {
    param($DetectionRules)

    foreach ($rule in $DetectionRules) {
        switch ($rule.'@odata.type') {
            '#microsoft.graph.win32LobAppFileSystemDetection' {
                if ($rule.fileVersion) { return @{ Version=$rule.fileVersion; Source='FileDetection' } }
            }
            '#microsoft.graph.win32LobAppRegistryDetection' {
                if ($rule.comparisonValue) { return @{ Version=$rule.comparisonValue; Source='RegistryDetection' } }
            }
            '#microsoft.graph.win32LobAppProductCodeDetection' {
                if ($rule.productVersion) { return @{ Version=$rule.productVersion; Source='MSIProductVersion' } }
                return @{ Version='MSI'; Source='MSIProductCode' }
            }
            '#microsoft.graph.win32LobAppScriptDetection' {
                return @{ Version='ScriptBased'; Source='ScriptDetection' }
            }
        }
    }
    return @{ Version='Unknown'; Source='None' }
}

function Get-AppDeviceCounts {
    param([string]$AppId)

    try {
        $r = Invoke-GraphRequest -Method POST `
            -Uri "https://graph.microsoft.com/beta/deviceManagement/reports/getAppStatusOverviewReport" `
            -Body @{ filter = "(ApplicationId eq '$AppId')" }

        if (-not $r.Values -or $r.Values.Count -eq 0) {
            return @{ Installed=0; Failed=0; Pending=0; NotInst=0; Total=0 }
        }

        $cols = $r.Schema.Column
        $vals = $r.Values[0]

        $map = @{}
        for ($i = 0; $i -lt $cols.Count; $i++) { $map[$cols[$i]] = $vals[$i] }

        $installed = $map.installedDeviceCount ?? 0
        $failed    = $map.failedDeviceCount ?? 0
        $pending   = $map.pendingInstallDeviceCount ?? 0
        $notInst   = $map.notInstalledDeviceCount ?? 0

        return @{
            Installed = $installed
            Failed    = $failed
            Pending   = $pending
            NotInst   = $notInst
            Total     = ($installed + $failed + $pending + $notInst)
        }
    } catch {
        return @{ Installed=0; Failed=0; Pending=0; NotInst=0; Total=0 }
    }
}

# ----------------------------
# Get apps (paged)
# ----------------------------
Write-Host "`n📦 Retrieving Intune mobileApps..." -ForegroundColor Cyan
$apps = Get-AllPages -FirstUri "https://graph.microsoft.com/beta/deviceAppManagement/mobileApps"
Write-Host "✅ Retrieved $($apps.Count) apps" -ForegroundColor Green

# Build lookup for dependency name resolution
$appLookup = @{}
foreach ($a in $apps) { $appLookup[$a.id] = $a.displayName }

# ----------------------------
# NEW: Optional AppId CSV filter (process ONLY these apps)
# ----------------------------
if ($AppIdCsv) {
    Write-Host "`n📄 AppId CSV provided: $AppIdCsv" -ForegroundColor Cyan

    $csv = Import-Csv $AppIdCsv
    if (-not $csv -or $csv.Count -eq 0) { throw "CSV is empty: $AppIdCsv" }

    # require column AppId
    $props = $csv[0].PSObject.Properties.Name
    $appIdColumn = $props | Where-Object { $_ -match '^AppId$' } | Select-Object -First 1
    if (-not $appIdColumn) { throw "CSV must contain a column named 'AppId'." }

    $csvAppIds = $csv | ForEach-Object { $_.$appIdColumn } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { $_.Trim() } |
        Sort-Object -Unique

    Write-Host "➡️ CSV contains $($csvAppIds.Count) AppId(s)" -ForegroundColor Cyan

    # index all apps by id
    $appsById = @{}
    foreach ($a in $apps) { $appsById[$a.id] = $a }

    $matchedApps = @()
    $missingIds  = @()

    foreach ($id in $csvAppIds) {
        if ($appsById.ContainsKey($id)) {
            $matchedApps += $appsById[$id]
        } else {
            $missingIds += $id
        }
    }

    if ($missingIds.Count -gt 0) {
        Write-Warning "The following AppId(s) were not found in Intune:"
        $missingIds | ForEach-Object { Write-Warning "  $_" }
    }

    if ($matchedApps.Count -eq 0) {
        throw "No AppIds from CSV matched any Intune apps. Aborting."
    }

    # override list with CSV matches (CatalogOnly/Limit prompts become irrelevant)
    $apps = $matchedApps
    Write-Host "✅ CSV selection active: $($apps.Count) app(s) will be processed" -ForegroundColor Green
}
else {
    # Optional filter: catalog-only (only when not using CSV)
    if ($CatalogOnly) {
        $apps = $apps | Where-Object { $_.'@odata.type' -eq '#microsoft.graph.win32CatalogApp' }
        Write-Host "🧾 CatalogOnly enabled: remaining apps = $($apps.Count)" -ForegroundColor Cyan
    }
}

# ----------------------------
# Limit prompt (number or all) - skipped when CSV is used
# ----------------------------
if ($AppIdCsv) {
    $appsToProcess = $apps
} else {
    if ($Limit -le 0) {
        $limitInput = Read-Host "`nEnter number of apps to process or press ENTER for ALL"
        if ([string]::IsNullOrWhiteSpace($limitInput)) {
            $appsToProcess = $apps
            $Limit = 0
        } else {
            $Limit = [int]$limitInput
            $appsToProcess = $apps | Select-Object -First $Limit
        }
    } else {
        $appsToProcess = if ($Limit -gt 0) { $apps | Select-Object -First $Limit } else { $apps }
    }
}

Write-Host "➡️ Processing $($appsToProcess.Count) app(s)" -ForegroundColor Cyan

# ----------------------------
# Process apps
# ----------------------------
Write-Host "`n🛠️ Building app inventory + JSON bundles..." -ForegroundColor Cyan

$appExport = @()
$assignmentExport = @()

$total = $appsToProcess.Count
$i = 0

foreach ($app in $appsToProcess) {
    $i++
    Write-Progress -Activity "Processing apps" -Status "$i / $total : $($app.displayName)" -PercentComplete (($i / $total) * 100)

    # Pull full app details (beta)
    $details = Invoke-GraphRequest -Method GET -Uri "https://graph.microsoft.com/beta/deviceAppManagement/mobileApps/$($app.id)"

    # Relationships
    $relationships = Get-AppRelationships -AppId $app.id

    # Assignments
    $assignments = $null
    try {
        $assignments = Invoke-GraphRequest -Method GET -Uri "https://graph.microsoft.com/beta/deviceAppManagement/mobileApps/$($app.id)/assignments"
    } catch {
        $assignments = @{ value = @() }
    }

    # Scope tags
    $roleScopeTagIds = @()
    if ($details.roleScopeTagIds) { $roleScopeTagIds = @($details.roleScopeTagIds) }
    $roleScopeTagNames = Get-ScopeTagNames -RoleScopeTagIds $roleScopeTagIds

    # Detection + Effective version (Win32)
    $effectiveVersion = $null
    $effectiveVersionSource = $null
    $detectionType = $null
    $detectionRulesJson = $null

    if ($details.detectionRules) {
        $detectionType = ($details.detectionRules | Select-Object -First 1).'@odata.type'
        $ev = Resolve-EffectiveVersion -DetectionRules $details.detectionRules
        $effectiveVersion = $ev.Version
        $effectiveVersionSource = $ev.Source
        $detectionRulesJson = ($details.detectionRules | ConvertTo-Json -Depth $JsonDepth -Compress)
    }

    # Requirements JSON
    $reqObj = [ordered]@{
        minimumSupportedWindowsRelease = $details.minimumSupportedWindowsRelease
        minimumFreeDiskSpaceInMB      = $details.minimumFreeDiskSpaceInMB
        minimumMemoryInMB             = $details.minimumMemoryInMB
        minimumNumberOfProcessors     = $details.minimumNumberOfProcessors
        minimumCpuSpeedInMHz          = $details.minimumCpuSpeedInMHz
        applicableArchitectures       = $details.applicableArchitectures
    }
    $requirementsJson = ($reqObj | ConvertTo-Json -Depth $JsonDepth -Compress)

    # Dependencies + supersedence (best-effort)
    $deps = @($relationships | Where-Object relationshipType -eq "dependency")
    $sup  = @($relationships | Where-Object relationshipType -match "supersed")

    $dependencyNames = $null
    if ($deps.Count -gt 0) { $dependencyNames = ($deps.targetId | ForEach-Object { $appLookup[$_] }) -join ", " }

    $supNames = $null
    if ($sup.Count -gt 0) { $supNames = ($sup.targetId | ForEach-Object { $appLookup[$_] }) -join ", " }

    # Optional device counts
    $counts = @{ Installed=0; Failed=0; Pending=0; NotInst=0; Total=0 }
    if ($IncludeDeviceCounts) {
        $counts = Get-AppDeviceCounts -AppId $app.id
        if ($ReportDelaySeconds -gt 0) { Start-Sleep -Seconds $ReportDelaySeconds }
    }

    # Assignment counters + export
    $reqCount = 0; $availCount = 0; $uninstCount = 0; $totalAssign = 0

    foreach ($a in @($assignments.value)) {
        $totalAssign++
        switch ($a.intent) {
            "required"  { $reqCount++ }
            "available" { $availCount++ }
            "uninstall" { $uninstCount++ }
        }

        $targetType = $a.target.'@odata.type'
        $isExclude  = ($targetType -match "exclusion")

        $assignmentExport += [pscustomobject]@{
            AppId       = $app.id
            DisplayName = $app.displayName
            Intent      = $a.intent
            TargetType  = $targetType
            IncludeExclude = if ($isExclude) { "Exclude" } else { "Include" }
            GroupId     = $a.target.groupId
            GroupName   = Get-GroupName -Id $a.target.groupId

            Notifications = $a.settings.notifications
            DeliveryOptimizationPriority = $a.settings.deliveryOptimizationPriority
            UseLocalTime = $a.settings.installTimeSettings.useLocalTime
            Available    = $a.settings.installTimeSettings.startDateTime
            Deadline     = $a.settings.installTimeSettings.deadlineDateTime
            RestartGracePeriodMins = $a.settings.restartSettings.gracePeriodInMinutes
            RestartCountdownMins   = $a.settings.restartSettings.countdownDisplayBeforeRestartInMinutes
            RestartSnoozeMins      = $a.settings.restartSettings.restartNotificationSnoozeDurationInMinutes
            AutoUpdateSupersededAppsState = $a.settings.autoUpdateSettings.autoUpdateSupersededAppsState

            AssignmentSettingsJson = if ($a.settings) { ($a.settings | ConvertTo-Json -Depth $JsonDepth -Compress) } else { $null }
        }
    }

    # Build summary row
    $row = [pscustomobject]@{
        AppId        = $details.id
        DisplayName  = $details.displayName
        Publisher    = $details.publisher
        AppType      = $details.'@odata.type'
        Created      = $details.createdDateTime
        Modified     = $details.lastModifiedDateTime
        Owner        = $details.owner
        Developer    = $details.developer
        Notes        = $details.notes
        Description  = ($details.description -replace "`r|`n"," ")

        ScopeTagResolutionMode = $ScopeTagResolutionMode
        RoleScopeTagIds   = ($roleScopeTagIds -join ", ")
        RoleScopeTagNames = $roleScopeTagNames

        InstallCommandLine   = $details.installCommandLine
        UninstallCommandLine = $details.uninstallCommandLine
        InstallExperienceJson = if ($details.installExperience) { ($details.installExperience | ConvertTo-Json -Depth $JsonDepth -Compress) } else { $null }
        ReturnCodesJson       = if ($details.returnCodes)       { ($details.returnCodes       | ConvertTo-Json -Depth $JsonDepth -Compress) } else { $null }

        MinimumWindowsRelease    = $details.minimumSupportedWindowsRelease
        RequirementsJson         = $requirementsJson
        DetectionType            = $detectionType
        EffectiveVersion         = $effectiveVersion
        EffectiveVersionSource   = $effectiveVersionSource
        DetectionRulesJson       = $detectionRulesJson

        DependencyCount      = $deps.Count
        DependencyNames      = $dependencyNames
        SupersedenceCount    = $sup.Count
        SupersedenceNames    = $supNames
        RelationshipsJson    = if ($relationships) { ($relationships | ConvertTo-Json -Depth $JsonDepth -Compress) } else { $null }

        RequiredAssignmentCount  = $reqCount
        AvailableAssignmentCount = $availCount
        UninstallAssignmentCount = $uninstCount
        TotalAssignmentCount     = $totalAssign

        InstalledDevices = $counts.Installed
        FailedDevices    = $counts.Failed
        PendingDevices   = $counts.Pending
        NotInstalledDevices = $counts.NotInst
        TotalDevices     = $counts.Total
    }

    $appExport += $row

    # Full JSON bundle per app
    $bundle = [ordered]@{
        exportGeneratedOn = (Get-Date).ToString("o")
        appId             = $details.id
        displayName       = $details.displayName
        odataType         = $details.'@odata.type'
        scopeTagResolutionMode = $ScopeTagResolutionMode
        roleScopeTags     = @{
            roleScopeTagIds   = $roleScopeTagIds
            roleScopeTagNames = if ($roleScopeTagNames) { $roleScopeTagNames -split ",\s*" } else { @() }
        }
        app               = $details
        relationships     = $relationships
        assignments       = @($assignments.value)
        deviceCounts      = if ($IncludeDeviceCounts) { $counts } else { $null }
    }

    $safeName = ConvertTo-SafeFileName -Name $details.displayName
    $jsonPath = Join-Path $JsonDir ("{0}__{1}.json" -f $safeName, $details.id)
    $bundle | ConvertTo-Json -Depth $JsonDepth | Out-File -FilePath $jsonPath -Encoding utf8
}

Write-Progress -Activity "Processing apps" -Completed
Write-Host "✅ Inventory + JSON bundle export completed" -ForegroundColor Green

# Export CSVs
$appExport | Sort-Object DisplayName | Export-Csv -Path $AppsCsvPath -NoTypeInformation -Encoding UTF8
$assignmentExport | Sort-Object DisplayName, Intent, GroupName | Export-Csv -Path $AssignmentsCsvPath -NoTypeInformation -Encoding UTF8

Write-Host "`n✅ EXPORT COMPLETE" -ForegroundColor Green
Write-Host "Output folder:      $OutDir"
Write-Host "Apps CSV:           $AppsCsvPath"
Write-Host "Assignments CSV:    $AssignmentsCsvPath"
Write-Host "Per-app JSON folder:$JsonDir"
Write-Host "ScopeTag mode:      $ScopeTagResolutionMode"
if ($AppIdCsv) { Write-Host "AppId CSV used:     $AppIdCsv" }