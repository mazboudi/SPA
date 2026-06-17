export function generateIntuneExport(state) {
  const getApplicableArchitectures = () => {
    if (!state.archCheckEnabled) return 'x86,x64,arm64';
    const archs = [];
    if (state.archX86) archs.push('x86');
    if (state.archX64) archs.push('x64');
    if (state.archArm64) archs.push('arm64');
    return archs.join(',') || 'x64';
  };

  const app = {
    '@odata.type': '#microsoft.graph.win32LobApp',
    displayName: state.intuneAppName || `${state.displayName || ''} ${state.version || ''}`.trim().replace(/\s+/g, ' '),
    description: state.appDescription || '',
    publisher: state.publisher || '',
    displayVersion: state.version || '',
    informationUrl: state.informationUrl || '',
    privacyInformationUrl: state.privacyUrl || '',
    owner: state.appOwner || 'EUC Packaging',
    developer: state.appDeveloper || '',
    notes: state.appNotes || 'Managed by SPA pipeline.',
    isFeatured: !!state.isFeatured,
    allowAvailableUninstall: state.allowAvailableUninstall ?? true,
    applicableArchitectures: getApplicableArchitectures(),
    minimumSupportedWindowsRelease: state.minWinRelease || 'Windows11_22H2',
    minimumFreeDiskSpaceInMB: state.minDiskSpaceMB ?? null,
    minimumMemoryInMB: state.minMemoryMB ?? null,
    minimumNumberOfProcessors: state.minLogicalProcessors ?? null,
    minimumCpuSpeedInMHz: state.minCpuSpeedMHz ?? null,
    installExperience: {
      deviceRestartBehavior: state.restartBehavior || 'suppress',
      maxRunTimeInMinutes: state.maxInstallTime || 60,
      runAsAccount: state.installContext || 'system',
    },
    returnCodes: (state.returnCodes || []).map(rc => ({
      returnCode: parseInt(rc.code) || 0,
      type: rc.type || 'success',
    })),
  };

  const assignments = (state.assignments || []).map(a => {
    const target = {
      groupId: a.groupId || '',
      deviceAndAppManagementAssignmentFilterType: a.filterMode || 'none',
      deviceAndAppManagementAssignmentFilterId: a.filterId || '',
    };
    const settings = {
      notifications: a.notifications || 'showAll',
      deliveryOptimizationPriority: a.deliveryOptPriority || 'notConfigured',
    };
    return {
      intent: a.intent,
      target,
      settings,
    };
  });

  return { app, assignments };
}
