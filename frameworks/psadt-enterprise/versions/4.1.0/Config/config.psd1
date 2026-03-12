@{
    ##*===============================================
    ##  PSADT Enterprise — Org Config
    ##  Framework: psadt-enterprise 4.1.0
    ##*===============================================

    ## Toolkit settings
    Toolkit = @{
        # Show a balloon notification on install/uninstall complete
        BalloonNotifications        = $true

        # Silent installs that take longer than this (minutes) will log a warning
        SilentInstallTimeout        = 90

        # Path where toolkit log files are written
        LogPath                     = "$env:SystemRoot\Logs\SWPackaging"

        # Org-specific log file prefix
        LogFileNamePrefix           = 'PSAppDeploy_'

        # Whether to compress log files after 30 days
        CompressLogs                = $true

        # Directory for support files accessible to scripts
        SupportFilesPath            = 'SupportFiles'
    }

    ## App settings defaults (can be overridden per-title in Deploy-Application.ps1)
    App = @{
        # Default restart behaviour passed to Intune (suppress = no restart)
        RestartBehavior             = 'suppress'

        # Default deployment version tag written to registry marker
        RegistryMarkerBase          = 'HKLM:\SOFTWARE\YourOrg\InstalledApps'
    }

    ## UI settings
    UI = @{
        # Countdown (seconds) before force-closing blocking applications
        CloseAppsCountdown          = 60

        # Hard countdown before force-kill even if user doesn't acknowledge
        ForceCloseAppsCountdown     = 180

        # Org logo path in Assets\ folder (used in dialogs and balloon notifications)
        BannerIconFileName          = 'Banner.png'
    }

    ## Exit codes
    ExitCodes = @{
        # Standard success
        Success                     = 0

        # Soft reboot required (handled by Intune restart policy)
        RestartRequired             = 3010

        # Generic failure
        Failure                     = 60001

        # User deferred the installation
        UserDeferred                = 1618
    }
}
