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
  ToggleButtonGroup,
  ToggleButton,
  FormControlLabel,
  Checkbox,
  Avatar,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import BlockIcon from '@mui/icons-material/Block';
import SearchIcon from '@mui/icons-material/Search';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlineOutlined';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import SecurityIcon from '@mui/icons-material/Security';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';

export default function RequestSoftwareView({ onSubmitted }) {
  const [catalog, setCatalog] = useState([]);
  const [totalCount, setTotalCount] = useState(3436);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  // Mode: 'catalog' vs 'unlisted'
  const [requestMode, setRequestMode] = useState('catalog');

  // Form State: Catalog Mode (Starts completely blank)
  const [selectedTitleId, setSelectedTitleId] = useState('');
  const [selectedVersion, setSelectedVersion] = useState('');

  // Form State: Unlisted Mode
  const [unlistedTitleName, setUnlistedTitleName] = useState('');
  const [unlistedPublisher, setUnlistedPublisher] = useState('');
  const [unlistedVersion, setUnlistedVersion] = useState('');
  const [unlistedCategory, setUnlistedCategory] = useState('Developer Tools');
  const [unlistedDownloadUrl, setUnlistedDownloadUrl] = useState('');

  // General Form State
  const [platform, setPlatform] = useState('windows');

  // Requester (Logged-on User) vs Beneficiary
  const loggedInUser = {
    name: 'Alex Johnson',
    email: 'alex.johnson@fiserv.com',
    role: 'Lead EUC Packager / Engineer',
  };

  const [requestingForSelf, setRequestingForSelf] = useState(true);
  const [requestedFor, setRequestedFor] = useState(loggedInUser.name);
  const [beneficiaryEmail, setBeneficiaryEmail] = useState(loggedInUser.email);
  const [department, setDepartment] = useState('Digital Banking Engineering');
  const [targetDevice, setTargetDevice] = useState('W11-ENG-08912');
  const [installType, setInstallType] = useState('New Install');
  const [deploymentScope, setDeploymentScope] = useState('Individual');
  const [priority, setPriority] = useState('Medium');
  const [businessJustification, setBusinessJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

  // Sync beneficiary when requestingForSelf changes
  const handleToggleRequestingForSelf = (e) => {
    const isSelf = e.target.checked;
    setRequestingForSelf(isSelf);
    if (isSelf) {
      setRequestedFor(loggedInUser.name);
      setBeneficiaryEmail(loggedInUser.email);
    } else {
      setRequestedFor('');
      setBeneficiaryEmail('');
    }
  };

  // Load catalog titles
  const fetchCatalog = (searchStr = '') => {
    setLoading(true);
    const url = searchStr.trim()
      ? `/api/intake/catalog?search=${encodeURIComponent(searchStr)}&limit=150`
      : `/api/intake/catalog?limit=150`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data && data.titles) {
          setCatalog(data.titles);
          if (data.totalInDatabase) setTotalCount(data.totalInDatabase);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCatalog('');
  }, []);

  // Debounced search when user types in combobox
  useEffect(() => {
    if (!searchInput) return;
    const timer = setTimeout(() => {
      fetchCatalog(searchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Selected Software Model & Version details (Starts null)
  const selectedModel = useMemo(() => {
    if (!selectedTitleId || !catalog || catalog.length === 0) return null;
    return catalog.find(t => t.id === selectedTitleId) || null;
  }, [catalog, selectedTitleId]);

  const selectedVersionObj = useMemo(() => {
    if (!selectedModel || !selectedModel.versions || selectedModel.versions.length === 0 || !selectedVersion) return null;
    return selectedModel.versions.find(v => v.version === selectedVersion) || null;
  }, [selectedModel, selectedVersion]);

  // Auto-select first version when title changes
  useEffect(() => {
    if (selectedModel && selectedModel.versions && selectedModel.versions.length > 0) {
      if (!selectedModel.versions.some(v => v.version === selectedVersion)) {
        setSelectedVersion(selectedModel.versions[0].version);
      }
    } else if (!selectedModel) {
      setSelectedVersion('');
    }
  }, [selectedModel]);

  const isDenied = requestMode === 'catalog' && selectedVersionObj?.disposition === 'Denied';
  const isReviewRequired = requestMode === 'unlisted' || (requestMode === 'catalog' && selectedVersionObj?.disposition === 'Review Required');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (requestMode === 'catalog') {
      if (!selectedModel) {
        alert('Please search and select an authoritative software title from the catalog.');
        return;
      }
      if (!selectedVersion) {
        alert('Please select a software version.');
        return;
      }
    } else {
      if (!unlistedTitleName.trim() || !unlistedPublisher.trim() || !unlistedVersion.trim()) {
        alert('Please fill in the Title Name, Publisher/Vendor, and Version for the unlisted software request.');
        return;
      }
    }

    if (!requestedFor.trim()) {
      alert('Beneficiary / Requested For user is required.');
      return;
    }

    if (!businessJustification.trim()) {
      alert('Business justification is required.');
      return;
    }

    setSubmitting(true);
    setSuccessMsg(null);

    const isUnlisted = requestMode === 'unlisted';

    const payload = {
      isUnlisted,
      titleId: isUnlisted ? null : selectedModel.id,
      titleName: isUnlisted ? unlistedTitleName.trim() : selectedModel.displayName,
      publisher: isUnlisted ? unlistedPublisher.trim() : selectedModel.publisher,
      version: isUnlisted ? unlistedVersion.trim() : selectedVersion,
      platform,
      category: isUnlisted ? unlistedCategory : selectedModel.category,
      installerType: isUnlisted ? 'msi' : ((selectedModel.defaultInstallerType && selectedModel.defaultInstallerType[platform]) || 'msi'),
      installerSource: isUnlisted ? unlistedDownloadUrl.trim() : '',
      requestedBy: loggedInUser.name,
      requesterEmail: loggedInUser.email,
      requestedFor: requestedFor.trim(),
      beneficiaryEmail: beneficiaryEmail.trim() || `${requestedFor.trim().toLowerCase().replace(/\s+/g, '.')}@fiserv.com`,
      department: department.trim(),
      targetDevice: targetDevice.trim(),
      installType: isDenied ? 'Exception' : installType,
      deploymentScope,
      businessJustification: businessJustification.trim(),
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
      
      // Reset form to blank state
      setSelectedTitleId('');
      setSelectedVersion('');
      setUnlistedTitleName('');
      setUnlistedPublisher('');
      setUnlistedVersion('');
      setUnlistedDownloadUrl('');
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
          title="📦 Request Software (Service Catalog Item)"
          subheader="Search authoritative corporate software models or request unlisted software for governance and architecture evaluation."
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
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>
                  1. Software Selection & Vetting Disposition
                </Typography>

                {/* Mode Selector Toggle */}
                <ToggleButtonGroup
                  value={requestMode}
                  exclusive
                  onChange={(e, val) => {
                    if (val) setRequestMode(val);
                  }}
                  size="small"
                  sx={{ backgroundColor: '#ffffff' }}
                >
                  <ToggleButton value="catalog" sx={{ textTransform: 'none', fontWeight: 600, px: 2, gap: 1 }}>
                    <LibraryBooksIcon sx={{ fontSize: 16 }} />
                    Authoritative Catalog ({totalCount.toLocaleString()})
                  </ToggleButton>
                  <ToggleButton value="unlisted" sx={{ textTransform: 'none', fontWeight: 600, px: 2, gap: 1 }}>
                    <AddCircleOutlineIcon sx={{ fontSize: 16 }} />
                    Request Unlisted Software
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {/* A. Catalog Mode (Starts Blank) */}
              {requestMode === 'catalog' && (
                <Grid container spacing={2.5}>
                  {/* Full-Width Search & Select Title Field */}
                  <Grid item xs={12}>
                    <Autocomplete
                      id="software-title-autocomplete"
                      fullWidth
                      options={catalog}
                      loading={loading}
                      getOptionLabel={(option) => {
                        if (!option) return '';
                        if (typeof option === 'string') return option;
                        return `${option.displayName || ''} (${option.publisher || ''})`;
                      }}
                      value={selectedModel}
                      onInputChange={(event, newInputValue) => {
                        setSearchInput(newInputValue);
                      }}
                      onChange={(event, newValue) => {
                        if (newValue && newValue.id) {
                          setSelectedTitleId(newValue.id);
                        } else {
                          setSelectedTitleId('');
                          setSelectedVersion('');
                        }
                      }}
                      isOptionEqualToValue={(option, value) => {
                        if (!option || !value) return false;
                        return option.id === value.id;
                      }}
                      renderOption={(props, option) => {
                        const { key, ...otherProps } = props;
                        return (
                          <li key={key || option.id} {...otherProps}>
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
                                <Chip label={`${(option.versions || []).length} ver`} size="small" sx={{ height: 20, fontSize: '0.675rem' }} />
                                <Chip label={(option.supportedPlatforms || ['windows']).join(', ').toUpperCase()} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.675rem' }} />
                              </Box>
                            </Box>
                          </li>
                        );
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Search & Select Authoritative Software Title *"
                          placeholder="Type any keyword to search (e.g. 1Password, Chrome, Docker, Postman, Visual Studio Code)..."
                          helperText={
                            <span>
                              Search across 3,400+ vetted enterprise models. Can't find what you need?{' '}
                              <a
                                href="#unlisted"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setRequestMode('unlisted');
                                }}
                                style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}
                              >
                                Request an Unlisted Software Title
                              </a>
                            </span>
                          }
                        />
                      )}
                    />
                  </Grid>

                  {/* Target Platform & Software Version */}
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
                        value={selectedVersion || ''}
                        label="Software Version *"
                        onChange={e => setSelectedVersion(e.target.value)}
                        required
                      >
                        {((selectedModel && selectedModel.versions) || []).map(v => (
                          <MenuItem key={v.version} value={v.version}>
                            Version {v.version} — [{v.disposition ? v.disposition.toUpperCase() : 'UNKNOWN'}]
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              )}

              {/* B. Unlisted Mode */}
              {requestMode === 'unlisted' && (
                <Box>
                  <Alert severity="info" sx={{ mb: 2.5, borderRadius: 2 }} icon={<SecurityIcon fontSize="inherit" />}>
                    <AlertTitle sx={{ fontWeight: 700 }}>Unlisted Software Intake & Governance Lifecycle</AlertTitle>
                    This software title is not currently in the Authoritative Catalog. Submitting this request will automatically generate a <strong>Cybersecurity & Architecture Disposition Review</strong> task. Upon governance approval, this title will be <strong>permanently enrolled</strong> into the enterprise catalog as an approved software model.
                  </Alert>

                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        required
                        label="Software Title Name *"
                        placeholder="e.g. Postman Enterprise, DBeaver, Docker Desktop"
                        value={unlistedTitleName}
                        onChange={e => setUnlistedTitleName(e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        required
                        label="Publisher / Vendor *"
                        placeholder="e.g. Postman Inc., DBeaver Corp., Docker Inc."
                        value={unlistedPublisher}
                        onChange={e => setUnlistedPublisher(e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth
                        size="small"
                        required
                        label="Requested Version / Release *"
                        placeholder="e.g. 10.22.0, 24.1.0, Latest"
                        value={unlistedVersion}
                        onChange={e => setUnlistedVersion(e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="unlisted-platform-label">Target Platform *</InputLabel>
                        <Select
                          labelId="unlisted-platform-label"
                          value={platform}
                          label="Target Platform *"
                          onChange={e => setPlatform(e.target.value)}
                        >
                          <MenuItem value="windows">Windows (Win32 / PSADT)</MenuItem>
                          <MenuItem value="macos">macOS (Jamf Pro / PKG)</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="unlisted-cat-label">Application Category</InputLabel>
                        <Select
                          labelId="unlisted-cat-label"
                          value={unlistedCategory}
                          label="Application Category"
                          onChange={e => setUnlistedCategory(e.target.value)}
                        >
                          <MenuItem value="Developer Tools">Developer Tools & IDEs</MenuItem>
                          <MenuItem value="Productivity">Productivity & Collaboration</MenuItem>
                          <MenuItem value="Security & Identity">Security & Identity</MenuItem>
                          <MenuItem value="Finance & Banking">Finance & Banking</MenuItem>
                          <MenuItem value="IT & Admin">IT & Admin Utilities</MenuItem>
                          <MenuItem value="Business">Business & Operations</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Vendor Download URL or Installer Network Share (Optional)"
                        placeholder="https://vendor.com/download/pkg.exe or \\corp.net\share\installer.msi"
                        value={unlistedDownloadUrl}
                        onChange={e => setUnlistedDownloadUrl(e.target.value)}
                      />
                    </Grid>
                  </Grid>
                </Box>
              )}
            </Paper>

            {/* Section 2: Requester & Beneficiary Details */}
            <Paper variant="outlined" sx={{ p: 2.5, mb: 3, backgroundColor: '#f8fafc', borderRadius: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>
                  2. Requester & Beneficiary Identification
                </Typography>

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={requestingForSelf}
                      onChange={handleToggleRequestingForSelf}
                      color="primary"
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#334155' }}>
                      I am requesting this software for myself
                    </Typography>
                  }
                />
              </Box>

              {/* Logged-on Submitter Card */}
              <Paper variant="outlined" sx={{ p: 1.5, mb: 2, backgroundColor: '#ffffff', borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Avatar sx={{ bgcolor: '#2563eb', width: 32, height: 32, fontSize: '0.8rem', fontWeight: 700 }}>
                    AJ
                  </Avatar>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                      Submitted By (Logged-on User): {loggedInUser.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      {loggedInUser.email} • {loggedInUser.role}
                    </Typography>
                  </Box>
                </Box>
                <Chip label="Verified Single Sign-On" size="small" color="success" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
              </Paper>

              {/* Beneficiary Details */}
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Requested For (Beneficiary Full Name) *"
                    value={requestedFor}
                    onChange={e => setRequestedFor(e.target.value)}
                    required
                    helperText={requestingForSelf ? 'Current user will receive software package' : 'Specify the end-user recipient'}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Beneficiary Email Address *"
                    value={beneficiaryEmail}
                    onChange={e => setBeneficiaryEmail(e.target.value)}
                    required
                    helperText="Notification & entitlement delivery address"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Department / Cost Center *"
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    required
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Target Device / Workstation Hostname"
                    value={targetDevice}
                    onChange={e => setTargetDevice(e.target.value)}
                    placeholder="e.g. W11-ENG-08912 or MAC-DESK-010"
                  />
                </Grid>
              </Grid>

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="install-type-label">Install Type</InputLabel>
                    <Select
                      labelId="install-type-label"
                      value={isDenied ? 'Exception' : installType}
                      label="Install Type"
                      onChange={e => setInstallType(e.target.value)}
                      disabled={isDenied}
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
                label={
                  isDenied
                    ? 'Business Justification for Prohibited Software Exception *'
                    : requestMode === 'unlisted'
                    ? 'Business Justification & Architecture Use Case for Unlisted Software *'
                    : 'Business Justification & Operational Use Case *'
                }
                placeholder={
                  isDenied
                    ? 'Explain why an exception is required for this prohibited software version...'
                    : requestMode === 'unlisted'
                    ? 'Describe why this unlisted software is required and what enterprise functions it fulfills...'
                    : 'Explain why this software and version is required for business operations...'
                }
                value={businessJustification}
                onChange={e => setBusinessJustification(e.target.value)}
                required
              />
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
              <Button
                type="submit"
                variant="contained"
                color={isDenied ? 'error' : requestMode === 'unlisted' ? 'warning' : 'primary'}
                startIcon={<SendIcon />}
                disabled={submitting}
                sx={{ px: 3, py: 1 }}
              >
                {submitting
                  ? 'Submitting...'
                  : isDenied
                  ? 'Submit Exception Request for Review'
                  : requestMode === 'unlisted'
                  ? 'Submit Unlisted Software for Governance Review'
                  : 'Submit Software Request'}
              </Button>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
