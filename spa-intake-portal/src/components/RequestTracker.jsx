import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardHeader,
  CardContent,
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  Divider,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Button,
  CircularProgress,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';

const STAGE_STEPS = [
  { id: 'submitted', label: 'Submitted' },
  { id: 'manager_approval', label: 'Manager Approval' },
  { id: 'license_review', label: 'SAM Review' },
  { id: 'packaging', label: 'Packaging' },
  { id: 'completed', label: 'Closed Complete' },
];

function getActiveStepIndex(stage, state) {
  if (state === 'Closed Complete') return 4;
  if (state === 'Closed Denied') return 1;
  switch (stage) {
    case 'manager_approval': return 1;
    case 'governance_review':
    case 'license_review': return 2;
    case 'packaging': return 3;
    case 'completed': return 4;
    default: return 0;
  }
}

export default function RequestTracker() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReq, setSelectedReq] = useState(null);
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState('all');

  const loadRequests = () => {
    fetch('/api/intake/requests')
      .then(res => res.json())
      .then(data => {
        setRequests(data.requests || []);
        setLoading(false);
        if (selectedReq) {
          const updated = (data.requests || []).find(r => r.id === selectedReq.id);
          if (updated) setSelectedReq(updated);
        } else if (data.requests && data.requests.length > 0) {
          setSelectedReq(data.requests[0]);
        }
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadRequests();
    const interval = setInterval(loadRequests, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredRequests = requests.filter(r => {
    if (filterState !== 'all' && r.state.toLowerCase() !== filterState.toLowerCase()) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.number.toLowerCase().includes(q) ||
        r.titleName.toLowerCase().includes(q) ||
        r.requestedFor.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <Grid container spacing={3}>
      {/* Left Column: Request List */}
      <Grid item xs={12} md={5} lg={4}>
        <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              📋 Requests ({requests.length})
            </Typography>
            <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={loadRequests}>
              Refresh
            </Button>
          </Box>

          <Divider />

          <Box sx={{ p: 2, display: 'flex', gap: 1 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search tickets, titles..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <FormControl size="small" sx={{ width: 140 }}>
              <Select value={filterState} onChange={e => setFilterState(e.target.value)}>
                <MenuItem value="all">All States</MenuItem>
                <MenuItem value="in review">In Review</MenuItem>
                <MenuItem value="in progress">In Progress</MenuItem>
                <MenuItem value="in packaging">In Packaging</MenuItem>
                <MenuItem value="closed complete">Closed Complete</MenuItem>
                <MenuItem value="closed denied">Closed Denied</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <CardContent sx={{ p: 1, flexGrow: 1, overflowY: 'auto', maxHeight: 600 }}>
            {loading ? (
              <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress size={24} /></Box>
            ) : filteredRequests.length === 0 ? (
              <Typography variant="body2" sx={{ textAlign: 'center', py: 4, color: '#64748b' }}>
                No requests match filter.
              </Typography>
            ) : (
              <List disablePadding>
                {filteredRequests.map(r => {
                  const isSelected = selectedReq && selectedReq.id === r.id;
                  return (
                    <ListItemButton
                      key={r.id}
                      selected={isSelected}
                      onClick={() => setSelectedReq(r)}
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
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>
                              {r.number}
                            </Typography>
                            <Chip
                              label={r.state}
                              size="small"
                              color={r.state === 'Closed Complete' ? 'success' : r.state === 'Closed Denied' ? 'error' : 'primary'}
                              sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                            />
                          </Box>
                        }
                        secondary={
                          <>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                              {r.titleName} <span style={{ color: '#64748b', fontSize: '0.75rem' }}>v{r.version}</span>
                            </Typography>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5, fontSize: '0.725rem', color: '#64748b' }}>
                              <span>👤 {r.requestedFor}</span>
                              <span>💻 {r.platform.toUpperCase()}</span>
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

      {/* Right Column: Request Details & Task Execution Tree */}
      <Grid item xs={12} md={7} lg={8}>
        <Card>
          {selectedReq ? (
            <CardContent sx={{ p: 3 }}>
              {/* Header */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Box>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb', fontSize: '0.85rem' }}>
                    {selectedReq.number}
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 700, color: '#0f172a' }}>
                    {selectedReq.titleName} {selectedReq.version}
                  </Typography>
                </Box>
                <Chip
                  label={selectedReq.state}
                  color={selectedReq.state === 'Closed Complete' ? 'success' : selectedReq.state === 'Closed Denied' ? 'error' : 'primary'}
                  sx={{ fontWeight: 700 }}
                />
              </Box>

              {/* Execution Progress Stepper */}
              <Paper variant="outlined" sx={{ p: 2.5, mb: 3, backgroundColor: '#f8fafc', borderRadius: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', mb: 2 }}>
                  Workflow Fulfillment Lifecycle
                </Typography>
                <Stepper activeStep={getActiveStepIndex(selectedReq.stage, selectedReq.state)} alternativeLabel>
                  {STAGE_STEPS.map((step) => (
                    <Step key={step.id}>
                      <StepLabel>{step.label}</StepLabel>
                    </Step>
                  ))}
                </Stepper>
              </Paper>

              {/* Packaging Artifacts Banner (When Published) */}
              {selectedReq.packagingArtifacts && (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    mb: 3,
                    backgroundColor: '#f0fdf4',
                    borderColor: '#bbf7d0',
                    borderRadius: 2,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#15803d', fontWeight: 700, mb: 1 }}>
                    <CheckCircleRoundedIcon fontSize="small" />
                    <span>Packaged & Deployed via SPA Packaging Workbench</span>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.8rem', color: '#334155' }}>
                    <div><strong>GitLab Repository:</strong> <code style={{ color: '#1e40af' }}>{selectedReq.packagingArtifacts.gitRepoUrl || 'GitLab Package Repo'}</code></div>
                    <div><strong>Commit Hash:</strong> <code style={{ color: '#64748b' }}>{selectedReq.packagingArtifacts.commitSha || 'main'}</code></div>
                    <div><strong>Packaged At:</strong> {selectedReq.packagingArtifacts.packagedAt}</div>
                  </Box>
                </Paper>
              )}

              {/* Request Metadata Grid */}
              <Paper variant="outlined" sx={{ p: 2, mb: 3, backgroundColor: '#ffffff', borderRadius: 2 }}>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={4}>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Requester</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedReq.requestedFor}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={4}>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Department</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedReq.department}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={4}>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Target Host</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedReq.targetDevice}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={4}>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Platform</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedReq.platform.toUpperCase()}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={4}>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Install Type</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedReq.installType}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={4}>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Disposition</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedReq.disposition}</Typography>
                  </Grid>
                </Grid>
              </Paper>

              {/* Justification */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b', mb: 0.5 }}>
                  Business Justification:
                </Typography>
                <Paper variant="outlined" sx={{ p: 1.5, backgroundColor: '#f8fafc', borderRadius: 1.5 }}>
                  <Typography variant="body2" sx={{ color: '#334155' }}>
                    {selectedReq.businessJustification}
                  </Typography>
                </Paper>
              </Box>

              {/* Catalog Tasks Execution Tree */}
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b', mb: 1.5 }}>
                Catalog Tasks (sc_task) Lineage
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {(selectedReq.tasks || []).map((t, idx) => (
                  <Paper
                    key={t.id}
                    variant="outlined"
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      borderLeft: '4px solid',
                      borderLeftColor: t.state === 'Closed Complete' ? '#16a34a' : t.state === 'Open' ? '#2563eb' : '#94a3b8',
                      backgroundColor: t.state === 'Closed Complete' ? '#f0fdf4' : t.state === 'Open' ? '#eff6ff' : '#ffffff',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#64748b' }}>#{idx + 1}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>{t.name}</Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>({t.assignmentGroup})</Typography>
                      </Box>
                      <Chip
                        label={t.state}
                        size="small"
                        color={t.state === 'Closed Complete' ? 'success' : t.state === 'Open' ? 'primary' : 'default'}
                        sx={{ height: 20, fontSize: '0.675rem', fontWeight: 600 }}
                      />
                    </Box>
                    {t.notes && (
                      <Typography variant="caption" sx={{ display: 'block', color: '#475569', mt: 0.75, fontStyle: 'italic' }}>
                        "{t.notes}"
                      </Typography>
                    )}
                  </Paper>
                ))}
              </Box>
            </CardContent>
          ) : (
            <Box sx={{ py: 10, textAlign: 'center', color: '#64748b' }}>
              <Typography variant="body1">Select a request from the left to view details.</Typography>
            </Box>
          )}
        </Card>
      </Grid>
    </Grid>
  );
}
