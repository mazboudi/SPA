<#
.SYNOPSIS
  STUB: Auth to Microsoft Graph and validate we can reach Intune app endpoints.
  - Gets Graph token
  - Calls Graph to validate API reachability
  - Does NOT actually assign anything
  - Writes logs under out/assign-logs/

.PARAMETER AppId
  The APP_ID from publish job (stub value is fine for now).

.OUTPUTS
  out/assign-logs/*
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [string] $AppId,

  [Parameter(Mandatory=$true)]
  [string] $TenantId,

  [Parameter(Mandatory=$true)]
  [string] $ClientId,

  [Parameter(Mandatory=$true)]
  [string] $ClientSecret,

  [string] $AppJsonPath = "app.json"
)

$ErrorActionPreference = "Stop"

function Ensure-Dir([string] $Path) {
  if (!(Test-Path $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
}

function Write-Log([string] $Path, [string] $Message) {
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "$ts  $Message" | Out-File -FilePath $Path -Append -Encoding utf8
}

$outDir = "out"
$logDir = Join-Path $outDir "assign-logs"
Ensure-Dir $outDir
Ensure-Dir $logDir

$logFile = Join-Path $logDir "assign-stub.log"
Write-Log $logFile "Assign stub starting."
Write-Log $logFile "AppId: $AppId"
Write-Log $logFile "AppJsonPath: $AppJsonPath"

if (!(Test-Path $AppJsonPath)) {
  throw "Missing $AppJsonPath"
}

# --- Get Graph token ---
Write-Log $logFile "Requesting Graph token via client_credentials..."
$tokenBody = @{
  client_id     = $ClientId
  client_secret = $ClientSecret
  scope         = "https://graph.microsoft.com/.default"
  grant_type    = "client_credentials"
}

try {
  $tokenResp = Invoke-RestMethod -Method Post `
    -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" `
    -ContentType "application/x-www-form-urlencoded" `
    -Body $tokenBody
} catch {
  Write-Log $logFile "Token request failed: $($_.Exception.Message)"
  throw
}

$accessToken = $tokenResp.access_token
Write-Log $logFile ("Got access token length: " + $accessToken.Length)

$headers = @{ Authorization = "Bearer $accessToken" }

# --- Lightweight Graph call ---
try {
  $uri = "https://graph.microsoft.com/v1.0/deviceAppManagement/mobileApps?`$top=1"
  Write-Log $logFile "Calling Graph: $uri"
  $resp = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
  $count = @($resp.value).Count
  Write-Log $logFile "Graph call succeeded. Returned $count app(s)."
} catch {
  Write-Log $logFile "Graph call failed (permissions/admin consent likely missing): $($_.Exception.Message)"
  throw
}

# --- Parse assignments from app.json (for visibility only; no action in stub) ---
$app = Get-Content $AppJsonPath -Raw | ConvertFrom-Json
if ($app.assignments) {
  $n = @($app.assignments).Count
  Write-Log $logFile "Found $n assignment(s) in app.json (stub will NOT apply them)."
  foreach ($a in $app.assignments) {
    Write-Log $logFile (" - intent=" + $a.intent + " groupId=" + $a.groupId)
  }
} else {
  Write-Log $logFile "No assignments found in app.json (assignments[] missing or empty)."
}

Write-Host "✅ Assign stub OK (no assignments applied). AppId=$AppId" -ForegroundColor Green