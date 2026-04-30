/**
 * actionTypes.js
 * Central registry of supported PSADT lifecycle action types.
 * Each type defines its schema, applicable phases, and UI rendering hints.
 *
 * Priority actions = fully supported in the wizard UI.
 * Non-priority actions can be added to generated code manually.
 */

/** All PSADT lifecycle phase keys */
export const PHASE_KEYS = [
  'variableDeclaration',
  'preInstall',
  'install',
  'postInstall',
  'preUninstall',
  'uninstall',
  'postUninstall',
  'preRepair',
  'repair',
  'postRepair',
];

/** Phase display metadata */
export const PHASE_META = {
  variableDeclaration: { label: 'Variable Declaration', icon: '📝', short: 'Vars' },
  preInstall:          { label: 'Pre-Installation',     icon: '📥', short: 'Pre-Install' },
  install:             { label: 'Installation',         icon: '⚙️', short: 'Install' },
  postInstall:         { label: 'Post-Installation',    icon: '✅', short: 'Post-Install' },
  preUninstall:        { label: 'Pre-Uninstallation',   icon: '🔽', short: 'Pre-Uninstall' },
  uninstall:           { label: 'Uninstallation',       icon: '🗑️', short: 'Uninstall' },
  postUninstall:       { label: 'Post-Uninstallation',  icon: '🧹', short: 'Post-Uninstall' },
  preRepair:           { label: 'Pre-Repair',           icon: '🔧', short: 'Pre-Repair' },
  repair:              { label: 'Repair',               icon: '🔨', short: 'Repair' },
  postRepair:          { label: 'Post-Repair',          icon: '✨', short: 'Post-Repair' },
};

/**
 * Action type definitions.
 *
 * Each entry:
 *   type          - unique key (used in state + lifecycle.yaml)
 *   label         - human-readable label
 *   icon          - emoji for UI
 *   category      - grouping for the "Add Action" picker
 *   phases        - array of phase keys where this action is valid
 *   fields        - array of { key, label, type, placeholder?, required?, default? }
 *                   type: 'text' | 'textarea' | 'number' | 'boolean' | 'guids'
 */
