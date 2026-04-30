import { useMemo } from 'react';
import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';
import AssignmentsSection from '../ui/AssignmentsSection';
import windowsOptions from '../../config/windowsOptions.json';
import './windows-steps.css';

// ── Validators ──────────────────────────────────────────────────────────
const isValidUrl = (v) => {
  if (!v) return true;
  try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol); }
  catch { return false; }
};

const GUID_RE = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;
const isValidGuid = (v) => !v || GUID_RE.test(v.trim());

const REQ_FILE_DET_TYPES = [
  { value: 'exists', label: 'File or folder exists' },
  { value: 'doesNotExist', label: 'File or folder does not exist' },
  { value: 'string', label: 'String (version)' },
  { value: 'version', label: 'Version comparison' },
  { value: 'sizeInMB', label: 'Size in MB' },
  { value: 'modifiedDate', label: 'Date modified' },
];

const REQ_REG_DET_TYPES = [
  { value: 'exists', label: 'Key exists' },
  { value: 'doesNotExist', label: 'Key does not exist' },
  { value: 'string', label: 'String comparison' },
  { value: 'integer', label: 'Integer comparison' },
  { value: 'version', label: 'Version comparison' },
];

const OPERATORS = [
  { value: 'notConfigured', label: 'Not configured' },
  { value: 'equal', label: 'Equals' },
  { value: 'notEqual', label: 'Not equal to' },
  { value: 'greaterThanOrEqual', label: 'Greater than or equal to' },
  { value: 'greaterThan', label: 'Greater than' },
  { value: 'lessThanOrEqual', label: 'Less than or equal to' },
  { value: 'lessThan', label: 'Less than' },
];

