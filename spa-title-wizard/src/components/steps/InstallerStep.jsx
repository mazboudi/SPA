import { useState, useEffect, useRef } from 'react';
import FormField from '../ui/FormField';
import './windows-steps.css';

// ─────────────────────────────────────────────────────────────────────────────
// parseInstallerFullPath
//
// Takes a full runner path like:
//   C:\AppSource\AppName\Files\setup.msi
//   C:\AppSource\AppName\Files\Bin\setup.exe
//   \\server\share\AppName\Files\setup.msi
//
// Returns:
//   dir           — full directory portion (no trailing slash)
//   file          — filename with extension
//   installerType — 'msi' | 'exe' | ''
//   subfolder     — relative path between \Files\ and filename ('' if at root)
//   pathError     — validation message if \Files\ not present, null if valid
// ─────────────────────────────────────────────────────────────────────────────
function parseInstallerFullPath(raw) {
  const input = (raw || '').trim();
  if (!input) return { dir: '', file: '', installerType: '', subfolder: '', pathError: null };

  // Normalise slashes
  const norm = input.replace(/\//g, '\\');

  // Split filename (last segment)
  const lastSep = norm.lastIndexOf('\\');
  const dir  = lastSep >= 0 ? norm.slice(0, lastSep) : '';
  const file = lastSep >= 0 ? norm.slice(lastSep + 1) : norm;

  // Installer type — only from fully-recognized extensions to avoid mid-edit flipping
  const ext = file.includes('.') ? file.split('.').pop().toLowerCase() : '';
  const knownMsi = ['msi'];
  const knownExe = ['exe', 'msp', 'cmd', 'bat', 'ps1'];
  const installerType = knownMsi.includes(ext) ? 'msi'
    : knownExe.includes(ext) ? 'exe'
    : '';   // '' = partial/unknown extension → don't change current type

  // Find \Files\ in the directory portion (case-insensitive, last occurrence)
  const dirLower = dir.toLowerCase();
  const filesToken = '\\files\\';
  const filesIdx = dirLower.lastIndexOf(filesToken);

  // Also accept path that ends with \Files (file sits directly in Files\)
  const endsWithFiles = dirLower.endsWith('\\files') || dirLower.toLowerCase() === 'files';

  let subfolder = '';
  let pathError = null;

  if (filesIdx >= 0) {
    // Everything between \Files\ and the filename is the subfolder
    subfolder = dir.slice(filesIdx + filesToken.length).replace(/^\\+|\\+$/g, '');
  } else if (endsWithFiles) {
    subfolder = '';
  } else {
    pathError = 'Path must include \\Files\\ — e.g. C:\\AppSource\\AppName\\Files\\setup.msi';
  }

  return { dir, file, installerType, subfolder, pathError };
}

// Reconstruct a display path from wizard state (used to initialise the text input)
function buildFullPathFromState(state) {
  const dir  = (state.installerSourceDir || '').replace(/\\+$/, '');
  const file = state.installerSourceFile || '';
  if (!dir && !file) return '';
  if (!dir) return file;
  if (!file) return dir;
  return `${dir}\\${file}`;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function InstallerStep({ state, updateField, updateFields }) {

  // ── MSI extract state ───────────────────────────────────────────────────
  const [msiParsing,     setMsiParsing]     = useState(false);
  const [msiParseResult, setMsiParseResult] = useState(null);
  const [msiExtractPath, setMsiExtractPath] = useState('');

  // ── Single full-path input (drives all derived wizard fields) ───────────
  const [pathInput, setPathInput] = useState(() => buildFullPathFromState(state));
  const suppressSync = useRef(false);

  // Re-sync when wizard state is loaded externally (Queue / Edit)
  useEffect(() => {
    if (suppressSync.current) { suppressSync.current = false; return; }
    const fromState = buildFullPathFromState(state);
    if (fromState && fromState !== pathInput) setPathInput(fromState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.installerSourceFile, state.installerSourceDir]);

  // ── WinGet state ────────────────────────────────────────────────────────
  const [wingetInput,     setWingetInput]     = useState('');
  const [wingetLoading,   setWingetLoading]   = useState(false);
  const [wingetResult,    setWingetResult]    = useState(null);
  const [downloading,     setDownloading]     = useState(false);
  const [downloadStatus,  setDownloadStatus]  = useState(null);

  // ── Derived ─────────────────────────────────────────────────────────────
  const isMsi = state.installerType === 'msi';
  const isExe = state.installerType === 'exe';

  const parsed = parseInstallerFullPath(pathInput);

  // Primary installer filename for PSADT path
  const primaryFile = isMsi
    ? (state.msiFileName || state.installerSourceFile || '')
    : (state.exeSourceFilename || state.installerSourceFile || '');

  // Live PSADT -FilePath value
  const psadtPath = (() => {
    if (!primaryFile) return '';
    const sub = (state.installerSubfolder || '').replace(/^[/\\]+|[/\\]+$/g, '').replace(/\//g, '\\');
    if (sub) return `"$($adtSession.DirFiles)\\${sub}\\${primaryFile}"`;
    return `"$($adtSession.DirFiles)\\${primaryFile}"`;
  })();

  // ── Handlers ────────────────────────────────────────────────────────────

  const handlePathChange = (raw) => {
    setPathInput(raw);
    setMsiParseResult(null);
    suppressSync.current = true;

    const { dir, file, installerType, subfolder } = parseInstallerFullPath(raw);
    const updates = {
      installerSourceDir:  dir,
      installerSourceFile: file,
      installerSubfolder:  subfolder,
      supportFilesSource:  dir,   // always mirrors source dir
    };
    if (installerType) updates.installerType = installerType;
    if (updateFields) updateFields(updates);
    else Object.entries(updates).forEach(([k, v]) => updateField(k, v));
  };

  const handleTypeToggle = (t) => updateField('installerType', t);

  // ── MSI auto-extract ────────────────────────────────────────────────────
  const handleAutoExtract = async () => {
    const target = msiExtractPath.trim() || pathInput.trim();
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

  // ── WinGet: fetch package info ───────────────────────────────────────────
  const handleWingetFetch = async (targetVersion = null) => {
    const version = typeof targetVersion === 'string' ? targetVersion : null;
    const pkg = wingetInput.trim();
    if (!pkg) return;
    setWingetLoading(true);
    setDownloadStatus(null);
    if (!version) setWingetResult(null);
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

  // ── WinGet: apply filename + metadata to wizard state ────────────────────
  const applyWingetMeta = () => {
    if (!wingetResult || wingetResult.error) return;
    const type = wingetResult.installerType === 'msi' ? 'msi' : 'exe';
    const urlParts = wingetResult.installerUrl.split('/');
    let filename = urlParts[urlParts.length - 1].split('?')[0];
    if (!filename || !filename.includes('.'))
      filename = `${wingetResult.packageIdentifier.toLowerCase()}-${wingetResult.packageVersion}.${type}`;

    // Rebuild the path input with the new filename
    const dirPart = (state.installerSourceDir || '').replace(/\\+$/, '');
    const newFullPath = dirPart ? `${dirPart}\\${filename}` : filename;
    handlePathChange(newFullPath);

    const updates = {
      installerType:  type,
      version:        wingetResult.packageVersion || '1.0.0',
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
  };

  // ── WinGet: download to runner directory ────────────────────────────────
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

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="step-content animate-in">
      <div className="step-header">
        <h2>📦 Installer &amp; Behavior</h2>
        <p>Provide the full path to the installer file. Everything else is derived automatically.</p>
      </div>

      {/* ═══ WINGET BOOTSTRAPPER ═══ */}
      <div className="config-section winget-section animate-slide">
        <h3 className="section-title">🚀 WinGet Package Bootstrapper</h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
          Enter a public WinGet Package ID to automatically resolve installer filename, silent arguments, version, and product detection keys.
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
                    ✓ Apply Filename &amp; Metadata
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
                    <span className="download-hint">⚠️ Set the source path below to enable direct downloads.</span>
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

      {/* ═══ INSTALLER SOURCE ═══ */}
      <div className="config-section">
        <h3 className="section-title">📂 Installer Source <span className="section-subtitle">(Runner / File Share)</span></h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
          Enter the <strong>full path</strong> to the installer file on the GitLab runner.
          The path must include <code>\Files\</code> — the pipeline copies the installer into the PSADT{' '}
          <code>Files\</code> directory. Any subfolder after <code>\Files\</code> is derived automatically.
          Supports local paths (<code>C:\...</code>), UNC shares (<code>\\server\share\...</code>), and mapped drives.
        </p>

        <FormField
          label="Full path to installer file"
          id="installerFullPath"
          required
          hint={`Must contain \\Files\\ — e.g.  C:\\AppSource\\AppName\\Files\\setup.msi   or   C:\\AppSource\\AppName\\Files\\Bin\\setup.exe`}
        >
          <div className="inst-fullpath-row">
            <input
              id="installerFullPath"
              type="text"
              className={`inst-fullpath-input${parsed.pathError && pathInput.trim() ? ' inst-fullpath-input--error' : ''}`}
              value={pathInput}
              onChange={e => handlePathChange(e.target.value)}
              onBlur={() => isMsi && !parsed.pathError && pathInput.trim() && handleAutoExtract()}
              placeholder={String.raw`C:\AppSource\AppName\Files\setup.msi`}
              spellCheck={false}
            />
            {/* Type override chips — shown once a file is detected */}
            {state.installerSourceFile && (
              <div className="inst-type-toggle">
                {['msi', 'exe'].map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`inst-type-btn${state.installerType === t ? ' inst-type-btn--active' : ''}`}
                    onClick={() => handleTypeToggle(t)}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </FormField>

        {/* Validation error */}
        {parsed.pathError && pathInput.trim() && (
          <div className="inst-msg inst-msg--err animate-in" style={{ marginTop: 8 }}>
            ⚠️ {parsed.pathError}
          </div>
        )}

        {/* Derived breakdown — shown when path is valid and a filename exists */}
        {!parsed.pathError && state.installerSourceFile && (
          <div className="inst-derived-grid animate-in">
            <div className="inst-derived-row">
              <span className="inst-derived-label">Source directory</span>
              <code className="inst-derived-value">{state.installerSourceDir || '—'}</code>
            </div>
            <div className="inst-derived-row">
              <span className="inst-derived-label">Installer file</span>
              <code className="inst-derived-value inst-derived-value--file">{state.installerSourceFile}</code>
              {state.installerType && (
                <span className={`inst-type-chip inst-type-chip--${state.installerType}`}>
                  {state.installerType.toUpperCase()}
                </span>
              )}
            </div>
            <div className="inst-derived-row">
              <span className="inst-derived-label">PSADT subfolder</span>
              <code className="inst-derived-value">
                {state.installerSubfolder
                  ? `Files\\${state.installerSubfolder}\\`
                  : 'Files\\ (root)'}
              </code>
            </div>
            <div className="inst-derived-row">
              <span className="inst-derived-label">PSADT -FilePath</span>
              <code className="inst-derived-value inst-derived-value--psadt">{psadtPath}</code>
            </div>
          </div>
        )}

        {/* MSI local extraction */}
        {isMsi && !parsed.pathError && (
          <div className="msi-local-extract animate-in" style={{ marginTop: 'var(--space-md)' }}>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>
              <strong>MSI Info Extraction</strong> — optionally provide a local path to the MSI if the runner
              path isn't accessible from this machine. Leave blank to auto-extract on blur.
            </p>
            <div className="msi-extract-row">
              <input
                type="text"
                className="msi-path-input"
                placeholder="Local path to .msi, e.g. /Users/you/Downloads/installer.msi"
                value={msiExtractPath}
                onChange={e => setMsiExtractPath(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAutoExtract()}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleAutoExtract}
                disabled={msiParsing || (!msiExtractPath.trim() && !pathInput.trim())}
              >
                {msiParsing ? '⏳ Extracting…' : '🔍 Extract MSI Info'}
              </button>
            </div>
            {msiParseResult && !msiParseResult.error && (
              <div className="inst-msg inst-msg--ok animate-in">
                ✅ MSI metadata extracted — {Object.entries(msiParseResult).filter(([k, v]) => v && k !== 'error').length} fields populated
              </div>
            )}
            {msiParseResult?.error && (
              <div className="inst-msg inst-msg--err animate-in">❌ {msiParseResult.error}</div>
            )}
          </div>
        )}
      </div>

      {/* ═══ MSI METADATA ═══ */}
      {isMsi && (
        <div className="config-section animate-slide">
          <h3 className="section-title">🗃 MSI Metadata</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
            Auto-extracted from the installer above. Used for product detection in Intune.
          </p>
          <div className="form-grid">
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

      {/* ═══ EXE INSTALLER DETAILS ═══ */}
      {isExe && (
        <div className="config-section animate-slide">
          <h3 className="section-title">⚙️ EXE Installer Details</h3>
          <div className="form-grid">
            <FormField label="Install Arguments" id="exeInstallArgs">
              <input id="exeInstallArgs" type="text" value={state.exeInstallArgs} onChange={e => updateField('exeInstallArgs', e.target.value)} placeholder="/S /qn" />
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
        /* ── Full-path input row ── */
        .inst-fullpath-row {
          display: flex;
          gap: var(--space-sm);
          align-items: stretch;
        }
        .inst-fullpath-input {
          flex: 1;
          min-width: 0;
          font-family: var(--font-mono);
          font-size: 0.82rem;
          transition: border-color 0.15s;
        }
        .inst-fullpath-input--error {
          border-color: #f87171 !important;
        }

        /* ── Type chips (next to filename) ── */
        .inst-type-toggle {
          display: flex;
          gap: 2px;
          flex-shrink: 0;
        }
        .inst-type-btn {
          padding: 4px 10px;
          border-radius: 4px;
          border: 1px solid var(--border-default);
          background: var(--bg-elevated);
          color: var(--text-secondary);
          font-size: 0.7rem;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 0.05em;
          transition: all 0.1s;
        }
        .inst-type-btn:hover { border-color: var(--accent-primary); }
        .inst-type-btn--active {
          background: var(--accent-primary);
          border-color: var(--accent-primary);
          color: #fff;
        }

        /* ── Derived breakdown grid ── */
        .inst-derived-grid {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 0;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        .inst-derived-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 12px;
          border-bottom: 1px solid var(--border-subtle);
          flex-wrap: wrap;
        }
        .inst-derived-row:last-child { border-bottom: none; }
        .inst-derived-label {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          min-width: 110px;
          flex-shrink: 0;
        }
        .inst-derived-value {
          font-family: var(--font-mono);
          font-size: 0.78rem;
          color: var(--text-secondary);
          word-break: break-all;
          flex: 1;
        }
        .inst-derived-value--file {
          color: var(--text-primary);
          font-weight: 600;
        }
        .inst-derived-value--psadt {
          color: var(--text-accent, var(--accent-primary));
        }

        /* ── Installer type chip ── */
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
          background: rgba(139,92,246,0.18);
          color: #a78bfa;
          border: 1px solid rgba(139,92,246,0.3);
        }
        .inst-type-chip--exe {
          background: rgba(245,158,11,0.15);
          color: #fbbf24;
          border: 1px solid rgba(245,158,11,0.28);
        }

        /* ── Section subtitle ── */
        .section-subtitle {
          font-size: 0.72rem;
          font-weight: 400;
          color: var(--text-muted);
          margin-left: 6px;
          text-transform: none;
          letter-spacing: 0;
        }

        /* ── MSI local extract ── */
        .msi-local-extract {
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
        .msi-path-input { flex: 1; min-width: 0; }

        /* ── Status / validation messages ── */
        .inst-msg {
          margin-top: 8px;
          padding: 6px 10px;
          border-radius: var(--radius-sm);
          font-size: 0.76rem;
        }
        .inst-msg--ok {
          background: rgba(74,222,128,0.08);
          color: #4ade80;
          border: 1px solid rgba(74,222,128,0.2);
        }
        .inst-msg--err {
          background: rgba(239,68,68,0.08);
          color: #f87171;
          border: 1px solid rgba(239,68,68,0.2);
        }
      `}</style>
    </div>
  );
}
