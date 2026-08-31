import React from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Kanban,
  Workflow,
  Radio,
  Users,
  FileText,
  Layers,
  Megaphone,
  Plug,
  BarChart3,
  CreditCard,
  BookOpen,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Shield,
  Bot
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';

export const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: null },
  { id: 'conversations', label: 'Conversas', icon: MessageSquare, badge: 'Live' },
  { id: 'crm', label: 'CRM Kanban', icon: Kanban, badge: null },
  { id: 'flows', label: 'Flows & Agentes IA', icon: Workflow, badge: 'IA' },
  { id: 'channels', label: 'Canais & WhatsApp', icon: Radio, badge: null },
  { id: 'contacts', label: 'Contatos', icon: Users, badge: null },
  { id: 'templates', label: 'Templates Meta', icon: FileText, badge: null },
  { id: 'queues', label: 'Filas & Triagem', icon: Layers, badge: null },
  { id: 'campaigns', label: 'Campanhas', icon: Megaphone, badge: null },
  { id: 'integrations', label: 'Integrações & JS', icon: Plug, badge: null },
  { id: 'reports', label: 'Relatórios', icon: BarChart3, badge: null },
  { id: 'billing', label: 'Planos & IA Keys', icon: CreditCard, badge: null },
];

export const Sidebar = ({ activeTab, setActiveTab, collapsed, setCollapsed }) => {
  const { user, company, logout } = useAuth();
  const { connected } = useWebSocket();

  return (
    <aside
      className={`h-screen flex flex-col bg-[#0f172a]/95 backdrop-blur-xl border-r border-slate-800/80 transition-all duration-300 z-30 select-none ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center shadow-lg shadow-brand-500/20 flex-shrink-0">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col truncate">
              <span className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
                WH <span className="text-brand-400">PANEL</span>
              </span>
              <span className="text-[11px] font-medium text-slate-400 truncate">
                {company?.name || 'Omnichannel SaaS'}
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors hidden md:flex"
          title={collapsed ? 'Expandir Menu' : 'Recolher Menu'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        <div className={`px-2 pb-2 text-[10px] font-semibold tracking-wider text-slate-500 uppercase ${collapsed ? 'text-center' : ''}`}>
          {collapsed ? '•••' : 'Módulos'}
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative ${
                isActive
                  ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25 font-semibold'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                className={`w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110 ${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-brand-400'
                }`}
              />

              {!collapsed && (
                <span className="flex-1 text-left truncate">{item.label}</span>
              )}

              {!collapsed && item.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : item.badge === 'IA'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                  }`}
                >
                  {item.badge}
                </span>
              )}

              {/* Tooltip on collapsed */}
              {collapsed && (
                <div className="absolute left-full ml-3 px-2.5 py-1 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl border border-slate-800 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
                  {item.label}
                </div>
              )}
            </button>
          );
        })}

        {/* Separator for Docs */}
        <div className="pt-3">
          <a
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-all group relative ${
              collapsed ? 'justify-center' : ''
            }`}
            title="Acessar Swagger API Docs"
          >
            <BookOpen className="w-5 h-5 flex-shrink-0 text-cyan-400 group-hover:scale-110 transition-transform" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left truncate">Swagger Docs</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  API
                </span>
              </>
            )}
          </a>
        </div>
      </div>

      {/* Footer / User Profile & Realtime Status */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40">
        {/* Realtime WebSocket Pulse */}
        <div className={`mb-3 flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-1`}>
          {!collapsed && (
            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-brand-500 animate-pulse' : 'bg-rose-500'}`} />
              {connected ? 'WebSocket Conectado' : 'Reconectando...'}
            </span>
          )}
          {collapsed && (
            <span
              className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-brand-500 animate-pulse' : 'bg-rose-500'}`}
              title={connected ? 'WebSocket Ativo' : 'WebSocket Desconectado'}
            />
          )}
        </div>

        <div className={`flex items-center gap-3 p-2 rounded-xl bg-slate-900/60 border border-slate-800/60 ${collapsed ? 'justify-center' : ''}`}>
          <div className="relative flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-slate-800 text-brand-400 font-bold flex items-center justify-center border border-slate-700">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-brand-500 border-2 border-slate-900" />
          </div>

          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.name || 'Usuário'}</p>
              <p className="text-[11px] text-slate-400 truncate capitalize">{user?.role || 'Atendente'}</p>
            </div>
          )}

          {!collapsed && (
            <button
              onClick={logout}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
              title="Sair do Sistema"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
