import { useState, useRef } from 'react';
import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';
import { parseMsiFile } from '../../lib/parseMsi';
import './windows-steps.css';

export default function InstallerDetectionStep({ state, updateField }) {
  const [msiParsing, setMsiParsing] = useState(false);
  const [msiParseResult, setMsiParseResult] = useState(null);
  const [msiManualEntry, setMsiManualEntry] = useState(false);
  const scriptFileRef = useRef(null);

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
        <h2>📦 Installer & Detection</h2>
        <p>Configure the installer type, source metadata, detection rules, and install behavior.</p>
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
    </div>
  );
}
