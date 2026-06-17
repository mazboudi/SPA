import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';
import AssignmentsSection from '../ui/AssignmentsSection';
import JsonDiffPicker from '../ui/JsonDiffPicker';
import { parseIntuneExport } from '../../lib/parseIntuneExport';
import { fetchIntuneAppDetail, saveIntuneSnapshot } from '../../lib/intuneApi';
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
  { value: 'createdDate', label: 'Date created' },
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

const SCRIPT_OUTPUT_TYPES = [
  { value: 'string', label: 'String' },
  { value: 'dateTime', label: 'Date Time' },
  { value: 'integer', label: 'Integer' },
  { value: 'float', label: 'Float' },
  { value: 'version', label: 'Version' },
  { value: 'boolean', label: 'Boolean' },
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

export default function IntuneConfigStep({ state, updateField, intuneCatalog, loadIntuneCatalog, fetchAppDetail }) {
  const [activeTab, setActiveTab] = useState('info');
  const [intuneApps, setIntuneApps] = useState([]);
  const scriptFileRef = useRef(null);

  // Fetch Intune Catalog once to check for duplicate app names
  useEffect(() => {
    let active = true;
    const fetchCatalog = async () => {
      try {
        const res = await fetch('/api/intune/apps');
        if (res.ok) {
          const data = await res.json();
          if (active && data.apps) {
            setIntuneApps(data.apps);
          }
        }
      } catch (e) {
        console.warn('Failed to fetch Intune catalog for duplicate name check:', e);
      }
    };
    fetchCatalog();
    return () => { active = false; };
  }, []);

  // ── Intune Sync state ────────────────────────────────────────────────
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [syncIntuneData, setSyncIntuneData] = useState(null);
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [manualAppId, setManualAppId] = useState('');
  const [catalogForSync, setCatalogForSync] = useState(null);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const runSyncCheck = useCallback(async (appId) => {
    setSyncLoading(true);
    setSyncError(null);
    try {
      const intuneData = await fetchIntuneAppDetail(appId);
      const parsed = parseIntuneExport(intuneData);
      setSyncIntuneData(parsed.fields);
      
      // Save it to the backend as a snapshot (non-blocking for UI)
      if (state._editProjectId) {
        saveIntuneSnapshot(state._editProjectId, parsed.fields).catch(err => {
          console.warn('Failed to save Intune snapshot to workspace:', err);
        });
      }
    } catch (err) {
      setSyncError(err.message);
    } finally {
      setSyncLoading(false);
    }
  }, [state._editProjectId]);

  // Auto-fetch comparison when syncIntuneAppId is set and we're editing
  useEffect(() => {
    if (state.wizardMode !== 'edit') return;
    if (!state.syncIntuneAppId) return;
    if (syncIntuneData || syncLoading) return;
    runSyncCheck(state.syncIntuneAppId);
  }, [state.wizardMode, state.syncIntuneAppId, syncIntuneData, syncLoading, runSyncCheck]);

  const handleSyncPullField = useCallback((field, value) => {
    // For structural JSON picker, the field is exactly the builder key
    // Handle nested fields like lifecycle.phases...
    if (field.includes('.')) {
      // We don't support deeply nested cherry picks easily without a deep setter,
      // but for top-level it works. Let's just handle top-level strings for now,
      // or simple objects.
      console.warn("Deep nested cherry pick not fully supported yet:", field);
    } else {
      // Special case: if it's displayName, it goes to _intuneAppNameOverride in edit mode 
      // based on the new deriveState architecture.
      if (field === 'displayName') {
        updateField('_intuneAppNameOverride', value);
      } else {
        updateField(field, value);
      }
    }
  }, [updateField]);

  const handleSyncPullAll = useCallback(() => {
    if (!syncIntuneData) return;
    for (const [key, value] of Object.entries(syncIntuneData)) {
      if (key === 'displayName') {
        updateField('_intuneAppNameOverride', value);
      } else {
        updateField(key, value);
      }
    }
  }, [syncIntuneData, updateField]);

  const handleSetSyncApp = useCallback((appId) => {
    updateField('syncIntuneAppId', appId);
    setManualAppId('');
    setSyncResult(null);
    setSyncError(null);
    // Will auto-trigger comparison via the useEffect
  }, [updateField]);

  const handleRemoveSyncApp = useCallback(() => {
    updateField('syncIntuneAppId', '');
    setSyncResult(null);
    setSyncError(null);
    setSyncIntuneData(null);
  }, [updateField]);

  const handleLoadCatalogForSync = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const res = await fetch('/api/intune/apps');
      if (res.ok) {
        const data = await res.json();
        setCatalogForSync(data.apps || []);
      }
    } catch (e) {
      console.warn('Failed to load catalog for sync:', e);
    } finally {
      setCatalogLoading(false);
    }
    setShowCatalogPicker(true);
  }, []);

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

  // ── Return Codes CRUD ────────────────────────────────────────────────
  const returnCodes = state.returnCodes || [];
  const addReturnCode = () => {
    updateField('returnCodes', [...returnCodes, { code: '', type: 'success' }]);
  };
  const updateReturnCode = (idx, field, value) => {
    const updated = returnCodes.map((rc, i) => i === idx ? { ...rc, [field]: value } : rc);
    updateField('returnCodes', updated);
  };
  const removeReturnCode = (idx) => {
    updateField('returnCodes', returnCodes.filter((_, i) => i !== idx));
  };

  // ── Dependencies CRUD ────────────────────────────────────────────────
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

  // ── Custom Requirements CRUD ─────────────────────────────────────────
  const customReqs = state.customRequirements || [];
  const addCustomReq = (type) => {
    let newReq;
    if (type === 'file') {
      newReq = { type: 'file', path: '', fileOrFolder: '', detectionType: 'exists', operator: 'notConfigured', detectionValue: '', check32BitOn64: false };
    } else if (type === 'script') {
      newReq = { type: 'script', scriptContent: '', runAs32Bit: false, runAsAccount: false, enforceSignatureCheck: false, outputDataType: 'string', operator: 'notConfigured', detectionValue: '' };
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

  // ── Detection Rules CRUD ─────────────────────────────────────────────
  const detectionRules = state.detectionRules || [];
  const hasMsiRule = detectionRules.some(r => r.ruleType === 'msi');

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

  const handleScriptUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    updateField('scriptContent', text);
  };

  // ── Auto-derive install commands to reflect scaffolding ─────────────
  const derivedInstallCmd = useMemo(() => {
    const psadtFlags = [];
    if (state.deployMode) psadtFlags.push(`-DeployMode ${state.deployMode}`);
    if (state.allowRebootPassThru) psadtFlags.push('-AllowRebootPassThru');
    const suffix = psadtFlags.length > 0 ? ' ' + psadtFlags.join(' ') : '';
    return `Invoke-AppDeployToolkit.exe -DeploymentType Install${suffix}`;
  }, [state.deployMode, state.allowRebootPassThru]);

  const derivedUninstallCmd = useMemo(() => {
    const psadtFlags = [];
    if (state.deployMode) psadtFlags.push(`-DeployMode ${state.deployMode}`);
    if (state.allowRebootPassThru) psadtFlags.push('-AllowRebootPassThru');
    const suffix = psadtFlags.length > 0 ? ' ' + psadtFlags.join(' ') : '';
    return `Invoke-AppDeployToolkit.exe -DeploymentType Uninstall${suffix}`;
  }, [state.deployMode, state.allowRebootPassThru]);

  // ── Render rule card ──────────────────────────────────────────────────
  const renderRuleCard = (rule, idx) => {
    const ruleLabel = rule.ruleType === 'msi' ? '🟦 MSI' : rule.ruleType === 'file' ? '📄 File' : '🔑 Registry';

    return (
      <div key={idx} className="detection-rule-card" style={{ marginBottom: '8px' }}>
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
        <h2>☁️ Intune Configuration Hub</h2>
        <p>Manage app properties, installation context, hardware requirements, detection conditions, and assignments.</p>
      </div>

      {/* ═══ INTUNE METADATA SUMMARY ═══ */}
      {(state._intuneExportImported || state.wizardMode === 'edit') && (
        <IntuneMetaSummary state={state} />
      )}




      {hasErrors && (
        <div className="validation-banner">
          <span className="validation-banner__icon">⚠️</span>
          <span>Some fields have validation errors. Fix them before exporting to avoid Graph API failures.</span>
        </div>
      )}

      {/* Premium Navigation Tabs */}
      <div className="psadt-tab-bar">
        <button
          type="button"
          className={`psadt-tab-btn ${activeTab === 'info' ? 'psadt-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          <span className="psadt-tab-btn__icon">📋</span>
          <span className="psadt-tab-btn__label">App Information</span>
        </button>
        <button
          type="button"
          className={`psadt-tab-btn ${activeTab === 'program' ? 'psadt-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('program')}
        >
          <span className="psadt-tab-btn__icon">💻</span>
          <span className="psadt-tab-btn__label">Program</span>
        </button>
        <button
          type="button"
          className={`psadt-tab-btn ${activeTab === 'requirements' ? 'psadt-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('requirements')}
        >
          <span className="psadt-tab-btn__icon">🛠️</span>
          <span className="psadt-tab-btn__label">Requirements</span>
        </button>
        <button
          type="button"
          className={`psadt-tab-btn ${activeTab === 'detection' ? 'psadt-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('detection')}
        >
          <span className="psadt-tab-btn__icon">🔍</span>
          <span className="psadt-tab-btn__label">Detection Rules</span>
        </button>
        <button
          type="button"
          className={`psadt-tab-btn ${activeTab === 'dependencies' ? 'psadt-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('dependencies')}
        >
          <span className="psadt-tab-btn__icon">🔗</span>
          <span className="psadt-tab-btn__label">Dependencies & Supersedence</span>
        </button>
        <button
          type="button"
          className={`psadt-tab-btn ${activeTab === 'assignments' ? 'psadt-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('assignments')}
        >
          <span className="psadt-tab-btn__icon">👥</span>
          <span className="psadt-tab-btn__label">Assignments</span>
        </button>
        {state.wizardMode === 'edit' && (
          <button
            type="button"
            className={`psadt-tab-btn ${activeTab === 'sync' ? 'psadt-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('sync')}
          >
            <span className="psadt-tab-btn__icon">🔄</span>
            <span className="psadt-tab-btn__label">Intune Sync</span>
          </button>
        )}
      </div>

      <div className="intune-tab-content">
        {/* ==========================================
            TAB: APP INFORMATION
            ========================================== */}
        {activeTab === 'info' && (() => {
          const defaultIntuneAppName = `${state.displayName || ''} ${state.version || ''}`.trim().replace(/\s+/g, ' ');
          const intuneAppNameValue = state.intuneAppName || defaultIntuneAppName;
          const isDuplicate = intuneAppNameValue && intuneApps.length > 0 && intuneApps.some(app => (app.displayName || '').trim().toLowerCase() === intuneAppNameValue.trim().toLowerCase());
          return (
            <div className="animate-in">
              <div className="config-section">
                <h3 className="section-title">App Metadata</h3>
                <div className="form-grid">
                  <FormField label="Intune App Name" id="intuneAppName" hint="Customize how the application displays in the Intune Company Portal. Defaults to App Display Name + Version if left blank." style={{ gridColumn: 'span 2' }}>
                    <input id="intuneAppName" type="text" placeholder={`e.g. ${defaultIntuneAppName || 'Google Chrome 134.0'}`} value={intuneAppNameValue} onChange={e => {
                      const val = e.target.value;
                      // If the user typed exactly the auto-default (or cleared the field), remove the override
                      if (!val || val === defaultIntuneAppName) {
                        updateField('_intuneAppNameOverride', '');
                      } else {
                        updateField('_intuneAppNameOverride', val);
                      }
                    }} />
                    {isDuplicate && (
                      <div className="duplicate-warning animate-in" style={{
                        marginTop: '8px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: 'rgba(235, 94, 40, 0.12)',
                        border: '1px solid rgba(235, 94, 40, 0.35)',
                        color: '#f97316',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <span style={{ fontSize: '1rem' }}>⚠️</span>
                        <span>
                          <strong>Duplicate Name Warning:</strong> An application named <strong>"{intuneAppNameValue}"</strong> already exists in the Intune App Catalog.
                        </span>
                      </div>
                    )}
                  </FormField>
                  <FormField label="App Version" id="intuneAppVersion" hint="Synced from Basic Info — edit there to change.">
                    <input id="intuneAppVersion" type="text" readOnly value={state.version || ''} className="mono-input" style={{ opacity: 0.8 }} />
                  </FormField>
                  <FormField label="Description" id="appDescription">
                    <textarea id="appDescription" rows="2" placeholder="Application description for Intune Company Portal" value={state.appDescription || ''} onChange={e => updateField('appDescription', e.target.value)} />
                  </FormField>
                <FormField label="Publisher" id="publisher">
                  <input id="publisher" type="text" placeholder="e.g. Microsoft, Adobe" value={state.publisher || ''} onChange={e => updateField('publisher', e.target.value)} />
                </FormField>
                <FormField label="Owner" id="appOwner">
                  <input id="appOwner" type="text" value={state.appOwner || 'EUC Packaging'} onChange={e => updateField('appOwner', e.target.value)} />
                </FormField>
                <FormField label="Developer" id="appDeveloper">
                  <input id="appDeveloper" type="text" placeholder="e.g. Microsoft, Adobe" value={state.appDeveloper || ''} onChange={e => updateField('appDeveloper', e.target.value)} />
                </FormField>
                <FormField label="Information URL" id="informationUrl" hint="Link to app docs or vendor site" error={errors.informationUrl}>
                  <input id="informationUrl" type="url" placeholder="https://example.com"
                    className={errors.informationUrl ? 'input--error' : ''}
                    value={state.informationUrl || ''} onChange={e => updateField('informationUrl', e.target.value)} />
                </FormField>
                <FormField label="Privacy URL" id="privacyUrl" error={errors.privacyUrl}>
                  <input id="privacyUrl" type="url" placeholder="https://example.com/privacy"
                    className={errors.privacyUrl ? 'input--error' : ''}
                    value={state.privacyUrl || ''} onChange={e => updateField('privacyUrl', e.target.value)} />
                </FormField>
                <FormField label="Notes" id="appNotes">
                  <input id="appNotes" type="text" value={state.appNotes || 'Managed by SPA pipeline.'} onChange={e => updateField('appNotes', e.target.value)} />
                </FormField>
              </div>
              <ToggleSwitch label="Featured app in Company Portal" checked={state.isFeatured} onChange={v => updateField('isFeatured', v)} id="isFeatured" />
            </div>

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
                    <span className="msi-status msi-status--ok">✅ {state.logoFile?.name || state._logoFileName || 'Logo loaded'}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

        {/* ==========================================
            TAB: PROGRAM
            ========================================== */}
        {activeTab === 'program' && (
          <div className="animate-in">
            <div className="config-section">
              <h3 className="section-title">Installer Program</h3>
              <div className="form-grid">
                <FormField label="Install Command" id="installCommandLine" hint="Derived from PSADT scaffold settings (read-only)">
                  <input id="installCommandLine" type="text" readOnly value={derivedInstallCmd} className="mono-input" style={{ opacity: 0.8 }} />
                </FormField>
                <FormField label="Uninstall Command" id="uninstallCommandLine" hint="Derived from PSADT scaffold settings (read-only)">
                  <input id="uninstallCommandLine" type="text" readOnly value={derivedUninstallCmd} className="mono-input" style={{ opacity: 0.8 }} />
                </FormField>
                <SelectField label="Install behavior" id="installContext" value={state.installContext || 'system'}
                  hint="Specify if the installer runs in System or User context."
                  onChange={v => updateField('installContext', v)}
                  options={[{ value: 'system', label: 'System' }, { value: 'user', label: 'User' }]}
                />
                <SelectField label="Device Restart Behavior" id="restartBehavior" value={state.restartBehavior || 'basedOnReturnCode'}
                  hint="How Intune manages reboots after installation completes."
                  onChange={v => updateField('restartBehavior', v)}
                  options={windowsOptions.restartBehaviors}
                />
                <FormField label="Installation time required (mins)" id="maxInstallTime" hint="Maximum time Intune will wait for the install to complete.">
                  <input id="maxInstallTime" type="number" min="1" value={state.maxInstallTime} onChange={e => updateField('maxInstallTime', parseInt(e.target.value) || 60)} />
                </FormField>
              </div>
              <ToggleSwitch label="Allow available uninstall" checked={state.allowAvailableUninstall} onChange={v => updateField('allowAvailableUninstall', v)} id="allowAvailableUninstall" />
            </div>

            <div className="config-section">
              <h3 className="section-title">Return Codes <span className="section-optional">{returnCodes.length} codes</span></h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
                Define how Intune handles specific exit codes from the installer wrapper.
              </p>
              <table className="return-codes-table">
                <thead>
                  <tr><th>Code</th><th>Type</th><th></th></tr>
                </thead>
                <tbody>
                  {returnCodes.map((rc, i) => (
                    <tr key={i}>
                      <td>
                        <input type="number" className="return-code-input" value={rc.code}
                          onChange={e => updateReturnCode(i, 'code', parseInt(e.target.value) || 0)} />
                      </td>
                      <td>
                        <select className="return-code-select" value={rc.type}
                          onChange={e => updateReturnCode(i, 'type', e.target.value)}>
                          {windowsOptions.returnCodeTypes.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button type="button" className="action-btn action-btn--del" onClick={() => removeReturnCode(i)} title="Remove">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="add-action__btn" onClick={addReturnCode} style={{ marginTop: 'var(--space-sm)' }}>
                + Add Return Code
              </button>
            </div>
          </div>
        )}

        {/* ==========================================
            TAB: REQUIREMENTS
            ========================================== */}
        {activeTab === 'requirements' && (
          <div className="animate-in">
            <div className="config-section">
              <h3 className="section-title">Requirements</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
                Specify the requirements that devices must meet before the app is installed.
              </p>

              {/* OS Architecture — first item per Intune layout */}
              <div>
                <p className="action-field__label" style={{ marginBottom: '6px' }}>Check operating system architecture</p>
                <div className="detection-method-toggle">
                  <button type="button"
                    className={`detection-method-btn ${state.archCheckEnabled ? 'detection-method-btn--active' : ''}`}
                    onClick={() => updateField('archCheckEnabled', true)}>
                    Yes. Specify the systems the app can be installed on.
                  </button>
                  <button type="button"
                    className={`detection-method-btn ${!state.archCheckEnabled ? 'detection-method-btn--active' : ''}`}
                    onClick={() => updateField('archCheckEnabled', false)}>
                    No. Allow this app to be installed on all systems.
                  </button>
                </div>
                {state.archCheckEnabled && (
                  <div className="arch-checkboxes">
                    <label className="arch-checkbox">
                      <input type="checkbox" checked={state.archX86 || false} onChange={e => updateField('archX86', e.target.checked)} />
                      <span>x86 (32-bit)</span>
                    </label>
                    <label className="arch-checkbox">
                      <input type="checkbox" checked={state.archX64 || false} onChange={e => updateField('archX64', e.target.checked)} />
                      <span>x64 (64-bit)</span>
                    </label>
                    <label className="arch-checkbox">
                      <input type="checkbox" checked={state.archArm64 || false} onChange={e => updateField('archArm64', e.target.checked)} />
                      <span>ARM64</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Minimum operating system */}
              <div className="form-grid" style={{ marginTop: 'var(--space-md)' }}>
                <SelectField label="Minimum operating system" id="minWinRelease" value={state.minWinRelease || 'Windows11_22H2'}
                  onChange={v => updateField('minWinRelease', v)}
                  options={windowsOptions.windowsReleases}
                />
              </div>

              {/* Resource requirements */}
              <div className="form-grid" style={{ marginTop: 'var(--space-md)' }}>
                <FormField label="Disk space required (MB)" id="minDiskSpaceMB">
                  <input id="minDiskSpaceMB" type="number" min="0"
                    placeholder=""
                    value={state.minDiskSpaceMB ?? ''}
                    onChange={e => updateField('minDiskSpaceMB', e.target.value ? parseInt(e.target.value) : null)} />
                </FormField>
                <FormField label="Physical memory required (MB)" id="minMemoryMB">
                  <input id="minMemoryMB" type="number" min="0"
                    placeholder=""
                    value={state.minMemoryMB ?? ''}
                    onChange={e => updateField('minMemoryMB', e.target.value ? parseInt(e.target.value) : null)} />
                </FormField>
                <FormField label="Minimum number of logical processors required" id="minLogicalProcessors">
                  <input id="minLogicalProcessors" type="number" min="1"
                    placeholder=""
                    value={state.minLogicalProcessors ?? ''}
                    onChange={e => updateField('minLogicalProcessors', e.target.value ? parseInt(e.target.value) : null)} />
                </FormField>
                <FormField label="Minimum CPU speed required (MHz)" id="minCpuSpeedMHz">
                  <input id="minCpuSpeedMHz" type="number" min="1"
                    placeholder=""
                    value={state.minCpuSpeedMHz ?? ''}
                    onChange={e => updateField('minCpuSpeedMHz', e.target.value ? parseInt(e.target.value) : null)} />
                </FormField>
              </div>
            </div>

            {/* ═══ CUSTOM REQUIREMENT RULES ═══ */}
            <div className="config-section">
              <h3 className="section-title">Configure additional requirement rules <span className="section-optional">{customReqs.length} rule{customReqs.length !== 1 ? 's' : ''}</span></h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
                Add additional file, registry, or script checks that must pass before the app can install.
              </p>

              {customReqs.map((req, idx) => (
                <div key={idx} className="detection-rule-card" style={{ marginBottom: '8px' }}>
                  <div className="detection-rule-card__header">
                    <span className="detection-rule-card__type">{req.type === 'file' ? '📄 File Requirement' : req.type === 'script' ? '📜 Script Requirement' : '🔑 Registry Requirement'}</span>
                    <button type="button" className="action-btn action-btn--del" onClick={() => removeCustomReq(idx)}>✕</button>
                  </div>
                  <div className="form-grid" style={{ padding: '8px 12px 12px' }}>
                    {req.type === 'file' && (
                      <>
                        <FormField label="Path" id={`req-file-path-${idx}`}>
                          <input type="text" placeholder="C:\Program Files\MyApp" value={req.path || ''} onChange={e => updateCustomReq(idx, 'path', e.target.value)} />
                        </FormField>
                        <FormField label="File or Folder" id={`req-file-name-${idx}`}>
                          <input type="text" placeholder="MyApp.exe" value={req.fileOrFolder || ''} onChange={e => updateCustomReq(idx, 'fileOrFolder', e.target.value)} />
                        </FormField>
                        <SelectField label="Detection Method" id={`req-file-type-${idx}`} value={req.detectionType}
                          onChange={v => updateCustomReq(idx, 'detectionType', v)} options={REQ_FILE_DET_TYPES} />
                        {!['exists', 'doesNotExist'].includes(req.detectionType) && (
                          <>
                            <SelectField label="Operator" id={`req-file-op-${idx}`} value={req.operator}
                              onChange={v => updateCustomReq(idx, 'operator', v)} options={OPERATORS} />
                            <FormField label="Value" id={`req-file-val-${idx}`}>
                              <input type="text" value={req.detectionValue || ''} onChange={e => updateCustomReq(idx, 'detectionValue', e.target.value)} />
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
                          <input type="text" value={req.keyPath || ''} onChange={e => updateCustomReq(idx, 'keyPath', e.target.value)} />
                        </FormField>
                        <FormField label="Value Name" id={`req-reg-val-name-${idx}`}>
                          <input type="text" value={req.valueName || ''} onChange={e => updateCustomReq(idx, 'valueName', e.target.value)} />
                        </FormField>
                        <SelectField label="Detection Method" id={`req-reg-type-${idx}`} value={req.detectionType}
                          onChange={v => updateCustomReq(idx, 'detectionType', v)} options={REQ_REG_DET_TYPES} />
                        {!['exists', 'doesNotExist'].includes(req.detectionType) && (
                          <>
                            <SelectField label="Operator" id={`req-reg-op-${idx}`} value={req.operator}
                              onChange={v => updateCustomReq(idx, 'operator', v)} options={OPERATORS} />
                            <FormField label="Value" id={`req-reg-val-${idx}`}>
                              <input type="text" value={req.detectionValue || ''} onChange={e => updateCustomReq(idx, 'detectionValue', e.target.value)} />
                            </FormField>
                          </>
                        )}
                        <ToggleSwitch label="Check 32-bit registry on 64-bit systems" checked={req.check32BitOn64} onChange={v => updateCustomReq(idx, 'check32BitOn64', v)} id={`req-reg-32-${idx}`} />
                      </>
                    )}
                    {req.type === 'script' && (
                      <>
                        <FormField label="Script File (.ps1)" id={`req-script-file-${idx}`} style={{ gridColumn: 'span 2' }}>
                          <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                            <label className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '6px 12px', margin: 0 }}>
                              📄 Upload .ps1
                              <input type="file" accept=".ps1" style={{ display: 'none' }} onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const text = await file.text();
                                updateCustomReq(idx, 'scriptContent', text);
                                updateCustomReq(idx, 'scriptFileName', file.name);
                              }} />
                            </label>
                            {req.scriptContent && <span className="msi-status msi-status--ok">✅ {req.scriptFileName || 'Script loaded'} ({req.scriptContent.split('\n').length} lines)</span>}
                          </div>
                        </FormField>
                        {req.scriptContent && (
                          <div style={{ gridColumn: 'span 2', marginBottom: '8px' }}>
                            <pre style={{ fontSize: '0.72rem', maxHeight: '120px', overflow: 'auto', padding: '8px', background: 'var(--bg-card, rgba(0,0,0,0.15))', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>{req.scriptContent.slice(0, 800)}{req.scriptContent.length > 800 ? '\n...' : ''}</pre>
                          </div>
                        )}
                        <SelectField label="Output Data Type" id={`req-script-output-${idx}`} value={req.outputDataType || 'string'}
                          hint="Data type of the script's STDOUT for comparison."
                          onChange={v => updateCustomReq(idx, 'outputDataType', v)} options={SCRIPT_OUTPUT_TYPES} />
                        <SelectField label="Operator" id={`req-script-op-${idx}`} value={req.operator || 'notConfigured'}
                          onChange={v => updateCustomReq(idx, 'operator', v)} options={OPERATORS} />
                        <FormField label="Value" id={`req-script-val-${idx}`} hint="Expected STDOUT value to match against.">
                          <input type="text" value={req.detectionValue || ''} onChange={e => updateCustomReq(idx, 'detectionValue', e.target.value)} />
                        </FormField>
                        <ToggleSwitch label="Run script as 32-bit process on 64-bit clients" checked={req.runAs32Bit || false} onChange={v => updateCustomReq(idx, 'runAs32Bit', v)} id={`req-script-32-${idx}`} />
                        <ToggleSwitch label="Run this script using the logged on credentials" checked={req.runAsAccount || false} onChange={v => updateCustomReq(idx, 'runAsAccount', v)} id={`req-script-account-${idx}`} />
                        <ToggleSwitch label="Enforce script signature check" checked={req.enforceSignatureCheck || false} onChange={v => updateCustomReq(idx, 'enforceSignatureCheck', v)} id={`req-script-sig-${idx}`} />
                      </>
                    )}
                  </div>
                </div>
              ))}

              <div className="detection-add-buttons">
                <button type="button" className="btn btn-secondary" onClick={() => addCustomReq('file')}>+ File Requirement</button>
                <button type="button" className="btn btn-secondary" onClick={() => addCustomReq('registry')}>+ Registry Requirement</button>
                <button type="button" className="btn btn-secondary" onClick={() => addCustomReq('script')}>+ Script Requirement</button>
              </div>
            </div>
          </div>
        )}

        {/* ==========================================
            TAB: DETECTION RULES
            ========================================== */}
        {activeTab === 'detection' && (
          <div className="animate-in">
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
              <div className="config-section animate-in">
                <h3 className="section-title">Detection Rules <span className="section-optional">{detectionRules.length} rule{detectionRules.length !== 1 ? 's' : ''}</span></h3>

                {detectionRules.length === 0 && (
                  <p className="phase-empty" style={{ marginBottom: 'var(--space-md)' }}>No detection rules configured. Add at least one rule below.</p>
                )}

                <div className="detection-rules-list" style={{ marginBottom: 'var(--space-md)' }}>
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
              <div className="config-section animate-in">
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
                  <ToggleSwitch label="Run script as 32-bit process on 64-bit clients" checked={state.scriptRunAs32Bit || false} onChange={v => updateField('scriptRunAs32Bit', v)} id="scriptRunAs32Bit" />
                  <ToggleSwitch label="Enforce script signature check and run script silently" checked={state.scriptEnforceSignature || false} onChange={v => updateField('scriptEnforceSignature', v)} id="scriptEnforceSignature" />
                </div>

                {state.scriptContent && (
                  <div className="script-preview" style={{ marginTop: 'var(--space-md)' }}>
                    <pre>{state.scriptContent.slice(0, 500)}{state.scriptContent.length > 500 ? '\n...' : ''}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ==========================================
            TAB: DEPENDENCIES & SUPERSEDENCE
            ========================================== */}
        {activeTab === 'dependencies' && (
          <div className="animate-in">
            <div className="config-section">
              <h3 className="section-title">App Dependencies <span className="section-optional">Optional &bull; {dependencies.length} dependenc{dependencies.length === 1 ? 'y' : 'ies'}</span></h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
                Specify other Intune apps that must be installed before this app.
              </p>

              {dependencies.map((dep, idx) => (
                <div key={idx} className="dep-row" style={{ marginBottom: '8px' }}>
                  <FormField label="App ID (GUID)" id={`dep-appid-${idx}`} error={errors[`dep_${idx}_appId`]}>
                    <input type="text" placeholder="{12345678-abcd-1234-abcd-1234567890ab}"
                      className={errors[`dep_${idx}_appId`] ? 'input--error' : ''}
                      value={dep.appId || ''} onChange={e => updateDependency(idx, 'appId', e.target.value)} />
                  </FormField>
                  <SelectField label="Automatically install" id={`dep-type-${idx}`} value={dep.dependencyType || 'autoInstall'}
                    onChange={v => updateDependency(idx, 'dependencyType', v)}
                    options={[
                      { value: 'autoInstall', label: 'Yes' },
                      { value: 'detect', label: 'No' },
                    ]} />
                  <button type="button" className="action-btn action-btn--del" onClick={() => removeDependency(idx)} title="Remove dependency">✕</button>
                </div>
              ))}
              <button type="button" className="add-action__btn" onClick={addDependency}>+ Add Dependency</button>
            </div>

            <div className="config-section">
              <h3 className="section-title">Supersedence <span className="section-optional">Optional</span></h3>
              <div className="form-grid">
                <FormField label="Superseded App ID" id="supersedesAppId" hint="Intune app GUID of the app being replaced" error={errors.supersedesAppId}>
                  <input id="supersedesAppId" type="text" placeholder="Leave empty if not superseding"
                    className={errors.supersedesAppId ? 'input--error' : ''}
                    value={state.supersedesAppId || ''} onChange={e => updateField('supersedesAppId', e.target.value)} />
                </FormField>
                <SelectField label="Uninstall previous version" id="supersedenceType" value={state.supersedenceType || 'replace'}
                  onChange={v => updateField('supersedenceType', v)}
                  options={[
                    { value: 'update', label: 'Yes' },
                    { value: 'replace', label: 'No' },
                  ]}
                />
              </div>
            </div>
          </div>
        )}

        {/* ==========================================
            TAB: ASSIGNMENTS
            ========================================== */}
        {activeTab === 'assignments' && (
          <div className="animate-in">
            <AssignmentsSection
              assignments={state.assignments || []}
              onChange={v => updateField('assignments', v)}
              validationErrors={errors}
            />
          </div>
        )}

        {/* ==========================================
            TAB: INTUNE SYNC (edit mode only)
            ========================================== */}
        {activeTab === 'sync' && state.wizardMode === 'edit' && (
          <div className="animate-in">
            <div className="config-section">
              <h3 className="section-title">🔄 Intune Sync</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)' }}>
                Compare builder state against live Intune data. Resolve differences per-field by choosing whether to keep the builder value or use the Intune value.
              </p>

              {!state.syncIntuneAppId ? (
                /* No sync app configured — show selector */
                <div className="intune-sync-section__setup">
                  <p className="intune-sync-section__hint">
                    Link this title to an existing Intune Win32 app to compare metadata.
                  </p>
                  <div className="intune-sync-section__actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={handleLoadCatalogForSync}
                      disabled={catalogLoading}
                    >
                      {catalogLoading ? '⏳ Loading…' : '📋 Select from Intune Catalog'}
                    </button>
                    <div className="intune-sync-section__manual">
                      <input
                        type="text"
                        className="form-input form-input--sm"
                        placeholder="Or paste Intune App ID (GUID)…"
                        value={manualAppId}
                        onChange={e => setManualAppId(e.target.value)}
                        style={{ flex: 1, minWidth: 260 }}
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={!manualAppId.trim() || !GUID_RE.test(manualAppId.trim())}
                        onClick={() => handleSetSyncApp(manualAppId.trim())}
                      >
                        Link
                      </button>
                    </div>
                  </div>

                  {/* Inline catalog picker */}
                  {showCatalogPicker && catalogForSync && (
                    <div className="intune-sync-section__catalog">
                      <CatalogMiniPicker
                        apps={catalogForSync}
                        onSelect={(app) => {
                          handleSetSyncApp(app.id || app.appId);
                          setShowCatalogPicker(false);
                        }}
                        onClose={() => setShowCatalogPicker(false)}
                      />
                    </div>
                  )}
                </div>
              ) : (
                /* Sync app is set — show comparison */
                <div>
                  <div className="intune-sync-section__linked" style={{ marginBottom: 'var(--space-md)', padding: '8px 12px', background: 'var(--bg-card, rgba(255,255,255,0.02))', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <span>Linked to: <code>{state.syncIntuneAppId}</code></span>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={handleRemoveSyncApp} style={{ color: '#ef4444', marginLeft: 'auto' }}>✕ Unlink</button>
                    {onRefresh => <button className="btn btn-ghost btn-xs" style={{marginLeft: 10}} onClick={() => runSyncCheck(state.syncIntuneAppId)}>↻ Refresh Live Data</button>}
                  </div>
                  
                  {syncLoading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Fetching live Intune data...</div>
                  ) : syncError ? (
                    <div className="validation-banner">⚠️ {syncError}</div>
                  ) : syncIntuneData ? (
                    <JsonDiffPicker
                      targetObj={{
                        ...state,
                        // Override displayName in targetObj so it matches what we'd export to Intune App Name
                        displayName: state.intuneAppName,
                      }}
                      sourceObj={syncIntuneData}
                      onPullField={handleSyncPullField}
                      onPullAll={handleSyncPullAll}
                      titleLeft="Builder (app.json)"
                      titleRight="Live (live_app.json)"
                    />
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}
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

        .return-codes-table { width: 100%; border-collapse: collapse; }
        .return-codes-table th { text-align: left; font-size: 0.7rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; padding: 4px 8px; border-bottom: 1px solid var(--border-subtle); }
        .return-codes-table td { padding: 4px 8px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.04)); vertical-align: middle; }
        .return-code-input { width: 80px; padding: 4px 8px; font-size: 0.82rem; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); color: var(--text-primary); font-family: var(--font-mono); }
        .return-code-select { padding: 4px 8px; font-size: 0.82rem; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); color: var(--text-primary); font-family: inherit; }

        .mono-input { font-family: var(--font-mono); font-size: 0.82rem; }
      `}</style>
    </div>
  );
}

// ── Intune Metadata Summary ─────────────────────────────────────────────

function IntuneMetaSummary({ state }) {
  const [expanded, setExpanded] = useState(true);

  const defaultIntuneAppName = `${state.displayName || ''} ${state.version || ''}`.trim().replace(/\s+/g, ' ');
  const intuneAppNameValue = state.intuneAppName || defaultIntuneAppName;

  // Build metadata rows — show all Intune-relevant fields with their current values
  const metaRows = [
    { label: 'Display Name', value: intuneAppNameValue },
    { label: 'Publisher', value: state.publisher },
    { label: 'Version', value: state.version },
    { label: 'Description', value: state.appDescription, truncate: true },
    { label: 'Owner', value: state.appOwner },
    { label: 'Developer', value: state.appDeveloper },
    { label: 'Category', value: state.softwareCategory },
    { label: 'Information URL', value: state.informationUrl, isUrl: true },
    { label: 'Privacy URL', value: state.privacyUrl, isUrl: true },
    { label: 'Notes', value: state.appNotes, truncate: true },
    { label: 'Featured', value: state.isFeatured ? 'Yes' : 'No', badge: state.isFeatured ? 'accent' : 'muted' },
    { label: 'Allow Uninstall', value: state.allowAvailableUninstall ? 'Yes' : 'No', badge: state.allowAvailableUninstall ? 'accent' : 'muted' },
    { label: 'Installer Type', value: state.installerType?.toUpperCase() },
    { label: 'Detection Mode', value: state.detectionMode },
    { label: 'Restart Behavior', value: state.restartBehavior },
    { label: 'Installation Time Required', value: state.maxInstallTime ? `${state.maxInstallTime} min` : '' },
    { label: 'Install Context', value: state.installContext },
    { label: 'Min Windows', value: state.minWinRelease },
    { label: 'Min Disk Space', value: state.minDiskSpaceMB != null ? `${state.minDiskSpaceMB} MB` : '' },
    { label: 'Min Memory', value: state.minMemoryMB != null ? `${state.minMemoryMB} MB` : '' },
    { label: 'Assignments', value: state.assignments?.length ? `${state.assignments.length} group(s)` : '' },
    { label: 'Supersedes', value: state.supersedesAppId || '' },
    { label: 'Sync Intune App', value: state.syncIntuneAppId, mono: true },
    { label: 'Import Source ID', value: !state.syncIntuneAppId && state._intuneAppId ? state._intuneAppId : '', mono: true },
  ].filter(r => r.value && r.value !== '');

  const populatedCount = metaRows.length;

  return (
    <div className="intune-meta-summary">
      <button type="button" className="intune-meta-summary__header" onClick={() => setExpanded(!expanded)}>
        <span className="intune-meta-summary__icon">📋</span>
        <span className="intune-meta-summary__title">Intune Properties</span>
        <span className="intune-meta-summary__badge">{populatedCount} populated</span>
        {state._intuneExportImported && (
          <span className="intune-meta-summary__source">from Intune catalog</span>
        )}
        <span className="intune-meta-summary__chevron">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="intune-meta-summary__body">
          <div className="intune-meta-grid">
            {metaRows.map(row => (
              <div key={row.label} className="intune-meta-row">
                <span className="intune-meta-row__label">{row.label}</span>
                {row.isUrl && row.value ? (
                  <a className="intune-meta-row__value intune-meta-row__value--link" href={row.value} target="_blank" rel="noopener noreferrer">{row.value}</a>
                ) : row.badge ? (
                  <span className={`intune-meta-row__badge intune-meta-row__badge--${row.badge}`}>{row.value}</span>
                ) : (
                  <span className={`intune-meta-row__value ${row.mono ? 'intune-meta-row__value--mono' : ''} ${row.truncate ? 'intune-meta-row__value--truncate' : ''}`}>{row.value}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .intune-meta-summary {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-lg);
          overflow: hidden;
          background: var(--bg-card, rgba(255,255,255,0.02));
        }
        .intune-meta-summary__header {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          width: 100%;
          padding: 10px var(--space-md);
          background: none;
          border: none;
          cursor: pointer;
          font-family: inherit;
          color: inherit;
          transition: background 0.15s;
        }
        .intune-meta-summary__header:hover {
          background: var(--bg-hover, rgba(255,255,255,0.04));
        }
        .intune-meta-summary__icon { font-size: 1rem; flex-shrink: 0; }
        .intune-meta-summary__title {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .intune-meta-summary__badge {
          font-size: 0.65rem;
          font-weight: 700;
          background: rgba(99,140,255,0.15);
          color: var(--text-accent, #7c8aff);
          padding: 2px 8px;
          border-radius: 10px;
        }
        .intune-meta-summary__source {
          font-size: 0.7rem;
          color: var(--text-muted);
          font-style: italic;
          margin-left: auto;
        }
        .intune-meta-summary__chevron {
          font-size: 0.7rem;
          color: var(--text-muted);
          width: 14px;
          flex-shrink: 0;
        }
        .intune-meta-summary__body {
          padding: var(--space-sm) var(--space-md) var(--space-md);
          border-top: 1px solid var(--border-subtle);
        }
        .intune-meta-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 6px 16px;
        }
        .intune-meta-row {
          display: flex;
          align-items: baseline;
          gap: var(--space-sm);
          padding: 3px 0;
          border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .intune-meta-row__label {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.03em;
          flex-shrink: 0;
          min-width: 100px;
        }
        .intune-meta-row__value {
          font-size: 0.78rem;
          color: var(--text-primary);
          word-break: break-word;
        }
        .intune-meta-row__value--mono {
          font-family: var(--font-mono);
          font-size: 0.72rem;
          color: var(--text-secondary);
        }
        .intune-meta-row__value--truncate {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .intune-meta-row__value--link {
          font-size: 0.74rem;
          color: var(--text-accent, #7c8aff);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .intune-meta-row__value--link:hover {
          color: var(--text-primary);
        }
        .intune-meta-row__badge {
          font-size: 0.7rem;
          font-weight: 600;
          padding: 1px 8px;
          border-radius: 8px;
        }
        .intune-meta-row__badge--accent {
          background: rgba(99,140,255,0.12);
          color: var(--text-accent, #7c8aff);
        }
        .intune-meta-row__badge--muted {
          background: rgba(255,255,255,0.06);
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}

// ── CatalogMiniPicker — inline compact app selector for sync ─────────────
function CatalogMiniPicker({ apps, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    if (searchRef.current) searchRef.current.focus();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return apps.slice(0, 50);
    const q = search.toLowerCase();
    return apps.filter(app =>
      (app.displayName || '').toLowerCase().includes(q) ||
      (app.publisher || '').toLowerCase().includes(q) ||
      (app.id || app.appId || '').toLowerCase().includes(q)
    ).slice(0, 50);
  }, [apps, search]);

  return (
    <div className="catalog-mini-picker">
      <div className="catalog-mini-picker__header">
        <input
          ref={searchRef}
          type="text"
          className="form-input form-input--sm"
          placeholder="Search by name, publisher, or ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
      </div>
      <div className="catalog-mini-picker__list">
        {filtered.length === 0 && <div className="catalog-mini-picker__empty">No apps match "{search}"</div>}
        {filtered.map(app => {
          const uid = app.id || app.appId;
          return (
            <button
              key={uid}
              type="button"
              className="catalog-mini-picker__item"
              onClick={() => onSelect(app)}
            >
              <span className="catalog-mini-picker__name">{app.displayName}</span>
              <span className="catalog-mini-picker__meta">
                {app.publisher || ''} • {app.displayVersion || app.version || '—'}
              </span>
            </button>
          );
        })}
      </div>

      <style>{`
        .catalog-mini-picker {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md, 8px);
          margin-top: 8px;
          background: var(--bg-card, rgba(0,0,0,0.15));
          overflow: hidden;
        }
        .catalog-mini-picker__header {
          display: flex;
          gap: 6px;
          padding: 8px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .catalog-mini-picker__list {
          max-height: 240px;
          overflow-y: auto;
        }
        .catalog-mini-picker__empty {
          padding: 16px;
          text-align: center;
          color: var(--text-muted);
          font-size: 0.78rem;
        }
        .catalog-mini-picker__item {
          display: flex;
          flex-direction: column;
          width: 100%;
          padding: 8px 12px;
          background: none;
          border: none;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          cursor: pointer;
          text-align: left;
          color: inherit;
          font-family: inherit;
          transition: background 0.15s;
        }
        .catalog-mini-picker__item:hover {
          background: rgba(99, 102, 241, 0.08);
        }
        .catalog-mini-picker__name {
          font-size: 0.82rem;
          font-weight: 500;
          color: var(--text-primary);
        }
        .catalog-mini-picker__meta {
          font-size: 0.7rem;
          color: var(--text-muted);
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}
