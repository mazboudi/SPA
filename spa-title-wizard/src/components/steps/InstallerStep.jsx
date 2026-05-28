import { useState } from 'react';
import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';
import windowsOptions from '../../config/windowsOptions.json';
import './windows-steps.css';

export default function InstallerStep({ state, updateField, updateFields }) {
  const [msiParsing, setMsiParsing]     = useState(false);
  const [msiParseResult, setMsiParseResult] = useState(null);
  const [msiManualEntry, setMsiManualEntry] = useState(false);
  const [msiPathInput, setMsiPathInput]  = useState('');

  // WinGet Bootstrapper States
  const [wingetInput, setWingetInput] = useState('');
  const [wingetLoading, setWingetLoading] = useState(false);
  const [wingetResult, setWingetResult] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState(null);

  /** Fetch installer details from WinGet repository */
  const handleWingetFetch = async (targetVersion = null) => {
    const version = typeof targetVersion === 'string' ? targetVersion : null;
    const pkg = wingetInput.trim();
    if (!pkg) return;
    setWingetLoading(true);
    setDownloadStatus(null);
    
    // If fetching a specific version, keep the current wingetResult (especially the versions list)
    // so the dropdown doesn't flicker/disappear, but clear any errors.
    if (!version) {
      setWingetResult(null);
    } else {
      setWingetResult(prev => prev ? { ...prev, error: null } : null);
    }

    try {
      const res = await fetch('/api/winget-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg, version }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      setWingetResult(data);
    } catch (err) {
      // If we failed to load a specific version, preserve the versions list from previous result if possible
      setWingetResult(prev => ({
        ...(prev?.versions ? { versions: prev.versions, packageIdentifier: pkg } : {}),
        error: err.message
      }));
    } finally {
      setWingetLoading(false);
    }
  };

  /** Apply parsed WinGet fields to standard form values */
  const applyWingetMeta = () => {
    if (!wingetResult || wingetResult.error) return;
    
    // 1. Resolve installer type
    const type = wingetResult.installerType === 'msi' ? 'msi' : 'exe';

    // 2. Resolve default file name from download URL
    const urlParts = wingetResult.installerUrl.split('/');
    let filename = urlParts[urlParts.length - 1].split('?')[0];
    if (!filename || !filename.includes('.')) {
      const ext = type;
      filename = `${wingetResult.packageIdentifier.toLowerCase()}-${wingetResult.packageVersion}.${ext}`;
    }

    // 3. Assemble atomic updates list
    const updates = {
      installerType: type,
      installerSourceFile: filename,
      displayName: wingetResult.packageName || wingetResult.packageIdentifier,
      publisher: wingetResult.publisher || 'WinGet',
      version: wingetResult.packageVersion || '1.0.0'
    };

    // 4. Map installer-specific fields
    if (type === 'msi') {
      updates.msiFileName = filename;
      updates.msiProductVersion = wingetResult.packageVersion;
      updates.msiProductName = wingetResult.packageName || wingetResult.packageIdentifier;
      updates.msiManufacturer = wingetResult.publisher || 'WinGet';
      if (wingetResult.productCode) {
        updates.msiProductCode = wingetResult.productCode;
      }
    } else {
      updates.exeSourceFilename = filename;
      if (wingetResult.silentArgs) {
        updates.exeInstallArgs = wingetResult.silentArgs;
      }
    }

    if (updateFields) {
      updateFields(updates);
    } else {
      // Fallback if updateFields is not supplied
      Object.entries(updates).forEach(([k, v]) => updateField(k, v));
    }
  };

  /** Download installer file directly into staging folder */
  const handleWingetDownload = async () => {
    if (!wingetResult || !wingetResult.installerUrl || !state.installerSourceDir) return;
    
    setDownloading(true);
    setDownloadStatus(null);

    const urlParts = wingetResult.installerUrl.split('/');
    let filename = urlParts[urlParts.length - 1].split('?')[0];
    if (!filename || !filename.includes('.')) {
      const ext = wingetResult.installerType === 'msi' ? 'msi' : 'exe';
      filename = `${wingetResult.packageIdentifier.toLowerCase()}-${wingetResult.packageVersion}.${ext}`;
    }

    try {
      const res = await fetch('/api/winget-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: wingetResult.installerUrl,
          filename,
          targetDir: state.installerSourceDir
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      setDownloadStatus({ success: true, path: data.path });
    } catch (err) {
      setDownloadStatus({ error: err.message });
    } finally {
      setDownloading(false);
    }
  };

  /** Apply extracted MSI metadata to wizard state */
  const applyMsiMeta = (meta) => {
    setMsiParseResult(meta);
    if (meta.productCode)    updateField('msiProductCode',    meta.productCode);
    if (meta.productVersion) updateField('msiProductVersion', meta.productVersion);
    if (meta.productName)    updateField('msiProductName',    meta.productName);
    if (meta.manufacturer)   updateField('msiManufacturer',   meta.manufacturer);
    if (meta.upgradeCode)    updateField('msiUpgradeCode',    meta.upgradeCode);
    if (meta.fileName)       updateField('msiFileName',       meta.fileName);
  };

  /** Send the local file path to the server — no browser file picker, no CORS issues */
  const handleMsiPath = async () => {
    const p = msiPathInput.trim();
    if (!p) return;
    setMsiParsing(true);
    setMsiParseResult(null);
    try {
      const res = await fetch('/api/msi-info-path', {   // relative URL → Vite proxy → localhost:3001
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: p }),
      });
      const meta = await res.json();
      if (!res.ok) throw new Error(meta.error || `Server error ${res.status}`);
      applyMsiMeta(meta);
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

      {/* ═══ WINGET BOOTSTRAPPER ═══ */}
      <div className="config-section winget-section animate-slide">
        <h3 className="section-title">🚀 WinGet Package Bootstrapper</h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
          Enter a public WinGet Package ID (e.g. <code>Google.Chrome</code>, <code>Zoom.Zoom</code>, <code>Git.Git</code>) to automatically resolve installer files, silent arguments, version numbers, and product detection keys!
        </p>
        <div className="winget-row">
          <input
            type="text"
            className="winget-input"
            placeholder="e.g. Google.Chrome"
            value={wingetInput}
            onChange={e => setWingetInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleWingetFetch()}
          />
          <button
            type="button"
            className="btn btn-secondary winget-btn"
            onClick={() => handleWingetFetch()}
            disabled={wingetLoading || !wingetInput.trim()}
          >
            {wingetLoading ? '⏳ Fetching...' : 'Fetch Package'}
          </button>
        </div>
        
        {wingetResult && (
          <div className="winget-result-box animate-in">
            {wingetResult.error && (
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <span className="winget-status winget-status--err">❌ {wingetResult.error}</span>
              </div>
            )}
            
            {wingetResult.versions && wingetResult.versions.length > 1 && (
              <div className="winget-version-selector">
                <label className="winget-version-label" htmlFor="winget-version-dropdown">
                  Select Version:
                </label>
                <div className="winget-version-select-container">
                  <select
                    id="winget-version-dropdown"
                    className="winget-version-dropdown"
                    value={wingetResult.packageVersion || ''}
                    onChange={e => handleWingetFetch(e.target.value)}
                    disabled={wingetLoading}
                  >
                    {wingetResult.versions.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  {wingetLoading && <span className="winget-ver-spinner">⏳ Loading details...</span>}
                </div>
              </div>
            )}

            {!wingetResult.error && wingetResult.installerUrl && (
              <div className="winget-details">
                <div className="winget-details-grid" style={{ opacity: wingetLoading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                  <div><strong>Package Name:</strong> {wingetResult.packageName || 'N/A'}</div>
                  <div><strong>Publisher:</strong> {wingetResult.publisher || 'N/A'}</div>
                  <div><strong>Version:</strong> {wingetResult.packageVersion || 'N/A'}</div>
                  <div><strong>Type:</strong> {wingetResult.installerType ? wingetResult.installerType.toUpperCase() : 'N/A'}</div>
                  <div className="col-span-2"><strong>Silent Switches:</strong> <code>{wingetResult.silentArgs || 'None'}</code></div>
                  {wingetResult.productCode && <div className="col-span-2"><strong>Product Code (GUID):</strong> <code>{wingetResult.productCode}</code></div>}
                  <div className="col-span-2 url-field">
                    <strong>Download URL:</strong> <a href={wingetResult.installerUrl} target="_blank" rel="noreferrer" className="winget-link">{wingetResult.installerUrl}</a>
                  </div>
                </div>
                
                <div className="winget-actions-row">
                  <button type="button" className="btn btn-primary" onClick={applyWingetMeta}>
                    ✓ Apply to Form
                  </button>
                  {state.installerSourceDir ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleWingetDownload}
                      disabled={downloading}
                    >
                      {downloading ? '⏳ Downloading...' : '📥 Download Installer File'}
                    </button>
                  ) : (
                    <span className="download-hint">⚠️ Set "Install Source" directory to enable direct downloads.</span>
                  )}
                </div>
                {downloadStatus && (
                  <div className={`download-status-msg ${downloadStatus.error ? 'err' : 'ok'}`}>
                    {downloadStatus.error ? `❌ ${downloadStatus.error}` : `✅ Successfully downloaded to ${downloadStatus.path}!`}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ INSTALLER ═══ */}
      <div className="config-section">
        <h3 className="section-title">Installer</h3>
        <div className="form-grid">
          <SelectField label="Installer Type" id="installerType" value={state.installerType}
            onChange={v => updateField('installerType', v)}
            options={[{ value: 'msi', label: 'MSI' }, { value: 'exe', label: 'EXE' }]}
          />
          <FormField label="Install Source (Runner Directory)" id="installerSourceDir" required
            hint="Directory on the runner where installer files are staged.">
            <input id="installerSourceDir" type="text"
              value={state.installerSourceDir}
              onChange={e => {
                const dir = e.target.value;
                updateField('installerSourceDir', dir);
                // Auto-default support files to the same directory if not manually set
                if (!state.supportFilesSource || state.supportFilesSource === state.installerSourceDir) {
                  updateField('supportFilesSource', dir);
                }
              }}
              placeholder={'C:\\files\\7-zip'}
            />
          </FormField>
          <FormField label={`${state.installerType === 'msi' ? 'MSI' : 'EXE'} Filename`} id="installerSourceFile" required
            hint="Name of the installer file within the source directory.">
            <input id="installerSourceFile" type="text"
              value={state.installerSourceFile}
              onChange={e => updateField('installerSourceFile', e.target.value)}
              placeholder={state.installerType === 'msi' ? '7z2600-x64.msi' : 'Setup.exe'}
            />
          </FormField>
          <FormField label="Support Files Source" id="supportFilesSource"
            hint="Directory with additional files to include. Defaults to the install source.">
            <input id="supportFilesSource" type="text"
              value={state.supportFilesSource}
              onChange={e => updateField('supportFilesSource', e.target.value)}
              placeholder={state.installerSourceDir || 'C:\\files\\7-zip'}
            />
          </FormField>
        </div>
        {state.installerSourceDir && state.installerSourceFile && (
          <div className="installer-preview animate-in">
            <span className="installer-preview__label">Full Path</span>
            <code>{state.installerSourceDir.replace(/[\\/]+$/, '')}{'\\' + state.installerSourceFile}</code>
          </div>
        )}
      </div>

      {/* ═══ MSI METADATA ═══ */}
      {state.installerType === 'msi' && (
        <div className="config-section animate-slide">
          <h3 className="section-title">MSI Metadata</h3>
          {!msiManualEntry && (
            <div className="msi-path-area">
              <p className="msi-path-hint">
                📁 Paste the full path to the <code>.msi</code> file — the server reads it directly and extracts the product metadata.
              </p>
              <div className="msi-path-row">
                <input
                  type="text"
                  className="msi-path-input"
                  placeholder="/Users/you/Downloads/installer.msi  or  C:\files\installer.msi"
                  value={msiPathInput}
                  onChange={e => setMsiPathInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleMsiPath()}
                />
                <button type="button" className="btn btn-secondary"
                  onClick={handleMsiPath}
                  disabled={msiParsing || !msiPathInput.trim()}>
                  {msiParsing ? '⏳ Reading...' : '→ Extract'}
                </button>
              </div>
              {msiParseResult && !msiParseResult.error && (
                <span className="msi-status msi-status--ok">
                  ✅ Extracted {Object.keys(msiParseResult).filter(k => k !== 'fileName' && msiParseResult[k]).length} fields
                  {msiParseResult.fileName && <> from <code>{msiParseResult.fileName}</code></>}
                </span>
              )}
              {msiParseResult?.error && (
                <span className="msi-status msi-status--err">❌ {msiParseResult.error}</span>
              )}
              <button type="button" className="link-btn" onClick={() => setMsiManualEntry(true)}
                style={{ marginTop: '4px', fontSize: '0.75rem' }}>
                or enter manually
              </button>
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

        .installer-preview {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-sm) var(--space-md);
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          margin-top: var(--space-md);
        }
        .installer-preview__label {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          flex-shrink: 0;
        }
        .installer-preview code {
          font-family: var(--font-mono);
          font-size: 0.78rem;
          color: var(--text-accent);
        }
      `}</style>
    </div>
  );
}
