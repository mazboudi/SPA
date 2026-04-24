import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';

export default function MacConfigStep({ state, updateField }) {
  return (
    <div className="step-content animate-in">
      <div className="step-header">
        <h2>🍎 macOS Configuration</h2>
        <p>Configure the macOS installer and Jamf Pro deployment settings.</p>
      </div>

      <div className="config-section">
        <h3 className="section-title">Installer</h3>
        <div className="form-grid">
          <SelectField
            label="Installer Type"
            id="macInstallerType"
            value={state.macInstallerType}
            onChange={v => updateField('macInstallerType', v)}
            options={[
              { value: 'pkg', label: 'PKG (.pkg)' },
              { value: 'dmg', label: 'DMG (.dmg)' },
              { value: 'zip', label: 'ZIP (.zip)' },
            ]}
          />
          <FormField label="Bundle ID" id="bundleId" required hint="e.g. com.google.Chrome — from Info.plist CFBundleIdentifier">
            <input
              id="bundleId"
              type="text"
              placeholder="com.vendor.AppName"
              value={state.bundleId}
              onChange={e => updateField('bundleId', e.target.value)}
            />
          </FormField>
          <FormField label="Receipt ID" id="receiptId" hint="macOS pkgutil receipt identifier. Auto-derived from Bundle ID.">
            <input
              id="receiptId"
              type="text"
              placeholder="com.vendor.appname"
              value={state.receiptId}
              onChange={e => updateField('receiptId', e.target.value)}
            />
          </FormField>
        </div>
      </div>

      <div className="config-section">
        <h3 className="section-title">Jamf Pro Settings</h3>
        <div className="form-grid">
          <SelectField
            label="Jamf Category"
            id="jamfCategory"
            value={state.jamfCategory}
            onChange={v => updateField('jamfCategory', v)}
            options={[
              { value: 'Browsers', label: 'Browsers' },
              { value: 'Productivity', label: 'Productivity' },
              { value: 'Developer Tools', label: 'Developer Tools' },
              { value: 'Security', label: 'Security' },
              { value: 'Communication', label: 'Communication' },
              { value: 'Utilities', label: 'Utilities' },
              { value: 'Endpoint Management', label: 'Endpoint Management' },
              { value: 'Custom', label: 'Custom' },
              { value: 'No category', label: 'No category' },
            ]}
          />
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
        <ToggleSwitch
          label="Enable Jamf Self Service"
          checked={state.macSelfService}
          onChange={v => updateField('macSelfService', v)}
          id="macSelfService"
        />
      </div>

      {state.receiptId && (
        <div className="step-preview-badge animate-in">
          <span className="badge-label">Extension Attribute</span>
          <code>SPA - {state.displayName} {state.version} Version → pkgutil --pkg-info {state.receiptId}</code>
        </div>
      )}

      <style>{`
        .config-section {
          margin-bottom: var(--space-xl);
          padding-bottom: var(--space-lg);
          border-bottom: 1px solid var(--border-subtle);
        }
        .config-section:last-child { border-bottom: none; }
        .section-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: var(--space-md);
        }
      `}</style>
    </div>
  );
}
