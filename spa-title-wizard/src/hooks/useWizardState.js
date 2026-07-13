import { useState, useCallback, useMemo, useRef } from 'react';
import { parseProjectFiles } from '../lib/parseProjectFiles';
import parsePsadtBlocks from '../lib/parsePsadtBlocks';
import { deriveState } from './deriveState';

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
  // Platform-specific GitLab groups (populated from server health response)
  gitLabWinGroup: 'euc/software-package-automation',
  gitLabMacGroup: 'euc/software-package-automation',
  existingProject: null,
  duplicateAcknowledge: false,

  // Step 2: Platform
  platform: '', // 'windows' | 'macos'

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

  // Supersedences (up to 10, matching Intune Graph API limit)
  // Each entry: { appId: string, supersedenceType: 'replace' | 'update' }
  supersedences: [],

  // Dependencies
  dependencies: [],  // [{ appId: '', dependencyType: 'autoInstall' }]  — 'autoInstall' | 'detect'

  // Intune Sync — the Intune app ID explicitly chosen by the user for syncing
  syncIntuneAppId: '',
  syncPendingFields: [],  // array of compareIntuneState field keys pulled from Intune

  // Intune App Information
  softwareCategory: '',  // Intune Company Portal category (e.g. 'Productivity', 'Business')
  intuneCategoryIds: [], // Intune category GUIDs/IDs to write to app.json
  roleScopeTagIds: [],   // Scope Tag GUIDs/IDs to write to app.json

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


  // Lifecycle phases (PSADT) — 7-phase model with actions arrays
  lifecycle: {
    phases: {
      variableDeclaration: { actions: [] },
      preInstall:    { actions: [] },
      install:       { actions: [] },
      postInstall:   { actions: [] },
      preUninstall:  { actions: [] },
      uninstall:     { actions: [] },
      postUninstall: { actions: [] },
    },
  },

  // Step 3b: macOS Config
  macSourceDir:  '',           // Directory portion of the runner path  e.g. '/ApplicationSource/Chrome'
  macSourceFile: '',           // Filename e.g. 'googlechrome.pkg'
  macInstallerType: 'pkg',     // Auto-derived from extension; kept for pipeline compatibility
  macStagedInstaller: null,    // { dataUrl, fileName, sizeBytes } — set when user stages a local file for git upload
  pkgProductVersion: '',       // Extracted from PKG metadata (informational)
  bundleId: '',
  receiptId: '',
  _receiptIdManual: false,

  // Package configuration
  macMinOs: '13.0',            // Minimum macOS version (Ventura default)
  macPackageNotes: 'Deployed by SPA pipeline. Do not modify directly in Jamf.', // Package record notes
  macRebootRequired: false,    // Reboot required after install

  // Jamf category + scope
  jamfCategory: '',
  jamfCategoryId: '',
  scopeGroupIds: '31',
  exclusionGroupIds: '',

  // Policy configuration
  macPolicyFrequency: 'Ongoing',          // Jamf policy frequency
  macPolicyTriggers: ['checkin'],          // Array: checkin, enrollment, login, startup, custom
  macPolicyCustomTrigger: '',              // Custom event name (when 'custom' is in triggers)

  // Self Service
  macSelfService: false,
  selfServiceCategoryId: '27',
  macSelfServiceDescription: '',          // Description shown in Self Service

  // Detection
  macAppPath: '',              // e.g. '/Applications/Google Chrome.app'
  macExtensionAttribute: false, // whether to generate the Jamf extension attribute script
  macEaVersionKey: 'CFBundleShortVersionString', // plist key for version extraction

  // Inline pre/post install scripts
  macEnablePreInstall: false,
  macPreInstallScript: '#!/usr/bin/env bash\n# preinstall — runs before the package installs\nset -euo pipefail\n\n# TODO: Add pre-install logic here\n\nexit 0\n',
  macEnablePostInstall: false,
  macPostInstallScript: '#!/usr/bin/env bash\n# postinstall — runs after the package installs\nset -euo pipefail\n\n# TODO: Add post-install logic here\n\nexit 0\n',

  // SMB file share — installer source on a Windows share accessed by the Linux runner
  macSmbEnabled:      false,   // toggle: pull installer from a Windows SMB share
  macSmbShare:        '',      // e.g. //fileserver.corp.com/apps  (UNC-style, forward slashes)
  macSmbPathInShare:  '',      // relative path within the share, e.g. Chrome/googlechrome.pkg
  macSmbUserVar:      'MAC_SMB_USER',    // GitLab CI variable name holding the SMB username
  macSmbPassVar:      'MAC_SMB_PASS',    // GitLab CI variable name holding the SMB password
  macSmbDomainVar:    'MAC_SMB_DOMAIN',  // GitLab CI variable name holding the AD domain (optional)

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
  installerSubfolder: '',            // optional subfolder within Files/ e.g. 'Bin' or 'x64\\Setup'
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

