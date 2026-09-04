import React, { useState } from 'react';
import {
  Bell,
  Search,
  Building2,
  CheckCircle2,
  Clock,
  CircleDot,
  Bot,
  Settings,
  Plus,
  Sparkles,
  Zap,
  SlidersHorizontal
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Header = ({ activeTitle, onNavigate }) => {
  const { user, company, status, setStatus } = useAuth();
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const statusConfig = {
    online: { label: 'Online', color: 'bg-emerald-400', text: 'text-emerald-400' },
    busy: { label: 'Ocupado', color: 'bg-amber-400', text: 'text-amber-400' },
    offline: { label: 'Ausente', color: 'bg-slate-500', text: 'text-slate-400' },
  };

  const currentStatus = statusConfig[status] || statusConfig.online;

  return (
    <header className="h-16 bg-[#08090e]/90 backdrop-blur-xl border-b border-white/[0.06] px-6 flex items-center justify-between z-20 select-none">
      {/* Title & Organization Info */}
      <div className="flex items-center gap-4">
        <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
          <span>{activeTitle}</span>
        </h1>
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-[#12141c] border border-white/[0.06] text-xs text-slate-300 font-medium">
          <Building2 className="w-3.5 h-3.5 text-purple-400" />
          <span className="font-semibold text-white">{company?.name || 'WH Panel'}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-300 font-bold uppercase">
            PRO
          </span>
        </div>
      </div>

      {/* Center / Search bar (Stakent Style) */}
      <div className="hidden md:flex items-center relative w-72">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar conversas, contatos... ⌘K"
          className="w-full bg-[#12141c] border border-white/[0.06] rounded-full pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/50 transition-all font-medium"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Quick Action Button (Stakent "Deposit" Style) */}
        <button
          onClick={() => onNavigate?.('campaigns')}
          className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 active:scale-[0.98] text-white text-xs font-bold shadow-lg shadow-purple-500/25 transition-all"
        >
          <Zap className="w-3.5 h-3.5 fill-white" />
          <span>Disparo Rápido</span>
        </button>

        {/* Notifications Icon with Badge */}
        <button
          className="relative p-2 rounded-full bg-[#12141c] hover:bg-[#1a1d29] border border-white/[0.06] text-slate-400 hover:text-white transition-colors"
          title="Notificações"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-purple-500" />
        </button>

        {/* Attendant Presence Status Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#12141c] hover:bg-[#1a1d29] border border-white/[0.06] text-xs font-bold text-slate-200 transition-colors"
          >
            <span className={`w-2 h-2 rounded-full ${currentStatus.color} animate-pulse`} />
            <span>{currentStatus.label}</span>
          </button>

          {showStatusMenu && (
            <div className="absolute right-0 mt-2 w-44 bg-[#12141c] border border-white/[0.08] rounded-2xl shadow-2xl py-1.5 z-50 animate-fade-in">
              <div className="px-3 py-1 text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                Status de Atendimento
              </div>
              <button
                onClick={() => { setStatus('online'); setShowStatusMenu(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/[0.04]"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Disponível</span>
              </button>
              <button
                onClick={() => { setStatus('busy'); setShowStatusMenu(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/[0.04]"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>Ocupado</span>
              </button>
              <button
                onClick={() => { setStatus('offline'); setShowStatusMenu(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/[0.04]"
              >
                <span className="w-2 h-2 rounded-full bg-slate-500" />
                <span>Ausente</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
