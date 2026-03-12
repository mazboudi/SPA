<#
.SYNOPSIS
  STUB: Auth to Microsoft Graph and create a placeholder "app id" output.
  - Validates we can obtain a Graph token
  - Performs a lightweight Graph call (GET mobileApps?$top=1) to prove permissions
  - Writes out/app.env with APP_ID=<placeholder>

.PARAMETER IntuneWinPath
  Path to the .intunewin artifact from the build stage (not used in stub, but validated).

.PARAMETER TenantId / ClientId / ClientSecret
  Client credentials for Graph token acquisition.

.OUTPUTS
  out/app.env (dotenv) containing APP_ID=...
  out/publish-logs/*
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [string] $IntuneWinPath,

  [Parameter(Mandatory=$true)]
  [string] $TenantId,

  [Parameter(Mandatory=$true)]
  [string] $ClientId,

  [Parameter(Mandatory=$true)]
  [string] $ClientSecret
)

$ErrorActionPreference = "Stop"

function Ensure-Dir([string] $Path) {
  if (!(Test-Path $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
}

function Write-Log([string] $Path, [string] $Message) {
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "$ts  $Message" | Out-File -FilePath $Path -Append -Encoding utf8
}

# --- Paths ---
$outDir = "out"
$logDir = Join-Path $outDir "publish-logs"
Ensure-Dir $outDir
Ensure-Dir $logDir

$logFile = Join-Path $logDir "publish-stub.log"

Write-Log $logFile "Publish stub starting."
Write-Log $logFile "IntuneWinPath: $IntuneWinPath"

if (!(Test-Path $IntuneWinPath)) {
  throw "IntuneWinPath not found: $IntuneWinPath"
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

# --- Lightweight Graph call to prove perms ---
$headers = @{ Authorization = "Bearer $accessToken" }

try {
  # Requires DeviceManagementApps.ReadWrite.All OR DeviceManagementApps.Read.All (app permission) with admin consent
  $uri = "https://graph.microsoft.com/v1.0/deviceAppManagement/mobileApps?`$top=1"
  Write-Log $logFile "Calling Graph: $uri"
  $resp = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
  $count = @($resp.value).Count
  Write-Log $logFile "Graph call succeeded. Returned $count app(s)."
} catch {
  Write-Log $logFile "Graph call failed (permissions/admin consent likely missing): $($_.Exception.Message)"
  throw
}

# --- Stub APP_ID output ---
# For now, output a placeholder. Later, this will be the real Intune Win32 app id.
$placeholderAppId = "STUB-" + [guid]::NewGuid().ToString()

$appEnvPath = Join-Path $outDir "app.env"
"APP_ID=$placeholderAppId" | Out-File -FilePath $appEnvPath -Encoding ascii -Force
Write-Log $logFile "Wrote dotenv: $appEnvPath (APP_ID=$placeholderAppId)"

Write-Host "✅ Publish stub OK. APP_ID=$placeholderAppId" -ForegroundColor Green