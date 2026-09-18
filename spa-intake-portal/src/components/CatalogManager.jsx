import React, { useState, useEffect, useMemo } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Box,
  Typography,
  Button,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  Divider,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  InputAdornment,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Switch,
  Snackbar,
  Alert,
  Tooltip,
  Stack,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Search,
  Clear,
  FilterList,
  CheckCircle,
  Cancel,
  WarningAmber,
  Computer,
  Apple,
  Cloud,
  Security,
  Inventory2,
  Verified,
  Block,
  Info,
  Refresh,
} from '@mui/icons-material';

const DATA_CLASSIFICATIONS = ['Internal', 'Public', 'Confidential', 'Restricted'];
const HOW_TO_OBTAIN_OPTIONS = ['Intune', 'Ariba', 'Direct Download', 'Vendor Portal', 'Self-Service', 'N/A'];
const PACKAGING_STATUS_OPTIONS = ['Packaged & Ready', 'Available', 'Not Packaged', 'Prohibited', 'Deprecated'];
const DISPOSITION_OPTIONS = ['Approved', 'Denied', 'Review Required'];

export default function CatalogManager() {
  const [catalog, setCatalog] = useState([]);
  const [categories, setCategories] = useState([]);
  const [totalInDatabase, setTotalInDatabase] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedTitle, setSelectedTitle] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [selectedDisposition, setSelectedDisposition] = useState('all');

  // Model Dialog State
  const [openModelDialog, setOpenModelDialog] = useState(false);
  const [isEditingModel, setIsEditingModel] = useState(false);
  const [modelForm, setModelForm] = useState({
    id: '',
    displayName: '',
    publisher: '',
    category: 'Business',
    subcategory: '',
    supportedPlatforms: ['windows'],
    licenseRequired: 'No',
    isSaaSOrInternetFacing: false,
    dataClassification: 'Internal',
    howToObtain: 'Intune',
    description: '',
  });

  // Model Delete State
  const [openDeleteModelDialog, setOpenDeleteModelDialog] = useState(false);

  // Version Dialog State
  const [openVersionDialog, setOpenVersionDialog] = useState(false);
  const [isEditingVersion, setIsEditingVersion] = useState(false);
  const [versionForm, setVersionForm] = useState({
    id: '',
    version: '',
    disposition: 'Approved',
    dispositionReason: '',
    alternative: '',
    packagingStatus: 'Packaged & Ready',
    packageRefWindows: '',
    packageRefMac: '',
    installerSourceWindows: '',
    installerSourceMac: '',
  });

  // Version Delete State
  const [openDeleteVersionDialog, setOpenDeleteVersionDialog] = useState(false);
  const [targetVersion, setTargetVersion] = useState(null);

  // Toast Feedback State
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const showToast = (message, severity = 'success') => setSnackbar({ open: true, message, severity });

  // 1. Fetch Categories
  const loadCategories = () => {
    fetch('/api/intake/catalog/categories')
      .then(res => res.json())
      .then(data => {
        if (data.categories) setCategories(data.categories);
      })
      .catch(err => console.error('Failed to load categories', err));
  };

  // 2. Fetch Catalog with Active Filters
  const loadCatalog = (keepSelectedId = null) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    if (selectedPlatform !== 'all') params.set('platform', selectedPlatform);
    if (selectedDisposition !== 'all') params.set('disposition', selectedDisposition);
    params.set('limit', '300');

    fetch(`/api/intake/catalog?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        const titles = data.titles || [];
        setCatalog(titles);
        setTotalInDatabase(data.totalInDatabase || titles.length);
        setLoading(false);

        // Update or preserve selection
        const targetId = keepSelectedId || selectedTitle?.id;
        if (targetId) {
          const matched = titles.find(t => t.id === targetId);
          if (matched) {
            setSelectedTitle(matched);
            return;
          }
        }
        if (titles.length > 0) {
          setSelectedTitle(titles[0]);
        } else {
          setSelectedTitle(null);
        }
      })
      .catch(err => {
        console.error('Failed to load catalog', err);
        setLoading(false);
        showToast('Error loading catalog: ' + err.message, 'error');
      });
  };

  useEffect(() => {
    loadCategories();
  }, []);

  // Reload on filter changes with debounce for search query
  useEffect(() => {
    const handler = setTimeout(() => {
      loadCatalog();
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery, selectedCategory, selectedPlatform, selectedDisposition]);

  // High-level statistics
  const stats = useMemo(() => {
    let totalVersions = 0;
    let approvedCount = 0;
    let deniedCount = 0;
    let reviewCount = 0;

    catalog.forEach(t => {
      (t.versions || []).forEach(v => {
        totalVersions++;
        if (v.disposition === 'Approved') approvedCount++;
        else if (v.disposition === 'Denied') deniedCount++;
        else if (v.disposition === 'Review Required') reviewCount++;
      });
    });

    return { totalVersions, approvedCount, deniedCount, reviewCount };
  }, [catalog]);

  // Reset Filters
  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedPlatform('all');
    setSelectedDisposition('all');
  };

  // ── Software Model Actions ──────────────────────────────────────────────────
  const handleOpenCreateModel = () => {
    setIsEditingModel(false);
    setModelForm({
      id: '',
      displayName: '',
      publisher: '',
      category: categories[0] || 'Business',
      subcategory: '',
      supportedPlatforms: ['windows'],
      licenseRequired: 'No',
      isSaaSOrInternetFacing: false,
      dataClassification: 'Internal',
      howToObtain: 'Intune',
      description: '',
    });
    setOpenModelDialog(true);
  };

  const handleOpenEditModel = () => {
    if (!selectedTitle) return;
    setIsEditingModel(true);
    setModelForm({
      id: selectedTitle.id,
      displayName: selectedTitle.displayName || '',
      publisher: selectedTitle.publisher || '',
      category: selectedTitle.category || 'Business',
      subcategory: selectedTitle.subcategory || '',
      supportedPlatforms: Array.isArray(selectedTitle.supportedPlatforms) ? selectedTitle.supportedPlatforms : ['windows'],
      licenseRequired: selectedTitle.licenseRequired || 'No',
      isSaaSOrInternetFacing: Boolean(selectedTitle.isSaaSOrInternetFacing),
      dataClassification: selectedTitle.dataClassification || 'Internal',
      howToObtain: selectedTitle.howToObtain || 'Intune',
      description: selectedTitle.description || '',
    });
    setOpenModelDialog(true);
  };

  const handleSaveModel = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        displayName: modelForm.displayName.trim(),
        publisher: modelForm.publisher.trim(),
        category: modelForm.category.trim(),
        subcategory: modelForm.subcategory.trim(),
        supportedPlatforms: modelForm.supportedPlatforms,
        licenseRequired: modelForm.licenseRequired,
        isSaaSOrInternetFacing: modelForm.isSaaSOrInternetFacing,
        dataClassification: modelForm.dataClassification,
        howToObtain: modelForm.howToObtain,
        description: modelForm.description.trim(),
      };

      let res;
      if (isEditingModel) {
        res = await fetch(`/api/intake/catalog/titles/${modelForm.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/intake/catalog/titles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save software model');

      setOpenModelDialog(false);
      showToast(isEditingModel ? 'Software model updated successfully' : 'Software model registered successfully');
      loadCategories();
      loadCatalog(data.title?.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteModel = async () => {
    if (!selectedTitle) return;
    try {
      const res = await fetch(`/api/intake/catalog/titles/${selectedTitle.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete software model');
      }

      setOpenDeleteModelDialog(false);
      showToast(`Model "${selectedTitle.displayName}" removed from catalog.`);
      loadCatalog();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ── Version Record Actions ──────────────────────────────────────────────────
  const handleOpenCreateVersion = () => {
    setIsEditingVersion(false);
    setVersionForm({
      id: '',
      version: '',
      disposition: 'Approved',
      dispositionReason: 'Approved standard version for enterprise EUC deployment.',
      alternative: '',
      packagingStatus: 'Packaged & Ready',
      packageRefWindows: selectedTitle ? `titles/${selectedTitle.id}` : '',
      packageRefMac: '',
      installerSourceWindows: '',
      installerSourceMac: '',
    });
    setOpenVersionDialog(true);
  };

  const handleOpenEditVersion = (ver) => {
    setIsEditingVersion(true);
    setVersionForm({
      id: ver.id,
      version: ver.version || '',
      disposition: ver.disposition || 'Approved',
      dispositionReason: ver.dispositionReason || '',
      alternative: ver.alternative || '',
      packagingStatus: ver.packagingStatus || 'Packaged & Ready',
      packageRefWindows: ver.packageRef?.windows || '',
      packageRefMac: ver.packageRef?.macos || '',
      installerSourceWindows: ver.installerSource?.windows || '',
      installerSourceMac: ver.installerSource?.macos || '',
    });
    setOpenVersionDialog(true);
  };

  const handleSaveVersion = async (e) => {
    e.preventDefault();
    if (!selectedTitle) return;
    try {
      const packageRef = {};
      if (versionForm.packageRefWindows.trim()) packageRef.windows = versionForm.packageRefWindows.trim();
      if (versionForm.packageRefMac.trim()) packageRef.macos = versionForm.packageRefMac.trim();

      const installerSource = {};
      if (versionForm.installerSourceWindows.trim()) installerSource.windows = versionForm.installerSourceWindows.trim();
      if (versionForm.installerSourceMac.trim()) installerSource.macos = versionForm.installerSourceMac.trim();

      const payload = {
        version: versionForm.version.trim(),
        disposition: versionForm.disposition,
        dispositionReason: versionForm.dispositionReason.trim(),
        alternative: versionForm.alternative.trim() || null,
        packagingStatus: versionForm.packagingStatus,
        packageRef: Object.keys(packageRef).length > 0 ? packageRef : null,
        installerSource: Object.keys(installerSource).length > 0 ? installerSource : null,
      };

      let res;
      if (isEditingVersion) {
        res = await fetch(`/api/intake/catalog/titles/${selectedTitle.id}/versions/${versionForm.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/intake/catalog/titles/${selectedTitle.id}/versions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save version record');

      setOpenVersionDialog(false);
      showToast(isEditingVersion ? 'Version disposition updated' : 'Version record added');
      setSelectedTitle(data.title);
      loadCatalog(selectedTitle.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteVersion = async () => {
    if (!selectedTitle || !targetVersion) return;
    try {
      const res = await fetch(`/api/intake/catalog/titles/${selectedTitle.id}/versions/${targetVersion.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete version');

      setOpenDeleteVersionDialog(false);
      setTargetVersion(null);
      showToast(`Version ${targetVersion.version} deleted.`);
      setSelectedTitle(data.title);
      loadCatalog(selectedTitle.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleTogglePlatform = (platform) => {
    setModelForm(prev => {
      const current = prev.supportedPlatforms || [];
      if (current.includes(platform)) {
        if (current.length === 1) return prev; // keep at least one
        return { ...prev, supportedPlatforms: current.filter(p => p !== platform) };
      } else {
        return { ...prev, supportedPlatforms: [...current, platform] };
      }
    });
  };

  return (
    <Box sx={{ pb: 4 }}>
      {/* ── Page Header & Action Bar ────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Inventory2 sx={{ color: 'primary.main', fontSize: 32 }} />
            <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 800 }}>
              Authoritative Software Catalog
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Manage enterprise software models, governance dispositions, platform requirements, and packaging artifacts.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            variant="outlined"
            size="small"
            startIcon={<Refresh />}
            onClick={() => { loadCategories(); loadCatalog(); }}
            sx={{ fontWeight: 600 }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Add />}
            onClick={handleOpenCreateModel}
            sx={{ fontWeight: 700, px: 2.5, boxShadow: 2 }}
          >
            Register New Model
          </Button>
        </Stack>
      </Box>

      {/* ── Summary Metrics Bar ─────────────────────────────────────────────── */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          mb: 3,
          borderRadius: 2,
          backgroundColor: '#ffffff',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 3,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap" useFlexGap>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', fontWeight: 700 }}>
              Database Total
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'text.primary' }}>
              {totalInDatabase.toLocaleString()}
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', fontWeight: 700 }}>
              Matching Models
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'primary.main' }}>
              {catalog.length.toLocaleString()}
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography variant="caption" sx={{ color: 'success.dark', textTransform: 'uppercase', fontWeight: 700 }}>
              Approved Versions
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'success.main' }}>
              {stats.approvedCount.toLocaleString()}
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography variant="caption" sx={{ color: 'error.dark', textTransform: 'uppercase', fontWeight: 700 }}>
              Denied / Prohibited
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'error.main' }}>
              {stats.deniedCount.toLocaleString()}
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography variant="caption" sx={{ color: 'warning.dark', textTransform: 'uppercase', fontWeight: 700 }}>
              Review Required
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'warning.main' }}>
              {stats.reviewCount.toLocaleString()}
            </Typography>
          </Box>
        </Stack>

        {(searchQuery || selectedCategory !== 'all' || selectedPlatform !== 'all' || selectedDisposition !== 'all') && (
          <Button
            size="small"
            variant="text"
            color="secondary"
            startIcon={<Clear />}
            onClick={handleClearFilters}
            sx={{ fontWeight: 600 }}
          >
            Clear Active Filters
          </Button>
        )}
      </Paper>

      {/* ── Search & Filter Controls ─────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2, backgroundColor: '#ffffff' }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search software models, publishers, keywords..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ color: 'text.secondary', fontSize: 20 }} />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery('')}>
                      <Clear fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </Grid>

          <Grid item xs={12} sm={4} md={3}>
            <FormControl size="small" fullWidth>
              <InputLabel id="category-filter-label">Category</InputLabel>
              <Select
                labelId="category-filter-label"
                value={selectedCategory}
                label="Category"
                onChange={e => setSelectedCategory(e.target.value)}
              >
                <MenuItem value="all">All Categories</MenuItem>
                {categories.map(c => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={6} sm={4} md={2.5}>
            <FormControl size="small" fullWidth>
              <InputLabel id="platform-filter-label">Platform</InputLabel>
              <Select
                labelId="platform-filter-label"
                value={selectedPlatform}
                label="Platform"
                onChange={e => setSelectedPlatform(e.target.value)}
              >
                <MenuItem value="all">All Platforms</MenuItem>
                <MenuItem value="windows">Windows</MenuItem>
                <MenuItem value="macos">macOS</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={6} sm={4} md={2.5}>
            <FormControl size="small" fullWidth>
              <InputLabel id="disp-filter-label">Disposition</InputLabel>
              <Select
                labelId="disp-filter-label"
                value={selectedDisposition}
                label="Disposition"
                onChange={e => setSelectedDisposition(e.target.value)}
              >
                <MenuItem value="all">All Dispositions</MenuItem>
                <MenuItem value="Approved">Has Approved</MenuItem>
                <MenuItem value="Denied">Has Denied / Prohibited</MenuItem>
                <MenuItem value="Review Required">Has Review Required</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* ── Main Two-Column Layout ───────────────────────────────────────────── */}
      <Grid container spacing={3}>
        {/* Left Column: Software Titles Master List */}
        <Grid item xs={12} md={5} lg={4.5}>
          <Card sx={{ height: '780px', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                Catalog Titles ({catalog.length})
              </Typography>
            </Box>

            <CardContent sx={{ p: 1.5, flexGrow: 1, overflowY: 'auto' }}>
              {loading ? (
                <Box sx={{ py: 10, textAlign: 'center' }}>
                  <CircularProgress size={30} />
                  <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>Loading models...</Typography>
                </Box>
              ) : catalog.length === 0 ? (
                <Box sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>
                  <FilterList sx={{ fontSize: 40, opacity: 0.4, mb: 1 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>No matching software models</Typography>
                  <Typography variant="caption">Try adjusting your keyword or filter options</Typography>
                </Box>
              ) : (
                <List disablePadding>
                  {catalog.map(t => {
                    const isSelected = selectedTitle && selectedTitle.id === t.id;
                    const hasDenied = (t.versions || []).some(v => v.disposition === 'Denied');
                    const hasApproved = (t.versions || []).some(v => v.disposition === 'Approved');

                    return (
                      <ListItemButton
                        key={t.id}
                        selected={isSelected}
                        onClick={() => setSelectedTitle(t)}
                        sx={{
                          borderRadius: 2,
                          mb: 1,
                          p: 1.5,
                          border: '1px solid',
                          borderColor: isSelected ? 'primary.main' : '#e2e8f0',
                          backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                          '&:hover': {
                            backgroundColor: isSelected ? '#eff6ff' : '#f8fafc',
                          },
                        }}
                      >
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                {t.displayName}
                              </Typography>
                              {hasDenied && !hasApproved && (
                                <Chip label="Prohibited" size="small" color="error" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                              )}
                              {hasApproved && !hasDenied && (
                                <Chip label="Approved" size="small" color="success" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                              )}
                              {hasApproved && hasDenied && (
                                <Chip label="Hybrid Policy" size="small" color="warning" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                              )}
                            </Box>
                          }
                          secondary={
                            <Box sx={{ mt: 0.5 }}>
                              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                {t.publisher} • {t.category}
                              </Typography>
                              <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }} alignItems="center">
                                <Chip
                                  label={`${(t.versions || []).length} Version(s)`}
                                  size="small"
                                  sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#f1f5f9' }}
                                />
                                {(t.supportedPlatforms || []).map(p => (
                                  <Chip
                                    key={p}
                                    icon={p === 'macos' ? <Apple sx={{ fontSize: '12px !important' }} /> : <Computer sx={{ fontSize: '12px !important' }} />}
                                    label={p.toUpperCase()}
                                    size="small"
                                    variant="outlined"
                                    sx={{ height: 18, fontSize: '0.62rem' }}
                                  />
                                ))}
                                {Boolean(t.isSaaSOrInternetFacing) && (
                                  <Chip
                                    icon={<Cloud sx={{ fontSize: '12px !important' }} />}
                                    label="SaaS"
                                    size="small"
                                    color="info"
                                    variant="outlined"
                                    sx={{ height: 18, fontSize: '0.62rem' }}
                                  />
                                )}
                              </Stack>
                            </Box>
                          }
                        />
                      </ListItemButton>
                    );
                  })}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Right Column: Title Detail & Governance Version Management */}
        <Grid item xs={12} md={7} lg={7.5}>
          <Card sx={{ minHeight: '780px', display: 'flex', flexDirection: 'column' }}>
            {selectedTitle ? (
              <CardContent sx={{ p: 3 }}>
                {/* Header with Title Name & Action Buttons */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="h2" sx={{ fontWeight: 800, color: 'text.primary' }}>
                        {selectedTitle.displayName}
                      </Typography>
                      {Boolean(selectedTitle.isSaaSOrInternetFacing) && (
                        <Chip icon={<Cloud />} label="Cloud / SaaS" size="small" color="info" sx={{ fontWeight: 600 }} />
                      )}
                    </Box>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                      Published by <strong>{selectedTitle.publisher}</strong> • Model ID: <code>{selectedTitle.id}</code>
                    </Typography>
                  </Box>

                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="primary"
                      startIcon={<Edit />}
                      onClick={handleOpenEditModel}
                      sx={{ fontWeight: 600 }}
                    >
                      Edit Model
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<Delete />}
                      onClick={() => setOpenDeleteModelDialog(true)}
                      sx={{ fontWeight: 600 }}
                    >
                      Delete Model
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      startIcon={<Add />}
                      onClick={handleOpenCreateVersion}
                      sx={{ fontWeight: 700 }}
                    >
                      Add Version Record
                    </Button>
                  </Stack>
                </Box>

                <Divider sx={{ my: 2 }} />

                {/* Specification Grid */}
                <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2, backgroundColor: '#f8fafc' }}>
                  <Typography variant="h4" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}>
                    Model Governance Specification
                  </Typography>

                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={4}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                        Category / Subcategory
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {selectedTitle.category} {selectedTitle.subcategory ? `› ${selectedTitle.subcategory}` : ''}
                      </Typography>
                    </Grid>

                    <Grid item xs={12} sm={6} md={4}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                        Supported OS Platforms
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ mt: 0.25 }}>
                        {(selectedTitle.supportedPlatforms || []).map(p => (
                          <Chip
                            key={p}
                            icon={p === 'macos' ? <Apple sx={{ fontSize: '14px !important' }} /> : <Computer sx={{ fontSize: '14px !important' }} />}
                            label={p === 'macos' ? 'macOS' : 'Windows'}
                            size="small"
                            sx={{ fontWeight: 600, bgcolor: '#ffffff' }}
                          />
                        ))}
                      </Stack>
                    </Grid>

                    <Grid item xs={12} sm={6} md={4}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                        License Required
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {selectedTitle.licenseRequired === 'Yes' ? '⚠️ Yes (Ariba / SAM Review)' : '✅ No (Site License / Freeware)'}
                      </Typography>
                    </Grid>

                    <Grid item xs={12} sm={6} md={4}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                        Data Classification
                      </Typography>
                      <Chip
                        icon={<Security sx={{ fontSize: '14px !important' }} />}
                        label={selectedTitle.dataClassification || 'Internal'}
                        size="small"
                        color={selectedTitle.dataClassification === 'Restricted' ? 'error' : selectedTitle.dataClassification === 'Confidential' ? 'warning' : 'default'}
                        sx={{ fontWeight: 700, mt: 0.25 }}
                      />
                    </Grid>

                    <Grid item xs={12} sm={6} md={4}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                        Default Sourcing Channel
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {selectedTitle.howToObtain || 'Intune'}
                      </Typography>
                    </Grid>

                    <Grid item xs={12} sm={6} md={4}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                        Default Installer Type
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {selectedTitle.defaultInstallerType ? Object.entries(selectedTitle.defaultInstallerType).map(([k, v]) => `${k}: ${v.toUpperCase()}`).join(', ') : 'MSI'}
                      </Typography>
                    </Grid>

                    {selectedTitle.description && (
                      <Grid item xs={12}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                          Description / Scope
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#334155', mt: 0.25 }}>
                          {selectedTitle.description}
                        </Typography>
                      </Grid>
                    )}
                  </Grid>
                </Paper>

                {/* Version Records Section */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h3" sx={{ fontWeight: 700, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Verified sx={{ color: 'primary.main', fontSize: 22 }} />
                    Version Governance Dispositions ({selectedTitle.versions?.length || 0})
                  </Typography>
                  <Button
                    size="small"
                    variant="text"
                    color="primary"
                    startIcon={<Add />}
                    onClick={handleOpenCreateVersion}
                    sx={{ fontWeight: 700 }}
                  >
                    Add Version
                  </Button>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {(!selectedTitle.versions || selectedTitle.versions.length === 0) ? (
                    <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.secondary', borderRadius: 2 }}>
                      <Info sx={{ fontSize: 32, opacity: 0.4, mb: 1 }} />
                      <Typography variant="body2">No version records registered for this title yet.</Typography>
                      <Button size="small" variant="contained" sx={{ mt: 1.5 }} onClick={handleOpenCreateVersion}>
                        Add First Version
                      </Button>
                    </Paper>
                  ) : (
                    selectedTitle.versions.map((v) => {
                      const isApproved = v.disposition === 'Approved';
                      const isDenied = v.disposition === 'Denied';

                      return (
                        <Paper
                          key={v.id || v.version}
                          variant="outlined"
                          sx={{
                            p: 2.5,
                            borderRadius: 2,
                            borderLeft: '5px solid',
                            borderLeftColor: isApproved ? 'success.main' : isDenied ? 'error.main' : 'warning.main',
                            backgroundColor: isApproved ? '#fcfdfc' : isDenied ? '#fffafa' : '#fffcf5',
                          }}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '1rem' }}>
                                Version {v.version}
                              </Typography>

                              <Chip
                                icon={isApproved ? <CheckCircle /> : isDenied ? <Block /> : <WarningAmber />}
                                label={v.disposition}
                                size="small"
                                color={isApproved ? 'success' : isDenied ? 'error' : 'warning'}
                                sx={{ height: 24, fontSize: '0.75rem', fontWeight: 700 }}
                              />

                              <Chip
                                label={v.packagingStatus}
                                size="small"
                                variant="outlined"
                                sx={{ height: 24, fontSize: '0.75rem', fontWeight: 600 }}
                              />
                            </Box>

                            <Stack direction="row" spacing={0.5}>
                              <Tooltip title="Edit Version Disposition">
                                <IconButton size="small" color="primary" onClick={() => handleOpenEditVersion(v)}>
                                  <Edit fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete Version">
                                <IconButton size="small" color="error" onClick={() => { setTargetVersion(v); setOpenDeleteVersionDialog(true); }}>
                                  <Delete fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </Box>

                          {/* Security Rationale Box */}
                          <Box sx={{ p: 1.5, mb: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 1.5 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.25 }}>
                              Governance & Security Vetting Rationale:
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#334155' }}>
                              {v.dispositionReason || 'Standard corporate software vetting rules apply.'}
                            </Typography>
                          </Box>

                          {/* Alternative Recommendation if Denied */}
                          {v.alternative && (
                            <Box sx={{ p: 1.5, mb: 1.5, bgcolor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 1.5 }}>
                              <Typography variant="caption" sx={{ color: '#991b1b', fontWeight: 700, display: 'block' }}>
                                💡 Mandated Alternative Software:
                              </Typography>
                              <Typography variant="body2" sx={{ color: '#7f1d1d', fontWeight: 600 }}>
                                {v.alternative}
                              </Typography>
                            </Box>
                          )}

                          {/* Repository and Source Paths */}
                          <Grid container spacing={1.5} sx={{ mt: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
                            {v.packageRef && (
                              <Grid item xs={12} sm={6}>
                                <strong>Package Reference:</strong>{' '}
                                <code style={{ wordBreak: 'break-all' }}>
                                  {typeof v.packageRef === 'string' ? v.packageRef : JSON.stringify(v.packageRef)}
                                </code>
                              </Grid>
                            )}
                            {v.installerSource && (
                              <Grid item xs={12} sm={6}>
                                <strong>Installer Source:</strong>{' '}
                                <code style={{ wordBreak: 'break-all' }}>
                                  {typeof v.installerSource === 'string' ? v.installerSource : JSON.stringify(v.installerSource)}
                                </code>
                              </Grid>
                            )}
                          </Grid>
                        </Paper>
                      );
                    })
                  )}
                </Box>
              </CardContent>
            ) : (
              <Box sx={{ py: 20, textAlign: 'center', color: 'text.secondary' }}>
                <Inventory2 sx={{ fontSize: 48, opacity: 0.3, mb: 1.5 }} />
                <Typography variant="h4" sx={{ fontWeight: 600 }}>No Software Model Selected</Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>Select a software title on the left to view and manage its specifications.</Typography>
              </Box>
            )}
          </Card>
        </Grid>
      </Grid>

      {/* ── Dialog: Register or Edit Software Model ─────────────────────────── */}
      <Dialog open={openModelDialog} onClose={() => setOpenModelDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          {isEditingModel ? `Edit Software Model: ${modelForm.displayName}` : 'Register New Software Model'}
        </DialogTitle>
        <form onSubmit={handleSaveModel}>
          <DialogContent dividers>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={7}>
                  <TextField
                    size="small"
                    fullWidth
                    required
                    label="Software Title Display Name"
                    placeholder="e.g. Visual Studio Code"
                    value={modelForm.displayName}
                    onChange={e => setModelForm(prev => ({ ...prev, displayName: e.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} sm={5}>
                  <TextField
                    size="small"
                    fullWidth
                    required
                    label="Publisher / Vendor Name"
                    placeholder="e.g. Microsoft Corporation"
                    value={modelForm.publisher}
                    onChange={e => setModelForm(prev => ({ ...prev, publisher: e.target.value }))}
                  />
                </Grid>
              </Grid>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    size="small"
                    fullWidth
                    required
                    label="Category"
                    placeholder="e.g. Developer Tools, Browsers"
                    value={modelForm.category}
                    onChange={e => setModelForm(prev => ({ ...prev, category: e.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    size="small"
                    fullWidth
                    label="Subcategory (Optional)"
                    placeholder="e.g. IDE, Code Editor"
                    value={modelForm.subcategory}
                    onChange={e => setModelForm(prev => ({ ...prev, subcategory: e.target.value }))}
                  />
                </Grid>
              </Grid>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="license-req-label">License Required</InputLabel>
                    <Select
                      labelId="license-req-label"
                      value={modelForm.licenseRequired}
                      label="License Required"
                      onChange={e => setModelForm(prev => ({ ...prev, licenseRequired: e.target.value }))}
                    >
                      <MenuItem value="No">No (Freeware / Site License)</MenuItem>
                      <MenuItem value="Yes">Yes (Commercial / Ariba)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={4}>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="data-class-label">Data Classification</InputLabel>
                    <Select
                      labelId="data-class-label"
                      value={modelForm.dataClassification}
                      label="Data Classification"
                      onChange={e => setModelForm(prev => ({ ...prev, dataClassification: e.target.value }))}
                    >
                      {DATA_CLASSIFICATIONS.map(d => (
                        <MenuItem key={d} value={d}>{d}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={4}>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="obtain-label">How to Obtain</InputLabel>
                    <Select
                      labelId="obtain-label"
                      value={modelForm.howToObtain}
                      label="How to Obtain"
                      onChange={e => setModelForm(prev => ({ ...prev, howToObtain: e.target.value }))}
                    >
                      {HOW_TO_OBTAIN_OPTIONS.map(o => (
                        <MenuItem key={o} value={o}>{o}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              {/* Supported Platforms & Cloud Flag */}
              <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={7}>
                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                      Supported Platforms:
                    </Typography>
                    <Stack direction="row" spacing={2}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={modelForm.supportedPlatforms.includes('windows')}
                            onChange={() => handleTogglePlatform('windows')}
                          />
                        }
                        label="Windows"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={modelForm.supportedPlatforms.includes('macos')}
                            onChange={() => handleTogglePlatform('macos')}
                          />
                        }
                        label="macOS"
                      />
                    </Stack>
                  </Grid>

                  <Grid item xs={12} sm={5}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={modelForm.isSaaSOrInternetFacing}
                          onChange={e => setModelForm(prev => ({ ...prev, isSaaSOrInternetFacing: e.target.checked }))}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>Cloud / SaaS Solution</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Internet or external hosted service</Typography>
                        </Box>
                      }
                    />
                  </Grid>
                </Grid>
              </Box>

              <TextField
                size="small"
                fullWidth
                multiline
                rows={3}
                label="Model Description & Enterprise Scope"
                placeholder="Detail the standard enterprise use cases, deployment scope, and security guidelines for this title."
                value={modelForm.description}
                onChange={e => setModelForm(prev => ({ ...prev, description: e.target.value }))}
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setOpenModelDialog(false)} color="secondary">Cancel</Button>
            <Button type="submit" variant="contained" color="primary" sx={{ fontWeight: 700 }}>
              {isEditingModel ? 'Save Changes' : 'Register Model'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ── Dialog: Delete Model Confirmation ───────────────────────────────── */}
      <Dialog open={openDeleteModelDialog} onClose={() => setOpenDeleteModelDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: 'error.main', display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmber color="error" /> Delete Software Model?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Are you sure you want to delete <strong>{selectedTitle?.displayName}</strong> ({selectedTitle?.publisher})?
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', bgcolor: '#fee2e2', p: 1.5, borderRadius: 1.5, border: '1px solid #fecaca' }}>
            ⚠️ This will permanently remove this software model and all <strong>{selectedTitle?.versions?.length || 0} associated version records</strong> from the authoritative catalog. Active requests cannot be deleted.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOpenDeleteModelDialog(false)} color="secondary">Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteModel} sx={{ fontWeight: 700 }}>
            Confirm Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog: Add or Edit Version Record ───────────────────────────────── */}
      <Dialog open={openVersionDialog} onClose={() => setOpenVersionDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          {isEditingVersion ? `Edit Version: ${versionForm.version}` : `Add Version Record to ${selectedTitle?.displayName}`}
        </DialogTitle>
        <form onSubmit={handleSaveVersion}>
          <DialogContent dividers>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField
                    size="small"
                    fullWidth
                    required
                    label="Version String"
                    placeholder="e.g. 134.0.6998.89, 2026.1"
                    value={versionForm.version}
                    onChange={e => setVersionForm(prev => ({ ...prev, version: e.target.value }))}
                  />
                </Grid>

                <Grid item xs={12} sm={4}>
                  <FormControl size="small" fullWidth required>
                    <InputLabel id="ver-disp-label">Governance Disposition</InputLabel>
                    <Select
                      labelId="ver-disp-label"
                      value={versionForm.disposition}
                      label="Governance Disposition"
                      onChange={e => setVersionForm(prev => ({ ...prev, disposition: e.target.value }))}
                    >
                      <MenuItem value="Approved">Approved (Fast-Track Deployment)</MenuItem>
                      <MenuItem value="Denied">Denied / Prohibited (Blocked)</MenuItem>
                      <MenuItem value="Review Required">Review Required (Governance / AppSec)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={4}>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="ver-pack-label">Packaging Status</InputLabel>
                    <Select
                      labelId="ver-pack-label"
                      value={versionForm.packagingStatus}
                      label="Packaging Status"
                      onChange={e => setVersionForm(prev => ({ ...prev, packagingStatus: e.target.value }))}
                    >
                      {PACKAGING_STATUS_OPTIONS.map(p => (
                        <MenuItem key={p} value={p}>{p}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <TextField
                size="small"
                fullWidth
                required
                multiline
                rows={2}
                label="Governance Rationale & Security Assessment Notes"
                placeholder="Detail the audit, CVE validation, or compliance rationale for this version's disposition."
                value={versionForm.dispositionReason}
                onChange={e => setVersionForm(prev => ({ ...prev, dispositionReason: e.target.value }))}
              />

              {versionForm.disposition === 'Denied' && (
                <TextField
                  size="small"
                  fullWidth
                  label="Mandated Alternative Software Title / Version"
                  placeholder="e.g. Google Chrome Enterprise 134.0 or Microsoft Edge"
                  value={versionForm.alternative}
                  onChange={e => setVersionForm(prev => ({ ...prev, alternative: e.target.value }))}
                  helperText="Required by policy when a version is denied, guiding users to approved substitutes."
                />
              )}

              <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 1.5 }}>
                  Artifact Repositories & Distribution Paths:
                </Typography>

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Windows Package Ref / Git Repo"
                      placeholder="titles/google-chrome or https://gitlab..."
                      value={versionForm.packageRefWindows}
                      onChange={e => setVersionForm(prev => ({ ...prev, packageRefWindows: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="macOS Package Ref"
                      placeholder="titles/google-chrome-mac"
                      value={versionForm.packageRefMac}
                      onChange={e => setVersionForm(prev => ({ ...prev, packageRefMac: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Windows Installer UNC Path / URL"
                      placeholder="\\corp.fiserv.net\packages\..."
                      value={versionForm.installerSourceWindows}
                      onChange={e => setVersionForm(prev => ({ ...prev, installerSourceWindows: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size="small"
                      fullWidth
                      label="macOS Installer UNC Path / URL"
                      placeholder="\\corp.fiserv.net\packages\..."
                      value={versionForm.installerSourceMac}
                      onChange={e => setVersionForm(prev => ({ ...prev, installerSourceMac: e.target.value }))}
                    />
                  </Grid>
                </Grid>
              </Box>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setOpenVersionDialog(false)} color="secondary">Cancel</Button>
            <Button type="submit" variant="contained" color="primary" sx={{ fontWeight: 700 }}>
              {isEditingVersion ? 'Save Version Changes' : 'Add Version Record'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ── Dialog: Delete Version Confirmation ─────────────────────────────── */}
      <Dialog open={openDeleteVersionDialog} onClose={() => setOpenDeleteVersionDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: 'error.main', display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmber color="error" /> Delete Version Record?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to remove version <strong>{targetVersion?.version}</strong> from {selectedTitle?.displayName}?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOpenDeleteVersionDialog(false)} color="secondary">Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteVersion} sx={{ fontWeight: 700 }}>
            Confirm Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Action Feedback Toast ───────────────────────────────────────────── */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%', fontWeight: 600 }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

