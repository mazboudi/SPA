import { useState, useEffect, useRef } from 'react';
import FormField from '../ui/FormField';
import ToggleSwitch from '../ui/ToggleSwitch';
import './windows-steps.css';

// ── Mac path parser ──────────────────────────────────────────────────────────
const MAC_EXT_TO_TYPE = { pkg: 'pkg', mpkg: 'pkg', dmg: 'dmg', zip: 'zip', app: 'app' };

function parseMacPath(fullPath) {
  const raw = fullPath.trim();
  if (!raw) return { dir: '', file: '', type: '' };
  const lastBack  = raw.lastIndexOf('\\');
  const lastSlash = raw.lastIndexOf('/');
  const lastSep   = Math.max(lastBack, lastSlash);
  const dir  = lastSep >= 0 ? raw.slice(0, lastSep) : '';
  const file = lastSep >= 0 ? raw.slice(lastSep + 1) : raw;
  const ext  = file.includes('.') ? file.split('.').pop().toLowerCase() : '';
  const type = MAC_EXT_TO_TYPE[ext] || (ext ? 'other' : '');
  return { dir, file, type };
}

function buildMacPathFromState(state) {
  if (state.macSourceDir && state.macSourceFile)
    return `${state.macSourceDir}/${state.macSourceFile}`;
  return state.macSourceFile || '';
}

function smbFilename(pathInShare) {
  if (!pathInShare) return '';
  return pathInShare.replace(/\\/g, '/').split('/').pop() || '';
}

function normaliseSmbShare(raw) {
  return raw.trim().replace(/\\/g, '/').replace(/\/+$/, '');
}

function fmtBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function MacInstallerStep({ state, updateField, updateFields }) {
  const [pathInput, setPathInput] = useState(() => buildMacPathFromState(state));
  const suppressSync = useRef(false);

  // PKG metadata extraction state
  const [pkgParsing, setPkgParsing]         = useState(false);
  const [pkgParseResult, setPkgParseResult] = useState(null);

  // File staging state (git mode)
  const [staging, setStaging]   = useState(false);
  const [stageError, setStageError] = useState(null);

  // Sync if state changes externally (e.g., load from project)
  useEffect(() => {
    if (suppressSync.current) { suppressSync.current = false; return; }
    const fromState = buildMacPathFromState(state);
    if (fromState && fromState !== pathInput) setPathInput(fromState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.macSourceFile, state.macSourceDir]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handlePathChange = (raw) => {
    setPathInput(raw);
    setPkgParseResult(null);
    setStageError(null);
    suppressSync.current = true;
    const { dir, file, type } = parseMacPath(raw);
    const updates = { macSourceDir: dir, macSourceFile: file, macStagedInstaller: null };
    if (type) updates.macInstallerType = type;
    if (updateFields) updateFields(updates);
    else Object.entries(updates).forEach(([k, v]) => updateField(k, v));
  };

  /** Extract PKG metadata AND stage the file for git upload in one step */
  const handleStageAndExtract = async () => {
    const target = pathInput.trim();
    if (!target) return;
    setStaging(true);
    setStageError(null);
    setPkgParseResult(null);
    try {
      // 1. Read the file as base64 for git upload
      const stageRes = await fetch('/api/read-local-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: target }),
      });
      const stageCt = stageRes.headers.get('content-type');
      const stageMeta = stageCt?.includes('json') ? await stageRes.json() : null;
      if (!stageRes.ok) throw new Error(stageMeta?.error || `Server error ${stageRes.status}`);
      updateField('macStagedInstaller', stageMeta);

      // 2. If it's a .pkg, also extract metadata
      const ext = target.split('.').pop().toLowerCase();
      if (ext === 'pkg' || ext === 'mpkg') {
        const metaRes = await fetch('/api/pkg-info-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: target }),
        });
        const metaCt = metaRes.headers.get('content-type');
        const meta = metaCt?.includes('json') ? await metaRes.json() : {};
        if (metaRes.ok) {
          setPkgParseResult(meta);
          if (meta.bundleId)  updateField('bundleId',          meta.bundleId);
          if (meta.receiptId) updateField('receiptId',         meta.receiptId);
          if (meta.version)   updateField('pkgProductVersion', meta.version);
        }
      }
    } catch (err) {
      setStageError(err.message);
      updateField('macStagedInstaller', null);
    } finally {
      setStaging(false);
    }
  };

  const isPkg = state.macInstallerType === 'pkg';
  const staged = state.macStagedInstaller;
  const smbFile = smbFilename(state.macSmbPathInShare);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="step-content animate-in">
      <div className="step-header">
        <h2>🍎 macOS Install Source</h2>
        <p>Choose how the installer file reaches the pipeline runner.</p>
      </div>

      {/* ═══ SOURCE MODE SELECTOR ═══ */}
      <div className="mac-source-mode-row">
        <button
          type="button"
          className={`mac-source-mode-btn ${!state.macSmbEnabled ? 'mac-source-mode-btn--active' : ''}`}
          onClick={() => updateField('macSmbEnabled', false)}
        >
          <span className="mac-mode-icon">📁</span>
          <span className="mac-mode-label">Committed to Git</span>
          <span className="mac-mode-desc">Upload installer to the project repo. Best for testing.</span>
        </button>
        <button
          type="button"
          className={`mac-source-mode-btn ${state.macSmbEnabled ? 'mac-source-mode-btn--active' : ''}`}
          onClick={() => updateField('macSmbEnabled', true)}
        >
          <span className="mac-mode-icon">🌐</span>
          <span className="mac-mode-label">Windows File Share (SMB)</span>
          <span className="mac-mode-desc">Pipeline pulls installer from a network share at runtime.</span>
        </button>
      </div>

      {/* ═══ MODE A: GIT (local file → upload to repo) ═══ */}
      {!state.macSmbEnabled && (
        <div className="config-section animate-in">
          <h3 className="section-title">Local Installer File</h3>
          <p className="section-desc" style={{ marginBottom: 'var(--space-md)' }}>
            Provide the path to the installer on this machine. When you publish the project,
            the file will be uploaded to <code>macos/src/Files/</code> in the GitLab repo.
            The pipeline will read it from there during the Jamf deploy stage.
          </p>

          <FormField
            label="Path to installer file"
            id="macInstallerFullPath"
            required
            hint="Full local path — the server (running on this host) reads and uploads the file."
          >
            <div className="installer-path-row">
              <input
                id="macInstallerFullPath"
                type="text"
                className="installer-path-input"
                value={pathInput}
                onChange={e => handlePathChange(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && pathInput.trim() && handleStageAndExtract()}
                placeholder="/Users/you/Downloads/googlechrome.pkg"
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleStageAndExtract}
                disabled={staging || !pathInput.trim()}
              >
                {staging ? '⏳ Staging…' : staged ? '✅ Re-stage' : '📦 Stage File'}
              </button>
            </div>
          </FormField>

          {/* Staged success badge */}
          {staged && !stageError && (
            <div className="inst-extract-msg inst-extract-msg--ok animate-in">
              ✅ Staged — <code>{staged.fileName}</code> ({fmtBytes(staged.sizeBytes)})
              {' '}will be committed to <code>macos/src/Files/{staged.fileName}</code>
              {pkgParseResult?.bundleId && (
                <> · Bundle ID: <code>{pkgParseResult.bundleId}</code></>
              )}
              {pkgParseResult?.version && (
                <> · Version: <code>{pkgParseResult.version}</code></>
              )}
            </div>
          )}
          {stageError && (
            <div className="inst-extract-msg inst-extract-msg--err animate-in">
              ❌ {stageError}
            </div>
          )}

          {/* File type badge */}
          {state.macSourceFile && (
            <div className="installer-derived-info animate-in">
              <span className={`inst-type-chip inst-type-chip--${state.macInstallerType || 'unknown'}`}>
                {(state.macInstallerType || '?').toUpperCase()}
              </span>
              {state.macSourceDir && <span className="inst-dir">{state.macSourceDir}/</span>}
              <span className="inst-file">{state.macSourceFile}</span>
            </div>
          )}

          {/* Info box about git storage */}
          <div className="mac-git-info-box">
            <strong>How it works</strong>
            <ol style={{ margin: '6px 0 0 18px', padding: 0, fontSize: '0.76rem', lineHeight: 1.7 }}>
              <li>Click <strong>Stage File</strong> — the server reads the binary and prepares it for upload.</li>
              <li>Complete the wizard and click <strong>Publish</strong>.</li>
              <li>The installer is committed to <code>macos/src/Files/</code> alongside all other project files.</li>
              <li>The Jamf deploy pipeline finds it there automatically — no additional CI config needed.</li>
            </ol>
            <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>
              ⚠️ Not recommended for files larger than ~200 MB due to GitLab repository size limits.
              Switch to SMB mode once a file share is available.
            </p>
          </div>
        </div>
      )}

      {/* ═══ MODE B: SMB (pull from Windows share at runtime) ═══ */}
      {state.macSmbEnabled && (
        <div className="config-section animate-in">
          <h3 className="section-title">Windows File Share Connection</h3>
          <p className="section-desc" style={{ marginBottom: 'var(--space-md)' }}>
            The pipeline generates a <code>fetch-mac-installer</code> job that pulls the
            installer from the share using <code>smbclient</code> — no root access or
            network mount required. Credentials are stored as masked GitLab CI variables.
          </p>

          <div className="form-grid">
            <FormField
              label="SMB Share URL"
              id="macSmbShare"
              required
              hint="Server and share name — forward or back slashes both work."
            >
              <input
                id="macSmbShare"
                type="text"
                placeholder="//fileserver.corp.com/apps"
                value={state.macSmbShare}
                onChange={e => updateField('macSmbShare', normaliseSmbShare(e.target.value))}
              />
            </FormField>
            <FormField
              label="Path within share"
              id="macSmbPathInShare"
              required
              hint="Relative path to the installer file inside the share."
            >
              <input
                id="macSmbPathInShare"
                type="text"
                placeholder="Chrome/122.0/googlechrome.pkg"
                value={state.macSmbPathInShare}
                onChange={e => updateField('macSmbPathInShare', e.target.value)}
              />
            </FormField>
          </div>

          {/* Runner command preview */}
          {state.macSmbShare && state.macSmbPathInShare && (
            <div className="smb-preview animate-in">
              <span className="smb-preview__label">Runner command preview</span>
              <code className="smb-preview__cmd">
                smbclient &quot;{state.macSmbShare}&quot; \<br />
                {'  '}-U &quot;$&#123;MAC_SMB_DOMAIN&#125;\\$&#123;MAC_SMB_USER&#125;%$&#123;MAC_SMB_PASS&#125;&quot; \<br />
                {'  '}-c &quot;get {state.macSmbPathInShare} macos/src/Files/{smbFile}&quot;
              </code>
            </div>
          )}

          {/* Type badge */}
          {smbFile && (() => {
            const ext = smbFile.split('.').pop().toLowerCase();
            const type = MAC_EXT_TO_TYPE[ext] || (ext ? 'other' : '');
            return type ? (
              <div className="installer-derived-info animate-in" style={{ marginTop: 'var(--space-sm)' }}>
                <span className={`inst-type-chip inst-type-chip--${type}`}>{type.toUpperCase()}</span>
                <span className="inst-dir">{state.macSmbShare}/</span>
                <span className="inst-file">{state.macSmbPathInShare}</span>
              </div>
            ) : null;
          })()}

          {/* CI variables required */}
          <div className="smb-subsection" style={{ marginTop: 'var(--space-lg)' }}>
            <span className="smb-subsection-label">GitLab CI Variables required</span>
            <div className="smb-ci-vars-info">
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '0 0 10px' }}>
                Store the actual credentials as <strong>masked</strong> CI/CD variables in your GitLab project or group settings.
              </p>
              <div className="smb-ci-var-chips">
                <span className="smb-ci-chip"><code>MAC_SMB_USER</code> — SMB username</span>
                <span className="smb-ci-chip"><span className="smb-ci-chip__masked">●●● masked</span> <code>MAC_SMB_PASS</code> — SMB password</span>
                <span className="smb-ci-chip"><code>MAC_SMB_DOMAIN</code> — AD domain (optional)</span>
              </div>
              <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 8 }}>
                GitLab Settings → CI/CD → Variables → Add variable (type: Variable, masked: ✓)
              </p>
            </div>
          </div>

          {/* PKG metadata extraction for SMB */}
          {smbFile.match(/\.(pkg|mpkg)$/i) && (
            <div className="smb-subsection" style={{ marginTop: 'var(--space-lg)' }}>
              <span className="smb-subsection-label">PKG Metadata Extraction (optional)</span>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '4px 0 10px' }}>
                Provide a local copy of the .pkg to extract Bundle ID and version now.
              </p>
              <div className="msi-extract-row">
                <input
                  type="text"
                  className="msi-path-input"
                  placeholder="/Users/you/Downloads/googlechrome.pkg"
                  value={pathInput}
                  onChange={e => handlePathChange(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleStageAndExtract()}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleStageAndExtract}
                  disabled={staging || !pathInput.trim()}
                >
                  {staging ? '⏳ Extracting…' : '🔍 Extract PKG Info'}
                </button>
              </div>
              {pkgParseResult && !stageError && (
                <div className="inst-extract-msg inst-extract-msg--ok animate-in">
                  ✅ Bundle ID: <code>{pkgParseResult.bundleId || '(none found)'}</code>
                  {pkgParseResult.version && <> · Version: <code>{pkgParseResult.version}</code></>}
                </div>
              )}
              {stageError && (
                <div className="inst-extract-msg inst-extract-msg--err animate-in">❌ {stageError}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ INSTALLER DETAILS (both modes) ═══ */}
      <div className="config-section">
        <h3 className="section-title">Installer Details</h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
          {isPkg ? 'Auto-filled by PKG extraction above. Edit if needed.' : 'Fill in the details for this installer.'}
        </p>
        <div className="form-grid">
          <FormField label="Bundle ID" id="bundleId" required hint="e.g. com.google.Chrome — from Info.plist CFBundleIdentifier">
            <input
              id="bundleId"
              type="text"
              placeholder="com.vendor.AppName"
              value={state.bundleId}
              onChange={e => updateField('bundleId', e.target.value)}
            />
          </FormField>
          <FormField label="Receipt ID" id="receiptId" hint="macOS pkgutil receipt identifier. Auto-derived from Bundle ID.">
            <input
              id="receiptId"
              type="text"
              placeholder="com.vendor.appname"
              value={state.receiptId}
              onChange={e => updateField('receiptId', e.target.value)}
            />
          </FormField>
          {isPkg && state.pkgProductVersion && (
            <FormField label="PKG Version" id="pkgProductVersion" hint="Version extracted from the .pkg metadata.">
              <input
                id="pkgProductVersion"
                type="text"
                value={state.pkgProductVersion}
                onChange={e => updateField('pkgProductVersion', e.target.value)}
              />
            </FormField>
          )}
          <FormField label="Minimum macOS Version" id="macMinOs" required hint="Minimum OS required. Emitted to the Jamf package os_requirements field.">
            <select
              id="macMinOs"
              value={state.macMinOs || '13.0'}
              onChange={e => updateField('macMinOs', e.target.value)}
            >
              <option value="10.15">macOS 10.15 Catalina</option>
              <option value="11.0">macOS 11 Big Sur</option>
              <option value="12.0">macOS 12 Monterey</option>
              <option value="13.0">macOS 13 Ventura</option>
              <option value="14.0">macOS 14 Sonoma</option>
              <option value="15.0">macOS 15 Sequoia</option>
            </select>
          </FormField>
        </div>
      </div>

      <style>{`
        /* ── Source mode selector ── */
        .mac-source-mode-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: var(--space-xl);
        }
        .mac-source-mode-btn {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
          padding: 14px 16px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          cursor: pointer;
          text-align: left;
          transition: all 0.15s ease;
        }
        .mac-source-mode-btn:hover {
          border-color: rgba(99,102,241,0.4);
        }
        .mac-source-mode-btn--active {
          border-color: rgba(99,102,241,0.6);
          background: rgba(99,102,241,0.08);
        }
        .mac-mode-icon { font-size: 1.1rem; }
        .mac-mode-label {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .mac-source-mode-btn--active .mac-mode-label { color: #818cf8; }
        .mac-mode-desc {
          font-size: 0.72rem;
          color: var(--text-muted);
          line-height: 1.4;
        }

        /* ── Shared section styles ── */
        .config-section {
          margin-bottom: var(--space-xl);
          padding-bottom: var(--space-lg);
          border-bottom: 1px solid var(--border-subtle);
        }
        .config-section:last-of-type { border-bottom: none; }
        .section-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: var(--space-md);
        }
        .section-desc {
          font-size: 0.78rem;
          color: var(--text-muted);
          line-height: 1.5;
        }

        /* ── Git info box ── */
        .mac-git-info-box {
          margin-top: var(--space-md);
          padding: 12px 14px;
          background: rgba(99,102,241,0.05);
          border: 1px solid rgba(99,102,241,0.15);
          border-radius: var(--radius-sm);
          font-size: 0.76rem;
          color: var(--text-secondary);
        }
        .mac-git-info-box strong { color: var(--text-primary); }
        .mac-git-info-box code {
          font-family: var(--font-mono);
          font-size: 0.73rem;
          background: rgba(99,102,241,0.1);
          color: #818cf8;
          padding: 1px 5px;
          border-radius: 3px;
        }

        /* ── Installer path row ── */
        .installer-path-row {
          display: flex;
          gap: 8px;
          align-items: stretch;
        }
        .installer-path-input {
          flex: 1;
          min-width: 0;
        }

        /* ── Status messages ── */
        .inst-extract-msg {
          margin-top: var(--space-sm);
          padding: 8px 12px;
          border-radius: var(--radius-sm);
          font-size: 0.76rem;
        }
        .inst-extract-msg--ok {
          background: rgba(34,197,94,0.08);
          border: 1px solid rgba(34,197,94,0.2);
          color: #4ade80;
        }
        .inst-extract-msg--err {
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.2);
          color: #f87171;
        }
        .inst-extract-msg code {
          font-family: var(--font-mono);
          font-size: 0.73rem;
        }

        /* ── Derived info badge ── */
        .installer-derived-info {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: var(--space-sm);
          font-size: 0.78rem;
        }
        .inst-type-chip {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.06em;
        }
        .inst-type-chip--pkg  { background: rgba(99,102,241,0.15); color: #818cf8; }
        .inst-type-chip--dmg  { background: rgba(251,191,36,0.15); color: #fbbf24; }
        .inst-type-chip--zip  { background: rgba(34,197,94,0.15);  color: #4ade80; }
        .inst-type-chip--unknown, .inst-type-chip--other { background: rgba(156,163,175,0.15); color: #9ca3af; }
        .inst-dir { color: var(--text-muted); }
        .inst-file { color: var(--text-primary); font-weight: 600; }

        /* ── SMB preview ── */
        .smb-preview {
          margin-top: var(--space-md);
          border-radius: var(--radius-sm);
          overflow: hidden;
          border: 1px solid var(--border-subtle);
        }
        .smb-preview__label {
          display: block;
          font-size: 0.68rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: var(--text-muted);
          background: var(--bg-elevated);
          padding: 4px 10px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .smb-preview__cmd {
          display: block;
          padding: 10px 14px;
          font-family: var(--font-mono);
          font-size: 0.73rem;
          line-height: 1.7;
          background: var(--bg-deep, #0d1117);
          color: #e6edf3;
          white-space: pre-wrap;
          word-break: break-all;
        }

        /* ── SMB subsections ── */
        .smb-subsection { }
        .smb-subsection-label {
          display: block;
          font-size: 0.72rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: var(--text-muted);
          margin-bottom: var(--space-sm);
        }
        .smb-ci-vars-info {
          padding: 12px 14px;
          background: rgba(99,102,241,0.05);
          border: 1px solid rgba(99,102,241,0.15);
          border-radius: var(--radius-sm);
        }
        .smb-ci-var-chips { display: flex; flex-direction: column; gap: 6px; }
        .smb-ci-chip {
          display: flex; align-items: center; gap: 8px;
          font-size: 0.76rem; color: var(--text-secondary);
        }
        .smb-ci-chip code {
          font-family: var(--font-mono); font-size: 0.74rem;
          background: rgba(99,102,241,0.1); color: #818cf8;
          padding: 1px 6px; border-radius: 3px;
        }
        .smb-ci-chip__masked { font-size: 0.68rem; color: #f59e0b; letter-spacing: 0.04em; }

        /* ── PKG extract row in SMB mode ── */
        .msi-extract-row {
          display: flex; gap: 8px; align-items: stretch;
        }
        .msi-path-input { flex: 1; min-width: 0; }
      `}</style>
    </div>
  );
}
