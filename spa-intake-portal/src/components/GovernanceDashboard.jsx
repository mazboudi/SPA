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
  Alert,
  AlertTitle,
  Checkbox,
  FormControlLabel,
  Tooltip,
  IconButton,
  Collapse,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import RefreshIcon from '@mui/icons-material/Refresh';
import SecurityIcon from '@mui/icons-material/Security';
import ShieldIcon from '@mui/icons-material/Shield';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

// ── 12 Policy Criteria from todo.txt ─────────────────────────────────────────
const POLICY_CRITERIA_DEFINITIONS = [
  {
    id: 'cvssUnderSeven',
    label: '1. NVD CVSS v3.x Score < 7.0',
    description: 'Must not be associated with vulnerability with a NVD CVSS v3.x security score of >= 7.0.',
    isAutomated: true,
  },
  {
    id: 'noTrendingMediumPlus',
    label: '2. No Trending Medium+ CVEs (30–60 Days)',
    description: 'Must not have trending ≥ medium scored vulnerabilities over a span of 30-60 days.',
    isAutomated: true,
  },
  {
    id: 'notServerSoftware',
    label: '3. Workstation Only (Not Server Software)',
    description: 'Must not be server software. Server software is server software even if compatible and vendor supported on a workstation.',
    isAutomated: false,
  },
  {
    id: 'vendorSupportActive',
    label: '4. Active Vendor Support',
    description: 'Must be in active vendor lifecycle support with regular security patches.',
    isAutomated: false,
  },
  {
    id: 'notTrialOrEval',
    label: '5. Not Trial or Evaluation Software',
    description: 'Must not be trial, preview, evaluation, or time-limited demonstration software.',
    isAutomated: false,
  },
  {
    id: 'noApprovedAlternative',
    label: '6. No Existing Approved Alternative',
    description: 'There mustn’t be an existing approved enterprise alternative in the software catalog.',
    isAutomated: false,
  },
  {
    id: 'standardInstallPath',
    label: '7. Approved Installation Path',
    description: 'Install path must be C:\\Program Files, C:\\Program Files (x86), or an actively managed EUC location.',
    isAutomated: false,
  },
  {
    id: 'cloudSvpApproval',
    label: '8. Cloud Element Security SVP Approval',
    description: 'Must have Security Architecture SVP approval if there is an externally hosted cloud element.',
    isAutomated: false,
  },
  {
    id: 'noDisallowedPrereqs',
    label: '9. No Disallowed Prerequisites',
    description: 'There mustn’t be a disallowed or deprecated prerequisite dependency.',
    isAutomated: false,
  },
  {
    id: 'aiGovernanceReviewed',
    label: '10. AI Governance Review (Keith Edwards)',
    description: 'Must have all AI integration documented, reviewed by AI Governance Team (Keith Edwards), and socialized with Cyber Risk.',
    isAutomated: false,
  },
  {
    id: 'legalFreewareApproved',
    label: '11. Legal Freeware Approval',
    description: 'Must have approval from Legal if software is designated as “Freeware” (distinct from Shareware or Open Source).',
    isAutomated: false,
  },
  {
    id: 'browserExtensionCompliant',
    label: '12. Browser Extension Compliance & Zero Tracking',
    description: 'Browser extensions must have evidence of support, no critical permission flags, and no tracking or data collection mechanisms.',
    isAutomated: false,
  },
];

