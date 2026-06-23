/**
 * deriveState.js
 *
 * Pure function that computes all derived values from raw wizard state.
 * Called via useMemo in useWizardState — runs on every state change,
 * ensuring consumers always see up-to-date derived values.
 *
 * Rules:
 *   1. Source fields are stored in rawState as-is (displayName, version, etc.)
 *   2. Derived fields are computed here, never stored
 *   3. User overrides are stored with _ prefix (e.g. _intuneAppNameOverride)
 *   4. PSADT vars with _userEdited flag are preserved as-is
 */

/**
 * Map of PSADT variable names → raw state field keys.
 * deriveState patches variable action values from these source fields
 * unless the user has manually edited the variable.
 */
const PSADT_VAR_SOURCE_MAP = {
  '$appVendor':       'publisher',
  '$appName':         'displayName',     // value transform: strip whitespace
  '$appVersion':      'version',
  '$appScriptAuthor': 'appOwner',        // fallback: 'EUC Packaging'
};

/**
 * Compute all derived values from raw wizard state.
 * @param {Object} raw — the raw state from useState
 * @returns {Object} — state with derived values applied
 */
export function deriveState(raw) {
  // Shallow clone the top-level object
  const state = { ...raw };

  // ── Derived: Intune App Name ─────────────────────────────────────────
  // Use explicit user override if set, otherwise compute from displayName + version.
  // This ensures the Intune App Name always stays current when either field changes,
  // unless the user deliberately customized it.
  const computedIntuneAppName = `${raw.displayName || ''} ${raw.version || ''}`.trim().replace(/\s+/g, ' ');

  // Detect stale auto-generated overrides: if the override looks like
  // "DisplayName <old-version>" (displayName followed by a version number),
  // it was set by a previous import/save and should NOT block recalculation.
  // Only true user-custom names (e.g. "My Custom Portal Name") are preserved.
  let effectiveOverride = raw._intuneAppNameOverride;
  if (effectiveOverride && raw.displayName) {
    const prefix = raw.displayName.trim();
    if (effectiveOverride.startsWith(prefix + ' ')) {
      const suffix = effectiveOverride.slice(prefix.length + 1).trim();
      // If the part after displayName starts with a digit, it's a version → auto-generated
      if (/^\d/.test(suffix)) {
        effectiveOverride = null;
      }
    } else if (effectiveOverride === prefix) {
      // Override is just the display name with no version — also auto-generated
      effectiveOverride = null;
    }
  }

  state.intuneAppName = effectiveOverride || computedIntuneAppName;

  // ── Derived: PSADT Variable Values ───────────────────────────────────
  // Patch variableDeclaration action values from wizard source fields.
  // Skips system-managed, read-only, and user-edited variables.
  const varPhase = raw.lifecycle?.phases?.variableDeclaration;
  const existingActions = varPhase?.actions;
  if (existingActions && existingActions.length > 0) {
    let changed = false;
    const patchedActions = existingActions.map(action => {
      // Only patch custom_variable actions that aren't locked
      if (action.type !== 'custom_variable') return action;
      if (action.readOnly || action.systemManaged) return action;
      if (action._userEdited) return action;

      const sourceField = PSADT_VAR_SOURCE_MAP[action.name];
      if (!sourceField) return action;

      // Compute the derived value from the source field
      let derivedValue;
      if (action.name === '$appName') {
        derivedValue = (raw.displayName || '').replace(/\s+/g, '');
      } else if (action.name === '$appScriptAuthor') {
        derivedValue = raw.appOwner || 'EUC Packaging';
      } else {
        derivedValue = raw[sourceField] || '';
      }

      // Only create a new object if the value actually changed
      if (action.value === derivedValue) return action;

      changed = true;
      return {
        ...action,
        value: derivedValue,
        desc: `${action.name} = '${derivedValue}'`,
      };
    });

    if (changed) {
      state.lifecycle = {
        ...raw.lifecycle,
        phases: {
          ...raw.lifecycle.phases,
          variableDeclaration: {
            ...varPhase,
            actions: patchedActions,
          },
        },
      };
    }
  }

  // Derive softwareCategory from basic info category if not already set (e.g. from sync/import)
  if (!state.softwareCategory && state.category) {
    const map = {
      'browsers': 'Browsers',
      'productivity': 'Productivity',
      'developer-tools': 'Developer Tools',
      'security': 'Security',
      'communication': 'Communication',
      'utilities': 'Utilities',
      'endpoint-management': 'Endpoint Management',
      'custom': 'Custom',
    };
    state.softwareCategory = map[state.category] || '';
  }

  return state;
}
