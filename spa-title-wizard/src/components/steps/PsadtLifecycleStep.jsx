import React, { useState, useMemo, useEffect, useRef } from 'react';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';
import FormField from '../ui/FormField';
// DiffPreview removed
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

  // Sync with parent "Expand All" / "Collapse All" toggle
  useEffect(() => {
    if (forceExpand !== undefined) setExpanded(forceExpand);
  }, [forceExpand]);

  const isLocked = !!action.isManuallyEdited;
  const isCardDisabled = !action.enabled;
  const preview = (action.note || action.script || '').split('\n')[0].substring(0, 60);

  return (
    <div
      className={`action-card action-card--raw-ps ${isLocked ? 'action-card--locked' : ''} ${isCardDisabled ? 'action-card--disabled' : ''} ${isDragOver ? 'action-card--drop-target' : ''}`}
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
        {!expanded && preview && <span className="action-card__preview">{preview}</span>}
        {isLocked ? (
          <span className="action-card__badge-locked" title="Manually modified in code mode. Form inputs are locked to preserve edits.">🔒 Locked</span>
        ) : (
          <span className="action-card__badge-warn" title="This block could not be fully parsed — verify before publishing">⚠ Review</span>
        )}
        <div className="action-card__controls" onClick={e => e.stopPropagation()}>
          <button className="action-btn" disabled={index === 0} onClick={() => onMove(phaseKey, index, index - 1)} title="Move up">▲</button>
          <button className="action-btn" disabled={index === total - 1} onClick={() => onMove(phaseKey, index, index + 1)} title="Move down">▼</button>
          <button
            type="button"
            className={`action-btn action-btn--toggle ${action.enabled ? 'action-btn--active' : 'action-btn--inactive'}`}
            onClick={() => onUpdate(phaseKey, index, { enabled: !action.enabled })}
            title={action.enabled ? 'Disable (Exclude from Script)' : 'Enable (Include in Script)'}
          >
            {action.enabled ? '🟢' : '🔴'}
          </button>
          <button className="action-btn action-btn--del" onClick={() => onRemove(phaseKey, index)} title="Remove">✕</button>
        </div>
      </div>
      {expanded && (
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

  // Build a brief preview string from the first non-empty field value
  let preview = '';
  if (def?.fields) {
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
      className={`action-card ${isCardDisabled ? 'action-card--disabled' : ''} ${isCustom ? 'action-card--custom' : ''} ${isDragOver ? 'action-card--drop-target' : ''}`}
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
        <div className="action-card__controls" onClick={e => e.stopPropagation()}>
          <button className="action-btn" disabled={index === 0} onClick={() => onMove(phaseKey, index, index - 1)} title="Move up">▲</button>
          <button className="action-btn" disabled={index === total - 1} onClick={() => onMove(phaseKey, index, index + 1)} title="Move down">▼</button>
          <button
            type="button"
            className={`action-btn action-btn--toggle ${action.enabled ? 'action-btn--active' : 'action-btn--inactive'}`}
            onClick={() => onUpdate(phaseKey, index, { enabled: !action.enabled })}
            title={action.enabled ? 'Disable (Exclude from Script)' : 'Enable (Include in Script)'}
          >
            {action.enabled ? '🟢' : '🔴'}
          </button>
          <button className="action-btn action-btn--del" onClick={() => onRemove(phaseKey, index)} title="Remove">✕</button>
        </div>
      </div>
      {expanded && (
        <>
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
                    <input type="checkbox" checked={!!action[f.key]} disabled={isCardDisabled} onChange={e => handleFieldUpdate(phaseKey, index, { [f.key]: e.target.checked })} />
                  ) : f.type === 'number' ? (
                    <input type="number" value={action[f.key] ?? f.default ?? 0} disabled={isCardDisabled} onChange={e => handleFieldUpdate(phaseKey, index, { [f.key]: parseInt(e.target.value) || 0 })} />
                  ) : f.type === 'guids' ? (
                    <textarea rows="3" placeholder="One GUID per line" value={Array.isArray(action[f.key]) ? action[f.key].join('\n') : (action[f.key] || '')} disabled={isCardDisabled} onChange={e => handleFieldUpdate(phaseKey, index, { [f.key]: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} />
                  ) : f.type === 'textarea' ? (
                    <textarea rows="4" placeholder={f.placeholder || ''} value={action[f.key] || ''} disabled={isCardDisabled} onChange={e => handleFieldUpdate(phaseKey, index, { [f.key]: e.target.value })} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
                  ) : f.type === 'select' && f.options ? (
                    <select value={action[f.key] || f.default || ''} disabled={isCardDisabled} onChange={e => handleFieldUpdate(phaseKey, index, { [f.key]: e.target.value })}>
                      {f.options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" placeholder={f.placeholder || ''} value={action[f.key] || ''} disabled={isCardDisabled} onChange={e => handleFieldUpdate(phaseKey, index, { [f.key]: e.target.value })} />
                  )}
                </div>
              ))}
            </div>
          )}
          {(() => {
            let v4Cmd = '';
            switch (action.type) {
              case 'start_process': {
                const resolvedFile = resolvePreviewFilePath(action.file);
                const fp = filePathPreviewParam(resolvedFile);
                const a = action.args ? ` -ArgumentList '${action.args}'` : '';
                const win = action.windowStyle && action.windowStyle !== 'Normal' ? ` -WindowStyle '${action.windowStyle}'` : '';
                const sc = action.successExitCodes ? ` -SuccessExitCodes ${action.successExitCodes}` : '';
                const rc = action.rebootExitCodes ? ` -RebootExitCodes ${action.rebootExitCodes}` : '';
                const pt = action.passThru ? ' -PassThru' : '';
                let cmd = `Start-ADTProcess${fp}${a}${win}${sc}${rc}${pt}`;
                if (action.passThru && action.passThruVar) cmd = `$${action.passThruVar.replace(/^\$/, '')} = ${cmd}`;
                v4Cmd = cmd;
                break;
              }
              case 'start_msi_process': {
                const msiAction = action.action || 'Install';
                const resolvedFile = resolvePreviewFilePath(action.file);
                const fp = filePathPreviewParam(resolvedFile);
                const pc = action.productCode ? ` -ProductCode '${action.productCode}'` : '';
                const a = action.args ? ` -ArgumentList '${action.args}'` : '';
                const t = action.transform ? ` -Transforms '${action.transform}'` : '';
                const addl = action.additionalArgs ? ` -AdditionalArgumentList '${action.additionalArgs}'` : '';
                const p = action.patches ? ` -Patches '${action.patches}'` : '';
                const log = action.logName ? ` -LogName '${action.logName}'` : '';
                const sc = action.successExitCodes ? ` -SuccessExitCodes ${action.successExitCodes}` : '';
                const rc = action.rebootExitCodes ? ` -RebootExitCodes ${action.rebootExitCodes}` : '';
                const pt = action.passThru ? ' -PassThru' : '';
                let cmd = `Start-ADTMsiProcess -Action '${msiAction}'${fp}${pc}${a}${t}${addl}${p}${log}${sc}${rc}${pt}`;
                if (action.passThru && action.passThruVar) cmd = `$${action.passThruVar.replace(/^\$/, '')} = ${cmd}`;
                v4Cmd = cmd;
                break;
              }
              case 'uninstall_application': {
                const name = action.name ? ` -Name '${action.name}'` : '';
                const nameMatch = action.nameMatch && action.nameMatch !== 'Contains' ? ` -NameMatch '${action.nameMatch}'` : '';
                const pc = action.productCode ? ` -ProductCode '${action.productCode}'` : '';
                const appType = action.applicationType && action.applicationType !== 'All' ? ` -ApplicationType '${action.applicationType}'` : '';
                const filter = action.filterScript ? ` -FilterScript ${action.filterScript}` : '';
                const args = action.args ? ` -ArgumentList '${action.args}'` : '';
                const addlArgs = action.additionalArgs ? ` -AdditionalArgumentList '${action.additionalArgs}'` : '';
                const successCodes = action.successExitCodes ? ` -SuccessExitCodes ${action.successExitCodes}` : '';
                const rebootCodes = action.rebootExitCodes ? ` -RebootExitCodes ${action.rebootExitCodes}` : '';
                const pt = action.passThru ? ' -PassThru' : '';
                let cmd = `Uninstall-ADTApplication${name}${nameMatch}${pc}${appType}${filter}${args}${addlArgs}${successCodes}${rebootCodes}${pt}`;
                if (action.passThru && action.passThruVar) cmd = `$${action.passThruVar.replace(/^\$/, '')} = ${cmd}`;
                v4Cmd = cmd;
                break;
              }
              case 'execute_process_as_user': {
                const fp = action.file ? ` -FilePath '${action.file}'` : '';
                const a = action.args ? ` -ArgumentList '${action.args}'` : '';
                v4Cmd = `Start-ADTProcessAsUser${fp}${a} -Wait`;
                break;
              }
              case 'show_welcome': {
                let swParts = [];
                if (action.appName) swParts.push(`-ApplicationName '${action.appName}'`);
                if (action.closeApps) swParts.push(`-CloseApps '${action.closeApps}'`);
                if (action.allowDefer) swParts.push(`-AllowDefer`);
                if (action.deferTimes) swParts.push(`-DeferTimes ${action.deferTimes}`);
                if (action.deferDays) swParts.push(`-DeferDays ${action.deferDays}`);
                if (action.deferDeadline) swParts.push(`-DeferDeadline '${action.deferDeadline}'`);
                if (action.minimize) swParts.push('-MinimizeWindows');
                if (action.forceClose) swParts.push('-ForceCloseAppsCountdown 60');
                if (action.blockExecution) swParts.push('-BlockExecution');
                v4Cmd = `Show-ADTInstallationWelcome${swParts.length ? ' ' + swParts.join(' ') : ''}`;
                break;
              }
              case 'show_progress': {
                const msg = action.statusMessage ? ` -StatusMessage '${action.statusMessage}'` : '';
                const nt = action.topMost === false ? ' -NotTopMost' : '';
                v4Cmd = `Show-ADTInstallationProgress${msg}${nt}`;
                break;
              }
              case 'stop_service': {
                const pt = action.passThru ? ' -PassThru' : '';
                v4Cmd = `Stop-ADTServiceAndDependencies -Name '${action.name}'${pt}`;
                break;
              }
              case 'start_service': {
                const pt = action.passThru ? ' -PassThru' : '';
                v4Cmd = `Start-ADTServiceAndDependencies -Name '${action.name}'${pt}`;
                break;
              }
              case 'registry_remove':
                v4Cmd = `Remove-ADTRegistryKey -Key '${action.key}'`;
                break;
              case 'file_remove':
                v4Cmd = `Remove-ADTFile -Path '${action.path}'`;
                break;
              case 'write_log':
                v4Cmd = `Write-ADTLogEntry -Message '${action.message}' -Severity ${action.severity || 1}`;
                break;
              case 'start_msp_process': {
                const pt = action.passThru ? ' -PassThru' : '';
                v4Cmd = `Start-ADTMspProcess -FilePath '${action.file}'${pt}`;
                break;
              }
              case 'file_copy': {
                const dest = action.destination ? ` -Destination '${action.destination}'` : '';
                v4Cmd = `Copy-ADTFile -Path '${action.path}'${dest}`;
                break;
              }
              case 'create_folder':
                v4Cmd = `New-ADTFolder -Path '${action.path}'`;
                break;
              case 'registry_set':
                v4Cmd = `Set-ADTRegistryKey -Key '${action.key}' -Name '${action.name}' -Value '${action.value}'`;
                break;
              case 'new_shortcut':
                v4Cmd = `New-ADTShortcut -Path '${action.shortcutPath}' -TargetPath '${action.targetPath}'`;
                break;
              case 'set_ini':
                v4Cmd = `Set-ADTIniSection -FilePath '${action.filePath}' -Section '${action.section}' -Key '${action.key}' -Value '${action.value}'`;
                break;
              case 'all_users_registry':
                v4Cmd = `Invoke-ADTAllUsersRegistryAction -ScriptBlock { ... }`;
                break;
              case 'show_completion':
                v4Cmd = `Show-ADTInstallationPrompt -Message 'The install has completed.' -ButtonRightText 'OK' -Icon Information -NoWait`;
                break;
              case 'get_registry_key':
                v4Cmd = `Get-ADTRegistryKey -Key '${action.key}'`;
                break;
              case 'folder_remove':
                v4Cmd = `Remove-ADTFolder -Path '${action.path}'`;
                break;
              case 'remove_firewall_rule':
                v4Cmd = action.displayName ? `Remove-NetFirewallRule -DisplayName '${action.displayName}'` : `Remove-NetFirewallRule -Name '${action.name}'`;
                break;
              case 'custom_variable': {
                const cn = (action.name || '').replace(/^\$/, '');
                v4Cmd = cn ? `$${cn} = "${action.value || ''}"` : '';
                break;
              }
              case 'custom_script':
                v4Cmd = action.code ? action.code.split('\\n')[0] + (action.code.includes('\\n') ? ' ...' : '') : '';
                break;
              default:
                v4Cmd = action.raw || '';
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
  return (
    <div className="action-card action-card--readonly">
      <div className="action-card__header">
        <span className="action-card__icon">🔒</span>
        <span className="action-card__label">System Variable</span>
        <span className="action-card__preview">{action.name?.replace('$adtSession.', '') || ''} = {action.value || ''}</span>
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
  const [layout, setLayout] = useState('side-by-side'); // 'side-by-side' | 'stacked'

  const hasLegacyScript = useMemo(() => {
    return !!(state._scriptContent || psadtResult?.scriptContent);
  }, [state._scriptContent, psadtResult]);

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
      const normalized = parsePsadtBlocks(compiledScript);
      const currentStr = JSON.stringify(lifecycleRef.current);
      const normalizedStr = JSON.stringify(normalized.lifecycle);
      if (currentStr !== normalizedStr) {
        console.log('🔄 Normalize: replacing raw-parsed lifecycle with generated V4.1 output');
        updateFields({ lifecycle: normalized.lifecycle });
      }
    }

    // ── Write to disk for VS Code ──
    const relPath = `windows/src/${resolvedScriptName}`;
    fetch('/api/open-vscode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        packageId: state.packageId,
        relativePath: relPath,
        content: compiledScript,
        writeOnly: true // Don't open VS Code, just write the file
      })
    }).then(() => {
      console.log('📁 Scaffold flush: wrote compiled script to disk for', state.packageId);
    }).catch(e => {
      console.warn('⚠️ Scaffold flush failed (non-critical):', e.message);
    });
  }, [state.packageId, state.wizardMode, compiledScript]);


  // Seamless background file sync whenever browser is refocused
  useEffect(() => {
    if (!state.packageId || !state.vsCodeOpened) return;

    const fetchLatestFromDisk = async () => {
      try {
        const relPath = `windows/src/${resolvedScriptName}`;
        const res = await fetch(
          `/api/read-local-file?packageId=${state.packageId}&relativePath=${relPath}&t=${Date.now()}`,
          { cache: 'no-store' }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.content) {
            // Form-Synchronized mode: reverse-parse block comments to update visual actions!
            const parsed = parsePsadtBlocks(data.content);
            const currentLifecycleStr = JSON.stringify(lifecycleRef.current);
            const nextLifecycleStr = JSON.stringify(parsed.lifecycle);
            if (currentLifecycleStr !== nextLifecycleStr) {
              console.log('🔄 Sync: VS Code changes detected — updating lifecycle actions');
              updateFields({
                lifecycle: parsed.lifecycle
              });
            }
          }
        }
      } catch (e) {
        // Silent fail — file may not exist yet (user hasn't opened VS Code)
      }
    };

    // Fetch once on mount/tab change
    fetchLatestFromDisk();

    // Auto-fetch whenever the browser window is refocused!
    const handleWindowFocus = () => {
      fetchLatestFromDisk();
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [state.packageId, state.vsCodeOpened]);

  const handleOpenInVsCode = async (overrideContent = null) => {
    if (!state.packageId) {
      alert('Please specify a Package ID in the Basic Info step first.');
      return;
    }
    setVsCodeOpening(true);
    try {
      // Always write to the correct output filename (v4 standard name for converted scripts)
      const relPath = `windows/src/${resolvedScriptName}`;

      const res = await fetch('/api/open-vscode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: state.packageId,
          relativePath: relPath,
          content: overrideContent || compiledScript
        })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server returned status ${res.status}: ${text.slice(0, 100)}`);
      }
      const data = await res.json();
      if (data.success) {
        updateField('vsCodeOpened', true);
        if (data.method === 'protocol' && data.url) {
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
            {hasLegacyScript ? 'Script Comparison' : 'Script Developer'}
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
                                  installerSubfolder:   state.installerSubfolder,
                                  installerType:        state.installerType,
                                  msiFileName:          state.msiFileName,
                                  exeSourceFilename:    state.exeSourceFilename,
                                  installerSourceFile:  state.installerSourceFile,
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-md)', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: '300px' }}>
                  <h3 className="section-title" style={{ margin: 0 }}>
                    {hasLegacyScript ? '🔍 Original vs. Converted Script Comparison' : '📜 Generated PowerShell Script'}
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                    {hasLegacyScript
                      ? 'Compare the original legacy PowerShell script with the newly compiled and structured script. Use this view to verify successful conversion.'
                      : 'View the generated PowerShell script. Customize it in VS Code to make manual edits.'
                    }
                  </p>
                </div>

                {/* Unified Toolbar containing VS Code Actions, Badges, Layout Selector, and Pristine Code Toggle */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="badge badge--sync" style={{ padding: '4px 10px', height: 'fit-content' }}>
                    🔒 Form-Synchronized
                  </span>

                  {/* Layout Selector (only visible if there is a legacy script) */}
                  {hasLegacyScript && (
                    <div className="layout-selector" style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', overflow: 'hidden', background: 'rgba(255,255,255,0.03)', padding: '2px' }}>
                      <button
                        type="button"
                        className={`btn-layout ${layout === 'side-by-side' ? 'btn-layout--active' : ''}`}
                        style={{
                          background: layout === 'side-by-side' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                          color: layout === 'side-by-side' ? '#60a5fa' : 'var(--text-muted)',
                          border: 'none',
                          padding: '4px 12px',
                          borderRadius: '14px',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                          transition: 'all 0.2s ease',
                          outline: 'none'
                        }}
                        onClick={() => setLayout('side-by-side')}
                      >
                        ♊ Side-by-Side
                      </button>
                      <button
                        type="button"
                        className={`btn-layout ${layout === 'stacked' ? 'btn-layout--active' : ''}`}
                        style={{
                          background: layout === 'stacked' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                          color: layout === 'stacked' ? '#60a5fa' : 'var(--text-muted)',
                          border: 'none',
                          padding: '4px 12px',
                          borderRadius: '14px',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                          transition: 'all 0.2s ease',
                          outline: 'none'
                        }}
                        onClick={() => setLayout('stacked')}
                      >
                        ☰ Stacked
                      </button>
                    </div>
                  )}

                  {/* Pristine Code Toggle */}
                  <div className="pristine-toggle" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: '500', color: state.pristineScripts ? '#60a5fa' : 'var(--text-muted)', userSelect: 'none' }}>
                      ✨ Pristine Code
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!state.pristineScripts}
                      onClick={() => updateField('pristineScripts', !state.pristineScripts)}
                      style={{
                        position: 'relative',
                        display: 'inline-block',
                        width: '32px',
                        height: '18px',
                        margin: 0,
                        cursor: 'pointer',
                        background: state.pristineScripts ? '#3b82f6' : '#4b5563',
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
                        left: state.pristineScripts ? '16px' : '4px',
                        bottom: '3px',
                        backgroundColor: 'white',
                        transition: 'left 0.3s ease',
                        borderRadius: '50%',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                      }}></span>
                    </button>
                  </div>

                  {/* Manual Refresh / Sync Button (visible in all modes once packageId is set) */}
                  {/* Open in VS Code Button (visible in all modes once packageId is set) */}
                  {state.packageId && (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => handleOpenInVsCode()}
                      disabled={vsCodeOpening}
                      title="Open this file in local VS Code to edit custom blocks"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      {vsCodeOpening ? '⏳ Opening...' : '🖥️ Open in VS Code'}
                    </button>
                  )}


                </div>
              </div>

              {/* Modernization Report */}
              {compatReport && hasLegacyScript && (
                <div className="compat-report-card" style={{ marginBottom: 'var(--space-md)', padding: '12px 16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
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
                      <span>Line numbers in the report correspond to the <strong>Original Legacy Script (left pane / top pane)</strong>. Use them to locate exact legacy context before conversion.</span>
                    </div>
                  )}

                  {compatReport.manualFindings.length > 0 && (
                    <details style={{ marginTop: '8px' }}>
                      <summary style={{ fontSize: '0.75rem', color: 'var(--text-accent)', cursor: 'pointer', outline: 'none', userSelect: 'none' }}>
                        ▸ View {compatReport.manualFindings.length} legacy patterns to verify on visual cards
                      </summary>
                      <div style={{ marginTop: '8px', maxHeight: '200px', overflowY: 'auto', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: 'var(--radius-sm)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                              <th style={{ padding: '6px 10px', width: '90px' }}>Original Line</th>
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


              {/* Display view based on legacy script presence and layout choice */}
              {!hasLegacyScript ? (
                <div style={{ minHeight: '550px' }}>
                  <CodePreview
                    code={activeScript}
                    filename="Invoke-AppDeployToolkit.ps1"
                    activePhase={activePhase}
                    maxHeight="600px"
                  />
                </div>
              ) : layout === 'side-by-side' ? (
                <div className="diff-preview__panels" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', minHeight: '550px' }}>
                  <CodePreview
                    code={state._scriptContent || psadtResult?.scriptContent}
                    filename={state.psadtFileName || 'Deploy-Application.ps1'}
                  />
                  <CodePreview
                    code={activeScript}
                    filename="Invoke-AppDeployToolkit.ps1"
                    activePhase={activePhase}
                  />
                </div>
              ) : (
                <div className="diff-preview__panels" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📄 Original Legacy Script:</span>
                      <span style={{ color: 'var(--text-accent)' }}>{state.psadtFileName || 'Deploy-Application.ps1'}</span>
                    </div>
                    <CodePreview
                      code={state._scriptContent || psadtResult?.scriptContent}
                      filename={state.psadtFileName || 'Deploy-Application.ps1'}
                      hideHeader={true}
                      maxHeight="320px"
                    />
                  </div>
                  <div style={{ flex: 1, marginTop: 'var(--space-sm)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📋 Converted Structured Script:</span>
                      <span style={{ color: 'var(--text-accent)' }}>Invoke-AppDeployToolkit.ps1</span>
                    </div>
                    <CodePreview
                      code={activeScript}
                      filename="Invoke-AppDeployToolkit.ps1"
                      activePhase={activePhase}
                      hideHeader={true}
                      maxHeight="320px"
                    />
                  </div>
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


