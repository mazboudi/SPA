<#
.SYNOPSIS
  Reads metadata from an MSI file using the Windows Installer COM API.

.DESCRIPTION
  Extracts ProductCode, ProductVersion, ProductName, Manufacturer, and UpgradeCode
  from a .msi file without installing it. Useful for auto-populating package.yaml
  fields and verifying the correct MSI is staged.

.PARAMETER MsiPath
  Path to the .msi file.

.OUTPUTS
  [PSCustomObject] with ProductCode, ProductVersion, ProductName, Manufacturer, UpgradeCode

.EXAMPLE
  $meta = .\Get-MsiMetadata.ps1 -MsiPath 'Files\GoogleChromeEnterprise64.msi'
  Write-Host "ProductCode: $($meta.ProductCode)"
  Write-Host "Version    : $($meta.ProductVersion)"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $MsiPath
)

$ErrorActionPreference = 'Stop'

if (!(Test-Path $MsiPath)) {
    throw "MSI not found: $MsiPath"
}

$msiPath = (Resolve-Path $MsiPath).Path

try {
    $installer = New-Object -ComObject WindowsInstaller.Installer
    $db = $installer.OpenDatabase($msiPath, 0)  # 0 = read-only

    function Get-Property([string] $propName) {
        $view = $db.OpenView("SELECT Value FROM Property WHERE Property = '$propName'")
        $view.Execute()
        $record = $view.Fetch()
        $val = if ($record) { $record.StringData(1) } else { $null }
        $view.Close()
        return $val
    }

    $result = [PSCustomObject]@{
        ProductCode    = Get-Property 'ProductCode'
        ProductVersion = Get-Property 'ProductVersion'
        ProductName    = Get-Property 'ProductName'
        Manufacturer   = Get-Property 'Manufacturer'
        UpgradeCode    = Get-Property 'UpgradeCode'
        MsiPath        = $msiPath
    }

    return $result

} catch {
    throw "Failed to read MSI metadata from '$MsiPath': $($_.Exception.Message)"
} finally {
    if ($db)        { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($db) | Out-Null }
    if ($installer) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($installer) | Out-Null }
    [GC]::Collect()
}
