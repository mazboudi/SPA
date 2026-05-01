import { useMemo } from 'react';
import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';
import jamfCategoriesData from '../../data/jamf-categories.json';

export default function MacConfigStep({ state, updateField }) {
  const categoryOptions = useMemo(() =>
    jamfCategoriesData.map(c => ({
      value: c.id,
      label: c.name,
    })),
    []
  );

  const handleCategoryChange = (id) => {
    const cat = jamfCategoriesData.find(c => c.id === id);
    updateField('jamfCategoryId', id);
    updateField('jamfCategory', cat ? cat.name : '');
  };

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
            value={state.jamfCategoryId || ''}
            onChange={handleCategoryChange}
            options={categoryOptions}
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
        {state.macSelfService && (
          <div className="form-grid" style={{ marginTop: 'var(--space-sm)' }}>
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
        )}
      </div>

      <div className="config-section">
        <h3 className="section-title">Detection</h3>
        <ToggleSwitch
          label="Generate Jamf Extension Attribute"
          checked={state.macExtensionAttribute}
          onChange={v => updateField('macExtensionAttribute', v)}
          id="macExtensionAttribute"
        />
        {state.macExtensionAttribute && (
          <div className="form-grid" style={{ marginTop: 'var(--space-sm)' }}>
            <FormField label="Application Path" id="macAppPath" required hint="Full path to the .app bundle, e.g. /Applications/Google Chrome.app">
              <input
                id="macAppPath"
                type="text"
                placeholder="/Applications/AppName.app"
                value={state.macAppPath}
                onChange={e => updateField('macAppPath', e.target.value)}
              />
            </FormField>
          </div>
        )}
      </div>

      {state.macExtensionAttribute && state.macAppPath && (
        <div className="step-preview-badge animate-in">
          <span className="badge-label">Extension Attribute</span>
          <code>defaults read &quot;{state.macAppPath}/Contents/Info&quot; CFBundleShortVersionString</code>
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
