import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';

export default function BasicInfoStep({ state, updateField, CATEGORIES }) {
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
        <h2>📋 Basic Information</h2>
        <p>Define the application identity. These values are used across all generated files.</p>
      </div>


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
      </div>

      {state.displayName && state.category && (
        <div className="step-preview-badge animate-in">
          <span className="badge-label">GitLab Path</span>
          <code>{state.gitLabGroup}/software-titles/{state.packageId}</code>
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
      `}</style>
    </div>
  );
}
