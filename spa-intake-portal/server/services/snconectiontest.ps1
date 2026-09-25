$apiKey = "YOUR_API_KEY_HERE"

# Test Header 1: Standard ServiceNow API Key Header (x-snc-api-key)
Write-Host "Testing x-snc-api-key header..." -ForegroundColor Cyan
try {
    $headers = @{
        "x-snc-api-key" = $apiKey
        "Accept"        = "application/json"
    }
    $res = Invoke-RestMethod -Uri "https://fiservdevservicepoint.fiservapps.com/api/now/table/x_fise2_software_0_spa_intake_software_title?sysparm_limit=1" -Headers $headers -SkipCertificateCheck
    Write-Host " SUCCESS! Record retrieved:" -ForegroundColor Green
    $res.result | Format-Table u_display_name, u_publisher
}
catch {
    Write-Host " Failed with x-snc-api-key: $($_.Exception.Message)" -ForegroundColor Red
}

# Test Header 2: Bearer API Key Header
Write-Host "`nTesting Bearer API key header..." -ForegroundColor Cyan
try {
    $headers = @{
        "Authorization" = "Bearer $apiKey"
        "Accept"        = "application/json"
    }
    $res = Invoke-RestMethod -Uri "https://fiservdevservicepoint.fiservapps.com/api/now/table/x_fise2_software_0_spa_intake_software_title?sysparm_limit=1" -Headers $headers -SkipCertificateCheck
    Write-Host " SUCCESS! Record retrieved:" -ForegroundColor Green
    $res.result | Format-Table u_display_name, u_publisher
}
catch {
    Write-Host " Failed with Bearer: $($_.Exception.Message)" -ForegroundColor Red
}