# ServiceNow API Key & Auth Diagnostic Script
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}

# Put your API Key here (or from .env):
$apiKey = if ($env:SNOW_API_KEY) { $env:SNOW_API_KEY } else { "YOUR_API_KEY_HERE" }

$url = "https://fiservdevservicepoint.fiservapps.com/api/now/table/x_fise2_software_0_spa_intake_software_title?sysparm_limit=1"

Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host " ServiceNow API Key Authentication Diagnostic" -ForegroundColor Magenta
Write-Host " Target URL: $url" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Magenta

# Function to test a header format and print full diagnostic details
function Test-Header($name, $headers) {
    Write-Host "`nTesting [$name]..." -ForegroundColor Cyan
    try {
        $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get -SkipCertificateCheck
        Write-Host "   ✅ SUCCESS! Record retrieved:" -ForegroundColor Green
        $res.result | Format-Table u_display_name, u_publisher
        return $true
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        Write-Host "   ❌ FAILED with HTTP $status: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails) {
            Write-Host "   Server Response: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
        }
        return $false
    }
}

# Format 1: x-snc-api-key (Standard ServiceNow IntegrationHub header)
Test-Header "Header: x-snc-api-key" @{
    "x-snc-api-key" = $apiKey
    "Accept"        = "application/json"
}

# Format 2: Authorization: Bearer <key>
Test-Header "Header: Authorization: Bearer" @{
    "Authorization" = "Bearer $apiKey"
    "Accept"        = "application/json"
}

# Format 3: Authorization: ApiKey <key>
Test-Header "Header: Authorization: ApiKey" @{
    "Authorization" = "ApiKey $apiKey"
    "Accept"        = "application/json"
}

# Format 4: Header: api-key (Standard gateway header)
Test-Header "Header: api-key" @{
    "api-key" = $apiKey
    "Accept"  = "application/json"
}