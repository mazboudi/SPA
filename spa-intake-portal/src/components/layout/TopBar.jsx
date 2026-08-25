import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Badge,
  Avatar,
  Chip,
  Tooltip,
  Divider,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';

export const TOPBAR_HEIGHT = 60;

export default function TopBar({
  sidebarOpen,
  onToggleSidebar,
  currentSectionTitle,
  openTasksCount = 0,
}) {
  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        height: TOPBAR_HEIGHT,
        zIndex: (theme) => theme.zIndex.drawer + 1,
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        color: '#0f172a',
      }}
    >
      <Toolbar
        variant="dense"
        disableGutters
        sx={{
          height: TOPBAR_HEIGHT,
          px: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Left: Sidebar Toggle + Brand Title + Breadcrumb */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <IconButton
            edge="start"
            color="inherit"
            aria-label="toggle sidebar"
            onClick={onToggleSidebar}
            sx={{
              p: 1,
              borderRadius: 2,
              color: '#475569',
              '&:hover': { backgroundColor: '#f1f5f9', color: '#0f172a' },
            }}
          >
            {sidebarOpen ? <MenuOpenIcon fontSize="small" /> : <MenuIcon fontSize="small" />}
          </IconButton>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem',
                boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)',
              }}
            >
              📋
            </Box>

            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                  Software Request Hub
                </Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 500 }}>
                  /
                </Typography>
                <Typography variant="caption" sx={{ color: '#2563eb', fontWeight: 600 }}>
                  {currentSectionTitle}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.7rem', display: 'block', lineHeight: 1 }}>
                Authoritative Software Lifecycle & Governance
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Right: Live Connection + Task Counter + User Profile */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Live Status Pill */}
          <Tooltip title="Connected to Standalone Intake REST Service on port 3002" arrow>
            <Chip
              icon={<CheckCircleRoundedIcon sx={{ fontSize: '14px !important', color: '#16a34a !important' }} />}
              label="Intake API Active :3002"
              size="small"
              sx={{
                backgroundColor: '#f0fdf4',
                color: '#15803d',
                border: '1px solid #bbf7d0',
                fontWeight: 600,
                fontSize: '0.725rem',
                height: 28,
              }}
            />
          </Tooltip>

          {/* Pending Tasks Notification Badge */}
          <Tooltip title={`${openTasksCount} governance tasks requiring action`} arrow>
            <IconButton
              size="small"
              sx={{
                p: 1,
                borderRadius: 2,
                color: openTasksCount > 0 ? '#2563eb' : '#64748b',
                backgroundColor: openTasksCount > 0 ? '#eff6ff' : 'transparent',
                '&:hover': { backgroundColor: '#e0e7ff' },
              }}
            >
              <Badge badgeContent={openTasksCount} color="primary" max={99}>
                <AssignmentTurnedInIcon fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ height: 24, my: 'auto', borderColor: '#e2e8f0' }} />

          {/* Logged in User Profile */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              p: '4px 8px 4px 4px',
              borderRadius: 2,
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <Badge
              overlap="circular"
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              variant="dot"
              sx={{
                '& .MuiBadge-badge': {
                  backgroundColor: '#22c55e',
                  color: '#22c55e',
                  boxShadow: '0 0 0 2px #ffffff',
                },
              }}
            >
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  bgcolor: '#2563eb',
                  color: '#ffffff',
                }}
              >
                AJ
              </Avatar>
            </Badge>

            <Box sx={{ pr: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem', color: '#0f172a', lineHeight: 1.1 }}>
                Alex Johnson
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.675rem', display: 'block', lineHeight: 1 }}>
                Lead EUC Packager
              </Typography>
            </Box>
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
