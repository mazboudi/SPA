import { useState, useMemo } from 'react';
import generateScaffolding from '../../lib/generateScaffolding';
import { downloadAsZip, exportToFolder } from '../../lib/downloadZip';
import FileTreePreview from '../FileTreePreview';
import CodePreview from '../ui/CodePreview';

export default function ReviewStep({ state }) {
  const files = useMemo(() => generateScaffolding(state), [state]);
  const filePaths = Object.keys(files).sort();
  const [selectedFile, setSelectedFile] = useState(filePaths[0] || '');
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState('');

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
        <button className="btn btn-primary" onClick={handleDownloadZip} disabled={exporting}>
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
        <h3>📋 Next Steps</h3>
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
          <li>Create the GitLab project and push the scaffolding</li>
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
      `}</style>
    </div>
  );
}
