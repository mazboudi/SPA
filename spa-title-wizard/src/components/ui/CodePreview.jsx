import { useState, useMemo, useRef, useEffect } from 'react';
import { ACTION_TYPE_MAP } from '../../config/actionTypes';

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

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}

export default function CodePreview({ code, filename, activePhase, hideHeader = false, maxHeight = '500px' }) {
  const [copied, setCopied] = useState(false);
  const lang = detectLanguage(filename || '');
  const bodyRef = useRef(null);

  const blocks = useMemo(() => {
    if (!code) return [];
    if (lang !== 'powershell') {
      return [{ type: 'normal', lines: code.split(/\r?\n/) }];
    }

    const lines = code.split(/\r?\n/);
    const parsedBlocks = [];
    let currentBlock = { type: 'normal', lines: [] };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const startMatch = line.match(/#\s*<SPA:Action\s+Data="([^"]+)"\s+Hash="([^"]+)">/);

      if (startMatch) {
        if (currentBlock.lines.length > 0) {
          parsedBlocks.push(currentBlock);
        }
        let actionObj = null;
        try {
          actionObj = JSON.parse(decodeURIComponent(startMatch[1]));
        } catch (e) {
          console.error("Failed to parse action metadata in preview:", e);
        }
        currentBlock = {
          type: 'action',
          action: actionObj,
          expectedHash: startMatch[2],
          lines: [line]
        };
      } else if (/#\s*<\/SPA:Action>/.test(line)) {
        currentBlock.lines.push(line);
        parsedBlocks.push(currentBlock);
        currentBlock = { type: 'normal', lines: [] };
      } else {
        currentBlock.lines.push(line);
      }
    }

    if (currentBlock.lines.length > 0) {
      parsedBlocks.push(currentBlock);
    }

    return parsedBlocks;
  }, [code, lang]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Smooth scroll to the active phase and pulse highlight the code block!
  useEffect(() => {
    if (!activePhase || !bodyRef.current) return;

    // Strip timestamp suffix if present
    const phaseKey = activePhase.split('_')[0];

    const phaseMarkers = {
      variableDeclaration: '## MARK: Variables',
      preInstall: '## MARK: Pre-Install',
      install: '## MARK: Install',
      postInstall: '## MARK: Post-Install',
      preUninstall: '## MARK: Pre-Uninstall',
      uninstall: '## MARK: Uninstall',
      postUninstall: '## MARK: Post-Uninstall',
      preRepair: '## MARK: Pre-Repair',
      repair: '## MARK: Repair',
      postRepair: '## MARK: Post-Repair'
    };

    const marker = phaseMarkers[phaseKey];
    if (!marker) return;

    // Find pre or code elements that contain the marker text
    const elements = bodyRef.current.querySelectorAll('.code-preview__code code');
    for (const el of elements) {
      if (el.textContent.includes(marker)) {
        const preElement = el.closest('pre');
        if (preElement) {
          const elementTop = preElement.offsetTop;
          bodyRef.current.scrollTo({
            top: Math.max(0, elementTop - 15),
            behavior: 'smooth'
          });

          // Highlight the pre tag briefly
          preElement.style.transition = 'background-color 0.25s ease, border-left-color 0.25s ease';
          preElement.style.backgroundColor = 'rgba(99, 140, 255, 0.15)';
          preElement.style.borderLeft = '3px solid var(--text-accent, #7c8aff)';
          
          setTimeout(() => {
            preElement.style.backgroundColor = '';
            preElement.style.borderLeft = '';
          }, 1500);
        }
        break;
      }
    }
  }, [activePhase, code]);

  // Set up running line counter for line-number gutters
  let runningLine = 1;

  return (
    <div className="code-preview" style={{ marginBottom: hideHeader ? 0 : 'var(--space-md)' }}>
      {!hideHeader && (
        <div className="code-preview__header">
          <span className="code-preview__filename">{filename}</span>
          <button className="btn btn-ghost code-preview__copy" onClick={handleCopy}>
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>
      )}
      <div className="code-preview__body" ref={bodyRef} style={{ maxHeight }}>
        {blocks.map((block, idx) => {
          const startLine = runningLine;
          runningLine += block.lines.length;
          const codeString = block.lines.join('\n');
          const highlighted = highlightSyntax(codeString, lang);
          const lineNumbers = Array.from({ length: block.lines.length }, (_, i) => startLine + i).join('\n');

          if (block.type === 'action') {
            const innerLines = block.lines.slice(1, -1);
            const innerCode = innerLines.join('\n');
            const isManual = block.action?.isManuallyEdited || simpleHash(innerCode) !== block.expectedHash;
            const cardName = block.action?.type ? (ACTION_TYPE_MAP[block.action.type]?.label || block.action.type) : 'Action Card';

            return (
              <div key={idx} className={`cp-block ${isManual ? 'cp-block--manual' : 'cp-block--locked'}`}>
                <div className="cp-block__header">
                  <span className="cp-block__icon">{isManual ? '🔓' : '🔒'}</span>
                  <span className="cp-block__title">
                    {isManual ? `Manual Customization: ${cardName}` : `Form-Synchronized Action: ${cardName}`}
                  </span>
                  <span className="cp-block__badge">
                    {isManual ? 'Manual Script Code' : 'Locked Form Sync'}
                  </span>
                </div>
                <div className="code-preview__row">
                  <pre className="code-preview__gutter">
                    {lineNumbers}
                  </pre>
                  <pre className="code-preview__code cp-block__code">
                    <code dangerouslySetInnerHTML={{ __html: highlighted }} />
                  </pre>
                </div>
              </div>
            );
          }

          return (
            <div key={idx} className="code-preview__row">
              <pre className="code-preview__gutter">
                {lineNumbers}
              </pre>
              <pre className="code-preview__code">
                <code dangerouslySetInnerHTML={{ __html: highlighted }} />
              </pre>
            </div>
          );
        })}
      </div>

      <style>{`
        .code-preview {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          overflow: hidden;
          background: rgba(8, 10, 20, 0.9);
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .code-preview__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-sm) var(--space-md);
          background: var(--bg-elevated);
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
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
        .code-preview__body {
          background: transparent;
          overflow-y: auto;
          padding: var(--space-sm) 0;
          flex: 1;
        }
        .code-preview__row {
          display: flex;
          font-family: var(--font-mono);
          font-size: 0.8rem;
          line-height: 1.7;
        }
        .code-preview__gutter {
          text-align: right;
          padding: 0 10px;
          margin: 0;
          color: rgba(255, 255, 255, 0.25);
          background: rgba(0, 0, 0, 0.15);
          border-right: 1px solid var(--border-subtle);
          user-select: none;
          min-width: 44px;
          font-family: inherit;
          font-size: inherit;
          line-height: inherit;
          flex-shrink: 0;
        }
        .code-preview__code {
          padding: 0 16px;
          background: transparent !important;
          overflow-x: auto;
          font-family: inherit;
          font-size: inherit;
          line-height: inherit;
          color: var(--text-primary);
          margin: 0;
          flex: 1;
          overflow-y: visible !important;
          max-height: none !important;
        }
        .cp-block {
          border-left: 3px solid;
          margin: var(--space-sm) var(--space-md);
          border-radius: var(--radius-sm);
          overflow: hidden;
          background: rgba(255, 255, 255, 0.01);
        }
        .cp-block--locked {
          border-left-color: #3b82f6;
          background: rgba(59, 130, 246, 0.02);
          border: 1px solid rgba(59, 130, 246, 0.08);
          border-left-width: 4px;
        }
        .cp-block--manual {
          border-left-color: #f59e0b;
          background: rgba(245, 158, 11, 0.02);
          border: 1px solid rgba(245, 158, 11, 0.08);
          border-left-width: 4px;
        }
        .cp-block__header {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          font-size: 0.7rem;
          font-weight: 600;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          user-select: none;
        }
        .cp-block--locked .cp-block__header {
          background: rgba(59, 130, 246, 0.05);
          color: #60a5fa;
        }
        .cp-block--manual .cp-block__header {
          background: rgba(245, 158, 11, 0.05);
          color: #fbbf24;
        }
        .cp-block__badge {
          margin-left: auto;
          font-size: 0.6rem;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 99px;
          text-transform: uppercase;
        }
        .cp-block--locked .cp-block__badge {
          background: rgba(59, 130, 246, 0.12);
          color: #60a5fa;
        }
        .cp-block--manual .cp-block__badge {
          background: rgba(245, 158, 11, 0.12);
          color: #fbbf24;
        }
        .cp-block .code-preview__gutter {
          padding-top: 6px;
          padding-bottom: 6px;
        }
        .cp-block .code-preview__code {
          padding-top: 6px;
          padding-bottom: 6px;
          padding-left: 12px;
          padding-right: 12px;
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
