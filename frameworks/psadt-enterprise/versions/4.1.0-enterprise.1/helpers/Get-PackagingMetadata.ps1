function Get-PackagingMetadata {
    [CmdletBinding()]
    param([string]$Path)
    Get-Content -Path $Path -Raw
}
