import { useState } from 'react';

function highlightSyntax(code, language) {
  if (language === 'json') {
    return code
      .replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, '<span class="cp-key">$1</span>$2')
      .replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span class="cp-str">$1</span>')
      .replace(/:\s*(true|false|null)/g, ': <span class="cp-bool">$1</span>')
      .replace(/:\s*(-?\d+\.?\d*)/g, ': <span class="cp-num">$1</span>');
  }
  if (language === 'yaml') {
    return code
      .replace(/^(\s*#.*)$/gm, '<span class="cp-comment">$1</span>')
      .replace(/^(\s*[\w_-]+)(:)/gm, '<span class="cp-key">$1</span>$2')
      .replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span class="cp-str">$1</span>')
      .replace(/:\s*(true|false)/g, ': <span class="cp-bool">$1</span>');
  }
  if (language === 'bash' || language === 'sh') {
    return code
      .replace(/^(\s*#.*)$/gm, '<span class="cp-comment">$1</span>')
      .replace(/(echo|exit|if|then|else|fi|set)\b/g, '<span class="cp-kw">$1</span>')
      .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="cp-str">$1</span>');
  }
  if (language === 'hcl' || language === 'tf') {
    return code
      .replace(/^(\s*#.*)$/gm, '<span class="cp-comment">$1</span>')
      .replace(/(terraform|provider|module|variable|output|resource)\b/g, '<span class="cp-kw">$1</span>')
      .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="cp-str">$1</span>');
  }
  return code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function detectLanguage(filename) {
  if (filename.endsWith('.json')) return 'json';
  if (filename.endsWith('.yaml') || filename.endsWith('.yml')) return 'yaml';
  if (filename.endsWith('.sh') || filename === 'preinstall' || filename === 'postinstall') return 'bash';
  if (filename.endsWith('.tf')) return 'hcl';
  if (filename.endsWith('.ps1')) return 'powershell';
  return 'text';
}

export default function CodePreview({ code, filename }) {
  const [copied, setCopied] = useState(false);
  const lang = detectLanguage(filename || '');
  const highlighted = highlightSyntax(code, lang);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-preview">
      <div className="code-preview__header">
        <span className="code-preview__filename">{filename}</span>
        <button className="btn btn-ghost code-preview__copy" onClick={handleCopy}>
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>
      <pre className="code-preview__code">
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>

      <style>{`
        .code-preview {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          overflow: hidden;
          margin-bottom: var(--space-md);
        }
        .code-preview__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-sm) var(--space-md);
          background: var(--bg-elevated);
          border-bottom: 1px solid var(--border-subtle);
        }
        .code-preview__filename {
          font-family: var(--font-mono);
          font-size: 0.8rem;
          color: var(--text-accent);
        }
        .code-preview__copy {
          padding: 4px 10px;
          font-size: 0.75rem;
        }
        .code-preview__code {
          padding: var(--space-md);
          background: rgba(8, 10, 20, 0.9);
          overflow-x: auto;
          font-family: var(--font-mono);
          font-size: 0.8rem;
          line-height: 1.7;
          color: var(--text-primary);
          margin: 0;
          max-height: 500px;
          overflow-y: auto;
        }
        .cp-key { color: #93c5fd; }
        .cp-str { color: #86efac; }
        .cp-bool { color: #c4b5fd; }
        .cp-num { color: #fbbf24; }
        .cp-comment { color: var(--text-muted); font-style: italic; }
        .cp-kw { color: #c4b5fd; font-weight: 500; }
      `}</style>
    </div>
  );
}
