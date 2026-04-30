import { useState, useMemo } from 'react';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';
import windowsOptions from '../../config/windowsOptions.json';
import { PHASE_KEYS, PHASE_META, ACTION_TYPE_MAP, getActionsForPhase, getCategoriesForPhase, createAction } from '../../config/actionTypes';
import { checkV3Compatibility } from '../../lib/psadtCompatCheck';
import './windows-steps.css';

/** Inline action card — editable, deletable, reorderable */
function ActionCard({ action, index, total, phaseKey, onUpdate, onRemove, onMove }) {
  const def = ACTION_TYPE_MAP[action.type];
  const icon = def?.icon || '▪️';
  const label = def?.label || action.type;
  const isCustom = action.type === 'custom_script';

  return (
    <div className={`action-card ${!action.enabled ? 'action-card--disabled' : ''} ${isCustom ? 'action-card--custom' : ''}`}>
      <div className="action-card__header">
        <span className="action-card__icon">{icon}</span>
        <span className="action-card__label">{label}</span>
        {isCustom && <span className="action-card__badge-warn" title="Could not be auto-mapped to a known action type">⚠ Manual Review</span>}
        <div className="action-card__controls">
          <button className="action-btn" disabled={index === 0} onClick={() => onMove(phaseKey, index, index - 1)} title="Move up">▲</button>
          <button className="action-btn" disabled={index === total - 1} onClick={() => onMove(phaseKey, index, index + 1)} title="Move down">▼</button>
          <button className="action-btn action-btn--toggle" onClick={() => onUpdate(phaseKey, index, { enabled: !action.enabled })} title={action.enabled ? 'Disable' : 'Enable'}>{action.enabled ? '✓' : '○'}</button>
          <button className="action-btn action-btn--del" onClick={() => onRemove(phaseKey, index)} title="Remove">✕</button>
        </div>
      </div>
      {action.enabled && def?.fields?.length > 0 && (
        <div className="action-card__fields">
          {def.fields.map(f => (
            <div key={f.key} className="action-field">
              <label className="action-field__label">{f.label}</label>
              {f.type === 'boolean' ? (
                <input type="checkbox" checked={!!action[f.key]} onChange={e => onUpdate(phaseKey, index, { [f.key]: e.target.checked })} />
              ) : f.type === 'number' ? (
                <input type="number" value={action[f.key] ?? f.default ?? 0} onChange={e => onUpdate(phaseKey, index, { [f.key]: parseInt(e.target.value) || 0 })} />
              ) : f.type === 'guids' ? (
                <textarea rows="3" placeholder="One GUID per line" value={Array.isArray(action[f.key]) ? action[f.key].join('\n') : (action[f.key] || '')} onChange={e => onUpdate(phaseKey, index, { [f.key]: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} />
              ) : f.type === 'textarea' ? (
                <textarea rows="4" placeholder={f.placeholder || ''} value={action[f.key] || ''} onChange={e => onUpdate(phaseKey, index, { [f.key]: e.target.value })} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
              ) : (
                <input type="text" placeholder={f.placeholder || ''} value={action[f.key] || ''} onChange={e => onUpdate(phaseKey, index, { [f.key]: e.target.value })} />
              )}
            </div>
          ))}
        </div>
      )}
      {action.enabled && action.raw && (
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

export default function PsadtLifecycleStep({ state, updateField, addAction, removeAction, updateAction, moveAction, updateLifecycleRoot, psadtResult }) {
  const [expandedPhases, setExpandedPhases] = useState({});
  const [showScript, setShowScript] = useState(false);
  const lc = state.lifecycle;
  const isRefactor = state.wizardMode === 'refactor';

  // ── Refactor Mode: read-only view ──────────────────────────────────
  // Compute compatibility report for v3 scripts
  const compatReport = useMemo(() => {
    if (isRefactor && psadtResult?.scriptContent && psadtResult?.psadtVersion === 'v3') {
      return checkV3Compatibility(psadtResult.scriptContent);
    }
    return null;
  }, [isRefactor, psadtResult]);

  if (isRefactor && psadtResult) {
    const version = psadtResult.psadtVersion || 'v3';
    const isV3 = version === 'v3';
    const vars = lc.phases?.variableDeclaration?.actions || [];

    return (
      <div className="step-content animate-in">
        <div className="step-header">
          <h2>⚡ PSADT Script — Refactor Mode</h2>
          <p>The uploaded script will be passed directly to the pipeline. Variables below are used for Intune metadata.</p>
        </div>

        {/* Version + conversion banner */}
        <div className="config-section">
          <div className={`refactor-banner ${isV3 ? 'refactor-banner--v3' : 'refactor-banner--v4'}`}>
            <span className="refactor-banner__badge">{version.toUpperCase()}</span>
            <div className="refactor-banner__text">
              {isV3 ? (
                <>
                  <strong>v3 script detected.</strong> The pipeline will run{' '}
                  <code>Convert-ADTDeployment</code> to migrate to v4 before building.
                </>
              ) : (
                <>
                  <strong>v4 script detected.</strong> Ready for direct pipeline deployment — no conversion needed.
                </>
              )}
            </div>
          </div>
        </div>

        {/* v3 Compatibility Report */}
        {compatReport && (
          <div className="config-section">
            <h3 className="section-title">🔍 v3 → v4 Compatibility Report
              <span className="section-optional">{compatReport.summary.total} finding{compatReport.summary.total !== 1 ? 's' : ''}</span>
            </h3>

            {/* Top-level verdict */}
            {compatReport.summary.manualReview === 0 ? (
              <div className="compat-verdict compat-verdict--ok">
                <span className="compat-verdict__icon">✅</span>
                <div>
                  <strong>Ready to commit.</strong> All {compatReport.summary.autoResolved} findings will be auto-resolved by{' '}
                  <code>Convert-ADTDeployment</code> in the pipeline. No manual changes needed.
                </div>
              </div>
            ) : (
              <div className="compat-verdict compat-verdict--action">
                <span className="compat-verdict__icon">⚠️</span>
                <div>
                  <strong>{compatReport.summary.manualReview} item{compatReport.summary.manualReview !== 1 ? 's' : ''} need your review</strong> before committing.
                  These use native PowerShell or patterns that <code>Convert-ADTDeployment</code> may not handle.
                </div>
              </div>
            )}

            {/* Section 1: Needs Manual Review */}
            {compatReport.manualFindings.length > 0 && (
              <div className="compat-section compat-section--manual">
                <h4 className="compat-section__title">🛑 Needs Your Review</h4>
                <table className="compat-table">
                  <thead><tr><th>Line</th><th>Code</th><th>What to Check</th></tr></thead>
                  <tbody>
                    {compatReport.manualFindings.map((f, i) => (
                      <tr key={i} className="compat-row compat-row--caution">
                        <td className="compat-line">{f.line}</td>
                        <td><code className="compat-code-snippet">{f.v3}</code></td>
                        <td className="compat-reason">{f.v4}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Section 2: Auto-resolved (collapsed) */}
            {compatReport.autoFindings.length > 0 && (
              <details className="compat-section compat-section--auto">
                <summary className="compat-section__title compat-section__title--toggle">
                  ✅ Auto-resolved by pipeline ({compatReport.autoFindings.length} items)
                </summary>
                <table className="compat-table">
                  <thead><tr><th>Line</th><th>Type</th><th>v3</th><th>v4 Replacement</th></tr></thead>
                  <tbody>
                    {compatReport.autoFindings.map((f, i) => (
                      <tr key={i} className="compat-row compat-row--auto">
                        <td className="compat-line">{f.line}</td>
                        <td className="compat-type">
                          {f.type === 'renamed' && '⚠ Renamed'}
                          {f.type === 'deprecated_var' && 'ℹ Deprecated'}
                          {f.type === 'param_change' && '🔧 Param'}
                        </td>
                        <td><code>{f.v3}</code>{f.count > 1 ? ` (×${f.count})` : ''}</td>
                        <td><code>{f.v4}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        )}

        {/* Extracted Variables */}
        <div className="config-section">
          <h3 className="section-title">📝 Extracted Variables <span className="section-optional">{vars.length} found</span></h3>
          {vars.length > 0 ? (
            <table className="refactor-var-table">
              <thead><tr><th>Variable</th><th>Value</th></tr></thead>
              <tbody>
                {vars.map((v, i) => (
                  <tr key={i}>
                    <td><code>{v.name}</code></td>
                    <td>
                      <input type="text" value={v.value || ''} className="refactor-var-input"
                        onChange={e => updateAction('variableDeclaration', i, { value: e.target.value })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="phase-empty">No variable declarations found in the script.</p>
          )}
        </div>

        {/* Script preview (collapsible) */}
        <div className="config-section">
          <h3 className="section-title">
            <button className="link-btn" onClick={() => setShowScript(!showScript)}>
              {showScript ? '▾ Hide' : '▸ Show'} Script Preview
            </button>
            <span className="section-optional">{psadtResult.fileName}</span>
          </h3>
          {showScript && (
            <div className="script-preview">
              <pre>{psadtResult.scriptContent?.substring(0, 8000)}{psadtResult.scriptContent?.length > 8000 ? '\n\n... (truncated)' : ''}</pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── New Title Mode: full interactive lifecycle editor ───────────────
  return (
    <div className="step-content animate-in">
      <div className="step-header">
        <h2>⚡ PSADT Lifecycle Phases</h2>
        <p>Configure the PowerShell App Deploy Toolkit lifecycle — the actions executed during install, uninstall, and repair.</p>
      </div>

      {/* Deploy Mode */}
      <div className="config-section">
        <h3 className="section-title">PSADT Deploy Mode</h3>
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

      {/* Phase Panels */}
      <div className="config-section">
        <h3 className="section-title">Lifecycle Phases <span className="section-optional">10 phases</span></h3>
        <div className="lifecycle-panels">
          {PHASE_KEYS.map(phaseKey => {
            const meta = PHASE_META[phaseKey];
            const phaseData = lc.phases?.[phaseKey] || { actions: [] };
            const actions = phaseData.actions || [];
            const isExpanded = expandedPhases[phaseKey];
            const togglePhase = () => setExpandedPhases(prev => ({ ...prev, [phaseKey]: !isExpanded }));

            return (
              <div key={phaseKey} className={`lifecycle-phase ${isExpanded ? 'lifecycle-phase--open' : ''}`}>
                <button type="button" className="phase-header" onClick={togglePhase}>
                  <span className="phase-header__icon">{meta.icon}</span>
                  <span className="phase-header__label">{meta.label}</span>
                  {actions.length > 0 && (
                    <span className="phase-header__badge">{actions.length} action{actions.length !== 1 ? 's' : ''}</span>
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
                        onUpdate={updateAction} onRemove={removeAction} onMove={moveAction} />
                    ))}
                    <AddActionPicker phaseKey={phaseKey} onAdd={addAction} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


