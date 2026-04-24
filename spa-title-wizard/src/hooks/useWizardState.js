import { useState, useCallback, useMemo } from 'react';

const INITIAL_STATE = {
  // Step 1: Basic Info
  packageId: '',
  displayName: '',
  publisher: 'Fiserv',
  version: '',
  category: '',
  gitLabGroup: 'euc/software-package-automation',

  // Step 2: Platform
  platform: '', // 'windows' | 'macos' | 'both'

  // Step 3a: Windows Config
  installerType: 'msi',
  detectionMode: 'msi-product-code',
  msiProductCode: '',
  msiProductVersion: '',
  msiProductName: '',
  msiUpgradeCode: '',
  msiManufacturer: '',
  msiFileName: '',
  exeSourceFilename: '',
  exeInstallArgs: '/S',
  exeUninstallPath: '',
  exeUninstallArgs: '/S',
  closeApps: '',
  restartBehavior: 'suppress',
  maxInstallTime: 60,
  returnCodes: '',
  regCheck32Bit: false,
  fileDetPath: '',
  fileDetName: '',
  fileDetType: 'exists',
  fileDetOperator: 'greaterThanOrEqual',
  fileDetValue: '',
  scriptRunAs32Bit: false,
  scriptEnforceSignature: false,
  scriptContent: '', // uploaded detection script content

  // Registry detection details
  regHive: 'HKLM',
  regKeyPath: '',
  regValueName: 'Version',
  regOperator: 'greaterThanOrEqual',
  regValue: '',

  // Intune Assignments
  assignments: [
    { intent: 'available', groupId: '', filterMode: 'none', filterId: '', notifications: 'showAll', deliveryOptPriority: 'notConfigured' },
  ],

  // Supersedence
  supersedesAppId: '',
  supersedenceType: 'update',

  // Requirements
  minWinRelease: '22H2',
  applicableArch: 'x64',
  minDiskSpaceMB: 500,
  minMemoryMB: 2048,

  // Lifecycle phases (PSADT)
  lifecycle: {
    repairMode: 'mirror', // 'mirror' or 'custom'
    preInstall: { closeApps: '', checkDiskSpace: false, allowDefer: 0, showProgress: false },
    install: { type: 'auto', msiFile: '', msiArgs: '/QN /norestart', exeFile: '', exeArgs: '/S' },
    postInstall: { registryMarker: false, envVar: '', envValue: '', regPath: '', regName: '', regValue: '', showCompletion: false },
    preUninstall: { closeApps: '', showProgress: false },
    uninstall: { type: 'auto', appName: '', productCode: '', exeFile: '', exeArgs: '/S', folderPath: '' },
    postUninstall: { removeRegistryMarker: false, removeEnvVar: '', removeRegPath: '' },
  },

  // Step 3b: macOS Config
  macInstallerType: 'pkg',
  bundleId: '',
  receiptId: '',
  _receiptIdManual: false,
  jamfCategory: '',
  macSelfService: false,
  scopeGroupIds: '',
  exclusionGroupIds: '',
};

const CATEGORIES = [
  { value: 'browsers', label: 'Browsers' },
  { value: 'productivity', label: 'Productivity' },
  { value: 'developer-tools', label: 'Developer Tools' },
  { value: 'security', label: 'Security' },
  { value: 'communication', label: 'Communication' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'endpoint-management', label: 'Endpoint Management' },
  { value: 'custom', label: 'Custom' },
];

const CATEGORY_TO_JAMF = {
  'browsers': 'Browsers',
  'productivity': 'Productivity',
  'developer-tools': 'Developer Tools',
  'security': 'Security',
  'communication': 'Communication',
  'utilities': 'Utilities',
  'endpoint-management': 'Endpoint Management',
  'custom': 'Custom',
};

function toKebabCase(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function useWizardState() {
  const [state, setState] = useState(INITIAL_STATE);
  const [currentStep, setCurrentStep] = useState(0);

  const updateField = useCallback((field, value) => {
    setState(prev => {
      const next = { ...prev, [field]: value };

      // Auto-derive packageId from displayName
      if (field === 'displayName') {
        next.packageId = toKebabCase(value);
      }

      // Auto-derive jamfCategory from category
      if (field === 'category') {
        next.jamfCategory = CATEGORY_TO_JAMF[value] || 'No category';
      }

      // Auto-derive receiptId from bundleId (unless user manually edited it)
      if (field === 'bundleId' && !prev._receiptIdManual) {
        next.receiptId = value.toLowerCase();
      }
      if (field === 'receiptId') {
        next._receiptIdManual = true;
      }

      // Auto-set default detection mode when installer type changes
      if (field === 'installerType') {
        next.detectionMode = value === 'msi' ? 'msi-product-code' : 'registry-marker';
      }

      return next;
    });
  }, []);

  const updateFields = useCallback((fields) => {
    setState(prev => ({ ...prev, ...fields }));
  }, []);

  const updateLifecycle = useCallback((phase, field, value) => {
    setState(prev => ({
      ...prev,
      lifecycle: {
        ...prev.lifecycle,
        [phase]: typeof prev.lifecycle[phase] === 'object'
          ? { ...prev.lifecycle[phase], [field]: value }
          : value,
      },
    }));
  }, []);

  const updateLifecycleRoot = useCallback((field, value) => {
    setState(prev => ({
      ...prev,
      lifecycle: { ...prev.lifecycle, [field]: value },
    }));
  }, []);

  // Determine visible steps based on platform
  const steps = useMemo(() => {
    const base = [
      { id: 'basic', label: 'Basic Info', icon: '📋' },
      { id: 'platform', label: 'Platform', icon: '🖥️' },
    ];

    if (state.platform === 'windows' || state.platform === 'both') {
      base.push({ id: 'windows', label: 'Windows', icon: '🪟' });
    }
    if (state.platform === 'macos' || state.platform === 'both') {
      base.push({ id: 'macos', label: 'macOS', icon: '🍎' });
    }
    if (state.platform) {
      base.push({ id: 'review', label: 'Review & Export', icon: '🚀' });
    }

    return base;
  }, [state.platform]);

  const canProceed = useMemo(() => {
    const step = steps[currentStep];
    if (!step) return false;

    switch (step.id) {
      case 'basic':
        return !!(state.displayName.trim() && state.version.trim() && state.category);
      case 'platform':
        return !!state.platform;
      case 'windows':
        return true; // Windows has sensible defaults
      case 'macos':
        return true; // macOS has sensible defaults
      case 'review':
        return true;
      default:
        return false;
    }
  }, [steps, currentStep, state]);

  const nextStep = useCallback(() => {
    if (currentStep < steps.length - 1) setCurrentStep(c => c + 1);
  }, [currentStep, steps.length]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) setCurrentStep(c => c - 1);
  }, [currentStep]);

  const goToStep = useCallback((index) => {
    if (index >= 0 && index < steps.length) setCurrentStep(index);
  }, [steps.length]);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    setCurrentStep(0);
  }, []);

  return {
    state,
    currentStep,
    steps,
    canProceed,
    updateField,
    updateFields,
    updateLifecycle,
    updateLifecycleRoot,
    nextStep,
    prevStep,
    goToStep,
    reset,
    CATEGORIES,
    CATEGORY_TO_JAMF,
  };
}
