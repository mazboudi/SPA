import { useState, useMemo, useEffect, useRef } from 'react';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';
import FormField from '../ui/FormField';
import DiffPreview from '../ui/DiffPreview';
import windowsOptions from '../../config/windowsOptions.json';
import { PHASE_KEYS, PHASE_META, ACTION_TYPE_MAP, getActionsForPhase, getCategoriesForPhase, createAction } from '../../config/actionTypes';
import { checkV3Compatibility } from '../../lib/psadtCompatCheck';
import generatePsadtScript from '../../lib/generatePsadtScript';
import parsePsadtBlocks from '../../lib/parsePsadtBlocks';
import CodePreview from '../ui/CodePreview';
import './windows-steps.css';

/**
 * Dedicated card for raw_ps (unparsed block) actions.
 * Shows the full PowerShell block in a resizable monospace editor with a warning badge.
 */
function formatPowerShell(code) {
  if (!code) return '';
  const lines = code.split(/\r?\n/);
  let indentLevel = 0;
  const formattedLines = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // Decrease indent level if line starts with closing brace
    if (line.startsWith('}')) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    // Generate indentation spaces
    const indent = ' '.repeat(indentLevel * 4);

    if (line) {
      formattedLines.push(indent + line);
    } else {
      formattedLines.push('');
    }

    // Adjust indent level for next line
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    indentLevel += openBraces - closeBraces;
    indentLevel = Math.max(0, indentLevel);
  }

  return formattedLines.join('\n');
}

function validateSyntax(code) {
  const errors = [];
  if (!code) return errors;

  const lines = code.split(/\r?\n/);
  const stack = [];
  let spaBlockOpen = false;
  let spaBlockLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // SPA Block Checks
    if (/#\s*<SPA:Action\b/.test(line)) {
      if (spaBlockOpen) {
        errors.push({
          line: lineNum,
          message: `Mismatched # <SPA:Action> block tag! Found start of block while another block starting at line ${spaBlockLine} is still open.`
        });
      }
      spaBlockOpen = true;
      spaBlockLine = lineNum;
    }
    if (/#\s*<\/SPA:Action>/.test(line)) {
      if (!spaBlockOpen) {
        errors.push({
          line: lineNum,
          message: `Orphaned closing tag # </SPA:Action> without a matching opening tag.`
        });
      }
      spaBlockOpen = false;
    }

    // Skip comment lines for bracket/brace linting
    if (/^\s*#/.test(line)) continue;

    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let c = 0; c < line.length; c++) {
      const char = line[c];

      // Handle quotes escaping and string state
      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        continue;
      }
      if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }

      if (inSingleQuote || inDoubleQuote) continue;

      if (char === '{') stack.push({ char, line: lineNum });
      if (char === '(') stack.push({ char, line: lineNum });
      if (char === '[') stack.push({ char, line: lineNum });

      if (char === '}') {
        const last = stack.pop();
        if (!last || last.char !== '{') {
          errors.push({ line: lineNum, message: `Mismatched closing brace '}' without a matching opening '{'.` });
        }
      }
      if (char === ')') {
        const last = stack.pop();
        if (!last || last.char !== '(') {
          errors.push({ line: lineNum, message: `Mismatched closing parenthesis ')' without a matching opening '('.` });
        }
      }
      if (char === ']') {
        const last = stack.pop();
        if (!last || last.char !== '[') {
          errors.push({ line: lineNum, message: `Mismatched closing bracket ']' without a matching opening '['.` });
        }
      }
    }
  }

  if (spaBlockOpen) {
    errors.push({
      line: spaBlockLine,
      message: `Unclosed # <SPA:Action> block. This block started at line ${spaBlockLine} and must be closed with # </SPA:Action>.`
    });
  }

  // Check remaining items in stack
  while (stack.length > 0) {
    const item = stack.pop();
    const typeName = item.char === '{' ? 'brace' : item.char === '(' ? 'parenthesis' : 'bracket';
    errors.push({
      line: item.line,
      message: `Mismatched opening ${typeName} '${item.char}' at line ${item.line} is never closed.`
    });
  }

  return errors;
}

/**
 * Dedicated card for raw_ps (unparsed block) actions.
 * Shows the full PowerShell block in a resizable monospace editor with a warning badge.
 */
