@{
    ##*===============================================
    ##  PSADT Enterprise — Fiserv Org Config
    ##  Framework: psadt-enterprise 4.1.0
    ##*===============================================

    ## Toolkit settings
    Toolkit = @{
        # Show a balloon notification on install/uninstall complete
        BalloonNotifications        = $true

        # Company name displayed in dialog subtitles and balloon notifications
        CompanyName                 = 'Fiserv'

        # Silent installs that take longer than this (minutes) will log a warning
        SilentInstallTimeout        = 90

        # Path where toolkit log files are written (Fiserv standard)
        LogPath                     = 'C:\Windows\Temp\FISV\Logs'

        # Same as LogPath but used when RequireAdmin is False
        LogPathNoAdminRights        = '$envProgramData\Logs\Software'

        # Org-specific log file prefix
        LogFileNamePrefix           = 'PSAppDeploy_'

        # Use CMTrace-compatible log format
        LogStyle                    = 'CMTrace'

        # Append to existing log files rather than overwriting
        LogAppend                   = $true

        # Maximum number of previous log files to retain
        LogMaxHistory               = 10

        # Maximum file size limit for log file in megabytes (MB)
        LogMaxSize                  = 10

        # Whether to compress log files after rotation
        CompressLogs                = $false

        # Specify the path for the cache folder
        CachePath                   = '$envProgramData\SoftwareCache'

        # Directory for support files accessible to scripts
        SupportFilesPath            = 'SupportFiles'
    }

    ## App settings defaults (can be overridden per-title in Deploy-Application.ps1)
    App = @{
        # Default restart behaviour passed to Intune (suppress = no restart)
        RestartBehavior             = 'suppress'

        # Default deployment version tag written to registry marker
        RegistryMarkerBase          = 'HKLM:\SOFTWARE\Fiserv\InstalledApps'
    }

    ## UI settings
    UI = @{
        # Countdown (seconds) before force-closing blocking applications
        CloseAppsCountdown          = 60

        # Hard countdown before force-kill even if user doesn't acknowledge
        ForceCloseAppsCountdown     = 180

        # Default timeout (seconds) for installation dialogs. 55 minutes so
        # dialogs timeout before Intune's 60-minute enforcement window.
        DefaultTimeout              = 3300

        # Exit code used when a UI prompt times out
        DefaultExitCode             = 1618

        # Org logo path in Assets\ folder (used in dialogs and balloon notifications)
        BannerIconFileName          = 'Banner.png'
    }

    ## MSI defaults
    MSI = @{
        # MSI install parameters used in interactive mode
        InstallParams               = 'REBOOT=ReallySuppress /QN'

        # MSI install parameters used in silent mode
        SilentParams                = 'REBOOT=ReallySuppress /QN'

        # MSI uninstall parameters
        UninstallParams             = 'REBOOT=ReallySuppress /QN'

        # Logging level used for MSI logging
        LoggingOptions              = '/L*V'

        # The length of time in seconds to wait for the MSI installer service
        MutexWaitTime               = 600
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
