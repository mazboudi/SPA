<#
.SYNOPSIS
  Extracts metadata from an MSI file — ProductCode, ProductVersion,
  ProductName, Manufacturer, and UpgradeCode.

.DESCRIPTION
  Uses the Windows Installer COM object to read the MSI summary and
  property table. Outputs the values to the console and optionally
  copies the ProductCode to the clipboard.

.PARAMETER MsiPath
  Path to the .msi file to inspect.

.PARAMETER Clipboard
  If specified, copies the ProductCode to the clipboard.

.PARAMETER Json
  If specified, outputs all metadata as a JSON object (useful for piping).

.EXAMPLE
  pwsh -File Get-MsiMetadata.ps1 -MsiPath ".\7z2600-x64.msi"

  ProductCode    : {23170F69-40C1-2702-2408-000001000000}
  ProductVersion : 26.00.00.0
  ProductName    : 7-Zip 26.00 (x64 edition)
  Manufacturer   : Igor Pavlov
  UpgradeCode    : {23170F69-40C1-2702-0000-000004000000}

.EXAMPLE
  pwsh -File Get-MsiMetadata.ps1 -MsiPath ".\installer.msi" -Clipboard

  (copies ProductCode to clipboard)

.EXAMPLE
  pwsh -File Get-MsiMetadata.ps1 -MsiPath ".\installer.msi" -Json | ConvertFrom-Json
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $MsiPath,

    [switch] $Clipboard,
    [switch] $Json
)

$ErrorActionPreference = 'Stop'

# ── Validate path ─────────────────────────────────────────────────────────────
if (!(Test-Path $MsiPath)) {
    throw "MSI file not found: $MsiPath"
}

$MsiPath = (Resolve-Path $MsiPath).Path

if ($MsiPath -notmatch '\.msi$') {
    Write-Warning "File does not have .msi extension: $MsiPath"
}

# ── Read MSI properties via Windows Installer COM ─────────────────────────────
function Get-MsiProperty {
    param(
        [Parameter(Mandatory)] [string] $Path,
        [Parameter(Mandatory)] [string] $Property
    )
    
    $installer = $null
    $database  = $null
    $view      = $null
    
    try {
        $installer = New-Object -ComObject WindowsInstaller.Installer
        $database  = $installer.GetType().InvokeMember(
            'OpenDatabase', 'InvokeMethod', $null, $installer, @($Path, 0)
        )
        
        $query = "SELECT Value FROM Property WHERE Property = '$Property'"
        $view  = $database.GetType().InvokeMember(
            'OpenView', 'InvokeMethod', $null, $database, @($query)
        )
        $view.GetType().InvokeMember('Execute', 'InvokeMethod', $null, $view, $null)
        
        $record = $view.GetType().InvokeMember(
            'Fetch', 'InvokeMethod', $null, $view, $null
        )
        
        if ($record) {
            return $record.GetType().InvokeMember(
                'StringData', 'InvokeMethod', $null, $record, @(1)
            )
        }
        return $null
    } catch {
        return $null
    } finally {
        if ($view)      { try { $view.GetType().InvokeMember('Close', 'InvokeMethod', $null, $view, $null) } catch {} }
        if ($database)  { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($database) | Out-Null }
        if ($installer) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($installer) | Out-Null }
    }
}

# ── Extract all properties ────────────────────────────────────────────────────
$properties = @(
    'ProductCode',
    'ProductVersion',
    'ProductName',
    'Manufacturer',
    'UpgradeCode'
)

$metadata = [ordered]@{}
foreach ($prop in $properties) {
    $value = Get-MsiProperty -Path $MsiPath -Property $prop
    $metadata[$prop] = if ($value) { $value } else { '(not found)' }
}

# ── Output ────────────────────────────────────────────────────────────────────
if ($Json) {
    $metadata | ConvertTo-Json -Depth 2
} else {
    Write-Host ""
    Write-Host "MSI Metadata: $(Split-Path $MsiPath -Leaf)" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    foreach ($key in $metadata.Keys) {
        $pad   = ' ' * (16 - $key.Length)
        $color = if ($key -eq 'ProductCode') { 'Green' } else { 'White' }
        Write-Host "  $key$pad : $($metadata[$key])" -ForegroundColor $color
    }
    Write-Host ""

    # Show usage hint
    Write-Host "Use in package.yaml:" -ForegroundColor DarkGray
    Write-Host "  detection:" -ForegroundColor DarkGray
    Write-Host "    product_code: ""$($metadata['ProductCode'])""" -ForegroundColor DarkGray
    Write-Host "    version: ""$($metadata['ProductVersion'])""" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Use in uninstall command:" -ForegroundColor DarkGray
    Write-Host "  msiexec.exe /x ""$($metadata['ProductCode'])"" /qn /norestart" -ForegroundColor DarkGray
    Write-Host ""
}

# ── Clipboard ─────────────────────────────────────────────────────────────────
if ($Clipboard -and $metadata['ProductCode'] -ne '(not found)') {
    $metadata['ProductCode'] | Set-Clipboard
    Write-Host "✓ ProductCode copied to clipboard." -ForegroundColor Green
}
