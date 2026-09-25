# ==============================================================================
# ServiceNow Authentication Diagnostic Tool
# Compatible with both Windows PowerShell 5.1 (.NET Framework) & PowerShell 7+ (pwsh)
# ==============================================================================

[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls13
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

# 1. Resolve and Load .env file
$envFilePath = $null
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

$candidates = @(
    (Join-Path $scriptDir "..\..\.env"),
    (Join-Path (Get-Location) ".env"),
    (Join-Path (Get-Location) "spa-intake-portal\.env")
)

foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) {
        $envFilePath = (Resolve-Path $c).Path
        break
    }
}

if ($envFilePath) {
    Write-Host "Loading config from: $envFilePath" -ForegroundColor Gray
    Get-Content $envFilePath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $eqIdx = $line.IndexOf('=')
            if ($eqIdx -gt 0) {
                $k = $line.Substring(0, $eqIdx).Trim()
                $v = $line.Substring($eqIdx + 1).Trim().Trim('"').Trim("'")
                [System.Environment]::SetEnvironmentVariable($k, $v)
            }
        }
    }
}

# 2. Extract Configuration Values
$snowUrl = [System.Environment]::GetEnvironmentVariable("SNOW_URL")
if (-not $snowUrl) { $snowUrl = "https://fiservdevservicepoint.fiservapps.com" }
$snowUrl = $snowUrl.TrimEnd('/')

$table = [System.Environment]::GetEnvironmentVariable("SNOW_TITLE_TABLE")
if (-not $table) { $table = "x_fise2_software_0_spa_intake_software_title" }

$apiKey       = [System.Environment]::GetEnvironmentVariable("SNOW_API_KEY")
$clientId     = [System.Environment]::GetEnvironmentVariable("SNOW_CLIENT_ID")
$clientSecret = [System.Environment]::GetEnvironmentVariable("SNOW_CLIENT_SECRET")

# Allow manual override if not in .env
if (-not $apiKey -or $apiKey -eq "YOUR_API_KEY_HERE") {
    # If your API Key is not in .env, you can paste it between the single quotes below:
    $apiKey = ""
}

Write-Host "=================================================================" -ForegroundColor Magenta
Write-Host " ServiceNow Connectivity & Authentication Diagnostic" -ForegroundColor Magenta
Write-Host " Target URL : $snowUrl" -ForegroundColor Cyan
Write-Host " Test Table : $table" -ForegroundColor Cyan
Write-Host " PowerShell : $($PSVersionTable.PSVersion.ToString())" -ForegroundColor Gray
Write-Host "=================================================================" -ForegroundColor Magenta

# 3. Robust HTTP Request Function (PS 5.1 and 7+ Safe)
function Invoke-SnowRequest {
    param(
        [string]$Uri,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        $Body = $null
    )

    $params = @{
        Uri     = $Uri
        Method  = $Method
        Headers = $Headers
    }
    if ($Body) {
        $params['Body'] = $Body
    }
    # -SkipCertificateCheck only exists in PowerShell 6+
    if ($PSVersionTable.PSVersion.Major -ge 6) {
        $params['SkipCertificateCheck'] = $true
    }

    try {
        $res = Invoke-RestMethod @params
        return @{
            Success    = $true
            Data       = $res
            Status     = 200
            Error      = $null
            ServerBody = $null
        }
    }
    catch {
        $statusCode = "Unknown"
        $errMsg = $_.Exception.Message
        $serverBody = ""

        # Safe Status Code extraction
        if ($_.Exception.Response) {
            try {
                $statusCode = [int]$_.Exception.Response.StatusCode
            } catch {}
        }

        # Safe Response Body extraction across all PS versions
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            $serverBody = $_.ErrorDetails.Message
        }
        elseif ($_.Exception.Response) {
            try {
                if ($_.Exception.Response.Content) {
                    $serverBody = $_.Exception.Response.Content.ReadAsStringAsync().Result
                }
            } catch {}

            if (-not $serverBody) {
                try {
                    $stream = $_.Exception.Response.GetResponseStream()
                    if ($stream) {
                        $reader = New-Object System.IO.StreamReader($stream)
                        $serverBody = $reader.ReadToEnd()
                    }
                } catch {}
            }
        }

        return @{
            Success    = $false
            Data       = $null
            Status     = $statusCode
            Error      = $errMsg
            ServerBody = $serverBody
        }
    }
}

