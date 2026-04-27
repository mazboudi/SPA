##=============================================================================
## IntuneDeployment.psm1 — Shared PowerShell module
##=============================================================================

#region ── Logging ─────────────────────────────────────────────────────────────

function Write-Log {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $Message,
        [ValidateSet('INFO','WARN','ERROR','DEBUG')]
        [string] $Level = 'INFO',
        [string] $LogFile
    )

    $ts    = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line  = "[$ts] [$Level] $Message"
    $color = @{
        INFO  = 'Cyan'
        WARN  = 'Yellow'
        ERROR = 'Red'
        DEBUG = 'Gray'
    }[$Level]

    Write-Host $line -ForegroundColor $color
    if ($LogFile) { $line | Out-File -FilePath $LogFile -Append -Encoding utf8 }
}

#endregion
#region ── Shared Import YAML Helper (Pure PowerShell, CI‑Safe) ─────────────────────────────
function Import-PackageYaml {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $Path
    )

    if (!(Test-Path $Path)) {
        throw "package.yaml not found: $Path"
    }

    $yamlText = Get-Content $Path -Raw
    $pkg = ConvertFrom-SimpleYaml $yamlText

    # ── Normalize & validate structure ───────────────────────────────
    # Accept 'version' (current field name) with 'vendor_version' as legacy fallback
    if ($pkg.version) {
        $pkg['vendor_version'] = $pkg.version   # expose under both names for downstream scripts
    } elseif ($pkg.vendor_version) {
        $pkg['version'] = $pkg.vendor_version
    } else {
        throw "package.yaml missing required field: version"
    }

    if (-not $pkg.install_command) {
        throw "package.yaml missing required field: install_command"
    }

    if (-not $pkg.uninstall_command) {
        throw "package.yaml missing required field: uninstall_command"
    }

    return $pkg
}

#endregion
#region ── YAML Parsing (Pure PowerShell, CI‑Safe) ─────────────────────────────
function ConvertFrom-SimpleYaml {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Yaml
    )

    $lines = $Yaml -split "`r?`n"
    $root  = @{}
    # Stack entries: @{ indent = <int>; node = <hashtable|ArrayList>; key = <string|$null> }
    # 'key' tracks the last key set on the parent, so we can retroactively swap
    # a hashtable placeholder to an ArrayList when the first "- " child appears.
    $stack = [System.Collections.ArrayList]@(
        @{ indent = -1; node = $root; key = $null }
    )

    foreach ($raw in $lines) {

        $trimmed = $raw.Trim()

        # Skip full-line comments and blank lines
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) {
            continue
        }

        # Strip inline comments (but not inside quoted strings)
        $line = $raw -replace '\s+#.*$', ''
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        # ── Compute indentation correctly ────────────────────────────────
        # PowerShell's -match returns a bool and populates $Matches.
        # We must read $Matches[1] AFTER the -match call, not chain off the bool.
        $null = $line -match '^(\s*)'
        $indent = $Matches[1].Length
        $text   = $line.Trim()

        # ── Walk stack back to correct parent for this indent level ───────
        while ($stack.Count -gt 1 -and $stack[$stack.Count - 1].indent -ge $indent) {
            $stack.RemoveAt($stack.Count - 1)
        }

        $parentEntry = $stack[$stack.Count - 1]
        $parent      = $parentEntry.node

        # ── Array item: "- ..." ──────────────────────────────────────────
        if ($text -match '^-\s+(.+)$') {
            $itemContent = $Matches[1].Trim()

            # If parent is a hashtable, the previous key created it as a
            # placeholder @{}.  We need to retroactively swap it to an ArrayList.
            if ($parent -is [hashtable] -and $stack.Count -ge 2) {
                $gpEntry = $stack[$stack.Count - 2]
                $gpNode  = $gpEntry.node
                $lastKey = $parentEntry.key
                if ($lastKey -and $gpNode -is [hashtable] -and $gpNode.ContainsKey($lastKey)) {
                    $arr = [System.Collections.ArrayList]::new()
                    $gpNode[$lastKey] = $arr
                    $parentEntry.node = $arr
                    $parent = $arr
                }
            }

            if (-not ($parent -is [System.Collections.IList])) {
                throw "YAML error: array item without array context: $text"
            }

            # Array item that is a mapping: "- key: value"
            if ($itemContent -match '^([^:]+):\s*(.*)$') {
                $arrKey = $Matches[1].Trim()
                $arrVal = $Matches[2].Trim()
                $mapItem = @{}
                if ($arrVal -ne '') {
                    $mapItem[$arrKey] = Convert-YamlValue $arrVal
                } else {
                    $mapItem[$arrKey] = @{}
                }
                $parent.Add($mapItem) | Out-Null
                # Push so subsequent indented keys (e.g. file_path, arguments)
                # attach to this map item
                $stack.Add(@{ indent = $indent; node = $mapItem; key = $arrKey }) | Out-Null
            }
            # Simple scalar array item: "- value"
            else {
                $parent.Add((Convert-YamlValue $itemContent)) | Out-Null
            }
            continue
        }

        # ── Key: value ───────────────────────────────────────────────────
        if ($text -match '^([^:]+):\s*(.*)$') {
            $key = $Matches[1].Trim()
            $val = $Matches[2].Trim()

            if ($val -eq '') {
                # Empty value → start a nested object (may become array later)
                $child = @{}
                $parent[$key] = $child
                $stack.Add(@{ indent = $indent; node = $child; key = $key }) | Out-Null
            } else {
                $parent[$key] = Convert-YamlValue $val
            }
            continue
        }

        throw "Invalid YAML syntax: $text"
    }

    return $root
}

