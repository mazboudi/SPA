import { useMemo } from 'react';
import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';
import jamfCategoriesData from '../../data/jamf-categories.json';

const FREQUENCY_OPTIONS = [
  { value: 'Ongoing',                  label: 'Ongoing' },
  { value: 'Once per computer',         label: 'Once per computer' },
  { value: 'Once per user per computer',label: 'Once per user per computer' },
  { value: 'Once per user',             label: 'Once per user' },
  { value: 'Once every day',            label: 'Once every day' },
  { value: 'Once every week',           label: 'Once every week' },
  { value: 'Once every month',          label: 'Once every month' },
];

const TRIGGER_OPTIONS = [
  { id: 'checkin',    label: 'Check-in',   hint: 'Runs at every agent check-in cycle' },
  { id: 'enrollment', label: 'Enrollment', hint: 'Runs when a Mac first enrolls in Jamf' },
  { id: 'login',      label: 'Login',      hint: 'Runs when a user logs in' },
  { id: 'startup',    label: 'Startup',    hint: 'Runs at system startup' },
  { id: 'custom',     label: 'Custom event', hint: 'Triggered by a named custom event' },
];

export default function MacConfigStep({ state, updateField }) {
  const categoryOptions = useMemo(() =>
    jamfCategoriesData.map(c => ({ value: c.id, label: c.name })), []);

  const handleCategoryChange = (id) => {
    const cat = jamfCategoriesData.find(c => c.id === id);
    updateField('jamfCategoryId', id);
    updateField('jamfCategory', cat ? cat.name : '');
  };

  const triggers = Array.isArray(state.macPolicyTriggers) ? state.macPolicyTriggers : ['checkin'];

  const toggleTrigger = (id) => {
    const next = triggers.includes(id)
      ? triggers.filter(t => t !== id)
      : [...triggers, id];
    updateField('macPolicyTriggers', next);
  };

  return (
    <div className="step-content animate-in">
      <div className="step-header">
        <h2>🍎 macOS Configuration</h2>
        <p>Configure Jamf Pro package settings, policy behaviour, Self Service, and detection.</p>
      </div>

      {/* ═══ JAMF PACKAGE ═══ */}
      <div className="config-section">
        <h3 className="section-title">Package</h3>
        <div className="form-grid">
          <SelectField
            label="Jamf Category"
            id="jamfCategory"
            value={state.jamfCategoryId || ''}
            onChange={handleCategoryChange}
            options={categoryOptions}
          />
          <FormField label="Package Notes" id="macPackageNotes" hint="Shown in the Jamf package record. Pre-filled with pipeline info.">
            <input
              id="macPackageNotes"
              type="text"
              value={state.macPackageNotes}
              onChange={e => updateField('macPackageNotes', e.target.value)}
            />
          </FormField>
        </div>
        <ToggleSwitch
          label="Reboot required after install"
          id="macRebootRequired"
          checked={state.macRebootRequired}
          onChange={v => updateField('macRebootRequired', v)}
        />
        {state.macRebootRequired && (
          <div className="mac-info-badge animate-in">
            ⚠️ Users will see a 5-minute restart countdown after installation.
            Restart message is configurable in the <code>modules/policy</code> Terraform module.
          </div>
        )}
      </div>

      {/* ═══ POLICY ═══ */}
      <div className="config-section">
        <h3 className="section-title">Policy</h3>

        {/* Scope */}
        <div className="form-grid" style={{ marginBottom: 'var(--space-md)' }}>
          <FormField label="Scope Group IDs" id="scopeGroupIds" hint="Comma-separated Jamf smart/static group IDs">
            <input
              id="scopeGroupIds"
              type="text"
              placeholder="e.g. 31, 42"
              value={state.scopeGroupIds}
              onChange={e => updateField('scopeGroupIds', e.target.value)}
            />
          </FormField>
          <FormField label="Exclusion Group IDs" id="exclusionGroupIds" hint="Groups to exclude from policy scope">
            <input
              id="exclusionGroupIds"
              type="text"
              placeholder="e.g. 99"
              value={state.exclusionGroupIds}
              onChange={e => updateField('exclusionGroupIds', e.target.value)}
            />
          </FormField>
        </div>

        {/* Frequency */}
        <div className="form-grid">
          <FormField label="Frequency" id="macPolicyFrequency" hint="How often the policy runs per computer or user">
            <select
              id="macPolicyFrequency"
              value={state.macPolicyFrequency || 'Ongoing'}
              onChange={e => updateField('macPolicyFrequency', e.target.value)}
            >
              {FREQUENCY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FormField>
        </div>

        {/* Triggers */}
        <div style={{ marginTop: 'var(--space-md)' }}>
          <label className="trigger-group-label">Policy Triggers</label>
          <p className="trigger-group-hint">Select when this policy fires. Check-in is recommended for standard deployments.</p>
          <div className="trigger-chips">
            {TRIGGER_OPTIONS.map(t => (
              <button
                key={t.id}
                type="button"
                className={`trigger-chip ${triggers.includes(t.id) ? 'trigger-chip--on' : ''}`}
                onClick={() => toggleTrigger(t.id)}
                title={t.hint}
              >
                {triggers.includes(t.id) ? '✓ ' : ''}{t.label}
              </button>
            ))}
          </div>
          {triggers.includes('custom') && (
            <FormField label="Custom event name" id="macPolicyCustomTrigger" hint="Exact event name used in your jamf binary call" style={{ marginTop: 'var(--space-sm)' }}>
              <input
                id="macPolicyCustomTrigger"
                type="text"
                placeholder="e.g. installChrome"
                value={state.macPolicyCustomTrigger}
                onChange={e => updateField('macPolicyCustomTrigger', e.target.value)}
              />
            </FormField>
          )}
        </div>
      </div>

      {/* ═══ SELF SERVICE ═══ */}
      <div className="config-section">
        <h3 className="section-title">Self Service</h3>
        <ToggleSwitch
          label="Enable Jamf Self Service"
          checked={state.macSelfService}
          onChange={v => updateField('macSelfService', v)}
          id="macSelfService"
        />
        {state.macSelfService && (
          <div className="animate-in" style={{ marginTop: 'var(--space-md)' }}>
            <div className="form-grid">
              <FormField label="Self-Service Category ID" id="selfServiceCategoryId" hint="Jamf category ID for Self Service display">
                <input
                  id="selfServiceCategoryId"
                  type="text"
                  placeholder="e.g. 27"
                  value={state.selfServiceCategoryId}
                  onChange={e => updateField('selfServiceCategoryId', e.target.value)}
                />
              </FormField>
            </div>
            <FormField label="Self Service Description" id="macSelfServiceDescription" hint="Shown below the app name in the Self Service catalog. Supports plain text.">
              <textarea
                id="macSelfServiceDescription"
                rows={3}
                placeholder={`Installs ${state.displayName || 'this application'} on your Mac.`}
                value={state.macSelfServiceDescription}
                onChange={e => updateField('macSelfServiceDescription', e.target.value)}
                style={{ resize: 'vertical', minHeight: 72 }}
              />
            </FormField>
          </div>
        )}
      </div>

      {/* ═══ PRE / POST INSTALL SCRIPTS ═══ */}
      <div className="config-section">
        <h3 className="section-title">Install Scripts</h3>
        <p className="section-desc" style={{ marginBottom: 'var(--space-md)' }}>
          Scripts are bundled into the package and run by the macOS installer.
          They are also uploaded to Jamf Pro as script records via Terraform.
        </p>

        <div className="script-toggles">
          <div className="script-block">
            <ToggleSwitch
              label="Enable Pre-install Script"
              id="macEnablePreInstall"
              checked={state.macEnablePreInstall}
              onChange={v => updateField('macEnablePreInstall', v)}
            />
            {state.macEnablePreInstall && (
              <div className="script-editor animate-in">
                <label className="script-editor-label">preinstall</label>
                <textarea
                  className="script-editor-area"
                  rows={10}
                  spellCheck={false}
                  value={state.macPreInstallScript}
                  onChange={e => updateField('macPreInstallScript', e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="script-block">
            <ToggleSwitch
              label="Enable Post-install Script"
              id="macEnablePostInstall"
              checked={state.macEnablePostInstall}
              onChange={v => updateField('macEnablePostInstall', v)}
            />
            {state.macEnablePostInstall && (
              <div className="script-editor animate-in">
                <label className="script-editor-label">postinstall</label>
                <textarea
                  className="script-editor-area"
                  rows={10}
                  spellCheck={false}
                  value={state.macPostInstallScript}
                  onChange={e => updateField('macPostInstallScript', e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ DETECTION ═══ */}
      <div className="config-section">
        <h3 className="section-title">Detection</h3>
        <ToggleSwitch
          label="Generate Jamf Extension Attribute"
          checked={state.macExtensionAttribute}
          onChange={v => updateField('macExtensionAttribute', v)}
          id="macExtensionAttribute"
        />
        {state.macExtensionAttribute && (
          <div className="form-grid animate-in" style={{ marginTop: 'var(--space-sm)' }}>
            <FormField label="Application Path" id="macAppPath" required hint="Full path to the .app bundle">
              <input
                id="macAppPath"
                type="text"
                placeholder="/Applications/AppName.app"
                value={state.macAppPath}
                onChange={e => updateField('macAppPath', e.target.value)}
              />
            </FormField>
            <FormField label="Plist Version Key" id="macEaVersionKey" hint="Info.plist key holding the version string. Override only if non-standard.">
              <input
                id="macEaVersionKey"
                type="text"
                value={state.macEaVersionKey || 'CFBundleShortVersionString'}
                onChange={e => updateField('macEaVersionKey', e.target.value)}
              />
            </FormField>
          </div>
        )}
        {state.macExtensionAttribute && state.macAppPath && (
          <div className="step-preview-badge animate-in">
            <span className="badge-label">Extension Attribute command</span>
            <code>defaults read &quot;{state.macAppPath}/Contents/Info&quot; {state.macEaVersionKey || 'CFBundleShortVersionString'}</code>
          </div>
        )}
      </div>

      <style>{`
        .config-section {
          margin-bottom: var(--space-xl);
          padding-bottom: var(--space-lg);
          border-bottom: 1px solid var(--border-subtle);
        }
        .config-section:last-of-type { border-bottom: none; }
        .section-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: var(--space-md);
        }
        .section-desc {
          font-size: 0.78rem;
          color: var(--text-muted);
          line-height: 1.5;
        }
        .mac-info-badge {
          margin-top: var(--space-sm);
          padding: 8px 12px;
          background: rgba(251,191,36,0.08);
          border: 1px solid rgba(251,191,36,0.2);
          border-radius: var(--radius-sm);
          font-size: 0.76rem;
          color: #fbbf24;
        }

        /* Trigger chips */
        .trigger-group-label {
          display: block;
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }
        .trigger-group-hint {
          font-size: 0.73rem;
          color: var(--text-muted);
          margin-bottom: var(--space-sm);
        }
        .trigger-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .trigger-chip {
          padding: 5px 12px;
          border-radius: 20px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          color: var(--text-secondary);
          font-size: 0.76rem;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .trigger-chip:hover { border-color: var(--text-accent); color: var(--text-accent); }
        .trigger-chip--on {
          background: rgba(99,102,241,0.12);
          border-color: rgba(99,102,241,0.4);
          color: #818cf8;
          font-weight: 600;
        }

        /* Script editors */
        .script-toggles { display: flex; flex-direction: column; gap: var(--space-lg); }
        .script-block {}
        .script-editor {
          margin-top: var(--space-sm);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        .script-editor-label {
          display: block;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          background: var(--bg-elevated);
          padding: 4px 12px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .script-editor-area {
          width: 100%;
          display: block;
          padding: 10px 14px;
          font-family: var(--font-mono);
          font-size: 0.76rem;
          line-height: 1.65;
          background: var(--bg-deep, #0d1117);
          color: #e6edf3;
          border: none;
          outline: none;
          resize: vertical;
          min-height: 180px;
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}