$titleUrl = "$snowUrl/api/now/table/$table`?sysparm_limit=1"
$userUrl  = "$snowUrl/api/now/table/sys_user?sysparm_limit=1"

# ------------------------------------------------------------------------------
# DIAGNOSTIC SECTION 1: API KEY AUTHENTICATION
# ------------------------------------------------------------------------------
if ($apiKey) {
    Write-Host "`n[1] Testing API Key Authentication..." -ForegroundColor Yellow
    Write-Host "    Key prefix: $($apiKey.Substring(0, [Math]::Min(8, $apiKey.Length)))..." -ForegroundColor Gray

    $keyFormats = @(
        @{ Name = "Header 'x-snc-api-key'";         Headers = @{ "x-snc-api-key" = $apiKey; "Accept" = "application/json" }; Url = $titleUrl },
        @{ Name = "Header 'Authorization: Bearer'"; Headers = @{ "Authorization" = "Bearer $apiKey"; "Accept" = "application/json" }; Url = $titleUrl },
        @{ Name = "Header 'Authorization: ApiKey'"; Headers = @{ "Authorization" = "ApiKey $apiKey"; "Accept" = "application/json" }; Url = $titleUrl },
        @{ Name = "Header 'api-key'";               Headers = @{ "api-key" = $apiKey; "Accept" = "application/json" }; Url = $titleUrl },
        @{ Name = "Query Parameter '?api_key='";    Headers = @{ "Accept" = "application/json" }; Url = "$titleUrl&api_key=$apiKey" }
    )

    $apiKeySuccess = $false
    foreach ($fmt in $keyFormats) {
        Write-Host -NoNewline "  Testing $($fmt.Name)... "
        $result = Invoke-SnowRequest -Uri $fmt.Url -Method "GET" -Headers $fmt.Headers
        if ($result.Success) {
            Write-Host "SUCCESS (HTTP 200)!" -ForegroundColor Green
            $apiKeySuccess = $true
            if ($result.Data.result) {
                $result.Data.result | Format-Table u_display_name, u_publisher, u_default_disposition
            }
            break
        } else {
            Write-Host "FAILED (HTTP $($result.Status))" -ForegroundColor Red
            if ($result.ServerBody) {
                Write-Host "    Server: $($result.ServerBody)" -ForegroundColor Yellow
            }
        }
    }
} else {
    Write-Host "`n[1] API Key Testing: SKIPPED (SNOW_API_KEY not found in .env or script)" -ForegroundColor DarkGray
}