/**
 * Walks all lifecycle action cards and updates any 'file' field that matches
 * the old installer filename. This keeps Start-ADTProcess / Start-ADTMsiProcess
 * cards in sync as the user types the full path without requiring the
 * installerType to change.
 */
function syncActionFileReferences(next, oldFile) {
  if (!oldFile) return next;
  const newFile = next.installerSourceFile || '';
  const oldBase = oldFile.split(/[\\/]/).pop(); // basename only
  const newBase = newFile.split(/[\\/]/).pop();
  const phases = { ...next.lifecycle.phases };
  Object.keys(phases).forEach(phaseKey => {
    phases[phaseKey] = {
      ...phases[phaseKey],
      actions: (phases[phaseKey].actions || []).map(action => {
        if (action.file === oldFile || action.file === oldBase) {
          return { ...action, file: newBase || newFile };
        }
        return action;
      }),
    };
  });
  return { ...next, lifecycle: { ...next.lifecycle, phases } };
}

/** Synchronizes visual action cards whenever the installerType changes (e.g. MSI <-> EXE) */
function syncInstallerActions(next, prevInstallerType) {
  if (next.installerType === prevInstallerType) return next;
  
  const phases = { ...next.lifecycle.phases };
  const value = next.installerType;

  // 1. Install phase: swap start_msi_process <-> start_process
  if (phases.install && Array.isArray(phases.install.actions)) {
    phases.install.actions = phases.install.actions.map(action => {
      if (value === 'exe' && action.type === 'start_msi_process') {
        return {
          ...action,
          type: 'start_process',
          file: next.installerSourceFile || next.exeSourceFilename || 'setup.exe',
          args: next.exeInstallArgs || '/S'
        };
      }
      if (value === 'msi' && action.type === 'start_process') {
        return {
          ...action,
          type: 'start_msi_process',
          file: next.installerSourceFile || next.msiFileName || 'installer.msi',
          args: '/QN /norestart'
        };
      }
      return action;
    });
  }

  // 2. Uninstall phase: swap uninstall_application <-> start_process
  if (phases.uninstall && Array.isArray(phases.uninstall.actions)) {
    phases.uninstall.actions = phases.uninstall.actions.map(action => {
      if (value === 'exe' && action.type === 'uninstall_application') {
        return {
          ...action,
          type: 'start_process',
          file: next.exeUninstallPath || '',
          args: next.exeUninstallArgs || '/S'
        };
      }
      // Be careful swapping start_process -> uninstall_application (only swap if it looks like the main uninstaller)
      if (value === 'msi' && action.type === 'start_process' && action.file === (next.exeUninstallPath || '')) {
        return {
          ...action,
          type: 'uninstall_application',
          name: next.displayName || '',
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
  const [rawState, setRawState] = useState(INITIAL_STATE);
  const state = useMemo(() => deriveState(rawState), [rawState]);
  const [currentStep, setCurrentStep] = useState(0);

  // ── Dirty tracking ──────────────────────────────────────────────────────
  // isDirtyRef is true only when the user has made real edits after a load/reset.
  // We use a ref so toggling it doesn't cause extra re-renders.
  //
  // IMPORTANT: markDirty() is NOT called automatically inside updateField or
  // lifecycle CRUD functions — because those are also used by useEffect auto-sync
  // (Intune pull, VS Code sync, normalization flush, server group config, etc.)
  // which must NOT trigger the "unsaved work" guard.
  //
  // Instead, markDirty() is exported and must be called explicitly from actual
  // user-triggered event handlers in UI components.
  const isDirtyRef = useRef(false);
  const markDirty = useCallback(() => { isDirtyRef.current = true; }, []);
  const markClean = useCallback(() => { isDirtyRef.current = false; }, []);

  // All internal writes go to setRawState, consumers read from `state` (derived)
  const setState = setRawState;

  const updateField = useCallback((field, value) => {
    setState(prev => {
      const next = { ...prev, [field]: value };

      // Auto-derive packageId from displayName — applies in ALL modes.
      // The field is always read-only in the UI; derivation ensures consistency
      // when Display Name is changed (e.g. clone mode).
      if (field === 'displayName') {
        next.packageId = toKebabCase(value);
        // Only reset duplicate state in non-edit modes
        if (prev.wizardMode !== 'edit') {
          next.existingProject = null;
          next.duplicateAcknowledge = false;
        }
        if (prev.displayName && prev._intuneAppNameOverride && prev._intuneAppNameOverride.includes(prev.displayName)) {
          next._intuneAppNameOverride = prev._intuneAppNameOverride.replace(prev.displayName, value);
        }
      }

      if (field === 'version') {
        if (prev.version && prev._intuneAppNameOverride && prev._intuneAppNameOverride.includes(prev.version)) {
          next._intuneAppNameOverride = prev._intuneAppNameOverride.replace(prev.version, value);
        }
      }

      if (field === 'packageId' || field === 'gitLabGroup') {
        next.existingProject = null;
        next.duplicateAcknowledge = false;
      }

      // When platform changes, derive gitLabGroup from the platform-specific group
      if (field === 'platform') {
        if (value === 'windows') {
          next.gitLabGroup = prev.gitLabWinGroup || prev.gitLabGroup;
        } else if (value === 'macos') {
          next.gitLabGroup = prev.gitLabMacGroup || prev.gitLabGroup;
        }
        // Reset existingProject since it belongs to the old platform's group
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

      // intuneAppName is derived by deriveState() from displayName + version.
      // No manual sync needed here.

      // Auto-migrate action cards when installerType changes
      if (field === 'installerType') {
        return syncInstallerActions(next, prev.installerType);
      }

      // Keep action card file references in sync as the user edits the installer filename
      if (field === 'installerSourceFile' && value !== prev.installerSourceFile) {
        return syncActionFileReferences(next, prev.installerSourceFile || '');
      }

      return next;
    });
  }, []);

  const updateFields = useCallback((fields) => {
    setState(prev => {
      const next = { ...prev, ...fields };

      if (fields.displayName !== undefined && prev.displayName && prev._intuneAppNameOverride && prev._intuneAppNameOverride.includes(prev.displayName)) {
        next._intuneAppNameOverride = prev._intuneAppNameOverride.replace(prev.displayName, fields.displayName);
      }

      if (fields.version !== undefined && prev.version && prev._intuneAppNameOverride && prev._intuneAppNameOverride.includes(prev.version)) {
        next._intuneAppNameOverride = prev._intuneAppNameOverride.replace(prev.version, fields.version);
      }

      if (fields.hasOwnProperty('installerType')) {
        return syncInstallerActions(next, prev.installerType);
      }

      // Keep action card file references in sync as the user edits the installer filename
      if (fields.hasOwnProperty('installerSourceFile') && fields.installerSourceFile !== prev.installerSourceFile) {
        return syncActionFileReferences(next, prev.installerSourceFile || '');
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
      base.push({ id: 'mac-installer', label: 'Mac Installer', icon: '📦' });
      base.push({ id: 'macos',         label: 'macOS Config',  icon: '🍎' });
    }
    if (state.platform) {
      base.push({ id: 'review', label: 'Review & Export', icon: '🚀' });
    }

    return base;
  }, [state.platform, state.wizardMode]);

  // ── Per-step required-field validation ─────────────────────────────────
  // Called for ANY step (not just current), so the sidebar can show red/green.
  const isStepValid = useCallback((stepId) => {
    switch (stepId) {

      case 'basic': {
        const hasRequired = !!(state.displayName.trim() && state.version.trim() && state.category && state.platform);
        if (!hasRequired) return false;
        if (validatePackageId(state.packageId) !== null) return false;
        if (state.existingProject && state.wizardMode !== 'edit' && !state.duplicateAcknowledge) return false;
        return true;
      }

      case 'psadt':
        // PSADT lifecycle is pre-seeded; no user-facing required field gates it
        return true;

      case 'installer':
        // The installer source file path is the only required field (marked "required" in the UI)
        return !!(state.installerSourceFile || '').trim();

      case 'intune': {
        const intuneAppName = state.intuneAppName || `${state.displayName || ''} ${state.version || ''}`.trim().replace(/\s+/g, ' ');
        if (!intuneAppName) return false;
        if (!(state.appDescription || '').trim()) return false;
        if (!(state.publisher || '').trim()) return false;
        const detRules = state.detectionRules || [];
        if (state.detectionMethod === 'script') {
          if (!(state.scriptContent || '').trim()) return false;
        } else {
          if (detRules.length === 0) return false;
        }
        return true;
      }

      case 'mac-installer': {
        if (state.macSmbEnabled) {
          // SMB mode: share URL and path within share are both required
          return !!(state.macSmbShare || '').trim() && !!(state.macSmbPathInShare || '').trim();
        }
        // Local/NFS mode: source file path required
        return !!(state.macSourceFile || '').trim();
      }

      case 'macos':
        // Application Path (.app bundle) is the only required field
        return !!(state.macAppPath || '').trim();

      case 'review':
        return true;

      default:
        return true;
    }
  }, [state]);

  // Per-step validation map exposed to consumers (e.g. Sidebar)
  const stepValidation = useMemo(() => {
    const map = {};
    (steps || []).forEach(s => { map[s.id] = isStepValid(s.id); });
    return map;
  }, [steps, isStepValid]);

  const canProceed = useMemo(() => {
    const step = steps[currentStep];
    if (!step) return false;
    return isStepValid(step.id);
  }, [steps, currentStep, isStepValid]);

  // True when every step in the current wizard flow passes validation.
  // Used by ReviewStep to gate Build / Build+Publish / Build+Publish+Assign.
  const allStepsValid = useMemo(
    () => (steps || []).every(s => isStepValid(s.id)),
    [steps, isStepValid]
  );

  // ── Auto-seed default lifecycle actions for new titles ─────────────────
  const seedDefaultLifecycleActions = useCallback((targetStepId) => {
    if (targetStepId !== 'psadt') return;
    setState(prev => {
      // Only seed for new title mode (skip for refactors — both passthrough and convert)
      if (prev.wizardMode === 'refactor') return prev;
      // Skip if editing an existing project
      if (prev.wizardMode === 'edit') return prev;

      // Only seed if all phases are empty (user hasn't added anything yet)
      const allEmpty = Object.values(prev.lifecycle.phases).every(p => !p.actions || p.actions.length === 0);
      if (!allEmpty) return prev;

      const phases = { ...prev.lifecycle.phases };
      const mkPhase = (key, actions) => {
        phases[key] = { ...phases[key], actions };
      };

      // ── 1. Variable declarations ──────────────────────────────────────
      const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
      const stdVarActions = [
        { name: '$appVendor',        value: prev.publisher || '' },
        { name: '$appName',          value: (prev.displayName || '').replace(/\s+/g, '') },
        { name: '$appVersion',       value: prev.version || '' },
        { name: '$appArch',          value: '' },
        { name: '$appLang',          value: 'EN' },
        { name: '$appRevision',      value: '01' },
        { name: '$adtSession.AppProcessesToClose', value: '' },
        { name: '$appScriptVersion', value: '1.0.0' },
        { name: '$appScriptDate',    value: today },
        { name: '$appScriptAuthor',  value: prev.appOwner || 'EUC Packaging' },
      ].map(v => ({
        type: 'custom_variable',
        desc: `${v.name} = '${v.value}'`,
        name: v.name,
        value: v.value,
        enabled: true,
      }));

      const systemVarActions = [
        { name: '$adtSession.RequireAdmin',                value: '$true',                          desc: 'Require admin privileges' },
        { name: '$adtSession.DeployAppScriptFriendlyName', value: '$MyInvocation.MyCommand.Name',   desc: 'Script friendly name (auto-set)' },
        { name: '$adtSession.DeployAppScriptParameters',   value: '$PSBoundParameters',             desc: 'Bound parameters (auto-set)' },
        { name: '$adtSession.DeployAppScriptVersion',      value: '4.1.8',                          desc: 'Framework version (auto-set)' },
      ].map(v => ({
        type: 'custom_variable',
        desc: `${v.name} = ${v.value}`,
        name: v.name,
        value: v.value,
        enabled: true,
        readOnly: true,
        systemManaged: true,
      }));

      mkPhase('variableDeclaration', [...stdVarActions, ...systemVarActions]);

      // ── 2. Install / Uninstall actions ────────────────────────────────
      // Note: action.file stores the bare filename (e.g. 'setup.exe').
      // The installer subfolder prefix ($adtSession.DirFiles\Bin\) is applied
      // at script generation time in generatePsadtScript.js.
      const srcFile = prev.installerSourceFile || '';

      if (prev.installerType === 'msi') {
        const msiFile = prev.msiFileName || srcFile || 'installer.msi';
        mkPhase('install', [
          { type: 'start_msi_process', enabled: true, file: msiFile, args: '/QN /norestart' },
        ]);
        mkPhase('uninstall', [
          { type: 'uninstall_application', enabled: true, name: prev.displayName || '', productCode: prev.msiProductCode || '', args: '/qn /NORESTART' },
        ]);
      } else if (prev.installerType === 'exe') {
        const exeFile = prev.exeSourceFilename || srcFile || 'setup.exe';
        mkPhase('install', [
          { type: 'start_process', enabled: true, file: exeFile, args: prev.exeInstallArgs || '/S' },
        ]);
        mkPhase('uninstall', [
          { type: 'start_process', enabled: true, file: prev.exeUninstallPath || '', args: prev.exeUninstallArgs || '/S' },
        ]);
      }


      // ── 3. Pre-Install / Pre-Uninstall / Pre-Repair welcome + progress ─
      const defaultWelcome = {
        type: 'show_welcome', enabled: true,
        allowDefer: true, deferTimes: 3, deferDays: 0, deferDeadline: '',
        checkDiskSpace: true, persistPrompt: true,
        closeProcessesCountdown: 0, forceCloseProcessesCountdown: 0,
        blockExecution: false,
      };
      const countdownWelcome = {
        type: 'show_welcome', enabled: true,
        allowDefer: false, deferTimes: 0, deferDays: 0, deferDeadline: '',
        checkDiskSpace: false, persistPrompt: false,
        closeProcessesCountdown: 60, forceCloseProcessesCountdown: 0,
        blockExecution: false,
      };
      const defaultProgress = { type: 'show_progress', enabled: true, statusMessage: '', topMost: true };

      mkPhase('preInstall',   [defaultWelcome, defaultProgress]);
      mkPhase('preUninstall', [countdownWelcome, defaultProgress]);

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
    markClean();
  }, [markClean]);

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

      // intuneAppName is derived by deriveState() — no explicit set needed here

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
      // Start from a clean slate — same as reset() — so that switching from
      // one Intune app to another doesn't leave stale fields from the previous app.
      // Only carry over the fields that should survive a title switch.
      const next = {
        ...INITIAL_STATE,
        // Preserve platform selection and server-configured group paths
        platform:                  prev.platform                  || INITIAL_STATE.platform,
        gitLabGroup:               prev.gitLabGroup               || INITIAL_STATE.gitLabGroup,
        gitLabWinGroup:            prev.gitLabWinGroup            || INITIAL_STATE.gitLabWinGroup,
        gitLabMacGroup:            prev.gitLabMacGroup            || INITIAL_STATE.gitLabMacGroup,
        gitLabCiTemplatesProject:  prev.gitLabCiTemplatesProject  || '',
      };

      next._intuneExportImported = true;
      next.wizardMode = 'refactor';
      next.vsCodeOpened = false;

      // Apply all Intune fields onto the clean state
      for (const [key, value] of Object.entries(intuneFields)) {
        if (value == null || value === '') continue;
        next[key] = value;
      }

      // If the Intune displayName differs from the auto-generated pattern,
      // store it as an explicit override so deriveState preserves it.
      if (intuneFields.displayName) {
        const autoPattern = `${next.displayName || ''} ${next.version || ''}`.trim().replace(/\s+/g, ' ');
        if (intuneFields.displayName !== autoPattern) {
          next._intuneAppNameOverride = intuneFields.displayName;
        }
      }

      // Auto-derive packageId from displayName
      if (next.displayName && (!next.packageId || next.packageId === INITIAL_STATE.packageId)) {
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

        // Clean up stale _intuneAppNameOverride: if it matches the auto-generated
        // pattern (displayName + version), it was never intentionally customized.
        // Remove it so deriveState() auto-calculates correctly going forward.
        if (snapshot._intuneAppNameOverride) {
          const autoPattern = `${snapshot.displayName || ''} ${snapshot.version || ''}`.trim().replace(/\s+/g, ' ');
          if (snapshot._intuneAppNameOverride === autoPattern || snapshot._intuneAppNameOverride === (snapshot.displayName || '').trim()) {
            delete snapshot._intuneAppNameOverride;
          }
        }

        // Always clear session-only results so the Review section starts fresh
        delete snapshot._lastPublishResult;
        delete snapshot._psadtActiveTab;

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
          // Always clear session-only state so new session starts fresh
          _lastPublishResult: null,
          _psadtActiveTab: null,
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
        // Mark clean immediately after load — no user edits yet
        markClean();
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

      // Derive gitLabGroup from the project path: everything except the last segment (the slug).
      // e.g. 'euc/software-package-automation/software-titles/node-js'
      //   → gitLabGroup = 'euc/software-package-automation/software-titles'
      const nsPath = projectMeta.path_with_namespace || '';
      if (nsPath.includes('/')) {
        next.gitLabGroup = nsPath.substring(0, nsPath.lastIndexOf('/'));
      }

      // Apply parsed actions from the PS1 script if available, else fallback to metadata parsing
      if (parsedPsadt) {
        next.lifecycle = parsedPsadt.lifecycle;
      } else {
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

      // Always clear session-only results so Review section starts fresh
      delete next._lastPublishResult;
      delete next._psadtActiveTab;

      return next;
    });
    setCurrentStep(0);
    // Mark clean — project just loaded, no user changes yet
    markClean();
  }, [markClean]);

  /**
   * Clone an existing project: load all its config exactly like an edit,
   * but clear the fields that must be unique / re-entered for a new title:
   *   - packageId (slug) — must be unique
   *   - version — must be set fresh
   *   - installer source path + file (runner-specific, not carried over)
   *   - MSI metadata (tied to the specific binary)
   *   - all publish/session artifacts
   * Everything else (detection rules, lifecycle/PSADT actions, Intune config,
   * requirements, dependencies) is preserved as a starting point.
   */
  const importProjectForClone = useCallback((files, projectMeta) => {
    // Reuse the full edit import to populate all fields from the source project
    importProjectForEdit(files, projectMeta);

    // After import completes (next tick), clear clone-specific fields
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        // Identity — packageId is derived from the copied displayName so it
        // appears immediately. The user changes Display Name to make it unique,
        // which will re-derive packageId automatically.
        packageId:            toKebabCase(prev.displayName || ''),
        // Version — must be set explicitly for the new title
        version:              '',
        // Installer source — runner path is specific to the source title
        installerSourceDir:   '',
        installerSourceFile:  '',
        installerSubfolder:   '',
        supportFilesSource:   '',
        // MSI metadata — tied to the specific binary
        msiProductCode:       '',
        msiProductVersion:    '',
        msiProductName:       '',
        msiManufacturer:      '',
        msiUpgradeCode:       '',
        msiFileName:          '',
        exeSourceFilename:    '',
        // Reset exe silent args? No — keep them as they likely apply to same app family
        // Mode: treat as a new package, not an update to the source
        wizardMode:           'new',
        // Clear the source project's edit metadata so publish creates a new project
        _editProjectId:       null,
        _editProjectPath:     null,
        _editProjectUrl:      null,
        _editLoadedRef:       null,
        _editProjectTags:     [],
        // Clear session artifacts
        _lastPublishResult:   null,
        _psadtActiveTab:      null,
      }));
    }, 0);
  }, [importProjectForEdit]);

  return {
    state,
    currentStep,
    steps,
    canProceed,
    stepValidation,
    allStepsValid,
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
    importProjectForClone,
    nextStep,
    prevStep,
    goToStep,
    reset,
    CATEGORIES,
    CATEGORY_TO_JAMF,
  };
}
