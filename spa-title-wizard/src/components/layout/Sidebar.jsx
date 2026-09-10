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
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LaunchOutlinedIcon from '@mui/icons-material/LaunchOutlined';

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

// ── Shared item style helpers ──────────────────────────────────────────────
const itemSx = (selected, disabled) => ({
  py: 0.75,
  borderRadius: 1.5,
  mb: 0.25,
  opacity: disabled ? 0.4 : 1,
  pointerEvents: disabled ? 'none' : undefined,
  backgroundColor: selected ? '#1a1a1a' : 'transparent',
  borderLeft: selected ? '3px solid #f97316' : '3px solid transparent',
  '&:hover': { backgroundColor: '#1a1a1a' },
  '&.Mui-selected': { backgroundColor: '#1a1a1a' },
  '&.Mui-selected:hover': { backgroundColor: '#222222' },
});

// ── NavSection wrapper ─────────────────────────────────────────────────────
function NavSection({
  icon, label, selected, onClick, onExpand,
  children, chip, open: openProp, sidebarOpen, disabled,
  activeColor = '#f97316',
}) {
  const [open, setOpen] = useState(openProp ?? false);
  const hasChildren = Boolean(children);

  import('react').then(React => {
    React.useEffect(() => {
      if (disabled) setOpen(false);
      else if (openProp !== undefined) setOpen(openProp);
    }, [disabled, openProp]);
  });

  const handleClick = () => {
    if (disabled) return;
    if (hasChildren) {
      if (!sidebarOpen && onExpand) { onExpand(); setOpen(true); }
      else setOpen(o => !o);
    }
    if (onClick) onClick();
  };

  const tooltipTitle = disabled
    ? (sidebarOpen ? '' : `${label} (select a platform first)`)
    : (!sidebarOpen ? label : '');

  return (
    <>
      <Tooltip title={tooltipTitle} placement="right">
        <span style={{ display: 'block' }}>
          <ListItemButton
            selected={selected && !hasChildren}
            onClick={handleClick}
            disabled={disabled}
            sx={itemSx(selected && !hasChildren, disabled)}
          >
            <ListItemIcon sx={{ minWidth: 0, mr: sidebarOpen ? 1.5 : 'auto', justifyContent: 'center', color: selected ? activeColor : '#6b7280' }}>
              {icon}
            </ListItemIcon>
            {sidebarOpen && (
              <>
                <ListItemText
                  primary={label}
                  slotProps={{
                    primary: {
                      style: {
                        fontSize: '0.82rem',
                        fontWeight: selected ? 700 : 500,
                        color: selected ? '#f9fafb' : '#9ca3af',
                      },
                    },
                  }}
                />
                {chip && <Chip label={chip} size="small" sx={{ height: 18, fontSize: '0.65rem', mr: 0.5, bgcolor: '#1f1f1f', color: '#9ca3af' }} />}
                {hasChildren && (open
                  ? <ExpandLessIcon sx={{ fontSize: 15, color: '#4b5563' }} />
                  : <ExpandMoreIcon sx={{ fontSize: 15, color: '#4b5563' }} />
                )}
                {disabled && sidebarOpen && (
                  <Typography variant="caption" sx={{ fontSize: '0.62rem', color: '#4b5563', ml: 0.5, whiteSpace: 'nowrap' }}>
                    select platform
                  </Typography>
                )}
              </>
            )}
          </ListItemButton>
        </span>
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
function StageItem({ icon, label, active, completed, hasError, onClick, sidebarOpen, activeColor = '#f97316' }) {
  const iconColor = active
    ? activeColor
    : hasError   ? '#ef4444'
    : completed  ? '#22c55e'
    :              '#4b5563';

  const textColor = active
    ? activeColor
    : hasError   ? '#ef4444'
    : completed  ? '#22c55e'
    :              '#6b7280';

  const statusIcon = hasError ? '✗' : (completed && !active ? '✓' : icon);

  return (
    <Tooltip title={!sidebarOpen ? label : ''} placement="right">
      <ListItemButton
        onClick={onClick}
        selected={active}
        sx={{
          pl: sidebarOpen ? 3.5 : 1.5,
          py: 0.3,
          borderLeft: active ? `2px solid ${activeColor}` : '2px solid transparent',
          ml: sidebarOpen ? 0.5 : 0,
          borderRadius: '0 6px 6px 0',
          '&:hover': { backgroundColor: '#1a1a1a' },
          '&.Mui-selected': { backgroundColor: '#1a1a1a' },
        }}
      >
        <ListItemIcon sx={{ minWidth: 30, color: iconColor }}>
          {statusIcon}
        </ListItemIcon>
        {sidebarOpen && (
          <ListItemText
            primary={label}
            slotProps={{
              primary: {
                style: { fontSize: '0.78rem', fontWeight: active ? 600 : 400, color: textColor },
              },
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
  activeView,
  activeStepId,
  steps,
  currentStep,
  stepValidation,
  onGoToStep,
  onQueueOpen,
  onNewBlank,
  onNewFromQueue,
  onRefactor,
  onEditPackages,
  onClonePackages,
  onSettings,
  packageSource,
  onExpand,
}) {
  const stages = platform === 'macos' ? MAC_STAGES : WIN_STAGES;

  const stepIdxMap = {};
  (steps || []).forEach((s, i) => { stepIdxMap[s.id] = i; });

  const inPackage = activeView === 'package';

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: sidebarOpen ? DRAWER_WIDTH : DRAWER_COLLAPSED_WIDTH,
        flexShrink: 0,
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        '& .MuiDrawer-paper': {
          width: sidebarOpen ? DRAWER_WIDTH : DRAWER_COLLAPSED_WIDTH,
          transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          overflowX: 'hidden',
          top: '60px',
          height: 'calc(100% - 60px)',
          backgroundColor: '#0f0f0f',
          borderRight: '1px solid #1f1f1f',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Platform label */}
      {sidebarOpen && platform && (
        <Box sx={{ px: 2.5, pt: 2, pb: 0.5 }}>
          <Typography
            variant="caption"
            sx={{ color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, fontSize: '0.65rem' }}
          >
            {platform === 'windows' ? '⊞ Windows' : ' Mac'}
          </Typography>
        </Box>
      )}

      {!sidebarOpen && !platform && <Box sx={{ pt: 1.5 }} />}
      {sidebarOpen && !platform && (
        <Box sx={{ px: 2.5, pt: 2, pb: 0.5 }}>
          <Typography variant="caption" sx={{ color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, fontSize: '0.65rem' }}>
            Navigation
          </Typography>
        </Box>
      )}

      <List sx={{ pt: 0.5, px: 0.75, flexGrow: 1 }}>

        {/* ── Manage Queue ── */}
        <NavSection
          icon={<InboxIcon sx={{ fontSize: 18 }} />}
          label="Manage Queue"
          selected={activeView === 'queue'}
          onClick={onQueueOpen}
          sidebarOpen={sidebarOpen}
          onExpand={onExpand}
        />

        <Divider sx={{ my: 0.5, borderColor: '#1f1f1f' }} />

        {/* ── New Title ── */}
        <NavSection
          icon={<AddCircleIcon sx={{ fontSize: 18 }} />}
          label="New Title"
          selected={activeView === 'package' && !inPackage}
          open={!!platform}
          disabled={!platform}
          sidebarOpen={sidebarOpen}
          onExpand={onExpand}
        >
          <StageItem
            icon={<NoteAddIcon sx={{ fontSize: 16 }} />}
            label="Blank"
            active={packageSource === 'blank'}
            onClick={onNewBlank}
            sidebarOpen={sidebarOpen}
          />
          <StageItem
            icon={<QueueIcon sx={{ fontSize: 16 }} />}
            label="From Queue"
            active={packageSource === 'queue'}
            onClick={onNewFromQueue}
            sidebarOpen={sidebarOpen}
          />
          {platform !== 'macos' && (
            <StageItem
              icon={<SyncAltIcon sx={{ fontSize: 16 }} />}
              label="Intune Import"
              active={packageSource === 'import'}
              onClick={onRefactor}
              sidebarOpen={sidebarOpen}
            />
          )}
        </NavSection>

        <Divider sx={{ my: 0.5, borderColor: '#1f1f1f' }} />

        {/* ── Edit Title ── */}
        <NavSection
          icon={<EditIcon sx={{ fontSize: 18 }} />}
          label="Edit Title"
          selected={activeView === 'edit' || packageSource === 'edit'}
          onClick={onEditPackages}
          disabled={!platform}
          sidebarOpen={sidebarOpen}
          onExpand={onExpand}
        />

        {/* ── Clone Title ── */}
        <NavSection
          icon={<ContentCopyIcon sx={{ fontSize: 18 }} />}
          label="Clone Title"
          selected={activeView === 'clone' || packageSource === 'clone'}
          onClick={onClonePackages}
          disabled={!platform}
          sidebarOpen={sidebarOpen}
          onExpand={onExpand}
        />

        {/* ── Stage navigation ── */}
        {inPackage && (
          <>
            <Divider sx={{ my: 0.5, borderColor: '#1f1f1f' }} />
            {sidebarOpen && (
              <Typography
                variant="caption"
                sx={{ px: 2, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, fontSize: '0.65rem', display: 'block', pt: 1, pb: 0.5 }}
              >
                Stages
              </Typography>
            )}
            {stages.map((stage) => {
              const stageIdx = stepIdxMap[stage.stepId];
              const isActive = stage.stepId === activeStepId;
              const isCompleted = stageIdx !== undefined && stageIdx < currentStep;
              const isValid = stepValidation ? stepValidation[stage.stepId] !== false : true;
              const hasError = isCompleted && !isValid;
              return (
                <StageItem
                  key={stage.stepId}
                  icon={stage.icon}
                  label={stage.label}
                  active={isActive}
                  completed={isCompleted}
                  hasError={hasError}
                  onClick={() => stageIdx !== undefined && onGoToStep(stageIdx)}
                  sidebarOpen={sidebarOpen}
                />
              );
            })}
          </>
        )}
      </List>

      {/* ── Bottom: Intake Portal + Settings ──────────────────────── */}
      <Box>
        <Divider sx={{ borderColor: '#1f1f1f', mb: 1 }} />
        <List sx={{ px: 0.75, pb: 1.5 }}>
          <Tooltip title={!sidebarOpen ? 'Open SPA Intake Portal' : ''} placement="right" arrow>
            <ListItemButton
              onClick={() => window.open('http://localhost:5174', '_blank')}
              sx={{
                minHeight: 40,
                px: sidebarOpen ? 1.5 : 0,
                justifyContent: sidebarOpen ? 'initial' : 'center',
                borderRadius: 1.5,
                mb: 0.5,
                backgroundColor: '#1a1a1a',
                border: '1px solid #2d2d2d',
                '&:hover': { backgroundColor: '#222222', borderColor: '#f97316' },
              }}
            >
              <ListItemIcon sx={{ minWidth: 0, mr: sidebarOpen ? 1.5 : 'auto', color: '#f97316' }}>
                <LaunchOutlinedIcon sx={{ fontSize: 18 }} />
              </ListItemIcon>
              {sidebarOpen && (
                <ListItemText
                  primary="Intake Portal ↗"
                  slotProps={{ primary: { style: { fontSize: '0.8rem', fontWeight: 600, color: '#f97316' } } }}
                />
              )}
            </ListItemButton>
          </Tooltip>

          <NavSection
            icon={<SettingsIcon sx={{ fontSize: 18 }} />}
            label="Settings"
            selected={activeView === 'settings'}
            onClick={onSettings}
            sidebarOpen={sidebarOpen}
            onExpand={onExpand}
          />
        </List>
      </Box>
    </Drawer>
  );
}