function RawPsCard({ action, index, total, phaseKey, onUpdate, onRemove, onMove }) {
  const isLocked = !!action.isManuallyEdited;
  const isCardDisabled = !action.enabled;

  return (
    <div className={`action-card action-card--raw-ps ${isLocked ? 'action-card--locked' : ''} ${isCardDisabled ? 'action-card--disabled' : ''}`}>
      <div className="action-card__header">
        <span className="action-card__icon">🔷</span>
        <span className="action-card__label">Raw PowerShell Block</span>
        {isLocked ? (
          <span className="action-card__badge-locked" title="Manually modified in code mode. Form inputs are locked to preserve edits.">🔒 Manually Edited (Locked)</span>
        ) : (
          <span className="action-card__badge-warn" title="This block could not be fully parsed — verify before publishing">⚠ Needs Review</span>
        )}
        <div className="action-card__controls">
          <button className="action-btn" disabled={index === 0} onClick={() => onMove(phaseKey, index, index - 1)} title="Move up">▲</button>
          <button className="action-btn" disabled={index === total - 1} onClick={() => onMove(phaseKey, index, index + 1)} title="Move down">▼</button>
          <button 
            type="button"
            className={`action-btn action-btn--toggle ${action.enabled ? 'action-btn--active' : 'action-btn--inactive'}`} 
            onClick={() => onUpdate(phaseKey, index, { enabled: !action.enabled })} 
            title={action.enabled ? 'Disable (Exclude from Script)' : 'Enable (Include in Script)'}
          >
            {action.enabled ? '🟢 Enabled' : '🔴 Disabled'}
          </button>
          <button className="action-btn action-btn--del" onClick={() => onRemove(phaseKey, index)} title="Remove">✕</button>
        </div>
      </div>
      <div className="action-card__fields">
        {isCardDisabled && (
          <div className="action-card__disabled-msg">
            ⚠️ This action is disabled and will be skipped in script generation. Click 🔴 Disabled to re-enable.
          </div>
        )}
        <div className="action-field">
          <label className="action-field__label">Note</label>
          <input type="text" placeholder="Brief description of what this block does"
            value={action.note || ''}
            disabled={isLocked || isCardDisabled}
            readOnly={isLocked || isCardDisabled}
            onChange={e => onUpdate(phaseKey, index, { note: e.target.value })} />
        </div>
        <div className="action-field">
          <label className="action-field__label">PowerShell Script</label>
          <textarea
            rows={Math.max(4, (action.script || '').split('\n').length + 1)}
            value={action.script || ''}
            disabled={isLocked || isCardDisabled}
            readOnly={isLocked || isCardDisabled}
            onChange={e => onUpdate(phaseKey, index, { script: e.target.value })}
            style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.78rem', lineHeight: 1.5, background: (isLocked || isCardDisabled) ? 'rgba(255,255,255,0.01)' : undefined }}
            placeholder="# Raw PowerShell block"
          />
        </div>
      </div>
    </div>
  );
}

