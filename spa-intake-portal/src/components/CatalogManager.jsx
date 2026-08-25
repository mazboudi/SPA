import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardHeader,
  CardContent,
  Box,
  Typography,
  Button,
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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

export default function CatalogManager() {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTitle, setSelectedTitle] = useState(null);

  // Dialog state
  const [openTitleDialog, setOpenTitleDialog] = useState(false);
  const [openVerDialog, setOpenVerDialog] = useState(false);

  // New Title Form
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPublisher, setNewPublisher] = useState('');
  const [newCategory, setNewCategory] = useState('Developer Tools');
  const [newLicenseReq, setNewLicenseReq] = useState('No');
  const [newPlatform, setNewPlatform] = useState('windows');
  const [newDesc, setNewDesc] = useState('');

  // New Version Form
  const [verNumber, setVerNumber] = useState('');
  const [verDisposition, setVerDisposition] = useState('Approved');
  const [verReason, setVerReason] = useState('');
  const [verInstallerSource, setVerInstallerSource] = useState('');

  const loadCatalog = () => {
    fetch('/api/intake/catalog')
      .then(res => res.json())
      .then(data => {
        setCatalog(data.titles || []);
        setLoading(false);
        if (selectedTitle) {
          const updated = (data.titles || []).find(t => t.id === selectedTitle.id);
          if (updated) setSelectedTitle(updated);
        } else if (data.titles && data.titles.length > 0) {
          setSelectedTitle(data.titles[0]);
        }
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const handleAddTitle = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/intake/catalog/titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: newDisplayName,
          publisher: newPublisher,
          category: newCategory,
          licenseRequired: newLicenseReq,
          supportedPlatforms: [newPlatform],
          description: newDesc,
          versions: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create title');
      setOpenTitleDialog(false);
      setNewDisplayName('');
      setNewPublisher('');
      setNewDesc('');
      loadCatalog();
      setSelectedTitle(data.title);
    } catch (err) {
      alert('Error creating title: ' + err.message);
    }
  };

  const handleAddVersion = async (e) => {
    e.preventDefault();
    if (!selectedTitle) return;
    try {
      const res = await fetch(`/api/intake/catalog/titles/${selectedTitle.id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: verNumber,
          disposition: verDisposition,
          dispositionReason: verReason,
          packagingStatus: 'Not Packaged',
          installerSource: {
            [selectedTitle.supportedPlatforms[0] || 'windows']: verInstallerSource,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add version');
      setOpenVerDialog(false);
      setVerNumber('');
      setVerReason('');
      setVerInstallerSource('');
      loadCatalog();
    } catch (err) {
      alert('Error adding version: ' + err.message);
    }
  };

  return (
    <Grid container spacing={3}>
      {/* Left Column: Software Titles List */}
      <Grid item xs={12} md={5} lg={4}>
        <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              📚 Software Models ({catalog.length})
            </Typography>
            <Button
              size="small"
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setOpenTitleDialog(true)}
            >
              Add Model
            </Button>
          </Box>

          <Divider />

          <CardContent sx={{ p: 1, flexGrow: 1, overflowY: 'auto', maxHeight: 600 }}>
            {loading ? (
              <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress size={24} /></Box>
            ) : (
              <List disablePadding>
                {catalog.map(t => {
                  const isSelected = selectedTitle && selectedTitle.id === t.id;
                  return (
                    <ListItemButton
                      key={t.id}
                      selected={isSelected}
                      onClick={() => setSelectedTitle(t)}
                      sx={{
                        borderRadius: 2,
                        mb: 0.75,
                        p: 1.5,
                        border: '1px solid',
                        borderColor: isSelected ? '#2563eb' : '#e2e8f0',
                        backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                      }}
                    >
                      <ListItemText
                        primary={
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                            {t.displayName}
                          </Typography>
                        }
                        secondary={
                          <>
                            <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                              {t.publisher} • {t.category}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                              <Chip label={`${(t.versions || []).length} Version(s)`} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                              <Chip label={(t.supportedPlatforms || []).join(', ').toUpperCase()} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                            </Box>
                          </>
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

      {/* Right Column: Title Detail & Version Records */}
      <Grid item xs={12} md={7} lg={8}>
        <Card>
          {selectedTitle ? (
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Box>
                  <Typography variant="h3" sx={{ fontWeight: 700, color: '#0f172a' }}>
                    {selectedTitle.displayName}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
                    Publisher: <strong>{selectedTitle.publisher}</strong> | Category: <strong>{selectedTitle.category}</strong> | License: <strong>{selectedTitle.licenseRequired}</strong>
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => setOpenVerDialog(true)}
                >
                  Add Version Record
                </Button>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b', mb: 1.5 }}>
                Registered Versions & Governance Vetting Status
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {(selectedTitle.versions || []).map((v) => (
                  <Paper
                    key={v.version}
                    variant="outlined"
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      borderLeft: '4px solid',
                      borderLeftColor: v.disposition === 'Approved' ? '#16a34a' : v.disposition === 'Denied' ? '#dc2626' : '#d97706',
                      backgroundColor: v.disposition === 'Approved' ? '#f0fdf4' : v.disposition === 'Denied' ? '#fef2f2' : '#fffbeb',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                        Version {v.version}
                      </Typography>
                      <Chip
                        label={v.disposition}
                        size="small"
                        color={v.disposition === 'Approved' ? 'success' : v.disposition === 'Denied' ? 'error' : 'warning'}
                        sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
                      />
                    </Box>

                    <Typography variant="caption" sx={{ color: '#475569', display: 'block', mb: 1 }}>
                      {v.dispositionReason || 'Standard corporate software vetting rules apply.'}
                    </Typography>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b' }}>
                      <span>Packaging: <strong>{v.packagingStatus}</strong></span>
                      {v.packageRef && <span>Package Repo: {JSON.stringify(v.packageRef)}</span>}
                    </Box>
                  </Paper>
                ))}
              </Box>
            </CardContent>
          ) : (
            <Box sx={{ py: 10, textAlign: 'center', color: '#64748b' }}>
              <Typography variant="body1">Select a software title on the left to view version records.</Typography>
            </Box>
          )}
        </Card>
      </Grid>

      {/* Add Title Dialog */}
      <Dialog open={openTitleDialog} onClose={() => setOpenTitleDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Register New Software Model</DialogTitle>
        <form onSubmit={handleAddTitle}>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                size="small"
                fullWidth
                required
                label="Display Name"
                placeholder="e.g. Visual Studio Code"
                value={newDisplayName}
                onChange={e => setNewDisplayName(e.target.value)}
              />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    size="small"
                    fullWidth
                    required
                    label="Publisher"
                    placeholder="e.g. Microsoft"
                    value={newPublisher}
                    onChange={e => setNewPublisher(e.target.value)}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    size="small"
                    fullWidth
                    label="Category"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                  />
                </Grid>
              </Grid>
              <TextField
                size="small"
                fullWidth
                multiline
                rows={2}
                label="Description"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setOpenTitleDialog(false)} color="secondary">Cancel</Button>
            <Button type="submit" variant="contained" color="primary">Save Model</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Add Version Dialog */}
      <Dialog open={openVerDialog} onClose={() => setOpenVerDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Add Version & Governance Disposition</DialogTitle>
        <form onSubmit={handleAddVersion}>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    size="small"
                    fullWidth
                    required
                    label="Version String"
                    placeholder="e.g. 1.85.0"
                    value={verNumber}
                    onChange={e => setVerNumber(e.target.value)}
                  />
                </Grid>
                <Grid item xs={6}>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="disp-label">Disposition *</InputLabel>
                    <Select
                      labelId="disp-label"
                      value={verDisposition}
                      label="Disposition *"
                      onChange={e => setVerDisposition(e.target.value)}
                    >
                      <MenuItem value="Approved">Approved (Fast-Track)</MenuItem>
                      <MenuItem value="Denied">Denied / Prohibited</MenuItem>
                      <MenuItem value="Review Required">Review Required</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
              <TextField
                size="small"
                fullWidth
                label="Disposition Rationale / Security Notes"
                placeholder="e.g. Current stable enterprise standard"
                value={verReason}
                onChange={e => setVerReason(e.target.value)}
              />
              <TextField
                size="small"
                fullWidth
                label="Installer Source Path (UNC or URL)"
                placeholder="\\corp.fiserv.net\packages\..."
                value={verInstallerSource}
                onChange={e => setVerInstallerSource(e.target.value)}
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setOpenVerDialog(false)} color="secondary">Cancel</Button>
            <Button type="submit" variant="contained" color="primary">Save Version</Button>
          </DialogActions>
        </form>
      </Dialog>
    </Grid>
  );
}
