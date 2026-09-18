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
  ContentCopy,
  Terminal,
  FolderOpen,
  AssignmentTurnedIn,
  Policy,
  ChevronLeft,
  ChevronRight,
  Category as CategoryIcon,
  ArrowBack,
  Fullscreen,
  FullscreenExit,
  FirstPage,
  ViewSidebar,
} from '@mui/icons-material';

const DATA_CLASSIFICATIONS = ['Internal', 'Public', 'Confidential', 'Restricted'];
const HOW_TO_OBTAIN_OPTIONS = ['Intune', 'Ariba', 'Direct Download', 'Vendor Portal', 'Self-Service', 'N/A'];
const PACKAGING_STATUS_OPTIONS = ['Packaged & Ready', 'Available', 'In Packaging', 'Retired', 'Prohibited', 'Not Packaged'];
const DISPOSITION_OPTIONS = ['Approved', 'Denied', 'Review Required'];
const APPROVAL_POLICY_OPTIONS = [
  { value: 'all', label: 'All Versions Approved (Standard Freeware / Site License)' },
  { value: 'version_range', label: 'Version Range Rule (Minimum Floor or Specific Range)' },
  { value: 'explicit_only', label: 'Explicit Packages Only / Review Required' },
  { value: 'prohibited', label: 'Prohibited Software (All Versions Denied)' },
];

