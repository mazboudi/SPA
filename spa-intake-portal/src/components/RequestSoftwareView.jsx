import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, CardHeader, CardContent, Grid, TextField, FormControl, InputLabel,
  Select, MenuItem, Button, Box, Typography, Alert, AlertTitle, Chip, Divider,
  Paper, CircularProgress, Autocomplete, FormHelperText,
  FormControlLabel, Checkbox, Avatar, Skeleton,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
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
function Section({ number, icon, title, action, children }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, mb: 3, backgroundColor: '#f8fafc', borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5, flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
        {action && <Box sx={{ display: 'flex', alignItems: 'center' }}>{action}</Box>}
      </Box>
      {children}
    </Paper>
  );
}

export default function RequestSoftwareView({ onSubmitted, onNavigate, loggedInUser = {} }) {
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

  // New version request state (Use Case 2)
  const [isNewVersionRequested, setIsNewVersionRequested] = useState(false);
  const [customVersion, setCustomVersion] = useState('');

  // Unlisted form state (Use Case 4)
  const [unlistedTitleName, setUnlistedTitleName] = useState('');
  const [unlistedPublisher, setUnlistedPublisher] = useState('');
  const [unlistedVersion, setUnlistedVersion] = useState('');
  const [unlistedCategory, setUnlistedCategory] = useState('Developer Tools');
  const [unlistedLicenseRequired, setUnlistedLicenseRequired] = useState('No');
  const [unlistedDownloadUrl, setUnlistedDownloadUrl] = useState('');

  // Company Portal referral modal (Use Case 1)
  const [companyPortalModal, setCompanyPortalModal] = useState({
    open: false,
    appName: '',
    version: '',
    instructions: [],
  });

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [successData, setSuccessData] = useState(null);

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
    setIsNewVersionRequested(false);
    setCustomVersion('');
  }, [selectedModel]);

  const isDenied = requestMode === 'catalog' && (
    selectedModel?.defaultDisposition === 'Denied' ||
    (!isNewVersionRequested && selectedVersionObj?.disposition === 'Denied')
  );

  // Check if selected title/version is already packaged in Intune (Use Case 1)
  const isAvailableInIntune = useMemo(() => {
    if (!selectedModel || requestMode !== 'catalog') return false;
    if (isNewVersionRequested) return false;
    if (isDenied) return false;
    return (selectedModel.packages || []).some(
      (p) => p.version === selectedVersion && (p.packagingStatus === 'Packaged & Ready' || p.intuneAppId)
    );
  }, [selectedModel, selectedVersion, requestMode, isNewVersionRequested, isDenied]);

  const existingIntunePackage = useMemo(() => {
    if (!isAvailableInIntune) return null;
    return (selectedModel.packages || []).find((p) => p.version === selectedVersion) || null;
  }, [isAvailableInIntune, selectedModel, selectedVersion]);

  // Submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (requestMode === 'catalog') {
      if (!selectedModel) { alert('Please search and select an authoritative software title.'); return; }
      if (isNewVersionRequested) {
        if (!customVersion.trim()) { alert('Please enter the specific software version number you are requesting.'); return; }
      } else if (!selectedVersion) {
        alert('Please select a software version.'); return;
      }
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

    const targetVersion = isUnlisted
      ? unlistedVersion.trim()
      : (isNewVersionRequested ? customVersion.trim() : selectedVersion);

    const payload = {
      isUnlisted,
      isNewVersion: !isUnlisted && isNewVersionRequested,
      licenseRequired: isUnlisted ? unlistedLicenseRequired : (selectedModel?.licenseRequired || 'No'),
      titleId:       isUnlisted ? null : selectedModel.id,
      titleName:     isUnlisted ? unlistedTitleName.trim() : selectedModel.displayName,
      publisher:     isUnlisted ? unlistedPublisher.trim() : selectedModel.publisher,
      version:       targetVersion,
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

      // Use Case 1: Instant install referral via Company Portal (no ticket created)
      if (data.instantAvailable) {
        setCompanyPortalModal({
          open: true,
          appName: data.intuneAppName || selectedModel?.displayName,
          version: data.version || selectedVersion,
          instructions: data.instructions || [
            'Open the Windows Start Menu and launch "Company Portal".',
            `Search for "${data.intuneAppName || selectedModel?.displayName}".`,
            'Click "Install" to begin immediate deployment to your workstation.',
          ],
        });
        setSubmitting(false);
        return;
      }

      const targetQueue = data.initialQueue || 'Enterprise Risk';
      const submittedReq = data.request;

      setSuccessData({
        number: submittedReq.number,
        id: submittedReq.id,
        stage: submittedReq.stage,
        queue: targetQueue,
        title: submittedReq.titleName,
        version: submittedReq.version,
        hasRiskTask: data.hasRiskTask !== undefined ? data.hasRiskTask : true,
        hasLicenseTask: data.hasLicenseTask !== undefined ? data.hasLicenseTask : false,
      });

      setSelectedTitleId(''); setSelectedVersion(''); setIsNewVersionRequested(false); setCustomVersion('');
      setUnlistedTitleName(''); setUnlistedPublisher(''); setUnlistedVersion(''); setUnlistedDownloadUrl('');
      setBusinessJustification('');
      if (onSubmitted) onSubmitted(submittedReq, targetQueue);
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
          title="📦 Software Request"
          subheader="Search authoritative corporate software models or request unlisted software for governance and architecture evaluation."
        />
        <Divider />
        <CardContent sx={{ p: 3 }}>
          {successData && (
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                mb: 3,
                bgcolor: '#f0fdf4',
                borderColor: '#86efac',
                borderWidth: '1.5px',
                borderRadius: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <CheckCircleIcon sx={{ color: '#16a34a', fontSize: 30, mt: 0.25 }} />
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#166534' }}>
                      Request {successData.number} Submitted Successfully!
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#15803d', mt: 0.5 }}>
                      Software: <strong>{successData.title} (v{successData.version})</strong> has been routed directly to governance review:{' '}
                      {successData.hasRiskTask && successData.hasLicenseTask ? (
                        <>Active in both <strong>Enterprise Risk Queue</strong> (NIST 2.0 vetting) and <strong>Licensing / SAM Queue</strong> in parallel.</>
                      ) : successData.hasRiskTask ? (
                        <>Active in <strong>Enterprise Risk Queue</strong> for NIST 2.0 vulnerability & policy vetting.</>
                      ) : (
                        <>Active in <strong>Licensing / SAM Queue</strong> for software entitlement and seat allocation.</>
                      )}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                  {successData.hasRiskTask && (
                    <Button
                      variant="contained"
                      color="error"
                      size="small"
                      startIcon={<SecurityIcon />}
                      onClick={() => {
                        if (onNavigate) onNavigate('governance', 'Enterprise Risk');
                        else if (onSubmitted) onSubmitted(successData, 'Enterprise Risk');
                      }}
                      sx={{ textTransform: 'none', fontWeight: 700 }}
                    >
                      Open in Risk Queue →
                    </Button>
                  )}
                  {successData.hasLicenseTask && (
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      onClick={() => {
                        if (onNavigate) onNavigate('governance', 'Software Asset Management');
                        else if (onSubmitted) onSubmitted(successData, 'Software Asset Management');
                      }}
                      sx={{ textTransform: 'none', fontWeight: 700 }}
                    >
                      Open in SAM Queue →
                    </Button>
                  )}
                  {!successData.hasRiskTask && !successData.hasLicenseTask && (
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      onClick={() => {
                        if (onNavigate) onNavigate('governance', successData.queue);
                        else if (onSubmitted) onSubmitted(successData, successData.queue);
                      }}
                      sx={{ textTransform: 'none', fontWeight: 700 }}
                    >
                      Open in {successData.queue} Queue →
                    </Button>
                  )}
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      if (onNavigate) onNavigate('tracker');
                      else if (onSubmitted) onSubmitted(successData);
                    }}
                    sx={{ textTransform: 'none', fontWeight: 600, bgcolor: '#ffffff' }}
                  >
                    Track in RITM Tree
                  </Button>
                  <Button
                    variant="text"
                    size="small"
                    color="inherit"
                    onClick={() => setSuccessData(null)}
                    sx={{ textTransform: 'none', color: '#64748b' }}
                  >
                    Dismiss
                  </Button>
                </Box>
              </Box>
            </Paper>
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
            <Section
              number="2"
              icon={<LibraryBooksIcon sx={{ fontSize: 18, color: '#2563eb' }} />}
              title="Software Selection & Vetting Disposition"
              action={
                requestMode === 'catalog' ? (
                  <Chip
                    icon={<LibraryBooksIcon sx={{ fontSize: '15px !important', color: '#2563eb' }} />}
                    label={`Authoritative Catalog (${totalCount.toLocaleString()} Titles)`}
                    size="small"
                    variant="outlined"
                    sx={{ fontWeight: 600, bgcolor: '#ffffff', borderColor: '#bfdbfe', color: '#1e40af' }}
                  />
                ) : (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setRequestMode('catalog');
                      setUnlistedTitleName('');
                    }}
                    sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem', bgcolor: '#ffffff' }}
                  >
                    ← Back to Catalog Search
                  </Button>
                )
              }
            >
              {/* Catalog mode */}
              {requestMode === 'catalog' && (
                <Grid container spacing={2.5}>
                  <Grid item xs={12}>
                    <Autocomplete
                      id="software-title-autocomplete"
                      fullWidth
                      options={catalog}
                      loading={catalogLoading}
                      getOptionLabel={(option) => {
                        if (!option) return '';
                        if (typeof option === 'string') return option;
                        if (option.isUnlistedOption) return option.displayName || '';
                        return `${option.displayName || ''} (${option.publisher || ''})`;
                      }}
                      filterOptions={(options, params) => {
                        const filtered = options.filter((opt) => {
                          const q = params.inputValue.toLowerCase().trim();
                          if (!q) return true;
                          return (
                            (opt.displayName && opt.displayName.toLowerCase().includes(q)) ||
                            (opt.publisher && opt.publisher.toLowerCase().includes(q)) ||
                            (opt.category && opt.category.toLowerCase().includes(q))
                          );
                        });
                        // Always include an unlisted selection option at the bottom
                        filtered.push({
                          id: '__unlisted_option__',
                          displayName: params.inputValue.trim()
                            ? `Can't find it? Request "${params.inputValue.trim()}" as Unlisted Software...`
                            : `Can't find your software? Select Unlisted Software...`,
                          isUnlistedOption: true,
                          typedQuery: params.inputValue.trim(),
                        });
                        return filtered;
                      }}
                      noOptionsText={
                        <Box sx={{ py: 1.5, px: 1, textAlign: 'center' }}>
                          <Typography variant="body2" sx={{ color: '#64748b', mb: 1 }}>
                            No matching software found in the authoritative catalog {searchInput ? `for "${searchInput}"` : ''}.
                          </Typography>
                          <Button
                            size="small"
                            variant="contained"
                            color="warning"
                            startIcon={<AddCircleOutlineIcon />}
                            onClick={() => {
                              setRequestMode('unlisted');
                              setUnlistedTitleName(searchInput.trim());
                              setSelectedTitleId('');
                              setSelectedVersion('');
                            }}
                            sx={{ textTransform: 'none', fontWeight: 600 }}
                          >
                            Request "{searchInput.trim() || 'New Software'}" as Unlisted Software
                          </Button>
                        </Box>
                      }
                      value={selectedModel}
                      onInputChange={(_, v, reason) => { if (reason === 'input') setSearchInput(v); }}
                      onChange={(_, newValue) => {
                        if (newValue?.isUnlistedOption || newValue?.id === '__unlisted_option__') {
                          setRequestMode('unlisted');
                          setUnlistedTitleName(newValue.typedQuery || searchInput.trim() || '');
                          setSelectedTitleId('');
                          setSelectedVersion('');
                        } else if (newValue?.id) {
                          setSelectedTitleId(newValue.id);
                          setRequestMode('catalog');
                        } else {
                          setSelectedTitleId('');
                          setSelectedVersion('');
                        }
                      }}
                      isOptionEqualToValue={(o, v) => o?.id === v?.id}
                      renderOption={(props, option) => {
                        const { key, ...rest } = props;
                        if (option.isUnlistedOption) {
                          return (
                            <li key="__unlisted_opt__" {...rest} style={{ borderTop: '1px dashed #cbd5e1', backgroundColor: '#fffbeb', marginTop: 4 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, width: '100%', color: '#b45309' }}>
                                <AddCircleOutlineIcon sx={{ color: '#d97706', fontSize: 20, flexShrink: 0 }} />
                                <Box sx={{ flexGrow: 1 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#92400e' }}>
                                    {option.displayName}
                                  </Typography>
                                  <Typography variant="caption" sx={{ color: '#b45309' }}>
                                    Initiate cybersecurity & architecture vetting for unlisted software
                                  </Typography>
                                </Box>
                                <Chip label="Select Unlisted" size="small" color="warning" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} />
                              </Box>
                            </li>
                          );
                        }
                        return (
                          <li key={key || option.id} {...rest}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', py: 0.75 }}>
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>{option.displayName}</Typography>
                                <Typography variant="caption" sx={{ color: '#64748b' }}>
                                  {option.publisher} • {option.category} • {option.licenseRequired === 'Yes' ? '🔑 License Required' : '🆓 No License'}
                                </Typography>
                              </Box>
                              <Box sx={{ display: 'flex', gap: 0.75, ml: 2, flexShrink: 0, alignItems: 'center' }}>
                                <Chip
                                  label={option.defaultDisposition || 'Approved'}
                                  size="small"
                                  color={option.defaultDisposition === 'Prohibited' || option.defaultDisposition === 'Denied' ? 'error' : option.defaultDisposition === 'Review Required' ? 'warning' : 'success'}
                                  sx={{ height: 20, fontSize: '0.675rem', fontWeight: 600 }}
                                />
                                <Chip label={`${(option.packages?.length || option.versions?.length || 0)} pkg`} size="small" sx={{ height: 20, fontSize: '0.675rem' }} />
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
                          helperText="Search across 4,660+ vetted enterprise models. If no title matches, select 'Unlisted Software' from the list."
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="platform-label">Target Platform *</InputLabel>
                      <Select
                        labelId="platform-label"
                        value={platform}
                        label="Target Platform *"
                        onChange={(e) => setPlatform(e.target.value)}
                      >
                        <MenuItem value="windows">Windows (Win32 / PSADT)</MenuItem>
                        <MenuItem value="macos">macOS (Jamf Pro / PKG)</MenuItem>
                      </Select>
                      <FormHelperText>Target OS environment for package deployment</FormHelperText>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth size="small" disabled={!selectedModel}>
                      <InputLabel id="version-label">Software Version *</InputLabel>
                      <Select
                        labelId="version-label"
                        value={isNewVersionRequested ? '__request_new_version__' : (selectedVersion || '')}
                        label="Software Version *"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '__request_new_version__') {
                            setIsNewVersionRequested(true);
                          } else {
                            setIsNewVersionRequested(false);
                            setSelectedVersion(val);
                          }
                        }}
                        required
                        renderValue={(selected) => {
                          if (selected === '__request_new_version__') {
                            return (
                              <Typography variant="body2" sx={{ fontWeight: 600, color: '#2563eb' }}>
                                ➕ Request New / Unlisted Version...
                              </Typography>
                            );
                          }
                          const vObj = (selectedModel?.versions || []).find((v) => v.version === selected);
                          const disp = vObj?.disposition || selectedModel?.defaultDisposition || 'Approved';
                          const isDen = disp.toLowerCase() === 'denied' || disp.toLowerCase() === 'prohibited';
                          const isRev = disp.toLowerCase() === 'review required';
                          return (
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1, pr: 0.5 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                Version {selected}
                              </Typography>
                              <Chip
                                label={disp.toUpperCase()}
                                size="small"
                                color={isDen ? 'error' : isRev ? 'warning' : 'success'}
                                sx={{ height: 20, fontSize: '0.675rem', fontWeight: 700, flexShrink: 0 }}
                              />
                            </Box>
                          );
                        }}
                        sx={{
                          '& .MuiSelect-select': {
                            display: 'flex',
                            alignItems: 'center',
                            overflow: 'hidden',
                          },
                        }}
                        MenuProps={{
                          PaperProps: {
                            sx: { maxHeight: 320 },
                          },
                        }}
                      >
                        {(selectedModel?.versions || []).map((v) => {
                          const disp = v.disposition || selectedModel?.defaultDisposition || 'Approved';
                          const isDen = disp.toLowerCase() === 'denied' || disp.toLowerCase() === 'prohibited';
                          const isRev = disp.toLowerCase() === 'review required';
                          return (
                            <MenuItem
                              key={v.version}
                              value={v.version}
                              sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1 }}
                            >
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                Version {v.version}
                              </Typography>
                              <Chip
                                label={disp.toUpperCase()}
                                size="small"
                                color={isDen ? 'error' : isRev ? 'warning' : 'success'}
                                sx={{ height: 20, fontSize: '0.675rem', fontWeight: 700, ml: 2 }}
                              />
                            </MenuItem>
                          );
                        })}
                        <Divider sx={{ my: 0.5 }} />
                        <MenuItem value="__request_new_version__" sx={{ fontWeight: 700, color: '#2563eb' }}>
                          ➕ Request New / Unlisted Version...
                        </MenuItem>
                      </Select>
                      <FormHelperText sx={{
                        color: isDenied ? '#dc2626' : undefined,
                        fontWeight: isDenied ? 600 : undefined,
                      }}>
                        {!selectedModel
                          ? 'Select a software title above first'
                          : isDenied
                          ? '⚠️ Prohibited version: Submitting will route as an Exception Request'
                          : isNewVersionRequested
                          ? 'Unlisted version request: Will route to Enterprise Risk Review'
                          : isAvailableInIntune
                          ? '✅ Approved release: Packaged and available in Company Portal'
                          : 'Select authoritative catalog version or request new version'}
                      </FormHelperText>
                    </FormControl>
                  </Grid>

                  {/* Custom Version Input when user requests an unlisted version (Use Case 2) */}
                  {isNewVersionRequested && (
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        size="small"
                        required
                        label="Specify Required Version / Release Number *"
                        placeholder="e.g. 14.2.0, 2024.3, or Latest"
                        value={customVersion}
                        onChange={(e) => setCustomVersion(e.target.value)}
                        helperText="Provide the unlisted version or build number. Submitting will route this request to Enterprise Risk Review for vetting."
                      />
                    </Grid>
                  )}

                  {/* Vetting Disposition Guidance Card */}
                  {selectedModel && (
                    <Grid item xs={12}>
                      {isAvailableInIntune ? (
                        /* ── USE CASE 1: Already Packaged & Available in Intune ────── */
                        <Paper variant="outlined" sx={{
                          p: 2.5, borderRadius: 2,
                          bgcolor: '#f0fdf4',
                          borderColor: '#86efac',
                        }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <CheckCircleIcon sx={{ fontSize: 22, color: '#16a34a' }} />
                              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#166534' }}>
                                🚀 Instant Install Available in Microsoft Intune Company Portal
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                              <Chip label="Ready in Intune" color="success" size="small" sx={{ fontWeight: 700 }} />
                              <Chip label={existingIntunePackage?.intuneAppName || selectedModel.displayName} size="small" variant="outlined" sx={{ bgcolor: '#ffffff' }} />
                            </Box>
                          </Box>
                          <Typography variant="body2" sx={{ color: '#15803d', mb: 1.5 }}>
                            This application version is <strong>approved, packaged, and published in the Microsoft Intune Company Portal</strong>. You do not need to wait for a service request or governance approvals!
                          </Typography>
                          <Button
                            variant="contained"
                            color="success"
                            size="small"
                            onClick={() => setCompanyPortalModal({
                              open: true,
                              appName: existingIntunePackage?.intuneAppName || selectedModel.displayName,
                              version: selectedVersion,
                              instructions: [
                                'Open the Windows Start Menu and launch "Company Portal".',
                                `Search for "${existingIntunePackage?.intuneAppName || selectedModel.displayName}".`,
                                'Click "Install" to begin immediate deployment to your workstation.',
                              ],
                            })}
                            sx={{ textTransform: 'none', fontWeight: 700 }}
                          >
                            How to Install via Company Portal
                          </Button>
                        </Paper>
                      ) : isNewVersionRequested ? (
                        /* ── USE CASE 2: Approved Title, New Version Requested ────── */
                        <Paper variant="outlined" sx={{
                          p: 2, borderRadius: 2,
                          bgcolor: '#eff6ff',
                          borderColor: '#bfdbfe',
                        }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <SecurityIcon sx={{ fontSize: 20, color: '#2563eb' }} />
                              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e40af' }}>
                                New Version Request: {selectedModel.displayName} (v{customVersion || 'New'})
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                              <Chip label="Risk Review Required" size="small" color="warning" sx={{ fontWeight: 700 }} />
                              {selectedModel.licenseRequired === 'Yes' && (
                                <Chip label="Licensing Review" size="small" color="info" sx={{ fontWeight: 700 }} />
                              )}
                            </Box>
                          </Box>
                          <Typography variant="body2" sx={{ color: '#1e40af' }}>
                            You are requesting an unvetted release for an approved software title. Submitting will route this request to <strong>Enterprise Risk Review</strong>
                            {selectedModel.licenseRequired === 'Yes' ? ' and Software Asset Management (SAM) Licensing Review.' : '.'} Upon clearance, the EUC team will package and deploy the release.
                          </Typography>
                        </Paper>
                      ) : isDenied ? (
                        /* ── USE CASE 3: Denied Software Exception ────────────────── */
                        <Paper variant="outlined" sx={{
                          p: 2.5, borderRadius: 2,
                          bgcolor: '#fef2f2',
                          borderColor: '#fca5a5',
                          borderWidth: '1.5px',
                        }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <SecurityIcon sx={{ fontSize: 22, color: '#dc2626' }} />
                              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#991b1b', fontSize: '0.95rem' }}>
                                ⚠️ Policy Exception Request: {selectedModel.displayName} {selectedVersion ? `(v${selectedVersion})` : ''}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                              <Chip label="Exception Request" size="small" color="error" sx={{ fontWeight: 700 }} />
                              <Chip label="Install Type: Exception" size="small" variant="outlined" sx={{ bgcolor: '#fff', borderColor: '#fca5a5', color: '#991b1b', fontWeight: 600 }} />
                              {selectedModel.licenseRequired === 'Yes' && (
                                <Chip label="Licensing Review" size="small" color="info" sx={{ fontWeight: 700 }} />
                              )}
                            </Box>
                          </Box>
                          <Typography variant="body2" sx={{ color: '#991b1b', mb: selectedVersionObj?.dispositionReason ? 1 : 0 }}>
                            This software version is designated as <strong>Denied / Prohibited</strong> by enterprise security policy. Submitting will initiate a formal policy exception routed to <strong>Enterprise Risk Review</strong>
                            {selectedModel.licenseRequired === 'Yes' ? ' and Software Asset Management (SAM) Licensing Review' : ''} for architecture waiver evaluation.
                          </Typography>
                          {selectedVersionObj?.dispositionReason && (
                            <Box sx={{ mt: 1, p: 1, bgcolor: '#fee2e2', borderRadius: 1, border: '1px dashed #f87171' }}>
                              <Typography variant="caption" sx={{ color: '#7f1d1d', fontWeight: 600, display: 'block' }}>
                                🛡️ Policy Restriction Reason: {selectedVersionObj.dispositionReason}
                              </Typography>
                            </Box>
                          )}
                        </Paper>
                      ) : (
                        /* ── Standard Approved Catalog Model ──────────────────────── */
                        <Paper variant="outlined" sx={{
                          p: 2, borderRadius: 2,
                          bgcolor: selectedModel.defaultDisposition === 'Review Required' ? '#fffbeb' : '#f0fdf4',
                          borderColor: selectedModel.defaultDisposition === 'Review Required' ? '#fde68a' : '#bbf7d0',
                        }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <SecurityIcon sx={{
                                fontSize: 20,
                                color: selectedModel.defaultDisposition === 'Review Required' ? '#d97706' : '#16a34a',
                              }} />
                              <Typography variant="subtitle2" sx={{
                                fontWeight: 700,
                                color: selectedModel.defaultDisposition === 'Review Required' ? '#92400e' : '#166534',
                              }}>
                                Vetting Disposition: {selectedModel.displayName}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                              <Chip
                                label={selectedVersionObj?.disposition || selectedModel.defaultDisposition || 'Approved'}
                                size="small"
                                color={selectedModel.defaultDisposition === 'Review Required' ? 'warning' : 'success'}
                                sx={{ fontWeight: 700 }}
                              />
                              <Chip
                                label={selectedModel.category || 'General'}
                                size="small"
                                variant="outlined"
                                sx={{ bgcolor: '#ffffff', fontWeight: 600 }}
                              />
                            </Box>
                          </Box>
                          <Typography variant="body2" sx={{
                            color: selectedModel.defaultDisposition === 'Review Required' ? '#92400e' : '#15803d',
                            mb: 0.5,
                          }}>
                            {selectedModel.defaultDisposition === 'Review Required'
                              ? 'ℹ️ Review Required: This title requires standard cybersecurity and enterprise architecture approval before deployment.'
                              : '✅ Approved Catalog Title: Standard corporate software. Entitlement and deployment can be automated via Intune.'}
                          </Typography>
                          {selectedModel.packages?.length > 0 && (
                            <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 0.5 }}>
                              📦 {selectedModel.packages.length} Intune deployment package(s) available for {selectedModel.publisher}
                            </Typography>
                          )}
                        </Paper>
                      )}
                    </Grid>
                  )}
                </Grid>
              )}

              {/* ── USE CASE 4: Unlisted mode ─────────────────────────────── */}
              {requestMode === 'unlisted' && (
                <Box>
                  <Alert
                    severity="info"
                    sx={{ mb: 2.5, borderRadius: 2 }}
                    icon={<SecurityIcon fontSize="inherit" />}
                    action={
                      <Button
                        size="small"
                        color="inherit"
                        onClick={() => {
                          setRequestMode('catalog');
                          setUnlistedTitleName('');
                        }}
                        sx={{ textTransform: 'none', fontWeight: 600 }}
                      >
                        Cancel & Return
                      </Button>
                    }
                  >
                    <AlertTitle sx={{ fontWeight: 700 }}>Unlisted Software Intake & Governance Routing</AlertTitle>
                    This title is not currently in the Authoritative Catalog. Submitting will route it to{' '}
                    <strong>Enterprise Risk Review</strong>
                    {unlistedLicenseRequired === 'Yes' ? ' and Software Asset Management (SAM) Licensing Review' : ''}
                    . Upon clearance, it will be packaged and permanently enrolled into the enterprise catalog.
                  </Alert>
                  <Grid container spacing={2.5}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth size="small" required
                        label="Software Title Name *"
                        placeholder="e.g. Postman Enterprise, DBeaver, Docker Desktop"
                        value={unlistedTitleName}
                        onChange={(e) => setUnlistedTitleName(e.target.value)}
                        helperText="Official application or product name"
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth size="small" required
                        label="Publisher / Vendor Name *"
                        placeholder="e.g. Postman Inc., DBeaver Corp."
                        value={unlistedPublisher}
                        onChange={(e) => setUnlistedPublisher(e.target.value)}
                        helperText="Software vendor, developer, or manufacturer"
                      />
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <TextField
                        fullWidth size="small" required
                        label="Requested Version / Release *"
                        placeholder="e.g. 10.22.0, Latest"
                        value={unlistedVersion}
                        onChange={(e) => setUnlistedVersion(e.target.value)}
                        helperText="Target version or build number"
                      />
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="unlisted-platform-label">Target Platform *</InputLabel>
                        <Select labelId="unlisted-platform-label" value={platform} label="Target Platform *" onChange={(e) => setPlatform(e.target.value)}>
                          <MenuItem value="windows">Windows (Win32 / PSADT)</MenuItem>
                          <MenuItem value="macos">macOS (Jamf Pro / PKG)</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} md={3}>
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
                    <Grid item xs={12} md={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="unlisted-license-label">Commercial License? *</InputLabel>
                        <Select
                          labelId="unlisted-license-label"
                          value={unlistedLicenseRequired}
                          label="Commercial License? *"
                          onChange={(e) => setUnlistedLicenseRequired(e.target.value)}
                        >
                          <MenuItem value="No">No (Free / Standard)</MenuItem>
                          <MenuItem value="Yes">Yes (Paid License / SAM)</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth size="small"
                        label="Vendor Download URL or Installer Network Share (Optional)"
                        placeholder="https://vendor.com/download/pkg.exe or \\corp.net\share\installer.msi"
                        value={unlistedDownloadUrl}
                        onChange={(e) => setUnlistedDownloadUrl(e.target.value)}
                        helperText="Direct download link or corporate network file share containing installer binaries"
                      />
                    </Grid>
                  </Grid>
                </Box>
              )}
            </Section>

            {/* ── SECTION 3: Deployment Details ────────────────────────── */}
            <Section number="3" icon={<LaptopWindowsIcon sx={{ fontSize: 18, color: '#2563eb' }} />} title="Deployment Details">
              <Grid container spacing={2.5}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth size="small"
                    label="Department / Cost Center *"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    required
                    helperText="Organizational unit responsible for software licensing & chargeback"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth size="small"
                    label="Target Device / Workstation Hostname"
                    value={targetDevice}
                    onChange={(e) => setTargetDevice(e.target.value)}
                    placeholder="e.g. W11-ENG-08912 or MAC-DESK-010"
                    helperText="Endpoint device where the software package will be deployed"
                  />
                </Grid>
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

      {/* Instant Install / Company Portal Referral Modal (Use Case 1) */}
      <Dialog
        open={companyPortalModal.open}
        onClose={() => setCompanyPortalModal({ open: false, appName: '', version: '', instructions: [] })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: '#166534', fontWeight: 800 }}>
          <CheckCircleIcon sx={{ fontSize: 26, color: '#16a34a' }} />
          Instant Install: Microsoft Intune Company Portal
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2, color: '#1e293b', fontSize: '0.95rem' }}>
            Good news! <strong>{companyPortalModal.appName}</strong> (v{companyPortalModal.version}) is <strong>already approved, packaged, and published</strong> in your corporate Microsoft Intune catalog.
          </DialogContentText>
          <Paper variant="outlined" sx={{ p: 2.5, bgcolor: '#f0fdf4', borderColor: '#bbf7d0', borderRadius: 2, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: '#166534' }}>
              How to Install Immediately:
            </Typography>
            <ol style={{ margin: 0, paddingLeft: 20, color: '#166534', lineHeight: 1.8 }}>
              {(companyPortalModal.instructions || []).map((step, idx) => (
                <li key={idx} style={{ marginBottom: 4 }}><strong>{step}</strong></li>
              ))}
            </ol>
          </Paper>
          <Typography variant="caption" sx={{ color: '#64748b' }}>
            ℹ️ No ticket or approval request was created because this software is already available for instant deployment.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 0 }}>
          <Button
            variant="contained"
            color="success"
            onClick={() => setCompanyPortalModal({ open: false, appName: '', version: '', instructions: [] })}
            sx={{ textTransform: 'none', fontWeight: 700, px: 3 }}
          >
            Understood, Launch Company Portal
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
