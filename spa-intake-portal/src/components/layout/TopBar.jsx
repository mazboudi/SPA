import React from 'react';
import {
  AppBar, Toolbar, Typography, IconButton, Box, Badge,
  Avatar, Chip, Tooltip, Divider, Skeleton,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import logo from '../../assets/Logo.png';

export const TOPBAR_HEIGHT = 60;

function initials(name = '') {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

export default function TopBar({
  sidebarOpen,
  onToggleSidebar,
  currentSectionTitle,
  openTasksCount = 0,
  loggedInUser = {},
}) {
  const { displayName, username, email, domain } = loggedInUser;
  const name    = displayName || username || '';
  const loading = !name;

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        height: TOPBAR_HEIGHT,
        zIndex: (theme) => theme.zIndex.drawer + 1,
        backgroundColor: '#000000',
        borderBottom: '1px solid #1a1a1a',
        color: '#ffffff',
      }}
    >
      <Toolbar
        variant="dense"
        disableGutters
        sx={{
          height: TOPBAR_HEIGHT,
          px: 0,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* ── Left: Logo block ───────────────────────────────────────── */}
        <Box
          sx={{
            width: sidebarOpen ? 240 : 68,
            flexShrink: 0,
            transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarOpen ? 'flex-start' : 'center',
            px: sidebarOpen ? 2 : 0,
            gap: 1.5,
            borderRight: '1px solid #1f1f1f',
            height: '100%',
            bgcolor: '#000000',
          }}
        >
          {/* Logo — displayed directly, orange on black */}
          <Box
            component="img"
            src={logo}
            alt="Fiserv"
            sx={{
              height: 28,
              width: 'auto',
              objectFit: 'contain',
              display: 'block',
            }}
          />
          {/* Divider + app name — only when expanded */}
          {sidebarOpen && (
            <>
              <Box sx={{ width: '1px', height: 24, bgcolor: '#333333' }} />
              <Typography
                variant="caption"
                sx={{
                  color: '#9ca3af',
                  fontWeight: 600,
                  fontSize: '0.68rem',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                SPA Portal
              </Typography>
            </>
          )}
        </Box>

        {/* ── Center: Hamburger + breadcrumb ────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, flexGrow: 1, minWidth: 0 }}>
          <IconButton
            edge="start"
            aria-label="toggle sidebar"
            onClick={onToggleSidebar}
            sx={{
              p: 0.75,
              borderRadius: 1.5,
              color: '#9ca3af',
              '&:hover': { backgroundColor: '#1f1f1f', color: '#ffffff' },
            }}
          >
            {sidebarOpen ? <MenuOpenIcon fontSize="small" /> : <MenuIcon fontSize="small" />}
          </IconButton>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, color: '#6b7280', fontSize: '0.82rem', flexShrink: 0 }}>
              Software Request Hub
            </Typography>
            <Typography variant="body2" sx={{ color: '#374151', fontSize: '0.82rem', flexShrink: 0 }}>/</Typography>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 700,
                color: '#f97316',   // Fiserv orange
                fontSize: '0.82rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentSectionTitle}
            </Typography>
          </Box>
        </Box>

        {/* ── Right: Status + Tasks + User ─────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, pr: 2, flexShrink: 0 }}>
          {/* API Status */}
          <Tooltip title="Connected to Intake REST API on port 3002" arrow>
            <Chip
              icon={<CheckCircleRoundedIcon sx={{ fontSize: '13px !important', color: '#16a34a !important' }} />}
              label="API Active"
              size="small"
              sx={{
                backgroundColor: '#052e16',
                color: '#4ade80',
                border: '1px solid #166534',
                fontWeight: 600,
                fontSize: '0.7rem',
                height: 26,
              }}
            />
          </Tooltip>

          {/* Pending tasks badge */}
          <Tooltip title={`${openTasksCount} governance tasks requiring action`} arrow>
            <IconButton
              size="small"
              sx={{
                p: 0.75,
                borderRadius: 1.5,
                color: openTasksCount > 0 ? '#f97316' : '#6b7280',
                backgroundColor: openTasksCount > 0 ? '#1c1007' : 'transparent',
                '&:hover': { backgroundColor: '#1f1f1f' },
              }}
            >
              <Badge badgeContent={openTasksCount} color="warning" max={99}>
                <AssignmentTurnedInIcon fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>

          <Box sx={{ width: '1px', height: 24, bgcolor: '#2d2d2d' }} />

          {/* User profile */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1,
              py: 0.5,
              borderRadius: 1.5,
              border: '1px solid #2d2d2d',
              '&:hover': { borderColor: '#4b5563', bgcolor: '#111111', cursor: 'default' },
            }}
          >
            <Badge
              overlap="circular"
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              variant="dot"
              sx={{ '& .MuiBadge-badge': { backgroundColor: '#22c55e', color: '#22c55e', boxShadow: '0 0 0 2px #000000' } }}
            >
              {loading
                ? <Skeleton variant="circular" width={28} height={28} sx={{ bgcolor: '#374151' }} />
                : <Avatar sx={{ width: 28, height: 28, fontSize: '0.72rem', fontWeight: 700, bgcolor: '#f97316', color: '#ffffff' }}>
                    {initials(name)}
                  </Avatar>
              }
            </Badge>

            <Box>
              {loading
                ? <Skeleton width={80} height={13} sx={{ bgcolor: '#374151' }} />
                : <Tooltip title={email || 'Windows User'} arrow placement="bottom-end">
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.78rem', color: '#f3f4f6', lineHeight: 1.15, cursor: 'default' }}>
                      {name || 'Windows User'}
                    </Typography>
                  </Tooltip>
              }
              {loading
                ? <Skeleton width={55} height={11} sx={{ bgcolor: '#374151', mt: 0.25 }} />
                : <Typography variant="caption" sx={{ color: '#6b7280', fontSize: '0.65rem', display: 'block', lineHeight: 1 }}>
                    {domain || 'Signed In'}
                  </Typography>
              }
            </Box>
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
