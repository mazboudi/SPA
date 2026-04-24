import { useState } from 'react';
import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';

export default function WindowsConfigStep({ state, updateField, updateLifecycle, updateLifecycleRoot }) {
  const [showLifecycle, setShowLifecycle] = useState(false);
  const lc = state.lifecycle;

  return (
    <div className="step-content animate-in">
      <div className="step-header">
        <h2>🪟 Windows Configuration</h2>
        <p>Configure the Windows installer, detection method, and deployment behavior.</p>
      </div>

      <div className="config-section">
        <h3 className="section-title">Installer</h3>
        <div className="form-grid">
          <SelectField
            label="Installer Type"
            id="installerType"
            value={state.installerType}
            onChange={v => updateField('installerType', v)}
            options={[
              { value: 'msi', label: 'MSI' },
              { value: 'exe', label: 'EXE' },
            ]}
          />
          <SelectField
            label="Detection Mode"
            id="detectionMode"
            value={state.detectionMode}
            onChange={v => updateField('detectionMode', v)}
            options={[
              { value: 'msi-product-code', label: 'MSI Product Code' },
              { value: 'registry-marker', label: 'Registry Marker' },
              { value: 'file', label: 'File Detection' },
              { value: 'script', label: 'Script Detection' },
            ]}
            hint="How Intune detects if the app is installed."
          />
        </div>
      </div>

      {/* MSI metadata */}
      {state.installerType === 'msi' && (
        <div className="config-section animate-slide">
          <h3 className="section-title">MSI Metadata <span className="section-optional">Optional</span></h3>
          <div className="form-grid">
            <FormField label="Product Code (GUID)" id="msiProductCode" hint="e.g. {AC76BA86-7AD7-1033-7B44-AC0F074E4100}">
              <input id="msiProductCode" type="text" placeholder="{GUID}" value={state.msiProductCode} onChange={e => updateField('msiProductCode', e.target.value)} />
            </FormField>
            <FormField label="Source Filename" id="msiFileName">
              <input id="msiFileName" type="text" placeholder="e.g. installer.msi" value={state.msiFileName} onChange={e => updateField('msiFileName', e.target.value)} />
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

      {/* EXE options */}
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

      {/* Detection sub-options */}
      {state.detectionMode === 'registry-marker' && (
        <div className="config-section animate-slide">
          <h3 className="section-title">Registry Detection Options</h3>
          <ToggleSwitch label="Check 32-bit registry on 64-bit systems" checked={state.regCheck32Bit} onChange={v => updateField('regCheck32Bit', v)} id="regCheck32Bit" />
        </div>
      )}

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

      {state.detectionMode === 'script' && (
        <div className="config-section animate-slide">
          <h3 className="section-title">Script Detection Options</h3>
          <ToggleSwitch label="Run as 32-bit process" checked={state.scriptRunAs32Bit} onChange={v => updateField('scriptRunAs32Bit', v)} id="scriptRunAs32Bit" />
          <ToggleSwitch label="Enforce script signature check" checked={state.scriptEnforceSignature} onChange={v => updateField('scriptEnforceSignature', v)} id="scriptEnforceSignature" />
        </div>
      )}

      {/* Behavior */}
      <div className="config-section">
        <h3 className="section-title">Behavior</h3>
        <div className="form-grid">
          <FormField label="Close Apps Before Install" id="closeApps" hint="Comma-separated process names, e.g. 'chrome,msedge'">
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

      {/* ═══ PSADT Lifecycle ═══ */}
      <div className="config-section">
        <button
          type="button"
          className="lifecycle-toggle"
          onClick={() => setShowLifecycle(!showLifecycle)}
        >
          <span className="lifecycle-toggle__icon">{showLifecycle ? '▾' : '▸'}</span>
          <h3 className="section-title" style={{ marginBottom: 0 }}>
            PSADT Lifecycle Phases
            <span className="section-optional">Advanced</span>
          </h3>
        </button>
        {!showLifecycle && (
          <p className="lifecycle-hint">
            Configure how PSADT handles install, uninstall, and repair.
            Defaults are auto-generated from your installer settings. Click to customize.
          </p>
        )}

        {showLifecycle && (
          <div className="lifecycle-panels animate-slide">
            {/* Pre-Install */}
            <div className="lifecycle-phase">
              <h4 className="phase-title">📥 Pre-Install</h4>
              <ToggleSwitch label="Close apps before install" checked={!!lc.preInstall.closeApps || !!state.closeApps} onChange={v => updateLifecycle('preInstall', 'closeApps', v ? (state.closeApps || 'TODO') : '')} id="lc-pre-closeApps" />
              <ToggleSwitch label="Check disk space" checked={lc.preInstall.checkDiskSpace} onChange={v => updateLifecycle('preInstall', 'checkDiskSpace', v)} id="lc-pre-diskSpace" />
              <ToggleSwitch label="Show progress message" checked={lc.preInstall.showProgress} onChange={v => updateLifecycle('preInstall', 'showProgress', v)} id="lc-pre-progress" />
              <FormField label="User deferrals allowed" id="lc-pre-defer" hint="0 = no deferrals">
                <input id="lc-pre-defer" type="number" min="0" value={lc.preInstall.allowDefer} onChange={e => updateLifecycle('preInstall', 'allowDefer', parseInt(e.target.value) || 0)} />
              </FormField>
            </div>

            {/* Install */}
            <div className="lifecycle-phase">
              <h4 className="phase-title">⚙️ Install</h4>
              <SelectField label="Install Method" id="lc-install-type" value={lc.install.type} onChange={v => updateLifecycle('install', 'type', v)}
                options={[
                  { value: 'auto', label: `Auto (${state.installerType === 'msi' ? 'MSI' : 'EXE'} from installer type)` },
                  { value: 'msi', label: 'MSI install (Start-ADTMsiProcess)' },
                  { value: 'exe', label: 'EXE install (Start-ADTProcess)' },
                  { value: 'copy', label: 'File/folder copy' },
                ]}
              />
              {(lc.install.type === 'msi' || (lc.install.type === 'auto' && state.installerType === 'msi')) && (
                <div className="form-grid">
                  <FormField label="MSI Filename" id="lc-install-msiFile">
                    <input id="lc-install-msiFile" type="text" placeholder={state.msiFileName || 'TODO_INSTALLER.msi'} value={lc.install.msiFile} onChange={e => updateLifecycle('install', 'msiFile', e.target.value)} />
                  </FormField>
                  <FormField label="MSI Arguments" id="lc-install-msiArgs">
                    <input id="lc-install-msiArgs" type="text" value={lc.install.msiArgs} onChange={e => updateLifecycle('install', 'msiArgs', e.target.value)} />
                  </FormField>
                </div>
              )}
              {(lc.install.type === 'exe' || (lc.install.type === 'auto' && state.installerType === 'exe')) && (
                <div className="form-grid">
                  <FormField label="EXE Filename" id="lc-install-exeFile">
                    <input id="lc-install-exeFile" type="text" placeholder={state.exeSourceFilename || 'TODO_INSTALLER.exe'} value={lc.install.exeFile} onChange={e => updateLifecycle('install', 'exeFile', e.target.value)} />
                  </FormField>
                  <FormField label="EXE Arguments" id="lc-install-exeArgs">
                    <input id="lc-install-exeArgs" type="text" value={lc.install.exeArgs} onChange={e => updateLifecycle('install', 'exeArgs', e.target.value)} />
                  </FormField>
                </div>
              )}
            </div>

            {/* Post-Install */}
            <div className="lifecycle-phase">
              <h4 className="phase-title">✅ Post-Install</h4>
              <ToggleSwitch label="Write Fiserv registry marker" checked={lc.postInstall.registryMarker || state.detectionMode === 'registry-marker'} onChange={v => updateLifecycle('postInstall', 'registryMarker', v)} id="lc-post-regMarker" />
              <ToggleSwitch label="Show completion message" checked={lc.postInstall.showCompletion} onChange={v => updateLifecycle('postInstall', 'showCompletion', v)} id="lc-post-completion" />
              <div className="form-grid">
                <FormField label="Set Environment Variable" id="lc-post-envVar" hint="Leave blank to skip">
                  <input id="lc-post-envVar" type="text" placeholder="e.g. Path" value={lc.postInstall.envVar} onChange={e => updateLifecycle('postInstall', 'envVar', e.target.value)} />
                </FormField>
                <FormField label="Env Value" id="lc-post-envValue">
                  <input id="lc-post-envValue" type="text" value={lc.postInstall.envValue} onChange={e => updateLifecycle('postInstall', 'envValue', e.target.value)} />
                </FormField>
              </div>
            </div>

            {/* Pre-Uninstall */}
            <div className="lifecycle-phase">
              <h4 className="phase-title">📤 Pre-Uninstall</h4>
              <ToggleSwitch label="Close apps before uninstall" checked={!!lc.preUninstall.closeApps || !!state.closeApps} onChange={v => updateLifecycle('preUninstall', 'closeApps', v ? (state.closeApps || 'TODO') : '')} id="lc-preUn-closeApps" />
              <ToggleSwitch label="Show progress message" checked={lc.preUninstall.showProgress} onChange={v => updateLifecycle('preUninstall', 'showProgress', v)} id="lc-preUn-progress" />
            </div>

            {/* Uninstall */}
            <div className="lifecycle-phase">
              <h4 className="phase-title">🗑️ Uninstall</h4>
              <SelectField label="Uninstall Method" id="lc-uninstall-type" value={lc.uninstall.type} onChange={v => updateLifecycle('uninstall', 'type', v)}
                options={[
                  { value: 'auto', label: `Auto (${state.installerType === 'msi' ? 'MSI' : 'EXE'} from installer type)` },
                  { value: 'msi', label: 'MSI uninstall (Uninstall-ADTApplication)' },
                  { value: 'exe', label: 'EXE uninstall (Start-ADTProcess)' },
                  { value: 'folder', label: 'File/folder removal' },
                ]}
              />
              {(lc.uninstall.type === 'msi' || (lc.uninstall.type === 'auto' && state.installerType === 'msi')) && (
                <FormField label="Application Name" id="lc-uninstall-appName" hint="Used by Uninstall-ADTApplication matching">
                  <input id="lc-uninstall-appName" type="text" placeholder={state.displayName} value={lc.uninstall.appName} onChange={e => updateLifecycle('uninstall', 'appName', e.target.value)} />
                </FormField>
              )}
              {(lc.uninstall.type === 'exe' || (lc.uninstall.type === 'auto' && state.installerType === 'exe')) && (
                <div className="form-grid">
                  <FormField label="Uninstaller Path" id="lc-uninstall-exeFile">
                    <input id="lc-uninstall-exeFile" type="text" placeholder={state.exeUninstallPath || 'C:\\Program Files\\TODO\\uninstall.exe'} value={lc.uninstall.exeFile} onChange={e => updateLifecycle('uninstall', 'exeFile', e.target.value)} />
                  </FormField>
                  <FormField label="Uninstall Arguments" id="lc-uninstall-exeArgs">
                    <input id="lc-uninstall-exeArgs" type="text" value={lc.uninstall.exeArgs} onChange={e => updateLifecycle('uninstall', 'exeArgs', e.target.value)} />
                  </FormField>
                </div>
              )}
              {lc.uninstall.type === 'folder' && (
                <FormField label="Folder Path to Remove" id="lc-uninstall-folder">
                  <input id="lc-uninstall-folder" type="text" placeholder="C:\Program Files\MyApp" value={lc.uninstall.folderPath} onChange={e => updateLifecycle('uninstall', 'folderPath', e.target.value)} />
                </FormField>
              )}
            </div>

            {/* Post-Uninstall */}
            <div className="lifecycle-phase">
              <h4 className="phase-title">🧹 Post-Uninstall</h4>
              <ToggleSwitch label="Remove Fiserv registry marker" checked={lc.postUninstall.removeRegistryMarker || state.detectionMode === 'registry-marker'} onChange={v => updateLifecycle('postUninstall', 'removeRegistryMarker', v)} id="lc-postUn-regMarker" />
              <FormField label="Remove Environment Variable" id="lc-postUn-removeEnvVar" hint="Leave blank to skip">
                <input id="lc-postUn-removeEnvVar" type="text" value={lc.postUninstall.removeEnvVar} onChange={e => updateLifecycle('postUninstall', 'removeEnvVar', e.target.value)} />
              </FormField>
            </div>

            {/* Repair Mode */}
            <div className="lifecycle-phase">
              <h4 className="phase-title">🔧 Repair</h4>
              <SelectField label="Repair Mode" id="lc-repairMode" value={lc.repairMode} onChange={v => updateLifecycleRoot('repairMode', v)}
                hint="Mirror = repair uses the same actions as install. Custom = you define repair separately."
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
          display: flex;
          align-items: center;
          gap: var(--space-sm);
        }
        .section-optional {
          font-size: 0.7rem;
          font-weight: 400;
          color: var(--text-muted);
          background: var(--bg-hover);
          padding: 2px 8px;
          border-radius: var(--radius-sm);
        }
        .lifecycle-toggle {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          font-family: var(--font-sans);
          width: 100%;
        }
        .lifecycle-toggle__icon {
          font-size: 0.8rem;
          color: var(--text-muted);
          width: 16px;
          transition: transform var(--transition-fast);
        }
        .lifecycle-hint {
          font-size: 0.8rem;
          color: var(--text-muted);
          margin-top: var(--space-sm);
          margin-left: 24px;
        }
        .lifecycle-panels {
          margin-top: var(--space-lg);
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
        }
        .lifecycle-phase {
          padding: var(--space-md);
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
        }
        .phase-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: var(--space-md);
        }
      `}</style>
    </div>
  );
}