export default function IntuneConfigStep({ state, updateField }) {
  const errors = useMemo(() => {
    const e = {};
    if (state.informationUrl && !isValidUrl(state.informationUrl))
      e.informationUrl = 'Must be a valid URL starting with https://';
    if (state.privacyUrl && !isValidUrl(state.privacyUrl))
      e.privacyUrl = 'Must be a valid URL starting with https://';
    if (state.supersedesAppId && !isValidGuid(state.supersedesAppId))
      e.supersedesAppId = 'Must be a valid GUID — e.g. {12345678-abcd-1234-abcd-1234567890ab}';
    // Validate dependencies
    (state.dependencies || []).forEach((d, i) => {
      if (d.appId && !isValidGuid(d.appId))
        e[`dep_${i}_appId`] = 'Must be a valid Intune app GUID';
    });
    // Validate assignment group IDs
    (state.assignments || []).forEach((a, i) => {
      if (a.groupId && !isValidGuid(a.groupId))
        e[`assignment_${i}_groupId`] = 'Must be a valid Entra ID group GUID';
      if (a.filterId && !isValidGuid(a.filterId))
        e[`assignment_${i}_filterId`] = 'Must be a valid filter GUID';
    });
    return e;
  }, [state.informationUrl, state.privacyUrl, state.supersedesAppId, state.assignments, state.dependencies]);

  const hasErrors = Object.keys(errors).length > 0;

  // ── Dependencies helpers ──────────────────────────────────────────────
  const dependencies = state.dependencies || [];
  const addDependency = () => {
    updateField('dependencies', [...dependencies, { appId: '', dependencyType: 'autoInstall' }]);
  };
  const updateDependency = (idx, field, value) => {
    const updated = dependencies.map((d, i) => i === idx ? { ...d, [field]: value } : d);
    updateField('dependencies', updated);
  };
  const removeDependency = (idx) => {
    updateField('dependencies', dependencies.filter((_, i) => i !== idx));
  };

  // ── Custom requirements helpers ───────────────────────────────────────
  const customReqs = state.customRequirements || [];
  const addCustomReq = (type) => {
    let newReq;
    if (type === 'file') {
      newReq = { type: 'file', path: '', fileOrFolder: '', detectionType: 'exists', operator: 'notConfigured', detectionValue: '', check32BitOn64: false };
    } else {
      newReq = { type: 'registry', hive: 'HKLM', keyPath: '', valueName: '', detectionType: 'exists', operator: 'notConfigured', detectionValue: '', check32BitOn64: false };
    }
    updateField('customRequirements', [...customReqs, newReq]);
  };
  const updateCustomReq = (idx, field, value) => {
    const updated = customReqs.map((r, i) => i === idx ? { ...r, [field]: value } : r);
    updateField('customRequirements', updated);
  };
  const removeCustomReq = (idx) => {
    updateField('customRequirements', customReqs.filter((_, i) => i !== idx));
  };

  return (
    <div className="step-content animate-in">
      <div className="step-header">
        <h2>☁️ Intune Configuration</h2>
        <p>Configure Intune app metadata, requirements, assignments, dependencies, and supersedence.</p>
      </div>

      {hasErrors && (
        <div className="validation-banner">
          <span className="validation-banner__icon">⚠️</span>
          <span>Some fields have validation errors. Fix them before exporting to avoid Graph API failures.</span>
        </div>
      )}

      {/* ═══ APP METADATA ═══ */}
      <div className="config-section">
        <h3 className="section-title">App Metadata</h3>
        <div className="form-grid">
          <FormField label="Description" id="appDescription">
            <textarea id="appDescription" rows="2" placeholder="Application description for Intune Company Portal" value={state.appDescription} onChange={e => updateField('appDescription', e.target.value)} />
          </FormField>
          <FormField label="Owner" id="appOwner">
            <input id="appOwner" type="text" value={state.appOwner} onChange={e => updateField('appOwner', e.target.value)} />
          </FormField>
          <FormField label="Developer" id="appDeveloper">
            <input id="appDeveloper" type="text" placeholder="e.g. Microsoft, Adobe" value={state.appDeveloper} onChange={e => updateField('appDeveloper', e.target.value)} />
          </FormField>
          <FormField label="Information URL" id="informationUrl" hint="Link to app docs or vendor site" error={errors.informationUrl}>
            <input id="informationUrl" type="url" placeholder="https://example.com"
              className={errors.informationUrl ? 'input--error' : ''}
              value={state.informationUrl} onChange={e => updateField('informationUrl', e.target.value)} />
          </FormField>
          <FormField label="Privacy URL" id="privacyUrl" error={errors.privacyUrl}>
            <input id="privacyUrl" type="url" placeholder="https://example.com/privacy"
              className={errors.privacyUrl ? 'input--error' : ''}
              value={state.privacyUrl} onChange={e => updateField('privacyUrl', e.target.value)} />
          </FormField>
          <FormField label="Notes" id="appNotes">
            <input id="appNotes" type="text" value={state.appNotes} onChange={e => updateField('appNotes', e.target.value)} />
          </FormField>
        </div>
        <ToggleSwitch label="Featured app in Company Portal" checked={state.isFeatured} onChange={v => updateField('isFeatured', v)} id="isFeatured" />
      </div>

      {/* ═══ APP LOGO ═══ */}
      <div className="config-section">
        <h3 className="section-title">App Logo <span className="section-optional">Optional</span></h3>
        <div className="logo-upload-area">
          <label className="btn btn-secondary">
            🖼️ Upload Logo (PNG/JPG)
            <input type="file" accept=".png,.jpg,.jpeg,.gif,.bmp" onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              updateField('logoFile', file);
              const reader = new FileReader();
              reader.onload = () => updateField('logoDataUrl', reader.result);
              reader.readAsDataURL(file);
            }} style={{ display: 'none' }} />
          </label>
          {state.logoDataUrl && (
            <div className="logo-preview">
              <img src={state.logoDataUrl} alt="App logo" style={{ maxWidth: 64, maxHeight: 64, borderRadius: 'var(--radius-sm)' }} />
              <span className="msi-status msi-status--ok">✅ {state.logoFile?.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ REQUIREMENTS ═══ */}
      <div className="config-section">
        <h3 className="section-title">Requirements</h3>
        <div className="form-grid">
          <SelectField label="Minimum Windows Release" id="minWinRelease" value={state.minWinRelease}
            onChange={v => updateField('minWinRelease', v)}
            options={windowsOptions.windowsReleases}
          />
        </div>

        {/* OS Architecture */}
        <div style={{ marginTop: 'var(--space-md)' }}>
          <p className="action-field__label" style={{ marginBottom: '6px' }}>Operating System Architecture</p>
          <div className="detection-method-toggle">
            <button type="button"
              className={`detection-method-btn ${!state.archCheckEnabled ? 'detection-method-btn--active' : ''}`}
              onClick={() => updateField('archCheckEnabled', false)}>
              No — Allow this app to be installed on all systems
            </button>
            <button type="button"
              className={`detection-method-btn ${state.archCheckEnabled ? 'detection-method-btn--active' : ''}`}
              onClick={() => updateField('archCheckEnabled', true)}>
              Yes — Specify the systems the app can be installed on
            </button>
          </div>
          {state.archCheckEnabled && (
            <div className="arch-checkboxes">
              <label className="arch-checkbox">
                <input type="checkbox" checked={state.archX86} onChange={e => updateField('archX86', e.target.checked)} />
                <span>x86 (32-bit)</span>
              </label>
              <label className="arch-checkbox">
                <input type="checkbox" checked={state.archX64} onChange={e => updateField('archX64', e.target.checked)} />
                <span>x64 (64-bit)</span>
              </label>
              <label className="arch-checkbox">
                <input type="checkbox" checked={state.archArm64} onChange={e => updateField('archArm64', e.target.checked)} />
                <span>ARM64</span>
              </label>
            </div>
          )}
        </div>

        {/* Resource requirements */}
        <div className="form-grid" style={{ marginTop: 'var(--space-md)' }}>
          <FormField label="Min Free Disk Space (MB)" id="minDiskSpaceMB">
            <input id="minDiskSpaceMB" type="number" min="0" value={state.minDiskSpaceMB} onChange={e => updateField('minDiskSpaceMB', parseInt(e.target.value) || 500)} />
          </FormField>
          <FormField label="Min Memory (MB)" id="minMemoryMB">
            <input id="minMemoryMB" type="number" min="0" value={state.minMemoryMB} onChange={e => updateField('minMemoryMB', parseInt(e.target.value) || 2048)} />
          </FormField>
          <FormField label="Min Logical Processors" id="minLogicalProcessors" hint="Leave empty for no requirement">
            <input id="minLogicalProcessors" type="number" min="1" value={state.minLogicalProcessors ?? ''} onChange={e => updateField('minLogicalProcessors', e.target.value ? parseInt(e.target.value) : null)} />
          </FormField>
          <FormField label="Min CPU Speed (MHz)" id="minCpuSpeedMHz" hint="Leave empty for no requirement">
            <input id="minCpuSpeedMHz" type="number" min="1" value={state.minCpuSpeedMHz ?? ''} onChange={e => updateField('minCpuSpeedMHz', e.target.value ? parseInt(e.target.value) : null)} />
          </FormField>
        </div>
      </div>

      {/* ═══ CUSTOM REQUIREMENT RULES ═══ */}
      <div className="config-section">
        <h3 className="section-title">Custom Requirement Rules <span className="section-optional">Optional &bull; {customReqs.length} rule{customReqs.length !== 1 ? 's' : ''}</span></h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
          Add additional file or registry checks that must pass before the app can install.
        </p>

        {customReqs.map((req, idx) => (
          <div key={idx} className="detection-rule-card" style={{ marginBottom: '8px' }}>
            <div className="detection-rule-card__header">
              <span className="detection-rule-card__type">{req.type === 'file' ? '📄 File Requirement' : '🔑 Registry Requirement'}</span>
              <button type="button" className="action-btn action-btn--del" onClick={() => removeCustomReq(idx)}>✕</button>
            </div>
            <div className="form-grid" style={{ padding: '8px 12px 12px' }}>
              {req.type === 'file' && (
                <>
                  <FormField label="Path" id={`req-file-path-${idx}`}>
                    <input type="text" placeholder="C:\Program Files\MyApp" value={req.path} onChange={e => updateCustomReq(idx, 'path', e.target.value)} />
                  </FormField>
                  <FormField label="File or Folder" id={`req-file-name-${idx}`}>
                    <input type="text" placeholder="MyApp.exe" value={req.fileOrFolder} onChange={e => updateCustomReq(idx, 'fileOrFolder', e.target.value)} />
                  </FormField>
                  <SelectField label="Detection Method" id={`req-file-type-${idx}`} value={req.detectionType}
                    onChange={v => updateCustomReq(idx, 'detectionType', v)} options={REQ_FILE_DET_TYPES} />
                  {!['exists', 'doesNotExist'].includes(req.detectionType) && (
                    <>
                      <SelectField label="Operator" id={`req-file-op-${idx}`} value={req.operator}
                        onChange={v => updateCustomReq(idx, 'operator', v)} options={OPERATORS} />
                      <FormField label="Value" id={`req-file-val-${idx}`}>
                        <input type="text" value={req.detectionValue} onChange={e => updateCustomReq(idx, 'detectionValue', e.target.value)} />
                      </FormField>
                    </>
                  )}
                  <ToggleSwitch label="Check 32-bit on 64-bit systems" checked={req.check32BitOn64} onChange={v => updateCustomReq(idx, 'check32BitOn64', v)} id={`req-file-32-${idx}`} />
                </>
              )}
              {req.type === 'registry' && (
                <>
                  <SelectField label="Hive" id={`req-reg-hive-${idx}`} value={req.hive}
                    onChange={v => updateCustomReq(idx, 'hive', v)}
                    options={[{ value: 'HKLM', label: 'HKEY_LOCAL_MACHINE' }, { value: 'HKCU', label: 'HKEY_CURRENT_USER' }]} />
                  <FormField label="Key Path" id={`req-reg-key-${idx}`}>
                    <input type="text" value={req.keyPath} onChange={e => updateCustomReq(idx, 'keyPath', e.target.value)} />
                  </FormField>
                  <FormField label="Value Name" id={`req-reg-val-name-${idx}`}>
                    <input type="text" value={req.valueName} onChange={e => updateCustomReq(idx, 'valueName', e.target.value)} />
                  </FormField>
                  <SelectField label="Detection Method" id={`req-reg-type-${idx}`} value={req.detectionType}
                    onChange={v => updateCustomReq(idx, 'detectionType', v)} options={REQ_REG_DET_TYPES} />
                  {!['exists', 'doesNotExist'].includes(req.detectionType) && (
                    <>
                      <SelectField label="Operator" id={`req-reg-op-${idx}`} value={req.operator}
                        onChange={v => updateCustomReq(idx, 'operator', v)} options={OPERATORS} />
                      <FormField label="Value" id={`req-reg-val-${idx}`}>
                        <input type="text" value={req.detectionValue} onChange={e => updateCustomReq(idx, 'detectionValue', e.target.value)} />
                      </FormField>
                    </>
                  )}
                  <ToggleSwitch label="Check 32-bit registry on 64-bit systems" checked={req.check32BitOn64} onChange={v => updateCustomReq(idx, 'check32BitOn64', v)} id={`req-reg-32-${idx}`} />
                </>
              )}
            </div>
          </div>
        ))}

        <div className="detection-add-buttons">
          <button type="button" className="btn btn-secondary" onClick={() => addCustomReq('file')}>+ File Requirement</button>
          <button type="button" className="btn btn-secondary" onClick={() => addCustomReq('registry')}>+ Registry Requirement</button>
        </div>
      </div>

      {/* ═══ ASSIGNMENTS ═══ */}
      <AssignmentsSection
        assignments={state.assignments}
        onChange={v => updateField('assignments', v)}
        validationErrors={errors}
      />

      {/* ═══ DEPENDENCIES ═══ */}
      <div className="config-section">
        <h3 className="section-title">App Dependencies <span className="section-optional">Optional &bull; {dependencies.length} dependenc{dependencies.length === 1 ? 'y' : 'ies'}</span></h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
          Specify other Intune apps that must be installed before this app.
        </p>

        {dependencies.map((dep, idx) => (
          <div key={idx} className="dep-row">
            <FormField label="App ID (GUID)" id={`dep-appid-${idx}`} error={errors[`dep_${idx}_appId`]}>
              <input type="text" placeholder="{12345678-abcd-1234-abcd-1234567890ab}"
                className={errors[`dep_${idx}_appId`] ? 'input--error' : ''}
                value={dep.appId} onChange={e => updateDependency(idx, 'appId', e.target.value)} />
            </FormField>
            <SelectField label="Dependency Type" id={`dep-type-${idx}`} value={dep.dependencyType}
              onChange={v => updateDependency(idx, 'dependencyType', v)}
              options={[
                { value: 'autoInstall', label: 'Auto install' },
                { value: 'detect', label: 'Detect only' },
              ]} />
            <button type="button" className="action-btn action-btn--del" onClick={() => removeDependency(idx)} title="Remove dependency">✕</button>
          </div>
        ))}
        <button type="button" className="add-action__btn" onClick={addDependency}>+ Add Dependency</button>
      </div>

      {/* ═══ SUPERSEDENCE ═══ */}
      <div className="config-section">
        <h3 className="section-title">Supersedence <span className="section-optional">Optional</span></h3>
        <div className="form-grid">
          <FormField label="Superseded App ID" id="supersedesAppId" hint="Intune app GUID of the app being replaced" error={errors.supersedesAppId}>
            <input id="supersedesAppId" type="text" placeholder="Leave empty if not superseding"
              className={errors.supersedesAppId ? 'input--error' : ''}
              value={state.supersedesAppId} onChange={e => updateField('supersedesAppId', e.target.value)} />
          </FormField>
          <SelectField label="Action" id="supersedenceType" value={state.supersedenceType}
            onChange={v => updateField('supersedenceType', v)}
            options={[
              { value: 'update', label: 'Uninstall previous version (Update)' },
              { value: 'replace', label: 'Keep previous version (Side-by-side)' },
            ]}
          />
        </div>
      </div>

      <style>{`
        .validation-banner { display: flex; align-items: center; gap: var(--space-sm); padding: 10px var(--space-md); margin-bottom: var(--space-lg); background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); border-radius: var(--radius-sm); font-size: 0.8rem; color: var(--color-error, #ef4444); }
        .validation-banner__icon { font-size: 1rem; }
        .input--error { border-color: var(--color-error, #ef4444) !important; box-shadow: 0 0 0 1px rgba(239,68,68,0.25); }

        .arch-checkboxes { display: flex; gap: var(--space-lg); margin-top: var(--space-sm); padding: 10px var(--space-md); background: var(--bg-card, rgba(255,255,255,0.02)); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); }
        .arch-checkbox { display: flex; align-items: center; gap: 6px; font-size: 0.82rem; color: var(--text-secondary); cursor: pointer; }
        .arch-checkbox input[type="checkbox"] { accent-color: var(--text-accent, #7c8aff); width: 16px; height: 16px; }

        .dep-row { display: flex; align-items: flex-end; gap: var(--space-md); margin-bottom: var(--space-sm); padding: 8px 12px; background: var(--bg-card, rgba(255,255,255,0.02)); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); }
        .dep-row > *:first-child { flex: 1; }

        .detection-method-toggle { display: flex; gap: var(--space-sm); }
        .detection-method-btn { flex: 1; padding: 12px var(--space-md); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-card, rgba(255,255,255,0.02)); color: var(--text-secondary); font-size: 0.82rem; font-family: inherit; cursor: pointer; transition: all 0.15s; text-align: left; }
        .detection-method-btn:hover { border-color: var(--text-accent, #7c8aff); background: var(--bg-hover); }
        .detection-method-btn--active { border-color: var(--text-accent, #7c8aff); background: rgba(99,140,255,0.08); color: var(--text-primary); font-weight: 600; box-shadow: 0 0 0 1px rgba(99,140,255,0.2); }

        .detection-rule-card { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden; }
        .detection-rule-card__header { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; background: var(--bg-card, rgba(255,255,255,0.02)); border-bottom: 1px solid var(--border-subtle); }
        .detection-rule-card__type { font-size: 0.78rem; font-weight: 600; color: var(--text-accent, #7c8aff); }
        .detection-add-buttons { display: flex; gap: var(--space-sm); flex-wrap: wrap; }
        .detection-add-buttons .btn { font-size: 0.78rem; padding: 6px 12px; }
      `}</style>
    </div>
  );
}
