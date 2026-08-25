import React, { useState, useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import { theme } from './theme/theme';
import TopBar, { TOPBAR_HEIGHT } from './components/layout/TopBar';
import Sidebar, { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from './components/layout/Sidebar';
import RequestSoftwareView from './components/RequestSoftwareView';
import GovernanceDashboard from './components/GovernanceDashboard';
import RequestTracker from './components/RequestTracker';
import CatalogManager from './components/CatalogManager';

const SECTION_TITLES = {
  request: 'Request Software',
  governance: 'Governance Review Center',
  tracker: 'Request Tracker (RITMs)',
  catalog: 'Authoritative Software Catalog',
};

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('request'); // 'request' | 'governance' | 'tracker' | 'catalog'
  const [openTasksCount, setOpenTasksCount] = useState(0);

  const fetchStats = () => {
    fetch('/api/intake/requests')
      .then(res => res.json())
      .then(data => {
        let count = 0;
        (data.requests || []).forEach(r => {
          (r.tasks || []).forEach(t => {
            if (t.state === 'Open' || t.state === 'In Progress') count++;
          });
        });
        setOpenTasksCount(count);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleSidebar = () => {
    setSidebarOpen(prev => !prev);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'background.default' }}>
        {/* Fixed TopBar */}
        <TopBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={handleToggleSidebar}
          currentSectionTitle={SECTION_TITLES[activeTab] || 'Dashboard'}
          openTasksCount={openTasksCount}
        />

        {/* Left Collapsible Sidebar */}
        <Sidebar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={handleToggleSidebar}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          openTasksCount={openTasksCount}
        />

        {/* Main Content Area */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            pt: `${TOPBAR_HEIGHT + 24}px`,
            pb: 6,
            px: { xs: 2, sm: 3, md: 4 },
            minWidth: 0,
            transition: 'margin 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <Container maxWidth="xl" disableGutters>
            {activeTab === 'request' && (
              <RequestSoftwareView
                onSubmitted={() => {
                  fetchStats();
                  setActiveTab('tracker');
                }}
              />
            )}

            {activeTab === 'governance' && (
              <GovernanceDashboard onTaskUpdated={fetchStats} />
            )}

            {activeTab === 'tracker' && (
              <RequestTracker />
            )}

            {activeTab === 'catalog' && (
              <CatalogManager />
            )}
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
