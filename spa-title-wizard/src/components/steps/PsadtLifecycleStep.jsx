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
// Functions formatPowerShell and validateSyntax removed - editing is offloaded to VS Code

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

  const [activeTab, setActiveTab] = useState('visual'); // 'visual' | 'compare'
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

  // Generate compiled script or load customized script
  const compiledScript = useMemo(() => {
    return generatePsadtScript(state);
  }, [state]);

  const activeScript = useMemo(() => {
    return state.isCustomized ? (state.customScriptContent || compiledScript) : compiledScript;
  }, [state.isCustomized, state.customScriptContent, compiledScript]);

  // Seamless background file sync when Customized in VS Code
  useEffect(() => {
    if (state.isCustomized && state.packageId) {
      const fetchLatestFromDisk = async () => {
        try {
          const scriptName = 'Invoke-AppDeployToolkit.ps1';
          const relPath = `windows/src/${scriptName}`;
          const res = await fetch(`/api/read-local-file?packageId=${state.packageId}&relativePath=${relPath}`);
          if (res.ok) {
            const data = await res.json();
            if (data.content && data.content !== state.customScriptContent) {
              updateField('customScriptContent', data.content);
            }
          }
        } catch (e) {
          console.warn('Background sync failed:', e);
        }
      };

      fetchLatestFromDisk();

      if (activeTab === 'compare') {
        fetchLatestFromDisk();
      }
    }
  }, [state.isCustomized, state.packageId, activeTab]);

  const handleOpenInVsCode = async (overrideContent = null) => {
    if (!state.packageId) {
      alert('Please specify a Package ID in the Basic Info step first.');
      return;
    }
    setVsCodeOpening(true);
    try {
      const scriptName = 'Invoke-AppDeployToolkit.ps1';
      const relPath = `windows/src/${scriptName}`;
      
      const res = await fetch('/api/open-vscode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: state.packageId,
          relativePath: relPath,
          content: overrideContent || state.customScriptContent || compiledScript
        })
      });
      const data = await res.json();
      if (data.success) {
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

  const handleToggleCustomize = () => {
    if (!state.isCustomized) {
      const ok = window.confirm(
        "Decouple script from visual builder?\n\nThis will write the fully converted Invoke-AppDeployToolkit script to disk and open it in local VS Code. Future manual edits must be done directly in VS Code."
      );
      if (ok) {
        updateFields({
          isCustomized: true,
          customScriptContent: compiledScript
        });
        handleOpenInVsCode(compiledScript);
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

        {activeTab === 'compare' && (
          <div className="psadt-workspace-tab-content compare-tab animate-in">
            <div className="config-section" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-md)', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: '300px' }}>
                  <h3 className="section-title" style={{ margin: 0 }}>
                    {hasLegacyScript ? '🔍 Original vs. Converted Script Comparison' : '📜 Converted PowerShell Script'}
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
                  <span className={`badge ${state.isCustomized ? 'badge--custom' : 'badge--sync'}`} style={{ padding: '4px 10px', height: 'fit-content' }}>
                    {state.isCustomized ? '🔓 Customized in VS Code' : '🔒 Form-Synchronized'}
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
                    <span style={{ fontSize: '0.7rem', fontWeight: '500', color: state.pristineScripts ? '#60a5fa' : 'var(--text-muted)' }}>
                      ✨ Pristine Code
                    </span>
                    <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '32px', height: '18px', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={!!state.pristineScripts}
                        onChange={(e) => updateField('pristineScripts', e.target.checked)}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span className="slider round" style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: state.pristineScripts ? '#3b82f6' : '#4b5563', transition: '.4s', borderRadius: '18px' }}>
                        <span style={{ position: 'absolute', content: '""', height: '12px', width: '12px', left: state.pristineScripts ? '16px' : '4px', bottom: '3px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%' }}></span>
                      </span>
                    </label>
                  </div>

                  {/* Customize in VS Code Button */}
                  <button 
                    type="button"
                    className={`btn btn-sm ${state.isCustomized ? 'btn-secondary' : 'btn-primary'}`} 
                    onClick={handleToggleCustomize}
                  >
                    {state.isCustomized ? '🔒 Lock Sync (Reset)' : '✏️ Customize in VS Code'}
                  </button>

                  {/* Open in VS Code Button (customized mode only) */}
                  {state.isCustomized && (
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleOpenInVsCode()}
                      disabled={vsCodeOpening}
                      title="Open this file in local VS Code"
                      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
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

              {/* Collapsible Test & Debug Panel with Sysinternals PsExec */}
              <div className="compat-report-card" style={{ marginBottom: 'var(--space-md)', padding: '14px 18px', background: 'rgba(59, 130, 246, 0.03)', border: '1px solid rgba(59, 130, 246, 0.15)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.2rem' }}>⚡</span>
                  <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    Local SYSTEM Testing & Debugging (Sysinternals PsExec)
                  </strong>
                  <span className="badge badge--sync" style={{ fontSize: '0.62rem', padding: '1px 6px', marginLeft: 'auto' }}>Test Guide</span>
                </div>
                <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '0 0 10px 0', lineHeight: 1.45 }}>
                  Enterprise deployment tools (like Intune or SCCM) execute software installations under the <strong>Local SYSTEM Account</strong>. To verify your converted PSADT v4 script in the exact same environment before publishing, you can use Sysinternals <strong>PsExec</strong> on a Windows test machine or VM.
                </p>
                <details style={{ marginTop: '6px' }}>
                  <summary style={{ fontSize: '0.74rem', color: 'var(--text-accent)', cursor: 'pointer', outline: 'none', userSelect: 'none', fontWeight: 600 }}>
                    ▸ View Setup Instructions & Dynamic Command Generator
                  </summary>
                  <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.72rem', borderTop: '1px solid rgba(59, 130, 246, 0.08)', paddingTop: '12px' }}>
                    
                    <div>
                      <strong style={{ color: 'var(--text-secondary)' }}>Step 1: Download & Extract PsExec</strong>
                      <p style={{ margin: '2px 0 6px 0', color: 'var(--text-muted)' }}>Run this clean PowerShell command on your Windows test system to download Sysinternals PSTools automatically:</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <code style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', color: '#a7f3d0', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                          {`Invoke-WebRequest -Uri "https://download.sysinternals.com/files/PSTools.zip" -OutFile "$env:TEMP\\PSTools.zip"; Expand-Archive -Path "$env:TEMP\\PSTools.zip" -DestinationPath "$env:ProgramFiles\\PSTools" -Force`}
                        </code>
                        <button 
                          type="button"
                          className="btn btn-ghost" 
                          style={{ padding: '4px 8px', fontSize: '0.65rem', flexShrink: 0, minWidth: '60px' }}
                          onClick={() => copyToClipboard(`Invoke-WebRequest -Uri "https://download.sysinternals.com/files/PSTools.zip" -OutFile "$env:TEMP\\PSTools.zip"; Expand-Archive -Path "$env:TEMP\\PSTools.zip" -DestinationPath "$env:ProgramFiles\\PSTools" -Force`, 'dl-pstools')}
                        >
                          {copiedText === 'dl-pstools' ? '✓ Copied' : '📋 Copy'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <strong style={{ color: 'var(--text-secondary)' }}>Step 2: Copy Package Files</strong>
                      <p style={{ margin: '2px 0 0 0', color: 'var(--text-muted)' }}>
                        Copy your entire local package directory (containing the <code>Files</code>, <code>SupportFiles</code>, and <code>Invoke-AppDeployToolkit.ps1</code>) to a folder on your Windows test system (e.g., <code>C:\\SPA_Test</code>).
                      </p>
                    </div>

                    <div>
                      <strong style={{ color: 'var(--text-secondary)' }}>Step 3: Run PSADT under SYSTEM Context</strong>
                      <p style={{ margin: '2px 0 6px 0', color: 'var(--text-muted)' }}>Open an <strong>Elevated Command Prompt (Run as Administrator)</strong> on your Windows machine, navigate to your PSTools folder or ensure psexec is in your PATH, and run one of the following commands:</p>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: '#60a5fa', marginBottom: '3px' }}>🟢 Test Install Phase (Interactive, full UI progress bar visible):</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <code style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', color: '#93c5fd', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                              {`psexec.exe -i -s powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\SPA_Test\\Invoke-AppDeployToolkit.ps1" -DeploymentType Install -DeployMode Interactive`}
                            </code>
                            <button 
                              type="button"
                              className="btn btn-ghost" 
                              style={{ padding: '4px 8px', fontSize: '0.65rem', flexShrink: 0, minWidth: '60px' }}
                              onClick={() => copyToClipboard(`psexec.exe -i -s powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\SPA_Test\\Invoke-AppDeployToolkit.ps1" -DeploymentType Install -DeployMode Interactive`, 'run-install')}
                            >
                              {copiedText === 'run-install' ? '✓ Copied' : '📋 Copy'}
                            </button>
                          </div>
                        </div>

                        <div>
                          <div style={{ fontWeight: 600, color: '#f87171', marginBottom: '3px' }}>🔴 Test Uninstall Phase (Interactive, full UI progress bar visible):</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <code style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', color: '#93c5fd', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                              {`psexec.exe -i -s powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\SPA_Test\\Invoke-AppDeployToolkit.ps1" -DeploymentType Uninstall -DeployMode Interactive`}
                            </code>
                            <button 
                              type="button"
                              className="btn btn-ghost" 
                              style={{ padding: '4px 8px', fontSize: '0.65rem', flexShrink: 0, minWidth: '60px' }}
                              onClick={() => copyToClipboard(`psexec.exe -i -s powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\SPA_Test\\Invoke-AppDeployToolkit.ps1" -DeploymentType Uninstall -DeployMode Interactive`, 'run-uninstall')}
                            >
                              {copiedText === 'run-uninstall' ? '✓ Copied' : '📋 Copy'}
                            </button>
                          </div>
                        </div>

                        <div>
                          <div style={{ fontWeight: 600, color: '#fbbf24', marginBottom: '3px' }}>🔧 Test Repair Phase (Interactive, full UI progress bar visible):</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <code style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', color: '#93c5fd', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                              {`psexec.exe -i -s powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\SPA_Test\\Invoke-AppDeployToolkit.ps1" -DeploymentType Repair -DeployMode Interactive`}
                            </code>
                            <button 
                              type="button"
                              className="btn btn-ghost" 
                              style={{ padding: '4px 8px', fontSize: '0.65rem', flexShrink: 0, minWidth: '60px' }}
                              onClick={() => copyToClipboard(`psexec.exe -i -s powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\SPA_Test\\Invoke-AppDeployToolkit.ps1" -DeploymentType Repair -DeployMode Interactive`, 'run-repair')}
                            >
                              {copiedText === 'run-repair' ? '✓ Copied' : '📋 Copy'}
                            </button>
                          </div>
                        </div>

                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px' }}>🤫 Test Fully Silent Deployment (Production/Intune simulation, no UI):</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <code style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', color: '#93c5fd', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                              {`psexec.exe -s powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\SPA_Test\\Invoke-AppDeployToolkit.ps1" -DeploymentType Install -DeployMode Silent`}
                            </code>
                            <button 
                              type="button"
                              className="btn btn-ghost" 
                              style={{ padding: '4px 8px', fontSize: '0.65rem', flexShrink: 0, minWidth: '60px' }}
                              onClick={() => copyToClipboard(`psexec.exe -s powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\SPA_Test\\Invoke-AppDeployToolkit.ps1" -DeploymentType Install -DeployMode Silent`, 'run-silent')}
                            >
                              {copiedText === 'run-silent' ? '✓ Copied' : '📋 Copy'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </details>
              </div>

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