export default function CatalogManager() {
  const [catalog, setCatalog] = useState([]);
  const [categories, setCategories] = useState([]);
  const [dbStats, setDbStats] = useState({
    totalTitles: 4660,
    approvedTitles: 2534,
    deniedTitles: 890,
    reviewRequiredTitles: 1236,
    totalPackages: 3413,
    assignedPackages: 2369,
  });
  const [totalInDatabase, setTotalInDatabase] = useState(4660);
  const [totalMatching, setTotalMatching] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [isListCollapsed, setIsListCollapsed] = useState(false);

  // Pagination & Display Limit
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

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
    category: 'General Business',
    subcategory: '',
    supportedPlatforms: ['windows'],
    licenseRequired: 'No',
    isSaaSOrInternetFacing: false,
    dataClassification: 'Internal',
    howToObtain: 'Intune',
    description: '',
    defaultDisposition: 'Approved',
    approvalPolicy: 'all',
    approvedVersionRule: '*',
    deniedVersionRule: '',
    policyRationale: 'Approved standard software for enterprise EUC deployment.',
    mandatedAlternative: '',
  });

  // Model Delete State
  const [openDeleteModelDialog, setOpenDeleteModelDialog] = useState(false);

  // Package Dialog State
  const [openPackageDialog, setOpenPackageDialog] = useState(false);
  const [isEditingPackage, setIsEditingPackage] = useState(false);
  const [packageForm, setPackageForm] = useState({
    id: '',
    intuneAppName: '',
    version: '',
    platform: 'windows',
    packagingStatus: 'Packaged & Ready',
    intuneAppId: '',
    installCommandLine: '',
    uninstallCommandLine: '',
    msiProductCode: '',
    detectionSummary: '',
    sourceSharePath: '',
    notes: '',
    description: '',
  });

  // Package Delete State
  const [openDeletePackageDialog, setOpenDeletePackageDialog] = useState(false);
  const [targetPackage, setTargetPackage] = useState(null);

  // Toast Feedback State
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const showToast = (message, severity = 'success') => setSnackbar({ open: true, message, severity });

  // 1-click clipboard copy
  const handleCopy = (text, label) => {
    if (!text) return;
    try {
      navigator.clipboard?.writeText(text);
      showToast(`Copied ${label} to clipboard!`);
    } catch (_) {
      showToast(`Failed to copy ${label}`, 'warning');
    }
  };

  // 1. Fetch Categories & DB Stats
  const loadCategoriesAndStats = () => {
    fetch('/api/intake/catalog/categories')
      .then(res => res.json())
      .then(data => {
        if (data.categories) setCategories(data.categories);
      })
      .catch(err => console.error('Failed to load categories', err));

    fetch('/api/intake/catalog/stats')
      .then(res => res.json())
      .then(data => {
        if (data.stats) {
          setDbStats(data.stats);
          setTotalInDatabase(data.stats.totalTitles);
        }
      })
      .catch(err => console.error('Failed to load stats', err));
  };

  // 2. Fetch Catalog with Active Filters & Pagination
  const loadCatalog = (keepSelectedId = null) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    if (selectedPlatform !== 'all') params.set('platform', selectedPlatform);
    if (selectedDisposition !== 'all') params.set('disposition', selectedDisposition);
    params.set('limit', pageSize === 0 ? 'all' : String(pageSize));
    params.set('page', String(page));

    fetch(`/api/intake/catalog?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        const titles = data.titles || [];
        setCatalog(titles);
        setTotalMatching(data.totalMatching ?? titles.length);
        setTotalInDatabase(data.totalInDatabase || titles.length);
        setTotalPages(data.totalPages || 1);
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
    loadCategoriesAndStats();
  }, []);

  // Reset page to 1 when filters or pageSize change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedCategory, selectedPlatform, selectedDisposition, pageSize]);

  // Reload catalog on filter or page change (debounced for search query)
  useEffect(() => {
    const handler = setTimeout(() => {
      loadCatalog();
    }, 200);
    return () => clearTimeout(handler);
  }, [searchQuery, selectedCategory, selectedPlatform, selectedDisposition, page, pageSize]);

  // Reset Filters
  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedPlatform('all');
    setSelectedDisposition('all');
    setPage(1);
  };

  // ── Software Model Actions ──────────────────────────────────────────────────
  const handleOpenCreateModel = () => {
    setIsEditingModel(false);
    setModelForm({
      id: '',
      displayName: '',
      publisher: '',
      category: categories[0] || 'General Business',
      subcategory: '',
      supportedPlatforms: ['windows'],
      licenseRequired: 'No',
      isSaaSOrInternetFacing: false,
      dataClassification: 'Internal',
      howToObtain: 'Intune',
      description: '',
      defaultDisposition: 'Approved',
      approvalPolicy: 'all',
      approvedVersionRule: '*',
      deniedVersionRule: '',
      policyRationale: 'Approved standard software for enterprise EUC deployment.',
      mandatedAlternative: '',
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
      category: selectedTitle.category || 'General Business',
      subcategory: selectedTitle.subcategory || '',
      supportedPlatforms: Array.isArray(selectedTitle.supportedPlatforms) ? selectedTitle.supportedPlatforms : ['windows'],
      licenseRequired: selectedTitle.licenseRequired || 'No',
      isSaaSOrInternetFacing: Boolean(selectedTitle.isSaaSOrInternetFacing),
      dataClassification: selectedTitle.dataClassification || 'Internal',
      howToObtain: selectedTitle.howToObtain || 'Intune',
      description: selectedTitle.description || '',
      defaultDisposition: selectedTitle.defaultDisposition || 'Approved',
      approvalPolicy: selectedTitle.approvalPolicy || 'all',
      approvedVersionRule: selectedTitle.approvedVersionRule || '*',
      deniedVersionRule: selectedTitle.deniedVersionRule || '',
      policyRationale: selectedTitle.policyRationale || '',
      mandatedAlternative: selectedTitle.mandatedAlternative || '',
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
        defaultDisposition: modelForm.defaultDisposition,
        approvalPolicy: modelForm.approvalPolicy,
        approvedVersionRule: modelForm.approvedVersionRule.trim() || null,
        deniedVersionRule: modelForm.deniedVersionRule.trim() || null,
        policyRationale: modelForm.policyRationale.trim(),
        mandatedAlternative: modelForm.mandatedAlternative.trim() || null,
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
      loadCategoriesAndStats();
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
      loadCategoriesAndStats();
      loadCatalog();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ── Package Actions ─────────────────────────────────────────────────────────
  const handleOpenCreatePackage = () => {
    setIsEditingPackage(false);
    setPackageForm({
      id: '',
      intuneAppName: '',
      version: '',
      platform: 'windows',
      packagingStatus: 'Packaged & Ready',
      intuneAppId: '',
      installCommandLine: '',
      uninstallCommandLine: '',
      msiProductCode: '',
      detectionSummary: '',
      sourceSharePath: '',
      notes: '',
      description: '',
    });
    setOpenPackageDialog(true);
  };

  const handleOpenEditPackage = (pkg) => {
    setIsEditingPackage(true);
    setPackageForm({
      id: pkg.id,
      intuneAppName: pkg.intuneAppName || '',
      version: pkg.version || '',
      platform: pkg.platform || 'windows',
      packagingStatus: pkg.packagingStatus || 'Packaged & Ready',
      intuneAppId: pkg.intuneAppId || '',
      installCommandLine: pkg.installCommandLine || '',
      uninstallCommandLine: pkg.uninstallCommandLine || '',
      msiProductCode: pkg.msiProductCode || '',
      detectionSummary: pkg.detectionSummary || '',
      sourceSharePath: pkg.sourceSharePath || '',
      notes: pkg.notes || '',
      description: pkg.description || '',
    });
    setOpenPackageDialog(true);
  };

  const handleSavePackage = async (e) => {
    e.preventDefault();
    if (!selectedTitle) return;
    try {
      const payload = {
        intuneAppName: packageForm.intuneAppName.trim() || null,
        version: packageForm.version.trim(),
        platform: packageForm.platform,
        packagingStatus: packageForm.packagingStatus,
        intuneAppId: packageForm.intuneAppId.trim() || null,
        installCommandLine: packageForm.installCommandLine.trim() || null,
        uninstallCommandLine: packageForm.uninstallCommandLine.trim() || null,
        msiProductCode: packageForm.msiProductCode.trim() || null,
        detectionSummary: packageForm.detectionSummary.trim() || null,
        sourceSharePath: packageForm.sourceSharePath.trim() || null,
        notes: packageForm.notes.trim() || null,
        description: packageForm.description.trim() || null,
      };

      let res;
      if (isEditingPackage) {
        res = await fetch(`/api/intake/catalog/titles/${selectedTitle.id}/packages/${packageForm.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/intake/catalog/titles/${selectedTitle.id}/packages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save package');

      setOpenPackageDialog(false);
      showToast(isEditingPackage ? 'Package updated successfully' : 'Package release registered');
      setSelectedTitle(data.title);
      loadCategoriesAndStats();
      loadCatalog(selectedTitle.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeletePackage = async () => {
    if (!selectedTitle || !targetPackage) return;
    try {
      const res = await fetch(`/api/intake/catalog/titles/${selectedTitle.id}/packages/${targetPackage.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete package');

      setOpenDeletePackageDialog(false);
      setTargetPackage(null);
      showToast(`Package version ${targetPackage.version} deleted.`);
      setSelectedTitle(data.title);
      loadCategoriesAndStats();
      loadCatalog(selectedTitle.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleTogglePlatform = (platform) => {
    setModelForm(prev => {
      const current = prev.supportedPlatforms || [];
      if (current.includes(platform)) {
        if (current.length === 1) return prev;
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
            Manage enterprise base software models, version governance policies, and concrete Intune deployment packages.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            variant="outlined"
            size="small"
            startIcon={<Refresh />}
            onClick={() => { loadCategoriesAndStats(); loadCatalog(); }}
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

      {/* ── Authoritative Database Metrics Bar ──────────────────────────────── */}
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
              Total Titles in DB
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'text.primary' }}>
              {dbStats.totalTitles.toLocaleString()}
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography variant="caption" sx={{ color: 'success.dark', textTransform: 'uppercase', fontWeight: 700 }}>
              Approved Titles
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'success.main' }}>
              {dbStats.approvedTitles.toLocaleString()}
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography variant="caption" sx={{ color: 'error.dark', textTransform: 'uppercase', fontWeight: 700 }}>
              Prohibited Titles
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'error.main' }}>
              {dbStats.deniedTitles.toLocaleString()}
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography variant="caption" sx={{ color: 'warning.dark', textTransform: 'uppercase', fontWeight: 700 }}>
              Review Required
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'warning.main' }}>
              {dbStats.reviewRequiredTitles.toLocaleString()}
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography variant="caption" sx={{ color: 'info.dark', textTransform: 'uppercase', fontWeight: 700 }}>
              Intune Packages In DB
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'info.main' }}>
              {dbStats.totalPackages.toLocaleString()}
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

      {/* ── Search, Filters & Pagination Controls ────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2, backgroundColor: '#ffffff' }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3.5}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search by title, publisher, keyword..."
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

          <Grid item xs={12} sm={4} md={2.5}>
            <FormControl size="small" fullWidth>
              <InputLabel id="category-filter-label">Category</InputLabel>
              <Select
                labelId="category-filter-label"
                value={selectedCategory}
                label="Category"
                onChange={e => setSelectedCategory(e.target.value)}
              >
                <MenuItem value="all">All Categories ({categories.length})</MenuItem>
                {categories.map(c => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={6} sm={4} md={2}>
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

          <Grid item xs={6} sm={4} md={2}>
            <FormControl size="small" fullWidth>
              <InputLabel id="disp-filter-label">Governance Policy</InputLabel>
              <Select
                labelId="disp-filter-label"
                value={selectedDisposition}
                label="Governance Policy"
                onChange={e => setSelectedDisposition(e.target.value)}
              >
                <MenuItem value="all">All Dispositions</MenuItem>
                <MenuItem value="Approved">Approved Only ({dbStats.approvedTitles.toLocaleString()})</MenuItem>
                <MenuItem value="Denied">Prohibited Only ({dbStats.deniedTitles.toLocaleString()})</MenuItem>
                <MenuItem value="Review Required">Review Required ({dbStats.reviewRequiredTitles.toLocaleString()})</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={2}>
            <FormControl size="small" fullWidth>
              <InputLabel id="pagesize-label">Show Per Page</InputLabel>
              <Select
                labelId="pagesize-label"
                value={pageSize}
                label="Show Per Page"
                onChange={e => setPageSize(Number(e.target.value))}
              >
                <MenuItem value={50}>50 per page</MenuItem>
                <MenuItem value={100}>100 per page</MenuItem>
                <MenuItem value={250}>250 per page</MenuItem>
                <MenuItem value={500}>500 per page</MenuItem>
                <MenuItem value={0}>Show All ({totalMatching.toLocaleString()})</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* ── Main Two-Column Layout ───────────────────────────────────────────── */}
      <Grid container spacing={3}>
        {/* Left Column: Software Titles Master List with Pagination */}
        {!isListCollapsed && (
          <Grid item xs={12} md={5} lg={4.5}>
            <Card sx={{ height: '840px', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <Typography variant="h4" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                  Catalog Titles ({totalMatching.toLocaleString()})
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    {pageSize === 0 ? 'Showing All' : `Page ${page} of ${totalPages}`}
                  </Typography>
                  {selectedTitle && (
                    <Tooltip title="Collapse titles list to focus on policy and packages">
                      <IconButton size="small" onClick={() => setIsListCollapsed(true)} sx={{ ml: 0.5 }}>
                        <FirstPage fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
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
                      const isApproved = t.defaultDisposition === 'Approved';
                      const isDenied = t.defaultDisposition === 'Denied';
                      const isReview = t.defaultDisposition === 'Review Required';
                      const pkgCount = (t.packages || []).length;

                      return (
                        <ListItemButton
                          key={t.id}
                          selected={isSelected}
                          onClick={() => {
                            setSelectedTitle(t);
                            setIsListCollapsed(true);
                          }}
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
                              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', pr: 1 }}>
                                {t.displayName}
                              </Typography>
                              {isApproved && (
                                <Chip label="Approved" size="small" color="success" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                              )}
                              {isDenied && (
                                <Chip label="Prohibited" size="small" color="error" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                              )}
                              {isReview && (
                                <Chip label="Review Req" size="small" color="warning" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
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
                                  label={`${pkgCount} Package${pkgCount === 1 ? '' : 's'}`}
                                  size="small"
                                  color={pkgCount > 0 ? 'primary' : 'default'}
                                  variant={pkgCount > 0 ? 'filled' : 'outlined'}
                                  sx={{ height: 18, fontSize: '0.65rem' }}
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

            {/* Pagination Controls at Bottom of List */}
            {pageSize > 0 && totalPages > 1 && (
              <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                <Button
                  size="small"
                  disabled={page <= 1}
                  startIcon={<ChevronLeft />}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  sx={{ fontWeight: 600 }}
                >
                  Previous
                </Button>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  Page {page} of {totalPages}
                </Typography>
                <Button
                  size="small"
                  disabled={page >= totalPages}
                  endIcon={<ChevronRight />}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  sx={{ fontWeight: 600 }}
                >
                  Next
                </Button>
              </Box>
            )}
          </Card>
        </Grid>
        )}

        {/* Right Column: Title Detail, Model Specification, Governance Policy & Concrete Packages */}
        <Grid item xs={12} md={isListCollapsed ? 12 : 7} lg={isListCollapsed ? 12 : 7.5}>
          <Card sx={{ minHeight: '840px', display: 'flex', flexDirection: 'column' }}>
            {selectedTitle ? (
              <CardContent sx={{ p: 3 }}>
                {/* Collapsed Mode Navigation Bar */}
                {isListCollapsed && (
                  <Box sx={{ mb: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#f8fafc', p: 1.5, borderRadius: 2, border: '1px solid #e2e8f0' }}>
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      startIcon={<ArrowBack />}
                      onClick={() => setIsListCollapsed(false)}
                      sx={{ fontWeight: 700 }}
                    >
                      Back to Titles List ({totalMatching.toLocaleString()})
                    </Button>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip
                        icon={<Fullscreen sx={{ fontSize: '14px !important' }} />}
                        label="Focused View Mode (Full Width)"
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ fontWeight: 600, bgcolor: '#ffffff' }}
                      />
                      <Button
                        variant="text"
                        size="small"
                        startIcon={<ViewSidebar />}
                        onClick={() => setIsListCollapsed(false)}
                        sx={{ textTransform: 'none', fontWeight: 600, color: 'text.secondary' }}
                      >
                        Expand Titles Sidebar
                      </Button>
                    </Stack>
                  </Box>
                )}

                {/* Header with Title Name & Action Buttons */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="h2" sx={{ fontWeight: 800, color: 'text.primary' }}>
                        {selectedTitle.displayName}
                      </Typography>
                      {selectedTitle.defaultDisposition === 'Approved' && (
                        <Chip icon={<CheckCircle />} label="Approved" color="success" size="small" sx={{ fontWeight: 700 }} />
                      )}
                      {selectedTitle.defaultDisposition === 'Denied' && (
                        <Chip icon={<Block />} label="Prohibited" color="error" size="small" sx={{ fontWeight: 700 }} />
                      )}
                      {selectedTitle.defaultDisposition === 'Review Required' && (
                        <Chip icon={<WarningAmber />} label="Review Required" color="warning" size="small" sx={{ fontWeight: 700 }} />
                      )}
                      {Boolean(selectedTitle.isSaaSOrInternetFacing) && (
                        <Chip icon={<Cloud />} label="Cloud / SaaS" size="small" color="info" sx={{ fontWeight: 600 }} />
                      )}
                    </Box>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                      Published by <strong>{selectedTitle.publisher}</strong> • Model ID: <code>{selectedTitle.id}</code>
                    </Typography>
                  </Box>

                  <Stack direction="row" spacing={1}>
                    <Tooltip title={isListCollapsed ? "Restore catalog titles sidebar" : "Collapse titles list to focus on policy and packages"}>
                      <Button
                        size="small"
                        variant="outlined"
                        color="inherit"
                        startIcon={isListCollapsed ? <ViewSidebar /> : <Fullscreen />}
                        onClick={() => setIsListCollapsed(!isListCollapsed)}
                        sx={{ fontWeight: 600, color: 'text.secondary' }}
                      >
                        {isListCollapsed ? 'Show List' : 'Focus Mode'}
                      </Button>
                    </Tooltip>
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
                      Delete
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      startIcon={<Add />}
                      onClick={handleOpenCreatePackage}
                      sx={{ fontWeight: 700 }}
                    >
                      Add Package
                    </Button>
                  </Stack>
                </Box>

                <Divider sx={{ my: 2 }} />

                {/* ── Model Specification & Metadata Card ────────────────────────── */}
                <Paper variant="outlined" sx={{ p: 2, mb: 2.5, borderRadius: 2, backgroundColor: '#ffffff' }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', mb: 1.5, textTransform: 'uppercase', color: 'text.secondary' }}>
                    Model Classification & Procurement Specification:
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                        Category / Subcategory
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                        {selectedTitle.category || 'General Business'}
                        {selectedTitle.subcategory ? ` › ${selectedTitle.subcategory}` : ''}
                      </Typography>
                    </Grid>

                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                        Supported OS Platforms
                      </Typography>
                      <Stack direction="row" spacing={0.75} sx={{ mt: 0.25 }}>
                        {(selectedTitle.supportedPlatforms || ['windows']).map(p => (
                          <Chip
                            key={p}
                            icon={p === 'macos' ? <Apple sx={{ fontSize: '12px !important' }} /> : <Computer sx={{ fontSize: '12px !important' }} />}
                            label={p === 'macos' ? 'macOS' : 'Windows'}
                            size="small"
                            sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600, bgcolor: '#f1f5f9' }}
                          />
                        ))}
                      </Stack>
                    </Grid>

                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                        License Required
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {selectedTitle.licenseRequired === 'Yes' ? '⚠️ Yes (Ariba Review)' : '✅ No (Site/Free)'}
                      </Typography>
                    </Grid>

                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                        Data Classification
                      </Typography>
                      <Chip
                        icon={<Security sx={{ fontSize: '13px !important' }} />}
                        label={selectedTitle.dataClassification || 'Internal'}
                        size="small"
                        color={selectedTitle.dataClassification === 'Restricted' ? 'error' : selectedTitle.dataClassification === 'Confidential' ? 'warning' : 'default'}
                        sx={{ fontWeight: 700, height: 22, mt: 0.25 }}
                      />
                    </Grid>

                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                        Default Sourcing Channel
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {selectedTitle.howToObtain || 'Intune'}
                      </Typography>
                    </Grid>

                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                        Default Installer Type
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {selectedTitle.defaultInstallerType ? Object.entries(selectedTitle.defaultInstallerType).map(([k, v]) => `${k}: ${String(v).toUpperCase()}`).join(', ') : 'MSI'}
                      </Typography>
                    </Grid>

                    <Grid item xs={12} sm={6} md={6}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                        Scope / Description
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: selectedTitle.description ? 'normal' : 'italic' }}>
                        {selectedTitle.description || 'No description provided for this software model.'}
                      </Typography>
                    </Grid>
                  </Grid>
                </Paper>

                {/* ── Tier 1: Governance & Version Policy Rules ──────────────────── */}
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2.5,
                    mb: 3,
                    borderRadius: 2,
                    borderLeft: '5px solid',
                    borderLeftColor: selectedTitle.defaultDisposition === 'Approved' ? 'success.main' : selectedTitle.defaultDisposition === 'Denied' ? 'error.main' : 'warning.main',
                    backgroundColor: '#f8fafc',
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Policy sx={{ color: 'primary.main', fontSize: 20 }} />
                      Version Governance & Policy Rules
                    </Typography>
                    <Chip
                      label={
                        selectedTitle.approvalPolicy === 'all' ? 'Policy: All Versions Approved' :
                        selectedTitle.approvalPolicy === 'version_range' ? 'Policy: Version Range Rule' :
                        selectedTitle.approvalPolicy === 'prohibited' ? 'Policy: Prohibited Software' :
                        'Policy: Explicit Packages Only / Review Required'
                      }
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 700, bgcolor: '#ffffff' }}
                    />
                  </Box>

                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={4}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                        Approved Version Rule
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.dark', fontFamily: 'monospace' }}>
                        {selectedTitle.approvedVersionRule || 'None'}
                      </Typography>
                    </Grid>

                    <Grid item xs={12} sm={6} md={4}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                        Denied Version Rule
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.dark', fontFamily: 'monospace' }}>
                        {selectedTitle.deniedVersionRule || 'None'}
                      </Typography>
                    </Grid>

                    <Grid item xs={12} sm={6} md={4}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                        Governance Disposition
                      </Typography>
                      <Chip
                        label={selectedTitle.defaultDisposition}
                        size="small"
                        color={selectedTitle.defaultDisposition === 'Approved' ? 'success' : selectedTitle.defaultDisposition === 'Denied' ? 'error' : 'warning'}
                        sx={{ fontWeight: 700, height: 22, mt: 0.25 }}
                      />
                    </Grid>

                    {selectedTitle.policyRationale && (
                      <Grid item xs={12}>
                        <Box sx={{ p: 1.5, bgcolor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 1.5 }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.25 }}>
                            Compliance & Security Policy Rationale:
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#1e293b' }}>
                            {selectedTitle.policyRationale}
                          </Typography>
                        </Box>
                      </Grid>
                    )}

                    {selectedTitle.mandatedAlternative && (
                      <Grid item xs={12}>
                        <Alert severity="warning" sx={{ py: 0.5 }}>
                          <strong>Mandated Enterprise Alternative:</strong> {selectedTitle.mandatedAlternative}
                        </Alert>
                      </Grid>
                    )}
                  </Grid>
                </Paper>

                {/* ── Tier 2: Concrete Intune Packaged Releases ──────────────────── */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h3" sx={{ fontWeight: 700, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Verified sx={{ color: 'primary.main', fontSize: 22 }} />
                    Intune Packaged Releases ({selectedTitle.packages?.length || 0})
                  </Typography>
                  <Button
                    size="small"
                    variant="text"
                    color="primary"
                    startIcon={<Add />}
                    onClick={handleOpenCreatePackage}
                    sx={{ fontWeight: 700 }}
                  >
                    Add Package Release
                  </Button>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {(!selectedTitle.packages || selectedTitle.packages.length === 0) ? (
                    <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.secondary', borderRadius: 2 }}>
                      <Info sx={{ fontSize: 32, opacity: 0.4, mb: 1 }} />
                      <Typography variant="body2">No concrete Intune packages registered for this title yet.</Typography>
                      <Button size="small" variant="contained" sx={{ mt: 1.5 }} onClick={handleOpenCreatePackage}>
                        Add First Package
                      </Button>
                    </Paper>
                  ) : (
                    selectedTitle.packages.map((pkg) => {
                      return (
                        <Paper
                          key={pkg.id}
                          variant="outlined"
                          sx={{
                            p: 2.5,
                            borderRadius: 2,
                            backgroundColor: '#ffffff',
                            border: '1px solid #e2e8f0',
                            '&:hover': { boxShadow: 2, borderColor: 'primary.main' },
                          }}
                        >
                          {/* Intune Application Name Header */}
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                            <Box sx={{ flexGrow: 1 }}>
                              <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                                <Verified sx={{ fontSize: 15 }} /> Intune Application Display Name
                              </Typography>
                              <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem', lineHeight: 1.3 }}>
                                {pkg.intuneAppName || pkg.description || selectedTitle.displayName}
                              </Typography>
                            </Box>

                            <Stack direction="row" spacing={0.5}>
                              <Tooltip title="Edit Package">
                                <IconButton size="small" color="primary" onClick={() => handleOpenEditPackage(pkg)}>
                                  <Edit fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete Package">
                                <IconButton size="small" color="error" onClick={() => { setTargetPackage(pkg); setOpenDeletePackageDialog(true); }}>
                                  <Delete fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </Box>

                          {/* Version & Status Chips */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                            <Chip
                              label={`Release Version: ${pkg.version}`}
                              size="small"
                              color="primary"
                              variant="filled"
                              sx={{ height: 24, fontSize: '0.75rem', fontWeight: 800 }}
                            />

                            <Chip
                              label={pkg.packagingStatus}
                              size="small"
                              color={pkg.packagingStatus === 'Packaged & Ready' ? 'success' : pkg.packagingStatus === 'Available' ? 'info' : 'default'}
                              sx={{ height: 24, fontSize: '0.75rem', fontWeight: 700 }}
                            />

                            <Chip
                              icon={pkg.platform === 'macos' ? <Apple sx={{ fontSize: '13px !important' }} /> : <Computer sx={{ fontSize: '13px !important' }} />}
                              label={pkg.platform.toUpperCase()}
                              size="small"
                              variant="outlined"
                              sx={{ height: 24, fontSize: '0.75rem', fontWeight: 600 }}
                            />

                            {Boolean(pkg.isAssigned) ? (
                              <Chip
                                icon={<AssignmentTurnedIn sx={{ fontSize: '13px !important' }} />}
                                label="Assigned in Intune"
                                size="small"
                                color="success"
                                variant="outlined"
                                sx={{ height: 24, fontSize: '0.75rem', fontWeight: 700 }}
                              />
                            ) : (
                              <Chip
                                label="Unassigned"
                                size="small"
                                variant="outlined"
                                sx={{ height: 24, fontSize: '0.75rem', color: 'text.secondary' }}
                              />
                            )}
                          </Box>

                          {/* Intune Identifiers & Commands */}
                          <Grid container spacing={1.5}>
                            {pkg.intuneAppId && (
                              <Grid item xs={12} sm={6}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block' }}>
                                  Intune Application ID:
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                                  <code style={{ fontSize: '0.75rem', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {pkg.intuneAppId}
                                  </code>
                                  <Tooltip title="Copy Intune App ID">
                                    <IconButton size="small" onClick={() => handleCopy(pkg.intuneAppId, 'Intune App ID')}>
                                      <ContentCopy sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </Grid>
                            )}

                            {pkg.msiProductCode && (
                              <Grid item xs={12} sm={6}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block' }}>
                                  MSI Product Code:
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                                  <code style={{ fontSize: '0.75rem', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {pkg.msiProductCode}
                                  </code>
                                  <Tooltip title="Copy MSI Product Code">
                                    <IconButton size="small" onClick={() => handleCopy(pkg.msiProductCode, 'MSI Product Code')}>
                                      <ContentCopy sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </Grid>
                            )}

                            {pkg.installCommandLine && (
                              <Grid item xs={12}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block' }}>
                                  Install Command Line:
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, p: 1, bgcolor: '#0f172a', color: '#38bdf8', borderRadius: 1.5, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                  <Terminal sx={{ fontSize: 16, color: '#94a3b8' }} />
                                  <span style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {pkg.installCommandLine}
                                  </span>
                                  <Tooltip title="Copy Install Command">
                                    <IconButton size="small" sx={{ color: '#94a3b8', '&:hover': { color: '#ffffff' } }} onClick={() => handleCopy(pkg.installCommandLine, 'Install Command')}>
                                      <ContentCopy sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </Grid>
                            )}

                            {pkg.sourceSharePath && (
                              <Grid item xs={12}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, display: 'block' }}>
                                  Source UNC Share Path:
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                                  <FolderOpen sx={{ fontSize: 16, color: '#64748b' }} />
                                  <code style={{ fontSize: '0.75rem', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {pkg.sourceSharePath}
                                  </code>
                                  <Tooltip title="Copy UNC Path">
                                    <IconButton size="small" onClick={() => handleCopy(pkg.sourceSharePath, 'UNC Share Path')}>
                                      <ContentCopy sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </Grid>
                            )}

                            {pkg.detectionSummary && (
                              <Grid item xs={12}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                  Detection Method: <em>{pkg.detectionSummary}</em>
                                </Typography>
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
              <Box sx={{ py: 15, textAlign: 'center', color: 'text.secondary' }}>
                <Inventory2 sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
                <Typography variant="h3" sx={{ fontWeight: 600 }}>No Model Selected</Typography>
                <Typography variant="body2">Select a software model from the list on the left to inspect its classification and Intune packages.</Typography>
              </Box>
            )}
          </Card>
        </Grid>
      </Grid>

      {/* ── Dialog: Register or Edit Software Model ──────────────────────────── */}
      <Dialog open={openModelDialog} onClose={() => setOpenModelDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          {isEditingModel ? `Edit Software Model: ${modelForm.displayName}` : 'Register New Authoritative Model'}
        </DialogTitle>
        <form onSubmit={handleSaveModel}>
          <DialogContent dividers>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    size="small"
                    fullWidth
                    required
                    label="Software Display Name"
                    placeholder="e.g. Google Chrome, Visual Studio Code"
                    value={modelForm.displayName}
                    onChange={e => setModelForm(prev => ({ ...prev, displayName: e.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    size="small"
                    fullWidth
                    required
                    label="Publisher Name"
                    placeholder="e.g. Google LLC, Microsoft"
                    value={modelForm.publisher}
                    onChange={e => setModelForm(prev => ({ ...prev, publisher: e.target.value }))}
                  />
                </Grid>
              </Grid>

              {/* Governance Version Policy Section in Model Form */}
              <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', mb: 1.5, textTransform: 'uppercase', color: 'primary.main' }}>
                  Governance Version Policy Specification:
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <FormControl size="small" fullWidth required>
                      <InputLabel id="model-disp-label">Default Disposition</InputLabel>
                      <Select
                        labelId="model-disp-label"
                        value={modelForm.defaultDisposition}
                        label="Default Disposition"
                        onChange={e => setModelForm(prev => ({ ...prev, defaultDisposition: e.target.value }))}
                      >
                        {DISPOSITION_OPTIONS.map(d => (
                          <MenuItem key={d} value={d}>{d}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <FormControl size="small" fullWidth required>
                      <InputLabel id="model-policy-label">Approval Policy Mode</InputLabel>
                      <Select
                        labelId="model-policy-label"
                        value={modelForm.approvalPolicy}
                        label="Approval Policy Mode"
                        onChange={e => setModelForm(prev => ({ ...prev, approvalPolicy: e.target.value }))}
                      >
                        {APPROVAL_POLICY_OPTIONS.map(p => (
                          <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  {modelForm.approvalPolicy === 'version_range' && (
                    <>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          size="small"
                          fullWidth
                          label="Approved Version Rule"
                          placeholder="e.g. >= 20.00 or >= 10.5.2"
                          value={modelForm.approvedVersionRule}
                          onChange={e => setModelForm(prev => ({ ...prev, approvedVersionRule: e.target.value }))}
                          helperText="Expression defining versions eligible for automatic approval"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          size="small"
                          fullWidth
                          label="Denied Version Rule"
                          placeholder="e.g. < 20.00"
                          value={modelForm.deniedVersionRule}
                          onChange={e => setModelForm(prev => ({ ...prev, deniedVersionRule: e.target.value }))}
                          helperText="Expression defining versions prohibited by security policy"
                        />
                      </Grid>
                    </>
                  )}

                  <Grid item xs={12}>
                    <TextField
                      size="small"
                      fullWidth
                      multiline
                      rows={2}
                      label="Governance Rationale & Compliance Notes"
                      placeholder="Explain the security assessment, vulnerability CVSS threshold, or procurement requirements."
                      value={modelForm.policyRationale}
                      onChange={e => setModelForm(prev => ({ ...prev, policyRationale: e.target.value }))}
                    />
                  </Grid>

                  {modelForm.defaultDisposition === 'Denied' && (
                    <Grid item xs={12}>
                      <TextField
                        size="small"
                        fullWidth
                        label="Mandated Alternative Recommendation"
                        placeholder="e.g. Use Visual Studio Code or Google Chrome Enterprise"
                        value={modelForm.mandatedAlternative}
                        onChange={e => setModelForm(prev => ({ ...prev, mandatedAlternative: e.target.value }))}
                        helperText="Mandatory recommendation displayed to users when requesting prohibited titles"
                      />
                    </Grid>
                  )}
                </Grid>
              </Paper>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="category-select-label">Category</InputLabel>
                    <Select
                      labelId="category-select-label"
                      value={modelForm.category}
                      label="Category"
                      onChange={e => setModelForm(prev => ({ ...prev, category: e.target.value }))}
                    >
                      {categories.map(c => (
                        <MenuItem key={c} value={c}>{c}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    size="small"
                    fullWidth
                    label="Subcategory (Optional)"
                    placeholder="e.g. IDE, Code Editor, Web Browser"
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
                rows={2}
                label="Model Description & Enterprise Scope"
                placeholder="Detail standard enterprise use cases and deployment guidelines."
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
            ⚠️ This will permanently remove this software model and all associated Intune package records from the catalog.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOpenDeleteModelDialog(false)} color="secondary">Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteModel} sx={{ fontWeight: 700 }}>
            Confirm Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog: Add or Edit Intune Package ───────────────────────────────── */}
      <Dialog open={openPackageDialog} onClose={() => setOpenPackageDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          {isEditingPackage ? `Edit Intune Package: Version ${packageForm.version}` : `Add Intune Package to ${selectedTitle?.displayName}`}
        </DialogTitle>
        <form onSubmit={handleSavePackage}>
          <DialogContent dividers>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField
                    size="small"
                    fullWidth
                    required
                    label="Package Release Version *"
                    placeholder="e.g. 20.00.05, 134.0.6998.89"
                    value={packageForm.version}
                    onChange={e => setPackageForm(prev => ({ ...prev, version: e.target.value }))}
                  />
                </Grid>

                <Grid item xs={12} sm={4}>
                  <FormControl size="small" fullWidth required>
                    <InputLabel id="pkg-plat-label">Platform</InputLabel>
                    <Select
                      labelId="pkg-plat-label"
                      value={packageForm.platform}
                      label="Platform"
                      onChange={e => setPackageForm(prev => ({ ...prev, platform: e.target.value }))}
                    >
                      <MenuItem value="windows">Windows</MenuItem>
                      <MenuItem value="macos">macOS</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={4}>
                  <FormControl size="small" fullWidth required>
                    <InputLabel id="pkg-stat-label">Packaging Status</InputLabel>
                    <Select
                      labelId="pkg-stat-label"
                      value={packageForm.packagingStatus}
                      label="Packaging Status"
                      onChange={e => setPackageForm(prev => ({ ...prev, packagingStatus: e.target.value }))}
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
                label="Intune Application Display Name"
                placeholder="e.g. Adobe Acrobat Reader DC 2024.001 (x64) or .Net Data Provider For Teradata"
                value={packageForm.intuneAppName}
                onChange={e => setPackageForm(prev => ({ ...prev, intuneAppName: e.target.value }))}
                helperText="The exact Application Name as registered in Microsoft Intune."
              />

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    size="small"
                    fullWidth
                    label="Intune MobileApp GUID"
                    placeholder="e.g. 616e52a1-38cd-4ff0-83cd-e9a78525c8db"
                    value={packageForm.intuneAppId}
                    onChange={e => setPackageForm(prev => ({ ...prev, intuneAppId: e.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    size="small"
                    fullWidth
                    label="MSI Product Code"
                    placeholder="e.g. {41C8ACC0-562C-4959-A51E-F73EA42668B7}"
                    value={packageForm.msiProductCode}
                    onChange={e => setPackageForm(prev => ({ ...prev, msiProductCode: e.target.value }))}
                  />
                </Grid>
              </Grid>

              <TextField
                size="small"
                fullWidth
                label="Install Command Line"
                placeholder='e.g. Deploy-Application.exe -DeploymentType "Install" -DeployMode "Silent"'
                value={packageForm.installCommandLine}
                onChange={e => setPackageForm(prev => ({ ...prev, installCommandLine: e.target.value }))}
                InputProps={{
                  startAdornment: <Terminal sx={{ color: 'text.secondary', mr: 1, fontSize: 18 }} />
                }}
              />

              <TextField
                size="small"
                fullWidth
                label="Uninstall Command Line"
                placeholder='e.g. Deploy-Application.exe -DeploymentType "Uninstall" -DeployMode "Silent"'
                value={packageForm.uninstallCommandLine}
                onChange={e => setPackageForm(prev => ({ ...prev, uninstallCommandLine: e.target.value }))}
                InputProps={{
                  startAdornment: <Terminal sx={{ color: 'text.secondary', mr: 1, fontSize: 18 }} />
                }}
              />

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    size="small"
                    fullWidth
                    label="Source Share UNC Path"
                    placeholder="\\corp\shares\euc\packages\..."
                    value={packageForm.sourceSharePath}
                    onChange={e => setPackageForm(prev => ({ ...prev, sourceSharePath: e.target.value }))}
                    InputProps={{
                      startAdornment: <FolderOpen sx={{ color: 'text.secondary', mr: 1, fontSize: 18 }} />
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    size="small"
                    fullWidth
                    label="Detection Rule Summary"
                    placeholder="e.g. PowerShell Script Detection or Registry DisplayVersion"
                    value={packageForm.detectionSummary}
                    onChange={e => setPackageForm(prev => ({ ...prev, detectionSummary: e.target.value }))}
                  />
                </Grid>
              </Grid>

              <TextField
                size="small"
                fullWidth
                multiline
                rows={2}
                label="Package Notes & Description"
                placeholder="Deployment notes, migration references, or prerequisite requirements."
                value={packageForm.notes}
                onChange={e => setPackageForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setOpenPackageDialog(false)} color="secondary">Cancel</Button>
            <Button type="submit" variant="contained" color="primary" sx={{ fontWeight: 700 }}>
              {isEditingPackage ? 'Save Package Changes' : 'Register Package'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ── Dialog: Delete Package Confirmation ─────────────────────────────── */}
      <Dialog open={openDeletePackageDialog} onClose={() => setOpenDeletePackageDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: 'error.main', display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmber color="error" /> Delete Package?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to remove package version <strong>{targetPackage?.version}</strong> from {selectedTitle?.displayName}?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOpenDeletePackageDialog(false)} color="secondary">Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeletePackage} sx={{ fontWeight: 700 }}>
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
