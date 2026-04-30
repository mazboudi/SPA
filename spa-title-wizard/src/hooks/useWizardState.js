import { useState, useCallback, useMemo } from 'react';

const INITIAL_STATE = {
  // Wizard mode: 'new' or 'refactor'
  wizardMode: 'new',
  psadtVersion: '',         // 'v3' or 'v4' when refactoring
  psadtScriptVersion: '',   // e.g. '3.8.3' or '4.1.7'
  psadtFileName: '',        // original uploaded filename
  parsedPhases: {},          // per-phase action arrays from parser

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
  minWinRelease: 'Windows11_22H2',
  applicableArch: 'x64',
  minDiskSpaceMB: 500,
  minMemoryMB: 2048,

  // Lifecycle phases (PSADT) — 10-phase model with actions arrays
  lifecycle: {
    repairMode: 'mirror', // 'mirror' or 'custom'
    phases: {
      variableDeclaration: { actions: [] },
      preInstall:    { actions: [] },
      install:       { actions: [] },
      postInstall:   { actions: [] },
      preUninstall:  { actions: [] },
      uninstall:     { actions: [] },
      postUninstall: { actions: [] },
      preRepair:     { actions: [] },
      repair:        { actions: [] },
      postRepair:    { actions: [] },
    },
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

  // Intune App Metadata
  appDescription: '',
  informationUrl: '',
  privacyUrl: '',
  appOwner: 'EUC Packaging',
  appDeveloper: '',
  appNotes: 'Managed by SPA pipeline.',
  isFeatured: false,
  installContext: 'system',
  logoFile: null,       // File object from upload
  logoDataUrl: '',      // base64 data URL for preview

  // PSADT Deploy Mode
  deployMode: 'Silent',            // 'Silent' | 'NonInteractive' | 'Interactive'
  allowRebootPassThru: false,

  // Installer source on runner (leave empty to use git-committed files in windows/src/Files/)
  installerSource: '',             // e.g. 'C:\\files\\7-zip\\7z2600-x64.msi'
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

  // ── Lifecycle action CRUD ──────────────────────────────────────────────
  const addAction = useCallback((phaseKey, action) => {
    setState(prev => {
      const phases = { ...prev.lifecycle.phases };
      phases[phaseKey] = { ...phases[phaseKey], actions: [...(phases[phaseKey]?.actions || []), action] };
      return { ...prev, lifecycle: { ...prev.lifecycle, phases } };
    });
  }, []);

  const removeAction = useCallback((phaseKey, index) => {
    setState(prev => {
      const phases = { ...prev.lifecycle.phases };
      const actions = [...(phases[phaseKey]?.actions || [])];
      actions.splice(index, 1);
      phases[phaseKey] = { ...phases[phaseKey], actions };
      return { ...prev, lifecycle: { ...prev.lifecycle, phases } };
    });
  }, []);

  const updateAction = useCallback((phaseKey, index, updates) => {
    setState(prev => {
      const phases = { ...prev.lifecycle.phases };
      const actions = [...(phases[phaseKey]?.actions || [])];
      actions[index] = { ...actions[index], ...updates };
      phases[phaseKey] = { ...phases[phaseKey], actions };
      return { ...prev, lifecycle: { ...prev.lifecycle, phases } };
    });
  }, []);

  const moveAction = useCallback((phaseKey, fromIndex, toIndex) => {
    setState(prev => {
      const phases = { ...prev.lifecycle.phases };
      const actions = [...(phases[phaseKey]?.actions || [])];
      const [item] = actions.splice(fromIndex, 1);
      actions.splice(toIndex, 0, item);
      phases[phaseKey] = { ...phases[phaseKey], actions };
      return { ...prev, lifecycle: { ...prev.lifecycle, phases } };
    });
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
      base.push({ id: 'psadt', label: 'PSADT Lifecycle', icon: '⚡' });
      base.push({ id: 'installer', label: 'Installer', icon: '📦' });
      base.push({ id: 'intune', label: 'Intune', icon: '☁️' });
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
      case 'psadt':
        return true;
      case 'installer':
        return !!(state.installerSource && state.installerSource.trim());
      case 'intune':
        return true;
      case 'macos':
        return true;
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

  /**
   * Import parsed PSADT fields into wizard state.
   * Called after parsePsadtFile() + toWizardState() succeeds.
   * @param {Object} parsedResult - from parsePsadtFile()
   * @param {Object} wizardFields - from toWizardState()
   */
  const importPsadtState = useCallback((parsedResult, wizardFields) => {
    setState(prev => {
      const next = { ...prev, ...wizardFields };
      next.wizardMode = 'refactor';
      next.psadtVersion = parsedResult.psadtVersion || '';
      next.psadtScriptVersion = parsedResult.psadtScriptVersion || '';
      next.psadtFileName = parsedResult.fileName || '';
      next.parsedPhases = parsedResult.parsedPhases || {};

      // Store raw result for scaffolding (refactor mode needs scriptContent)
      next._psadtResult = parsedResult;

      // Populate lifecycle phases from parsed actions (both modes may have variable declarations)
      const phaseSrc = parsedResult.parsedPhases || {};
      if (Object.keys(phaseSrc).length > 0) {
        const phases = { ...prev.lifecycle.phases };
        for (const [phaseKey, actions] of Object.entries(phaseSrc)) {
          if (phases[phaseKey]) {
            phases[phaseKey] = {
              ...phases[phaseKey],
              actions: actions.map(a => ({ ...a, enabled: true })),
            };
          }
        }
        next.lifecycle = { ...prev.lifecycle, phases };
      }

      // Auto-derive packageId if displayName was set
      if (next.displayName && (!next.packageId || next.packageId === prev.packageId)) {
        next.packageId = toKebabCase(next.displayName);
      }

      return next;
    });
    setCurrentStep(0);
  }, []);

  return {
    state,
    currentStep,
    steps,
    canProceed,
    updateField,
    updateFields,
    addAction,
    removeAction,
    updateAction,
    moveAction,
    updateLifecycleRoot,
    importPsadtState,
    nextStep,
    prevStep,
    goToStep,
    reset,
    CATEGORIES,
    CATEGORY_TO_JAMF,
  };
}
