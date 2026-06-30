import { useState, useEffect, useRef } from 'react';
import FormField from '../ui/FormField';
import './windows-steps.css';

// ── Path parser ───────────────────────────────────────────────────────────────
/**
 * Split a full Windows or POSIX path into { dir, file, type }.
 *   'C:\files\7z\7z2600-x64.msi' → { dir:'C:\files\7z', file:'7z2600-x64.msi', type:'msi' }
 *   '/opt/files/setup.exe'       → { dir:'/opt/files',    file:'setup.exe',       type:'exe' }
 */
function parseInstallerPath(fullPath) {
  const raw = fullPath.trim();
  if (!raw) return { dir: '', file: '', type: '' };
  // Find last separator (backslash or forward slash)
  const lastBack  = raw.lastIndexOf('\\');
  const lastSlash = raw.lastIndexOf('/');
  const lastSep   = Math.max(lastBack, lastSlash);
  const dir  = lastSep >= 0 ? raw.slice(0, lastSep) : '';
  const file = lastSep >= 0 ? raw.slice(lastSep + 1) : raw;
  const ext  = file.includes('.') ? file.split('.').pop().toLowerCase() : '';
  const type = ext === 'msi' ? 'msi' : ext ? 'exe' : '';
  return { dir, file, type };
}