# ------------------------------------------------------------------------------
# DIAGNOSTIC SECTION 2: OAUTH 2.0 CLIENT CREDENTIALS
# ------------------------------------------------------------------------------
if ($clientId -and $clientSecret) {
    Write-Host "`n[2] Testing OAuth 2.0 Client Credentials..." -ForegroundColor Yellow
    Write-Host "    Client ID: $clientId" -ForegroundColor Gray

    # Clean secret in case it has prefix or whitespace
    $cleanSecret = $clientSecret.Trim()
    $tokenEndpoint = "$snowUrl/oauth_token.do"

    $tokenBody = @{
        grant_type    = "client_credentials"
        client_id     = $clientId
        client_secret = $cleanSecret
    }

    Write-Host "  Requesting token from $tokenEndpoint..." -ForegroundColor Cyan
    $tokenResult = Invoke-SnowRequest -Uri $tokenEndpoint -Method "POST" -Headers @{ "Accept" = "application/json" } -Body $tokenBody

    if ($tokenResult.Success -and $tokenResult.Data.access_token) {
        $token = $tokenResult.Data.access_token
        $scope = $tokenResult.Data.scope
        $expires = $tokenResult.Data.expires_in

        Write-Host "  ✅ OAuth Token Obtained!" -ForegroundColor Green
        Write-Host "     Token Scope : $scope" -ForegroundColor $(if ($scope -eq "a2aauthscope") { "Yellow" } else { "Green" })
        Write-Host "     Expires In  : ${expires}s" -ForegroundColor Gray

        if ($scope -eq "a2aauthscope") {
            Write-Host "     ⚠️ Note: Scope 'a2aauthscope' is restricted to IntegrationHub flows." -ForegroundColor Yellow
            Write-Host "        ServiceNow Table API (/api/now/table/*) typically returns 401 Unauthorized" -ForegroundColor Yellow
            Write-Host "        unless the Application Registry entity is configured for useraccount/Table API." -ForegroundColor Yellow
        }

        # Test 2A: Bearer Header on Custom Table
        Write-Host "`n  Testing Bearer Token on custom table ($table)..." -ForegroundColor Cyan
        $bearerHeaders = @{ "Authorization" = "Bearer $token"; "Accept" = "application/json" }
        $resCustom = Invoke-SnowRequest -Uri $titleUrl -Method "GET" -Headers $bearerHeaders
        if ($resCustom.Success) {
            Write-Host "  ✅ Table API SUCCESS! Record retrieved:" -ForegroundColor Green
            $resCustom.Data.result | Format-Table u_display_name, u_publisher, u_default_disposition
        } else {
            Write-Host "  ❌ Custom Table FAILED (HTTP $($resCustom.Status))" -ForegroundColor Red
            if ($resCustom.ServerBody) {
                Write-Host "     Server Response: $($resCustom.ServerBody)" -ForegroundColor Yellow
            }
        }

        # Test 2B: Query Parameter ?oauth_token=
        Write-Host "  Testing query parameter '?oauth_token=' (proxy header bypass)..." -ForegroundColor Cyan
        $resParam = Invoke-SnowRequest -Uri "$titleUrl&oauth_token=$token" -Method "GET" -Headers @{ "Accept" = "application/json" }
        if ($resParam.Success) {
            Write-Host "  ✅ Query Param SUCCESS!" -ForegroundColor Green
        } else {
            Write-Host "  ❌ Query Param FAILED (HTTP $($resParam.Status))" -ForegroundColor Red
        }

        # Test 2C: Platform sys_user Table
        Write-Host "  Testing platform 'sys_user' table (ACL verification)..." -ForegroundColor Cyan
        $resUser = Invoke-SnowRequest -Uri $userUrl -Method "GET" -Headers $bearerHeaders
        if ($resUser.Success) {
            Write-Host "  ✅ sys_user SUCCESS! (User has global Table API access; issue is table ACL)" -ForegroundColor Green
        } else {
            Write-Host "  ❌ sys_user FAILED (HTTP $($resUser.Status))" -ForegroundColor Red
            if ($resUser.ServerBody) {
                Write-Host "     Server Response: $($resUser.ServerBody)" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "  ❌ Failed to obtain OAuth token (HTTP $($tokenResult.Status))" -ForegroundColor Red
        if ($tokenResult.ServerBody) {
            Write-Host "     Server: $($tokenResult.ServerBody)" -ForegroundColor Yellow
        } elseif ($tokenResult.Error) {
            Write-Host "     Error: $($tokenResult.Error)" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "`n[2] OAuth 2.0 Testing: SKIPPED (SNOW_CLIENT_ID or SNOW_CLIENT_SECRET missing)" -ForegroundColor DarkGray
}

Write-Host "`n=================================================================" -ForegroundColor Magenta
Write-Host " Diagnostic Complete" -ForegroundColor Magenta
Write-Host "=================================================================" -ForegroundColor Magenta