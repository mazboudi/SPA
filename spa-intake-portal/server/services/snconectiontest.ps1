# 1. Request OAuth Token (Single quotes prevent PowerShell variable expansion of $)
$body = @{
    grant_type    = "client_credentials"
    client_id     = 'a797a7ad1e414196bbcdf6b6c18d4f8d'
    client_secret = '{Ew*pg]!|$869xCr.}+?lvRFEEZv0fOp'
}

Write-Host "1. Requesting OAuth token from ServiceNow..." -ForegroundColor Cyan
try {
    $tokenRes = Invoke-RestMethod -Uri "https://fiservdevservicepoint.fiservapps.com/oauth_token.do" -Method Post -Body $body -SkipCertificateCheck
    if ($tokenRes.access_token) {
        Write-Host "   ✅ Token received successfully!" -ForegroundColor Green
        Write-Host "   Raw Token Payload:" -ForegroundColor Yellow
        Write-Host ($tokenRes | ConvertTo-Json -Depth 4) -ForegroundColor Gray
    } else {
        Write-Host "   ❌ FAILED to get token! Response: $($tokenRes | ConvertTo-Json -Compress)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ❌ FAILED requesting token: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "   Details: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
    }
    exit 1
}

# 2. Call the Table API using 3 different token methods to diagnose gateway behavior
$token = $tokenRes.access_token

Write-Host "`n--- Diagnostic Tests ---" -ForegroundColor Magenta

# Test 2A: Standard Header
Write-Host "`nTest 2A: Header 'Authorization: Bearer <token>'..." -ForegroundColor Cyan
try {
    $h = @{ "Authorization" = "Bearer $token"; "Accept" = "application/json" }
    $resA = Invoke-RestMethod -Uri "https://fiservdevservicepoint.fiservapps.com/api/now/table/x_fise2_software_0_spa_intake_software_title?sysparm_limit=1" -Headers $h -SkipCertificateCheck
    Write-Host "   ✅ Test 2A SUCCEEDED!" -ForegroundColor Green
    $resA.result | Format-Table u_display_name, u_publisher
} catch {
    Write-Host "   ❌ Test 2A Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2B: Query Parameter (Bypasses Proxy Header Stripping)
Write-Host "`nTest 2B: URL Query Parameter '?oauth_token=<token>'..." -ForegroundColor Cyan
try {
    $h = @{ "Accept" = "application/json" }
    $urlB = "https://fiservdevservicepoint.fiservapps.com/api/now/table/x_fise2_software_0_spa_intake_software_title?sysparm_limit=1&oauth_token=$token"
    $resB = Invoke-RestMethod -Uri $urlB -Headers $h -SkipCertificateCheck
    Write-Host "   ✅ Test 2B SUCCEEDED via Query Parameter!" -ForegroundColor Green
    $resB.result | Format-Table u_display_name, u_publisher
} catch {
    Write-Host "   ❌ Test 2B Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2C: Platform Table (sys_user) to verify if it is an ACL issue on custom scope
Write-Host "`nTest 2C: Checking standard 'sys_user' table with Bearer token..." -ForegroundColor Cyan
try {
    $h = @{ "Authorization" = "Bearer $token"; "Accept" = "application/json" }
    $resC = Invoke-RestMethod -Uri "https://fiservdevservicepoint.fiservapps.com/api/now/table/sys_user?sysparm_limit=1" -Headers $h -SkipCertificateCheck
    Write-Host "   ✅ Test 2C SUCCEEDED on sys_user!" -ForegroundColor Green
    $resC.result | Format-Table user_name, name
} catch {
    Write-Host "   ❌ Test 2C Failed: $($_.Exception.Message)" -ForegroundColor Red
}