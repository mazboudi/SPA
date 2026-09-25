# 1. Request the OAuth Token
$body = @{
    grant_type    = "client_credentials"
    client_id     = "a797a7ad1e414196bbcdf6b6c18d4f8d"
    client_secret = "{Ew*pg]!|$869xCr.}+?lvRFEEZv0fOp"
}

Write-Host "1. Requesting OAuth token from ServiceNow..." -ForegroundColor Cyan
$tokenRes = Invoke-RestMethod -Uri "https://fiservdevservicepoint.fiservapps.com/oauth_token.do" -Method Post -Body $body -SkipCertificateCheck
Write-Host "   Token received! Type: $($tokenRes.token_type), Scope: $($tokenRes.scope)" -ForegroundColor Green

# 2. Call the Table API using the Bearer Token
$headers = @{
    "Authorization" = "Bearer $($tokenRes.access_token)"
    "Accept"        = "application/json"
}

Write-Host "2. Calling Table API with Bearer token..." -ForegroundColor Cyan
try {
    $tableRes = Invoke-RestMethod -Uri "https://fiservdevservicepoint.fiservapps.com/api/now/table/x_fise2_software_0_spa_intake_software_title?sysparm_limit=1" -Headers $headers -SkipCertificateCheck
    Write-Host "   SUCCESS! Record retrieved:" -ForegroundColor Green
    $tableRes.result | Format-Table u_display_name, u_publisher, u_default_disposition
}
catch {
    Write-Host "   FAILED with: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "   Details: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
    }
}