/**
 * Returns a stable JSON string of the fields that constitute a project's
 * "content". Used to detect whether the user has made real changes since
 * the last load/reset/publish.
 *
 * Fields intentionally EXCLUDED (they change automatically without user input):
 *   gitLabGroup / gitLabWinGroup / gitLabMacGroup  — pushed from server config
 *   existingProject / duplicateAcknowledge         — set by project-existence lookup
 *   vsCodeOpened / _psadtActiveTab                 — UI bookkeeping
 *   _editProject* / _localRepoPath                 — load-time metadata
 *   _lastPublishResult / syncPendingFields         — async results
 *   wizardMode / psadtVersion / psadtScriptVersion — set at load time
 *   parsedPhases / refactorConvert / psadtFileName — set at load time
 *   _intuneExportImported                          — set by Intune import flow
 *   platform                                       — set before opening the wizard
 */
export function getProjectFingerprint(state) {
  const content = {
    // Core identity
    packageId:         state.packageId         || '',
    displayName:       state.displayName        || '',
    publisher:         state.publisher          || '',
    version:           state.version            || '',
    category:          state.category           || '',

    // Windows installer
    installerType:          state.installerType          || '',
    installerSourceFile:    state.installerSourceFile    || '',
    msiProductCode:         state.msiProductCode         || '',
    msiProductVersion:      state.msiProductVersion      || '',
    msiProductName:         state.msiProductName         || '',
    msiUpgradeCode:         state.msiUpgradeCode         || '',
    msiManufacturer:        state.msiManufacturer        || '',
    msiFileName:            state.msiFileName            || '',
    exeSourceFilename:      state.exeSourceFilename      || '',
    exeInstallArgs:         state.exeInstallArgs         || '',
    exeUninstallPath:       state.exeUninstallPath       || '',
    exeUninstallArgs:       state.exeUninstallArgs       || '',
    closeApps:              state.closeApps              || '',
    restartBehavior:        state.restartBehavior        || '',
    maxInstallTime:         state.maxInstallTime         ?? 60,
    allowAvailableUninstall: state.allowAvailableUninstall ?? true,

    // Detection
    detectionMode:    state.detectionMode    || '',
    detectionMethod:  state.detectionMethod  || '',
    detectionRules:   state.detectionRules   || [],
    scriptRunAs32Bit:       state.scriptRunAs32Bit       ?? false,
    scriptEnforceSignature: state.scriptEnforceSignature ?? false,
    scriptContent:          state.scriptContent          || '',

    // Intune
    appDescription:   state.appDescription   || '',
    appOwner:         state.appOwner          || '',
    appDeveloper:     state.appDeveloper      || '',
    appNotes:         state.appNotes          || '',
    returnCodes:      state.returnCodes       || [],
    assignments:      state.assignments       || [],
    supersedences:    state.supersedences     || [],
    dependencies:     state.dependencies      || [],
    syncIntuneAppId:  state.syncIntuneAppId   || '',
    _intuneAppNameOverride: state._intuneAppNameOverride || '',
    intuneWin32AppId:       state.intuneWin32AppId       || '',

    // PSADT lifecycle
    lifecycle: state.lifecycle || {},

    // Mac
    macInstallerType: state.macInstallerType || '',
    macInstallerSourceFile: state.macInstallerSourceFile || '',
    macAppBundleId: state.macAppBundleId || '',
    macVersion: state.macVersion || '',
    macScriptContent: state.macScriptContent || '',
  };

  return JSON.stringify(content);
}
