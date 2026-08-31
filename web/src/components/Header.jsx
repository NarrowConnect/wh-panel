import React, { useState } from 'react';
import {
  Bell,
  Search,
  Building2,
  CheckCircle2,
  Clock,
  CircleDot,
  Moon,
  Sun,
  UserCheck,
  Bot
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Header = ({ activeTitle }) => {
  const { user, company, status, setStatus } = useAuth();
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const statusConfig = {
    online: { label: 'Disponível', color: 'bg-brand-500', text: 'text-brand-400' },
    busy: { label: 'Ocupado', color: 'bg-amber-500', text: 'text-amber-400' },
    offline: { label: 'Ausente', color: 'bg-slate-500', text: 'text-slate-400' },
  };

  const currentStatus = statusConfig[status] || statusConfig.online;

  return (
    <header className="h-16 bg-[#0f172a]/80 backdrop-blur-md border-b border-slate-800/80 px-6 flex items-center justify-between z-20">
      {/* Title & Path */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          {activeTitle}
        </h1>
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/60 border border-slate-700/50 text-[11px] text-slate-300 font-medium">
          <Building2 className="w-3.5 h-3.5 text-brand-400" />
          <span>{company?.name || 'Multi-Tenant'}</span>
          <span className="text-slate-500 font-mono text-[10px]">({company?.slug || 'default'})</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Attendant Presence Status Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-xs font-semibold text-slate-200 transition-colors"
          >
            <span className={`w-2.5 h-2.5 rounded-full ${currentStatus.color} animate-pulse`} />
            <span>{currentStatus.label}</span>
          </button>

          {showStatusMenu && (
            <div className="absolute right-0 mt-2 w-44 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1.5 z-50 animate-fade-in">
              <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Status de Atendimento
              </div>
              <button
                onClick={() => { setStatus('online'); setShowStatusMenu(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800/80"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-brand-500" />
                <span>Disponível</span>
              </button>
              <button
                onClick={() => { setStatus('busy'); setShowStatusMenu(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800/80"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span>Ocupado</span>
              </button>
              <button
                onClick={() => { setStatus('offline'); setShowStatusMenu(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800/80"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                <span>Ausente</span>
              </button>
            </div>
          )}
        </div>

        {/* AI SDR Helper Badge */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium">
          <Bot className="w-4 h-4 text-purple-400 animate-pulse" />
          <span>IA SDR Ativa</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
