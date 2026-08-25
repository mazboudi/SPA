import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  Box,
  Typography,
  Tabs,
  Tab,
  Button,
  Chip,
  Paper,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  CircularProgress,
  Divider,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import RefreshIcon from '@mui/icons-material/Refresh';

export default function GovernanceDashboard({ onTaskUpdated }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTabGroup, setActiveTabGroup] = useState('all');

  // Dialog State for Approval / Rejection Action
  const [actionDialog, setActionDialog] = useState({
    open: false,
    taskId: null,
    taskName: '',
    reqNumber: '',
    action: 'approve',
    notes: '',
  });
  const [acting, setActing] = useState(false);

  const loadData = () => {
    fetch('/api/intake/requests')
      .then(res => res.json())
      .then(data => {
        setRequests(data.requests || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 5000);
    return () => clearInterval(timer);
  }, []);

  // Flatten all open tasks with parent request context
  const openTasks = [];
  requests.forEach(r => {
    (r.tasks || []).forEach(t => {
      if (t.state === 'Open' || t.state === 'In Progress') {
        openTasks.push({
          ...t,
          parentRequest: r,
        });
      }
    });
  });

  const filteredTasks = activeTabGroup === 'all'
    ? openTasks
    : openTasks.filter(t => t.assignmentGroup.toLowerCase().includes(activeTabGroup.toLowerCase()));

  const handleOpenActionDialog = (task, action) => {
    setActionDialog({
      open: true,
      taskId: task.id,
      taskName: task.name,
      reqNumber: task.parentRequest.number,
      action,
      notes: action === 'approve' ? 'Approved for deployment.' : 'Rejected due to corporate policy.',
    });
  };

  const handleConfirmAction = async () => {
    setActing(true);
    try {
      const res = await fetch(`/api/intake/tasks/${actionDialog.taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: actionDialog.action,
          completedBy: 'Alex Johnson (Reviewer)',
          notes: actionDialog.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      setActionDialog({ open: false, taskId: null, taskName: '', reqNumber: '', action: 'approve', notes: '' });
      loadData();
      if (onTaskUpdated) onTaskUpdated();
    } catch (err) {
      alert('Error updating task: ' + err.message);
    } finally {
      setActing(false);
    }
  };

  return (
    <Box>
      <Card sx={{ mb: 3 }}>
        <Box sx={{ p: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h3" sx={{ fontWeight: 700, color: '#0f172a' }}>
              🛡️ Governance & Approval Review Center
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
              Review, approve, or reject pending Catalog Tasks (Manager Approvals, SAM License Entitlements, Cybersecurity Reviews).
            </Typography>
          </Box>

          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={loadData}
          >
            Refresh Feed
          </Button>
        </Box>

        <Divider />

        {/* Assignment Group Filter Tabs */}
        <Box sx={{ px: 2.5, backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <Tabs
            value={activeTabGroup}
            onChange={(e, val) => setActiveTabGroup(val)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ minHeight: 44 }}
          >
            <Tab label={`All Tasks (${openTasks.length})`} value="all" sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }} />
            <Tab label="Management Approvals" value="Management" sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }} />
            <Tab label="SAM License Reviews" value="Software Asset Management" sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }} />
            <Tab label="Cybersecurity / AppSec" value="Cybersecurity" sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }} />
            <Tab label="Packaging Reviews" value="Packaging" sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }} />
          </Tabs>
        </Box>

        <CardContent sx={{ p: 3 }}>
          {loading ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <CircularProgress size={32} />
            </Box>
          ) : filteredTasks.length === 0 ? (
            <Paper
              variant="outlined"
              sx={{
                p: 5,
                textAlign: 'center',
                backgroundColor: '#f8fafc',
                borderRadius: 3,
                borderStyle: 'dashed',
              }}
            >
              <Typography sx={{ fontSize: '2rem', mb: 1 }}>🎉</Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1e293b' }}>
                All tasks clear!
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748b' }}>
                No open approval or review tasks found for the selected assignment group.
              </Typography>
            </Paper>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredTasks.map((task) => {
                const req = task.parentRequest;
                return (
                  <Paper
                    key={task.id}
                    variant="outlined"
                    sx={{
                      p: 2.5,
                      borderRadius: 2.5,
                      transition: 'all 0.15s ease',
                      '&:hover': { borderColor: '#cbd5e1', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' },
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 1.5 }}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb', fontSize: '0.8rem' }}>
                            {task.number}
                          </Typography>
                          <Chip label={task.state} size="small" color="primary" sx={{ height: 20, fontSize: '0.675rem' }} />
                          <Chip label={task.assignmentGroup} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.675rem' }} />
                        </Box>
                        <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
                          {task.name} — {req.titleName} {req.version}
                        </Typography>
                      </Box>

                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          variant="contained"
                          color="success"
                          size="small"
                          startIcon={<CheckCircleIcon />}
                          onClick={() => handleOpenActionDialog(task, 'approve')}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          startIcon={<CancelIcon />}
                          onClick={() => handleOpenActionDialog(task, 'reject')}
                        >
                          Reject
                        </Button>
                      </Box>
                    </Box>

                    <Paper variant="outlined" sx={{ p: 1.5, backgroundColor: '#f8fafc', borderRadius: 1.5, mb: 1.5 }}>
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={4}>
                          <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>Parent Request</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{req.number}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                          <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>Requester & Dept</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{req.requestedFor} ({req.department})</Typography>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                          <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>Target Host</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{req.targetDevice}</Typography>
                        </Grid>
                      </Grid>
                    </Paper>

                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, display: 'block', mb: 0.25 }}>
                        Business Justification:
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#334155', fontStyle: 'italic' }}>
                        "{req.businessJustification}"
                      </Typography>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Task Action Modal Dialog */}
      <Dialog open={actionDialog.open} onClose={() => setActionDialog({ ...actionDialog, open: false })} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {actionDialog.action === 'approve' ? '✅ Approve Catalog Task' : '❌ Reject Catalog Task'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            You are about to {actionDialog.action === 'approve' ? 'approve' : 'reject'} task <strong>{actionDialog.taskName}</strong> for request <strong>{actionDialog.reqNumber}</strong>.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            multiline
            rows={3}
            label="Reviewer Comments & Audit Notes"
            value={actionDialog.notes}
            onChange={e => setActionDialog({ ...actionDialog, notes: e.target.value })}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setActionDialog({ ...actionDialog, open: false })} color="secondary">
            Cancel
          </Button>
          <Button
            onClick={handleConfirmAction}
            variant="contained"
            color={actionDialog.action === 'approve' ? 'success' : 'error'}
            disabled={acting}
          >
            {acting ? 'Updating...' : actionDialog.action === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
