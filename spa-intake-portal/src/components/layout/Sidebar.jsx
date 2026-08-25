import React from 'react';
import {
  Drawer,
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Tooltip,
  Chip,
  IconButton,
} from '@mui/material';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import LaunchOutlinedIcon from '@mui/icons-material/LaunchOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

export const SIDEBAR_WIDTH = 240;
export const SIDEBAR_COLLAPSED_WIDTH = 68;

const NAV_ITEMS = [
  {
    id: 'request',
    label: 'Request Software',
    subtitle: 'Service catalog item',
    icon: <Inventory2OutlinedIcon sx={{ fontSize: 20 }} />,
  },
  {
    id: 'governance',
    label: 'Governance Center',
    subtitle: 'Approvals & reviews',
    icon: <SecurityOutlinedIcon sx={{ fontSize: 20 }} />,
    showBadge: true,
  },
  {
    id: 'tracker',
    label: 'Request Tracker',
    subtitle: 'RITM execution tree',
    icon: <FormatListBulletedIcon sx={{ fontSize: 20 }} />,
  },
  {
    id: 'catalog',
    label: 'Software Catalog',
    subtitle: 'Authoritative models',
    icon: <MenuBookOutlinedIcon sx={{ fontSize: 20 }} />,
  },
];

export default function Sidebar({
  sidebarOpen,
  onToggleSidebar,
  activeTab,
  onSelectTab,
  openTasksCount = 0,
}) {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: sidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        '& .MuiDrawer-paper': {
          width: sidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH,
          transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          overflowX: 'hidden',
          top: 60, // below TopBar
          height: 'calc(100% - 60px)',
          backgroundColor: '#ffffff',
          borderRight: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Navigation Group Header */}
      {sidebarOpen && (
        <Box sx={{ px: 2.5, pt: 2, pb: 0.5 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#94a3b8',
              fontSize: '0.675rem',
            }}
          >
            Intake Navigation
          </Typography>
        </Box>
      )}

      {/* Navigation Items */}
      <List sx={{ pt: sidebarOpen ? 0.5 : 1.5, px: 0.5 }}>
        {NAV_ITEMS.map((item) => {
          const isSelected = activeTab === item.id;
          const button = (
            <ListItemButton
              key={item.id}
              selected={isSelected}
              onClick={() => onSelectTab(item.id)}
              sx={{
                minHeight: 44,
                px: sidebarOpen ? 1.5 : 2,
                py: 1,
                justifyContent: sidebarOpen ? 'initial' : 'center',
                borderRadius: 2,
                mb: 0.5,
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  mr: sidebarOpen ? 1.5 : 'auto',
                  justifyContent: 'center',
                  color: isSelected ? '#2563eb' : '#64748b',
                }}
              >
                {item.icon}
              </ListItemIcon>

              {sidebarOpen && (
                <>
                  <ListItemText
                    primary={item.label}
                    secondary={item.subtitle}
                    primaryTypographyProps={{
                      fontSize: '0.84rem',
                      fontWeight: isSelected ? 600 : 500,
                      color: isSelected ? '#2563eb' : '#1e293b',
                    }}
                    secondaryTypographyProps={{
                      fontSize: '0.7rem',
                      color: '#94a3b8',
                      lineHeight: 1.1,
                    }}
                  />
                  {item.showBadge && openTasksCount > 0 && (
                    <Chip
                      label={openTasksCount}
                      size="small"
                      color="primary"
                      sx={{
                        height: 20,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        backgroundColor: isSelected ? '#2563eb' : '#eff6ff',
                        color: isSelected ? '#ffffff' : '#2563eb',
                      }}
                    />
                  )}
                </>
              )}
            </ListItemButton>
          );

          if (!sidebarOpen) {
            return (
              <Tooltip
                key={item.id}
                title={`${item.label} ${item.showBadge && openTasksCount > 0 ? `(${openTasksCount})` : ''}`}
                placement="right"
                arrow
              >
                {button}
              </Tooltip>
            );
          }
          return button;
        })}
      </List>

      <Box sx={{ mt: 'auto' }}>
        <Divider sx={{ borderColor: '#f1f5f9', mb: 1 }} />

        {/* Workbench Quick-Link */}
        <List sx={{ px: 0.5, pb: 1 }}>
          <Tooltip title={!sidebarOpen ? 'Open SPA Packaging Workbench' : ''} placement="right" arrow>
            <ListItemButton
              onClick={() => window.open('http://localhost:5173', '_blank')}
              sx={{
                minHeight: 40,
                px: sidebarOpen ? 1.5 : 2,
                borderRadius: 2,
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                mb: 0.5,
                '&:hover': {
                  backgroundColor: '#eff6ff',
                  borderColor: '#bfdbfe',
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 0, mr: sidebarOpen ? 1.5 : 'auto', color: '#2563eb' }}>
                <LaunchOutlinedIcon sx={{ fontSize: 18 }} />
              </ListItemIcon>
              {sidebarOpen && (
                <ListItemText
                  primary="SPA Workbench ↗"
                  primaryTypographyProps={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#2563eb',
                  }}
                />
              )}
            </ListItemButton>
          </Tooltip>
        </List>

        {/* Bottom Collapse Button */}
        <Box sx={{ p: 1, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: sidebarOpen ? 'flex-end' : 'center' }}>
          <IconButton
            size="small"
            onClick={onToggleSidebar}
            sx={{
              color: '#64748b',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              p: 0.75,
              borderRadius: 2,
              '&:hover': { backgroundColor: '#f1f5f9' },
            }}
          >
            {sidebarOpen ? <ChevronLeftIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
          </IconButton>
        </Box>
      </Box>
    </Drawer>
  );
}
