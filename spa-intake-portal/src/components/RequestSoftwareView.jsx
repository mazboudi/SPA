import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Box,
  Typography,
  Alert,
  AlertTitle,
  Chip,
  Divider,
  Paper,
  CircularProgress,
  Autocomplete,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import BlockIcon from '@mui/icons-material/Block';
import SearchIcon from '@mui/icons-material/Search';

const FALLBACK_CATALOG = [
  {
    id: 'model_chrome',
    displayName: 'Google Chrome Enterprise',
    publisher: 'Google LLC',
    category: 'Browsers',
    supportedPlatforms: ['windows', 'macos'],
    licenseRequired: 'No',
    defaultInstallerType: { windows: 'msi', macos: 'pkg' },
    versions: [
      {
        version: '134.0.6998.89',
        disposition: 'Approved',
        dispositionReason: 'Current enterprise standard version vetted by Security.',
        packagingStatus: 'Packaged & Ready',
      },
      {
        version: '135.0.7049.4',
        disposition: 'Review Required',
        dispositionReason: 'Beta / Canary channel version. Requires AppSec validation.',
        packagingStatus: 'Not Packaged',
      },
      {
        version: '119.0.6045.105',
        disposition: 'Denied',
        dispositionReason: 'Deprecated version with unpatched Zero-Day vulnerabilities (CVE-2023-6345). Prohibited.',
        packagingStatus: 'Deprecated',
      },
    ],
  },
  {
    id: 'model_slack',
    displayName: 'Slack Enterprise',
    publisher: 'Salesforce / Slack Technologies',
    category: 'Communication & Collaboration',
    supportedPlatforms: ['windows', 'macos'],
    licenseRequired: 'Yes',
    defaultInstallerType: { windows: 'msi', macos: 'pkg' },
    versions: [
      {
        version: '4.36.140',
        disposition: 'Approved',
        dispositionReason: 'Enterprise Grid standard desktop release.',
        packagingStatus: 'Packaged & Ready',
      },
    ],
  },
  {
    id: 'model_postman',
    displayName: 'Postman API Client',
    publisher: 'Postman Inc.',
    category: 'Developer Tools',
    supportedPlatforms: ['windows', 'macos'],
    licenseRequired: 'Yes',
    defaultInstallerType: { windows: 'exe', macos: 'pkg' },
    versions: [
      {
        version: '11.1.0',
        disposition: 'Review Required',
        dispositionReason: 'Cloud workspace sync requires SAM and Data Governance review.',
        packagingStatus: 'Not Packaged',
      },
    ],
  },
  {
    id: 'model_7zip',
    displayName: '7-Zip',
    publisher: 'Igor Pavlov',
    category: 'Developer Tools',
    supportedPlatforms: ['windows'],
    licenseRequired: 'No',
    defaultInstallerType: { windows: 'msi' },
    versions: [
      {
        version: '24.09',
        disposition: 'Approved',
        dispositionReason: 'Standard open-source compression utility.',
        packagingStatus: 'Packaged & Ready',
      },
    ],
  },
  {
    id: 'model_wireshark',
    displayName: 'Wireshark Network Analyzer',
    publisher: 'Wireshark Foundation',
    category: 'Security & Networking',
    supportedPlatforms: ['windows', 'macos'],
    licenseRequired: 'No',
    defaultInstallerType: { windows: 'exe', macos: 'pkg' },
    versions: [
      {
        version: '4.4.2',
        disposition: 'Review Required',
        dispositionReason: 'Packet inspection utility requires CISO / InfoSec approval.',
        packagingStatus: 'Not Packaged',
      },
    ],
  },
];

