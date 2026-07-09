import { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, Divider, Alert, Chip,
  IconButton, InputAdornment, Paper, CircularProgress, Switch,
  FormControlLabel, Tooltip,
} from '@mui/material';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

// ── Field definitions ────────────────────────────────────────────────────
const FIELD_GROUPS = [
  {
    group: 'GitLab',
    color: '#fc6d26',
    fields: [
      { key: 'GITLAB_URL', label: 'GitLab URL', hint: 'Base URL of your GitLab instance', sensitive: false, placeholder: 'https://gitlab.example.com' },
      { key: 'GITLAB_TOKEN', label: 'GitLab Personal Access Token', hint: 'PAT with read_repository and write_repository scopes', sensitive: true },
      { key: 'GITLAB_DEFAULT_GROUP', label: 'GitLab Group (Legacy / Testing)', hint: 'Existing flat group — used as fallback for testing', sensitive: false, placeholder: 'euc/software-package-automation' },
      { key: 'GITLAB_WIN_GROUP', label: 'Windows Group', hint: 'Subgroup for new Windows packages', sensitive: false, placeholder: 'euc/software-package-automation/win' },
      { key: 'GITLAB_MAC_GROUP', label: 'macOS Group', hint: 'Subgroup for new macOS packages', sensitive: false, placeholder: 'euc/software-package-automation/mac' },
    ],
  },
  {
    group: 'Intune / Azure',
    color: '#0078d4',
    fields: [
      { key: 'AZURE_TENANT_ID', label: 'Azure Tenant ID', hint: 'Microsoft Entra ID tenant GUID', sensitive: false, placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
      { key: 'AZURE_CLIENT_ID', label: 'Azure Client ID (App Registration)', hint: 'Application client_id from Azure App Registration', sensitive: false, placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
      { key: 'AZURE_CLIENT_SECRET', label: 'Azure Client Secret', hint: 'Secret value from the App Registration — stored in .env, never committed', sensitive: true },
      { key: 'INTUNE_GROUP_PREFIXES', label: 'Entra Group Search Prefixes', hint: 'Comma-separated display name prefixes for the assignment group picker, e.g. "EUC SPA Test,EUC SPA Prod"', sensitive: false, placeholder: 'EUC SPA Test,EUC SPA Prod' },
    ],
  },
  {
    group: 'Server',
    color: '#22c55e',
    fields: [
      { key: 'PORT', label: 'Server Port', hint: 'Port the backend API listens on. Requires server restart.', sensitive: false, placeholder: '3001' },
    ],
  },
];

// ── Secret field component ────────────────────────────────────────────────
function SecretField({ fieldKey, label, hint, placeholder, value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const handleEdit = () => { setDraft(''); setEditing(true); };
  const handleCancel = () => { setDraft(''); setEditing(false); };
  const handleSave = () => { onChange(fieldKey, draft); setEditing(false); };

  if (!editing) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <TextField
          fullWidth
          label={label}
          size="small"
          value="••••••••••••••••"
          disabled
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <Tooltip title="Change value">
                  <IconButton size="small" onClick={handleEdit}>
                    <EditIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            ),
          }}
          helperText={hint}
        />
        {value === '__SET__' && (
          <Chip label="Set" size="small" color="success" sx={{ fontSize: '0.65rem' }} />
        )}
      </Box>
    );
  }

  return (
    <TextField
      fullWidth
      autoFocus
      label={`${label} — enter new value`}
      size="small"
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      placeholder={placeholder || 'Enter new value...'}
      helperText={hint}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <Tooltip title="Save">
              <IconButton size="small" onClick={handleSave} color="primary">
                <CheckIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Cancel">
              <IconButton size="small" onClick={handleCancel}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </InputAdornment>
        ),
      }}
    />
  );
}

