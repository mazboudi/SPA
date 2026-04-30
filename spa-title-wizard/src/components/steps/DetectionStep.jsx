import { useRef } from 'react';
import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';
import './windows-steps.css';

const OPERATORS = [
  { value: 'notConfigured', label: 'Not configured' },
  { value: 'equal', label: 'Equals' },
  { value: 'notEqual', label: 'Not equal to' },
  { value: 'greaterThanOrEqual', label: 'Greater than or equal to' },
  { value: 'greaterThan', label: 'Greater than' },
  { value: 'lessThanOrEqual', label: 'Less than or equal to' },
  { value: 'lessThan', label: 'Less than' },
];

const FILE_DET_TYPES = [
  { value: 'exists', label: 'File or folder exists' },
  { value: 'doesNotExist', label: 'File or folder does not exist' },
  { value: 'string', label: 'String (version)' },
  { value: 'version', label: 'Version comparison' },
  { value: 'sizeInMB', label: 'Size in MB' },
  { value: 'modifiedDate', label: 'Date modified' },
  { value: 'createdDate', label: 'Date created' },
];

const REG_DET_TYPES = [
  { value: 'exists', label: 'Key exists' },
  { value: 'doesNotExist', label: 'Key does not exist' },
  { value: 'string', label: 'String comparison' },
  { value: 'integer', label: 'Integer comparison' },
  { value: 'version', label: 'Version comparison' },
];

const REG_HIVES = [
  { value: 'HKLM', label: 'HKEY_LOCAL_MACHINE' },
  { value: 'HKCU', label: 'HKEY_CURRENT_USER' },
];

