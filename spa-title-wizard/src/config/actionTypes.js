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

import commands from './commands.json';
import parameters from './parameters.json';

/**
 * Action type definitions dynamically constructed from commands.json and parameters.json
 */
export const ACTION_TYPES = commands.map(cmd => {
  const fields = parameters
    .filter(param => param.cmdlet === cmd.name)
    .map(param => ({
      key: param.parameter,
      label: param.label,
      type: param.type,
      placeholder: param.placeholder,
      required: !!param.required,
      default: param.default
    }));
  
  return {
    type: cmd.name,
    label: cmd.label,
    icon: cmd.icon,
    category: cmd.category,
    phases: cmd.supportedPhases,
    fields
  };
});

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
