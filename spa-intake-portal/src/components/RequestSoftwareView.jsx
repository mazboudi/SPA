import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, CardHeader, CardContent, Grid, TextField, FormControl, InputLabel,
  Select, MenuItem, Button, Box, Typography, Alert, AlertTitle, Chip, Divider,
  Paper, CircularProgress, Autocomplete, ToggleButtonGroup, ToggleButton,
  FormControlLabel, Checkbox, Avatar, Skeleton,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SecurityIcon from '@mui/icons-material/Security';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlineOutlined';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import PersonIcon from '@mui/icons-material/Person';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import BadgeIcon from '@mui/icons-material/Badge';
import LaptopWindowsIcon from '@mui/icons-material/LaptopWindows';

// Avatar initials helper
function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

// Section wrapper component
function Section({ number, icon, title, children }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, mb: 3, backgroundColor: '#f8fafc', borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
        <Box sx={{
          width: 26, height: 26, borderRadius: '50%', bgcolor: '#2563eb', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.75rem', fontWeight: 800, flexShrink: 0,
        }}>
          {number}
        </Box>
        {icon}
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>{title}</Typography>
      </Box>
      {children}
    </Paper>
  );
}

export default function RequestSoftwareView({ onSubmitted, loggedInUser = {} }) {
  // Catalog state
  const [catalog, setCatalog] = useState([]);
  const [totalCount, setTotalCount] = useState(3436);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  // Request mode
  const [requestMode, setRequestMode] = useState('catalog');

  // Catalog form state
  const [selectedTitleId, setSelectedTitleId] = useState('');
  const [selectedVersion, setSelectedVersion] = useState('');

  // Unlisted form state
  const [unlistedTitleName, setUnlistedTitleName] = useState('');
  const [unlistedPublisher, setUnlistedPublisher] = useState('');
  const [unlistedVersion, setUnlistedVersion] = useState('');
  const [unlistedCategory, setUnlistedCategory] = useState('Developer Tools');
  const [unlistedDownloadUrl, setUnlistedDownloadUrl] = useState('');

  // Deployment state
  const [platform, setPlatform] = useState('windows');
  const [department, setDepartment] = useState('');
  const [targetDevice, setTargetDevice] = useState('');
  const [installType, setInstallType] = useState('New Install');
  const [deploymentScope, setDeploymentScope] = useState('Individual');
  const [priority, setPriority] = useState('Medium');
  const [businessJustification, setBusinessJustification] = useState('');

  // Requester (logged-on user)
  const [identityLoading, setIdentityLoading] = useState(true);
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');

  // On-behalf state
  const [requestingForSelf, setRequestingForSelf] = useState(true);
  const [onBehalfName, setOnBehalfName] = useState('');
  const [onBehalfEmail, setOnBehalfEmail] = useState('');

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

  // Seed requester fields from the loggedInUser prop (provided by App.jsx)
  // Falls back to a direct whoami fetch if the prop hasn't loaded yet
  useEffect(() => {
    if (loggedInUser.username || loggedInUser.displayName) {
      setRequesterName(loggedInUser.displayName || loggedInUser.username || '');
      setRequesterEmail(loggedInUser.email || '');
      setIdentityLoading(false);
    } else {
      // fallback: direct fetch (e.g. component used standalone)
      fetch('/api/intake/whoami')
        .then((r) => r.json())
        .then((data) => {
          setRequesterName(data.displayName || data.username || '');
          setRequesterEmail(data.email || '');
        })
        .catch(() => {})
        .finally(() => setIdentityLoading(false));
    }
  }, [loggedInUser.username, loggedInUser.displayName, loggedInUser.email]);

  // Toggle on-behalf
  const handleToggleSelf = (e) => {
    const isSelf = e.target.checked;
    setRequestingForSelf(isSelf);
    if (isSelf) { setOnBehalfName(''); setOnBehalfEmail(''); }
  };

  // Catalog fetch
  const fetchCatalog = (searchStr = '') => {
    setCatalogLoading(true);
    const url = searchStr.trim()
      ? `/api/intake/catalog?search=${encodeURIComponent(searchStr)}&limit=150`
      : `/api/intake/catalog?limit=150`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data?.titles) {
          setCatalog(data.titles);
          if (data.totalInDatabase) setTotalCount(data.totalInDatabase);
        }
      })
      .catch(() => {})
      .finally(() => setCatalogLoading(false));
  };

  useEffect(() => { fetchCatalog(''); }, []);
  useEffect(() => {
    if (!searchInput) return;
    const t = setTimeout(() => fetchCatalog(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Derived selections
  const selectedModel = useMemo(() => {
    if (!selectedTitleId || !catalog.length) return null;
    return catalog.find((t) => t.id === selectedTitleId) || null;
  }, [catalog, selectedTitleId]);

  const selectedVersionObj = useMemo(() => {
    if (!selectedModel?.versions?.length || !selectedVersion) return null;
    return selectedModel.versions.find((v) => v.version === selectedVersion) || null;
  }, [selectedModel, selectedVersion]);

  useEffect(() => {
    if (selectedModel?.versions?.length) {
      if (!selectedModel.versions.some((v) => v.version === selectedVersion))
        setSelectedVersion(selectedModel.versions[0].version);
    } else if (!selectedModel) {
      setSelectedVersion('');
    }
  }, [selectedModel]);

  const isDenied = requestMode === 'catalog' && selectedVersionObj?.disposition === 'Denied';

  // Submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (requestMode === 'catalog') {
      if (!selectedModel) { alert('Please search and select an authoritative software title.'); return; }
      if (!selectedVersion) { alert('Please select a software version.'); return; }
    } else {
      if (!unlistedTitleName.trim() || !unlistedPublisher.trim() || !unlistedVersion.trim()) {
        alert('Please fill in Title Name, Publisher, and Version for the unlisted software.');
        return;
      }
    }

    if (!requesterName.trim() || !requesterEmail.trim()) {
      alert('Requester name and email are required.');
      return;
    }

    if (!requestingForSelf && (!onBehalfName.trim() || !onBehalfEmail.trim())) {
      alert('On-behalf name and email are required when requesting for someone else.');
      return;
    }

    if (!businessJustification.trim()) { alert('Business justification is required.'); return; }

    setSubmitting(true);
    setSuccessMsg(null);

    const isUnlisted = requestMode === 'unlisted';
    const benefName  = requestingForSelf ? requesterName  : onBehalfName;
    const benefEmail = requestingForSelf ? requesterEmail : onBehalfEmail;

    const payload = {
      isUnlisted,
      titleId:       isUnlisted ? null : selectedModel.id,
      titleName:     isUnlisted ? unlistedTitleName.trim() : selectedModel.displayName,
      publisher:     isUnlisted ? unlistedPublisher.trim() : selectedModel.publisher,
      version:       isUnlisted ? unlistedVersion.trim()   : selectedVersion,
      platform,
      category:      isUnlisted ? unlistedCategory : selectedModel.category,
      installerType: isUnlisted ? 'msi' : (selectedModel.defaultInstallerType?.[platform] || 'msi'),
      installerSource: isUnlisted ? unlistedDownloadUrl.trim() : '',
      requestedBy:   requesterName.trim(),
      requesterEmail: requesterEmail.trim(),
      requestedFor:   benefName.trim(),
      beneficiaryEmail: benefEmail.trim(),
      department:    department.trim(),
      targetDevice:  targetDevice.trim(),
      installType:   isDenied ? 'Exception' : installType,
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

      setSuccessMsg(`Request ${data.request.number} submitted! Stage: ${data.request.stage.toUpperCase()}`);
      setSelectedTitleId(''); setSelectedVersion(''); setUnlistedTitleName('');
      setUnlistedPublisher(''); setUnlistedVersion(''); setUnlistedDownloadUrl('');
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

            {/* ── SECTION 1: Requester Information ─────────────────────── */}
            <Section number="1" icon={<BadgeIcon sx={{ fontSize: 18, color: '#2563eb' }} />} title="Requester Information">

              {/* Identity card */}
              <Paper variant="outlined" sx={{
                p: 1.5, mb: 2.5, backgroundColor: '#ffffff', borderRadius: 1.5,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 1.5, borderColor: '#bfdbfe',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  {identityLoading
                    ? <Skeleton variant="circular" width={36} height={36} />
                    : <Avatar sx={{ bgcolor: '#2563eb', width: 36, height: 36, fontSize: '0.85rem', fontWeight: 700 }}>
                        {initials(requesterName) || <PersonIcon fontSize="small" />}
                      </Avatar>
                  }
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                      <LaptopWindowsIcon sx={{ fontSize: 13, mr: 0.5, verticalAlign: 'middle', color: '#64748b' }} />
                      Logged-on Windows User
                    </Typography>
                    {identityLoading
                      ? <Skeleton width={220} height={14} />
                      : <Typography variant="caption" sx={{ color: '#64748b' }}>
                          {requesterName || '—'}&nbsp;•&nbsp;{requesterEmail || '—'}
                        </Typography>
                    }
                  </Box>
                </Box>
                <Chip label="Auto-detected from OS" size="small" color="primary" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
              </Paper>

              {/* Requester editable fields */}
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth size="small" label="Requester Full Name *"
                    value={requesterName} onChange={(e) => setRequesterName(e.target.value)}
                    required helperText="Your full name as the person submitting this request"
                    InputProps={{ startAdornment: <PersonIcon sx={{ fontSize: 16, mr: 0.5, color: '#94a3b8' }} /> }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth size="small" label="Requester Email Address *" type="email"
                    value={requesterEmail} onChange={(e) => setRequesterEmail(e.target.value)}
                    required helperText="Your corporate email address for notifications"
                  />
                </Grid>
              </Grid>

              {/* On-behalf toggle */}
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                mb: requestingForSelf ? 0 : 2, px: 1.5, py: 1,
                bgcolor: '#eff6ff', borderRadius: 1.5, border: '1px solid #bfdbfe',
              }}>
                <PeopleAltIcon sx={{ fontSize: 18, color: '#2563eb' }} />
                <FormControlLabel
                  sx={{ m: 0 }}
                  control={<Checkbox checked={requestingForSelf} onChange={handleToggleSelf} color="primary" size="small" />}
                  label={<Typography variant="body2" sx={{ fontWeight: 600, color: '#1e40af' }}>I am requesting this software for myself</Typography>}
                />
                {requestingForSelf && (
                  <Typography variant="caption" sx={{ color: '#64748b', ml: 'auto' }}>
                    Uncheck to specify a different beneficiary
                  </Typography>
                )}
              </Box>

              {/* On-behalf fields */}
              {!requestingForSelf && (
                <Paper variant="outlined" sx={{ p: 2, mt: 0, borderRadius: 1.5, borderColor: '#fde68a', bgcolor: '#fffbeb' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#92400e', display: 'block', mb: 1.5 }}>
                    ON BEHALF OF — End-user who will receive the software
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth size="small" label="On-Behalf Full Name *" placeholder="e.g. Jane Smith"
                        value={onBehalfName} onChange={(e) => setOnBehalfName(e.target.value)}
                        required={!requestingForSelf} helperText="Full name of the person who will use this software"
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth size="small" label="On-Behalf Email Address *" type="email"
                        placeholder="e.g. jane.smith@company.com"
                        value={onBehalfEmail} onChange={(e) => setOnBehalfEmail(e.target.value)}
                        required={!requestingForSelf} helperText="Software entitlement & notifications will be sent here"
                      />
                    </Grid>
                  </Grid>
                </Paper>
              )}
            </Section>

            {/* ── SECTION 2: Software Selection ────────────────────────── */}
            <Section number="2" icon={<LibraryBooksIcon sx={{ fontSize: 18, color: '#2563eb' }} />} title="Software Selection & Vetting Disposition">

              {/* Mode toggle */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                <ToggleButtonGroup value={requestMode} exclusive onChange={(_, val) => { if (val) setRequestMode(val); }} size="small" sx={{ backgroundColor: '#ffffff' }}>
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

              {/* Catalog mode */}
              {requestMode === 'catalog' && (
                <Grid container spacing={2.5}>
                  <Grid item xs={12}>
                    <Autocomplete
                      id="software-title-autocomplete" fullWidth options={catalog} loading={catalogLoading}
                      getOptionLabel={(option) => {
                        if (!option) return '';
                        if (typeof option === 'string') return option;
                        return `${option.displayName || ''} (${option.publisher || ''})`;
                      }}
                      value={selectedModel}
                      onInputChange={(_, v, reason) => { if (reason === 'input') setSearchInput(v); }}
                      onChange={(_, newValue) => {
                        if (newValue?.id) { setSelectedTitleId(newValue.id); }
                        else { setSelectedTitleId(''); setSelectedVersion(''); }
                      }}
                      isOptionEqualToValue={(o, v) => o?.id === v?.id}
                      renderOption={(props, option) => {
                        const { key, ...rest } = props;
                        return (
                          <li key={key || option.id} {...rest}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', py: 1 }}>
                              <Box>
                                <Typography variant="body1" sx={{ fontWeight: 700, color: '#0f172a' }}>{option.displayName}</Typography>
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
                          placeholder="Type any keyword to search (e.g. Chrome, Docker, Postman, Visual Studio Code)..."
                          helperText={
                            <span>
                              Search across 3,400+ vetted enterprise models. Can't find it?{' '}
                              <a href="#unlisted" onClick={(e) => { e.preventDefault(); setRequestMode('unlisted'); }}
                                style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>
                                Request an Unlisted Software Title
                              </a>
                            </span>
                          }
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="platform-label">Target Platform *</InputLabel>
                      <Select labelId="platform-label" value={platform} label="Target Platform *" onChange={(e) => setPlatform(e.target.value)}>
                        <MenuItem value="windows">Windows (Win32 / PSADT)</MenuItem>
                        <MenuItem value="macos">macOS (Jamf Pro / PKG)</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small" disabled={!selectedModel}>
                      <InputLabel id="version-label">Software Version *</InputLabel>
                      <Select labelId="version-label" value={selectedVersion || ''} label="Software Version *" onChange={(e) => setSelectedVersion(e.target.value)} required>
                        {(selectedModel?.versions || []).map((v) => (
                          <MenuItem key={v.version} value={v.version}>
                            Version {v.version} — [{v.disposition?.toUpperCase() ?? 'UNKNOWN'}]
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              )}

              {/* Unlisted mode */}
              {requestMode === 'unlisted' && (
                <Box>
                  <Alert severity="info" sx={{ mb: 2.5, borderRadius: 2 }} icon={<SecurityIcon fontSize="inherit" />}>
                    <AlertTitle sx={{ fontWeight: 700 }}>Unlisted Software Intake & Governance Lifecycle</AlertTitle>
                    This title is not in the Authoritative Catalog. Submitting will auto-generate a{' '}
                    <strong>Cybersecurity & Architecture Disposition Review</strong> task. Upon approval it will be permanently enrolled into the enterprise catalog.
                  </Alert>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth size="small" required label="Software Title Name *" placeholder="e.g. Postman Enterprise, DBeaver, Docker Desktop" value={unlistedTitleName} onChange={(e) => setUnlistedTitleName(e.target.value)} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth size="small" required label="Publisher / Vendor *" placeholder="e.g. Postman Inc., DBeaver Corp." value={unlistedPublisher} onChange={(e) => setUnlistedPublisher(e.target.value)} />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField fullWidth size="small" required label="Requested Version / Release *" placeholder="e.g. 10.22.0, Latest" value={unlistedVersion} onChange={(e) => setUnlistedVersion(e.target.value)} />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="unlisted-platform-label">Target Platform *</InputLabel>
                        <Select labelId="unlisted-platform-label" value={platform} label="Target Platform *" onChange={(e) => setPlatform(e.target.value)}>
                          <MenuItem value="windows">Windows (Win32 / PSADT)</MenuItem>
                          <MenuItem value="macos">macOS (Jamf Pro / PKG)</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="unlisted-cat-label">Application Category</InputLabel>
                        <Select labelId="unlisted-cat-label" value={unlistedCategory} label="Application Category" onChange={(e) => setUnlistedCategory(e.target.value)}>
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
                      <TextField fullWidth size="small" label="Vendor Download URL or Installer Network Share (Optional)" placeholder="https://vendor.com/download/pkg.exe or \\corp.net\share\installer.msi" value={unlistedDownloadUrl} onChange={(e) => setUnlistedDownloadUrl(e.target.value)} />
                    </Grid>
                  </Grid>
                </Box>
              )}
            </Section>

            {/* ── SECTION 3: Deployment Details ────────────────────────── */}
            <Section number="3" icon={<LaptopWindowsIcon sx={{ fontSize: 18, color: '#2563eb' }} />} title="Deployment Details">
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} md={6}>
                  <TextField fullWidth size="small" label="Department / Cost Center *" value={department} onChange={(e) => setDepartment(e.target.value)} required />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField fullWidth size="small" label="Target Device / Workstation Hostname" value={targetDevice} onChange={(e) => setTargetDevice(e.target.value)} placeholder="e.g. W11-ENG-08912 or MAC-DESK-010" />
                </Grid>
              </Grid>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="install-type-label">Install Type</InputLabel>
                    <Select labelId="install-type-label" value={isDenied ? 'Exception' : installType} label="Install Type" onChange={(e) => setInstallType(e.target.value)} disabled={isDenied}>
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
                    <Select labelId="deployment-scope-label" value={deploymentScope} label="Deployment Scope" onChange={(e) => setDeploymentScope(e.target.value)}>
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
                    <Select labelId="priority-label" value={priority} label="Priority" onChange={(e) => setPriority(e.target.value)}>
                      <MenuItem value="Low">Low</MenuItem>
                      <MenuItem value="Medium">Medium</MenuItem>
                      <MenuItem value="High">High</MenuItem>
                      <MenuItem value="Critical">Critical</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </Section>

            {/* ── SECTION 4: Business Justification ────────────────────── */}
            <Box sx={{ mb: 3 }}>
              <TextField
                fullWidth multiline rows={3}
                label={
                  isDenied ? 'Business Justification for Prohibited Software Exception *'
                  : requestMode === 'unlisted' ? 'Business Justification & Architecture Use Case for Unlisted Software *'
                  : 'Business Justification & Operational Use Case *'
                }
                placeholder={
                  isDenied ? 'Explain why an exception is required for this prohibited software version...'
                  : requestMode === 'unlisted' ? 'Describe why this unlisted software is required and what enterprise functions it fulfills...'
                  : 'Explain why this software and version is required for business operations...'
                }
                value={businessJustification}
                onChange={(e) => setBusinessJustification(e.target.value)}
                required
              />
            </Box>

            {/* Submit */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
              <Button
                type="submit" variant="contained"
                color={isDenied ? 'error' : requestMode === 'unlisted' ? 'warning' : 'primary'}
                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                disabled={submitting} sx={{ px: 3, py: 1 }}
              >
                {submitting ? 'Submitting...'
                  : isDenied ? 'Submit Exception Request for Review'
                  : requestMode === 'unlisted' ? 'Submit Unlisted Software for Governance Review'
                  : 'Submit Software Request'}
              </Button>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