export default function RequestSoftwareView({ onSubmitted }) {
  const [catalog, setCatalog] = useState(FALLBACK_CATALOG);
  const [loading, setLoading] = useState(false);

  // Form State
  const [selectedTitleId, setSelectedTitleId] = useState('model_chrome');
  const [selectedVersion, setSelectedVersion] = useState('134.0.6998.89');
  const [platform, setPlatform] = useState('windows');
  const [requestedFor, setRequestedFor] = useState('Alex Johnson');
  const [department, setDepartment] = useState('Digital Banking Engineering');
  const [targetDevice, setTargetDevice] = useState('W11-ENG-08912');
  const [installType, setInstallType] = useState('New Install');
  const [deploymentScope, setDeploymentScope] = useState('Individual');
  const [priority, setPriority] = useState('Medium');
  const [businessJustification, setBusinessJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

  // Load live Catalog from API
  useEffect(() => {
    fetch('/api/intake/catalog')
      .then(res => res.json())
      .then(data => {
        if (data.titles && data.titles.length > 0) {
          setCatalog(data.titles);
        }
      })
      .catch(() => {
        // Keeps fallback catalog
      });
  }, []);

  // Selected Software Model & Version details
  const selectedModel = useMemo(() => {
    return catalog.find(t => t.id === selectedTitleId) || catalog[0] || null;
  }, [catalog, selectedTitleId]);

  const selectedVersionObj = useMemo(() => {
    if (!selectedModel || !selectedVersion) return null;
    return (selectedModel.versions || []).find(v => v.version === selectedVersion) || (selectedModel.versions && selectedModel.versions[0]) || null;
  }, [selectedModel, selectedVersion]);

  // Auto-select first version when title changes
  useEffect(() => {
    if (selectedModel && selectedModel.versions && selectedModel.versions.length > 0) {
      if (!selectedModel.versions.some(v => v.version === selectedVersion)) {
        setSelectedVersion(selectedModel.versions[0].version);
      }
    }
  }, [selectedModel, selectedVersion]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedModel) {
      alert('Please select an authoritative software title.');
      return;
    }
    if (!businessJustification.trim()) {
      alert('Business justification is required.');
      return;
    }

    setSubmitting(true);
    setSuccessMsg(null);

    const payload = {
      titleId: selectedModel.id,
      titleName: selectedModel.displayName,
      publisher: selectedModel.publisher,
      version: selectedVersion,
      platform,
      category: selectedModel.category,
      installerType: (selectedModel.defaultInstallerType && selectedModel.defaultInstallerType[platform]) || 'msi',
      requestedFor,
      department,
      targetDevice,
      installType,
      deploymentScope,
      businessJustification,
      priority,
    };

    try {
      const res = await fetch('/api/intake/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');

      setSuccessMsg(`Request ${data.request.number} submitted successfully! Initial Stage: ${data.request.stage.toUpperCase()}`);
      setBusinessJustification('');
      if (onSubmitted) onSubmitted(data.request);
    } catch (err) {
      alert('Error submitting request: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1080, mx: 'auto' }}>
      <Card>
        <CardHeader
          title="📦 Request New Software (Service Catalog Item)"
          subheader="Select an authoritative enterprise software title and version. Requests are vetted up-front against corporate governance, security, and licensing standards."
        />
        <Divider />

        <CardContent sx={{ p: 3 }}>
          {successMsg && (
            <Alert severity="success" sx={{ mb: 3 }} icon={<CheckCircleIcon fontSize="inherit" />}>
              <AlertTitle sx={{ fontWeight: 700 }}>Submission Successful</AlertTitle>
              {successMsg}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            {/* Section 1: Software Title & Version Selection */}
            <Paper variant="outlined" sx={{ p: 2.5, mb: 3, backgroundColor: '#f8fafc', borderRadius: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>
                  1. Authoritative Software Model Selection
                </Typography>
                <Chip
                  label={`${catalog.length} Titles in Enterprise Catalog`}
                  size="small"
                  sx={{ backgroundColor: '#eff6ff', color: '#2563eb', fontWeight: 600, fontSize: '0.725rem' }}
                />
              </Box>

              <Grid container spacing={2.5}>
                {/* Full-Width Search & Select Title Field */}
                <Grid item xs={12}>
                  <Autocomplete
                    id="software-title-autocomplete"
                    fullWidth
                    options={catalog}
                    getOptionLabel={(option) => typeof option === 'string' ? option : `${option.displayName} (${option.publisher})`}
                    value={selectedModel}
                    onChange={(event, newValue) => {
                      if (newValue) {
                        setSelectedTitleId(newValue.id);
                      }
                    }}
                    isOptionEqualToValue={(option, value) => option?.id === value?.id}
                    renderOption={(props, option) => (
                      <li {...props} key={props.key || option.id}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', py: 1 }}>
                          <Box>
                            <Typography variant="body1" sx={{ fontWeight: 700, color: '#0f172a' }}>
                              {option.displayName}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>
                              {option.publisher} • {option.category} • {option.licenseRequired === 'Yes' ? '🔑 License Required' : '🆓 No License'}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', gap: 0.75, ml: 2 }}>
                            <Chip label={`${(option.versions || []).length} version(s)`} size="small" sx={{ height: 20, fontSize: '0.675rem' }} />
                            <Chip label={(option.supportedPlatforms || []).join(', ').toUpperCase()} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.675rem' }} />
                          </Box>
                        </Box>
                      </li>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Search & Select Authoritative Software Title *"
                        placeholder="Search by app name, publisher, or category (e.g. Chrome, Slack, Postman, 7-Zip, Wireshark)..."
                        helperText="Type any keyword to search verified corporate software catalog titles"
                      />
                    )}
                  />
                </Grid>

                {/* Second Row: Target Platform & Software Version Side-by-Side */}
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="platform-label">Target Platform *</InputLabel>
                    <Select
                      labelId="platform-label"
                      value={platform}
                      label="Target Platform *"
                      onChange={e => setPlatform(e.target.value)}
                    >
                      <MenuItem value="windows">Windows (Win32 / PSADT)</MenuItem>
                      <MenuItem value="macos">macOS (Jamf Pro / PKG)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small" disabled={!selectedModel}>
                    <InputLabel id="version-label">Software Version *</InputLabel>
                    <Select
                      labelId="version-label"
                      value={selectedVersion}
                      label="Software Version *"
                      onChange={e => setSelectedVersion(e.target.value)}
                      required
                    >
                      {((selectedModel && selectedModel.versions) || []).map(v => (
                        <MenuItem key={v.version} value={v.version}>
                          Version {v.version} — [{v.disposition.toUpperCase()}]
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              {/* Real-time Approval Disposition Alert Banner */}
              {selectedVersionObj && (
                <Box sx={{ mt: 2 }}>
                  <Alert
                    severity={
                      selectedVersionObj.disposition === 'Approved'
                        ? 'success'
                        : selectedVersionObj.disposition === 'Denied'
                        ? 'error'
                        : 'warning'
                    }
                    icon={
                      selectedVersionObj.disposition === 'Approved' ? (
                        <CheckCircleIcon fontSize="inherit" />
                      ) : selectedVersionObj.disposition === 'Denied' ? (
                        <BlockIcon fontSize="inherit" />
                      ) : (
                        <WarningAmberIcon fontSize="inherit" />
                      )
                    }
                    sx={{
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor:
                        selectedVersionObj.disposition === 'Approved'
                          ? '#bbf7d0'
                          : selectedVersionObj.disposition === 'Denied'
                          ? '#fecaca'
                          : '#fde68a',
                    }}
                  >
                    <AlertTitle sx={{ fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        label={selectedVersionObj.disposition}
                        size="small"
                        color={
                          selectedVersionObj.disposition === 'Approved'
                            ? 'success'
                            : selectedVersionObj.disposition === 'Denied'
                            ? 'error'
                            : 'warning'
                        }
                        sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
                      />
                      <span>
                        {selectedVersionObj.disposition === 'Approved'
                          ? 'Pre-Approved for Enterprise Deployment'
                          : selectedVersionObj.disposition === 'Denied'
                          ? 'Denied / Prohibited Version (Exception Required)'
                          : 'Governance & Security Review Required'}
                      </span>
                    </AlertTitle>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {selectedVersionObj.dispositionReason || 'Standard corporate software vetting rules apply.'}
                    </Typography>
                  </Alert>
                </Box>
              )}
            </Paper>

            {/* Section 2: Beneficiary & Deployment Scope */}
            <Paper variant="outlined" sx={{ p: 2.5, mb: 3, backgroundColor: '#f8fafc', borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b', mb: 2 }}>
                2. Beneficiary & Deployment Scope
              </Typography>

              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Requested For (User) *"
                    value={requestedFor}
                    onChange={e => setRequestedFor(e.target.value)}
                    required
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Department *"
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    required
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Target Device / Hostname"
                    value={targetDevice}
                    onChange={e => setTargetDevice(e.target.value)}
                  />
                </Grid>
              </Grid>

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="install-type-label">Install Type</InputLabel>
                    <Select
                      labelId="install-type-label"
                      value={installType}
                      label="Install Type"
                      onChange={e => setInstallType(e.target.value)}
                    >
                      <MenuItem value="New Install">New Install</MenuItem>
                      <MenuItem value="Version Upgrade">Version Upgrade</MenuItem>
                      <MenuItem value="License Renewal">License Renewal</MenuItem>
                      <MenuItem value="Exception">Exception</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="deployment-scope-label">Deployment Scope</InputLabel>
                    <Select
                      labelId="deployment-scope-label"
                      value={deploymentScope}
                      label="Deployment Scope"
                      onChange={e => setDeploymentScope(e.target.value)}
                    >
                      <MenuItem value="Individual">Individual Workstation</MenuItem>
                      <MenuItem value="Department">Department / Team</MenuItem>
                      <MenuItem value="Pilot">Pilot Group (10-50 users)</MenuItem>
                      <MenuItem value="Enterprise">Enterprise-wide</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="priority-label">Priority</InputLabel>
                    <Select
                      labelId="priority-label"
                      value={priority}
                      label="Priority"
                      onChange={e => setPriority(e.target.value)}
                    >
                      <MenuItem value="Low">Low</MenuItem>
                      <MenuItem value="Medium">Medium</MenuItem>
                      <MenuItem value="High">High</MenuItem>
                      <MenuItem value="Critical">Critical</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </Paper>

            {/* Section 3: Justification */}
            <Box sx={{ mb: 3 }}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Business Justification & Use Case *"
                placeholder="Explain why this software and version is required for business operations..."
                value={businessJustification}
                onChange={e => setBusinessJustification(e.target.value)}
                required
              />
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                startIcon={<SendIcon />}
                disabled={submitting}
                sx={{ px: 3 }}
              >
                {submitting ? 'Submitting Request...' : 'Submit Software Request'}
              </Button>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
