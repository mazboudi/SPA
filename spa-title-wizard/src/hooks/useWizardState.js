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
  restartBehavior: 'basedOnReturnCode',
  maxInstallTime: 60,
  allowAvailableUninstall: true,

  // Return codes (Intune Win32 app defaults)
  returnCodes: [
    { code: 0,    type: 'success' },
    { code: 1707, type: 'success' },
    { code: 3010, type: 'softReboot' },
    { code: 1641, type: 'hardReboot' },
    { code: 1618, type: 'retry' },
  ],

  // Detection — method: 'manual' or 'script'
  detectionMethod: 'manual',
  // Manual detection rules (array of typed rule objects)
  detectionRules: [],
  // Script detection
  scriptRunAs32Bit: false,
  scriptEnforceSignature: false,
  scriptContent: '',

  // Intune Assignments
  assignments: [
    { intent: 'available', groupId: '', filterMode: 'none', filterId: '', notifications: 'showAll', deliveryOptPriority: 'notConfigured' },
  ],

  // Supersedence
  supersedesAppId: '',
  supersedenceType: 'update', // 'update' = uninstall previous, 'replace' = side-by-side

  // Dependencies
  dependencies: [],  // [{ appId: '', dependencyType: 'autoInstall' }]  — 'autoInstall' | 'detect'

  // Requirements
  minWinRelease: 'Windows11_22H2',
  archCheckEnabled: false,       // false = all architectures, true = specify
  archX86: false,
  archX64: true,
  archArm64: false,
  minDiskSpaceMB: 500,
  minMemoryMB: 2048,
  minLogicalProcessors: null,
  minCpuSpeedMHz: null,
  customRequirements: [],  // [{ type: 'file'|'registry', ...fields }]

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

      // Auto-derive developer from MSI manufacturer
      if (field === 'msiManufacturer' && value) {
        next.appDeveloper = value;
      }

      // Note: Detection rules are now managed in the Detection step via detectionRules array

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
      base.push({ id: 'installer', label: 'Installer', icon: '📦' });
      base.push({ id: 'detection', label: 'Detection', icon: '🔍' });
      base.push({ id: 'psadt', label: 'PSADT Lifecycle', icon: '⚡' });
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
      case 'detection':
        return true;
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

  // ── Auto-seed default lifecycle actions for new titles ─────────────────
  const seedDefaultLifecycleActions = useCallback((targetStepId) => {
    if (targetStepId !== 'psadt') return;
    setState(prev => {
      // Only seed for new title mode
      if (prev.wizardMode === 'refactor') return prev;

      // Only seed if all phases are empty (user hasn't added anything yet)
      const allEmpty = Object.values(prev.lifecycle.phases).every(p => !p.actions || p.actions.length === 0);
      if (!allEmpty) return prev;

      const phases = { ...prev.lifecycle.phases };
      const mkPhase = (key, actions) => {
        phases[key] = { ...phases[key], actions };
      };

      // Derive source filename from installerSource path
      const srcFile = prev.installerSource
        ? prev.installerSource.split(/[\\/]/).pop()
        : '';

      if (prev.installerType === 'msi') {
        const msiFile = prev.msiFileName || srcFile || 'installer.msi';
        mkPhase('install', [
          { type: 'msi_install', enabled: true, file: msiFile, args: '/QN /norestart' },
        ]);
        mkPhase('uninstall', [
          { type: 'msi_uninstall', enabled: true, appName: prev.displayName || '', productCode: prev.msiProductCode || '', args: '/qn /NORESTART' },
        ]);
      } else if (prev.installerType === 'exe') {
        const exeFile = prev.exeSourceFilename || srcFile || 'setup.exe';
        mkPhase('install', [
          { type: 'exe_install', enabled: true, file: exeFile, args: prev.exeInstallArgs || '/S' },
        ]);
        mkPhase('uninstall', [
          { type: 'exe_uninstall', enabled: true, file: prev.exeUninstallPath || '', args: prev.exeUninstallArgs || '/S' },
        ]);
      }

      return { ...prev, lifecycle: { ...prev.lifecycle, phases } };
    });
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < steps.length - 1) {
      const targetId = steps[currentStep + 1]?.id;
      seedDefaultLifecycleActions(targetId);
      setCurrentStep(c => c + 1);
    }
  }, [currentStep, steps, seedDefaultLifecycleActions]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) setCurrentStep(c => c - 1);
  }, [currentStep]);

  const goToStep = useCallback((index) => {
    if (index >= 0 && index < steps.length) {
      const targetId = steps[index]?.id;
      seedDefaultLifecycleActions(targetId);
      setCurrentStep(index);
    }
  }, [steps, seedDefaultLifecycleActions]);

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
