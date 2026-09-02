import React, { useState, useEffect } from 'react';
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
  Sparkles,
  Zap,
  ArrowUpRight,
  ShieldCheck,
  Smartphone,
  Plus
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import ApiClient from '../api/client';

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
  const [activeMode, setActiveMode] = useState('omni');
  const [sidebarChannels, setSidebarChannels] = useState([]);

  useEffect(() => {
    const fetchSidebarChannels = async () => {
      try {
        const data = await ApiClient.get('/channels');
        const list = Array.isArray(data) ? data : (data?.channels || []);
        setSidebarChannels(list);
      } catch {
        setSidebarChannels([]);
      }
    };
    fetchSidebarChannels();
  }, [activeTab]);

  return (
    <aside
      className={`h-screen flex flex-col bg-[#08090e] border-r border-white/[0.06] transition-all duration-300 z-30 select-none ${
        collapsed ? 'w-20' : 'w-72'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-400 flex items-center justify-center shadow-lg shadow-purple-500/25 flex-shrink-0">
            <Zap className="w-5 h-5 text-white fill-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col truncate">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm tracking-tight text-white font-sans">
                  Narrow<span className="text-purple-400">®</span>
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-purple-500/15 text-purple-300 font-bold uppercase border border-purple-500/20">
                  PRO
                </span>
              </div>
              <span className="text-[11px] font-medium text-slate-400 truncate">
                {company?.name || 'Omnichannel Intelligence'}
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors hidden md:flex"
          title={collapsed ? 'Expandir Menu' : 'Recolher Menu'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Mode Switcher Pill Tabs (Stakent Style) */}
      {!collapsed && (
        <div className="px-3 pt-3">
          <div className="p-1 rounded-xl bg-[#12141c] border border-white/[0.06] grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setActiveMode('omni')}
              className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeMode === 'omni'
                  ? 'bg-[#1e2230] text-white shadow-sm border border-white/[0.08]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Omnichannel
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('flows')}
              className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeMode === 'flows'
                  ? 'bg-[#1e2230] text-white shadow-sm border border-white/[0.08]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Agentes IA
            </button>
          </div>
        </div>
      )}

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        <div className={`px-2 pb-1.5 text-[10px] font-bold tracking-wider text-slate-500 uppercase ${collapsed ? 'text-center' : ''}`}>
          {collapsed ? '•••' : 'Menu Principal'}
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-2xl text-xs font-semibold transition-all group relative ${
                isActive
                  ? 'bg-[#181b26] text-white border border-white/[0.09] shadow-sm font-bold'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                className={`w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-110 ${
                  isActive ? 'text-purple-400' : 'text-slate-400 group-hover:text-purple-400'
                }`}
              />

              {!collapsed && (
                <span className="flex-1 text-left truncate">{item.label}</span>
              )}

              {!collapsed && item.badge && (
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                    isActive
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : item.badge === 'IA'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {item.badge}
                </span>
              )}

              {/* Tooltip on collapsed */}
              {collapsed && (
                <div className="absolute left-full ml-3 px-2.5 py-1 bg-[#12141c] text-white text-xs font-semibold rounded-xl shadow-2xl border border-white/[0.08] opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
                  {item.label}
                </div>
              )}
            </button>
          );
        })}

        {/* Active Channels Quick List (Real Data) */}
        {!collapsed && (
          <div className="pt-4 space-y-2 border-t border-white/[0.06] mt-3">
            <div className="flex items-center justify-between px-2">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase flex items-center gap-1.5">
                <span>Canais Ativos</span>
                <span className={`w-1.5 h-1.5 rounded-full ${sidebarChannels.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></span>
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300">
                {sidebarChannels.length}
              </span>
            </div>

            {sidebarChannels.length > 0 ? (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {sidebarChannels.slice(0, 3).map((ch) => {
                  const isMeta = ch.type === 'whatsapp_meta';
                  const isQR = ch.type === 'whatsapp_qr';
                  return (
                    <div
                      key={ch.id}
                      onClick={() => setActiveTab('channels')}
                      className="p-2 rounded-xl bg-[#10121a] hover:bg-[#151722] border border-white/[0.04] flex items-center justify-between text-xs cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[10px] flex-shrink-0 ${
                          isMeta ? 'bg-emerald-500/15 text-emerald-400' : isQR ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'
                        }`}>
                          {isMeta ? 'WA' : isQR ? 'QR' : 'WB'}
                        </div>
                        <div className="truncate">
                          <p className="text-[11px] font-bold text-white leading-none truncate">{ch.name}</p>
                          <p className="text-[9px] text-slate-500 font-mono mt-0.5 truncate">{ch.phone_number || (isMeta ? 'Meta Cloud' : 'WAHA VPS')}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400 flex-shrink-0 ml-1">Ativo</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                onClick={() => setActiveTab('channels')}
                className="p-2 rounded-xl bg-[#10121a]/60 border border-white/[0.04] text-center cursor-pointer hover:bg-[#141622] transition-colors"
              >
                <p className="text-[10px] text-slate-500 font-medium">Nenhum canal ativo</p>
                <p className="text-[10px] text-purple-400 font-bold mt-0.5 flex items-center justify-center gap-1">
                  <Plus className="w-3 h-3" /> Conectar WhatsApp
                </p>
              </div>
            )}
          </div>
        )}

        {/* Swagger Docs Link */}
        <div className="pt-2">
          <a
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-2xl text-xs font-semibold text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] transition-all group relative ${
              collapsed ? 'justify-center' : ''
            }`}
            title="Swagger API Docs"
          >
            <BookOpen className="w-4 h-4 flex-shrink-0 text-cyan-400 group-hover:scale-110 transition-transform" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left truncate">Swagger Docs</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-bold">
                  API
                </span>
              </>
            )}
          </a>
        </div>
      </div>

      {/* Super Upgrade Card (Stakent Style) */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-[#1b1435] via-[#121124] to-[#0c0d14] border border-purple-500/20 shadow-lg shadow-purple-500/10 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <h5 className="text-xs font-bold text-white leading-none">Narrow Super PRO</h5>
                <p className="text-[10px] text-slate-400 mt-0.5">Disparos & IA Ilimitados</p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('billing')}
              className="w-full py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-[0.98] text-white text-[11px] font-bold shadow-md shadow-purple-600/30 transition-all flex items-center justify-center gap-1"
            >
              <span>Gerenciar Plano</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Footer / User Profile & Realtime Status */}
      <div className="p-3 border-t border-white/[0.06] bg-[#07080c]">
        {/* Realtime WebSocket Pulse */}
        <div className={`mb-2.5 flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-1`}>
          {!collapsed && (
            <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              {connected ? 'WebSocket Online' : 'Reconectando...'}
            </span>
          )}
          {collapsed && (
            <span
              className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}
              title={connected ? 'WebSocket Ativo' : 'WebSocket Desconectado'}
            />
          )}
        </div>

        <div className={`flex items-center gap-2.5 p-2 rounded-2xl bg-[#10121a] border border-white/[0.06] ${collapsed ? 'justify-center' : ''}`}>
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold flex items-center justify-center text-xs shadow-md shadow-purple-500/20">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#10121a]" />
          </div>

          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{user?.name || 'Usuário'}</p>
              <p className="text-[10px] text-slate-400 truncate capitalize">{user?.role || 'Atendente'}</p>
            </div>
          )}

          {!collapsed && (
            <button
              onClick={logout}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
              title="Sair do Sistema"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
