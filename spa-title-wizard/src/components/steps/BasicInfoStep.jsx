import { useState, useEffect, useRef } from 'react';
import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import { validatePackageId } from '../../hooks/useWizardState';

function toKebabCase(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function BasicInfoStep({ state, updateField, CATEGORIES, onLoadExistingProject }) {
  const isEditMode = state.wizardMode === 'edit';
  const [checkingProject, setCheckingProject] = useState(false);
  const [existingProject, setExistingProject] = useState(null);
  
  // GitLab project search dropdown states
  const [projects, setProjects] = useState([]);
  const [fetchingProjects, setFetchingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState(null);
  
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const comboboxRef = useRef(null);

  // Click outside combobox closes dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (comboboxRef.current && !comboboxRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch the projects list when gitLabGroup changes
  useEffect(() => {
    if (state.wizardMode === 'edit') return; // no need to fetch list in edit mode
    
    let active = true;
    setFetchingProjects(true);
    setProjectsError(null);
    
    // gitLabGroup from .env is already the full parent group — use it directly
    const groupPath = state.gitLabGroup;
    fetch(`/api/projects?group=${encodeURIComponent(groupPath)}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (active) {
          setProjects(data.projects || []);
          setFetchingProjects(false);
        }
      })
      .catch(err => {
        if (active) {
          console.warn('Failed to fetch projects list:', err);
          setProjectsError(err.message);
          setFetchingProjects(false);
        }
      });
      
    return () => { active = false; };
  }, [state.gitLabGroup, state.wizardMode]);

  // Check if current Package ID exists in GitLab
  // Tries the active gitLabGroup first; if not found, falls back to the base group
  // (handles projects created before platform-specific subgroups were introduced).
  useEffect(() => {
    if (!state.packageId || !state.gitLabGroup) {
      setExistingProject(null);
      updateField('existingProject', null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingProject(true);
      setExistingProject(null);
      updateField('existingProject', null);
      try {
        // gitLabGroup from .env is the full parent group — just append packageId directly
        const primaryPath = `${state.gitLabGroup}/${state.packageId}`;

        // Helper to check a single path
        const checkPath = async (fullPath) => {
          const res = await fetch(`/api/projects/check?path=${encodeURIComponent(fullPath)}`);
          if (!res.ok) return null;
          const data = await res.json();
          return data.exists ? data.project : null;
        };

        let project = await checkPath(primaryPath);

        // No fallback needed — the group path is fully specified in .env

        if (project) {
          setExistingProject(project);
          updateField('existingProject', project);
        } else {
          setExistingProject(null);
          updateField('existingProject', null);
        }
      } catch (e) {
        console.warn('[ProjectCheck] Failed to check project existence:', e);
      } finally {
        setCheckingProject(false);
      }
    }, 600); // 600ms debounce

    return () => clearTimeout(timer);
  }, [state.packageId, state.gitLabGroup]);
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
                <p>Project information is <strong>locked</strong> in Edit mode. You can update installer details, PSADT actions, detection rules, and other configuration below.</p>
              )}
            </div>
          </div>
        );
      })()}

      <div className="step-header">
        <h2>📋 Project Information</h2>
        <p>Define the application identity. These values are used across all generated files.</p>
      </div>

      {/* Duplicate Project Choice Card */}
      {existingProject && (state.wizardMode !== 'edit' || existingProject.path_with_namespace !== state._editProjectPath) && (
        <div className="duplicate-alert duplicate-choice-card animate-in">
          <div className="duplicate-alert__header">
            <span className="duplicate-alert__icon">⚠️</span>
            <div className="duplicate-alert__title-group">
              <h3 className="duplicate-alert__title">Project Already Exists in GitLab</h3>
              <p className="duplicate-alert__subtitle">
                A repository with the Package ID <code>{state.packageId}</code> already exists. How would you like to proceed?
              </p>
            </div>
          </div>
          <div className="duplicate-alert__body" style={{ paddingLeft: 0, marginTop: 'var(--space-md)' }}>
            <div className="duplicate-alert__meta" style={{ marginBottom: 'var(--space-lg)' }}>
              <span><strong>Path:</strong> <code>{existingProject.path_with_namespace}</code></span>
              <span><strong>GitLab URL:</strong> <a href={existingProject.web_url} target="_blank" rel="noreferrer" className="duplicate-alert__link">{existingProject.web_url}</a></span>
              {existingProject.tags && existingProject.tags.length > 0 && (
                <span><strong>Latest Version:</strong> <code className="duplicate-alert__version">{existingProject.tags[0].name}</code></span>
              )}
            </div>
            
            <div className="duplicate-choices-grid">
              {/* Option A */}
              <div className={`duplicate-choice-box ${!state.duplicateAcknowledge ? 'duplicate-choice-box--active' : ''}`}>
                <div className="duplicate-choice-box__badge">Option A (Recommended)</div>
                <h4>✏️ Load & Edit Existing Configuration</h4>
                <p>Discard current changes/uploads, pull the configuration directly from GitLab, and edit it. This maintains project history.</p>
                {onLoadExistingProject && (
                  <button
                    type="button"
                    className="btn btn-primary duplicate-alert__btn"
                    onClick={() => onLoadExistingProject(existingProject.path_with_namespace)}
                    style={{ marginTop: 'auto' }}
                  >
                    ✏️ Load Existing Project
                  </button>
                )}
              </div>

              {/* Option B */}
              <div className={`duplicate-choice-box ${state.duplicateAcknowledge ? 'duplicate-choice-box--active' : ''}`}>
                <div className="duplicate-choice-box__badge duplicate-choice-box__badge--caution">Option B (Proceed)</div>
                <h4>🔄 Proceed with Refactoring</h4>
                <p>Continue using your uploaded files. Note that publishing will overwrite or update scripts directly on the main branch of the repository.</p>
                
                <label className="duplicate-ack-label" style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={state.duplicateAcknowledge || false}
                    onChange={e => updateField('duplicateAcknowledge', e.target.checked)}
                    style={{ marginTop: '3px' }}
                  />
                  <span>I acknowledge that publishing will update/overwrite the existing repository in GitLab.</span>
                </label>
              </div>
            </div>

            {!state.duplicateAcknowledge && (
              <p className="duplicate-alert__msg" style={{ marginTop: 'var(--space-md)', color: '#ef4444', fontWeight: '500', fontSize: '0.8rem' }}>
                ⚠️ Please select Option A (Load Existing) or check the acknowledgment checkbox in Option B to proceed.
              </p>
            )}
          </div>
        </div>
      )}


      <div className="form-grid">
        <FormField label="Display Name" required id="displayName" hint={isEditMode ? 'Display Name is locked in edit mode.' : "Human-readable name, e.g. 'Google Chrome'"}>
          <input
            id="displayName"
            type="text"
            placeholder="e.g. Google Chrome"
            value={state.displayName}
            onChange={e => updateField('displayName', e.target.value)}
            autoFocus={!isEditMode}
            disabled={isEditMode}
            className={isEditMode ? 'input-disabled' : ''}
          />
        </FormField>

        {state.wizardMode !== 'edit' ? (
          <FormField
            label="Package ID"
            required
            id="packageId"
            hint="Select an existing GitLab project or enter a Package ID to create a new one."
            style={{ gridColumn: 'span 2', marginTop: 'var(--space-md)' }}
          >
            <div className="combobox-container" ref={comboboxRef}>
              <div className="combobox-input-wrapper">
                <input
                  id="packageId"
                  type="text"
                  placeholder={fetchingProjects ? "Loading projects from GitLab..." : "Search existing projects or enter new Package ID..."}
                  value={state.packageId}
                  onChange={e => {
                    updateField('packageId', e.target.value);
                    setDropdownOpen(true);
                  }}
                  onFocus={() => setDropdownOpen(true)}
                  className="combobox-input"
                />
                {state.packageId && (
                  <button
                    type="button"
                    className="combobox-clear"
                    onClick={() => {
                      updateField('packageId', '');
                      setDropdownOpen(true);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              {dropdownOpen && (
                <div className="combobox-dropdown animate-in">
                  {(() => {
                    const query = (state.packageId || '').toLowerCase();
                    const filteredProjects = projects.filter(p =>
                      (p.name || '').toLowerCase().includes(query) ||
                      (p.path || '').toLowerCase().includes(query)
                    );
                    
                    const exactMatch = projects.some(p => p.path.toLowerCase() === query);
                    const showCreateNew = query.trim().length > 0 && !exactMatch;

                    if (filteredProjects.length === 0 && !showCreateNew) {
                      return (
                        <div className="combobox-empty">
                          {fetchingProjects ? "Loading GitLab projects..." : "Start typing to search or create a new project..."}
                        </div>
                      );
                    }

                    return (
                      <>
                        {filteredProjects.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            className={`combobox-item ${state.packageId === p.path ? 'combobox-item--selected' : ''}`}
                            onClick={() => {
                              updateField('packageId', p.path);
                              updateField('displayName', p.name);
                              setDropdownOpen(false);
                            }}
                          >
                            <span className="combobox-item-name">{p.name}</span>
                            <span className="combobox-item-path">{p.path_with_namespace}</span>
                          </button>
                        ))}
                        {showCreateNew && (
                          <button
                            type="button"
                            className="combobox-item combobox-item--create-new"
                            onClick={() => {
                              setDropdownOpen(false);
                            }}
                          >
                            <span className="combobox-item-name">➕ Create new project with ID "{state.packageId}"</span>
                            <span className="combobox-item-path">A new GitLab repository will be created for this package ID</span>
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
            {state.packageId && (() => {
              const err = validatePackageId(state.packageId);
              return err ? <span className="field-error-msg">⚠️ {err}</span> : null;
            })()}
          </FormField>
        ) : (
          <FormField label="Package ID" required id="packageId" hint="Package ID is locked in edit mode." style={{ gridColumn: 'span 2', marginTop: 'var(--space-md)' }}>
            <input
              id="packageId"
              type="text"
              value={state.packageId}
              disabled
              className="input-disabled"
            />
          </FormField>
        )}

        <FormField label="Publisher" required id="publisher" hint={isEditMode ? 'Publisher is locked in edit mode.' : undefined}>
          <input
            id="publisher"
            type="text"
            placeholder="e.g. Google LLC"
            value={state.publisher}
            onChange={e => updateField('publisher', e.target.value)}
            disabled={isEditMode}
            className={isEditMode ? 'input-disabled' : ''}
          />
        </FormField>

        <FormField
          label="Version"
          required
          id="version"
          hint={isEditMode ? 'Version is locked in edit mode.' : "Vendor version string, e.g. '134.0.6998.89'"}
        >
          <input
            id="version"
            type="text"
            placeholder="e.g. 134.0"
            value={state.version}
            onChange={e => updateField('version', e.target.value)}
            disabled={isEditMode}
            className={isEditMode ? 'input-disabled' : ''}
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
          hint={isEditMode ? 'Category is locked in edit mode.' : 'Determines the GitLab subgroup path and Jamf category.'}
          disabled={isEditMode}
        />

        <FormField label="GitLab Group" id="gitLabGroup" hint="Locked by environment configuration.">
          <input
            id="gitLabGroup"
            type="text"
            value={state.gitLabGroup}
            disabled
            className="input-disabled"
          />
        </FormField>
      </div>

      {state.displayName && state.category && (
        <div className="step-preview-badge animate-in">
          <span className="badge-label">GitLab Path</span>
          <code>{state.gitLabGroup}/{state.packageId}</code>
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

        /* ── Package ID & Combobox ── */
        .combobox-container {
          position: relative;
          width: 100%;
        }
        .combobox-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .combobox-input {
          width: 100%;
          padding-right: 32px !important;
        }
        .combobox-clear {
          position: absolute;
          right: 10px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 0.8rem;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }
        .combobox-clear:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.1);
        }
        .combobox-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--bg-elevated, #161b33);
          border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
          border-radius: var(--radius-md, 8px);
          margin-top: 4px;
          max-height: 250px;
          overflow-y: auto;
          z-index: 100;
          box-shadow: 0 10px 25px rgba(0,0,0,0.4);
          backdrop-filter: var(--glass-blur);
        }
        .combobox-item {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          padding: 10px 14px;
          background: transparent;
          border: none;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          text-align: left;
          color: var(--text-primary);
          cursor: pointer;
          transition: background 0.2s;
        }
        .combobox-item:hover {
          background: rgba(99, 140, 255, 0.1);
        }
        .combobox-item--selected {
          background: rgba(99, 140, 255, 0.15);
          border-left: 3px solid var(--text-accent, #7c8aff);
        }
        .combobox-item-name {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .combobox-item-path {
          font-size: 0.72rem;
          color: var(--text-muted);
          font-family: var(--font-mono, monospace);
        }
        .combobox-empty {
          padding: 16px;
          text-align: center;
          font-size: 0.82rem;
          color: var(--text-muted);
        }
        .field-error-msg {
          display: block;
          margin-top: var(--space-xs);
          font-size: 0.78rem;
          color: #ef4444;
          font-weight: 500;
        }
        .input-disabled {
          background: rgba(255, 255, 255, 0.03) !important;
          color: var(--text-muted) !important;
          cursor: not-allowed;
          border-color: rgba(255, 255, 255, 0.05) !important;
        }

        /* ── Duplicate Choice Cards ── */
        .duplicate-choice-card {
          border-color: rgba(239, 68, 68, 0.2) !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2) !important;
        }
        .duplicate-choices-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-md);
          margin-top: var(--space-md);
        }
        @media (max-width: 640px) {
          .duplicate-choices-grid {
            grid-template-columns: 1fr;
          }
        }
        .duplicate-choice-box {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
          padding: var(--space-lg);
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: var(--radius-md, 8px);
          transition: all 0.2s;
        }
        .duplicate-choice-box--active {
          border-color: var(--accent-primary, #3b82f6) !important;
          background: rgba(59, 130, 246, 0.04) !important;
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.08);
        }
        .duplicate-choice-box h4 {
          font-size: 0.95rem;
          font-weight: 700;
          margin: 0;
          color: var(--text-primary);
        }
        .duplicate-choice-box p {
          font-size: 0.78rem;
          color: var(--text-muted);
          line-height: 1.45;
          margin: 0 0 var(--space-md) 0;
        }
        .duplicate-choice-box__badge {
          align-self: flex-start;
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          background: rgba(34, 197, 94, 0.15);
          color: #4ade80;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .duplicate-choice-box__badge--caution {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
        }
        .duplicate-ack-label input[type="checkbox"] {
          width: 14px;
          height: 14px;
          accent-color: var(--accent-primary, #3b82f6);
        }
        @keyframes pulse-shimmer {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }

        .combobox-item--create-new {
          border-top: 1px dashed var(--border-subtle);
          background: rgba(99, 140, 255, 0.03) !important;
        }
        .combobox-item--create-new:hover {
          background: rgba(99, 140, 255, 0.08) !important;
        }
        .combobox-item--create-new .combobox-item-name {
          color: var(--text-accent, #7c8aff) !important;
        }
      `}</style>
    </div>
  );
}
