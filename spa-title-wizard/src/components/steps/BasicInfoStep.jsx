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
          <code>{state.gitLabGroup}/software-titles/{state.category}/{state.packageId}</code>
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
      `}</style>
    </div>
  );
}
