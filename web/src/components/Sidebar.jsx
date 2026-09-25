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
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Plus
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import ApiClient from '../api/client';

// Grouped by how often an attendant reaches for them: the daily inbox first,
// automation and outbound next, analytics, then setup.
export const navGroups = [
  [
    { id: 'conversations', label: 'Conversas', icon: MessageSquare },
    { id: 'contacts', label: 'Contatos', icon: Users },
    { id: 'crm', label: 'CRM', icon: Kanban },
  ],
  [
    { id: 'flows', label: 'Flows & Agentes IA', icon: Workflow },
    { id: 'campaigns', label: 'Campanhas', icon: Megaphone },
    { id: 'templates', label: 'Templates Meta', icon: FileText },
    { id: 'queues', label: 'Filas & Triagem', icon: Layers },
  ],
  [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  ],
  [
    { id: 'channels', label: 'Canais & WhatsApp', icon: Radio },
    { id: 'integrations', label: 'Integrações & Webhooks', icon: Plug },
    { id: 'meta_review', label: 'Homologação Meta', icon: ShieldCheck },
    { id: 'billing', label: 'Planos & Chaves de IA', icon: CreditCard },
  ],
];

export const navItems = navGroups.flat();

const channelKind = (type) => {
  if (type === 'whatsapp_meta') return 'Meta oficial';
  if (type === 'whatsapp_qr') return 'QR';
  return 'Webchat';
};

const NavButton = ({ item, active, collapsed, onClick }) => {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={`group relative w-full flex items-center gap-3 rounded-lg text-[13px] transition-colors ${
        collapsed ? 'justify-center h-9' : 'px-2.5 h-8'
      } ${
        active
          ? 'bg-white/[0.06] text-white font-medium'
          : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.03]'
      }`}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} strokeWidth={1.75} />
      {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
      {collapsed && (
        <span className="absolute left-full ml-2 px-2 py-1 rounded-md bg-surface border border-white/[0.08] text-xs text-slate-100 shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
          {item.label}
        </span>
      )}
    </button>
  );
};

export const Sidebar = ({ activeTab, setActiveTab, collapsed, setCollapsed }) => {
  const { user, company, logout } = useAuth();
  const { connected } = useWebSocket();
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
      className={`h-screen flex flex-col bg-background border-r border-white/[0.06] transition-[width] duration-200 z-30 select-none ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Brand */}
      <div className={`h-14 flex items-center border-b border-white/[0.06] ${collapsed ? 'justify-center' : 'justify-between pl-4 pr-2'}`}>
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-md bg-accent-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              WH
            </div>
            <div className="min-w-0 leading-tight">
              <p className="text-[13px] font-medium text-white truncate">WH Panel</p>
              {company?.name && <p className="text-[11px] text-slate-500 truncate">{company.name}</p>}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/[0.04] transition-colors flex"
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" strokeWidth={1.75} /> : <PanelLeftClose className="w-4 h-4" strokeWidth={1.75} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {navGroups.map((group, i) => (
          <div key={i} className={`space-y-px ${i > 0 ? 'mt-4 pt-4 border-t border-white/[0.04]' : ''}`}>
            {group.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={activeTab === item.id}
                collapsed={collapsed}
                onClick={() => setActiveTab(item.id)}
              />
            ))}
          </div>
        ))}

        <div className="mt-4 pt-4 border-t border-white/[0.04]">
          <a
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            title={collapsed ? 'Documentação da API' : undefined}
            className={`group w-full flex items-center gap-3 rounded-lg text-[13px] text-slate-400 hover:text-slate-100 hover:bg-white/[0.03] transition-colors ${
              collapsed ? 'justify-center h-9' : 'px-2.5 h-8'
            }`}
          >
            <BookOpen className="w-4 h-4 flex-shrink-0 text-slate-500 group-hover:text-slate-300" strokeWidth={1.75} />
            {!collapsed && <span className="flex-1 truncate">Documentação da API</span>}
          </a>
        </div>

        {/* Connected channels */}
        {!collapsed && (
          <div className="mt-6 px-2.5">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs text-slate-500">Canais</span>
              <span className="text-xs text-slate-600 tabular-nums">{sidebarChannels.length}</span>
            </div>

            {sidebarChannels.length > 0 ? (
              <ul className="space-y-1">
                {sidebarChannels.slice(0, 4).map((ch) => (
                  <li key={ch.id}>
                    <button
                      type="button"
                      onClick={() => setActiveTab('channels')}
                      className="w-full flex items-center gap-2 py-1 text-left group"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ch.status === 'active' ? 'bg-emerald-400' : 'bg-slate-600'}`}
                        title={ch.status === 'active' ? 'Ativo' : 'Inativo'}
                      />
                      <span className="flex-1 min-w-0 text-xs text-slate-300 group-hover:text-white truncate">{ch.name}</span>
                      <span className="text-[11px] text-slate-600 flex-shrink-0">{channelKind(ch.type)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('channels')}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                Conectar WhatsApp
              </button>
            )}
          </div>
        )}
      </nav>

      {/* Account */}
      <div className="p-2 border-t border-white/[0.06]">
        {!connected && (
          <p className={`flex items-center gap-2 px-2.5 pb-2 text-[11px] text-rose-300 ${collapsed ? 'justify-center' : ''}`} role="status">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            {!collapsed && 'Reconectando ao tempo real…'}
          </p>
        )}
        <div className={`flex items-center gap-2.5 p-1.5 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-7 h-7 rounded-md bg-white/[0.06] text-slate-200 text-xs font-medium flex items-center justify-center flex-shrink-0">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0 leading-tight">
                <p className="text-[13px] text-slate-100 truncate">{user?.name || 'Usuário'}</p>
                <p className="text-[11px] text-slate-500 truncate capitalize">{user?.role || 'Atendente'}</p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/[0.04] transition-colors"
                title="Sair"
                aria-label="Sair"
              >
                <LogOut className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
