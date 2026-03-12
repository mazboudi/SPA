##=============================================================================
## IntuneDeployment.psm1 — Shared PowerShell module
## intune-deployment-modules
##
## Provides Graph authentication, HTTP client helpers, logging, and naming
## utilities shared by all Publish/Update/Assign/Detection scripts.
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

    $ts  = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$ts] [$Level] $Message"

    $colour = switch ($Level) {
        'INFO'  { 'Cyan'   }
        'WARN'  { 'Yellow' }
        'ERROR' { 'Red'    }
        'DEBUG' { 'Gray'   }
    }
    Write-Host $line -ForegroundColor $colour

    if ($LogFile) {
        $line | Out-File -FilePath $LogFile -Append -Encoding utf8
    }
}

#endregion

#region ── Graph Authentication ────────────────────────────────────────────────

<#
.SYNOPSIS
  Acquires a Microsoft Graph access token using client_credentials flow.

.OUTPUTS
  [string] Access token
#>
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

<#
.SYNOPSIS
  Invokes a Microsoft Graph API request with retry on transient errors.
#>
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

    $bodyJson = $null
    if ($Body) {
        $bodyJson = $Body | ConvertTo-Json -Depth 20 -Compress
    }

    for ($i = 1; $i -le $MaxRetries; $i++) {
        try {
            $params = @{
                Method  = $Method
                Uri     = $Uri
                Headers = $headers
            }
            if ($bodyJson) { $params['Body'] = $bodyJson }

            return Invoke-RestMethod @params
        } catch {
            $statusCode = $_.Exception.Response?.StatusCode
            if ($statusCode -in @(429, 503, 504) -and $i -lt $MaxRetries) {
                $retryAfter = [int]($_.Exception.Response.Headers['Retry-After'] ?? (5 * $i))
                Write-Log "Graph throttle/transient (HTTP $statusCode). Retrying in ${retryAfter}s... ($i/$MaxRetries)" -Level WARN
                Start-Sleep -Seconds $retryAfter
            } else {
                Write-Log "Graph request failed [$Method $Uri]: $($_.Exception.Message)" -Level ERROR
                throw
            }
        }
    }
}

#endregion

#region ── Naming Utilities ─────────────────────────────────────────────────────

<#
.SYNOPSIS
  Produces a safe artifact name (no spaces, no special chars).
#>
function Get-SafeName {
    [OutputType([string])]
    param([Parameter(Mandatory)] [string] $Name)
    return ($Name -replace '[^a-zA-Z0-9\.\-]', '_')
}

#endregion

#region ── File Hashing ────────────────────────────────────────────────────────

<#
.SYNOPSIS
  Returns the SHA-256 hash of a file as a lowercase hex string.
#>
function Get-FileSha256 {
    [OutputType([string])]
    param([Parameter(Mandatory)] [string] $Path)
    return (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLower()
}

<#
.SYNOPSIS
  Returns the file size in bytes.
#>
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
    'Get-SafeName',
    'Get-FileSha256',
    'Get-FileBytes'
)
