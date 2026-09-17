import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';
import Sidebar from './components/Sidebar';
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
  const [collapsed, setCollapsed] = useState(false);
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
      <div className="min-h-screen bg-[#070b14] flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 border-3 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mb-4" />
        <p className="text-xs text-slate-400 font-medium">Carregando WH Panel...</p>
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

  const tabTitleMap = {
    dashboard: 'Dashboard & Métricas',
    conversations: 'Conversas Omnichannel',
    crm: 'CRM Funil de Vendas',
    flows: 'Flow Canvas & Agentes IA',
    channels: 'Canais Conectados',
    contacts: 'Gestão de Contatos',
    templates: 'Templates de Mensagem',
    meta_review: 'Homologação & Auditoria Meta',
    queues: 'Filas & Triagem',
    campaigns: 'Disparos em Massa',
    integrations: 'Integrações & Webhooks',
    reports: 'Relatórios Analíticos',
    billing: 'Planos & IA Keys',
  };

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
          <Header activeTitle={tabTitleMap[activeTab] || 'WH Panel'} onNavigate={setActiveTab} />
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