/** Build the display path from wizard state (used to initialise local input) */
function buildPathFromState(state) {
  if (state.installerSourceDir && state.installerSourceFile)
    return `${state.installerSourceDir}\\${state.installerSourceFile}`;
  return state.installerSourceFile || '';
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function InstallerStep({ state, updateField, updateFields }) {
  // ── Installer path local state (drives all 3 derived wizard fields) ──────
  const [pathInput, setPathInput] = useState(() => buildPathFromState(state));
  // Suppress the next useEffect sync when WE just updated the wizard state
  const suppressSync = useRef(false);

  const [msiParsing, setMsiParsing] = useState(false);
  const [msiParseResult, setMsiParseResult] = useState(null);

  // ── WinGet bootstrapper state ────────────────────────────────────────────
  const [wingetInput, setWingetInput]   = useState('');
  const [wingetLoading, setWingetLoading] = useState(false);
  const [wingetResult, setWingetResult]  = useState(null);
  const [downloading, setDownloading]    = useState(false);
  const [downloadStatus, setDownloadStatus] = useState(null);

  // Sync pathInput when wizard state changes externally (e.g., WinGet "Apply")
  useEffect(() => {
    if (suppressSync.current) { suppressSync.current = false; return; }
    const fromState = buildPathFromState(state);
    if (fromState && fromState !== pathInput) setPathInput(fromState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.installerSourceFile, state.installerSourceDir]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handlePathChange = (raw) => {
    setPathInput(raw);
    setMsiParseResult(null);
    suppressSync.current = true;

    const { dir, file, type } = parseInstallerPath(raw);
    const updates = {
      installerSourceDir:   dir,
      installerSourceFile:  file,
      // Support files always mirrors the installer directory — no separate field
      supportFilesSource:   dir,
    };
    if (type) updates.installerType = type;
    if (updateFields) updateFields(updates);
    else Object.entries(updates).forEach(([k, v]) => updateField(k, v));
  };

  // Separate local path for MSI extraction — the runner path may not be accessible
  // from the dev machine, so the user can point to a local copy just for extraction.
  const [msiExtractPath, setMsiExtractPath] = useState('');

  /** Extract MSI metadata. Uses msiExtractPath if provided, otherwise falls back to pathInput. */
  const handleAutoExtract = async (forcePath) => {
    const target = (forcePath || msiExtractPath.trim() || pathInput.trim());
    if (state.installerType !== 'msi' || !target) return;
    setMsiParsing(true);
    setMsiParseResult(null);
    try {
      const res = await fetch('/api/msi-info-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: target }),
      });
      let meta = {};
      const ct = res.headers.get('content-type');
      if (ct && ct.includes('application/json')) meta = await res.json();
      else throw new Error((await res.text()).slice(0, 120) || `Server error ${res.status}`);
      if (!res.ok) throw new Error(meta.error || `Server error ${res.status}`);
      setMsiParseResult(meta);
      if (meta.productCode)    updateField('msiProductCode',    meta.productCode);
      if (meta.productVersion) updateField('msiProductVersion', meta.productVersion);
      if (meta.productName)    updateField('msiProductName',    meta.productName);
      if (meta.manufacturer)   updateField('msiManufacturer',   meta.manufacturer);
      if (meta.upgradeCode)    updateField('msiUpgradeCode',    meta.upgradeCode);
      if (meta.fileName)       updateField('msiFileName',       meta.fileName);
    } catch (err) {
      setMsiParseResult({ error: err.message });
    } finally {
      setMsiParsing(false);
    }
  };

  // ── WinGet: fetch package info ────────────────────────────────────────────
  const handleWingetFetch = async (targetVersion = null) => {
    const version = typeof targetVersion === 'string' ? targetVersion : null;
    const pkg = wingetInput.trim();
    if (!pkg) return;
    setWingetLoading(true);
    setDownloadStatus(null);
    if (!version) setWingetResult(null);
    else setWingetResult(prev => prev ? { ...prev, error: null } : null);
    try {
      const res = await fetch('/api/winget-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg, version }),
      });
      let data = {};
      const ct = res.headers.get('content-type');
      if (ct && ct.includes('application/json')) data = await res.json();
      else throw new Error((await res.text()).slice(0, 100) || `Server error ${res.status}`);
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      setWingetResult(data);
    } catch (err) {
      setWingetResult(prev => ({
        ...(prev?.versions ? { versions: prev.versions, packageIdentifier: pkg } : {}),
        error: err.message,
      }));
    } finally {
      setWingetLoading(false);
    }
  };

  // ── WinGet: apply fetched metadata to wizard state ────────────────────────
  const applyWingetMeta = () => {
    if (!wingetResult || wingetResult.error) return;
    const type = wingetResult.installerType === 'msi' ? 'msi' : 'exe';
    const urlParts = wingetResult.installerUrl.split('/');
    let filename = urlParts[urlParts.length - 1].split('?')[0];
    if (!filename || !filename.includes('.'))
      filename = `${wingetResult.packageIdentifier.toLowerCase()}-${wingetResult.packageVersion}.${type}`;

    const updates = {
      installerType:       type,
      installerSourceFile: filename,
      version:             wingetResult.packageVersion || '1.0.0',
    };
    if (type === 'msi') {
      updates.msiFileName       = filename;
      updates.msiProductVersion = wingetResult.packageVersion;
      updates.msiProductName    = wingetResult.packageName || wingetResult.packageIdentifier;
      updates.msiManufacturer   = wingetResult.publisher || 'WinGet';
      if (wingetResult.productCode) updates.msiProductCode = wingetResult.productCode;
    } else {
      updates.exeSourceFilename = filename;
      if (wingetResult.silentArgs) updates.exeInstallArgs = wingetResult.silentArgs;
    }
    if (updateFields) updateFields(updates);
    else Object.entries(updates).forEach(([k, v]) => updateField(k, v));
    // pathInput will sync via useEffect
  };

  // ── WinGet: download installer into staging folder ────────────────────────
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
        body: JSON.stringify({ url: wingetResult.installerUrl, filename, targetDir: state.installerSourceDir }),
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

  // ── Derived display values ────────────────────────────────────────────────
  const isMsi = state.installerType === 'msi';
  const isExe = state.installerType === 'exe';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="step-content animate-in">
      <div className="step-header">
        <h2>📦 Installer &amp; Behavior</h2>
        <p>Provide the path to your installer file — directory, filename, and type are derived automatically.</p>
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
                <label className="winget-version-label" htmlFor="winget-version-dropdown">Select Version:</label>
                <div className="winget-version-select-container">
                  <select
                    id="winget-version-dropdown"
                    className="winget-version-dropdown"
                    value={wingetResult.packageVersion || ''}
                    onChange={e => handleWingetFetch(e.target.value)}
                    disabled={wingetLoading}
                  >
                    {wingetResult.versions.map(v => <option key={v} value={v}>{v}</option>)}
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
                  {wingetResult.productCode && (
                    <div className="col-span-2"><strong>Product Code (GUID):</strong> <code>{wingetResult.productCode}</code></div>
                  )}
                  <div className="col-span-2 url-field">
                    <strong>Download URL:</strong>{' '}
                    <a href={wingetResult.installerUrl} target="_blank" rel="noreferrer" className="winget-link">
                      {wingetResult.installerUrl}
                    </a>
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
                    <span className="download-hint">⚠️ Set the installer source path to enable direct downloads.</span>
                  )}
                </div>
                {downloadStatus && (
                  <div className={`download-status-msg ${downloadStatus.error ? 'err' : 'ok'}`}>
                    {downloadStatus.error
                      ? `❌ ${downloadStatus.error}`
                      : `✅ Successfully downloaded to ${downloadStatus.path}!`}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ INSTALL SOURCE ═══ */}
      <div className="config-section">
        <h3 className="section-title">Install Source</h3>

        <FormField
          label="Full path to installer file"
          id="installerFullPath"
          required
          hint="Path on the GitLab runner. Directory, filename, and installer type are derived automatically from this path."
        >
          <div className="installer-path-row">
            <input
              id="installerFullPath"
              type="text"
              className="installer-path-input"
              value={pathInput}
              onChange={e => handlePathChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAutoExtract()}
              onBlur={() => handleAutoExtract()}
              placeholder={'C:\\ApplicationSource\\7-Zip\\7z2600-x64.msi'}
            />
            {isMsi && pathInput.trim() && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleAutoExtract}
                disabled={msiParsing}
                title="Extract product metadata from the MSI file"
              >
                {msiParsing ? '⏳ Extracting…' : '🔍 Extract MSI Info'}
              </button>
            )}
          </div>
        </FormField>

        {/* Derived info badge */}
        {state.installerSourceFile && (
          <div className="installer-derived-info animate-in">
            <span className={`inst-type-chip inst-type-chip--${state.installerType || 'unknown'}`}>
              {state.installerType?.toUpperCase() || '?'}
            </span>
            {state.installerSourceDir && (
              <span className="inst-dir">{state.installerSourceDir}\</span>
            )}
            <span className="inst-file">{state.installerSourceFile}</span>
          </div>
        )}

        {/* MSI extract status */}
        {msiParseResult && !msiParseResult.error && (
          <div className="inst-extract-msg inst-extract-msg--ok animate-in">
            ✅ MSI metadata extracted —{' '}
            {Object.entries(msiParseResult).filter(([k, v]) => v && k !== 'error').length} fields populated
          </div>
        )}
        {msiParseResult?.error && (
          <div className="inst-extract-msg inst-extract-msg--err animate-in">
            ❌ {msiParseResult.error}
          </div>
        )}

        {/* Subfolder within Files/ */}
        <FormField
          label="Installer subfolder within Files/ (optional)"
          id="installerSubfolder"
          hint={`Leave blank when the installer sits directly in Files/. Enter a relative path (e.g. "Bin" or "x64\\Setup") if the installer lives in a subfolder.`}
        >
          <input
            id="installerSubfolder"
            type="text"
            value={state.installerSubfolder || ''}
            onChange={e => updateField('installerSubfolder', e.target.value)}
            placeholder={`e.g. Bin  or  x64\\Setup`}
          />
        </FormField>
        {state.installerSubfolder && state.installerSourceFile && (
          <div className="installer-derived-info animate-in" style={{ gap: 4, flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>Generated PSADT path:</span>
            <code style={{ fontSize: '0.78rem', color: 'var(--text-accent, #7c8aff)' }}>
              {`"$($adtSession.DirFiles)\\${state.installerSubfolder.replace(/^[/\\]+|[/\\]+$/g,'').replace(/\//g,'\\')}\\${state.installerSourceFile}"`}
            </code>
          </div>
        )}

        {/* Support files source is always the same as the installer directory — no separate input */}
      </div>

      {/* ═══ MSI METADATA ═══ */}
      {isMsi && (
        <div className="config-section animate-slide">
          <h3 className="section-title">MSI Metadata</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
            Auto-extracted from the installer file. If the runner path isn't accessible from this machine,
            enter a local path to the MSI below for extraction only — the runner path is unchanged.
          </p>

          {/* Local extraction path — for dev/test machines that can't reach the runner */}
          <div className="msi-local-extract animate-in">
            <div className="msi-extract-row">
              <input
                type="text"
                className="msi-path-input"
                placeholder="Local path to .msi for extraction, e.g. /Users/you/Downloads/installer.msi"
                value={msiExtractPath}
                onChange={e => setMsiExtractPath(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAutoExtract()}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleAutoExtract()}
                disabled={msiParsing || (!msiExtractPath.trim() && !pathInput.trim())}
              >
                {msiParsing ? '⏳ Extracting…' : '🔍 Extract MSI Info'}
              </button>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Leave blank to extract from the runner path above (only works when runner is accessible).
            </p>
            {msiParseResult && !msiParseResult.error && (
              <div className="inst-extract-msg inst-extract-msg--ok animate-in">
                ✅ MSI metadata extracted —{' '}
                {Object.entries(msiParseResult).filter(([k, v]) => v && k !== 'error').length} fields populated
              </div>
            )}
            {msiParseResult?.error && (
              <div className="inst-extract-msg inst-extract-msg--err animate-in">
                ❌ {msiParseResult.error}
              </div>
            )}
          </div>
          <div className="form-grid" style={{ marginTop: 'var(--space-md)' }}>
            <FormField label="Product Code (GUID)" id="msiProductCode">
              <input id="msiProductCode" type="text" placeholder="{GUID}" value={state.msiProductCode} onChange={e => updateField('msiProductCode', e.target.value)} />
            </FormField>
            <FormField label="Product Version" id="msiProductVersion">
              <input id="msiProductVersion" type="text" value={state.msiProductVersion} onChange={e => updateField('msiProductVersion', e.target.value)} />
            </FormField>
            <FormField label="Product Name" id="msiProductName">
              <input id="msiProductName" type="text" value={state.msiProductName} onChange={e => updateField('msiProductName', e.target.value)} />
            </FormField>
            <FormField label="Manufacturer" id="msiManufacturer">
              <input id="msiManufacturer" type="text" value={state.msiManufacturer} onChange={e => updateField('msiManufacturer', e.target.value)} />
            </FormField>
            <FormField label="Upgrade Code" id="msiUpgradeCode">
              <input id="msiUpgradeCode" type="text" value={state.msiUpgradeCode} onChange={e => updateField('msiUpgradeCode', e.target.value)} />
            </FormField>
            <FormField label="Source Filename" id="msiFileName">
              <input id="msiFileName" type="text" placeholder="installer.msi" value={state.msiFileName} onChange={e => updateField('msiFileName', e.target.value)} />
            </FormField>
          </div>
        </div>
      )}

      {/* ═══ EXE DETAILS ═══ */}
      {isExe && (
        <div className="config-section animate-slide">
          <h3 className="section-title">EXE Installer Details</h3>
          <div className="form-grid">
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

      <style>{`
        /* ── Installer path row ── */
        .installer-path-row {
          display: flex;
          gap: var(--space-sm);
          align-items: stretch;
        }
        .installer-path-input {
          flex: 1;
          min-width: 0;
        }

        /* ── Derived info badge ── */
        .installer-derived-info {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          padding: 6px 10px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          font-family: var(--font-mono);
          font-size: 0.76rem;
          flex-wrap: wrap;
        }
        .inst-type-chip {
          display: inline-flex;
          align-items: center;
          padding: 2px 7px;
          border-radius: 4px;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          flex-shrink: 0;
        }
        .inst-type-chip--msi {
          background: rgba(139, 92, 246, 0.18);
          color: #a78bfa;
          border: 1px solid rgba(139, 92, 246, 0.3);
        }
        .inst-type-chip--exe {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
          border: 1px solid rgba(245, 158, 11, 0.28);
        }
        .inst-type-chip--unknown {
          background: rgba(100, 116, 139, 0.15);
          color: var(--text-muted);
          border: 1px solid var(--border-subtle);
        }
        .inst-dir {
          color: var(--text-secondary);
        }
        .inst-file {
          color: var(--text-accent);
          font-weight: 600;
        }

        /* ── Local extract block ── */
        .msi-local-extract {
          margin-bottom: var(--space-md);
          padding: 12px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
        }
        .msi-extract-row {
          display: flex;
          gap: var(--space-sm);
          align-items: stretch;
        }
        .msi-path-input {
          flex: 1;
          min-width: 0;
        }
        /* ── Extract status messages ── */
        .inst-extract-msg {
          margin-top: 8px;
          padding: 6px 10px;
          border-radius: var(--radius-sm);
          font-size: 0.76rem;
        }
        .inst-extract-msg--ok {
          background: rgba(74, 222, 128, 0.08);
          color: #4ade80;
          border: 1px solid rgba(74, 222, 128, 0.2);
        }
        .inst-extract-msg--err {
          background: rgba(239, 68, 68, 0.08);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.2);
        }
      `}</style>
    </div>
  );
}
