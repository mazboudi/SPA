import { useState } from 'react';
import {
  Drawer, Box, List, ListItemButton, ListItemIcon, ListItemText,
  Collapse, Divider, Typography, Tooltip, Chip,
} from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import EditIcon from '@mui/icons-material/Edit';
import SettingsIcon from '@mui/icons-material/Settings';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArticleIcon from '@mui/icons-material/Article';
import InstallDesktopIcon from '@mui/icons-material/InstallDesktop';
import CodeIcon from '@mui/icons-material/Code';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import RateReviewIcon from '@mui/icons-material/RateReview';
import AppleIcon from '@mui/icons-material/Apple';
import BackupIcon from '@mui/icons-material/Backup';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import QueueIcon from '@mui/icons-material/Queue';
import SyncAltIcon from '@mui/icons-material/SyncAlt';

export const DRAWER_WIDTH = 240;
export const DRAWER_COLLAPSED_WIDTH = 58;

// ── Stage definitions per platform ────────────────────────────────────────
const WIN_STAGES = [
  { stepId: 'basic',     icon: <ArticleIcon sx={{ fontSize: 18 }} />,        label: 'Project Info' },
  { stepId: 'installer', icon: <InstallDesktopIcon sx={{ fontSize: 18 }} />, label: 'Installer' },
  { stepId: 'psadt',     icon: <CodeIcon sx={{ fontSize: 18 }} />,           label: 'PSADT' },
  { stepId: 'intune',    icon: <CloudUploadIcon sx={{ fontSize: 18 }} />,    label: 'Intune' },
  { stepId: 'review',    icon: <RateReviewIcon sx={{ fontSize: 18 }} />,     label: 'Review & Export' },
];

const MAC_STAGES = [
  { stepId: 'basic',         icon: <ArticleIcon sx={{ fontSize: 18 }} />,    label: 'Project Info' },
  { stepId: 'mac-installer', icon: <AppleIcon sx={{ fontSize: 18 }} />,      label: 'Mac Installer' },
  { stepId: 'macos',         icon: <BackupIcon sx={{ fontSize: 18 }} />,     label: 'macOS Config' },
  { stepId: 'review',        icon: <RateReviewIcon sx={{ fontSize: 18 }} />, label: 'Review & Export' },
];

