[CmdletBinding()]
param(
    [string]$InputPath,
    [string]$PackagePath
)
Write-Host "Publish Win32 app using metadata: $InputPath and package: $PackagePath"
