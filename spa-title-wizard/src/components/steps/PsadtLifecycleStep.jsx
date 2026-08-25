import React, { useState, useMemo, useEffect, useRef } from 'react';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';
import FormField from '../ui/FormField';
// DiffPreview removed
import windowsOptions from '../../config/windowsOptions.json';
import { PHASE_KEYS, PHASE_META, ACTION_TYPE_MAP, getActionsForPhase, getCategoriesForPhase, createAction } from '../../config/actionTypes';
import { checkV3Compatibility } from '../../lib/psadtCompatCheck';
import generatePsadtScript, { generateActionCmd } from '../../lib/generatePsadtScript';
import parsePsadtBlocks from '../../lib/parsePsadtBlocks';
import CodePreview from '../ui/CodePreview';
import Editor, { DiffEditor } from '@monaco-editor/react';
import './windows-steps.css';
import SnippetPicker from '../ui/SnippetPicker';

/**
 * Dedicated card for raw_ps (unparsed block) actions.
 * Shows the full PowerShell block in a resizable monospace editor with a warning badge.
 */
// Functions formatPowerShell and validateSyntax removed - editing is offloaded to VS Code

/**
 * Dedicated card for raw_ps (unparsed block) actions.
 * Shows the full PowerShell block in a resizable monospace editor with a warning badge.
 */
/**
 * Drag-and-drop list wrapper for action cards.
 * Uses native HTML5 DnD — no external library.
 * Calls onMove(phaseKey, fromIndex, toIndex) on a successful drop.
 */
function DraggableActionList({ phaseKey, actions, onMove, children }) {
  const dragSrc = useRef(null);       // index being dragged
  const [dragOver, setDragOver] = useState(null); // index currently hovered

  const handleDragStart = (e, index) => {
    dragSrc.current = index;
    e.dataTransfer.effectAllowed = 'move';
    // Tiny delay so the browser snapshot doesn't show the :active state
    setTimeout(() => e.target.closest('.action-card')?.classList.add('action-card--dragging'), 0);
  };

  const handleDragEnd = (e) => {
    e.target.closest('.action-card')?.classList.remove('action-card--dragging');
    setDragOver(null);
    dragSrc.current = null;
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(index);
  };

  const handleDrop = (e, toIndex) => {
    e.preventDefault();
    setDragOver(null);
    if (dragSrc.current === null || dragSrc.current === toIndex) return;
    onMove(phaseKey, dragSrc.current, toIndex);
    dragSrc.current = null;
  };

  const handleDragLeave = (e) => {
    // Only clear if leaving the list container entirely
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null);
  };

  return (
    <div className="draggable-list" onDragLeave={handleDragLeave}>
      {React.Children.map(children, (child, i) =>
        child ? React.cloneElement(child, {
          isDragOver: dragOver === i,
          onDragStart: (e) => handleDragStart(e, i),
          onDragEnd: handleDragEnd,
          onDragOver: (e) => handleDragOver(e, i),
          onDrop: (e) => handleDrop(e, i),
        }) : null
      )}
    </div>
  );
}

