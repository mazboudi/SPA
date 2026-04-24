import { useState, useRef } from 'react';
import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';
import AssignmentsSection from '../ui/AssignmentsSection';
import { parseMsiFile } from '../../lib/parseMsi';

export default function WindowsConfigStep({ state, updateField, updateLifecycle, updateLifecycleRoot }) {
  const [showLifecycle, setShowLifecycle] = useState(false);
  const [msiParsing, setMsiParsing] = useState(false);
  const [msiParseResult, setMsiParseResult] = useState(null);
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
      </div>

      {/* ═══ MSI METADATA (with file upload) ═══ */}
      {state.installerType === 'msi' && (
        <div className="config-section animate-slide">
          <h3 className="section-title">MSI Metadata</h3>
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
          </div>
          <div className="form-grid">
            <FormField label="Product Code (GUID)" id="msiProductCode" hint="Auto-filled from MSI upload">
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

      {/* ═══ REQUIREMENTS ═══ */}
      <div className="config-section">
        <h3 className="section-title">Requirements</h3>
        <div className="form-grid">
          <SelectField label="Minimum Windows Release" id="minWinRelease" value={state.minWinRelease}
            onChange={v => updateField('minWinRelease', v)}
            options={[
              { value: '21H2', label: 'Windows 10 21H2' },
              { value: '22H2', label: 'Windows 10/11 22H2' },
              { value: '23H2', label: 'Windows 11 23H2' },
              { value: '24H2', label: 'Windows 11 24H2' },
            ]}
          />
          <SelectField label="Architecture" id="applicableArch" value={state.applicableArch}
            onChange={v => updateField('applicableArch', v)}
            options={[
              { value: 'x64', label: 'x64 (64-bit)' },
              { value: 'x86', label: 'x86 (32-bit)' },
              { value: 'x64,x86', label: 'Both (x64 + x86)' },
            ]}
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

      {/* ═══ PSADT LIFECYCLE ═══ */}
      <div className="config-section">
        <button type="button" className="lifecycle-toggle" onClick={() => setShowLifecycle(!showLifecycle)}>
          <span className="lifecycle-toggle__icon">{showLifecycle ? '▾' : '▸'}</span>
          <h3 className="section-title" style={{ marginBottom: 0 }}>
            PSADT Lifecycle Phases <span className="section-optional">Advanced</span>
          </h3>
        </button>
        {!showLifecycle && <p className="lifecycle-hint">Configure how PSADT handles install/uninstall. Click to customize.</p>}
        {showLifecycle && (
          <div className="lifecycle-panels animate-slide">
            <div className="lifecycle-phase">
              <h4 className="phase-title">📥 Pre-Install</h4>
              <ToggleSwitch label="Close apps before install" checked={!!lc.preInstall.closeApps || !!state.closeApps} onChange={v => updateLifecycle('preInstall', 'closeApps', v ? (state.closeApps || 'TODO') : '')} id="lc-pre-closeApps" />
              <ToggleSwitch label="Check disk space" checked={lc.preInstall.checkDiskSpace} onChange={v => updateLifecycle('preInstall', 'checkDiskSpace', v)} id="lc-pre-diskSpace" />
              <ToggleSwitch label="Show progress message" checked={lc.preInstall.showProgress} onChange={v => updateLifecycle('preInstall', 'showProgress', v)} id="lc-pre-progress" />
              <FormField label="User deferrals allowed" id="lc-pre-defer" hint="0 = no deferrals">
                <input id="lc-pre-defer" type="number" min="0" value={lc.preInstall.allowDefer} onChange={e => updateLifecycle('preInstall', 'allowDefer', parseInt(e.target.value) || 0)} />
              </FormField>
            </div>
            <div className="lifecycle-phase">
              <h4 className="phase-title">⚙️ Install</h4>
              <SelectField label="Install Method" id="lc-install-type" value={lc.install.type} onChange={v => updateLifecycle('install', 'type', v)}
                options={[
                  { value: 'auto', label: `Auto (${state.installerType.toUpperCase()})` },
                  { value: 'msi', label: 'MSI install' },
                  { value: 'exe', label: 'EXE install' },
                  { value: 'copy', label: 'File/folder copy' },
                ]}
              />
            </div>
            <div className="lifecycle-phase">
              <h4 className="phase-title">✅ Post-Install</h4>
              <ToggleSwitch label="Write Fiserv registry marker" checked={lc.postInstall.registryMarker || state.detectionMode === 'registry-marker'} onChange={v => updateLifecycle('postInstall', 'registryMarker', v)} id="lc-post-regMarker" />
              <ToggleSwitch label="Show completion message" checked={lc.postInstall.showCompletion} onChange={v => updateLifecycle('postInstall', 'showCompletion', v)} id="lc-post-completion" />
            </div>
            <div className="lifecycle-phase">
              <h4 className="phase-title">🗑️ Uninstall</h4>
              <SelectField label="Uninstall Method" id="lc-uninstall-type" value={lc.uninstall.type} onChange={v => updateLifecycle('uninstall', 'type', v)}
                options={[
                  { value: 'auto', label: `Auto (${state.installerType.toUpperCase()})` },
                  { value: 'msi', label: 'MSI uninstall' },
                  { value: 'exe', label: 'EXE uninstall' },
                  { value: 'folder', label: 'Folder removal' },
                ]}
              />
            </div>
            <div className="lifecycle-phase">
              <h4 className="phase-title">🧹 Post-Uninstall</h4>
              <ToggleSwitch label="Remove registry marker" checked={lc.postUninstall.removeRegistryMarker || state.detectionMode === 'registry-marker'} onChange={v => updateLifecycle('postUninstall', 'removeRegistryMarker', v)} id="lc-postUn-regMarker" />
            </div>
            <div className="lifecycle-phase">
              <h4 className="phase-title">🔧 Repair</h4>
              <SelectField label="Repair Mode" id="lc-repairMode" value={lc.repairMode} onChange={v => updateLifecycleRoot('repairMode', v)}
                options={[
                  { value: 'mirror', label: 'Mirror Install (default)' },
                  { value: 'custom', label: 'Custom Repair Actions' },
                ]}
              />
            </div>
          </div>
        )}
      </div>

      <style>{`
        .config-section { margin-bottom: var(--space-xl); padding-bottom: var(--space-lg); border-bottom: 1px solid var(--border-subtle); }
        .config-section:last-child { border-bottom: none; }
        .section-title { font-size: 0.9rem; font-weight: 600; color: var(--text-secondary); margin-bottom: var(--space-md); display: flex; align-items: center; gap: var(--space-sm); }
        .section-optional { font-size: 0.7rem; font-weight: 400; color: var(--text-muted); background: var(--bg-hover); padding: 2px 8px; border-radius: var(--radius-sm); }
        .msi-upload-area, .script-upload-area { display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-md); }
        .msi-upload-btn { cursor: pointer; }
        .msi-status { font-size: 0.8rem; color: var(--text-secondary); }
        .msi-status--ok { color: var(--color-success); }
        .msi-status--err { color: var(--color-error); }
        .script-preview { margin-top: var(--space-sm); padding: var(--space-md); background: rgba(8,10,20,0.9); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); max-height: 200px; overflow-y: auto; }
        .script-preview pre { font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-secondary); white-space: pre-wrap; margin: 0; }
        .lifecycle-toggle { display: flex; align-items: center; gap: var(--space-sm); background: none; border: none; cursor: pointer; padding: 0; font-family: var(--font-sans); width: 100%; }
        .lifecycle-toggle__icon { font-size: 0.8rem; color: var(--text-muted); width: 16px; }
        .lifecycle-hint { font-size: 0.8rem; color: var(--text-muted); margin-top: var(--space-sm); margin-left: 24px; }
        .lifecycle-panels { margin-top: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-md); }
        .lifecycle-phase { padding: var(--space-md); background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); }
        .phase-title { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-md); }
      `}</style>
    </div>
  );
}
