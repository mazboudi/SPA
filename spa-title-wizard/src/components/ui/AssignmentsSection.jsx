import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import EntraGroupPicker from '../ui/EntraGroupPicker';

export default function AssignmentsSection({ assignments, onChange, validationErrors = {} }) {
  const updateAssignment = (index, field, value) => {
    const updated = assignments.map((a, i) => i === index ? { ...a, [field]: value } : a);
    onChange(updated);
  };

  const addAssignment = () => {
    onChange([...assignments, {
      intent: 'available',
      groupId: '',
      filterMode: 'none',
      filterId: '',
      notifications: 'showAll',
      deliveryOptPriority: 'notConfigured',
    }]);
  };

  const removeAssignment = (index) => {
    if (assignments.length <= 1) return;
    onChange(assignments.filter((_, i) => i !== index));
  };

  return (
    <div className="config-section">
      <h3 className="section-title">Intune Assignments</h3>

      {assignments.map((a, i) => (
        <div key={i} className="assignment-card">
          <div className="assignment-card__header">
            <span className="assignment-card__num">Assignment {i + 1}</span>
            {assignments.length > 1 && (
              <button type="button" className="btn btn-ghost assignment-card__remove" onClick={() => removeAssignment(i)}>✕</button>
            )}
          </div>

          <div className="form-grid">
            {/* Intent — locked to Available */}
            <div className="assign-intent-locked">
              <span className="assign-intent-locked__label">Intent</span>
              <span className="assign-intent-locked__badge">✅ Available</span>
              <span className="assign-intent-locked__hint">Locked — only Available assignments are supported</span>
            </div>

            {/* Group Picker — spans full width */}
            <FormField
              label="Entra ID Group"
              id={`assign-group-${i}`}
              required
              hint="Search your Entra ID groups by name — the Object ID (GUID) is stored automatically"
              error={validationErrors[`assignment_${i}_groupId`]}
              style={{ gridColumn: 'span 2' }}
            >
              <EntraGroupPicker
                index={i}
                value={a.groupId}
                onChange={v => updateAssignment(i, 'groupId', v)}
                error={validationErrors[`assignment_${i}_groupId`]}
              />
            </FormField>

            <SelectField
              label="Filter Mode"
              id={`assign-filter-${i}`}
              value={a.filterMode}
              onChange={v => updateAssignment(i, 'filterMode', v)}
              options={[
                { value: 'none',    label: 'None' },
                { value: 'include', label: 'Include' },
                { value: 'exclude', label: 'Exclude' },
              ]}
            />

            {a.filterMode !== 'none' && (
              <FormField label="Filter ID" id={`assign-filterId-${i}`} error={validationErrors[`assignment_${i}_filterId`]}>
                <input
                  id={`assign-filterId-${i}`}
                  type="text"
                  placeholder="Filter GUID"
                  className={validationErrors[`assignment_${i}_filterId`] ? 'input--error' : ''}
                  value={a.filterId}
                  onChange={e => updateAssignment(i, 'filterId', e.target.value)}
                />
              </FormField>
            )}

            <SelectField
              label="Notifications"
              id={`assign-notif-${i}`}
              value={a.notifications}
              onChange={v => updateAssignment(i, 'notifications', v)}
              options={[
                { value: 'showAll',    label: 'Show All' },
                { value: 'showReboot', label: 'Show Reboot Only' },
                { value: 'hideAll',    label: 'Hide All' },
              ]}
            />

            <SelectField
              label="Delivery Optimization"
              id={`assign-delopt-${i}`}
              value={a.deliveryOptPriority}
              onChange={v => updateAssignment(i, 'deliveryOptPriority', v)}
              options={[
                { value: 'notConfigured', label: 'Not Configured' },
                { value: 'foreground',    label: 'Foreground' },
              ]}
            />
          </div>
        </div>
      ))}

      <button type="button" className="btn btn-secondary" onClick={addAssignment} style={{ marginTop: 'var(--space-sm)' }}>
        + Add Assignment
      </button>

      <style>{`
        .assignment-card {
          padding: var(--space-md);
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-md);
        }
        .assignment-card__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-md);
        }
        .assignment-card__num  { font-size: 0.8rem; font-weight: 600; color: var(--text-accent); }
        .assignment-card__remove { padding: 2px 8px; font-size: 0.75rem; color: var(--color-error); }

        .assign-intent-locked {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 10px 14px;
          background: rgba(52,211,153,0.05);
          border: 1px solid rgba(52,211,153,0.18);
          border-radius: var(--radius-sm);
        }
        .assign-intent-locked__label {
          font-size: 0.72rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }
        .assign-intent-locked__badge { font-size: 0.88rem; font-weight: 700; color: #34d399; }
        .assign-intent-locked__hint  { font-size: 0.7rem; color: var(--text-muted); }
      `}</style>
    </div>
  );
}
