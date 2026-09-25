import React, { useState, useEffect, useRef } from 'react';
import { Send, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const statusConfig = {
  online: { label: 'Online', dot: 'bg-emerald-400' },
  busy: { label: 'Ocupado', dot: 'bg-amber-400' },
  offline: { label: 'Ausente', dot: 'bg-slate-500' },
};

export const Header = ({ activeTitle, onNavigate }) => {
  const { status, setStatus } = useAuth();
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const menuRef = useRef(null);

  const currentStatus = statusConfig[status] || statusConfig.online;

  useEffect(() => {
    if (!showStatusMenu) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !menuRef.current?.contains(e.target)) {
        setShowStatusMenu(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [showStatusMenu]);

  return (
    <header className="h-14 bg-background border-b border-white/[0.06] px-6 flex items-center justify-between gap-6 z-20 select-none">
      <h1 className="min-w-0 text-[15px] font-medium text-white tracking-tight truncate">{activeTitle}</h1>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => onNavigate?.('campaigns')}
          className="btn btn-secondary hidden sm:inline-flex"
        >
          <Send strokeWidth={1.75} />
          Disparo rápido
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            aria-haspopup="menu"
            aria-expanded={showStatusMenu}
            className="flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-lg text-[13px] text-slate-200 hover:bg-white/[0.04] transition-colors"
          >
            <span className={`w-2 h-2 rounded-full ${currentStatus.dot}`} />
            {currentStatus.label}
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.75} />
          </button>

          {showStatusMenu && (
            <div role="menu" className="absolute right-0 mt-1.5 w-40 p-1 rounded-lg bg-surface border border-white/[0.08] shadow-xl z-50 animate-fade-in">
              {Object.entries(statusConfig).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={status === key}
                  onClick={() => { setStatus(key); setShowStatusMenu(false); }}
                  className={`w-full flex items-center gap-2.5 px-2.5 h-8 rounded-md text-[13px] transition-colors ${
                    status === key ? 'text-white bg-white/[0.05]' : 'text-slate-300 hover:bg-white/[0.04]'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
