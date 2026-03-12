@{
    MSI = @{
        # Keep reboots suppressed by default in enterprise software delivery
        InstallParams        = 'REBOOT=ReallySuppress /QB-!'
        SilentParams         = 'REBOOT=ReallySuppress /QN'
        UninstallParams      = 'REBOOT=ReallySuppress /QN'

        # MSI logging
        LoggingOptions       = '/L*V'
        LogPath              = '$envWinDir\Logs\Software'
        LogPathNoAdminRights = '$envProgramData\Logs\Software'
        MutexWaitTime        = 600
    }

    Toolkit = @{
        # Deterministic caching location (useful for retries / repair)
        CachePath                 = '$envProgramData\SoftwareCache'

        # Logging (CMTrace format is excellent for EUC operations)
        LogStyle                  = 'CMTrace'
        LogPath                   = '$envWinDir\Logs\Software'
        LogPathNoAdminRights      = '$envProgramData\Logs\Software'
        LogAppend                 = $true
        LogMaxHistory             = 20
        LogMaxSize                = 20
        LogDebugMessage           = $false
        LogWriteToHost            = $true
        LogHostOutputToStdStreams = $false

        # Safety defaults
        RequireAdmin              = $true
        RegPath                   = 'HKLM:\SOFTWARE'
        RegPathNoAdminRights      = 'HKCU:\SOFTWARE'
        TempPath                  = '$envTemp'
        TempPathNoAdminRights     = '$envTemp'

        # Helpful for Autopilot/OOBE scenarios
        OobeDetection             = $true
        SessionDetection          = $true

        # Copy performance / compatibility
        FileCopyMode              = 'Native'
        CompressLogs              = $false
    }

    UI = @{
        # Keep the UI modern; PSADT handles silent behavior when no user is logged on
        DialogStyle                     = 'Fluent'
        BalloonNotifications            = $true
        BalloonTitle                    = 'Software Installation'

        # Intune timeout alignment (55 minutes default in PSADT)
        DefaultTimeout                  = 3300

        # Operational defaults
        DefaultExitCode                 = 1618
        DeferExitCode                   = 60012
        DynamicProcessEvaluation        = $true
        DynamicProcessEvaluationInterval= 2
        DefaultPromptPersistInterval    = 60
        PromptToSaveTimeout             = 120
        RestartPromptPersistInterval    = 600

        # Leave language auto unless you have a hard requirement
        LanguageOverride                = $null
    }

    Assets = @{
        # optional branding (only used if you include these in src/Assets)
        Logo   = '..\Assets\AppIcon.png'
        Banner = '..\Assets\Banner.Classic.png'
    }
}