function RawPsCard({ action, index, total, phaseKey, onUpdate, onRemove, onMove, forceExpand,
  isDragOver, onDragStart, onDragEnd, onDragOver, onDrop }) {
  const [expanded, setExpanded] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const editorRef = useRef(null);

  // Sync with parent "Expand All" / "Collapse All" toggle
  useEffect(() => {
    if (forceExpand !== undefined) setExpanded(forceExpand);
  }, [forceExpand]);

  const handleEditorMount = (editor) => {
    editorRef.current = editor;
  };

  const execCommand = (cmd) => {
    if (editorRef.current) {
      if (cmd === 'format') {
        editorRef.current.getAction('editor.action.formatDocument')?.run();
      } else {
        editorRef.current.trigger('keyboard', cmd, null);
      }
    }
  };

  const isLocked = !!action.isManuallyEdited;
  const isCardDisabled = !action.enabled;
  const isCardCommented = action.enabled && !!action.commented;

  // Cycle: Active (enabled, !commented) → Commented (enabled, commented) → Disabled (!enabled) → Active
  const cycleCommentState = () => {
    if (action.enabled && !action.commented) onUpdate(phaseKey, index, { enabled: true, commented: true });
    else if (action.commented) onUpdate(phaseKey, index, { enabled: false, commented: false });
    else onUpdate(phaseKey, index, { enabled: true, commented: false });
  };
  const toggleIcon = isCardCommented ? '💬' : action.enabled ? '🟢' : '🔴';
  const toggleClass = isCardCommented ? 'action-btn--commented' : action.enabled ? 'action-btn--active' : 'action-btn--inactive';
  const toggleTitle = isCardCommented ? 'Commented — click to Disable' : action.enabled ? 'Active — click to Comment Out' : 'Disabled — click to Activate';

  // Build a meaningful collapsed preview from the actual script content:
  // Skip comment-only lines and grab up to 2 real executable lines.
  const scriptLines = (action.script || '').split('\n');
  const totalLines = scriptLines.length;
  const execLines = scriptLines
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && !l.startsWith('<#') && l !== '{' && l !== '}');
  const previewText = execLines.slice(0, 2).join('  ·  ') || (action.note || '');
  const preview = previewText.length > 120 ? previewText.substring(0, 117) + '…' : previewText;
  const linesBadge = totalLines > 1 ? `${totalLines} lines` : '';

  return (
    <div
      className={`action-card action-card--raw-ps ${isLocked ? 'action-card--locked' : ''} ${isCardDisabled ? 'action-card--disabled' : ''} ${isCardCommented ? 'action-card--commented' : ''} ${isDragOver ? 'action-card--drop-target' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="action-card__header" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
        <span className="action-card__drag-handle" title="Drag to reorder" onMouseDown={e => e.stopPropagation()}>⠿</span>
        <span className="action-card__chevron">{expanded ? '▾' : '▸'}</span>
        <span className="action-card__icon">🔷</span>
        <span className="action-card__label">Raw PowerShell Block</span>
        {!expanded && (
          <span className="action-card__preview raw-ps-preview">
            {preview && <code style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', opacity: 0.9 }}>{preview}</code>}
            {linesBadge && <span className="raw-ps-lines-badge">{linesBadge}</span>}
          </span>
        )}
        {isLocked ? (
          <span className="action-card__badge-locked" title="Manually modified in code mode. Form inputs are locked to preserve edits.">🔒 Locked</span>
        ) : (
          <span className="action-card__badge-warn" title="This block could not be fully parsed — verify before publishing">⚠ Review</span>
        )}
        {isCardCommented && <span className="action-card__badge-commented" title="This action is commented out — code is in the script but inactive">💬 Commented</span>}
        <div className="action-card__controls" onClick={e => e.stopPropagation()}>
          <button className="action-btn" disabled={index === 0} onClick={() => onMove(phaseKey, index, index - 1)} title="Move up">▲</button>
          <button className="action-btn" disabled={index === total - 1} onClick={() => onMove(phaseKey, index, index + 1)} title="Move down">▼</button>
          <button
            type="button"
            className={`action-btn action-btn--toggle ${toggleClass}`}
            onClick={cycleCommentState}
            title={toggleTitle}
          >
            {toggleIcon}
          </button>
          <button className="action-btn action-btn--del" onClick={() => onRemove(phaseKey, index)} title="Remove">✕</button>
        </div>
      </div>
      {expanded && (
        <div className="action-card__fields--single-col">
          {isCardDisabled && (
            <div className="action-card__disabled-msg">
              ⚠️ This action is disabled and will be skipped in script generation. Click 🔴 Disabled to re-enable.
            </div>
          )}
          {isCardCommented && (
            <div className="action-card__commented-msg">
              💬 This action is commented out — the code is included in the script prefixed with <code>#</code> but will not execute. Click 💬 Commented to disable or cycle back to active.
            </div>
          )}
          {action.note && (
            <div className="action-field">
              <label className="action-field__label">Description</label>
              <input type="text" placeholder="Brief description of what this block does"
                value={action.note || ''}
                disabled={isLocked || isCardDisabled}
                readOnly={isLocked || isCardDisabled}
                onChange={e => onUpdate(phaseKey, index, { note: e.target.value })} />
            </div>
          )}
          <div className="action-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label className="action-field__label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                PowerShell Script
                <span style={{ fontWeight: 400, fontSize: '0.72rem', opacity: 0.55 }}>{totalLines} lines · included verbatim in generated script</span>
              </label>
              <button
                type="button"
                onClick={() => setShowToolbar(!showToolbar)}
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 6px', fontSize: '0.7rem', color: 'var(--text-secondary)', cursor: 'pointer' }}
                title="Toggle Editor Toolbar"
              >
                {showToolbar ? 'Hide Tools' : 'Show Tools'}
              </button>
            </div>

            {showToolbar && (
              <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '4px' }}>
                <button type="button" onClick={() => execCommand('undo')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '3px', padding: '3px 8px', fontSize: '0.75rem', color: '#fff', cursor: 'pointer' }} title="Undo (Ctrl+Z)">↩️ Undo</button>
                <button type="button" onClick={() => execCommand('redo')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '3px', padding: '3px 8px', fontSize: '0.75rem', color: '#fff', cursor: 'pointer' }} title="Redo (Ctrl+Y)">↪️ Redo</button>
                <button type="button" onClick={() => execCommand('actions.find')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '3px', padding: '3px 8px', fontSize: '0.75rem', color: '#fff', cursor: 'pointer', marginLeft: 'auto' }} title="Find (Ctrl+F)">🔍 Find</button>
                <button type="button" onClick={() => execCommand('format')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '3px', padding: '3px 8px', fontSize: '0.75rem', color: '#fff', cursor: 'pointer' }} title="Format Document">🧹 Format</button>
              </div>
            )}

            <div style={{ height: Math.min(Math.max(totalLines * 21, 120), 250) + 'px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', overflow: 'hidden' }}>
              <Editor
                height="100%"
                language="powershell"
                theme="vs-dark"
                value={action.script || ''}
                options={{ readOnly: isLocked || isCardDisabled, minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 13 }}
                onMount={handleEditorMount}
                onChange={value => onUpdate(phaseKey, index, { script: value || '' })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Expandable v4 command preview — green text, truncated with ＋/－ toggle */
function CmdPreview({ cmd }) {
  const [open, setOpen] = useState(false);
  if (!cmd) return null;
  return (
    <div className={`cmd-preview ${open ? 'cmd-preview--open' : ''}`} title="Generated v4 command">
      <button type="button" className="cmd-preview__toggle" onClick={() => setOpen(!open)}>
        {open ? '－' : '＋'}
      </button>
      <code className="cmd-preview__code">{cmd}</code>
    </div>
  );
}

/** Inline action card — editable, deletable, reorderable */
function ActionCard({ action, index, total, phaseKey, onUpdate, onRemove, onMove, forceExpand, installerCtx,
  isDragOver, onDragStart, onDragEnd, onDragOver, onDrop }) {
  // Resolve the file path for the CmdPreview — applies the same subfolder prefix
  // that generatePsadtScript uses so builder and output stay in sync.
  function resolvePreviewFilePath(file) {
    if (!file || !installerCtx?.installerSubfolder) return file;
    const sub = installerCtx.installerSubfolder.replace(/^[/\\]+|[/\\]+$/g, '').replace(/\//g, '\\');
    if (!sub) return file;
    const primary = installerCtx.installerType === 'msi'
      ? (installerCtx.msiFileName || installerCtx.installerSourceFile || '')
      : (installerCtx.exeSourceFilename || installerCtx.installerSourceFile || '');
    if (file === primary || file === primary.split(/[\\/]/).pop()) {
      return `"$($adtSession.DirFiles)\\${sub}\\${file}"`;
    }
    return file;
  }

  /** Same quoting logic as filePathParam() in generatePsadtScript.js */
  function filePathPreviewParam(resolved) {
    if (!resolved) return '';
    if (resolved.startsWith('"')) return ` -FilePath ${resolved}`;
    return ` -FilePath '${resolved}'`;
  }

  const [expanded, setExpanded] = useState(false);

  // Sync with parent "Expand All" / "Collapse All" toggle
  useEffect(() => {
    if (forceExpand !== undefined) setExpanded(forceExpand);
  }, [forceExpand]);

  const def = ACTION_TYPE_MAP[action.type];
  const icon = def?.icon || '▪️';
  const label = def?.label || action.type;
  const isCustom = action.type === 'custom_script';
  const isRawPs = action.type === 'raw_ps';
  const isCustomVar = action.type === 'custom_variable';

  const [snippetPickerOpen, setSnippetPickerOpen] = useState(false);
  const monacoEditorRef = useRef(null);

  const handleSnippetInsert = (code) => {
    const editor = monacoEditorRef.current;
    if (editor) {
      // Option B: insert at the current cursor position
      const position = editor.getPosition();
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      };
      // Prefix with a blank line if the cursor is not at the start of the document
      const model = editor.getModel();
      const isAtStart = position.lineNumber === 1 && position.column === 1;
      const prefix = (!isAtStart && model && model.getValueInRange({
        startLineNumber: 1, startColumn: 1,
        endLineNumber: position.lineNumber, endColumn: position.column,
      }).trim()) ? '\n\n' : '';
      editor.executeEdits('snippet-picker', [{ range, text: prefix + code, forceMoveMarkers: true }]);
      editor.focus();
    } else {
      // Fallback: append to end of existing code
      const existing = action.code || '';
      const sep = existing && !existing.endsWith('\n') ? '\n\n' : (existing ? '\n' : '');
      handleFieldUpdate(phaseKey, index, { code: existing + sep + code });
    }
    setSnippetPickerOpen(false);
  };

  // Wrap onUpdate: when a custom_variable's 'value' field is edited by the user,
  // set _userEdited so deriveState() won't overwrite it with the source field value.
  const handleFieldUpdate = (pk, idx, updates) => {
    if (isCustomVar && updates.hasOwnProperty('value')) {
      onUpdate(pk, idx, { ...updates, _userEdited: true });
    } else {
      onUpdate(pk, idx, updates);
    }
  };

  if (isRawPs) {
    return <RawPsCard action={action} index={index} total={total} phaseKey={phaseKey}
      onUpdate={onUpdate} onRemove={onRemove} onMove={onMove} forceExpand={forceExpand} />;
  }

  // Read-only system-managed variable — render as locked non-editable card
  if (action.readOnly || action.systemManaged) {
    return <ReadOnlyVarCard action={action} index={index} />;
  }

  const isCardDisabled = !action.enabled;
  const isCardCommented = action.enabled && !!action.commented;

  // Cycle: Active → Commented → Disabled → Active
  const cycleCommentState = () => {
    if (action.enabled && !action.commented) onUpdate(phaseKey, index, { enabled: true, commented: true });
    else if (action.commented) onUpdate(phaseKey, index, { enabled: false, commented: false });
    else onUpdate(phaseKey, index, { enabled: true, commented: false });
  };
  const toggleIcon = isCardCommented ? '💬' : action.enabled ? '🟢' : '🔴';
  const toggleClass = isCardCommented ? 'action-btn--commented' : action.enabled ? 'action-btn--active' : 'action-btn--inactive';
  const toggleTitle = isCardCommented ? 'Commented — click to Disable' : action.enabled ? 'Active — click to Comment Out' : 'Disabled — click to Activate';

  // Build a brief preview string shown when the card is collapsed
  let preview = '';
  if (isCustomVar) {
    // Show the variable exactly as it appears in the generated script.
    // ALL variable declaration entries are $adtSession hashtable keys, so we
    // always render: $adtSession.Key = 'value'
    const rawName = action.name || '';
    // Strip any existing prefix ($adtSession. or leading $) to get the bare key
    const cleanKey = rawName.replace(/^\$adtSession\./i, '').replace(/^\$/, '') || rawName;
    const displayKey = `$adtSession.${cleanKey}`;
    const val = action.value || '';
    // In $adtSession, values are always quoted strings UNLESS they are:
    //   - a PowerShell array:      @(0), @(1641, 3010)
    //   - a PS boolean/expression: $true, $false, $null, $MyInvocation...
    const isUnquoted = val.startsWith('@(') || val.startsWith('$');
    const displayVal = isUnquoted ? val : `'${val}'`;
    preview = `${displayKey} = ${displayVal}`;
    if (preview.length > 70) preview = preview.substring(0, 68) + '…';
  } else if (def?.fields) {
    for (const f of def.fields) {
      const v = action[f.key];
      if (v && typeof v === 'string' && v.trim()) {
        preview = v.trim().substring(0, 60);
        break;
      }
    }
  }


  return (
    <div
      className={`action-card ${isCardDisabled ? 'action-card--disabled' : ''} ${isCardCommented ? 'action-card--commented' : ''} ${isCustom ? 'action-card--custom' : ''} ${isDragOver ? 'action-card--drop-target' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="action-card__header" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
        <span className="action-card__drag-handle" title="Drag to reorder" onMouseDown={e => e.stopPropagation()}>⠿</span>
        <span className="action-card__chevron">{expanded ? '▾' : '▸'}</span>
        <span className="action-card__icon">{icon}</span>
        <span className="action-card__label">{label}</span>
        {!expanded && preview && <span className="action-card__preview">{preview}</span>}
        {isCustom && <span className="action-card__badge-warn" title="Could not be auto-mapped to a known action type">⚠ Manual Review</span>}
        {isCardCommented && <span className="action-card__badge-commented" title="Code is in the script but commented out">💬 Commented</span>}
        <div className="action-card__controls" onClick={e => e.stopPropagation()}>
          <button className="action-btn" disabled={index === 0} onClick={() => onMove(phaseKey, index, index - 1)} title="Move up">▲</button>
          <button className="action-btn" disabled={index === total - 1} onClick={() => onMove(phaseKey, index, index + 1)} title="Move down">▼</button>
          <button
            type="button"
            className={`action-btn action-btn--toggle ${toggleClass}`}
            onClick={cycleCommentState}
            title={toggleTitle}
          >
            {toggleIcon}
          </button>
          <button className="action-btn action-btn--del" onClick={() => onRemove(phaseKey, index)} title="Remove">✕</button>
        </div>
      </div>
      {expanded && (
        <>
          {def?.fields?.length > 0 && (
            <div className={`action-card__fields ${isCustom || action.type === 'raw_ps' ? 'action-card__fields--single-col' : ''}`}>
              {isCardDisabled && (
                <div className="action-card__disabled-msg">
                  ⚠️ This action is disabled and will be skipped in script generation. Click 🔴 Disabled to re-enable.
                </div>
              )}
              {isCardCommented && (
                <div className="action-card__commented-msg">
                  💬 This action is commented out — code is preserved in the script with <code>#</code> prefix but will not execute. Click 💬 Commented to continue cycling.
                </div>
              )}
              {def.fields.map(f => (
                <div key={f.key} className="action-field">
                  <label className="action-field__label">{f.label}</label>
                  {f.type === 'boolean' ? (
                    <input type="checkbox" checked={!!action[f.key]} disabled={isCardDisabled} onChange={e => handleFieldUpdate(phaseKey, index, { [f.key]: e.target.checked })} />
                  ) : f.type === 'number' ? (
                    <input type="number" value={action[f.key] ?? f.default ?? 0} disabled={isCardDisabled} onChange={e => handleFieldUpdate(phaseKey, index, { [f.key]: parseInt(e.target.value) || 0 })} />
                  ) : f.type === 'guids' ? (
                    <textarea rows="3" placeholder="One GUID per line" value={Array.isArray(action[f.key]) ? action[f.key].join('\n') : (action[f.key] || '')} disabled={isCardDisabled} onChange={e => handleFieldUpdate(phaseKey, index, { [f.key]: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} />
                  ) : f.type === 'textarea' ? (
                    <div style={{ height: '250px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', overflow: 'hidden' }}>
                      <Editor
                        height="100%"
                        language="powershell"
                        theme="vs-dark"
                        value={action[f.key] || ''}
                        options={{ readOnly: isCardDisabled, minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 13 }}
                        onChange={value => handleFieldUpdate(phaseKey, index, { [f.key]: value || '' })}
                        onMount={isCustom && f.key === 'code' ? (editor) => { monacoEditorRef.current = editor; } : undefined}
                      />
                    </div>
                  ) : f.type === 'select' && f.options ? (
                    <select value={action[f.key] || f.default || ''} disabled={isCardDisabled} onChange={e => handleFieldUpdate(phaseKey, index, { [f.key]: e.target.value })}>
                      {f.options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : isCustomVar && f.key === 'name' ? (() => {
                    // For custom_variable name: strip $adtSession. prefix and leading $
                    // so users see just the hashtable key (e.g. "AppSuccessExitCodes").
                    // The generator uses getCleanVarName() which strips these prefixes anyway.
                    const displayName = (action.name || '')
                      .replace(/^\$adtSession\./i, '')
                      .replace(/^\$/, '');
                    return (
                      <input
                        type="text"
                        placeholder={f.placeholder || 'MyCustomKey'}
                        value={displayName}
                        disabled={isCardDisabled}
                        onChange={e => handleFieldUpdate(phaseKey, index, { name: e.target.value })}
                      />
                    );
                  })() : (
                    <input type="text" placeholder={f.placeholder || ''} value={action[f.key] || ''} disabled={isCardDisabled} onChange={e => handleFieldUpdate(phaseKey, index, { [f.key]: e.target.value })} />
                  )}
                  {f.hint && <span className="action-field__hint">{f.hint}</span>}
                </div>
              ))}
            </div>
          )}
          {isCustom && !isCardDisabled && (
            <div style={{ padding: '0 0 4px' }}>
              {!snippetPickerOpen ? (
                <button
                  className="snippet-insert-trigger"
                  onClick={() => setSnippetPickerOpen(true)}
                  title="Browse and insert a PowerShell snippet"
                >
                  ⚡ Insert Snippet
                </button>
              ) : (
                <SnippetPicker
                  onInsert={handleSnippetInsert}
                  onClose={() => setSnippetPickerOpen(false)}
                />
              )}
            </div>
          )}
          {(() => {
            const pathCtx = {
              resolveFilePath: resolvePreviewFilePath,
              filePathParam: filePathPreviewParam,
              phase: phaseKey
            };
            const rawLines = generateActionCmd(action, pathCtx);
            let v4Cmd = rawLines.join('\n');

            if (!v4Cmd && action.raw) {
              v4Cmd = action.raw;
            }
            return v4Cmd ? (
              <CmdPreview cmd={v4Cmd} />
            ) : null;
          })()}
        </>
      )}
    </div>
  );
}

/** Dedicated card for system-managed read-only variable actions.
 * Shows the variable name & value in a compact, non-editable row.
 */
function ReadOnlyVarCard({ action, index }) {
  // Build consistent $adtSession.Key = value preview
  const rawName = action.name || '';
  const cleanKey = rawName.replace(/^\$adtSession\./i, '').replace(/^\$/, '') || rawName;
  const val = action.value || '';
  const isUnquoted = val.startsWith('@(') || val.startsWith('$');
  const displayVal = isUnquoted ? val : `'${val}'`;
  const preview = `$adtSession.${cleanKey} = ${displayVal}`;

  return (
    <div className="action-card action-card--readonly">
      <div className="action-card__header">
        <span className="action-card__icon">🔒</span>
        <span className="action-card__label">System Variable</span>
        <span className="action-card__preview">{preview}</span>
        <span className="action-card__badge-readonly" title="This variable is auto-managed by the PSADT framework. It cannot be edited or removed.">🔒 System</span>
      </div>
    </div>
  );
}

/** Add action picker — dropdown grouped by category */
function AddActionPicker({ phaseKey, onAdd }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const categories = getCategoriesForPhase(phaseKey);
  const actions = getActionsForPhase(phaseKey);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div className="add-action" ref={containerRef}>
      <button className="add-action__btn" onClick={() => setOpen(!open)}>＋ Add Action</button>
      {open && (
        <div className="add-action__dropdown">
          {categories.map(cat => (
            <div key={cat} className="add-action__group">
              <span className="add-action__cat">{cat}</span>
              {actions.filter(a => a.category === cat).map(a => (
                <button key={a.type} className="add-action__item" onClick={() => { onAdd(phaseKey, createAction(a.type)); setOpen(false); }}>
                  <span>{a.icon}</span> {a.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PsadtLifecycleStep({ state, updateField, updateFields, addAction, removeAction, updateAction, moveAction, updateLifecycleRoot, psadtResult }) {
  const [expandedPhases, setExpandedPhases] = useState({});
  const [expandAllCards, setExpandAllCards] = useState({}); // { [phaseKey]: boolean } — expand all action cards in a phase
  const [showScript, setShowScript] = useState(false);
  const lc = state.lifecycle;
  const isRefactor = state.wizardMode === 'refactor';

  // NOTE: All lifecycle seeding (variables, install/uninstall, welcome/progress)
  // is now handled atomically in seedDefaultLifecycleActions() (useWizardState.js)
  // when navigating to the PSADT step. No component-level seed effects needed.


  // Compute compatibility report for converted v3 scripts
  const compatReport = useMemo(() => {
    const origScript = state._scriptContent || psadtResult?.scriptContent;
    const isV3 = state.psadtVersion === 'v3' || psadtResult?.psadtVersion === 'v3';
    if (isRefactor && origScript && isV3) {
      return checkV3Compatibility(origScript);
    }
    return null;
  }, [isRefactor, state._scriptContent, psadtResult, state.psadtVersion]);





  // ── Refactor Mode: CONVERT — compute conversion stats + per-phase warnings ──
  const conversionStats = (isRefactor && state.refactorConvert) ? (() => {
    const phases = lc.phases || {};
    let totalActions = 0;
    let customScriptCount = 0;
    let rawPsCount = 0;
    let populatedPhases = 0;
    const phaseWarnings = {}; // phaseKey → { rawPs, custom, total }
    for (const [phaseKey, phaseData] of Object.entries(phases)) {
      const actions = (phaseData.actions || []).filter(a => a.enabled !== false);
      if (actions.length > 0) populatedPhases++;
      totalActions += actions.length;
      const raw = actions.filter(a => a.type === 'raw_ps').length;
      const custom = actions.filter(a => a.type === 'custom_script').length;
      customScriptCount += custom;
      rawPsCount += raw;
      if (raw + custom > 0) phaseWarnings[phaseKey] = { rawPs: raw, custom, total: raw + custom };
    }
    return { totalActions, customScriptCount, rawPsCount, populatedPhases, phaseWarnings };
  })() : null;

  // Auto-expand phases that contain warnings after conversion
  useEffect(() => {
    if (!conversionStats?.phaseWarnings) return;
    const toExpand = {};
    for (const phaseKey of Object.keys(conversionStats.phaseWarnings)) {
      toExpand[phaseKey] = true;
    }
    if (Object.keys(toExpand).length > 0) {
      setExpandedPhases(prev => ({ ...prev, ...toExpand }));
    }
  }, [!!conversionStats]); // run once when conversion stats are first available

  const activeTab = state._psadtActiveTab || 'behavior';
  const setActiveTab = (tab) => updateFields({ _psadtActiveTab: tab });
  const [compareView, setCompareView] = useState('side-by-side'); // 'original' | 'converted' | 'side-by-side' | 'stacked' | 'report'
  const isPristine = state.pristineScripts !== false;

  const hasLegacyScript = useMemo(() => {
    return state.wizardMode === 'refactor' && !!(state._scriptContent || psadtResult?.scriptContent);
  }, [state._scriptContent, psadtResult, state.wizardMode]);

  const [activePhase, setActivePhase] = useState(null);
  const [vsCodeOpening, setVsCodeOpening] = useState(false);
  const [copiedText, setCopiedText] = useState(null);

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedText(key);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Wrapped local handlers
  const handleAddAction = (phaseKey, action) => {
    addAction(phaseKey, action);
    setActivePhase(phaseKey + '_' + Date.now());
  };
  const handleUpdateAction = (phaseKey, index, updates) => {
    updateAction(phaseKey, index, updates);
    setActivePhase(phaseKey + '_' + Date.now());
  };
  const handleRemoveAction = (phaseKey, index) => {
    removeAction(phaseKey, index);
    setActivePhase(phaseKey + '_' + Date.now());
  };
  const handleMoveAction = (phaseKey, fromIndex, toIndex) => {
    moveAction(phaseKey, fromIndex, toIndex);
    setActivePhase(phaseKey + '_' + Date.now());
  };

  // Generate compiled script
  const compiledScript = useMemo(() => {
    return generatePsadtScript(state);
  }, [state]);

  const activeScript = compiledScript;

  const lifecycleRef = useRef(state.lifecycle);
  useEffect(() => {
    lifecycleRef.current = state.lifecycle;
  }, [state.lifecycle]);

  // Output script filename is always the v4 standard name (v3 scripts are always converted)
  const resolvedScriptName = 'Invoke-AppDeployToolkit.ps1';

  // ── Normalize & flush: single source of truth for builder state ──────
  // When a script is imported (refactor/convert) or loaded (edit), the initial
  // parse extracts values from the ORIGINAL script. We immediately normalize
  // the builder state by generating the canonical V4.1 output and parsing it
  // back — so the builder always displays the converted script, never the raw
  // original. This is the same path VS Code sync uses, unifying both entry points.
  const scaffoldFlushedRef = useRef(false);
  useEffect(() => {
    if (scaffoldFlushedRef.current) return;
    if (!state.packageId || !compiledScript) return;
    if (state.wizardMode !== 'refactor' && state.wizardMode !== 'edit') return;

    scaffoldFlushedRef.current = true;

    // ── Normalize lifecycle through the generated output (refactor only) ──
    // For refactor mode: re-parse the generated script to get canonical V4.1 values.
    // For edit mode: skip normalization — the snapshot/parsed lifecycle is authoritative.
    if (state.wizardMode === 'refactor') {
      const scriptForNormalization = generatePsadtScript(state, { clean: false });
      const normalized = parsePsadtBlocks(scriptForNormalization);
      const currentStr = JSON.stringify(lifecycleRef.current);
      const normalizedStr = JSON.stringify(normalized.lifecycle);
      if (currentStr !== normalizedStr) {
        console.log('🔄 Normalize: replacing raw-parsed lifecycle with generated V4.1 output');
        updateFields({ lifecycle: normalized.lifecycle });
      }
    }

  }, [state.packageId, state.wizardMode, compiledScript]);

  // Handle manual eject (copy to clipboard instead of VS Code)
  const handleCopyScript = () => {
    navigator.clipboard.writeText(generatePsadtScript(state, { clean: true }));
    setCopiedText('full-script');
    setTimeout(() => setCopiedText(null), 2000);
  };

  // ── Full interactive lifecycle editor (New Title + Refactor Convert) ──
  return (
    <div className="step-content animate-in">
      <div className="step-header">
        <h2>⚡ {conversionStats ? 'PSADT — Converted from Script' : 'PSADT Actions'}</h2>
        <p>{conversionStats
          ? 'Actions extracted from your uploaded script. Review, edit, reorder, or remove actions below.'
          : 'Configure the PowerShell App Deploy Toolkit actions executed during install, uninstall, and repair.'
        }</p>
      </div>

      {/* Premium Tab Selector */}
      <div className="psadt-tab-bar">
        <button
          type="button"
          className={`psadt-tab-btn ${activeTab === 'behavior' ? 'psadt-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('behavior')}
        >
          <span className="psadt-tab-btn__icon">⚙️</span>
          <span className="psadt-tab-btn__label">Deploy Behavior</span>
        </button>
        <button
          type="button"
          className={`psadt-tab-btn ${activeTab === 'visual' ? 'psadt-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('visual')}
        >
          <span className="psadt-tab-btn__icon">🛠️</span>
          <span className="psadt-tab-btn__label">Visual Action Builder</span>
        </button>
        <button
          type="button"
          className={`psadt-tab-btn ${activeTab === 'compare' ? 'psadt-tab-btn--active' : ''}`}
          onClick={() => {
            setActiveTab('compare');
            if (activePhase) {
              setActivePhase(activePhase.split('_')[0] + '_' + Date.now());
            }
          }}
        >
          <span className="psadt-tab-btn__icon">🔍</span>
          <span className="psadt-tab-btn__label">
            {hasLegacyScript ? 'Script Comparison' : 'Script Viewer'}
          </span>
        </button>
        <button
          type="button"
          className={`psadt-tab-btn ${activeTab === 'testing' ? 'psadt-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('testing')}
        >
          <span className="psadt-tab-btn__icon">⚡</span>
          <span className="psadt-tab-btn__label">Testing Guide</span>
        </button>
      </div>

      <div className="psadt-workspace-tabs">
        {activeTab === 'behavior' && (
          <div className="psadt-workspace-tab-content behavior-tab animate-in">
            {/* Deploy Mode & Behavior */}
            <div className="config-section">
              <h3 className="section-title">PSADT Deploy Mode & Behavior</h3>
              <div className="form-grid">
                <SelectField label="Deploy Mode" id="deployMode" value={state.deployMode}
                  hint="Controls how the PSADT wrapper executes. Silent = no UI, NonInteractive = progress bar only."
                  onChange={v => updateField('deployMode', v)}
                  options={windowsOptions.deployModes}
                />


              </div>
              <ToggleSwitch label="Allow reboot passthrough from installer" checked={state.allowRebootPassThru} onChange={v => updateField('allowRebootPassThru', v)} id="allowRebootPassThru" />
            </div>
          </div>
        )}

        {activeTab === 'visual' && (
          <div className="psadt-workspace-tab-content visual-tab animate-in">
            {/* Conversion stats banner (refactor-convert mode only) */}
            {conversionStats && (
              <div className="config-section">
                <div className="refactor-banner refactor-banner--v4">
                  <span className="refactor-banner__badge">CONVERTED</span>
                  <div className="refactor-banner__text">
                    <strong>Extracted {conversionStats.totalActions} action{conversionStats.totalActions !== 1 ? 's' : ''}</strong> across {conversionStats.populatedPhases} phase{conversionStats.populatedPhases !== 1 ? 's' : ''}.
                    {(conversionStats.customScriptCount > 0 || conversionStats.rawPsCount > 0) && (
                      <>
                        {conversionStats.rawPsCount > 0 && (
                          <> <span style={{ color: 'var(--color-warning, #f59e0b)' }}>🔷 {conversionStats.rawPsCount} raw block{conversionStats.rawPsCount !== 1 ? 's' : ''}</span> preserved as-is — look for the "Needs Review" badge.</>
                        )}
                        {conversionStats.customScriptCount > 0 && (
                          <> <span style={{ color: 'var(--color-warning, #f59e0b)' }}>⚠️ {conversionStats.customScriptCount} unmatched line{conversionStats.customScriptCount !== 1 ? 's' : ''}</span> could not be auto-mapped.</>
                        )}
                      </>
                    )}
                    {conversionStats.customScriptCount === 0 && conversionStats.rawPsCount === 0 && (
                      <> All actions mapped to known types — ready to configure.</>
                    )}
                  </div>
                </div>

                {/* Diff Preview removed */}
              </div>
            )}

            {/* 4.0→4.1 Upgrade Guidance Warnings */}
            {isRefactor && psadtResult?.warnings?.length > 0 && (
              <div className="config-section" style={{ marginBottom: 0 }}>
                <div style={{
                  fontSize: '0.78rem',
                  background: 'rgba(245, 158, 11, 0.06)',
                  border: '1px solid rgba(245, 158, 11, 0.15)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <span>🔄</span>
                    <strong style={{ color: 'var(--text-primary)' }}>Conversion Notes</strong>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {psadtResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Phase Panels */}
            <div className="config-section">
              <h3 className="section-title">
                Lifecycle Phases
                <span className="section-optional">
                  {PHASE_KEYS.length} phases active
                </span>
              </h3>
              <div className="lifecycle-panels">
                {PHASE_KEYS.map(phaseKey => {
                  const meta = PHASE_META[phaseKey];
                  const phaseData = lc.phases?.[phaseKey] || { actions: [] };
                  const actions = phaseData.actions || [];
                  const isExpanded = expandedPhases[phaseKey];
                  const togglePhase = () => {
                    const nextExpanded = !isExpanded;
                    setExpandedPhases(prev => ({ ...prev, [phaseKey]: nextExpanded }));
                    if (nextExpanded) {
                      setActivePhase(phaseKey + '_' + Date.now());
                    }
                  };
                  const warn = conversionStats?.phaseWarnings?.[phaseKey];

                  return (
                    <div key={phaseKey} className={`lifecycle-phase ${isExpanded ? 'lifecycle-phase--open' : ''} ${warn ? 'lifecycle-phase--warn' : ''}`}>
                      <button type="button" className={`phase-header ${warn ? 'phase-header--warn' : ''}`} onClick={togglePhase}>
                        <span className="phase-header__icon">{meta.icon}</span>
                        <span className="phase-header__label">{meta.label}</span>
                        {actions.length > 0 && (
                          <span className="phase-header__badge">{actions.length} action{actions.length !== 1 ? 's' : ''}</span>
                        )}
                        {warn && (
                          <span className="phase-header__warn-pill" title={`${warn.rawPs > 0 ? `${warn.rawPs} raw block${warn.rawPs !== 1 ? 's' : ''}` : ''}${warn.rawPs > 0 && warn.custom > 0 ? ', ' : ''}${warn.custom > 0 ? `${warn.custom} unmatched` : ''} — needs review`}>
                            {warn.rawPs > 0 && <span>🔷 {warn.rawPs}</span>}
                            {warn.custom > 0 && <span>⚠️ {warn.custom}</span>}
                            <span className="phase-header__warn-label">Review</span>
                          </span>
                        )}
                        <span className="phase-header__chevron">{isExpanded ? '▾' : '▸'}</span>
                      </button>
                      {isExpanded && actions.length > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 12px 0' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            style={{ fontSize: '0.68rem' }}
                            onClick={() => setExpandAllCards(prev => ({ ...prev, [phaseKey]: !prev[phaseKey] }))}
                          >
                            {expandAllCards[phaseKey] ? '▾ Collapse All' : '▸ Expand All'}
                          </button>
                        </div>
                      )}
                      {isExpanded && (
                        <div className="phase-body">
                          {actions.length === 0 && (
                            <p className="phase-empty">No actions configured. Add one below.</p>
                          )}
                          <DraggableActionList phaseKey={phaseKey} actions={actions} onMove={handleMoveAction}>
                            {actions.map((action, i) => (
                              <ActionCard key={`${phaseKey}-${i}-${action.type}`} action={action} index={i} total={actions.length} phaseKey={phaseKey}
                                onUpdate={handleUpdateAction} onRemove={handleRemoveAction} onMove={handleMoveAction}
                                forceExpand={expandAllCards[phaseKey]}
                                installerCtx={{
                                  installerSubfolder: state.installerSubfolder,
                                  installerType: state.installerType,
                                  msiFileName: state.msiFileName,
                                  exeSourceFilename: state.exeSourceFilename,
                                  installerSourceFile: state.installerSourceFile,
                                }} />
                            ))}
                          </DraggableActionList>
                          <AddActionPicker phaseKey={phaseKey} onAdd={handleAddAction} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'compare' && (
          <div className="psadt-workspace-tab-content compare-tab animate-in">
            <div className="config-section" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                padding: 'var(--space-md)',
                margin: 'calc(var(--space-md) * -1) calc(var(--space-md) * -1) 16px calc(var(--space-md) * -1)',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                position: 'sticky',
                top: '97px', /* 56px (TopBar) + ~41px (TabBar) */
                zIndex: 15,
                backgroundColor: 'var(--bg-elevated)',
                borderTopLeftRadius: 'var(--radius-md)',
                borderTopRightRadius: 'var(--radius-md)'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: '300px' }}>
                  <h3 className="section-title" style={{ margin: 0 }}>
                    {hasLegacyScript ? '🔍 Original vs. Converted Script Comparison' : '📜 Generated PowerShell Script'}
                  </h3>
                  {!hasLegacyScript && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, marginTop: '4px' }}>
                      View the generated PowerShell script. Customize it in VS Code to make manual edits.
                    </p>
                  )}
                </div>

                {/* Unified Toolbar containing VS Code Actions, Badges, Layout Selector, and Pristine Code Toggle */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Layout Selector (only visible if there is a legacy script) */}
                  {hasLegacyScript && (
                    <div className="layout-selector" style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', overflow: 'hidden', background: 'rgba(255,255,255,0.03)', padding: '2px', flexWrap: 'wrap' }}>
                      {[
                        { id: 'side-by-side', label: '♊ Side-by-Side Diff' },
                        { id: 'stacked', label: '☰ Inline Diff' },
                        { id: 'original', label: '📜 Original Full' },
                        { id: 'converted', label: '✨ Converted Full' },
                        { id: 'report', label: '📋 Report' }
                      ].map(view => (
                        <button
                          key={view.id}
                          type="button"
                          className={`btn-layout ${compareView === view.id ? 'btn-layout--active' : ''}`}
                          style={{
                            background: compareView === view.id ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                            color: compareView === view.id ? '#60a5fa' : 'var(--text-muted)',
                            border: 'none',
                            padding: '4px 12px',
                            borderRadius: '14px',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            fontWeight: 600,
                            transition: 'all 0.2s ease',
                            outline: 'none'
                          }}
                          onClick={() => setCompareView(view.id)}
                        >
                          {view.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Pristine Code Toggle */}
                  <div className="pristine-toggle" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: '500', color: isPristine ? '#60a5fa' : 'var(--text-muted)', userSelect: 'none' }}>
                      ✨ Pristine Code
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isPristine}
                      onClick={() => updateField('pristineScripts', !isPristine)}
                      style={{
                        position: 'relative',
                        display: 'inline-block',
                        width: '32px',
                        height: '18px',
                        margin: 0,
                        cursor: 'pointer',
                        background: isPristine ? '#3b82f6' : '#4b5563',
                        border: 'none',
                        borderRadius: '18px',
                        transition: 'background-color 0.3s ease',
                        outline: 'none',
                        padding: 0
                      }}
                    >
                      <span style={{
                        position: 'absolute',
                        height: '12px',
                        width: '12px',
                        left: isPristine ? '16px' : '4px',
                        bottom: '3px',
                        backgroundColor: 'white',
                        transition: 'left 0.3s ease',
                        borderRadius: '50%',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                      }}></span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Render Selected View */}
              {hasLegacyScript && compareView === 'report' && compatReport && (
                <div className="compat-report-card" style={{ marginTop: 'var(--space-md)', padding: '12px 16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.1rem' }}>{compatReport.summary.manualReview > 0 ? '⚠️' : '✅'}</span>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {compatReport.summary.manualReview > 0
                          ? `Modernization Report: ${compatReport.summary.manualReview} items require verification`
                          : 'Modernization Report: All actions successfully converted to standard v4 structure!'}
                      </strong>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {compatReport.summary.autoResolved} parameters/variables auto-migrated
                    </span>
                  </div>

                  {compatReport.summary.manualReview > 0 && (
                    <div style={{ fontSize: '0.72rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.15)', borderRadius: '4px', padding: '6px 10px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>💡</span>
                      <span>Line numbers in the report correspond to the <strong>Original Legacy Script</strong>. Use them to locate exact legacy context before conversion.</span>
                    </div>
                  )}

                  {compatReport.manualFindings.length > 0 && (
                    <div style={{ marginTop: '8px', maxHeight: '400px', overflowY: 'auto', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: 'var(--radius-sm)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                            <th style={{ padding: '8px 10px', fontWeight: 600 }}>Line</th>
                            <th style={{ padding: '8px 10px', fontWeight: 600 }}>Section</th>
                            <th style={{ padding: '8px 10px', fontWeight: 600 }}>Original Syntax (v3)</th>
                            <th style={{ padding: '8px 10px', fontWeight: 600 }}>Converted Action (v4)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {compatReport.manualFindings.map((f, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                              <td style={{ padding: '6px 10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>{f.line}</td>
                              <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{f.section}</td>
                              <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: 'var(--font-mono, monospace)', background: 'rgba(0,0,0,0.2)', padding: '2px 4px', borderRadius: '3px', color: '#fb7185' }}>{f.v3}</code></td>
                              <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{f.v4}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Display view based on legacy script presence and layout choice */}
              {(compareView === 'converted' || !hasLegacyScript) ? (
                <div style={{ height: 'calc(100vh - 250px)', minHeight: '400px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', overflow: 'hidden' }}>
                  <Editor
                    height="100%"
                    language="powershell"
                    theme="vs-dark"
                    value={activeScript || ''}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 13,
                      scrollBeyondLastLine: false,
                      wordWrap: 'on'
                    }}
                  />
                </div>
              ) : compareView === 'original' ? (
                <div style={{ height: 'calc(100vh - 250px)', minHeight: '400px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', overflow: 'hidden' }}>
                  <Editor
                    height="100%"
                    language="powershell"
                    theme="vs-dark"
                    value={state._scriptContent || psadtResult?.scriptContent || ''}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 13,
                      scrollBeyondLastLine: false,
                      wordWrap: 'on'
                    }}
                  />
                </div>
              ) : (
                <div style={{ height: 'calc(100vh - 250px)', minHeight: '400px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', overflow: 'hidden' }}>
                  <DiffEditor
                    height="100%"
                    language="powershell"
                    theme="vs-dark"
                    original={state._scriptContent || psadtResult?.scriptContent || ''}
                    modified={activeScript || ''}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      renderSideBySide: compareView === 'side-by-side',
                      fontSize: 13,
                      scrollBeyondLastLine: false,
                      wordWrap: 'on'
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'testing' && (
          <div className="psadt-workspace-tab-content testing-tab animate-in">
            <div className="config-section" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-md)' }}>
                <span style={{ fontSize: '1.4rem' }}>⚡</span>
                <div>
                  <h3 className="section-title" style={{ margin: 0 }}>
                    Local SYSTEM Testing & Debugging (Sysinternals PsExec)
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                    Enterprise deployment tools (like Intune or SCCM) execute software installations under the <strong>Local SYSTEM Account</strong>. To verify your PSADT v4 script before publishing, test it in the exact same environment.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', marginTop: 'var(--space-lg)' }}>

                <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-md)' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Step 1: Download & Extract PsExec</h4>
                  <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Run this clean PowerShell command on your Windows test system to download Sysinternals PSTools automatically:</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <code style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', color: '#a7f3d0', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                      {`Invoke-WebRequest -Uri "https://download.sysinternals.com/files/PSTools.zip" -OutFile "$env:TEMP\\PSTools.zip"; Expand-Archive -Path "$env:TEMP\\PSTools.zip" -DestinationPath "$env:ProgramFiles\\PSTools" -Force`}
                    </code>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '6px 12px', fontSize: '0.72rem', flexShrink: 0 }}
                      onClick={() => copyToClipboard(`Invoke-WebRequest -Uri "https://download.sysinternals.com/files/PSTools.zip" -OutFile "$env:TEMP\\PSTools.zip"; Expand-Archive -Path "$env:TEMP\\PSTools.zip" -DestinationPath "$env:ProgramFiles\\PSTools" -Force`, 'dl-pstools')}
                    >
                      {copiedText === 'dl-pstools' ? '✓ Copied' : '📋 Copy'}
                    </button>
                  </div>
                </div>

                <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-md)' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Step 2: Copy Package Files</h4>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.5 }}>
                    Copy your entire local package directory (containing the <code>Files</code>, <code>SupportFiles</code>, and <code>Invoke-AppDeployToolkit.ps1</code>) to a folder on your Windows test system (e.g., <code>C:\\SPA_Test</code>).
                  </p>
                </div>

                <div>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Step 3: Run PSADT under SYSTEM Context</h4>
                  <p style={{ margin: '0 0 12px 0', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Open an <strong>Elevated Command Prompt (Run as Administrator)</strong> on your Windows machine, navigate to your PSTools folder or ensure psexec is in your PATH, and run one of the following commands:</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', marginTop: 'var(--space-md)' }}>
                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontWeight: 600, color: '#60a5fa', marginBottom: '6px', fontSize: '0.8rem' }}>🟢 Test Install Phase (Interactive, full UI progress bar visible):</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <code style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', color: '#93c5fd', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                          {`psexec.exe -i -s powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\SPA_Test\\Invoke-AppDeployToolkit.ps1" -DeploymentType Install -DeployMode Interactive`}
                        </code>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '6px 12px', fontSize: '0.72rem', flexShrink: 0 }}
                          onClick={() => copyToClipboard(`psexec.exe -i -s powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\SPA_Test\\Invoke-AppDeployToolkit.ps1" -DeploymentType Install -DeployMode Interactive`, 'run-install')}
                        >
                          {copiedText === 'run-install' ? '✓ Copied' : '📋 Copy'}
                        </button>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontWeight: 600, color: '#f87171', marginBottom: '6px', fontSize: '0.8rem' }}>🔴 Test Uninstall Phase (Interactive, full UI progress bar visible):</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <code style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', color: '#93c5fd', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                          {`psexec.exe -i -s powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\SPA_Test\\Invoke-AppDeployToolkit.ps1" -DeploymentType Uninstall -DeployMode Interactive`}
                        </code>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '6px 12px', fontSize: '0.72rem', flexShrink: 0 }}
                          onClick={() => copyToClipboard(`psexec.exe -i -s powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\SPA_Test\\Invoke-AppDeployToolkit.ps1" -DeploymentType Uninstall -DeployMode Interactive`, 'run-uninstall')}
                        >
                          {copiedText === 'run-uninstall' ? '✓ Copied' : '📋 Copy'}
                        </button>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontWeight: 600, color: '#fbbf24', marginBottom: '6px', fontSize: '0.8rem' }}>🔧 Test Repair Phase (Interactive, full UI progress bar visible):</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <code style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', color: '#93c5fd', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                          {`psexec.exe -i -s powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\SPA_Test\\Invoke-AppDeployToolkit.ps1" -DeploymentType Repair -DeployMode Interactive`}
                        </code>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '6px 12px', fontSize: '0.72rem', flexShrink: 0 }}
                          onClick={() => copyToClipboard(`psexec.exe -i -s powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\SPA_Test\\Invoke-AppDeployToolkit.ps1" -DeploymentType Repair -DeployMode Interactive`, 'run-repair')}
                        >
                          {copiedText === 'run-repair' ? '✓ Copied' : '📋 Copy'}
                        </button>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', fontSize: '0.8rem' }}>🤫 Test Fully Silent Deployment (Production/Intune simulation, no UI):</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <code style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', color: '#93c5fd', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                          {`psexec.exe -s powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\SPA_Test\\Invoke-AppDeployToolkit.ps1" -DeploymentType Install -DeployMode Silent`}
                        </code>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '6px 12px', fontSize: '0.72rem', flexShrink: 0 }}
                          onClick={() => copyToClipboard(`psexec.exe -s powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\SPA_Test\\Invoke-AppDeployToolkit.ps1" -DeploymentType Install -DeployMode Silent`, 'run-silent')}
                        >
                          {copiedText === 'run-silent' ? '✓ Copied' : '📋 Copy'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .psadt-workspace-tabs {
          width: 100%;
        }
        .psadt-workspace-tab-content {
          width: 100%;
        }

        /* Script editor inside side panel */
        .script-editor {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          overflow: hidden;
          background: var(--bg-elevated);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
          transition: width 0.1s ease;
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
          height: 500px;
          overflow: hidden;
          font-family: var(--font-mono);
          font-size: 0.8rem;
          line-height: 1.7;
        }
        .line-numbers {
          text-align: right;
          padding: var(--space-md) var(--space-sm);
          color: rgba(255,255,255,0.25);
          background: rgba(0, 0, 0, 0.2);
          border-right: 1px solid var(--border-subtle);
          user-select: none;
          min-width: 32px;
          overflow: hidden;
          height: 100%;
          box-sizing: border-box;
        }
        .line-numbers span {
          display: block;
          line-height: inherit;
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
          overflow-y: auto;
          overflow-x: auto;
          height: 100%;
          tab-size: 4;
        }

        /* Enabled/Disabled card states */
        .action-card--disabled {
          opacity: 0.65;
          background: rgba(20, 20, 30, 0.4);
          border-left: 3px dashed var(--text-muted);
        }
        .action-card__disabled-msg {
          grid-column: 1 / -1;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: var(--radius-sm);
          color: #f87171;
          font-size: 0.72rem;
          padding: 6px 10px;
          margin-bottom: 4px;
          line-height: 1.4;
        }
        .action-btn--active {
          background: rgba(34, 197, 94, 0.12) !important;
          color: #4ade80 !important;
          border-color: rgba(34, 197, 94, 0.25) !important;
        }
        .action-btn--inactive {
          background: rgba(239, 68, 68, 0.12) !important;
          color: #f87171 !important;
          border-color: rgba(239, 68, 68, 0.25) !important;
        }

        /* ── Drag-and-Drop ── */
        .draggable-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .action-card__drag-handle {
          cursor: grab;
          font-size: 1rem;
          color: var(--text-muted);
          padding: 0 4px 0 0;
          flex-shrink: 0;
          line-height: 1;
          user-select: none;
          transition: color 0.15s;
        }
        .action-card__drag-handle:hover {
          color: var(--text-accent);
        }
        .action-card__drag-handle:active {
          cursor: grabbing;
        }
        .action-card--dragging {
          opacity: 0.4;
          border-style: dashed !important;
        }
        .action-card--drop-target {
          border-color: var(--text-accent) !important;
          box-shadow: 0 0 0 2px rgba(99, 179, 237, 0.25) !important;
          transform: translateY(-1px);
        }

        /* PSADT Linter & Validation panel */
        .linter-panel {
          border-top: 1px solid var(--border-subtle);
          background: rgba(8, 10, 20, 0.95);
          padding: var(--space-md);
        }
        .linter-panel__header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        .linter-panel__icon {
          font-size: 0.9rem;
        }
        .linter-panel__title {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .linter-panel__errors {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 120px;
          overflow-y: auto;
        }
        .linter-panel__error-item {
          font-family: var(--font-mono);
          font-size: 0.72rem;
          color: #f87171;
        }
        .linter-panel__line {
          font-weight: 700;
          color: #fca5a5;
          margin-right: 4px;
        }
        .linter-panel__ok-msg {
          font-size: 0.72rem;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}


