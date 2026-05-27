import { useState, useMemo, useEffect } from 'react';
import generateScaffolding from '../../lib/generateScaffolding';
import { downloadAsZip, exportToFolder } from '../../lib/downloadZip';
import { validateGeneratedFiles } from '../../lib/validateSchemas';
import { publishToGitLab, checkPublishHealth } from '../../lib/gitlabPublish';
import FileTreePreview from '../FileTreePreview';
import CodePreview from '../ui/CodePreview';

export default function ReviewStep({ state, updateField }) {
  const files = useMemo(() => generateScaffolding(state), [state]);
  const filePaths = Object.keys(files).sort();
  const [selectedFile, setSelectedFile] = useState(filePaths[0] || '');
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState('');

  // Publish state
  const [publishing, setPublishing] = useState(false);
  const [publishPhase, setPublishPhase] = useState('');
  const [publishResult, setPublishResult] = useState(null);
  const [publishError, setPublishError] = useState(null);
  const [apiAvailable, setApiAvailable] = useState(null);
  const [pipelineAction, setPipelineAction] = useState('none');

  // Check if publish API is reachable on mount
  useEffect(() => { checkPublishHealth().then(setApiAvailable); }, []);

  const handlePublish = async () => {
    setPublishing(true);
    setPublishError(null);
    setPublishResult(null);
    try {
      setPublishPhase('Checking project...');
      const result = await publishToGitLab({
        packageId: state.packageId,
        gitLabGroup: state.gitLabGroup,
        category: state.category,
        displayName: state.displayName,
        version: state.version,
        files,
        pipelineAction,
      });
      setPublishResult(result);
    } catch (err) {
      setPublishError(err.message);
    } finally {
      setPublishing(false);
      setPublishPhase('');
    }
  };

  // Schema validation
  const validationResults = useMemo(() => validateGeneratedFiles(files), [files]);
  const allValid = validationResults.length > 0 && validationResults.every(r => r.valid);
  const hasErrors = validationResults.some(r => !r.valid);

  const handleDownloadZip = async () => {
    setExporting(true);
    try {
      await downloadAsZip(files, state.packageId);
      setExportSuccess('zip');
      setTimeout(() => setExportSuccess(''), 3000);
    } finally {
      setExporting(false);
    }
  };

  const handleExportFolder = async () => {
    setExporting(true);
    try {
      const ok = await exportToFolder(files, state.packageId);
      if (ok) {
        setExportSuccess('folder');
        setTimeout(() => setExportSuccess(''), 3000);
      } else if (!('showDirectoryPicker' in window)) {
        alert('Folder export requires Chrome or Edge (File System Access API). Use the ZIP option instead.');
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="step-content animate-in">
      <div className="step-header">
        <h2>🚀 Review & Export</h2>
        <p>Review the generated scaffolding files and export them.</p>
      </div>

      {/* Summary cards */}
      <div className="review-summary">
        <div className="summary-card">
          <span className="summary-card__icon">📦</span>
          <div>
            <div className="summary-card__label">Package</div>
            <div className="summary-card__value">{state.displayName} {state.version}</div>
          </div>
        </div>
        <div className="summary-card">
          <span className="summary-card__icon">🏢</span>
          <div>
            <div className="summary-card__label">Publisher</div>
            <div className="summary-card__value">{state.publisher}</div>
          </div>
        </div>
        <div className="summary-card">
          <span className="summary-card__icon">🖥️</span>
          <div>
            <div className="summary-card__label">Platform</div>
            <div className="summary-card__value">{state.platform === 'both' ? 'Windows + macOS' : state.platform === 'windows' ? 'Windows' : 'macOS'}</div>
          </div>
        </div>
        <div className="summary-card">
          <span className="summary-card__icon">📄</span>
          <div>
            <div className="summary-card__label">Files</div>
            <div className="summary-card__value">{filePaths.length} files</div>
          </div>
        </div>
      </div>

      {/* Export buttons */}
      <div className="review-actions">
        <button className="btn btn-secondary" onClick={handleDownloadZip} disabled={exporting}>
          {exporting ? '⏳ Exporting...' : '📦 Download ZIP'}
        </button>
        <button className="btn btn-secondary" onClick={handleExportFolder} disabled={exporting}>
          📂 Export to Folder
        </button>
        {exportSuccess === 'zip' && (
          <span className="export-success animate-in">✅ ZIP downloaded!</span>
        )}
        {exportSuccess === 'folder' && (
          <span className="export-success animate-in">✅ Exported to folder!</span>
        )}
      </div>

      {/* Publish to GitLab */}
      <div className="publish-section">
        <h3 className="publish-section__title">{state.wizardMode === 'edit' ? '✏️ Update on GitLab' : '🚀 Publish to GitLab'}</h3>
        {state.wizardMode === 'edit' && state._editProjectUrl && (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            Source: <a href={state._editProjectUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--text-accent)' }}>{state._editProjectPath}</a>
            {state._editLoadedRef && (
              <code style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: '99px',
                background: state._editLoadedRef.startsWith('v') ? 'rgba(124,138,255,0.12)' : 'rgba(52,211,153,0.12)',
                color: state._editLoadedRef.startsWith('v') ? '#a78bfa' : '#34d399',
              }}>
                {state._editLoadedRef.startsWith('v') ? '🏷️' : '📌'} Loaded from {state._editLoadedRef}
              </code>
            )}
          </p>
        )}
        <p className="publish-section__path">
          <code>{state.gitLabGroup}/software-titles/{state.packageId}</code>
        </p>

        {publishResult ? (
          <div className="publish-result publish-result--success">
            <div className="publish-result__header">
              <span className="publish-result__icon">✅</span>
              <strong>{publishResult.action === 'created' ? 'Project Created' : 'Project Updated'}</strong>
              {publishResult.tagName && <code className="publish-tag">🏷️ {publishResult.tagName}</code>}
            </div>
            {publishResult.pipelineUrl && (
              <div className="publish-result__pipeline">
                🚀 Pipeline triggered ({publishResult.pipelineAction}):{' '}
                <a href={publishResult.pipelineUrl} target="_blank" rel="noreferrer">
                  View Pipeline →
                </a>
              </div>
            )}
            {publishResult.pipelineAction === 'none' && (
              <div className="publish-result__pipeline publish-result__pipeline--skip">
                ⏸️ Pipeline not triggered — commit only
              </div>
            )}
            <div className="publish-result__links">
              <a href={publishResult.projectUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">🔗 Open Project</a>
              {publishResult.tagUrl && <a href={publishResult.tagUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">🏷️ View Tag</a>}
              <a href={publishResult.webIdeUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">🌐 GitLab Web IDE</a>
              <a href={publishResult.vsCodeUrl} className="btn btn-secondary btn-sm">🖥️ Open in VS Code</a>
            </div>
          </div>
        ) : publishError ? (
          <div className="publish-result publish-result--error">
            <span className="publish-result__icon">❌</span>
            <span>{publishError}</span>
            <button className="btn btn-secondary btn-sm" onClick={handlePublish}>Retry</button>
          </div>
        ) : (
          <div className="publish-actions">
            {/* Pipeline control */}
            <div className="pipeline-control">
              <div className="pipeline-control__label">Pipeline Action</div>
              <div className="pipeline-control__options">
                {(() => {
                  const isWin = state.platform === 'windows' || state.platform === 'both';
                  const isMac = state.platform === 'macos' || state.platform === 'both';
                  const options = [{ value: 'none', label: '⏸️ Don\'t trigger', desc: 'Commit only — no pipeline' }];
                  if (isWin) {
                    options.push(
                      { value: 'build', label: '📦 Build', desc: 'Package .intunewin only' },
                      { value: 'publish', label: '📦 Build + Publish', desc: 'Package and upload to Intune' },
                      { value: 'assign', label: '📦 Build + Publish + Assign', desc: 'Full pipeline — deploy to Intune with assignments' },
                    );
                  }
                  if (isMac && !isWin) {
                    options.push(
                      { value: 'deploy', label: '🍎 Deploy', desc: 'Terraform apply to Jamf' },
                    );
                  }
                  if (isMac && isWin) {
                    options.push(
                      { value: 'deploy', label: '🍎 macOS Deploy', desc: 'Also triggers Jamf Terraform deploy' },
                    );
                  }
                  return options.map(opt => (
                    <label key={opt.value} className={`pipeline-option ${pipelineAction === opt.value ? 'pipeline-option--active' : ''}`}>
                      <input
                        type="radio"
                        name="pipelineAction"
                        value={opt.value}
                        checked={pipelineAction === opt.value}
                        onChange={() => setPipelineAction(opt.value)}
                      />
                      <span className="pipeline-option__label">{opt.label}</span>
                      <span className="pipeline-option__desc">{opt.desc}</span>
                    </label>
                  ));
                })()}
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={handlePublish}
              disabled={publishing || hasErrors || apiAvailable === false}
            >
              {publishing ? `⏳ ${publishPhase || 'Publishing...'}` : state.wizardMode === 'edit' ? '✏️ Update Project' : '🚀 Publish to GitLab'}
            </button>
            {apiAvailable === false && <span className="publish-hint">⚠️ Publish API not reachable — start with <code>npm run server</code></span>}
            {hasErrors && <span className="publish-hint">⚠️ Fix schema errors before publishing</span>}
          </div>
        )}
      </div>

      {/* Schema Validation */}
      <div className={`validation-panel ${hasErrors ? 'validation-panel--error' : 'validation-panel--ok'}`}>
        <div className="validation-panel__header">
          <span className="validation-panel__icon">{hasErrors ? '⚠️' : '✅'}</span>
          <span className="validation-panel__title">
            {validationResults.length === 0
              ? 'No JSON schemas to validate'
              : hasErrors
                ? 'Schema Validation Failed'
                : `All ${validationResults.length} schema checks passed`}
          </span>
        </div>
        {validationResults.map(r => (
          <div key={r.file} className={`validation-item ${r.valid ? 'validation-item--ok' : 'validation-item--err'}`}>
            <span className="validation-item__icon">{r.valid ? '✓' : '✗'}</span>
            <span className="validation-item__file">{r.file}</span>
            {!r.valid && (
              <ul className="validation-item__errors">
                {r.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* File browser */}
      <div className="review-browser">
        <FileTreePreview
          files={files}
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
        />
        <div className="review-preview">
          {selectedFile && files[selectedFile] ? (
            <CodePreview
              code={files[selectedFile]}
              filename={selectedFile.split('/').pop()}
            />
          ) : (
            <div className="review-empty">Select a file to preview</div>
          )}
        </div>
      </div>

      {/* Next steps */}
      <div className="review-next">
        <h3>📋 After Publishing</h3>
        <ol>
          <li>Search <code>TODO</code> in the generated files and fill in all placeholders</li>
          {(state.platform === 'windows' || state.platform === 'both') && (
            <>
              <li>Drop the installer binary into <code>windows/src/Files/</code></li>
              <li>Replace Entra ID group IDs in <code>windows/intune/assignments.json</code></li>
            </>
          )}
          {(state.platform === 'macos' || state.platform === 'both') && (
            <>
              <li>Drop the <code>.{state.macInstallerType}</code> installer into <code>macos/src/Files/</code></li>
              <li>Replace Jamf group IDs in <code>macos/jamf/scope-inputs.json</code></li>
            </>
          )}
          <li>Push your changes and let the CI/CD pipeline run</li>
        </ol>
      </div>

      <style>{`
        .review-summary {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--space-md);
          margin-bottom: var(--space-xl);
        }
        @media (max-width: 900px) {
          .review-summary { grid-template-columns: repeat(2, 1fr); }
        }
        .summary-card {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-md);
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
        }
        .summary-card__icon { font-size: 1.5rem; }
        .summary-card__label {
          font-size: 0.7rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .summary-card__value {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .review-actions {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          margin-bottom: var(--space-xl);
        }
        .export-success {
          font-size: 0.85rem;
          color: var(--color-success);
          font-weight: 500;
        }
        .review-browser {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: var(--space-lg);
          margin-bottom: var(--space-xl);
          min-height: 400px;
        }
        @media (max-width: 900px) {
          .review-browser { grid-template-columns: 1fr; }
        }
        .review-preview {
          min-width: 0;
        }
        .review-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-muted);
          font-size: 0.9rem;
        }
        .review-next {
          padding: var(--space-lg);
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
        }
        .review-next h3 {
          font-size: 1rem;
          margin-bottom: var(--space-md);
        }
        .review-next ol {
          padding-left: var(--space-lg);
          color: var(--text-secondary);
          font-size: 0.85rem;
        }
        .review-next li {
          margin-bottom: var(--space-sm);
        }
        .review-next code {
          font-family: var(--font-mono);
          font-size: 0.8rem;
          color: var(--text-accent);
          background: var(--bg-input);
          padding: 2px 6px;
          border-radius: 3px;
        }

        /* Validation panel */
        .validation-panel {
          padding: var(--space-md) var(--space-lg);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-xl);
          border: 1px solid;
        }
        .validation-panel--ok {
          background: rgba(34, 197, 94, 0.08);
          border-color: rgba(34, 197, 94, 0.3);
        }
        .validation-panel--error {
          background: rgba(239, 68, 68, 0.08);
          border-color: rgba(239, 68, 68, 0.3);
        }
        .validation-panel__header {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          margin-bottom: var(--space-sm);
        }
        .validation-panel__icon { font-size: 1.1rem; }
        .validation-panel__title {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .validation-item {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: var(--space-sm);
          padding: 4px 0;
          font-size: 0.8rem;
        }
        .validation-item--ok .validation-item__icon { color: var(--color-success); }
        .validation-item--err .validation-item__icon { color: var(--color-error); font-weight: bold; }
        .validation-item__file {
          font-family: var(--font-mono);
          color: var(--text-secondary);
        }
        .validation-item__errors {
          width: 100%;
          margin: 4px 0 4px 24px;
          padding-left: var(--space-md);
          color: var(--color-error);
          font-size: 0.75rem;
          font-family: var(--font-mono);
        }
        .validation-item__errors li { margin-bottom: 2px; }

        /* Publish section */
        .publish-section {
          padding: var(--space-lg);
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-xl);
        }
        .publish-section__title {
          font-size: 1rem;
          margin: 0 0 4px;
        }
        .publish-section__path {
          font-size: 0.78rem;
          color: var(--text-muted);
          margin: 0 0 var(--space-md);
        }
        .publish-section__path code {
          color: var(--text-accent);
          background: var(--bg-input);
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 0.75rem;
        }
        .publish-actions {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          flex-wrap: wrap;
        }
        .publish-hint {
          font-size: 0.78rem;
          color: var(--text-muted);
        }
        .publish-hint code {
          background: var(--bg-input);
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 0.73rem;
        }
        .publish-result {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--space-sm);
          padding: 12px var(--space-md);
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
        }
        .publish-result--success {
          background: rgba(34, 197, 94, 0.08);
          border: 1px solid rgba(34, 197, 94, 0.25);
          flex-direction: column;
          align-items: flex-start;
        }
        .publish-result--error {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #ef4444;
        }
        .publish-result__header {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          color: #4ade80;
          font-size: 0.9rem;
        }
        .publish-result__icon { font-size: 1rem; }
        .publish-tag {
          font-size: 0.75rem;
          background: rgba(124, 138, 255, 0.12);
          color: #a78bfa;
          padding: 2px 8px;
          border-radius: 99px;
          margin-left: var(--space-sm);
        }
        .publish-result__links {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-sm);
          margin-top: var(--space-sm);
        }
        .publish-result__pipeline {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-top: 4px;
        }
        .publish-result__pipeline a {
          color: var(--text-accent);
          text-decoration: none;
          font-weight: 600;
        }
        .publish-result__pipeline a:hover { text-decoration: underline; }
        .publish-result__pipeline--skip {
          color: var(--text-muted);
          font-style: italic;
        }

        /* Pipeline control */
        .pipeline-control {
          width: 100%;
          margin-bottom: var(--space-md);
        }
        .pipeline-control__label {
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: var(--space-sm);
        }
        .pipeline-control__options {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .pipeline-option {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 10px 14px;
          background: var(--bg-card, rgba(255,255,255,0.03));
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all 0.15s ease;
          flex: 1;
          min-width: 130px;
        }
        .pipeline-option:hover {
          border-color: var(--text-accent, #7c8aff);
          background: rgba(124, 138, 255, 0.04);
        }
        .pipeline-option--active {
          border-color: var(--text-accent, #7c8aff);
          background: rgba(124, 138, 255, 0.08);
          box-shadow: 0 0 0 1px var(--text-accent, #7c8aff);
        }
        .pipeline-option input[type="radio"] {
          display: none;
        }
        .pipeline-option__label {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .pipeline-option__desc {
          font-size: 0.7rem;
          color: var(--text-muted);
          line-height: 1.3;
        }

        /* ── Script Editor CSS ── */
        .script-editor {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          overflow: hidden;
          margin-bottom: var(--space-md);
          background: var(--bg-elevated);
        }
        .script-editor__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-md);
          background: rgba(255,255,255,0.02);
          border-bottom: 1px solid var(--border-subtle);
          gap: var(--space-md);
        }
        .script-editor__info {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
        }
        .badge {
          display: inline-block;
          font-size: 0.72rem;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 99px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .badge--sync {
          background: rgba(59, 130, 246, 0.12);
          color: #60a5fa;
        }
        .badge--custom {
          background: rgba(245, 158, 11, 0.12);
          color: #fbbf24;
        }
        .script-editor__desc {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .textarea-editor-container {
          display: flex;
          background: rgba(8, 10, 20, 0.9);
          min-height: 450px;
          max-height: 650px;
          overflow-y: auto;
          font-family: var(--font-mono);
          font-size: 0.8rem;
          line-height: 1.7;
        }
        .line-numbers {
          display: flex;
          flex-direction: column;
          text-align: right;
          padding: var(--space-md) var(--space-sm);
          color: rgba(255,255,255,0.25);
          background: rgba(0, 0, 0, 0.2);
          border-right: 1px solid var(--border-subtle);
          user-select: none;
          min-width: 32px;
        }
        .line-numbers span {
          height: 1.7em;
        }
        .textarea-editor {
          flex: 1;
          background: transparent;
          color: var(--text-primary);
          border: none;
          resize: none;
          font-family: inherit;
          font-size: inherit;
          line-height: inherit;
          padding: var(--space-md);
          outline: none;
          white-space: pre;
          overflow-x: auto;
          tab-size: 4;
        }
      `}</style>
    </div>
  );
}