export const ACTION_TYPES = [
  // ── Installers ────────────────────────────────────────────────────────
  {
    type: 'msi_install',
    label: 'MSI Install',
    icon: '📦',
    category: 'Installer',
    phases: ['install', 'repair'],
    fields: [
      { key: 'file', label: 'MSI File', type: 'text', placeholder: 'app.msi', required: true },
      { key: 'args', label: 'Arguments', type: 'text', placeholder: '/QN /norestart', default: '/QN /norestart' },
    ],
  },
  {
    type: 'msi_uninstall',
    label: 'MSI Uninstall',
    icon: '🗑️',
    category: 'Installer',
    phases: ['uninstall', 'preInstall', 'preRepair'],
    fields: [
      { key: 'appName', label: 'App Name', type: 'text', placeholder: 'Application Name' },
      { key: 'productCode', label: 'Product Code (GUID)', type: 'text', placeholder: '{GUID}' },
      { key: 'args', label: 'Arguments', type: 'text', placeholder: '/qn /NORESTART' },
    ],
  },
  {
    type: 'msi_uninstall_batch',
    label: 'Batch MSI Uninstall (GUIDs)',
    icon: '🗑️',
    category: 'Installer',
    phases: ['preInstall', 'preRepair', 'uninstall'],
    fields: [
      { key: 'guids', label: 'Product Code GUIDs (one per line)', type: 'guids', required: true },
    ],
  },
  {
    type: 'exe_install',
    label: 'EXE Install',
    icon: '⚙️',
    category: 'Installer',
    phases: ['install', 'repair'],
    fields: [
      { key: 'file', label: 'EXE File Path', type: 'text', placeholder: 'setup.exe', required: true },
      { key: 'args', label: 'Arguments', type: 'text', placeholder: '/S', default: '/S' },
    ],
  },
  {
    type: 'exe_uninstall',
    label: 'EXE Uninstall',
    icon: '🗑️',
    category: 'Installer',
    phases: ['uninstall', 'preInstall'],
    fields: [
      { key: 'file', label: 'Uninstaller Path', type: 'text', placeholder: 'C:\\Program Files\\App\\uninstall.exe', required: true },
      { key: 'args', label: 'Arguments', type: 'text', placeholder: '/S', default: '/S' },
    ],
  },

  // ── Process & Script ──────────────────────────────────────────────────
  {
    type: 'execute_process',
    label: 'Run Process / Script',
    icon: '▶️',
    category: 'Process',
    phases: PHASE_KEYS,
    fields: [
      { key: 'file', label: 'File Path', type: 'text', placeholder: 'powershell.exe', required: true },
      { key: 'args', label: 'Arguments', type: 'text', placeholder: '-ExecutionPolicy Bypass -File script.ps1' },
    ],
  },
  {
    type: 'stop_process',
    label: 'Stop / Close Apps',
    icon: '🛑',
    category: 'Process',
    phases: ['preInstall', 'preUninstall', 'preRepair'],
    fields: [
      { key: 'closeApps', label: 'Process Names (comma-separated)', type: 'text', placeholder: 'chrome,firefox', required: true },
    ],
  },

  // ── File Operations ───────────────────────────────────────────────────
  {
    type: 'file_copy',
    label: 'Copy File / Folder',
    icon: '📋',
    category: 'File Operations',
    phases: ['preInstall', 'install', 'postInstall', 'repair', 'postRepair'],
    fields: [
      { key: 'source', label: 'Source Path', type: 'text', required: true },
      { key: 'dest', label: 'Destination Path', type: 'text', required: true },
    ],
  },
  {
    type: 'file_remove',
    label: 'Delete File / Folder',
    icon: '🧹',
    category: 'File Operations',
    phases: ['preInstall', 'postInstall', 'postUninstall', 'postRepair'],
    fields: [
      { key: 'path', label: 'Path to Remove', type: 'text', required: true },
    ],
  },
  {
    type: 'create_folder',
    label: 'Create Folder',
    icon: '📁',
    category: 'File Operations',
    phases: ['preInstall', 'install', 'postInstall'],
    fields: [
      { key: 'path', label: 'Folder Path', type: 'text', required: true },
    ],
  },

  // ── Registry ──────────────────────────────────────────────────────────
  {
    type: 'registry_set',
    label: 'Set Registry Value',
    icon: '🔑',
    category: 'Registry',
    phases: ['postInstall', 'postRepair', 'preInstall', 'install'],
    fields: [
      { key: 'key', label: 'Registry Key Path', type: 'text', placeholder: 'HKLM:\\SOFTWARE\\...', required: true },
      { key: 'name', label: 'Value Name', type: 'text', required: true },
      { key: 'value', label: 'Value Data', type: 'text', required: true },
    ],
  },
  {
    type: 'registry_remove',
    label: 'Remove Registry Key / Value',
    icon: '🔑',
    category: 'Registry',
    phases: ['postUninstall', 'postInstall', 'preInstall'],
    fields: [
      { key: 'key', label: 'Registry Key Path', type: 'text', placeholder: 'HKLM:\\SOFTWARE\\...', required: true },
      { key: 'name', label: 'Value Name (blank = entire key)', type: 'text', placeholder: 'Leave empty to remove entire key' },
    ],
  },
  {
    type: 'registry_marker',
    label: 'Write Fiserv Detection Marker',
    icon: '🏷️',
    category: 'Registry',
    phases: ['postInstall', 'postRepair'],
    fields: [],  // auto-populated from app metadata
  },
  {
    type: 'remove_registry_marker',
    label: 'Remove Fiserv Detection Marker',
    icon: '🏷️',
    category: 'Registry',
    phases: ['postUninstall'],
    fields: [],
  },

  // ── Environment Variables ─────────────────────────────────────────────
  {
    type: 'env_variable',
    label: 'Set Environment Variable',
    icon: '🌍',
    category: 'Environment',
    phases: ['postInstall', 'preInstall', 'postRepair'],
    fields: [
      { key: 'name', label: 'Variable Name', type: 'text', required: true },
      { key: 'value', label: 'Variable Value', type: 'text', required: true },
    ],
  },
  {
    type: 'remove_env_variable',
    label: 'Remove Environment Variable',
    icon: '🌍',
    category: 'Environment',
    phases: ['postUninstall'],
    fields: [
      { key: 'name', label: 'Variable Name', type: 'text', required: true },
    ],
  },

  // ── UI / Prompts ──────────────────────────────────────────────────────
  {
    type: 'show_welcome',
    label: 'Show Welcome Dialog',
    icon: '👋',
    category: 'UI Prompts',
    phases: ['preInstall', 'preUninstall', 'preRepair'],
    fields: [
      { key: 'closeApps', label: 'Close Apps', type: 'text' },
      { key: 'deferTimes', label: 'Defer Times', type: 'number', default: 0 },
      { key: 'checkDiskSpace', label: 'Check Disk Space', type: 'boolean', default: false },
    ],
  },
  {
    type: 'show_progress',
    label: 'Show Progress Dialog',
    icon: '⏳',
    category: 'UI Prompts',
    phases: ['preInstall', 'install', 'preUninstall', 'uninstall', 'preRepair', 'repair'],
    fields: [],
  },
  {
    type: 'show_completion',
    label: 'Show Completion Message',
    icon: '🎉',
    category: 'UI Prompts',
    phases: ['postInstall', 'postRepair'],
    fields: [],
  },

  // ── Variables ─────────────────────────────────────────────────────────
  {
    type: 'custom_variable',
    label: 'Custom Variable',
    icon: '📝',
    category: 'Variables',
    phases: ['variableDeclaration'],
    fields: [
      { key: 'name', label: 'Variable Name', type: 'text', placeholder: '$myVar', required: true },
      { key: 'value', label: 'Value', type: 'text', required: true },
    ],
  },

  // ── Misc ──────────────────────────────────────────────────────────────
  {
    type: 'sleep',
    label: 'Wait / Delay',
    icon: '⏱️',
    category: 'Misc',
    phases: PHASE_KEYS,
    fields: [
      { key: 'seconds', label: 'Seconds', type: 'number', default: 5, required: true },
    ],
  },

  // ── Custom / Unmatched ─────────────────────────────────────────────────
  {
    type: 'custom_script',
    label: 'Custom PowerShell',
    icon: '📜',
    category: 'Custom',
    phases: PHASE_KEYS,
    fields: [
      { key: 'code', label: 'PowerShell Code', type: 'textarea', placeholder: '# Custom PowerShell commands', required: true },
      { key: 'note', label: 'Note', type: 'text', placeholder: 'Brief description of what this does' },
    ],
  },
];

/** Lookup map: type → definition */
export const ACTION_TYPE_MAP = Object.fromEntries(ACTION_TYPES.map(a => [a.type, a]));

/** Get action types applicable to a given phase */
export function getActionsForPhase(phaseKey) {
  return ACTION_TYPES.filter(a => a.phases.includes(phaseKey));
}

/** Get unique categories for a phase's applicable actions */
export function getCategoriesForPhase(phaseKey) {
  const actions = getActionsForPhase(phaseKey);
  return [...new Set(actions.map(a => a.category))];
}

/** Create a new empty action with defaults */
export function createAction(type) {
  const def = ACTION_TYPE_MAP[type];
  if (!def) return { type, enabled: true };
  const action = { type, enabled: true };
  for (const f of def.fields) {
    action[f.key] = f.default ?? (f.type === 'boolean' ? false : f.type === 'number' ? 0 : f.type === 'guids' ? [] : '');
  }
  return action;
}
