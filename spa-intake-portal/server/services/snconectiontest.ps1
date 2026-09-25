$pair = "C)c(*K8yxWNQ1s*J@#mDz}HCPpplCKaW?j7k^<Q["
$bytes = [System.Text.Encoding]::ASCII.GetBytes($pair)
$base64 = [System.Convert]::ToBase64String($bytes)
$headers = @{
    "Authorization" = "Basic $base64"
    "Accept"        = "application/json"
}

Invoke-RestMethod -Uri "https://fiservdevservicepoint.fiservapps.com/api/now/table/x_fise2_software_0_spa_intake_software_title?sysparm_limit=1" -Headers $headers -SkipCertificateCheck