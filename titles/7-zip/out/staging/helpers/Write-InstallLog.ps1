<#
.SYNOPSIS
  Structured logging helper for PSADT scripts with consistent formatting.

.DESCRIPTION
  Wraps Write-ADTLogEntry (PSADT v4) with severity-coloured host output and
  optional transcript writing to the org log path.

.EXAMPLE
  Write-InstallLog -Message "Installing Google Chrome 134.0.6998.89" -Severity Info
  Write-InstallLog -Message "Setup.exe returned exit code 1603"       -Severity Error
#>
function Write-InstallLog {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)]
        [string] $Message,

        [ValidateSet('Info', 'Warning', 'Error', 'Debug')]
        [string] $Severity = 'Info',

        [string] $Source = 'Deploy-Application'
    )

    # Map to PSADT severity integer: 1=Info, 2=Warning, 3=Error
    $severityMap = @{ Info = 1; Debug = 1; Warning = 2; Error = 3 }
    $severityInt = $severityMap[$Severity]

    # Write through the PSADT logger if available
    if (Get-Command -Name 'Write-ADTLogEntry' -ErrorAction SilentlyContinue) {
        Write-ADTLogEntry -Message $Message -Severity $severityInt -Source $Source
    }

    # Also write to host with colour
    $colour = switch ($Severity) {
        'Info'    { 'Cyan'   }
        'Debug'   { 'Gray'   }
        'Warning' { 'Yellow' }
        'Error'   { 'Red'    }
    }

    $timestamp = Get-Date -Format 'HH:mm:ss'
    Write-Host "[$timestamp] [$Severity] $Message" -ForegroundColor $colour
}