// ── NavSection wrapper ─────────────────────────────────────────────────────
function NavSection({ icon, label, selected, onClick, children, chip, open: openProp, sidebarOpen }) {
  const [open, setOpen] = useState(openProp ?? false);
  const hasChildren = Boolean(children);

  const handleClick = () => {
    if (hasChildren) setOpen(o => !o);
    if (onClick) onClick();
  };

  return (
    <>
      <Tooltip title={!sidebarOpen ? label : ''} placement="right">
        <ListItemButton
          selected={selected && !hasChildren}
          onClick={handleClick}
          sx={{ py: 0.75 }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: selected ? 'primary.main' : 'text.secondary' }}>
            {icon}
          </ListItemIcon>
          {sidebarOpen && (
            <>
              <ListItemText
                primary={label}
                primaryTypographyProps={{
                  fontSize: '0.82rem',
                  fontWeight: selected ? 600 : 400,
                  color: selected ? 'primary.main' : 'text.primary',
                }}
              />
              {chip && <Chip label={chip} size="small" sx={{ height: 18, fontSize: '0.65rem', mr: 0.5 }} />}
              {hasChildren && (open ? <ExpandLessIcon sx={{ fontSize: 16, color: 'text.disabled' }} /> : <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.disabled' }} />)}
            </>
          )}
        </ListItemButton>
      </Tooltip>
      {hasChildren && sidebarOpen && (
        <Collapse in={open} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {children}
          </List>
        </Collapse>
      )}
    </>
  );
}

// ── Stage sub-item ─────────────────────────────────────────────────────────
function StageItem({ icon, label, active, completed, onClick, sidebarOpen }) {
  return (
    <Tooltip title={!sidebarOpen ? label : ''} placement="right">
      <ListItemButton
        onClick={onClick}
        selected={active}
        sx={{
          pl: sidebarOpen ? 4 : 1.5,
          py: 0.5,
          borderLeft: active ? '2px solid' : '2px solid transparent',
          borderColor: active ? 'primary.main' : 'transparent',
          ml: sidebarOpen ? 1 : 0,
          borderRadius: '0 6px 6px 0',
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: 30,
            color: active ? 'primary.main' : completed ? 'success.main' : 'text.disabled',
          }}
        >
          {completed && !active ? '✓' : icon}
        </ListItemIcon>
        {sidebarOpen && (
          <ListItemText
            primary={label}
            primaryTypographyProps={{
              fontSize: '0.78rem',
              fontWeight: active ? 600 : 400,
              color: active ? 'primary.main' : completed ? 'success.main' : 'text.secondary',
            }}
          />
        )}
      </ListItemButton>
    </Tooltip>
  );
}

// ── Main Sidebar ───────────────────────────────────────────────────────────
export default function Sidebar({
  open: sidebarOpen,
  platform,
  activeView,          // 'home' | 'package' | 'edit' | 'settings'
  activeStepId,        // current wizard step ID
  steps,               // wizard steps array from useWizardState
  currentStep,         // index
  onGoToStep,          // (idx) => void
  onQueueOpen,
  onNewBlank,
  onNewFromQueue,
  onRefactor,
  onEditPackages,
  onSettings,
}) {
  const stages = platform === 'macos' ? MAC_STAGES : WIN_STAGES;

  // Map stepId → index in wizard.steps
  const stepIdxMap = {};
  (steps || []).forEach((s, i) => { stepIdxMap[s.id] = i; });

  const inPackage = activeView === 'package';

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: sidebarOpen ? DRAWER_WIDTH : DRAWER_COLLAPSED_WIDTH,
        flexShrink: 0,
        transition: 'width 0.2s ease',
        '& .MuiDrawer-paper': {
          width: sidebarOpen ? DRAWER_WIDTH : DRAWER_COLLAPSED_WIDTH,
          transition: 'width 0.2s ease',
          overflowX: 'hidden',
          top: '56px',
          height: 'calc(100% - 56px)',
        },
      }}
    >
      {/* Platform label */}
      {sidebarOpen && platform && (
        <Box sx={{ px: 2, pt: 2, pb: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            {platform === 'windows' ? '⊞ Windows' : ' Mac'}
          </Typography>
        </Box>
      )}

      <List sx={{ pt: sidebarOpen && platform ? 0 : 1 }}>

        {/* ── Manage Queue ── */}
        <NavSection
          icon={<InboxIcon sx={{ fontSize: 18 }} />}
          label="Manage Queue"
          selected={activeView === 'queue'}
          onClick={onQueueOpen}
          sidebarOpen={sidebarOpen}
        />

        <Divider sx={{ my: 0.5, borderColor: 'divider' }} />

        {/* ── New Package ── */}
        <NavSection
          icon={<AddCircleIcon sx={{ fontSize: 18 }} />}
          label="New Package"
          selected={activeView === 'package' && !inPackage}
          open={true}
          sidebarOpen={sidebarOpen}
        >
          <StageItem
            icon={<NoteAddIcon sx={{ fontSize: 16 }} />}
            label="Blank"
            active={false}
            onClick={onNewBlank}
            sidebarOpen={sidebarOpen}
          />
          <StageItem
            icon={<QueueIcon sx={{ fontSize: 16 }} />}
            label="From Queue"
            active={false}
            onClick={onNewFromQueue}
            sidebarOpen={sidebarOpen}
          />
          <StageItem
            icon={<SyncAltIcon sx={{ fontSize: 16 }} />}
            label="Refactor Existing"
            active={false}
            onClick={onRefactor}
            sidebarOpen={sidebarOpen}
          />
        </NavSection>

        {/* ── Stage navigation (only when a package is active) ── */}
        {inPackage && (
          <>
            <Divider sx={{ my: 0.5, mx: 2, borderColor: 'divider' }} />
            {sidebarOpen && (
              <Typography variant="caption" sx={{ px: 2, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, display: 'block', pt: 1, pb: 0.5 }}>
                Stages
              </Typography>
            )}
            {stages.map((stage) => {
              const stageIdx = stepIdxMap[stage.stepId];
              const isActive = stage.stepId === activeStepId;
              const isCompleted = stageIdx !== undefined && stageIdx < currentStep;
              return (
                <StageItem
                  key={stage.stepId}
                  icon={stage.icon}
                  label={stage.label}
                  active={isActive}
                  completed={isCompleted}
                  onClick={() => stageIdx !== undefined && onGoToStep(stageIdx)}
                  sidebarOpen={sidebarOpen}
                />
              );
            })}
          </>
        )}

        <Divider sx={{ my: 0.5, borderColor: 'divider' }} />

        {/* ── Edit Packages ── */}
        <NavSection
          icon={<EditIcon sx={{ fontSize: 18 }} />}
          label="Edit Packages"
          selected={activeView === 'edit'}
          onClick={onEditPackages}
          sidebarOpen={sidebarOpen}
        />

      </List>

      {/* Settings pinned to bottom */}
      <Box sx={{ mt: 'auto', borderTop: '1px solid', borderColor: 'divider' }}>
        <List>
          <NavSection
            icon={<SettingsIcon sx={{ fontSize: 18 }} />}
            label="Settings"
            selected={activeView === 'settings'}
            onClick={onSettings}
            sidebarOpen={sidebarOpen}
          />
        </List>
      </Box>
    </Drawer>
  );
}
