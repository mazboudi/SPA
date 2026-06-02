import { useState, useEffect } from 'react';
import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';

export default function BasicInfoStep({ state, updateField, CATEGORIES, onLoadExistingProject }) {
  const [checkingProject, setCheckingProject] = useState(false);
  const [existingProject, setExistingProject] = useState(null);

  useEffect(() => {
    if (!state.packageId || !state.gitLabGroup) {
      setExistingProject(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingProject(true);
      setExistingProject(null);
      try {
        const fullPath = `${state.gitLabGroup}/software-titles/${state.packageId}`;
        const res = await fetch(`/api/projects/check?path=${encodeURIComponent(fullPath)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.exists) {
            setExistingProject(data.project);
          }
        }
      } catch (e) {
        console.warn('Failed to check project existence:', e);
      } finally {
        setCheckingProject(false);
      }
    }, 600); // 600ms debounce

    return () => clearTimeout(timer);
  }, [state.packageId, state.gitLabGroup, state.wizardMode]);
  return (
    <div className="step-content animate-in">
      {/* Refactor import banner */}
      {state.wizardMode === 'refactor' && (
        <div className="import-banner animate-in">
          <div className="import-banner__icon">🔄</div>
          <div className="import-banner__body">
            <strong>Imported from PSADT {state.psadtVersion?.toUpperCase()}</strong>
            {state.psadtScriptVersion && (
              <span className="import-banner__version">v{state.psadtScriptVersion}</span>
            )}
            <p>
              Parsed from <code>{state.psadtFileName || 'uploaded script'}</code>.
              Review and adjust the pre-filled fields below.
            </p>
          </div>
        </div>
      )}

      {/* Edit mode banner — shows loaded ref + staleness warning */}
      {state.wizardMode === 'edit' && state._editLoadedRef && (() => {
        const ref = state._editLoadedRef;
        const tags = state._editProjectTags || [];
        const isTag = ref.startsWith('v');
        const latestTag = tags.length > 0 ? tags[0].name : null;
        // Stale if loaded from a tag that isn't the latest, or loaded from main but state version
        // doesn't match the latest tag version
        const stateVersion = state.version ? `v${state.version.replace(/^v/i, '')}` : '';
        const isStale = latestTag && (
          (isTag && ref !== latestTag) ||
          (!isTag && stateVersion && stateVersion !== latestTag)
        );
        return (
          <div className={`import-banner import-banner--edit animate-in ${isStale ? 'import-banner--stale' : ''}`}>
            <div className="import-banner__icon">{isStale ? '⚠️' : '✏️'}</div>
            <div className="import-banner__body">
              <strong>
                Editing from{' '}
                <span className="import-banner__version">{isTag ? `🏷️ ${ref}` : `📌 ${ref}`}</span>
              </strong>
              {state._editProjectPath && (
                <span className="import-banner__project">
                  {' '}— <a href={state._editProjectUrl} target="_blank" rel="noreferrer">{state._editProjectPath}</a>
                </span>
              )}
              {isStale && (
                <p className="import-banner__stale-warning">
                  ⚠️ <strong>Newer version available:</strong> The latest tag is <code>{latestTag}</code>,
                  but you loaded <code>{isTag ? ref : `${ref} (state version ${stateVersion || 'unknown'})`}</code>.
                  You may be editing an outdated version.
                </p>
              )}
              {!isStale && (
                <p>Review and update the fields below, then publish to push changes.</p>
              )}
            </div>
          </div>
        );
      })()}

      <div className="step-header">
        <h2>📋 Project Information</h2>
        <p>Define the application identity. These values are used across all generated files.</p>
      </div>

      {/* Duplicate Project Warning Alert */}
      {existingProject && (state.wizardMode !== 'edit' || existingProject.path_with_namespace !== state._editProjectPath) && (
        <div className="duplicate-alert animate-in">
          <div className="duplicate-alert__header">
            <span className="duplicate-alert__icon">⚠️</span>
            <div className="duplicate-alert__title-group">
              <h3 className="duplicate-alert__title">Project Already Exists in GitLab</h3>
              <p className="duplicate-alert__subtitle">
                A packaging repository with this ID already exists under this group namespace.
              </p>
            </div>
          </div>
          <div className="duplicate-alert__body">
            <div className="duplicate-alert__meta">
              <span><strong>Path:</strong> <code>{existingProject.path_with_namespace}</code></span>
              <span><strong>GitLab URL:</strong> <a href={existingProject.web_url} target="_blank" rel="noreferrer" className="duplicate-alert__link">{existingProject.web_url}</a></span>
              {existingProject.tags && existingProject.tags.length > 0 && (
                <span><strong>Latest Version:</strong> <code className="duplicate-alert__version">{existingProject.tags[0].name}</code></span>
              )}
            </div>
            <p className="duplicate-alert__msg">
              We highly recommend editing the existing project to load its configuration, files, and history directly instead of creating a duplicate scaffold from scratch.
            </p>
            {onLoadExistingProject && (
              <button
                type="button"
                className="btn btn-primary duplicate-alert__btn"
                onClick={() => onLoadExistingProject(existingProject.path_with_namespace)}
              >
                ✏️ Edit Existing Project Instead
              </button>
            )}
          </div>
        </div>
      )}


      <div className="form-grid">
        <FormField label="Display Name" required id="displayName" hint="Human-readable name, e.g. 'Google Chrome'">
          <input
            id="displayName"
            type="text"
            placeholder="e.g. Google Chrome"
            value={state.displayName}
            onChange={e => updateField('displayName', e.target.value)}
            autoFocus
          />
        </FormField>

        <FormField label="Package ID" required id="packageId" hint="Auto-derived from display name. Kebab-case identifier.">
          <input
            id="packageId"
            type="text"
            placeholder="e.g. google-chrome"
            value={state.packageId}
            onChange={e => updateField('packageId', e.target.value)}
          />
        </FormField>

        <FormField label="Publisher" required id="publisher">
          <input
            id="publisher"
            type="text"
            placeholder="e.g. Google LLC"
            value={state.publisher}
            onChange={e => updateField('publisher', e.target.value)}
          />
        </FormField>

        <FormField label="Version" required id="version" hint="Vendor version string, e.g. '134.0.6998.89'">
          <input
            id="version"
            type="text"
            placeholder="e.g. 134.0"
            value={state.version}
            onChange={e => updateField('version', e.target.value)}
          />
        </FormField>

        <SelectField
          label="Category"
          required
          id="category"
          value={state.category}
          onChange={v => updateField('category', v)}
          placeholder="Select a category..."
          options={CATEGORIES}
          hint="Determines the GitLab subgroup path and Jamf category."
        />

        <FormField label="GitLab Group" id="gitLabGroup" hint="Advanced — root GitLab group path.">
          <input
            id="gitLabGroup"
            type="text"
            value={state.gitLabGroup}
            onChange={e => updateField('gitLabGroup', e.target.value)}
          />
        </FormField>

        <FormField 
          label="Target Platform" 
          required 
          id="platform" 
          hint="Select the target platform. This determines which configuration pages and pipelines are generated."
          style={{ gridColumn: 'span 2', marginTop: 'var(--space-md)' }}
        >
          <div className="platform-selector-group">
            {[
              { value: 'windows', icon: '🪟', label: 'Windows', desc: 'Intune + PSADT deployment' },
              { value: 'macos', icon: '🍎', label: 'macOS', desc: 'Jamf Pro + Terraform' },
              { value: 'both', icon: '🔀', label: 'Both Platforms', desc: 'Unified dual-platform' }
            ].map(p => (
              <button
                key={p.value}
                type="button"
                className={`platform-btn ${state.platform === p.value ? 'platform-btn--selected' : ''}`}
                onClick={() => updateField('platform', p.value)}
              >
                <span className="platform-btn__icon">{p.icon}</span>
                <div className="platform-btn__info">
                  <span className="platform-btn__label">{p.label}</span>
                  <span className="platform-btn__desc">{p.desc}</span>
                </div>
                {state.platform === p.value && <span className="platform-btn__check">✓</span>}
              </button>
            ))}
          </div>
        </FormField>
      </div>

      {state.displayName && state.category && (
        <div className="step-preview-badge animate-in">
          <span className="badge-label">GitLab Path</span>
          <code>{state.gitLabGroup}/software-titles/{state.packageId}</code>
          {checkingProject && <span className="checking-spinner">⚡ Checking GitLab...</span>}
        </div>
      )}

      <style>{`
        .step-content {
          padding: 0 var(--space-xl) var(--space-xl);
        }
        .step-header {
          margin-bottom: var(--space-xl);
        }
        .step-header h2 {
          font-size: 1.35rem;
          font-weight: 700;
          margin-bottom: var(--space-sm);
          background: var(--accent-gradient);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .step-header p {
          color: var(--text-secondary);
          font-size: 0.9rem;
        }
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0 var(--space-xl);
        }
        @media (max-width: 768px) {
          .form-grid { grid-template-columns: 1fr; }
        }
        .step-preview-badge {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-md);
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          margin-top: var(--space-lg);
        }
        .badge-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          flex-shrink: 0;
        }
        .step-preview-badge code {
          font-family: var(--font-mono);
          font-size: 0.8rem;
          color: var(--text-accent);
        }

        /* ── Import Banner ── */
        .import-banner {
          display: flex;
          align-items: flex-start;
          gap: var(--space-md);
          padding: var(--space-md) var(--space-lg);
          margin: 0 var(--space-xl) var(--space-lg);
          background: linear-gradient(135deg, rgba(99,140,255,0.08), rgba(168,85,247,0.06));
          border: 1px solid rgba(99,140,255,0.2);
          border-radius: var(--radius-sm);
          border-left: 3px solid var(--text-accent, #7c8aff);
        }
        .import-banner__icon {
          font-size: 1.5rem;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .import-banner__body {
          font-size: 0.85rem;
          line-height: 1.5;
        }
        .import-banner__body strong {
          color: var(--text-primary);
        }
        .import-banner__version {
          display: inline-block;
          margin-left: var(--space-sm);
          padding: 1px 6px;
          background: rgba(99,140,255,0.15);
          border-radius: var(--radius-sm);
          font-size: 0.72rem;
          font-weight: 600;
          color: var(--text-accent, #7c8aff);
          font-family: var(--font-mono, monospace);
        }
        .import-banner__body p {
          margin-top: var(--space-xs, 4px);
          color: var(--text-secondary);
          font-size: 0.8rem;
        }
        .import-banner__body code {
          background: rgba(255,255,255,0.06);
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 0.75rem;
          font-family: var(--font-mono, monospace);
        }

        /* ── Edit banner variant ── */
        .import-banner--edit {
          background: linear-gradient(135deg, rgba(52,211,153,0.08), rgba(56,189,248,0.06));
          border-color: rgba(52,211,153,0.25);
          border-left-color: #34d399;
        }
        .import-banner--edit .import-banner__version {
          background: rgba(52,211,153,0.15);
          color: #34d399;
        }
        .import-banner__project {
          font-size: 0.78rem;
          color: var(--text-muted);
        }
        .import-banner__project a {
          color: var(--text-accent, #7c8aff);
          text-decoration: none;
        }
        .import-banner__project a:hover {
          text-decoration: underline;
        }

        /* ── Stale / staleness warning variant ── */
        .import-banner--stale {
          background: linear-gradient(135deg, rgba(245,158,11,0.1), rgba(239,68,68,0.06));
          border-color: rgba(245,158,11,0.3);
          border-left-color: #f59e0b;
        }
        .import-banner--stale .import-banner__version {
          background: rgba(245,158,11,0.15);
          color: #fbbf24;
        }
        .import-banner__stale-warning {
          margin-top: var(--space-sm, 8px);
          padding: 8px 12px;
          background: rgba(245,158,11,0.06);
          border: 1px solid rgba(245,158,11,0.18);
          border-radius: var(--radius-sm);
          font-size: 0.78rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }
        .import-banner__stale-warning strong {
          color: #fbbf24;
        }
        .import-banner__stale-warning code {
          background: rgba(245,158,11,0.12);
          color: #fbbf24;
        }

        /* ── Platform Selector Segmented Control ── */
        .platform-selector-group {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--space-md);
          margin-top: var(--space-xs);
          width: 100%;
        }
        @media (max-width: 640px) {
          .platform-selector-group {
            grid-template-columns: 1fr;
          }
        }
        .platform-btn {
          position: relative;
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-md) var(--space-lg);
          background: var(--bg-card, rgba(255,255,255,0.02));
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md, 8px);
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
          color: var(--text-primary);
          font-family: inherit;
        }
        .platform-btn:hover {
          border-color: var(--text-accent, #7c8aff);
          background: var(--bg-hover, rgba(255,255,255,0.05));
          transform: translateY(-1px);
        }
        .platform-btn--selected {
          border-color: var(--accent-primary, #3b82f6);
          background: rgba(59, 130, 246, 0.08);
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.1);
        }
        .platform-btn__icon {
          font-size: 1.6rem;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
        }
        .platform-btn__info {
          display: flex;
          flex-direction: column;
        }
        .platform-btn__label {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .platform-btn__desc {
          font-size: 0.72rem;
          color: var(--text-muted);
          margin-top: 1px;
        }
        .platform-btn__check {
          margin-left: auto;
          font-size: 0.85rem;
          font-weight: bold;
          color: var(--accent-primary, #3b82f6);
          background: rgba(59, 130, 246, 0.1);
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* ── Duplicate Alert Card ── */
        .duplicate-alert {
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(245, 158, 11, 0.06));
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-left: 4px solid #ef4444;
          border-radius: var(--radius-md, 8px);
          padding: var(--space-lg);
          margin-bottom: var(--space-xl);
          box-shadow: 0 4px 20px rgba(239, 68, 68, 0.05);
          text-align: left;
        }
        .duplicate-alert__header {
          display: flex;
          align-items: flex-start;
          gap: var(--space-md);
        }
        .duplicate-alert__icon {
          font-size: 1.6rem;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .duplicate-alert__title-group {
          display: flex;
          flex-direction: column;
        }
        .duplicate-alert__title {
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }
        .duplicate-alert__subtitle {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin: 2px 0 0 0;
        }
        .duplicate-alert__body {
          margin-top: var(--space-md);
          padding-left: 36px;
        }
        .duplicate-alert__meta {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 0.8rem;
          background: rgba(0, 0, 0, 0.15);
          padding: var(--space-md);
          border-radius: var(--radius-sm);
          border: 1px solid rgba(255, 255, 255, 0.03);
          margin-bottom: var(--space-md);
        }
        .duplicate-alert__meta span {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .duplicate-alert__meta code {
          background: rgba(255, 255, 255, 0.05);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: var(--font-mono, monospace);
          color: #fca5a5;
        }
        .duplicate-alert__meta code.duplicate-alert__version {
          color: #fbbf24;
          background: rgba(245, 158, 11, 0.12);
        }
        .duplicate-alert__link {
          color: #60a5fa;
          text-decoration: none;
          word-break: break-all;
        }
        .duplicate-alert__link:hover {
          text-decoration: underline;
        }
        .duplicate-alert__msg {
          font-size: 0.82rem;
          color: var(--text-secondary);
          line-height: 1.5;
          margin: 0 0 var(--space-md) 0;
        }
        .duplicate-alert__btn {
          margin-top: 2px;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
        }

        .checking-spinner {
          font-size: 0.72rem;
          color: var(--text-muted);
          background: rgba(255, 255, 255, 0.05);
          padding: 2px 8px;
          border-radius: 10px;
          margin-left: auto;
          animation: pulse-shimmer 1.5s infinite ease-in-out;
        }
        @keyframes pulse-shimmer {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
