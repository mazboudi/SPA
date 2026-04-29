import { useState } from 'react';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';
import windowsOptions from '../../config/windowsOptions.json';
import { PHASE_KEYS, PHASE_META, ACTION_TYPE_MAP, getActionsForPhase, getCategoriesForPhase, createAction } from '../../config/actionTypes';
import './windows-steps.css';

/** Inline action card — editable, deletable, reorderable */
function ActionCard({ action, index, total, phaseKey, onUpdate, onRemove, onMove }) {
  const def = ACTION_TYPE_MAP[action.type];
  const icon = def?.icon || '▪️';
  const label = def?.label || action.type;

  return (
    <div className={`action-card ${!action.enabled ? 'action-card--disabled' : ''}`}>
      <div className="action-card__header">
        <span className="action-card__icon">{icon}</span>
        <span className="action-card__label">{label}</span>
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

export default function PsadtLifecycleStep({ state, updateField, addAction, removeAction, updateAction, moveAction, updateLifecycleRoot }) {
  const [expandedPhases, setExpandedPhases] = useState({});
  const lc = state.lifecycle;

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
        <h3 className="section-title">Lifecycle Phases <span className="section-optional">{state.wizardMode === 'refactor' ? 'Imported' : '10 phases'}</span></h3>
        <div className="lifecycle-panels">
          {PHASE_KEYS.map(phaseKey => {
            const meta = PHASE_META[phaseKey];
            const phaseData = lc.phases?.[phaseKey] || { actions: [] };
            const actions = phaseData.actions || [];
            const isExpanded = expandedPhases[phaseKey] || (state.wizardMode === 'refactor' && actions.length > 0);
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
