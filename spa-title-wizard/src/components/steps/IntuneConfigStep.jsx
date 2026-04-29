import { useMemo } from 'react';
import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import ToggleSwitch from '../ui/ToggleSwitch';
import AssignmentsSection from '../ui/AssignmentsSection';
import windowsOptions from '../../config/windowsOptions.json';
import './windows-steps.css';

// ── Validators ──────────────────────────────────────────────────────────
const isValidUrl = (v) => {
  if (!v) return true; // optional fields are always valid when empty
  try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol); }
  catch { return false; }
};

const GUID_RE = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;
const isValidGuid = (v) => !v || GUID_RE.test(v.trim());

export default function IntuneConfigStep({ state, updateField }) {
  // Compute validation errors — only show for non-empty fields
  const errors = useMemo(() => {
    const e = {};
    if (state.informationUrl && !isValidUrl(state.informationUrl))
      e.informationUrl = 'Must be a valid URL starting with https://';
    if (state.privacyUrl && !isValidUrl(state.privacyUrl))
      e.privacyUrl = 'Must be a valid URL starting with https://';
    if (state.supersedesAppId && !isValidGuid(state.supersedesAppId))
      e.supersedesAppId = 'Must be a valid GUID — e.g. {12345678-abcd-1234-abcd-1234567890ab}';
    // Validate assignment group IDs
    (state.assignments || []).forEach((a, i) => {
      if (a.groupId && !isValidGuid(a.groupId))
        e[`assignment_${i}_groupId`] = 'Must be a valid Entra ID group GUID';
      if (a.filterId && !isValidGuid(a.filterId))
        e[`assignment_${i}_filterId`] = 'Must be a valid filter GUID';
    });
    return e;
  }, [state.informationUrl, state.privacyUrl, state.supersedesAppId, state.assignments]);

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="step-content animate-in">
      <div className="step-header">
        <h2>☁️ Intune Configuration</h2>
        <p>Configure Intune app metadata, logo, requirements, group assignments, and supersedence.</p>
      </div>

      {hasErrors && (
        <div className="validation-banner">
          <span className="validation-banner__icon">⚠️</span>
          <span>Some fields have validation errors. Fix them before exporting to avoid Graph API failures.</span>
        </div>
      )}

      {/* ═══ INTUNE APP METADATA ═══ */}
      <div className="config-section">
        <h3 className="section-title">App Metadata</h3>
        <div className="form-grid">
          <FormField label="Description" id="appDescription">
            <textarea id="appDescription" rows="2" placeholder="Application description for Intune Company Portal" value={state.appDescription} onChange={e => updateField('appDescription', e.target.value)} />
          </FormField>
          <FormField label="Owner" id="appOwner">
            <input id="appOwner" type="text" value={state.appOwner} onChange={e => updateField('appOwner', e.target.value)} />
          </FormField>
          <FormField label="Developer" id="appDeveloper">
            <input id="appDeveloper" type="text" placeholder="e.g. Microsoft, Adobe" value={state.appDeveloper} onChange={e => updateField('appDeveloper', e.target.value)} />
          </FormField>
          <FormField label="Information URL" id="informationUrl" hint="Link to app docs or vendor site" error={errors.informationUrl}>
            <input id="informationUrl" type="url" placeholder="https://example.com"
              className={errors.informationUrl ? 'input--error' : ''}
              value={state.informationUrl} onChange={e => updateField('informationUrl', e.target.value)} />
          </FormField>
          <FormField label="Privacy URL" id="privacyUrl" error={errors.privacyUrl}>
            <input id="privacyUrl" type="url" placeholder="https://example.com/privacy"
              className={errors.privacyUrl ? 'input--error' : ''}
              value={state.privacyUrl} onChange={e => updateField('privacyUrl', e.target.value)} />
          </FormField>
          <FormField label="Notes" id="appNotes">
            <input id="appNotes" type="text" value={state.appNotes} onChange={e => updateField('appNotes', e.target.value)} />
          </FormField>
        </div>
        <ToggleSwitch label="Featured app in Company Portal" checked={state.isFeatured} onChange={v => updateField('isFeatured', v)} id="isFeatured" />
      </div>

      {/* ═══ APP LOGO ═══ */}
      <div className="config-section">
        <h3 className="section-title">App Logo <span className="section-optional">Optional</span></h3>
        <div className="logo-upload-area">
          <label className="btn btn-secondary">
            🖼️ Upload Logo (PNG/JPG)
            <input type="file" accept=".png,.jpg,.jpeg,.gif,.bmp" onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              updateField('logoFile', file);
              const reader = new FileReader();
              reader.onload = () => updateField('logoDataUrl', reader.result);
              reader.readAsDataURL(file);
            }} style={{ display: 'none' }} />
          </label>
          {state.logoDataUrl && (
            <div className="logo-preview">
              <img src={state.logoDataUrl} alt="App logo" style={{ maxWidth: 64, maxHeight: 64, borderRadius: 'var(--radius-sm)' }} />
              <span className="msi-status msi-status--ok">✅ {state.logoFile?.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ REQUIREMENTS ═══ */}
      <div className="config-section">
        <h3 className="section-title">Requirements</h3>
        <div className="form-grid">
          <SelectField label="Minimum Windows Release" id="minWinRelease" value={state.minWinRelease}
            onChange={v => updateField('minWinRelease', v)}
            options={windowsOptions.windowsReleases}
          />
          <SelectField label="Architecture" id="applicableArch" value={state.applicableArch}
            onChange={v => updateField('applicableArch', v)}
            options={windowsOptions.architectures}
          />
          <FormField label="Min Free Disk Space (MB)" id="minDiskSpaceMB">
            <input id="minDiskSpaceMB" type="number" min="0" value={state.minDiskSpaceMB} onChange={e => updateField('minDiskSpaceMB', parseInt(e.target.value) || 500)} />
          </FormField>
          <FormField label="Min Memory (MB)" id="minMemoryMB">
            <input id="minMemoryMB" type="number" min="0" value={state.minMemoryMB} onChange={e => updateField('minMemoryMB', parseInt(e.target.value) || 2048)} />
          </FormField>
        </div>
      </div>

      {/* ═══ ASSIGNMENTS ═══ */}
      <AssignmentsSection
        assignments={state.assignments}
        onChange={v => updateField('assignments', v)}
        validationErrors={errors}
      />

      {/* ═══ SUPERSEDENCE ═══ */}
      <div className="config-section">
        <h3 className="section-title">Supersedence <span className="section-optional">Optional</span></h3>
        <div className="form-grid">
          <FormField label="Superseded App ID" id="supersedesAppId" hint="Intune app GUID of the app being replaced" error={errors.supersedesAppId}>
            <input id="supersedesAppId" type="text" placeholder="Leave empty if not superseding"
              className={errors.supersedesAppId ? 'input--error' : ''}
              value={state.supersedesAppId} onChange={e => updateField('supersedesAppId', e.target.value)} />
          </FormField>
          <SelectField label="Supersedence Type" id="supersedenceType" value={state.supersedenceType}
            onChange={v => updateField('supersedenceType', v)}
            options={[
              { value: 'update', label: 'Update (replace + uninstall old)' },
              { value: 'replace', label: 'Replace (side-by-side)' },
            ]}
          />
        </div>
      </div>

      <style>{`
        .validation-banner { display: flex; align-items: center; gap: var(--space-sm); padding: 10px var(--space-md); margin-bottom: var(--space-lg); background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); border-radius: var(--radius-sm); font-size: 0.8rem; color: var(--color-error, #ef4444); }
        .validation-banner__icon { font-size: 1rem; }
        .input--error { border-color: var(--color-error, #ef4444) !important; box-shadow: 0 0 0 1px rgba(239,68,68,0.25); }
      `}</style>
    </div>
  );
}