// ── NIST NVD 2.0 Security Scorecard Component ────────────────────────────────
function NistRiskScoreCard({ titleName, version = '', preloadedSummary = null }) {
  const [nistData, setNistData] = useState(preloadedSummary);
  const [loading, setLoading] = useState(!preloadedSummary);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(null);

  const fetchNist = (refresh = false) => {
    setLoading(true);
    setError(null);
    const url = `/api/intake/security/nist-risk?title=${encodeURIComponent(titleName)}&version=${encodeURIComponent(version)}${refresh ? '&refresh=true' : ''}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setNistData(data.risk);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!preloadedSummary) {
      fetchNist(false);
    }
  }, [titleName, version]);

  if (loading) {
    return (
      <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <CircularProgress size={20} />
        <Typography variant="body2" sx={{ color: '#64748b' }}>
          Querying live NIST NVD 2.0 vulnerability metrics for <strong>{titleName}</strong>...
        </Typography>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper variant="outlined" sx={{ p: 2, bgcolor: '#fef2f2', borderColor: '#fecaca', borderRadius: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" sx={{ color: '#991b1b' }}>
            ⚠️ NIST NVD query: {error}
          </Typography>
          <Button size="small" onClick={() => fetchNist(true)} sx={{ textTransform: 'none' }}>
            Retry NIST
          </Button>
        </Box>
      </Paper>
    );
  }

  if (!nistData) return null;

  const maxCvss = nistData.maxCvss || 0;
  const trendingCount = nistData.trendingCount || 0;
  const totalCves = nistData.totalCves || 0;
  const riskLevel = nistData.riskLevel || 'CLEAN';
  const cves = nistData.cves || [];

  const getRiskColor = (lvl) => {
    switch (lvl) {
      case 'CRITICAL': return { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', badge: 'error' };
      case 'HIGH': return { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5', badge: 'error' };
      case 'MEDIUM': return { bg: '#fffbeb', text: '#92400e', border: '#fde68a', badge: 'warning' };
      case 'LOW': return { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe', badge: 'info' };
      default: return { bg: '#f0fdf4', text: '#166534', border: '#86efac', badge: 'success' };
    }
  };

  const colors = getRiskColor(riskLevel);

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        mt: 1.5,
        mb: 1.5,
        borderRadius: 2,
        bgcolor: colors.bg,
        borderColor: colors.border,
        borderWidth: maxCvss >= 7.0 ? '1.5px' : '1px',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShieldIcon sx={{ fontSize: 22, color: colors.text }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: colors.text }}>
            NIST NVD 2.0 Security Scorecard: {titleName}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={`NIST Risk: ${riskLevel}`}
            size="small"
            color={colors.badge}
            sx={{ fontWeight: 800, fontSize: '0.75rem' }}
          />
          {nistData.isCached && (
            <Tooltip title="Loaded instantly from 24-hour enterprise SQLite cache">
              <Chip label="Cached" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
            </Tooltip>
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
            onClick={() => fetchNist(true)}
            sx={{ textTransform: 'none', height: 24, fontSize: '0.725rem', bgcolor: '#ffffff' }}
          >
            Live Re-scan
          </Button>
        </Box>
      </Box>

      {/* Metric Tiles */}
      <Grid container spacing={1.5} sx={{ mb: 1 }}>
        <Grid item xs={12} sm={4}>
          <Box sx={{ p: 1.25, bgcolor: '#ffffff', borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
            <Typography variant="caption" sx={{ color: '#64748b', display: 'block', fontWeight: 600 }}>
              Max CVSS v3.x Score
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
              <Typography variant="h4" sx={{ fontWeight: 800, color: maxCvss >= 7.0 ? '#dc2626' : '#16a34a' }}>
                {maxCvss > 0 ? maxCvss.toFixed(1) : '0.0'}
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                / 10.0 ({maxCvss >= 7.0 ? 'Exceeds Threshold ❌' : 'Within Limit ✅'})
              </Typography>
            </Box>
          </Box>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Box sx={{ p: 1.25, bgcolor: '#ffffff', borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
            <Typography variant="caption" sx={{ color: '#64748b', display: 'block', fontWeight: 600 }}>
              30–60d Trending CVEs (≥ Medium)
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
              <Typography variant="h4" sx={{ fontWeight: 800, color: trendingCount > 0 ? '#d97706' : '#16a34a' }}>
                {trendingCount}
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                {trendingCount > 0 ? 'Active Trending ⚠️' : 'Zero Trending ✅'}
              </Typography>
            </Box>
          </Box>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Box sx={{ p: 1.25, bgcolor: '#ffffff', borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
            <Typography variant="caption" sx={{ color: '#64748b', display: 'block', fontWeight: 600 }}>
              Total NIST NVD CVEs
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
              <Typography variant="h4" sx={{ fontWeight: 800, color: '#1e293b' }}>
                {totalCves}
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                known CVE records
              </Typography>
            </Box>
          </Box>
        </Grid>
      </Grid>

      {/* Automated Policy Violations Warnings */}
      {maxCvss >= 7.0 && (
        <Alert severity="error" sx={{ mb: 1, py: 0.5, borderRadius: 1.5 }}>
          <strong>Policy Rule 1 Failure:</strong> NVD CVSS v3.x score ({maxCvss.toFixed(1)}) is &gt;= 7.0. Policy dictates software must not be associated with vulnerabilities with CVSS &gt;= 7.0 without formal Security Architecture waiver.
        </Alert>
      )}

      {trendingCount > 0 && (
        <Alert severity="warning" sx={{ mb: 1, py: 0.5, borderRadius: 1.5 }}>
          <strong>Policy Rule 2 Warning:</strong> Found {trendingCount} trending vulnerability/vulnerabilities (&ge; Medium) published within the last 30–60 days.
        </Alert>
      )}

      {/* Expandable Top CVEs Table */}
      {cves.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Button
            size="small"
            variant="text"
            onClick={() => setExpanded(!expanded)}
            endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            sx={{ textTransform: 'none', fontWeight: 600, color: colors.text, p: 0 }}
          >
            {expanded ? 'Hide Top Vulnerabilities' : `Inspect Top ${cves.length} NIST CVEs`}
          </Button>

          <Collapse in={expanded}>
            <Box sx={{ mt: 1, maxHeight: 220, overflowY: 'auto', bgcolor: '#ffffff', borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>CVE Identifier</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>CVSS Score</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Published</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Vulnerability Summary</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cves.map((cve) => (
                    <TableRow key={cve.id} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.75rem' }}>
                        <a
                          href={cve.nvdUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          {cve.id} <OpenInNewIcon sx={{ fontSize: 12 }} />
                        </a>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={`${cve.cvss} ${cve.severity}`}
                          size="small"
                          color={cve.cvss >= 7.0 ? 'error' : cve.cvss >= 4.0 ? 'warning' : 'success'}
                          sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {cve.published ? cve.published.slice(0, 10) : '—'}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: '#334155' }}>
                        {cve.description}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </Box>
      )}
    </Paper>
  );
}

// ── Main Governance Dashboard Component ──────────────────────────────────────
export default function GovernanceDashboard({ onTaskUpdated, initialQueue = 'all', onQueueChange }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTabGroup, setActiveTabGroup] = useState(initialQueue || 'all');

  // Sync active tab if initialQueue changes from parent
  useEffect(() => {
    if (initialQueue) {
      setActiveTabGroup(initialQueue);
    }
  }, [initialQueue]);

  // Dialog State for Approval / Rejection Action
  const [actionDialog, setActionDialog] = useState({
    open: false,
    taskId: null,
    taskName: '',
    reqNumber: '',
    softwareTitle: '',
    version: '',
    isUnlisted: false,
    isRiskTask: false,
    action: 'approve',
    notes: '',
    recommendedAlternative: '',
    nistEvaluation: null,
    checklist: POLICY_CRITERIA_DEFINITIONS.reduce((acc, c) => ({ ...acc, [c.id]: true }), {}),
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

  // Calculate queue counts
  const riskTasks = openTasks.filter(t => t.assignmentGroup.toLowerCase().includes('risk') || t.name.toLowerCase().includes('risk'));
  const samTasks = openTasks.filter(t => t.assignmentGroup.toLowerCase().includes('asset') || t.name.toLowerCase().includes('licens') || t.assignmentGroup.toLowerCase().includes('licens'));
  const packagingTasks = openTasks.filter(t => t.assignmentGroup.toLowerCase().includes('packag') || t.name.toLowerCase().includes('packag'));

  const filteredTasks = activeTabGroup === 'all'
    ? openTasks
    : (activeTabGroup === 'Enterprise Risk' || activeTabGroup.toLowerCase().includes('risk'))
    ? riskTasks
    : (activeTabGroup === 'Software Asset Management' || activeTabGroup.toLowerCase().includes('asset') || activeTabGroup.toLowerCase().includes('licens'))
    ? samTasks
    : (activeTabGroup === 'Packaging' || activeTabGroup.toLowerCase().includes('packag'))
    ? packagingTasks
    : openTasks.filter(t => t.assignmentGroup.toLowerCase().includes(activeTabGroup.toLowerCase()));

  const handleTabChange = (val) => {
    setActiveTabGroup(val);
    if (onQueueChange) onQueueChange(val);
  };

  const handleOpenActionDialog = async (task, action) => {
    const isRisk = task.name.includes('Risk') || task.assignmentGroup.includes('Risk');
    const titleName = task.parentRequest.titleName;
    const version = task.parentRequest.version;

    let nistEval = null;
    let initialChecklist = POLICY_CRITERIA_DEFINITIONS.reduce((acc, c) => ({ ...acc, [c.id]: true }), {});

    if (isRisk) {
      // Fetch or use cached NIST evaluation
      try {
        const res = await fetch(`/api/intake/security/nist-risk?title=${encodeURIComponent(titleName)}&version=${encodeURIComponent(version)}`);
        const data = await res.json();
        if (data?.risk) {
          nistEval = data.risk;
          // Rule 1: CVSS < 7.0
          initialChecklist.cvssUnderSeven = (data.risk.maxCvss || 0) < 7.0;
          // Rule 2: Trending <= 0
          initialChecklist.noTrendingMediumPlus = (data.risk.trendingCount || 0) === 0;
        }
      } catch (err) {
        console.warn('Could not load NIST evaluation for dialog:', err);
      }
    }

    const defaultNotes = action === 'approve'
      ? isRisk
        ? `Enterprise Risk Review Approved: Verified against NIST NVD 2.0 (Max CVSS: ${(nistEval?.maxCvss || 0).toFixed(1)}). All 12 Enterprise Architecture & Cyber Risk criteria satisfied.`
        : 'Approved for enterprise deployment and catalog enrollment.'
      : isRisk
        ? `Enterprise Risk Review Rejected: Software title violates corporate risk policy (NIST Max CVSS: ${(nistEval?.maxCvss || 0).toFixed(1)}).`
        : 'Rejected due to corporate security/architecture policy.';

    setActionDialog({
      open: true,
      taskId: task.id,
      taskName: task.name,
      reqNumber: task.parentRequest.number,
      softwareTitle: titleName,
      version: version,
      isUnlisted: !!task.parentRequest.isUnlisted,
      isRiskTask: isRisk,
      action,
      notes: defaultNotes,
      recommendedAlternative: '',
      nistEvaluation: nistEval,
      checklist: initialChecklist,
    });
  };

  const handleChecklistToggle = (id) => {
    setActionDialog(prev => {
      const updated = { ...prev.checklist, [id]: !prev.checklist[id] };
      const failedCount = Object.values(updated).filter(v => !v).length;
      let notes = prev.notes;
      if (prev.isRiskTask) {
        if (failedCount === 0) {
          notes = `Enterprise Risk Review Approved: Verified against NIST NVD 2.0 (Max CVSS: ${(prev.nistEvaluation?.maxCvss || 0).toFixed(1)}). All 12 Enterprise Architecture & Cyber Risk criteria satisfied.`;
        } else {
          notes = `Enterprise Risk Policy Warning: ${failedCount} criteria flagged for review. Max CVSS: ${(prev.nistEvaluation?.maxCvss || 0).toFixed(1)}.`;
        }
      }
      return { ...prev, checklist: updated, notes };
    });
  };

  const handlePassAllChecks = () => {
    const allPassed = POLICY_CRITERIA_DEFINITIONS.reduce((acc, c) => ({ ...acc, [c.id]: true }), {});
    setActionDialog(prev => ({
      ...prev,
      checklist: allPassed,
      notes: `Enterprise Risk Review Approved: Verified against NIST NVD 2.0 (Max CVSS: ${(prev.nistEvaluation?.maxCvss || 0).toFixed(1)}). All 12 Enterprise Architecture & Cyber Risk criteria satisfied.`,
    }));
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
          dispositionDecision: actionDialog.action === 'approve' ? 'Approved' : 'Denied',
          recommendedAlternative: actionDialog.recommendedAlternative,
          riskEvaluation: actionDialog.isRiskTask ? {
            nist: actionDialog.nistEvaluation,
            checklist: actionDialog.checklist,
            reviewedAt: new Date().toISOString(),
          } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      setActionDialog(prev => ({ ...prev, open: false }));
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
              Review, evaluate, and clear pending Software Requests across dedicated operational queues: <strong>Enterprise Risk (NIST 2.0)</strong> → <strong>Licensing / SAM</strong> → <strong>EUC Packaging</strong>.
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

        {/* Dedicated Operational Queue Filter Tabs */}
        <Box sx={{ px: 2.5, backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <Tabs
            value={activeTabGroup}
            onChange={(e, val) => handleTabChange(val)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ minHeight: 48 }}
          >
            <Tab
              label={`All Tasks (${openTasks.length})`}
              value="all"
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
            />
            <Tab
              icon={<ShieldIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              label={`Enterprise Risk Queue (${riskTasks.length})`}
              value="Enterprise Risk"
              sx={{
                minHeight: 48,
                textTransform: 'none',
                fontWeight: 700,
                color: riskTasks.length > 0 ? '#b91c1c !important' : undefined,
              }}
            />
            <Tab
              label={`Licensing / SAM Queue (${samTasks.length})`}
              value="Software Asset Management"
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
            />
            <Tab
              label={`Packaging Execution Queue (${packagingTasks.length})`}
              value="Packaging"
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
            />
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
                Queue is clear!
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748b' }}>
                No open approval or review tasks found for the selected queue.
              </Typography>
            </Paper>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {filteredTasks.map((task) => {
                const req = task.parentRequest;
                const isRiskTask = task.assignmentGroup.toLowerCase().includes('risk') || task.name.toLowerCase().includes('risk');

                return (
                  <Paper
                    key={task.id}
                    variant="outlined"
                    sx={{
                      p: 2.5,
                      borderRadius: 2.5,
                      transition: 'all 0.15s ease',
                      '&:hover': { borderColor: '#cbd5e1', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 1.5 }}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb', fontSize: '0.8rem' }}>
                            {task.number}
                          </Typography>
                          <Chip label={task.state} size="small" color="primary" sx={{ height: 20, fontSize: '0.675rem' }} />
                          <Chip
                            icon={isRiskTask ? <ShieldIcon sx={{ fontSize: '13px !important' }} /> : undefined}
                            label={task.assignmentGroup}
                            size="small"
                            variant="outlined"
                            sx={{
                              height: 20,
                              fontSize: '0.675rem',
                              fontWeight: isRiskTask ? 700 : 500,
                              borderColor: isRiskTask ? '#f87171' : undefined,
                              color: isRiskTask ? '#b91c1c' : undefined,
                            }}
                          />
                          {req.isUnlisted && (
                            <Chip label="Net New Unlisted" size="small" sx={{ height: 20, fontSize: '0.675rem', bgcolor: '#fef3c7', color: '#92400e', fontWeight: 700 }} />
                          )}
                          {req.isNewVersion && (
                            <Chip label="New Version Request" size="small" sx={{ height: 20, fontSize: '0.675rem', bgcolor: '#dbeafe', color: '#1e40af', fontWeight: 700 }} />
                          )}
                          {(req.installType === 'Exception' || req.disposition === 'Denied') && (
                            <Chip label="Prohibited Exception" size="small" sx={{ height: 20, fontSize: '0.675rem', bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 700 }} />
                          )}
                          {req.licenseRequired === 'Yes' && (
                            <Chip label="Commercial License (SAM)" size="small" sx={{ height: 20, fontSize: '0.675rem', bgcolor: '#f3e8ff', color: '#6b21a8', fontWeight: 700 }} />
                          )}
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
                          {isRiskTask ? 'Evaluate & Approve' : 'Approve'}
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

                    {/* Metadata strip */}
                    <Paper variant="outlined" sx={{ p: 1.5, backgroundColor: '#f8fafc', borderRadius: 1.5, mb: 1.5 }}>
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={3}>
                          <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>Parent Request</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{req.number}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={3}>
                          <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>Submitted By</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{req.requestedBy || req.requestedFor}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={3}>
                          <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>Beneficiary</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{req.requestedFor} ({req.department})</Typography>
                        </Grid>
                        <Grid item xs={12} sm={3}>
                          <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>Target Host & OS</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{req.targetDevice || 'Workstation'} ({req.platform?.toUpperCase()})</Typography>
                        </Grid>
                      </Grid>
                    </Paper>

                    {/* Business Justification */}
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, display: 'block', mb: 0.25 }}>
                        Business Justification:
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#334155', fontStyle: 'italic' }}>
                        "{req.businessJustification}"
                      </Typography>
                    </Box>

                    {/* ── NIST NVD 2.0 Security Scorecard for Risk Governance Tasks ── */}
                    {isRiskTask && (
                      <NistRiskScoreCard
                        titleName={req.titleName}
                        version={req.version}
                        preloadedSummary={req.nistSummary ? JSON.parse(req.nistSummary) : null}
                      />
                    )}
                  </Paper>
                );
              })}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ── Task Action & 12-Point Enterprise Risk Review Modal Dialog ──────── */}
      <Dialog
        open={actionDialog.open}
        onClose={() => setActionDialog(prev => ({ ...prev, open: false }))}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          {actionDialog.isRiskTask ? <ShieldIcon color="primary" /> : null}
          {actionDialog.action === 'approve'
            ? (actionDialog.isRiskTask ? '🛡️ Enterprise Risk Review & Approval' : '✅ Approve Catalog Task')
            : (actionDialog.isRiskTask ? '🛡️ Enterprise Risk Review Rejection' : '❌ Reject Catalog Task')}
        </DialogTitle>

        <DialogContent dividers>
          <DialogContentText sx={{ mb: 2 }}>
            Reviewing task <strong>{actionDialog.taskName}</strong> for request <strong>{actionDialog.reqNumber}</strong> ({actionDialog.softwareTitle} v{actionDialog.version}).
          </DialogContentText>

          {/* NIST Live Telemetry Banner inside Risk Dialog */}
          {actionDialog.isRiskTask && actionDialog.nistEvaluation && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2.5, bgcolor: '#f8fafc', borderRadius: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                  NIST NVD 2.0 Security Scorecard Telemetry
                </Typography>
                <Chip
                  label={`Max CVSS: ${(actionDialog.nistEvaluation.maxCvss || 0).toFixed(1)} / 10.0`}
                  size="small"
                  color={(actionDialog.nistEvaluation.maxCvss || 0) >= 7.0 ? 'error' : 'success'}
                  sx={{ fontWeight: 700 }}
                />
              </Box>
              <Typography variant="body2" sx={{ color: '#475569' }}>
                Total Vulnerabilities: <strong>{actionDialog.nistEvaluation.totalCves || 0}</strong> • 30–60d Trending CVEs: <strong>{actionDialog.nistEvaluation.trendingCount || 0}</strong> • NIST Tier: <strong>{actionDialog.nistEvaluation.riskLevel}</strong>
              </Typography>
            </Paper>
          )}

          {/* ── 12-POINT ENTERPRISE RISK APPROVAL CHECKLIST (from todo.txt) ── */}
          {actionDialog.isRiskTask && (
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                  Enterprise Risk Policy Approval Criteria (12 Points)
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handlePassAllChecks}
                  sx={{ textTransform: 'none', fontSize: '0.75rem', fontWeight: 600 }}
                >
                  Pass All 12 Standard Checks
                </Button>
              </Box>

              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: '#fafafa' }}>
                <Grid container spacing={1}>
                  {POLICY_CRITERIA_DEFINITIONS.map((crit) => {
                    const isPassed = actionDialog.checklist[crit.id];
                    return (
                      <Grid item xs={12} sm={6} key={crit.id}>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 1.25,
                            borderRadius: 1.5,
                            bgcolor: isPassed ? '#ffffff' : '#fef2f2',
                            borderColor: isPassed ? '#e2e8f0' : '#fca5a5',
                          }}
                        >
                          <FormControlLabel
                            sx={{ m: 0, width: '100%', alignItems: 'flex-start' }}
                            control={
                              <Checkbox
                                checked={!!isPassed}
                                onChange={() => handleChecklistToggle(crit.id)}
                                size="small"
                                color={isPassed ? 'success' : 'error'}
                                sx={{ p: 0.5, mt: -0.25 }}
                              />
                            }
                            label={
                              <Box sx={{ ml: 0.5 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 700, color: isPassed ? '#0f172a' : '#991b1b', fontSize: '0.8rem' }}>
                                    {crit.label}
                                  </Typography>
                                  {crit.isAutomated && (
                                    <Chip label="NIST Auto" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 700 }} />
                                  )}
                                </Box>
                                <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.72rem', display: 'block', mt: 0.25 }}>
                                  {crit.description}
                                </Typography>
                              </Box>
                            }
                          />
                        </Paper>
                      </Grid>
                    );
                  })}
                </Grid>
              </Paper>
            </Box>
          )}

          {/* Unlisted Model Notice */}
          {actionDialog.isUnlisted && actionDialog.action === 'approve' && (
            <Alert severity="success" sx={{ mb: 2, fontSize: '0.8rem' }}>
              <strong>Authoritative Catalog Enrollment:</strong> Approving this request will permanently register this software model into the Authoritative Catalog as an <strong>Approved</strong> software title for all enterprise users.
            </Alert>
          )}

          {actionDialog.action === 'reject' && (
            <Alert severity="warning" sx={{ mb: 2, fontSize: '0.8rem' }}>
              <strong>Denial Policy Recording:</strong> Rejecting will update the request to <strong>Closed Denied</strong> and record the software title as <strong>Denied / Prohibited</strong> in the authoritative catalog.
            </Alert>
          )}

          <TextField
            fullWidth
            multiline
            rows={3}
            label="Reviewer Comments & Audit Notes *"
            value={actionDialog.notes}
            onChange={e => setActionDialog({ ...actionDialog, notes: e.target.value })}
            sx={{ mb: actionDialog.action === 'reject' ? 2 : 0 }}
          />

          {actionDialog.action === 'reject' && (
            <TextField
              fullWidth
              size="small"
              label="Mandated Enterprise Alternative (Optional)"
              placeholder="e.g. Google Chrome Enterprise, Postman Corporate"
              value={actionDialog.recommendedAlternative}
              onChange={e => setActionDialog({ ...actionDialog, recommendedAlternative: e.target.value })}
              helperText="Specify an approved corporate alternative for users to adopt"
              sx={{ mt: 2 }}
            />
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setActionDialog(prev => ({ ...prev, open: false }))} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleConfirmAction}
            variant="contained"
            color={actionDialog.action === 'approve' ? 'success' : 'error'}
            disabled={acting || !actionDialog.notes.trim()}
          >
            {acting ? 'Recording...' : actionDialog.action === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