function Convert-YamlValue {
    param([string] $Value)

    if (
        ($Value.StartsWith('"') -and $Value.EndsWith('"')) -or
        ($Value.StartsWith("'") -and $Value.EndsWith("'"))
    ) {
        return $Value.Substring(1, $Value.Length - 2)
    }

    if ($Value -match '^(true|false)$') { return [bool]::Parse($Value) }
    if ($Value -match '^-?\d+$')         { return [int]$Value }
    if ($Value -match '^-?\d+\.\d+$')    { return [double]$Value }

    return $Value
}

#endregion

#region ── Graph Authentication ────────────────────────────────────────────────

function Get-GraphToken {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)] [string] $TenantId,
        [Parameter(Mandatory)] [string] $ClientId,
        [Parameter(Mandatory)] [string] $ClientSecret
    )

    Write-Log "Acquiring Graph token for tenant $TenantId..."

    $body = @{
        client_id     = $ClientId
        client_secret = $ClientSecret
        scope         = 'https://graph.microsoft.com/.default'
        grant_type    = 'client_credentials'
    }

    try {
        $resp = Invoke-RestMethod -Method Post `
            -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" `
            -ContentType 'application/x-www-form-urlencoded' `
            -Body $body

        Write-Log "Token acquired (length=$($resp.access_token.Length))"
        return $resp.access_token
    } catch {
        Write-Log "Token acquisition failed: $($_.Exception.Message)" -Level ERROR
        throw
    }
}

#endregion

#region ── Graph HTTP Client ───────────────────────────────────────────────────

function Invoke-GraphRequest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $Token,
        [Parameter(Mandatory)] [string] $Method,
        [Parameter(Mandatory)] [string] $Uri,
        [object]  $Body,
        [string]  $ContentType = 'application/json',
        [int]     $MaxRetries  = 3
    )

    $headers = @{
        Authorization  = "Bearer $Token"
        'Content-Type' = $ContentType
    }

    # Use -InputObject (not pipeline) so single-element arrays are NOT unwrapped.
    # Piping a hashtable through ConvertTo-Json can strip [] from single-item arrays,
    # causing the Graph API to reject the body (e.g. "must have at least one detection rule").
    $bodyJson = if ($Body) { ConvertTo-Json -InputObject $Body -Depth 20 -Compress }
    if ($bodyJson) {
        Write-Log "Request body JSON: $bodyJson" -Level DEBUG
    }

    for ($i = 1; $i -le $MaxRetries; $i++) {
        try {
            $params = @{
                Method  = $Method
                Uri     = $Uri
                Headers = $headers
            }
            if ($bodyJson) { $params.Body = $bodyJson }

            return Invoke-RestMethod @params
        } catch {
            $status = $_.Exception.Response?.StatusCode
            if ($status -in 429,503,504 -and $i -lt $MaxRetries) {
                $retryAfter = [int]($_.Exception.Response.Headers['Retry-After'] ?? (5 * $i))
                Write-Log "Graph transient error HTTP $status. Retrying in $retryAfter s ($i/$MaxRetries)" -Level WARN
                Start-Sleep -Seconds $retryAfter
            } else {
                Write-Log "Graph request failed [$Method $Uri]: $($_.Exception.Message)" -Level ERROR
                throw
            }
        }
    }
}

#endregion

#region ── Utilities ───────────────────────────────────────────────────────────

function Get-SafeName {
    [OutputType([string])]
    param([Parameter(Mandatory)] [string] $Name)
    return ($Name -replace '[^a-zA-Z0-9\.\-]', '_')
}

function Get-FileSha256 {
    [OutputType([string])]
    param([Parameter(Mandatory)] [string] $Path)
    return (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLower()
}

function Get-FileBytes {
    [OutputType([long])]
    param([Parameter(Mandatory)] [string] $Path)
    return (Get-Item $Path).Length
}

#endregion

#region ── Lifecycle YAML Import ───────────────────────────────────────────────

function Import-LifecycleYaml {
    <#
    .SYNOPSIS
      Reads lifecycle.yaml and converts it to the hashtable format expected
      by Build-DeployApplication.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $Path,
        [string] $PackageId   = '',
        [string] $DisplayName = '',
        [string] $Publisher   = '',
        [string] $Version     = '',
        [string] $CloseApps   = '',
        [string] $InstallerType = 'msi',
        [string] $ProductCode = ''
    )

    if (!(Test-Path $Path)) {
        throw "lifecycle.yaml not found: $Path"
    }

    $yaml = ConvertFrom-SimpleYaml (Get-Content $Path -Raw)

    # ── Snake_case → PascalCase action type map ──────────────────────────────
    $typeMap = @{
        'msi_install'             = 'MsiInstall'
        'exe_install'             = 'ExeInstall'
        'msi_uninstall'           = 'MsiUninstall'
        'exe_uninstall'           = 'ExeUninstall'
        'folder_copy'             = 'FolderCopy'
        'folder_remove'           = 'FolderRemove'
        'registry_marker'         = 'RegistryMarker'
        'remove_registry_marker'  = 'RemoveRegistryMarker'
        'set_registry_key'        = 'SetRegistryKey'
        'remove_registry_key'     = 'RemoveRegistryKey'
        'set_env_variable'        = 'SetEnvVariable'
        'remove_env_variable'     = 'RemoveEnvVariable'
        'show_completion'         = 'ShowCompletion'
        'custom_script'           = 'CustomScript'
    }

    function Convert-Actions {
        param([object] $PhaseData)
        $actions = @()
        if (-not $PhaseData -or -not $PhaseData.actions) { return $actions }

        foreach ($a in $PhaseData.actions) {
            $actionType = $typeMap[$a.type]
            if (-not $actionType) {
                Write-Warning "Unknown lifecycle action type: $($a.type) — skipping"
                continue
            }

            $action = @{ Type = $actionType }

            # Map YAML properties to hashtable properties
            if ($a.file_path)     { $action.FilePath     = $a.file_path }
            if ($a.arguments)     { $action.ArgumentList = $a.arguments }
            if ($a.app_name)      { $action.AppName      = $a.app_name }
            if ($a.product_code)  { $action.ProductCode  = $a.product_code }
            if ($a.source)        { $action.Source        = $a.source }
            if ($a.destination)   { $action.Destination   = $a.destination }
            if ($a.path)          { $action.Path          = $a.path }
            if ($a.name)          { $action.Name          = $a.name }
            if ($a.value)         { $action.Value         = $a.value }
            if ($a.reg_type)      { $action.RegType       = $a.reg_type }

            # CustomScript: inline the script content from file
            if ($actionType -eq 'CustomScript' -and $a.script_path) {
                $scriptFile = $a.script_path
                if (Test-Path $scriptFile) {
                    $action.Path    = $scriptFile
                    $action.Content = Get-Content $scriptFile -Raw
                } else {
                    Write-Warning "Custom script not found: $scriptFile"
                    $action.Content = "# TODO: Script not found at build time: $scriptFile"
                }
            }

            # RegistryMarker: inject package metadata from caller
            if ($actionType -eq 'RegistryMarker') {
                $action.PackageId   = $PackageId
                $action.DisplayName = $DisplayName
                $action.Publisher   = $Publisher
                $action.Version     = $Version
            }
            if ($actionType -eq 'RemoveRegistryMarker') {
                $action.PackageId = $PackageId
            }

            $actions += $action
        }
        return $actions
    }

    function Convert-WelcomePhase {
        param([object] $PhaseData, [string] $FallbackCloseApps)
        $actions = @()

        # Welcome-phase properties → synthetic actions
        $closeApps = if ($PhaseData.close_apps) { $PhaseData.close_apps } else { $FallbackCloseApps }
        if ($closeApps) {
            $actions += @{ Type = 'CloseApps'; Apps = $closeApps }
        }
        if ($PhaseData.check_disk_space -eq $true) {
            $actions += @{ Type = 'CheckDiskSpace' }
        }
        if ($PhaseData.allow_defer -and [int]$PhaseData.allow_defer -gt 0) {
            $actions += @{ Type = 'AllowDefer'; DeferTimes = [int]$PhaseData.allow_defer }
        }
        if ($PhaseData.show_progress -eq $true) {
            $actions += @{ Type = 'ShowProgress' }
        }

        # Plus any typed actions
        $actions += Convert-Actions $PhaseData

        return $actions
    }

    # ── Build lifecycle hashtable ─────────────────────────────────────────────
    $lifecycle = @{
        PreInstall    = @{ Actions = @(Convert-WelcomePhase $yaml.pre_install $CloseApps) }
        Install       = @{ Actions = @(Convert-Actions $yaml.install) }
        PostInstall   = @{ Actions = @(Convert-Actions $yaml.post_install) }
        PreUninstall  = @{ Actions = @(Convert-WelcomePhase $yaml.pre_uninstall $CloseApps) }
        Uninstall     = @{ Actions = @(Convert-Actions $yaml.uninstall) }
        PostUninstall = @{ Actions = @(Convert-Actions $yaml.post_uninstall) }
        RepairMode    = if ($yaml.repair_mode) { $yaml.repair_mode } else { 'mirror' }
        PreRepair     = @{ Actions = @() }
        Repair        = @{ Actions = @() }
        PostRepair    = @{ Actions = @() }
    }

    # Custom repair phases (only when repair_mode is 'custom')
    if ($lifecycle.RepairMode -eq 'custom') {
        $lifecycle.PreRepair  = @{ Actions = @(Convert-WelcomePhase $yaml.pre_repair '') }
        $lifecycle.Repair     = @{ Actions = @(Convert-Actions $yaml.repair) }
        $lifecycle.PostRepair = @{ Actions = @(Convert-Actions $yaml.post_repair) }
    }

    # Propagate welcome-phase metadata for Build-DeployApplication compatibility
    if ($yaml.pre_install.close_apps) {
        $lifecycle.PreInstall.CloseApps = $yaml.pre_install.close_apps
    } elseif ($CloseApps) {
        $lifecycle.PreInstall.CloseApps = $CloseApps
    }
    if ($yaml.pre_install.check_disk_space) {
        $lifecycle.PreInstall.CheckDiskSpace = $true
    }
    if ($yaml.pre_install.allow_defer) {
        $lifecycle.PreInstall.DeferTimes = [int]$yaml.pre_install.allow_defer
    }

    return $lifecycle
}

#endregion

Export-ModuleMember -Function @(
    'Write-Log',
    'Get-GraphToken',
    'Invoke-GraphRequest',
    'ConvertFrom-SimpleYaml',
    'Get-SafeName',
    'Get-FileSha256',
    'Import-PackageYaml',
    'Get-FileBytes',
    'Import-LifecycleYaml'
)