# Bypass SSL certificate validation if on corporate proxy
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

# 1. Credentials
$user = "spa_api_user"
$pass = "s4zH).G?S{or_oWh@u^wK)zFGT<L52%?JRQmkMW{"

# 2. Build auth header
$base64AuthInfo = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(("{0}:{1}" -f $user, $pass)))

# 3. Set headers
$headers = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
$headers.Add('Authorization', ('Basic {0}' -f $base64AuthInfo))
$headers.Add('Accept', 'application/json')

# 4. Specify endpoint uri
$uri = "https://fiservdevservicepoint.fiservapps.com/api/now/table/x_fise2_software_0_spa_intake_software_title?sysparm_limit=1"

# 5. Send request
try {
    $response = Invoke-RestMethod -Headers $headers -Method Get -Uri $uri
    Write-Host " SUCCESS! HTTP 200 Received:" -ForegroundColor Green
    $response.result | Format-Table u_display_name, u_publisher, u_default_disposition
}
catch {
    Write-Host " FAILED with status code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    $streamReader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $errBody = $streamReader.ReadToEnd()
    Write-Host "Error Body: $errBody" -ForegroundColor Yellow
}