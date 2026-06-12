import { useState, useCallback, useMemo } from 'react';
import { parseProjectFiles } from '../lib/parseProjectFiles';
import parsePsadtBlocks from '../lib/parsePsadtBlocks';

const INITIAL_STATE = {
  // Wizard mode: 'new', 'refactor', or 'edit'
  wizardMode: 'new',
  psadtVersion: '',         // 'v3' or 'v4' when refactoring
  psadtScriptVersion: '',   // e.g. '3.8.3' or '4.1.7'
  psadtFileName: '',        // original uploaded filename
  parsedPhases: {},          // per-phase action arrays from parser
  refactorConvert: false,    // true = convert to lifecycle.yaml, false = passthrough
  vsCodeOpened: false,       // true once VS Code is opened in this session to start file sync

  // Edit mode tracking
  _editProjectId: null,       // GitLab project ID when editing
  _editProjectPath: '',       // GitLab namespace path
  _editProjectUrl: '',        // GitLab web URL
  _editLoadedRef: '',         // git ref used to load files (tag name or branch)
  _editProjectTags: [],       // available tags for staleness check
  _localRepoPath: '',         // absolute path to local git clone

  // Step 1: Basic Info
  packageId: '',
  displayName: '',
  publisher: 'Fiserv',
  version: '',
  category: '',
  gitLabGroup: 'euc/software-package-automation',
  existingProject: null,
  duplicateAcknowledge: false,

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
  jamfCategoryId: '',
  macSelfService: false,
  scopeGroupIds: '31',
  exclusionGroupIds: '',
  selfServiceCategoryId: '27',
  macAppPath: '',              // e.g. '/Applications/Google Chrome.app'
  macExtensionAttribute: false, // whether to generate the Jamf extension attribute script

  // Intune App Metadata
  intuneAppName: '',
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
  pristineScripts: false,          // true = clean script without SPA comments, false = annotated script

  // Installer source on runner (leave empty to use git-committed files in windows/src/Files/)
  installerSourceDir: '',            // e.g. 'C:\\files\\7-zip'
  installerSourceFile: '',           // e.g. '7z2600-x64.msi'
  supportFilesSource: '',            // e.g. 'C:\\files\\7-zip' (defaults to installerSourceDir)
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

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
export function validatePackageId(slug) {
  if (!slug) return 'Package ID is required';
  if (slug.length < 2 || slug.length > 100) {
    return 'Package ID must be between 2 and 100 characters';
  }
  if (!SLUG_RE.test(slug)) {
    return 'Package ID must be lowercase alphanumeric with hyphens (no leading/trailing hyphens)';
  }
  return null;
}

/** Synchronizes visual action cards whenever the installerType changes (e.g. MSI <-> EXE) */
function syncInstallerActions(next, prevInstallerType) {
  if (next.installerType === prevInstallerType) return next;
  
  const phases = { ...next.lifecycle.phases };
  const value = next.installerType;

  // 1. Install phase: swap msi_install <-> exe_install
  if (phases.install && Array.isArray(phases.install.actions)) {
    phases.install.actions = phases.install.actions.map(action => {
      if (value === 'exe' && action.type === 'msi_install') {
        return {
          ...action,
          type: 'exe_install',
          file: next.installerSourceFile || next.exeSourceFilename || 'setup.exe',
          args: next.exeInstallArgs || '/S'
        };
      }
      if (value === 'msi' && action.type === 'exe_install') {
        return {
          ...action,
          type: 'msi_install',
          file: next.installerSourceFile || next.msiFileName || 'installer.msi',
          args: '/QN /norestart'
        };
      }
      return action;
    });
  }

  // 2. Uninstall phase: swap msi_uninstall <-> exe_uninstall
  if (phases.uninstall && Array.isArray(phases.uninstall.actions)) {
    phases.uninstall.actions = phases.uninstall.actions.map(action => {
      if (value === 'exe' && action.type === 'msi_uninstall') {
        return {
          ...action,
          type: 'exe_uninstall',
          file: next.exeUninstallPath || '',
          args: next.exeUninstallArgs || '/S'
        };
      }
      if (value === 'msi' && action.type === 'exe_uninstall') {
        return {
          ...action,
          type: 'msi_uninstall',
          appName: next.displayName || '',
          productCode: next.msiProductCode || '',
          args: '/qn /NORESTART'
        };
      }
      return action;
    });
  }
  
  next.lifecycle = { ...next.lifecycle, phases };
  return next;
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
        next.existingProject = null;
        next.duplicateAcknowledge = false;
      }

      if (field === 'packageId' || field === 'gitLabGroup') {
        next.existingProject = null;
        next.duplicateAcknowledge = false;
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

      // Keep intuneAppName in sync with basic info changes if untouched or currently matching the old default
      const oldDefault = `${prev.displayName || ''} ${prev.version || ''}`.trim().replace(/\s+/g, ' ');
      if (['displayName', 'version'].includes(field)) {
        if (!prev.intuneAppName || prev.intuneAppName === oldDefault) {
          const name = field === 'displayName' ? value : prev.displayName;
          const ver = field === 'version' ? value : prev.version;
          next.intuneAppName = `${name || ''} ${ver || ''}`.trim().replace(/\s+/g, ' ');
        }
      }

      // Auto-migrate action cards when installerType changes
      if (field === 'installerType') {
        return syncInstallerActions(next, prev.installerType);
      }

      return next;
    });
  }, []);

  const updateFields = useCallback((fields) => {
    setState(prev => {
      const next = { ...prev, ...fields };
      if (fields.hasOwnProperty('installerType')) {
        return syncInstallerActions(next, prev.installerType);
      }
      return next;
    });
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

  // Determine visible steps based on platform and mode
  const steps = useMemo(() => {
    if (state.wizardMode === 'refactor') {
      // Refactor mode: skip Platform (always Windows)
      return [
        { id: 'basic', label: 'Project Info', icon: '📋' },
        { id: 'installer', label: 'Installer', icon: '📦' },
        { id: 'psadt', label: 'PSADT', icon: '⚡' },
        { id: 'intune', label: 'Intune', icon: '☁️' },
        { id: 'review', label: 'Review & Export', icon: '🚀' },
      ];
    }

    // New title and edit mode
    const base = [
      { id: 'basic', label: 'Project Info', icon: '📋' },
    ];

    if (state.platform === 'windows' || state.platform === 'both') {
      base.push({ id: 'installer', label: 'Installer', icon: '📦' });
      base.push({ id: 'psadt', label: 'PSADT', icon: '⚡' });
      base.push({ id: 'intune', label: 'Intune', icon: '☁️' });
    }
    if (state.platform === 'macos' || state.platform === 'both') {
      base.push({ id: 'macos', label: 'macOS', icon: '🍎' });
    }
    if (state.platform) {
      base.push({ id: 'review', label: 'Review & Export', icon: '🚀' });
    }

    return base;
  }, [state.platform, state.wizardMode]);

  const canProceed = useMemo(() => {
    const step = steps[currentStep];
    if (!step) return false;

    switch (step.id) {
      case 'basic': {
        const hasRequired = !!(state.displayName.trim() && state.version.trim() && state.category && state.platform);
        if (!hasRequired) return false;
        if (validatePackageId(state.packageId) !== null) return false;
        if (state.existingProject && state.wizardMode !== 'edit' && !state.duplicateAcknowledge) {
          return false;
        }
        return true;
      }
      case 'psadt':
        return true;
      case 'installer':
        return true; // Installer source is optional guidance, not a blocker
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
      // Only seed for new title mode (skip for refactors — both passthrough and convert)
      if (prev.wizardMode === 'refactor') return prev;

      // Only seed if all phases are empty (user hasn't added anything yet)
      const allEmpty = Object.values(prev.lifecycle.phases).every(p => !p.actions || p.actions.length === 0);
      if (!allEmpty) return prev;

      const phases = { ...prev.lifecycle.phases };
      const mkPhase = (key, actions) => {
        phases[key] = { ...phases[key], actions };
      };

      // Derive source filename from installer source fields
      const srcFile = prev.installerSourceFile || '';

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
  /**
   * Import parsed PSADT fields into wizard state.
   * @param {Object} parsedResult - from parsePsadtFile()
   * @param {Object} wizardFields - from toWizardState()
   * @param {boolean} convertToLifecycle - true if user chose "Convert to Lifecycle"
   */
  const importPsadtState = useCallback((parsedResult, wizardFields, convertToLifecycle = true) => {
    setState(prev => {
      const next = { ...prev };

      // Merge wizard fields, but protect basic-info fields already set by Intune
      const intuneProtectedFields = ['displayName', 'publisher', 'version', 'appDescription'];
      for (const [key, value] of Object.entries(wizardFields)) {
        if (value == null || value === '') continue;
        // If Intune already populated this field, keep the Intune value
        if (intuneProtectedFields.includes(key) && prev._intuneExportImported && prev[key] && prev[key] !== INITIAL_STATE[key]) {
          continue;
        }
        next[key] = value;
      }

      next.wizardMode = 'refactor';
      next.refactorConvert = true;
      next.vsCodeOpened = false;
      next.psadtVersion = parsedResult.psadtVersion || '';
      next.psadtScriptVersion = parsedResult.psadtScriptVersion || '';
      next.psadtFileName = parsedResult.fileName || '';
      next.parsedPhases = parsedResult.parsedPhases || {};

      // Store raw result for scaffolding (refactor mode needs scriptContent)
      next._psadtResult = parsedResult;
      // Also store scriptContent directly on state for reliable access in scaffolding
      if (parsedResult.scriptContent) {
        next._scriptContent = parsedResult.scriptContent;
      }

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

      // Auto-populate intuneAppName if not already set
      if (!next.intuneAppName) {
        next.intuneAppName = `${next.displayName || ''} ${next.version || ''}`.trim().replace(/\s+/g, ' ');
      }

      // Auto-fill installer source filename from parsed MSI/EXE data
      if (!next.installerSourceFile) {
        if (next.installerType === 'msi' && next.msiFileName) {
          next.installerSourceFile = next.msiFileName;
        } else if (next.installerType === 'exe' && next.exeSourceFilename) {
          next.installerSourceFile = next.exeSourceFilename;
        }
      }

      // Ensure platform is set for the wizard flow
      if (!next.platform) {
        next.platform = 'windows';
      }

      return next;
    });
    setCurrentStep(0);
  }, []);

  /**
   * Import parsed Intune export fields into wizard state.
   * Does NOT overwrite fields already populated by a prior PSADT import.
   * @param {Object} intuneFields — from parseIntuneExport().fields
   */
  const importIntuneExport = useCallback((intuneFields) => {
    setState(prev => {
      const next = { ...prev };
      next._intuneExportImported = true;
      next.wizardMode = 'refactor';
      next.vsCodeOpened = false;

      // Merge each field — skip if PSADT already populated it
      for (const [key, value] of Object.entries(intuneFields)) {
        if (value == null || value === '') continue;
        // For key fields that PSADT may have set, only overwrite if currently empty/default
        const psadtPriorityFields = ['displayName', 'publisher', 'version'];
        if (psadtPriorityFields.includes(key) && prev[key] && prev[key] !== INITIAL_STATE[key]) {
          continue;
        }
        next[key] = value;
      }

      // If we got a displayName from Intune, map it to intuneAppName to keep customization
      if (intuneFields.displayName) {
        next.intuneAppName = intuneFields.displayName;
      }

      // Auto-derive packageId from displayName
      if (next.displayName && (!next.packageId || next.packageId === prev.packageId || next.packageId === INITIAL_STATE.packageId)) {
        next.packageId = toKebabCase(next.displayName);
      }

      // Ensure platform is set
      if (!next.platform) next.platform = 'windows';

      return next;
    });
  }, []);

  /**
   * Import project files from GitLab into wizard state (Edit Existing mode).
   * @param {Object} files — { [path]: content } from clone endpoint
   * @param {Object} projectMeta — { id, path, path_with_namespace, web_url, default_branch, loadedRef, tags, localPath }
   */
  const importProjectForEdit = useCallback((files, projectMeta) => {
    let parsedPsadt = null;
    const ps1Path = files['windows/src/Invoke-AppDeployToolkit.ps1'] ? 'windows/src/Invoke-AppDeployToolkit.ps1' : (files['windows/src/Deploy-Application.ps1'] ? 'windows/src/Deploy-Application.ps1' : null);

    if (ps1Path && files[ps1Path]) {
      parsedPsadt = parsePsadtBlocks(files[ps1Path]);
    }

    // ── Fast path: state snapshot exists → direct hydration ────────────
    if (files['spa-wizard-state.json']) {
      try {
        const snapshot = JSON.parse(files['spa-wizard-state.json']);

        // If we successfully parsed action blocks from the PS1 script, override the visual phase actions!
        // ONLY if the script actually has SPA:Action comment blocks, ensuring we don't erase visual blocks for clean scripts
        const hasComments = ps1Path && files[ps1Path] && /#\s*<SPA:Action/i.test(files[ps1Path]);

        if (parsedPsadt && hasComments) {
          snapshot.lifecycle = parsedPsadt.lifecycle;
        }

        if (ps1Path) {
          snapshot.psadtFileName = ps1Path.split('/').pop();
        }

        setState(prev => ({
          ...prev,
          ...snapshot,
          wizardMode: 'edit',
          _editProjectId: projectMeta.id,
          _editProjectPath: projectMeta.path_with_namespace,
          _editProjectUrl: projectMeta.web_url,
          _editLoadedRef: projectMeta.loadedRef || projectMeta.default_branch || 'main',
          _editProjectTags: projectMeta.tags || [],
          _localRepoPath: projectMeta.localPath || '',
          vsCodeOpened: false,
        }));
        setCurrentStep(0);
        console.log(`✅ Loaded project from snapshot (${Object.keys(files).length} files, PS1: ${ps1Path || 'none'})`);
        return;
      } catch (e) {
        console.warn('⚠️ Failed to parse spa-wizard-state.json, falling back to file parsing:', e.message);
      }
    }

    // ── Fallback: parse individual config files (legacy projects) ──────
    const { state: parsed, warnings } = parseProjectFiles(files);
    if (warnings.length > 0) {
      console.warn('⚠️ Project import warnings:', warnings);
    }

    setState(prev => {
      const next = { ...prev, ...parsed };
      next.wizardMode = 'edit';
      next.vsCodeOpened = false;
      if (ps1Path) {
        next.psadtFileName = ps1Path.split('/').pop();
      }
      next._editProjectId = projectMeta.id;
      next._editProjectPath = projectMeta.path_with_namespace;
      next._editProjectUrl = projectMeta.web_url;
      next._editLoadedRef = projectMeta.loadedRef || projectMeta.default_branch || 'main';
      next._editProjectTags = projectMeta.tags || [];
      next._localRepoPath = projectMeta.localPath || '';

      // Derive gitLabGroup from the project path (remove /software-titles/slug)
      const nsPath = projectMeta.path_with_namespace || '';
      const groupMatch = nsPath.match(/^(.+)\/software-titles\/.+$/);
      if (groupMatch) {
        next.gitLabGroup = groupMatch[1];
      }

      // Apply parsed actions from the PS1 script if available, else fallback to metadata parsing
      if (parsedPsadt) {
        next.lifecycle = parsedPsadt.lifecycle;
      } else {
        if (parsed._lifecycleRepairMode) {
          next.lifecycle = { ...prev.lifecycle, repairMode: parsed._lifecycleRepairMode };
        }
        if (parsed._lifecycleVarActions || parsed._lifecyclePhases) {
          const phases = { ...prev.lifecycle.phases };
          if (parsed._lifecycleVarActions) {
            phases.variableDeclaration = { actions: parsed._lifecycleVarActions };
          }
          if (parsed._lifecyclePhases) {
            for (const [phaseKey, actions] of Object.entries(parsed._lifecyclePhases)) {
              if (phases[phaseKey]) {
                phases[phaseKey] = { actions: actions.map(a => ({ ...a, enabled: true })) };
              }
            }
          }
          next.lifecycle = { ...(next.lifecycle || prev.lifecycle), phases };
        }
      }

      // Clean up temporary parse keys
      delete next._lifecycleRepairMode;
      delete next._lifecycleVarActions;
      delete next._lifecyclePhases;

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
    importIntuneExport,
    importProjectForEdit,
    nextStep,
    prevStep,
    goToStep,
    reset,
    CATEGORIES,
    CATEGORY_TO_JAMF,
  };
}
