function Write-PackagingRegistryMarker {
    param(
        [string]$AppName,
        [string]$VendorVersion,
        [string]$PackagingVersion,
        [string]$FrameworkVersion
    )
    Write-Host "Writing registry marker for $AppName $VendorVersion ($PackagingVersion) using $FrameworkVersion"
}