export default function DetectionStep({ state, updateField }) {
  const scriptFileRef = useRef(null);
  const detectionRules = state.detectionRules || [];
  const hasMsiRule = detectionRules.some(r => r.ruleType === 'msi');

  // ── Rule CRUD ─────────────────────────────────────────────────────────
  const addRule = (ruleType) => {
    let newRule;
    switch (ruleType) {
      case 'msi':
        newRule = { ruleType: 'msi', productCode: state.msiProductCode || '', productVersionOperator: 'greaterThanOrEqual', productVersion: state.version || '' };
        break;
      case 'file':
        newRule = { ruleType: 'file', path: '', fileOrFolder: '', detectionType: 'exists', operator: 'notConfigured', detectionValue: '', check32BitOn64: false };
        break;
      case 'registry':
        newRule = { ruleType: 'registry', hive: 'HKLM', keyPath: '', valueName: '', detectionType: 'exists', operator: 'notConfigured', detectionValue: '', check32BitOn64: false };
        break;
      default: return;
    }
    updateField('detectionRules', [...detectionRules, newRule]);
  };

  const updateRule = (idx, field, value) => {
    const updated = detectionRules.map((r, i) => i === idx ? { ...r, [field]: value } : r);
    updateField('detectionRules', updated);
  };

  const removeRule = (idx) => {
    updateField('detectionRules', detectionRules.filter((_, i) => i !== idx));
  };

  // ── Script upload handler ─────────────────────────────────────────────
  const handleScriptUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    updateField('scriptContent', text);
  };

  // ── Render rule card ──────────────────────────────────────────────────
  const renderRuleCard = (rule, idx) => {
    const ruleLabel = rule.ruleType === 'msi' ? '🟦 MSI' : rule.ruleType === 'file' ? '📄 File' : '🔑 Registry';

    return (
      <div key={idx} className="detection-rule-card">
        <div className="detection-rule-card__header">
          <span className="detection-rule-card__type">{ruleLabel}</span>
          <button type="button" className="action-btn action-btn--del" onClick={() => removeRule(idx)} title="Remove rule">✕</button>
        </div>
        <div className="form-grid" style={{ padding: '8px 12px 12px' }}>
          {rule.ruleType === 'msi' && (
            <>
              <FormField label="MSI Product Code" id={`det-msi-${idx}`}>
                <input type="text" placeholder="{GUID}" value={rule.productCode} onChange={e => updateRule(idx, 'productCode', e.target.value)} />
              </FormField>
              <SelectField label="Product Version Operator" id={`det-msi-op-${idx}`} value={rule.productVersionOperator}
                onChange={v => updateRule(idx, 'productVersionOperator', v)} options={OPERATORS} />
              <FormField label="Product Version" id={`det-msi-ver-${idx}`}>
                <input type="text" placeholder={state.version || '1.0.0'} value={rule.productVersion} onChange={e => updateRule(idx, 'productVersion', e.target.value)} />
              </FormField>
            </>
          )}
          {rule.ruleType === 'file' && (
            <>
              <FormField label="Path" id={`det-file-path-${idx}`} hint="Folder path (e.g. C:\Program Files\MyApp)">
                <input type="text" placeholder="C:\Program Files\MyApp" value={rule.path} onChange={e => updateRule(idx, 'path', e.target.value)} />
              </FormField>
              <FormField label="File or Folder" id={`det-file-name-${idx}`}>
                <input type="text" placeholder="MyApp.exe" value={rule.fileOrFolder} onChange={e => updateRule(idx, 'fileOrFolder', e.target.value)} />
              </FormField>
              <SelectField label="Detection Method" id={`det-file-type-${idx}`} value={rule.detectionType}
                onChange={v => updateRule(idx, 'detectionType', v)} options={FILE_DET_TYPES} />
              {!['exists', 'doesNotExist'].includes(rule.detectionType) && (
                <>
                  <SelectField label="Operator" id={`det-file-op-${idx}`} value={rule.operator}
                    onChange={v => updateRule(idx, 'operator', v)} options={OPERATORS} />
                  <FormField label="Value" id={`det-file-val-${idx}`}>
                    <input type="text" value={rule.detectionValue} onChange={e => updateRule(idx, 'detectionValue', e.target.value)} />
                  </FormField>
                </>
              )}
              <ToggleSwitch label="Check 32-bit on 64-bit systems" checked={rule.check32BitOn64} onChange={v => updateRule(idx, 'check32BitOn64', v)} id={`det-file-32-${idx}`} />
            </>
          )}
          {rule.ruleType === 'registry' && (
            <>
              <SelectField label="Hive" id={`det-reg-hive-${idx}`} value={rule.hive}
                onChange={v => updateRule(idx, 'hive', v)} options={REG_HIVES} />
              <FormField label="Key Path" id={`det-reg-key-${idx}`}>
                <input type="text" placeholder={`SOFTWARE\\Fiserv\\InstalledApps\\${state.packageId || 'my-app'}`}
                  value={rule.keyPath} onChange={e => updateRule(idx, 'keyPath', e.target.value)} />
              </FormField>
              <FormField label="Value Name" id={`det-reg-val-name-${idx}`}>
                <input type="text" placeholder="Version" value={rule.valueName} onChange={e => updateRule(idx, 'valueName', e.target.value)} />
              </FormField>
              <SelectField label="Detection Method" id={`det-reg-type-${idx}`} value={rule.detectionType}
                onChange={v => updateRule(idx, 'detectionType', v)} options={REG_DET_TYPES} />
              {!['exists', 'doesNotExist'].includes(rule.detectionType) && (
                <>
                  <SelectField label="Operator" id={`det-reg-op-${idx}`} value={rule.operator}
                    onChange={v => updateRule(idx, 'operator', v)} options={OPERATORS} />
                  <FormField label="Value" id={`det-reg-val-${idx}`}>
                    <input type="text" value={rule.detectionValue} onChange={e => updateRule(idx, 'detectionValue', e.target.value)} />
                  </FormField>
                </>
              )}
              <ToggleSwitch label="Check 32-bit registry on 64-bit systems" checked={rule.check32BitOn64} onChange={v => updateRule(idx, 'check32BitOn64', v)} id={`det-reg-32-${idx}`} />
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="step-content animate-in">
      <div className="step-header">
        <h2>🔍 Detection Rules</h2>
        <p>Configure how Intune determines whether this application is installed on a device.</p>
      </div>

      {/* Detection Method Toggle */}
      <div className="config-section">
        <h3 className="section-title">Detection Method</h3>
        <div className="detection-method-toggle">
          <button type="button"
            className={`detection-method-btn ${state.detectionMethod === 'manual' ? 'detection-method-btn--active' : ''}`}
            onClick={() => updateField('detectionMethod', 'manual')}>
            📋 Manually configure detection rules
          </button>
          <button type="button"
            className={`detection-method-btn ${state.detectionMethod === 'script' ? 'detection-method-btn--active' : ''}`}
            onClick={() => updateField('detectionMethod', 'script')}>
            📜 Use a custom detection script
          </button>
        </div>
      </div>

      {/* ═══ MANUAL DETECTION ═══ */}
      {state.detectionMethod === 'manual' && (
        <div className="config-section">
          <h3 className="section-title">Detection Rules <span className="section-optional">{detectionRules.length} rule{detectionRules.length !== 1 ? 's' : ''}</span></h3>

          {detectionRules.length === 0 && (
            <p className="phase-empty">No detection rules configured. Add at least one rule below.</p>
          )}

          <div className="detection-rules-list">
            {detectionRules.map((rule, idx) => renderRuleCard(rule, idx))}
          </div>

          <div className="detection-add-buttons">
            {!hasMsiRule && (
              <button type="button" className="btn btn-secondary" onClick={() => addRule('msi')}>
                + MSI Rule
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => addRule('file')}>
              + File Rule
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => addRule('registry')}>
              + Registry Rule
            </button>
          </div>

          {hasMsiRule && (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px', fontStyle: 'italic' }}>
              ℹ️ Only one MSI detection rule is allowed per application.
            </p>
          )}
        </div>
      )}

      {/* ═══ SCRIPT DETECTION ═══ */}
      {state.detectionMethod === 'script' && (
        <div className="config-section">
          <h3 className="section-title">Custom Detection Script</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
            Upload a PowerShell script (.ps1) that returns exit 0 + stdout when the app is detected.
          </p>

          <div className="script-upload-area">
            <label className="btn btn-secondary">
              📄 Upload detect.ps1
              <input ref={scriptFileRef} type="file" accept=".ps1" onChange={handleScriptUpload} style={{ display: 'none' }} />
            </label>
            {state.scriptContent && <span className="msi-status msi-status--ok">✅ Script loaded ({state.scriptContent.split('\n').length} lines)</span>}
          </div>

          <div style={{ marginTop: 'var(--space-md)' }}>
            <ToggleSwitch label="Run script as 32-bit process on 64-bit clients" checked={state.scriptRunAs32Bit} onChange={v => updateField('scriptRunAs32Bit', v)} id="scriptRunAs32Bit" />
            <ToggleSwitch label="Enforce script signature check and run script silently" checked={state.scriptEnforceSignature} onChange={v => updateField('scriptEnforceSignature', v)} id="scriptEnforceSignature" />
          </div>

          {state.scriptContent && (
            <div className="script-preview" style={{ marginTop: 'var(--space-md)' }}>
              <pre>{state.scriptContent.slice(0, 500)}{state.scriptContent.length > 500 ? '\n...' : ''}</pre>
            </div>
          )}
        </div>
      )}

      <style>{`
        .detection-method-toggle { display: flex; gap: var(--space-sm); margin-bottom: var(--space-md); }
        .detection-method-btn { flex: 1; padding: 12px var(--space-md); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-card, rgba(255,255,255,0.02)); color: var(--text-secondary); font-size: 0.82rem; font-family: inherit; cursor: pointer; transition: all 0.15s; text-align: left; }
        .detection-method-btn:hover { border-color: var(--text-accent, #7c8aff); background: var(--bg-hover); }
        .detection-method-btn--active { border-color: var(--text-accent, #7c8aff); background: rgba(99,140,255,0.08); color: var(--text-primary); font-weight: 600; box-shadow: 0 0 0 1px rgba(99,140,255,0.2); }

        .detection-rules-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: var(--space-md); }
        .detection-rule-card { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden; }
        .detection-rule-card__header { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; background: var(--bg-card, rgba(255,255,255,0.02)); border-bottom: 1px solid var(--border-subtle); }
        .detection-rule-card__type { font-size: 0.78rem; font-weight: 600; color: var(--text-accent, #7c8aff); }

        .detection-add-buttons { display: flex; gap: var(--space-sm); flex-wrap: wrap; }
        .detection-add-buttons .btn { font-size: 0.78rem; padding: 6px 12px; }
      `}</style>
    </div>
  );
}
