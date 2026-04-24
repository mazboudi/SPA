import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';

export default function AssignmentsSection({ assignments, onChange }) {
  const updateAssignment = (index, field, value) => {
    const updated = assignments.map((a, i) => i === index ? { ...a, [field]: value } : a);
    onChange(updated);
  };

  const addAssignment = () => {
    onChange([...assignments, { intent: 'available', groupId: '', filterMode: 'none', filterId: '', notifications: 'showAll', deliveryOptPriority: 'notConfigured' }]);
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
            <SelectField label="Intent" id={`assign-intent-${i}`} value={a.intent} onChange={v => updateAssignment(i, 'intent', v)}
              options={[
                { value: 'available', label: 'Available' },
                { value: 'required', label: 'Required' },
                { value: 'uninstall', label: 'Uninstall' },
              ]}
            />
            <FormField label="Entra ID Group Object ID" id={`assign-group-${i}`} required hint="Azure AD group GUID">
              <input id={`assign-group-${i}`} type="text" placeholder="00000000-0000-0000-0000-000000000000" value={a.groupId} onChange={e => updateAssignment(i, 'groupId', e.target.value)} />
            </FormField>
            <SelectField label="Filter Mode" id={`assign-filter-${i}`} value={a.filterMode} onChange={v => updateAssignment(i, 'filterMode', v)}
              options={[
                { value: 'none', label: 'None' },
                { value: 'include', label: 'Include' },
                { value: 'exclude', label: 'Exclude' },
              ]}
            />
            {a.filterMode !== 'none' && (
              <FormField label="Filter ID" id={`assign-filterId-${i}`}>
                <input id={`assign-filterId-${i}`} type="text" placeholder="Filter GUID" value={a.filterId} onChange={e => updateAssignment(i, 'filterId', e.target.value)} />
              </FormField>
            )}
            <SelectField label="Notifications" id={`assign-notif-${i}`} value={a.notifications} onChange={v => updateAssignment(i, 'notifications', v)}
              options={[
                { value: 'showAll', label: 'Show All' },
                { value: 'showReboot', label: 'Show Reboot Only' },
                { value: 'hideAll', label: 'Hide All' },
              ]}
            />
            <SelectField label="Delivery Optimization" id={`assign-delopt-${i}`} value={a.deliveryOptPriority} onChange={v => updateAssignment(i, 'deliveryOptPriority', v)}
              options={[
                { value: 'notConfigured', label: 'Not Configured' },
                { value: 'foreground', label: 'Foreground' },
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
        .assignment-card__num {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-accent);
        }
        .assignment-card__remove {
          padding: 2px 8px;
          font-size: 0.75rem;
          color: var(--color-error);
        }
      `}</style>
    </div>
  );
}