// ── Main Settings Page ────────────────────────────────────────────────────
export default function SettingsPage({ workbenchWidth, onWidthChange, colorThemeId, colorThemes, onColorThemeChange }) {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [showRestartWarning, setShowRestartWarning] = useState(false);

  // Load current settings from server
  useEffect(() => {
    setLoading(true);
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setSettings(data);
        setLoading(false);
      })
      .catch(err => {
        setError(`Failed to load settings: ${err.message}`);
        setLoading(false);
      });
  }, []);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setSaved(true);
      setDirty(false);
      setShowRestartWarning(true);
    } catch (err) {
      setError(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8, gap: 2 }}>
        <CircularProgress size={24} />
        <Typography variant="body2" color="text.secondary">Loading settings...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', py: 4, px: 2 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>Settings</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
        Configure server and integration settings. Changes are written to the server <code>.env</code> file and require a server restart to take effect.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {showRestartWarning && (
        <Alert
          severity="warning"
          sx={{ mb: 3 }}
          onClose={() => setShowRestartWarning(false)}
          icon={<RestartAltIcon />}
        >
          <strong>Server restart required.</strong> Settings have been saved to <code>.env</code>. Restart the backend server for changes to take effect.
        </Alert>
      )}

      {/* ── Appearance (no restart needed) ── */}
      <Paper sx={{ p: 3, mb: 3, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Appearance</Typography>
          <Chip label="No restart needed" size="small" color="success" sx={{ fontSize: '0.65rem', height: 18 }} />
        </Box>
        {/* Workbench Width */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>Workbench Width</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {[
              { key: 'standard', label: 'Standard', hint: '1100px' },
              { key: 'wide', label: 'Wide', hint: '1500px' },
              { key: 'full', label: 'Full', hint: '95% viewport' },
            ].map(({ key, label, hint }) => (
              <Button
                key={key}
                variant={workbenchWidth === key ? 'contained' : 'outlined'}
                size="small"
                onClick={() => onWidthChange(key)}
                sx={{ minWidth: 80 }}
              >
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="caption" display="block" sx={{ fontWeight: 600 }}>{label}</Typography>
                  <Typography variant="caption" display="block" sx={{ fontSize: '0.6rem', opacity: 0.7 }}>{hint}</Typography>
                </Box>
              </Button>
            ))}
          </Box>
        </Box>

        {/* Colour Theme */}
        {colorThemes && (
          <Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>Colour Theme</Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {colorThemes.map((theme) => {
                const isSelected = colorThemeId === theme.id;
                return (
                  <Box
                    key={theme.id}
                    onClick={() => onColorThemeChange(theme.id)}
                    sx={{
                      cursor: 'pointer',
                      borderRadius: 2,
                      border: '2px solid',
                      borderColor: isSelected ? 'primary.main' : 'divider',
                      p: 1.5,
                      minWidth: 140,
                      transition: 'all 0.2s',
                      background: isSelected ? 'rgba(99,140,255,0.06)' : 'transparent',
                      '&:hover': { borderColor: 'primary.light', background: 'rgba(99,140,255,0.04)' },
                    }}
                  >
                    {/* Swatch strip */}
                    <Box sx={{ display: 'flex', gap: 0.5, mb: 1, borderRadius: 1, overflow: 'hidden', height: 20 }}>
                      {theme.swatch.map((color) => (
                        <Box key={color} sx={{ flex: 1, backgroundColor: color, borderRadius: 0.5 }} />
                      ))}
                    </Box>
                    <Typography variant="caption" sx={{ fontWeight: isSelected ? 700 : 500, color: isSelected ? 'primary.main' : 'text.primary', display: 'block' }}>
                      {theme.label}
                      {isSelected && ' ✓'}
                    </Typography>
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>
                      {theme.description}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}
      </Paper>

      {/* ── Server config groups ── */}
      {FIELD_GROUPS.map(({ group, color, fields }) => (
        <Paper key={group} sx={{ p: 3, mb: 3, border: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
            <Box sx={{ width: 3, height: 20, borderRadius: 2, backgroundColor: color }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{group}</Typography>
            <Chip
              label="Requires restart"
              size="small"
              sx={{ fontSize: '0.65rem', height: 18, color: 'text.disabled', borderColor: 'divider' }}
              variant="outlined"
            />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {fields.map(({ key, label, hint, sensitive, placeholder }) =>
              sensitive ? (
                <SecretField
                  key={key}
                  fieldKey={key}
                  label={label}
                  hint={hint}
                  placeholder={placeholder}
                  value={settings[key] || ''}
                  onChange={handleChange}
                />
              ) : (
                <TextField
                  key={key}
                  fullWidth
                  label={label}
                  size="small"
                  value={settings[key] || ''}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={placeholder}
                  helperText={hint}
                />
              )
            )}
          </Box>
        </Paper>
      ))}

      {/* Save button */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving || !dirty}
        >
          {saving ? 'Saving...' : 'Apply Settings'}
        </Button>
        {saved && !dirty && (
          <Chip label="✓ Saved" color="success" size="small" sx={{ fontWeight: 600 }} />
        )}
        {dirty && (
          <Typography variant="caption" sx={{ color: 'warning.main' }}>
            Unsaved changes — click Apply Settings to save
          </Typography>
        )}
      </Box>
    </Box>
  );
}
