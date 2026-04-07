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

    if (-not $pkg.install) {
        throw "package.yaml missing required block: install"
    }

    if (-not $pkg.install.command_line) {
        throw "package.yaml missing required field: install.command_line"
    }

    if (-not $pkg.uninstall) {
        throw "package.yaml missing required block: uninstall"
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
    $stack = @(@{ indent = -1; node = $root })

    foreach ($raw in $lines) {

        $trimmed = $raw.Trim()

        # Skip full-line comments
        if ($trimmed.StartsWith('#')) {
            continue
        }

        # Strip inline comments
        $line = $raw -replace '\s+#.*$', ''
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        $indent = ($line -match '^(\s*)')[1].Length
        $text   = $line.Trim()

        # Walk stack back to correct indent
        while ($stack[-1].indent -ge $indent) {
            $stack = $stack[0..($stack.Count - 2)]
        }

        $parent = $stack[-1].node

        # Array item
        if ($text -match '^- (.+)$') {
            if (-not ($parent -is [System.Collections.IList])) {
                throw "YAML error: array item without array context: $text"
            }
            $parent.Add((Convert-YamlValue $matches[1]))
            continue
        }

        # Key/value
        if ($text -match '^([^:]+):\s*(.*)$') {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim()

            if ($val -eq '') {
                # Start nested object
                $child = @{}
                $parent[$key] = $child
                $stack += @{ indent = $indent; node = $child }
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

    $bodyJson = if ($Body) { $Body | ConvertTo-Json -Depth 20 -Compress }

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

Export-ModuleMember -Function @(
    'Write-Log',
    'Get-GraphToken',
    'Invoke-GraphRequest',
    'ConvertFrom-SimpleYaml',
    'Get-SafeName',
    'Get-FileSha256',
    'Import-PackageYaml',
    'Get-FileBytes'
)