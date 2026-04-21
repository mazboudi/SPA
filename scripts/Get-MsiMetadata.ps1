<#
s MSI metadata from the Property table:.SYNOPSIS
  ProductCode, ProductVersion, ProductName, Manufacturer, UpgradeCode

.DESCRIPTION
  Opens the MSI database read-only, reads the entire Property table once,
  and then returns the requested metadata. This is more reliable than
  issuing a separate SQL query per property.

.PARAMETER MsiPath
  Path to the MSI file.

.PARAMETER Clipboard
  If specified, copies ProductCode to the clipboard.

.PARAMETER Json
  If specified, outputs JSON.

.PARAMETER DumpAllProperties
  If specified, includes the entire MSI Property table in the output.

.EXAMPLE
  pwsh -File .\Get-MsiMetadata.ps1 -MsiPath ".\node-v25.8.1-x64.msi"

.EXAMPLE
  pwsh -File .\Get-MsiMetadata.ps1 -MsiPath ".\node-v25.8.1-x64.msi" -DumpAllProperties -Json
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$MsiPath,

    [switch]$Clipboard,
    [switch]$Json,
    [switch]$DumpAllProperties
)

$ErrorActionPreference = 'Stop'

function Convert-ToSafeString {
    param([object]$Value)

    if ($null -eq $Value) { return $null }

    $s = [string]$Value
    if ([string]::IsNullOrWhiteSpace($s)) { return $null }

    return $s.Trim()
}

function Format-MetadataValue {
    param([object]$Value)

    $s = Convert-ToSafeString $Value
    if ($null -eq $s) { return '(not found)' }
    return $s
}

function Release-ComObject {
    param([object]$ComObject)

    if ($null -ne $ComObject) {
        try {
            [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ComObject)
        } catch {
            # ignore
        }
    }
}

function Get-MsiPropertyTable {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    $installer = $null
    $database  = $null
    $view      = $null
    $record    = $null
    $table     = [ordered]@{}

    try {
        $installer = New-Object -ComObject WindowsInstaller.Installer

        $database = $installer.GetType().InvokeMember(
            'OpenDatabase',
            'InvokeMethod',
            $null,
            $installer,
            @($Path, 0)  # read-only
        )

        # Read the whole Property table in one pass
        $query = 'SELECT Property, Value FROM Property'

        $view = $database.GetType().InvokeMember(
            'OpenView',
            'InvokeMethod',
            $null,
            $database,
            @($query)
        )

        $null = $view.GetType().InvokeMember(
            'Execute',
            'InvokeMethod',
            $null,
            $view,
            $null
        )

        while ($true) {
            $record = $view.GetType().InvokeMember(
                'Fetch',
                'InvokeMethod',
                $null,
                $view,
                $null
            )

            if ($null -eq $record) {
                break
            }

            # Use StringData as a PROPERTY getter (known-good COM reflection pattern)
            $name = $record.GetType().InvokeMember(
                'StringData',
                'GetProperty',
                $null,
                $record,
                @(1)
            )
            $value = $record.GetType().InvokeMember(
                'StringData',
                'GetProperty',
                $null,
                $record,
                @(2)
            )

            $name  = Convert-ToSafeString $name
            $value = Convert-ToSafeString $value

            if ($null -ne $name) {
                $table[$name] = $value
            }

            Release-ComObject $record
            $record = $null
        }

        return $table
    }
    catch {
        Write-Verbose "Get-MsiPropertyTable failed: $($_.Exception.Message)"
        return $null
    }
    finally {
        if ($null -ne $view) {
            try {
                $null = $view.GetType().InvokeMember(
                    'Close',
                    'InvokeMethod',
                    $null,
                    $view,
                    $null
                )
            } catch {
                # ignore
            }
        }

        Release-ComObject $record
        Release-ComObject $view
        Release-ComObject $database
        Release-ComObject $installer

        [GC]::Collect()
        [GC]::WaitForPendingFinalizers()
    }
}

# Validate input
if (-not (Test-Path -LiteralPath $MsiPath)) {
    throw "MSI file not found: $MsiPath"
}

$MsiPath = (Resolve-Path -LiteralPath $MsiPath).Path

if ($MsiPath -notmatch '\.msi$') {
    Write-Warning "File does not have .msi extension: $MsiPath"
}

# Read full property table once
$propertyTable = Get-MsiPropertyTable -Path $MsiPath

if ($null -eq $propertyTable) {
    throw "Unable to read MSI Property table: $MsiPath"
}

$properties = @(
    'ProductCode',
    'ProductVersion',
    'ProductName',
    'Manufacturer',
    'UpgradeCode'
)

$metadata = [ordered]@{}
foreach ($prop in $properties) {
    if ($propertyTable.Contains($prop)) {
        $metadata[$prop] = $propertyTable[$prop]
    } else {
        $metadata[$prop] = $null
    }
}

if ($DumpAllProperties) {
    $metadata['PropertyTable'] = $propertyTable
}

if ($Json) {
    $metadata | ConvertTo-Json -Depth 6
}
else {
    Write-Host ""
    Write-Host "MSI Metadata: $(Split-Path $MsiPath -Leaf)" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan

    foreach ($key in $properties) {
        $shown = Format-MetadataValue $metadata[$key]
        $padLen = [Math]::Max(1, 16 - $key.Length)
        $pad = ' ' * $padLen
        $color = if ($key -eq 'ProductCode') { 'Green' } else { 'White' }

        Write-Host ("  {0}{1} : {2}" -f $key, $pad, $shown) -ForegroundColor $color
    }

    Write-Host ""

    $productCode    = Format-MetadataValue $metadata['ProductCode']
    $productVersion = Format-MetadataValue $metadata['ProductVersion']

    Write-Host "Use in package.yaml:" -ForegroundColor DarkGray
    Write-Host "  detection:" -ForegroundColor DarkGray
    Write-Host ("    product_code: ""{0}""" -f $productCode) -ForegroundColor DarkGray
    Write-Host ("    version: ""{0}""" -f $productVersion) -ForegroundColor DarkGray

    Write-Host ""
    Write-Host "Use in uninstall command:" -ForegroundColor DarkGray
    Write-Host ("  msiexec.exe /x ""{0}"" /qn /norestart" -f $productCode) -ForegroundColor DarkGray
    Write-Host ""
}

if ($Clipboard -and $null -ne $metadata['ProductCode']) {
    $metadata['ProductCode'] | Set-Clipboard
    Write-Host "✓ ProductCode copied to clipboard." -ForegroundColor Green
}

