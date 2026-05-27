import { useState, useMemo } from 'react';
import generateScaffolding from '../../lib/generateScaffolding';

/**
 * DiffPreview — side-by-side view of the original .ps1 script
 * vs. the extracted lifecycle.yaml for verification.
 *
 * Used in refactor-convert mode to help packagers confirm
 * that nothing was lost during action extraction.
 */
export default function DiffPreview({ originalScript, state, fileName }) {
  const [open, setOpen] = useState(false);

  // Generate Invoke-AppDeployToolkit.ps1 from current state for right pane
  const generatedScript = useMemo(() => {
    try {
      const files = generateScaffolding(state);
      return files['windows/src/Invoke-AppDeployToolkit.ps1'] || '# No script generated';
    } catch {
      return '# Error generating script preview';
    }
  }, [state]);

  if (!originalScript) return null;

  return (
    <div className="diff-preview">
      <button className="link-btn diff-preview__toggle" onClick={() => setOpen(!open)}>
        {open ? '▾ Hide' : '▸ Show'} Original vs. Extracted Comparison
      </button>

      {open && (
        <div className="diff-preview__panels">
          <div className="diff-preview__pane">
            <div className="diff-preview__pane-header">
              <span className="diff-preview__pane-icon">📄</span>
              <span className="diff-preview__pane-label">Original Script</span>
              <span className="diff-preview__pane-hint">{fileName || 'uploaded .ps1'}</span>
            </div>
            <pre className="diff-preview__code">{originalScript.substring(0, 12000)}{originalScript.length > 12000 ? '\n\n... (truncated)' : ''}</pre>
          </div>
          <div className="diff-preview__pane">
            <div className="diff-preview__pane-header">
              <span className="diff-preview__pane-icon">📋</span>
              <span className="diff-preview__pane-label">Generated Script</span>
              <span className="diff-preview__pane-hint">windows/src/Invoke-AppDeployToolkit.ps1</span>
            </div>
            <pre className="diff-preview__code">{generatedScript}</pre>
          </div>
        </div>
      )}

      <style>{`
        .diff-preview {
          margin-top: var(--space-md);
        }
        .diff-preview__toggle {
          font-size: 0.82rem;
          color: var(--text-accent);
          cursor: pointer;
          padding: var(--space-xs, 4px) 0;
        }
        .diff-preview__panels {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-md);
          margin-top: var(--space-md);
          max-height: 500px;
        }
        @media (max-width: 900px) {
          .diff-preview__panels {
            grid-template-columns: 1fr;
            max-height: none;
          }
        }
        .diff-preview__pane {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          overflow: hidden;
          min-height: 200px;
        }
        .diff-preview__pane-header {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
          background: var(--bg-elevated);
          border-bottom: 1px solid var(--border-subtle);
          font-size: 0.78rem;
        }
        .diff-preview__pane-icon {
          font-size: 0.9rem;
        }
        .diff-preview__pane-label {
          font-weight: 600;
          color: var(--text-primary);
        }
        .diff-preview__pane-hint {
          color: var(--text-muted);
          margin-left: auto;
          font-size: 0.72rem;
        }
        .diff-preview__code {
          flex: 1;
          overflow: auto;
          padding: var(--space-md);
          margin: 0;
          font-family: var(--font-mono, 'Fira Code', 'Consolas', monospace);
          font-size: 0.72rem;
          line-height: 1.6;
          color: var(--text-secondary);
          background: var(--bg-input, rgba(0,0,0,0.2));
          white-space: pre-wrap;
          word-break: break-all;
          max-height: 460px;
        }
      `}</style>
    </div>
  );
}
