import { useState } from 'react';
import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';
import { parseMsiFile } from '../../lib/parseMsi';
import windowsOptions from '../../config/windowsOptions.json';
import './windows-steps.css';

export default function InstallerStep({ state, updateField }) {
  const [msiParsing, setMsiParsing] = useState(false);
  const [msiParseResult, setMsiParseResult] = useState(null);
  const [msiManualEntry, setMsiManualEntry] = useState(false);

  // ── MSI File Upload Handler ─────────────────────────────────────────────
  const handleMsiUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsiParsing(true);
    setMsiParseResult(null);
    try {
      const meta = await parseMsiFile(file);
      setMsiParseResult(meta);
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

  // ── Return codes helpers ───────────────────────────────────────────────
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

  return (
    <div className="step-content animate-in">
      <div className="step-header">
        <h2>📦 Installer & Behavior</h2>
        <p>Configure the installer type, source metadata, and install behavior.</p>
      </div>

      {/* ═══ INSTALLER ═══ */}
      <div className="config-section">
        <h3 className="section-title">Installer</h3>
        <div className="form-grid">
          <SelectField label="Installer Type" id="installerType" value={state.installerType}
            onChange={v => updateField('installerType', v)}
            options={[{ value: 'msi', label: 'MSI' }, { value: 'exe', label: 'EXE' }]}
          />
          <FormField label="Installer Source (Runner Path)" id="installerSource" required
            hint="Full path to the installer on the runner or network share.">
            <input id="installerSource" type="text"
              value={state.installerSource}
              onChange={e => updateField('installerSource', e.target.value)}
              placeholder="C:/files/7-zip/7z2600-x64.msi"
            />
          </FormField>
        </div>
      </div>

      {/* ═══ MSI METADATA ═══ */}
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
            <FormField label="Product Code (GUID)" id="msiProductCode" hint={msiManualEntry ? 'Run: Get-AppLockerFileInformation .\\\\installer.msi | Select -Expand Publisher' : 'Auto-filled from MSI upload'}>
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

      {/* ═══ BEHAVIOR ═══ */}
      <div className="config-section">
        <h3 className="section-title">Behavior</h3>
        <div className="form-grid">
          <FormField label="Close Apps Before Install" id="closeApps" hint="Comma-separated process names">
            <input id="closeApps" type="text" placeholder="chrome,msedge" value={state.closeApps} onChange={e => updateField('closeApps', e.target.value)} />
          </FormField>
          <SelectField label="Device Restart Behavior" id="restartBehavior" value={state.restartBehavior} onChange={v => updateField('restartBehavior', v)}
            options={windowsOptions.restartBehaviors}
          />
          <FormField label="Max Install Time (minutes)" id="maxInstallTime">
            <input id="maxInstallTime" type="number" min="1" value={state.maxInstallTime} onChange={e => updateField('maxInstallTime', parseInt(e.target.value) || 60)} />
          </FormField>
        </div>
        <ToggleSwitch label="Allow available uninstall" checked={state.allowAvailableUninstall} onChange={v => updateField('allowAvailableUninstall', v)} id="allowAvailableUninstall" />
      </div>

      {/* ═══ RETURN CODES ═══ */}
      <div className="config-section">
        <h3 className="section-title">Return Codes <span className="section-optional">{returnCodes.length} codes</span></h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
          Define how Intune handles specific exit codes from the installer.
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

      <style>{`
        .return-codes-table { width: 100%; border-collapse: collapse; }
        .return-codes-table th { text-align: left; font-size: 0.7rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; padding: 4px 8px; border-bottom: 1px solid var(--border-subtle); }
        .return-codes-table td { padding: 4px 8px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.04)); vertical-align: middle; }
        .return-code-input { width: 80px; padding: 4px 8px; font-size: 0.82rem; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); color: var(--text-primary); font-family: var(--font-mono); }
        .return-code-select { padding: 4px 8px; font-size: 0.82rem; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); color: var(--text-primary); font-family: inherit; }
      `}</style>
    </div>
  );
}