/** Inline action card — editable, deletable, reorderable */
function ActionCard({ action, index, total, phaseKey, onUpdate, onRemove, onMove }) {
  const def = ACTION_TYPE_MAP[action.type];
  const icon = def?.icon || '▪️';
  const label = def?.label || action.type;
  const isCustom = action.type === 'custom_script';
  const isRawPs = action.type === 'raw_ps';

  if (isRawPs) {
    return <RawPsCard action={action} index={index} total={total} phaseKey={phaseKey}
      onUpdate={onUpdate} onRemove={onRemove} onMove={onMove} />;
  }

  const isCardDisabled = !action.enabled;

  return (
    <div className={`action-card ${isCardDisabled ? 'action-card--disabled' : ''} ${isCustom ? 'action-card--custom' : ''}`}>
      <div className="action-card__header">
        <span className="action-card__icon">{icon}</span>
        <span className="action-card__label">{label}</span>
        {isCustom && <span className="action-card__badge-warn" title="Could not be auto-mapped to a known action type">⚠ Manual Review</span>}
        <div className="action-card__controls">
          <button className="action-btn" disabled={index === 0} onClick={() => onMove(phaseKey, index, index - 1)} title="Move up">▲</button>
          <button className="action-btn" disabled={index === total - 1} onClick={() => onMove(phaseKey, index, index + 1)} title="Move down">▼</button>
          <button 
            type="button"
            className={`action-btn action-btn--toggle ${action.enabled ? 'action-btn--active' : 'action-btn--inactive'}`} 
            onClick={() => onUpdate(phaseKey, index, { enabled: !action.enabled })} 
            title={action.enabled ? 'Disable (Exclude from Script)' : 'Enable (Include in Script)'}
          >
            {action.enabled ? '🟢 Enabled' : '🔴 Disabled'}
          </button>
          <button className="action-btn action-btn--del" onClick={() => onRemove(phaseKey, index)} title="Remove">✕</button>
        </div>
      </div>
      {def?.fields?.length > 0 && (
        <div className="action-card__fields">
          {isCardDisabled && (
            <div className="action-card__disabled-msg">
              ⚠️ This action is disabled and will be skipped in script generation. Click 🔴 Disabled to re-enable.
            </div>
          )}
          {def.fields.map(f => (
            <div key={f.key} className="action-field">
              <label className="action-field__label">{f.label}</label>
              {f.type === 'boolean' ? (
                <input type="checkbox" checked={!!action[f.key]} disabled={isCardDisabled} onChange={e => onUpdate(phaseKey, index, { [f.key]: e.target.checked })} />
              ) : f.type === 'number' ? (
                <input type="number" value={action[f.key] ?? f.default ?? 0} disabled={isCardDisabled} onChange={e => onUpdate(phaseKey, index, { [f.key]: parseInt(e.target.value) || 0 })} />
              ) : f.type === 'guids' ? (
                <textarea rows="3" placeholder="One GUID per line" value={Array.isArray(action[f.key]) ? action[f.key].join('\n') : (action[f.key] || '')} disabled={isCardDisabled} onChange={e => onUpdate(phaseKey, index, { [f.key]: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} />
              ) : f.type === 'textarea' ? (
                <textarea rows="4" placeholder={f.placeholder || ''} value={action[f.key] || ''} disabled={isCardDisabled} onChange={e => onUpdate(phaseKey, index, { [f.key]: e.target.value })} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
              ) : (
                <input type="text" placeholder={f.placeholder || ''} value={action[f.key] || ''} disabled={isCardDisabled} onChange={e => onUpdate(phaseKey, index, { [f.key]: e.target.value })} />
              )}
            </div>
          ))}
        </div>
      )}
      {action.raw && (
        <div className="action-card__raw" title="Original PowerShell command">
          <code>{action.raw}</code>
        </div>
      )}
    </div>
  );
}


/** Add action picker — dropdown grouped by category */
function AddActionPicker({ phaseKey, onAdd }) {
  const [open, setOpen] = useState(false);
  const categories = getCategoriesForPhase(phaseKey);
  const actions = getActionsForPhase(phaseKey);

  return (
    <div className="add-action">
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
  const [showScript, setShowScript] = useState(false);
  const lc = state.lifecycle;
  const isRefactor = state.wizardMode === 'refactor';

  // ── Auto-populate variableDeclaration with standard PSADT vars (new titles) ──
  useEffect(() => {
    const varPhase = lc.phases?.variableDeclaration;
    const alreadyPopulated = (varPhase?.actions || []).length > 0;
    const isEdit = state.wizardMode === 'edit';
    if (isRefactor || isEdit || alreadyPopulated) return; // refactored/edited titles already have vars

    const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const stdVarActions = [
      { name: '$appVendor',        value: state.publisher || '' },
      { name: '$appName',          value: (state.displayName || '').replace(/\s+/g, '') },
      { name: '$appVersion',       value: state.version || '' },
      { name: '$appArch',          value: '' },
      { name: '$appLang',          value: 'EN' },
      { name: '$appRevision',      value: '01' },
      { name: '$appScriptVersion', value: '1.0.0' },
      { name: '$appScriptDate',    value: today },
      { name: '$appScriptAuthor',  value: state.appOwner || 'EUC Packaging' },
    ].map(v => ({
      type: 'custom_variable',
      desc: `${v.name} = '${v.value}'`,
      name: v.name,
      value: v.value,
      enabled: true,
    }));

    // Single state update — populate the variableDeclaration phase
    updateField('lifecycle', {
      ...lc,
      phases: {
        ...lc.phases,
        variableDeclaration: { actions: stdVarActions },
      },
    });
  }, []); // run once on mount

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

  const [activeTab, setActiveTab] = useState('visual'); // 'visual' | 'script'
  const [localScript, setLocalScript] = useState('');
  const [lintErrors, setLintErrors] = useState([]);
  const lineNumbersRef = useRef(null);
  const textareaRef = useRef(null);
  const [activePhase, setActivePhase] = useState(null);

  // Wrapped local handlers that trigger scroll sync on visual changes!
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

  // Generate compiled script or load customized script
  const compiledScript = useMemo(() => {
    if (state.isCustomized) {
      return state.customScriptContent || generatePsadtScript(state);
    }
    return generatePsadtScript(state);
  }, [state]);

  // Synchronize local script with the generated script when state changes
  useEffect(() => {
    const latestScript = generatePsadtScript(state);
    
    if (!state.isCustomized) {
      // Form-Synchronized mode: always keep localScript in sync with forms
      setLocalScript(latestScript);
      setLintErrors(validateSyntax(latestScript));
    } else {
      // Customized mode: ONLY update script if the user made changes in visual/behavior tabs!
      // If they are in the script tab, the editor code is the source of truth — do NOT overwrite it!
      if (activeTab !== 'script') {
        setLocalScript(latestScript);
        setLintErrors(validateSyntax(latestScript));
        if (latestScript !== state.customScriptContent) {
          updateField('customScriptContent', latestScript);
        }
      }
    }
  }, [state, state.isCustomized, state.customScriptContent, activeTab]);

  // Smooth scroll the manual editing textarea to the active phase marker
  useEffect(() => {
    if (!activePhase || !textareaRef.current || !state.isCustomized) return;

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

    const lines = localScript.split('\n');
    const lineIndex = lines.findIndex(l => l.includes(marker));

    if (lineIndex !== -1) {
      // Line numbers and textarea have line-height: 1.7. Font size is 0.8rem (approx 12.8px).
      // Line height is approx 21.76px. Let's calculate the exact offset.
      const lineHeight = 21.76;
      textareaRef.current.scrollTo({
        top: Math.max(0, lineIndex * lineHeight - 15),
        behavior: 'smooth'
      });
    }
  }, [activePhase, state.isCustomized, localScript]);

  const handleToggleCustomize = () => {
    if (!state.isCustomized) {
      const ok = window.confirm(
        "Decouple script from visual builder?\n\nThis will allow you to edit the raw PowerShell script directly. Future changes to visual card forms will be dynamically parsed, but manually modified cards will lock visual inputs to preserve your custom code."
      );
      if (ok) {
        updateFields({
          customScriptContent: compiledScript,
          isCustomized: true
        });
        setLocalScript(compiledScript);
        setLintErrors(validateSyntax(compiledScript));
      }
    } else {
      const ok = window.confirm(
        "Reset to Form-Synchronized Mode?\n\nThis will discard ALL manual changes you made to the PowerShell script and link it back to the wizard forms. This action cannot be undone."
      );
      if (ok) {
        updateFields({
          isCustomized: false,
          customScriptContent: ''
        });
      }
    }
  };

  const handleScriptChange = (val) => {
    setLocalScript(val);
    updateField('customScriptContent', val);
    
    // Live syntax validation
    const errs = validateSyntax(val);
    setLintErrors(errs);

    try {
      // Live-parse the script blocks in the background to sync visual builder cards and locks!
      const parsed = parsePsadtBlocks(val);
      if (parsed && parsed.lifecycle) {
        updateField('lifecycle', parsed.lifecycle);
      }
    } catch (e) {
      console.error('Failed to live-parse custom script blocks:', e);
    }
  };

  const [vsCodeSyncing, setVsCodeSyncing] = useState(false);
  const [vsCodeOpening, setVsCodeOpening] = useState(false);

  const handleOpenInVsCode = async () => {
    if (!state.packageId) {
      alert('Please specify a Package ID in the Basic Info step first.');
      return;
    }
    setVsCodeOpening(true);
    try {
      const scriptName = state.psadtVersion === 'v3' ? 'Deploy-Application.ps1' : 'Invoke-AppDeployToolkit.ps1';
      const relPath = `windows/src/${scriptName}`;
      
      const res = await fetch('/api/open-vscode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: state.packageId,
          relativePath: relPath,
          content: localScript // save browser's current code to disk!
        })
      });
      const data = await res.json();
      if (data.success) {
        if (data.method === 'protocol' && data.url) {
          // Fallback url scheme redirection
          window.location.href = data.url;
        }
      } else {
        alert(`Could not open in VS Code: ${data.error || 'Unknown error'}`);
      }
    } catch (e) {
      console.error('Failed to open VS Code:', e);
      alert(`Error opening VS Code: ${e.message}`);
    } finally {
      setVsCodeOpening(false);
    }
  };

  const handleSyncFromVsCode = async () => {
    if (!state.packageId) return;
    setVsCodeSyncing(true);
    try {
      const scriptName = state.psadtVersion === 'v3' ? 'Deploy-Application.ps1' : 'Invoke-AppDeployToolkit.ps1';
      const relPath = `windows/src/${scriptName}`;
      
      const res = await fetch(`/api/read-local-file?packageId=${state.packageId}&relativePath=${relPath}`);
      if (!res.ok) {
        throw new Error(await res.text() || 'File not found locally');
      }
      const data = await res.json();
      if (data.content) {
        handleScriptChange(data.content);
        alert('📥 Successfully synchronized edits from local VS Code file!');
      }
    } catch (e) {
      console.error('Failed to sync from disk:', e);
      alert(`Could not sync from VS Code file: ${e.message}\n\nMake sure you have clicked "Open in VS Code" at least once to save the file locally first.`);
    } finally {
      setVsCodeSyncing(false);
    }
  };

  const handleFormatScript = () => {
    const formatted = formatPowerShell(localScript);
    setLocalScript(formatted);
    updateField('customScriptContent', formatted);
    setLintErrors(validateSyntax(formatted));
    try {
      const parsed = parsePsadtBlocks(formatted);
      if (parsed && parsed.lifecycle) {
        updateField('lifecycle', parsed.lifecycle);
      }
    } catch (e) {
      console.error('Failed to live-parse formatted script blocks:', e);
    }
  };

  const handleScroll = (e) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.target.scrollTop;
    }
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
          className={`psadt-tab-btn ${activeTab === 'script' ? 'psadt-tab-btn--active' : ''}`}
          onClick={() => {
            setActiveTab('script');
            if (activePhase) {
              setActivePhase(activePhase.split('_')[0] + '_' + Date.now());
            }
          }}
        >
          <span className="psadt-tab-btn__icon">📜</span>
          <span className="psadt-tab-btn__label">Live Script Developer</span>
        </button>
        {(state._scriptContent || psadtResult?.scriptContent) && (
          <button
            type="button"
            className={`psadt-tab-btn ${activeTab === 'compare' ? 'psadt-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('compare')}
          >
            <span className="psadt-tab-btn__icon">🔍</span>
            <span className="psadt-tab-btn__label">Script Comparison</span>
          </button>
        )}
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
                <SelectField label="Install Context" id="installContext" value={state.installContext}
                  onChange={v => updateField('installContext', v)}
                  options={windowsOptions.installContexts}
                />
                <FormField label="Close Apps Before Install" id="closeApps" hint="Comma-separated process names (e.g., chrome,msedge)">
                  <input id="closeApps" type="text" placeholder="chrome,msedge" value={state.closeApps || ''} onChange={e => updateField('closeApps', e.target.value)} />
                </FormField>
                <FormField label="Max Install Time (minutes)" id="maxInstallTime">
                  <input id="maxInstallTime" type="number" min="1" value={state.maxInstallTime} onChange={e => updateField('maxInstallTime', parseInt(e.target.value) || 60)} />
                </FormField>
              </div>
              <ToggleSwitch label="Allow reboot passthrough from installer" checked={state.allowRebootPassThru} onChange={v => updateField('allowRebootPassThru', v)} id="allowRebootPassThru" />
              <div style={{ marginTop: 'var(--space-md)' }}>
                <SelectField label="Repair Mode" id="lc-repairMode" value={lc.repairMode} onChange={v => updateLifecycleRoot('repairMode', v)}
                  options={[
                    { value: 'mirror', label: 'Mirror Install (default)' },
                    { value: 'custom', label: 'Custom Repair Actions' },
                  ]}
                />
              </div>
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

                {/* Diff Preview */}
                {state._scriptContent && (
                  <DiffPreview originalScript={state._scriptContent} state={state} fileName={state.psadtFileName} />
                )}
              </div>
            )}

            {/* Phase Panels */}
            <div className="config-section">
              <h3 className="section-title">
                Lifecycle Phases 
                <span className="section-optional">
                  {lc.repairMode === 'mirror' ? '7 phases active' : '10 phases active'}
                </span>
              </h3>
              {lc.repairMode === 'mirror' && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)', padding: '10px 14px', background: 'rgba(59, 130, 246, 0.04)', border: '1px solid rgba(59, 130, 246, 0.15)', borderRadius: 'var(--radius-sm)' }}>
                  💡 <strong>Repair Mode is set to Mirror Install</strong>. The 3 repair phases are automated to copy your Install phase actions and are hidden. Change Repair Mode to <strong>Custom Repair Actions</strong> to configure separate repair steps.
                </div>
              )}
              <div className="lifecycle-panels">
                {PHASE_KEYS.filter(phaseKey => {
                  if (lc.repairMode === 'mirror' && ['preRepair', 'repair', 'postRepair'].includes(phaseKey)) {
                    return false;
                  }
                  return true;
                }).map(phaseKey => {
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
                      {isExpanded && (
                        <div className="phase-body">
                          {actions.length === 0 && (
                            <p className="phase-empty">No actions configured. Add one below.</p>
                          )}
                          {actions.map((action, i) => (
                            <ActionCard key={i} action={action} index={i} total={actions.length} phaseKey={phaseKey}
                              onUpdate={handleUpdateAction} onRemove={handleRemoveAction} onMove={handleMoveAction} />
                          ))}
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

        {activeTab === 'script' && (
          <div className="psadt-workspace-tab-content script-tab animate-in">
            <div className="script-editor">
              <div className="script-editor__header">
                <div className="script-editor__info">
                  <span className={`badge ${state.isCustomized ? 'badge--custom' : 'badge--sync'}`}>
                    {state.isCustomized ? '🔓 Customized Manually' : '🔒 Form-Synchronized'}
                  </span>
                  <span className="script-editor__desc">
                    {state.isCustomized 
                      ? 'Visual actions and script are synchronized. Custom edits in blocks will lock visual inputs.' 
                      : 'Generated from form inputs. Read-only preview.'}
                  </span>
                </div>
                <div className="script-editor__actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {state.isCustomized && (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={handleOpenInVsCode}
                        disabled={vsCodeOpening}
                        title="Open this file in local VS Code"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        {vsCodeOpening ? '⏳ Opening...' : '🖥️ Open in VS Code'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={handleSyncFromVsCode}
                        disabled={vsCodeSyncing}
                        title="Sync edits from the local file on disk"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        {vsCodeSyncing ? '⏳ Syncing...' : '📥 Sync from VS Code'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={handleFormatScript}
                        title="Auto-indent and clean up PowerShell code formatting"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        🧹 Format
                      </button>
                    </>
                  )}
                  <button 
                    type="button"
                    className={`btn btn-sm ${state.isCustomized ? 'btn-secondary' : 'btn-primary'}`} 
                    onClick={handleToggleCustomize}
                  >
                    {state.isCustomized ? '🔒 Lock Sync' : '✏️ Customize'}
                  </button>
                </div>
              </div>
              
              <div className="script-editor__body">
                {state.isCustomized ? (
                  <div className="textarea-editor-container">
                    <div className="line-numbers" ref={lineNumbersRef}>
                      {localScript.split('\n').map((_, i) => (
                        <span key={i}>{i + 1}</span>
                      ))}
                    </div>
                    <textarea
                      className="textarea-editor"
                      ref={textareaRef}
                      value={localScript}
                      onChange={(e) => handleScriptChange(e.target.value)}
                      onScroll={handleScroll}
                      spellCheck="false"
                      autoFocus
                    />
                  </div>
                ) : (
                  <CodePreview
                    code={compiledScript}
                    filename="Invoke-AppDeployToolkit.ps1"
                    activePhase={activePhase}
                  />
                )}
              </div>

              {state.isCustomized && (
                <div className="linter-panel">
                  <div className="linter-panel__header">
                    <span className="linter-panel__icon">{lintErrors.length === 0 ? '✅' : '⚠️'}</span>
                    <span className="linter-panel__title">
                      {lintErrors.length === 0 ? 'PowerShell Syntax Check Passed' : `PowerShell Syntax Warnings (${lintErrors.length})`}
                    </span>
                  </div>
                  {lintErrors.length > 0 ? (
                    <ul className="linter-panel__errors">
                      {lintErrors.map((err, idx) => (
                        <li key={idx} className="linter-panel__error-item">
                          <span className="linter-panel__line">Line {err.line}:</span> {err.message}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="linter-panel__ok-msg">No syntax errors, unmatched braces, or unclosed quotes found. Ready for deployment.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === 'compare' && (
          <div className="psadt-workspace-tab-content compare-tab animate-in">
            <div className="config-section" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)' }}>
              <h3 className="section-title">🔍 Original vs. Converted Script Comparison</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
                Compare the original legacy PowerShell script with the newly compiled and structured script. Use this side-by-side view to verify successful conversion of all custom actions.
              </p>
              {compatReport && (
                <div className="compat-report-card" style={{ marginBottom: 'var(--space-md)', padding: '12px 16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
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
                  
                  {compatReport.manualFindings.length > 0 && (
                    <details style={{ marginTop: '8px' }}>
                      <summary style={{ fontSize: '0.75rem', color: 'var(--text-accent)', cursor: 'pointer', outline: 'none', userSelect: 'none' }}>
                        ▸ View {compatReport.manualFindings.length} legacy patterns to verify on visual cards
                      </summary>
                      <div style={{ marginTop: '8px', maxHeight: '200px', overflowY: 'auto', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: 'var(--radius-sm)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                              <th style={{ padding: '6px 10px', width: '50px' }}>Line</th>
                              <th style={{ padding: '6px 10px', width: '120px' }}>Section</th>
                              <th style={{ padding: '6px 10px' }}>Original Code</th>
                              <th style={{ padding: '6px 10px' }}>Verify Action / Guidance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {compatReport.manualFindings.map((f, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)' }}>
                                <td style={{ padding: '6px 10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>{f.line}</td>
                                <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{f.section}</td>
                                <td style={{ padding: '6px 10px' }}><code style={{ fontFamily: 'var(--font-mono, monospace)', background: 'rgba(0,0,0,0.2)', padding: '2px 4px', borderRadius: '3px', color: '#fb7185' }}>{f.v3}</code></td>
                                <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{f.v4}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </div>
              )}
              <div className="diff-preview__panels" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', minHeight: '550px' }}>
                <div className="diff-preview__pane" style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--bg-elevated)' }}>
                  <div className="diff-preview__pane-header" style={{ padding: 'var(--space-sm) var(--space-md)', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="diff-preview__pane-icon" style={{ fontSize: '0.9rem' }}>📄</span>
                      <span className="diff-preview__pane-label" style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.78rem' }}>Original Legacy Script</span>
                    </div>
                    <span className="diff-preview__pane-hint" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{state.psadtFileName || 'Uploaded .ps1'}</span>
                  </div>
                  <pre className="diff-preview__code" style={{ padding: 'var(--space-md)', margin: 0, fontFamily: 'var(--font-mono, monospace)', fontSize: '0.72rem', lineHeight: 1.6, color: 'var(--text-secondary)', background: 'rgba(8, 10, 20, 0.9)', overflow: 'auto', height: '500px', boxSizing: 'border-box', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {state._scriptContent || psadtResult?.scriptContent}
                  </pre>
                </div>
                <div className="diff-preview__pane" style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--bg-elevated)' }}>
                  <div className="diff-preview__pane-header" style={{ padding: 'var(--space-sm) var(--space-md)', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="diff-preview__pane-icon" style={{ fontSize: '0.9rem' }}>📋</span>
                      <span className="diff-preview__pane-label" style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.78rem' }}>Converted Structured Script</span>
                    </div>
                    <span className="diff-preview__pane-hint" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Invoke-AppDeployToolkit.ps1</span>
                  </div>
                  <pre className="diff-preview__code" style={{ padding: 'var(--space-md)', margin: 0, fontFamily: 'var(--font-mono, monospace)', fontSize: '0.72rem', lineHeight: 1.6, color: 'var(--text-secondary)', background: 'rgba(8, 10, 20, 0.9)', overflow: 'auto', height: '500px', boxSizing: 'border-box', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {localScript}
                  </pre>
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


