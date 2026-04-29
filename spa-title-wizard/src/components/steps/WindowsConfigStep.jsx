import { useState, useRef } from 'react';
import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';
import AssignmentsSection from '../ui/AssignmentsSection';
import { parseMsiFile } from '../../lib/parseMsi';
import windowsOptions from '../../config/windowsOptions.json';
import { PHASE_KEYS, PHASE_META, ACTION_TYPE_MAP, getActionsForPhase, getCategoriesForPhase, createAction } from '../../config/actionTypes';

/** Inline action card — editable, deletable, reorderable */
function ActionCard({ action, index, total, phaseKey, onUpdate, onRemove, onMove }) {
  const def = ACTION_TYPE_MAP[action.type];
  const icon = def?.icon || '▪️';
  const label = def?.label || action.type;

  return (
    <div className={`action-card ${!action.enabled ? 'action-card--disabled' : ''}`}>
      <div className="action-card__header">
        <span className="action-card__icon">{icon}</span>
        <span className="action-card__label">{label}</span>
        <div className="action-card__controls">
          <button className="action-btn" disabled={index === 0} onClick={() => onMove(phaseKey, index, index - 1)} title="Move up">▲</button>
          <button className="action-btn" disabled={index === total - 1} onClick={() => onMove(phaseKey, index, index + 1)} title="Move down">▼</button>
          <button className="action-btn action-btn--toggle" onClick={() => onUpdate(phaseKey, index, { enabled: !action.enabled })} title={action.enabled ? 'Disable' : 'Enable'}>{action.enabled ? '✓' : '○'}</button>
          <button className="action-btn action-btn--del" onClick={() => onRemove(phaseKey, index)} title="Remove">✕</button>
        </div>
      </div>
      {action.enabled && def?.fields?.length > 0 && (
        <div className="action-card__fields">
          {def.fields.map(f => (
            <div key={f.key} className="action-field">
              <label className="action-field__label">{f.label}</label>
              {f.type === 'boolean' ? (
                <input type="checkbox" checked={!!action[f.key]} onChange={e => onUpdate(phaseKey, index, { [f.key]: e.target.checked })} />
              ) : f.type === 'number' ? (
                <input type="number" value={action[f.key] ?? f.default ?? 0} onChange={e => onUpdate(phaseKey, index, { [f.key]: parseInt(e.target.value) || 0 })} />
              ) : f.type === 'guids' ? (
                <textarea rows="3" placeholder="One GUID per line" value={Array.isArray(action[f.key]) ? action[f.key].join('\n') : (action[f.key] || '')} onChange={e => onUpdate(phaseKey, index, { [f.key]: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} />
              ) : (
                <input type="text" placeholder={f.placeholder || ''} value={action[f.key] || ''} onChange={e => onUpdate(phaseKey, index, { [f.key]: e.target.value })} />
              )}
            </div>
          ))}
        </div>
      )}
      {action.enabled && action.raw && (
        <div className="action-card__raw" title="Original PowerShell command">
          <code>{action.raw}</code>
        </div>
      )}
    </div>
  );
}

/** Add action picker — dropdown grouped by category */
function AddActionPicker({ phaseKey, onAdd }) {
  const [open, setOpen] = useState(false);
  const categories = getCategoriesForPhase(phaseKey);
  const actions = getActionsForPhase(phaseKey);

  return (
    <div className="add-action">
      <button className="add-action__btn" onClick={() => setOpen(!open)}>＋ Add Action</button>
      {open && (
        <div className="add-action__dropdown">
          {categories.map(cat => (
            <div key={cat} className="add-action__group">
              <span className="add-action__cat">{cat}</span>
              {actions.filter(a => a.category === cat).map(a => (
                <button key={a.type} className="add-action__item" onClick={() => { onAdd(phaseKey, createAction(a.type)); setOpen(false); }}>
                  <span>{a.icon}</span> {a.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WindowsConfigStep({ state, updateField, addAction, removeAction, updateAction, moveAction, updateLifecycleRoot }) {
  const [showLifecycle, setShowLifecycle] = useState(false);
  const [msiParsing, setMsiParsing] = useState(false);
  const [msiParseResult, setMsiParseResult] = useState(null);
  const [msiManualEntry, setMsiManualEntry] = useState(false);
  const [expandedPhases, setExpandedPhases] = useState({});
  const scriptFileRef = useRef(null);
  const lc = state.lifecycle;

  // ── MSI File Upload Handler ─────────────────────────────────────────────
  const handleMsiUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsiParsing(true);
    setMsiParseResult(null);
    try {
      const meta = await parseMsiFile(file);
      setMsiParseResult(meta);
      // Auto-fill fields from parsed metadata
      if (meta.productCode) updateField('msiProductCode', meta.productCode);
      if (meta.productVersion) updateField('msiProductVersion', meta.productVersion);
      if (meta.productName) updateField('msiProductName', meta.productName);
      if (meta.manufacturer) updateField('msiManufacturer', meta.manufacturer);
      if (meta.upgradeCode) updateField('msiUpgradeCode', meta.upgradeCode);
      if (meta.fileName) updateField('msiFileName', meta.fileName);
    } catch (err) {
      setMsiParseResult({ error: err.message });
    } finally {
      setMsiParsing(false);
    }
  };

  // ── Detection Script Upload ─────────────────────────────────────────────
  const handleScriptUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    updateField('scriptContent', text);
  };

  return (
    <div className="step-content animate-in">
      <div className="step-header">
        <h2>🪟 Windows Configuration</h2>
        <p>Configure installer, detection, assignments, requirements, and deployment behavior.</p>
      </div>

      {/* ═══ INSTALLER ═══ */}
      <div className="config-section">
        <h3 className="section-title">Installer</h3>
        <div className="form-grid">
          <SelectField label="Installer Type" id="installerType" value={state.installerType}
            onChange={v => updateField('installerType', v)}
            options={[{ value: 'msi', label: 'MSI' }, { value: 'exe', label: 'EXE' }]}
          />
          <SelectField label="Detection Mode" id="detectionMode" value={state.detectionMode}
            onChange={v => updateField('detectionMode', v)}
            hint="How Intune detects if the app is installed."
            options={[
              { value: 'msi-product-code', label: 'MSI Product Code' },
              { value: 'registry-marker', label: 'Registry Marker' },
              { value: 'file', label: 'File Detection' },
              { value: 'script', label: 'Script Detection' },
            ]}
          />
        </div>
        <FormField label="Installer Source (Runner Path)" id="installerSource"
          hint="Full path to the installer pre-staged on the runner. Leave empty if the installer is committed to git in windows/src/Files/.">
          <input id="installerSource" type="text"
            value={state.installerSource}
            onChange={e => updateField('installerSource', e.target.value)}
            placeholder="C:/files/7-zip/7z2600-x64.msi"
          />
        </FormField>
      </div>

      {/* ═══ MSI METADATA (with file upload) ═══ */}
      {state.installerType === 'msi' && (
        <div className="config-section animate-slide">
          <h3 className="section-title">MSI Metadata</h3>
          {!msiManualEntry && (
            <div className="msi-upload-area">
              <label className="msi-upload-btn btn btn-secondary">
                📂 Upload .msi to auto-extract
                <input type="file" accept=".msi" onChange={handleMsiUpload} style={{ display: 'none' }} />
              </label>
              {msiParsing && <span className="msi-status">⏳ Parsing...</span>}
              {msiParseResult && !msiParseResult.error && (
                <span className="msi-status msi-status--ok">✅ Extracted {Object.values(msiParseResult).filter(v => v && v !== msiParseResult.fileName).length} fields</span>
              )}
              {msiParseResult?.error && <span className="msi-status msi-status--err">❌ {msiParseResult.error}</span>}
              <button type="button" className="link-btn" onClick={() => setMsiManualEntry(true)}>or enter manually</button>
            </div>
          )}
          {msiManualEntry && (
            <div className="msi-manual-banner">
              <span>✏️ Manual entry mode</span>
              <button type="button" className="link-btn" onClick={() => setMsiManualEntry(false)}>Switch back to file upload</button>
            </div>
          )}
          <div className="form-grid">
            <FormField label="Product Code (GUID)" id="msiProductCode" hint={msiManualEntry ? 'Run: Get-AppLockerFileInformation .\\installer.msi | Select -Expand Publisher' : 'Auto-filled from MSI upload'}>
              <input id="msiProductCode" type="text" placeholder="{GUID}" value={state.msiProductCode} onChange={e => updateField('msiProductCode', e.target.value)} />
            </FormField>
            <FormField label="Source Filename" id="msiFileName">
              <input id="msiFileName" type="text" placeholder="installer.msi" value={state.msiFileName} onChange={e => updateField('msiFileName', e.target.value)} />
            </FormField>
            <FormField label="Product Version" id="msiProductVersion">
              <input id="msiProductVersion" type="text" value={state.msiProductVersion} onChange={e => updateField('msiProductVersion', e.target.value)} />
            </FormField>
            <FormField label="Product Name" id="msiProductName">
              <input id="msiProductName" type="text" value={state.msiProductName} onChange={e => updateField('msiProductName', e.target.value)} />
            </FormField>
            <FormField label="Upgrade Code" id="msiUpgradeCode">
              <input id="msiUpgradeCode" type="text" value={state.msiUpgradeCode} onChange={e => updateField('msiUpgradeCode', e.target.value)} />
            </FormField>
            <FormField label="Manufacturer" id="msiManufacturer">
              <input id="msiManufacturer" type="text" value={state.msiManufacturer} onChange={e => updateField('msiManufacturer', e.target.value)} />
            </FormField>
          </div>
        </div>
      )}

      {/* ═══ EXE DETAILS ═══ */}
      {state.installerType === 'exe' && (
        <div className="config-section animate-slide">
          <h3 className="section-title">EXE Installer Details</h3>
          <div className="form-grid">
            <FormField label="Source Filename" id="exeSourceFilename" hint="e.g. Setup.exe">
              <input id="exeSourceFilename" type="text" placeholder="Setup.exe" value={state.exeSourceFilename} onChange={e => updateField('exeSourceFilename', e.target.value)} />
            </FormField>
            <FormField label="Install Arguments" id="exeInstallArgs">
              <input id="exeInstallArgs" type="text" value={state.exeInstallArgs} onChange={e => updateField('exeInstallArgs', e.target.value)} />
            </FormField>
            <FormField label="Uninstall Path" id="exeUninstallPath">
              <input id="exeUninstallPath" type="text" placeholder="C:\Program Files\App\uninstall.exe" value={state.exeUninstallPath} onChange={e => updateField('exeUninstallPath', e.target.value)} />
            </FormField>
            <FormField label="Uninstall Arguments" id="exeUninstallArgs">
              <input id="exeUninstallArgs" type="text" value={state.exeUninstallArgs} onChange={e => updateField('exeUninstallArgs', e.target.value)} />
            </FormField>
          </div>
        </div>
      )}

      {/* ═══ DETECTION — MSI Product Code ═══ */}
      {state.detectionMode === 'msi-product-code' && (
        <div className="config-section animate-slide">
          <h3 className="section-title">MSI Product Code Detection</h3>
          <div className="form-grid">
            <FormField label="Product Code" id="det-msiPC" required hint="GUID from the MSI — auto-filled if you uploaded an MSI above">
              <input id="det-msiPC" type="text" value={state.msiProductCode} onChange={e => updateField('msiProductCode', e.target.value)} placeholder="{GUID}" />
            </FormField>
            <SelectField label="Version Operator" id="det-msiOp" value={state.fileDetOperator}
              onChange={v => updateField('fileDetOperator', v)}
              options={[
                { value: 'greaterThanOrEqual', label: '>= (default)' },
                { value: 'equal', label: '=' },
                { value: 'notEqual', label: '!=' },
                { value: 'greaterThan', label: '>' },
              ]}
            />
          </div>
        </div>
      )}

      {/* ═══ DETECTION — Registry ═══ */}
      {state.detectionMode === 'registry-marker' && (
        <div className="config-section animate-slide">
          <h3 className="section-title">Registry Detection</h3>
          <div className="form-grid">
            <SelectField label="Hive" id="regHive" value={state.regHive}
              onChange={v => updateField('regHive', v)}
              options={[
                { value: 'HKLM', label: 'HKEY_LOCAL_MACHINE' },
                { value: 'HKCU', label: 'HKEY_CURRENT_USER' },
              ]}
            />
            <FormField label="Key Path" id="regKeyPath" required hint="e.g. SOFTWARE\\Fiserv\\InstalledApps\\my-app">
              <input id="regKeyPath" type="text" placeholder={`SOFTWARE\\Fiserv\\InstalledApps\\${state.packageId || 'my-app'}`}
                value={state.regKeyPath || `SOFTWARE\\Fiserv\\InstalledApps\\${state.packageId}`}
                onChange={e => updateField('regKeyPath', e.target.value)} />
            </FormField>
            <FormField label="Value Name" id="regValueName">
              <input id="regValueName" type="text" value={state.regValueName} onChange={e => updateField('regValueName', e.target.value)} />
            </FormField>
            <SelectField label="Operator" id="regOperator" value={state.regOperator}
              onChange={v => updateField('regOperator', v)}
              options={[
                { value: 'greaterThanOrEqual', label: '>=' },
                { value: 'equal', label: '=' },
                { value: 'notEqual', label: '!=' },
                { value: 'greaterThan', label: '>' },
              ]}
            />
            <FormField label="Expected Value" id="regValue" hint="Detection value — defaults to app version">
              <input id="regValue" type="text" placeholder={state.version} value={state.regValue} onChange={e => updateField('regValue', e.target.value)} />
            </FormField>
          </div>
          <ToggleSwitch label="Check 32-bit registry on 64-bit systems" checked={state.regCheck32Bit} onChange={v => updateField('regCheck32Bit', v)} id="regCheck32Bit" />
        </div>
      )}

      {/* ═══ DETECTION — File ═══ */}
      {state.detectionMode === 'file' && (
        <div className="config-section animate-slide">
          <h3 className="section-title">File Detection</h3>
          <div className="form-grid">
            <FormField label="Folder Path" id="fileDetPath">
              <input id="fileDetPath" type="text" placeholder="C:\Program Files\MyApp" value={state.fileDetPath} onChange={e => updateField('fileDetPath', e.target.value)} />
            </FormField>
            <FormField label="File or Folder Name" id="fileDetName">
              <input id="fileDetName" type="text" placeholder="MyApp.exe" value={state.fileDetName} onChange={e => updateField('fileDetName', e.target.value)} />
            </FormField>
            <SelectField label="Detection Type" id="fileDetType" value={state.fileDetType} onChange={v => updateField('fileDetType', v)}
              options={[
                { value: 'exists', label: 'Exists' },
                { value: 'doesNotExist', label: 'Does Not Exist' },
                { value: 'version', label: 'Version Comparison' },
                { value: 'sizeInMB', label: 'Size (MB)' },
                { value: 'modifiedDate', label: 'Modified Date' },
              ]}
            />
            {['version', 'sizeInMB', 'modifiedDate'].includes(state.fileDetType) && (
              <>
                <SelectField label="Operator" id="fileDetOperator" value={state.fileDetOperator} onChange={v => updateField('fileDetOperator', v)}
                  options={[
                    { value: 'greaterThanOrEqual', label: '>=' },
                    { value: 'equal', label: '=' },
                    { value: 'notEqual', label: '!=' },
                    { value: 'greaterThan', label: '>' },
                    { value: 'lessThan', label: '<' },
                    { value: 'lessThanOrEqual', label: '<=' },
                  ]}
                />
                <FormField label="Value" id="fileDetValue">
                  <input id="fileDetValue" type="text" value={state.fileDetValue} onChange={e => updateField('fileDetValue', e.target.value)} />
                </FormField>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ DETECTION — Script ═══ */}
      {state.detectionMode === 'script' && (
        <div className="config-section animate-slide">
          <h3 className="section-title">Script Detection</h3>
          <ToggleSwitch label="Run as 32-bit process" checked={state.scriptRunAs32Bit} onChange={v => updateField('scriptRunAs32Bit', v)} id="scriptRunAs32Bit" />
          <ToggleSwitch label="Enforce script signature check" checked={state.scriptEnforceSignature} onChange={v => updateField('scriptEnforceSignature', v)} id="scriptEnforceSignature" />
          <div className="script-upload-area">
            <label className="btn btn-secondary">
              📄 Upload detect.ps1
              <input ref={scriptFileRef} type="file" accept=".ps1" onChange={handleScriptUpload} style={{ display: 'none' }} />
            </label>
            {state.scriptContent && <span className="msi-status msi-status--ok">✅ Script loaded ({state.scriptContent.split('\n').length} lines)</span>}
          </div>
          {state.scriptContent && (
            <div className="script-preview">
              <pre>{state.scriptContent.slice(0, 500)}{state.scriptContent.length > 500 ? '\n...' : ''}</pre>
            </div>
          )}
        </div>
      )}

      {/* ═══ BEHAVIOR ═══ */}
      <div className="config-section">
        <h3 className="section-title">Behavior</h3>
        <div className="form-grid">
          <FormField label="Close Apps Before Install" id="closeApps" hint="Comma-separated process names">
            <input id="closeApps" type="text" placeholder="chrome,msedge" value={state.closeApps} onChange={e => updateField('closeApps', e.target.value)} />
          </FormField>
          <SelectField label="Restart Behavior" id="restartBehavior" value={state.restartBehavior} onChange={v => updateField('restartBehavior', v)}
            options={[
              { value: 'suppress', label: 'Suppress' },
              { value: 'allow', label: 'Allow' },
              { value: 'basedOnReturnCode', label: 'Based on Return Code' },
              { value: 'force', label: 'Force' },
            ]}
          />
          <FormField label="Max Install Time (minutes)" id="maxInstallTime">
            <input id="maxInstallTime" type="number" min="1" value={state.maxInstallTime} onChange={e => updateField('maxInstallTime', parseInt(e.target.value) || 60)} />
          </FormField>
        </div>
      </div>

      {/* ═══ INTUNE APP METADATA ═══ */}
      <div className="config-section">
        <h3 className="section-title">Intune App Metadata</h3>
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
          <FormField label="Information URL" id="informationUrl" hint="Link to app docs or vendor site">
            <input id="informationUrl" type="url" placeholder="https://" value={state.informationUrl} onChange={e => updateField('informationUrl', e.target.value)} />
          </FormField>
          <FormField label="Privacy URL" id="privacyUrl">
            <input id="privacyUrl" type="url" placeholder="https://" value={state.privacyUrl} onChange={e => updateField('privacyUrl', e.target.value)} />
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
          <SelectField label="Architecture" id="applicableArch" value={state.applicableArch}
            onChange={v => updateField('applicableArch', v)}
            options={windowsOptions.architectures}
          />
          <FormField label="Min Free Disk Space (MB)" id="minDiskSpaceMB">
            <input id="minDiskSpaceMB" type="number" min="0" value={state.minDiskSpaceMB} onChange={e => updateField('minDiskSpaceMB', parseInt(e.target.value) || 500)} />
          </FormField>
          <FormField label="Min Memory (MB)" id="minMemoryMB">
            <input id="minMemoryMB" type="number" min="0" value={state.minMemoryMB} onChange={e => updateField('minMemoryMB', parseInt(e.target.value) || 2048)} />
          </FormField>
        </div>
      </div>

      {/* ═══ ASSIGNMENTS ═══ */}
      <AssignmentsSection
        assignments={state.assignments}
        onChange={v => updateField('assignments', v)}
      />

      {/* ═══ SUPERSEDENCE ═══ */}
      <div className="config-section">
        <h3 className="section-title">Supersedence <span className="section-optional">Optional</span></h3>
        <div className="form-grid">
          <FormField label="Superseded App ID" id="supersedesAppId" hint="Intune app GUID of the app being replaced">
            <input id="supersedesAppId" type="text" placeholder="Leave empty if not superseding" value={state.supersedesAppId} onChange={e => updateField('supersedesAppId', e.target.value)} />
          </FormField>
          <SelectField label="Supersedence Type" id="supersedenceType" value={state.supersedenceType}
            onChange={v => updateField('supersedenceType', v)}
            options={[
              { value: 'update', label: 'Update (replace + uninstall old)' },
              { value: 'replace', label: 'Replace (side-by-side)' },
            ]}
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* GROUP B: PSADT LIFECYCLE PHASES                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="section-divider">
        <span className="section-divider__line" />
        <span className="section-divider__label">PSADT Lifecycle Phases</span>
        <span className="section-divider__line" />
      </div>

      {/* Deploy Mode */}
      <div className="config-section">
        <h3 className="section-title">PSADT Deploy Mode</h3>
        <div className="form-grid">
          <SelectField label="Deploy Mode" id="deployMode" value={state.deployMode}
            hint="Controls how the PSADT wrapper executes. Silent = no UI, NonInteractive = progress bar only."
            onChange={v => updateField('deployMode', v)}
            options={windowsOptions.deployModes}
          />
          <SelectField label="Install Context" id="installContext" value={state.installContext}
            onChange={v => updateField('installContext', v)}
            options={windowsOptions.installContexts}
          />
        </div>
        <ToggleSwitch label="Allow reboot passthrough from installer" checked={state.allowRebootPassThru} onChange={v => updateField('allowRebootPassThru', v)} id="allowRebootPassThru" />
        <div style={{ marginTop: 'var(--space-md)' }}>
          <SelectField label="Repair Mode" id="lc-repairMode" value={lc.repairMode} onChange={v => updateLifecycleRoot('repairMode', v)}
            options={[
              { value: 'mirror', label: 'Mirror Install (default)' },
              { value: 'custom', label: 'Custom Repair Actions' },
            ]}
          />
        </div>
      </div>

      {/* ═══ PHASE PANELS ═══ */}
      <div className="config-section">
        <h3 className="section-title">Lifecycle Phases <span className="section-optional">{state.wizardMode === 'refactor' ? 'Imported' : '10 phases'}</span></h3>
        <div className="lifecycle-panels">
          {PHASE_KEYS.map(phaseKey => {
            const meta = PHASE_META[phaseKey];
            const phaseData = lc.phases?.[phaseKey] || { actions: [] };
            const actions = phaseData.actions || [];
            const isExpanded = expandedPhases[phaseKey] || (state.wizardMode === 'refactor' && actions.length > 0);
            const togglePhase = () => setExpandedPhases(prev => ({ ...prev, [phaseKey]: !isExpanded }));

            return (
              <div key={phaseKey} className={`lifecycle-phase ${isExpanded ? 'lifecycle-phase--open' : ''}`}>
                <button type="button" className="phase-header" onClick={togglePhase}>
                  <span className="phase-header__icon">{meta.icon}</span>
                  <span className="phase-header__label">{meta.label}</span>
                  {actions.length > 0 && (
                    <span className="phase-header__badge">{actions.length} action{actions.length !== 1 ? 's' : ''}</span>
                  )}
                  <span className="phase-header__chevron">{isExpanded ? '▾' : '▸'}</span>
                </button>
                {isExpanded && (
                  <div className="phase-body">
                    {actions.length === 0 && (
                      <p className="phase-empty">No actions configured. Add one below.</p>
                    )}
                    {actions.map((action, i) => (
                      <ActionCard key={i} action={action} index={i} total={actions.length} phaseKey={phaseKey}
                        onUpdate={updateAction} onRemove={removeAction} onMove={moveAction} />
                    ))}
                    <AddActionPicker phaseKey={phaseKey} onAdd={addAction} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .config-section { margin-bottom: var(--space-xl); padding-bottom: var(--space-lg); border-bottom: 1px solid var(--border-subtle); }
        .config-section:last-child { border-bottom: none; }
        .section-title { font-size: 0.9rem; font-weight: 600; color: var(--text-secondary); margin-bottom: var(--space-md); display: flex; align-items: center; gap: var(--space-sm); }
        .section-optional { font-size: 0.7rem; font-weight: 400; color: var(--text-muted); background: var(--bg-hover); padding: 2px 8px; border-radius: var(--radius-sm); }
        .msi-upload-area, .script-upload-area, .logo-upload-area { display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-md); }
        .msi-upload-btn { cursor: pointer; }
        .msi-status { font-size: 0.8rem; color: var(--text-secondary); }
        .msi-status--ok { color: var(--color-success); }
        .msi-status--err { color: var(--color-error); }
        .link-btn { background: none; border: none; color: var(--color-accent, #7c8aff); cursor: pointer; text-decoration: underline; font-size: inherit; padding: 0; font-family: inherit; }
        .link-btn:hover { color: var(--text-primary); }
        .msi-manual-banner { display: flex; align-items: center; gap: var(--space-md); padding: var(--space-sm) var(--space-md); margin-bottom: var(--space-md); background: var(--bg-hover); border-radius: var(--radius-sm); font-size: 0.8rem; color: var(--text-secondary); }
        .logo-preview { display: flex; align-items: center; gap: var(--space-md); }
        .script-preview { margin-top: var(--space-sm); padding: var(--space-md); background: rgba(8,10,20,0.9); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); max-height: 200px; overflow-y: auto; }
        .script-preview pre { font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-secondary); white-space: pre-wrap; margin: 0; }

        /* ── Section Divider ── */
        .section-divider { display: flex; align-items: center; gap: var(--space-md); margin: var(--space-xl) 0; padding: 0 var(--space-xl); }
        .section-divider__line { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, var(--border-subtle), transparent); }
        .section-divider__label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-accent, #7c8aff); white-space: nowrap; }

        /* ── Phase Panels ── */
        .lifecycle-panels { display: flex; flex-direction: column; gap: 6px; }
        .lifecycle-phase { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden; transition: border-color 0.2s; }
        .lifecycle-phase--open { border-color: rgba(99,140,255,0.3); }
        .phase-header { display: flex; align-items: center; gap: var(--space-sm); width: 100%; padding: 10px var(--space-md); background: var(--bg-card, rgba(255,255,255,0.02)); border: none; cursor: pointer; font-family: inherit; color: inherit; }
        .phase-header:hover { background: var(--bg-hover, rgba(255,255,255,0.04)); }
        .phase-header__icon { font-size: 1rem; flex-shrink: 0; }
        .phase-header__label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); flex: 1; text-align: left; }
        .phase-header__badge { font-size: 0.65rem; font-weight: 700; background: rgba(99,140,255,0.15); color: var(--text-accent, #7c8aff); padding: 2px 8px; border-radius: 10px; }
        .phase-header__chevron { font-size: 0.7rem; color: var(--text-muted); width: 14px; }
        .phase-body { padding: var(--space-sm) var(--space-md) var(--space-md); border-top: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 8px; }
        .phase-empty { font-size: 0.78rem; color: var(--text-muted); font-style: italic; margin: 0; padding: 4px 0; }

        /* ── Action Cards ── */
        .action-card { border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); overflow: hidden; transition: opacity 0.2s; }
        .action-card--disabled { opacity: 0.5; }
        .action-card__header { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(255,255,255,0.02); }
        .action-card__icon { font-size: 0.9rem; }
        .action-card__label { font-size: 0.78rem; font-weight: 600; color: var(--text-primary); flex: 1; }
        .action-card__controls { display: flex; gap: 2px; }
        .action-btn { background: none; border: 1px solid transparent; border-radius: 3px; cursor: pointer; color: var(--text-muted); font-size: 0.65rem; padding: 2px 5px; font-family: inherit; line-height: 1; }
        .action-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
        .action-btn:disabled { opacity: 0.3; cursor: default; }
        .action-btn--toggle { color: var(--color-success, #22c55e); font-weight: bold; }
        .action-btn--del { color: var(--color-error, #ef4444); }
        .action-card__fields { padding: 6px 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .action-field { display: flex; flex-direction: column; gap: 2px; }
        .action-field__label { font-size: 0.68rem; font-weight: 600; color: var(--text-muted); }
        .action-field input[type="text"], .action-field input[type="number"], .action-field textarea { font-size: 0.75rem; padding: 4px 6px; background: var(--bg-surface, rgba(0,0,0,0.3)); border: 1px solid var(--border-subtle); border-radius: 3px; color: var(--text-primary); font-family: var(--font-mono, monospace); }
        .action-field textarea { grid-column: 1 / -1; font-size: 0.7rem; }
        .action-card__raw { padding: 4px 10px 6px; }
        .action-card__raw code { font-size: 0.65rem; color: var(--text-muted); font-family: var(--font-mono, monospace); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* ── Add Action Picker ── */
        .add-action { position: relative; }
        .add-action__btn { background: none; border: 1px dashed var(--border-subtle); border-radius: var(--radius-sm); padding: 6px 12px; font-size: 0.78rem; color: var(--text-muted); cursor: pointer; width: 100%; font-family: inherit; transition: all 0.15s; }
        .add-action__btn:hover { border-color: var(--text-accent, #7c8aff); color: var(--text-accent, #7c8aff); background: rgba(99,140,255,0.05); }
        .add-action__dropdown { position: absolute; bottom: 100%; left: 0; right: 0; max-height: 300px; overflow-y: auto; background: var(--bg-surface, #0d0f1a); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); box-shadow: 0 8px 32px rgba(0,0,0,0.5); z-index: 10; padding: 6px 0; }
        .add-action__group { padding: 4px 0; }
        .add-action__cat { display: block; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); padding: 2px 12px 4px; }
        .add-action__item { display: flex; align-items: center; gap: 6px; width: 100%; padding: 5px 12px; background: none; border: none; font-size: 0.78rem; color: var(--text-secondary); cursor: pointer; font-family: inherit; text-align: left; }
        .add-action__item:hover { background: var(--bg-hover, rgba(255,255,255,0.06)); color: var(--text-primary); }
      `}</style>
    </div>
  );
}

