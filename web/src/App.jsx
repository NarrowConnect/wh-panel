import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';
import Sidebar, { navItems } from './components/Sidebar';
import Header from './components/Header';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Conversations from './pages/Conversations';
import CRM from './pages/CRM';
import Flows from './pages/Flows';
import Channels from './pages/Channels';
import Contacts from './pages/Contacts';
import Templates from './pages/Templates';
import Queues from './pages/Queues';
import Campaigns from './pages/Campaigns';
import Integrations from './pages/Integrations';
import Reports from './pages/Reports';
import Billing from './pages/Billing';
import MetaReview from './pages/MetaReview';
import PublicLegal from './pages/PublicLegal';

const MainLayout = () => {
  const { isAuthenticated, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('conversations');
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [authView, setAuthView] = useState('login'); // 'login' or 'register'

  // Public compliance routes for Meta App Reviewers & Crawlers (no auth required)
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const queryPage = searchParams?.get('page');

  if (pathname === '/privacy' || pathname === '/privacidade' || queryPage === 'privacy') {
    return <PublicLegal initialPage="privacy" onBackToApp={() => { window.location.href = '/'; }} />;
  }
  if (pathname === '/terms' || pathname === '/termos' || queryPage === 'terms') {
    return <PublicLegal initialPage="terms" onBackToApp={() => { window.location.href = '/'; }} />;
  }
  if (pathname === '/data-deletion' || pathname === '/exclusao-dados' || queryPage === 'data-deletion') {
    return <PublicLegal initialPage="data-deletion" onBackToApp={() => { window.location.href = '/'; }} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/10 border-t-accent-400 rounded-full animate-spin" aria-label="Carregando" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return authView === 'login' ? (
      <Login onSwitchToRegister={() => setAuthView('register')} />
    ) : (
      <Register onSwitchToLogin={() => setAuthView('login')} />
    );
  }

  // The header title is the sidebar label, so a page is called one thing.
  const activeTitle = navItems.find((item) => item.id === activeTab)?.label || 'WH Panel';

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'conversations':
        return <Conversations />;
      case 'crm':
        return <CRM onOpenChat={() => setActiveTab('conversations')} />;
      case 'flows':
        return <Flows />;
      case 'channels':
        return <Channels />;
      case 'contacts':
        return <Contacts onOpenChat={() => setActiveTab('conversations')} />;
      case 'templates':
        return <Templates />;
      case 'meta_review':
        return <MetaReview />;
      case 'queues':
        return <Queues />;
      case 'campaigns':
        return <Campaigns />;
      case 'integrations':
        return <Integrations />;
      case 'reports':
        return <Reports />;
      case 'billing':
        return <Billing />;
      default:
        return <Conversations />;
    }
  };

  return (
    <WebSocketProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
        />

        {/* Main Body */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header activeTitle={activeTitle} onNavigate={setActiveTab} />
          <main className="flex-1 overflow-hidden">
            {renderActiveTab()}
          </main>
        </div>
      </div>
    </WebSocketProvider>
  );
};

export function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}

export default App;
