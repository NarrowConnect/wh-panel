import React, { useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';

/*
 * Dialog shell shared by the settings pages. Pass `onSubmit` to render the body
 * as a form with Cancel/Submit in the footer, or `footer` for custom actions.
 */
export const Modal = ({ title, subtitle, onClose, onSubmit, submitLabel = 'Salvar', submitting, submitDisabled, error, footer, size = 'md', children }) => {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const Shell = onSubmit ? 'form' : 'div';
  const width = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' }[size];

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <Shell
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`glass-card w-full ${width} my-auto shadow-2xl animate-fade-in`}
      >
        <header className="flex items-center justify-between gap-3 px-5 h-12 border-b border-white/[0.06]">
          <h2 className="text-[13px] font-medium text-white truncate">
            {title}
            {subtitle && <span className="text-slate-500 font-normal"> · {subtitle}</span>}
          </h2>
          <button type="button" onClick={onClose} className="btn btn-icon text-slate-400 hover:text-white" aria-label="Fechar">
            <X strokeWidth={1.75} />
          </button>
        </header>
        <div className="p-5 space-y-4">
          {children}
          {error && <p role="alert" className="text-[13px] text-rose-300">{error}</p>}
        </div>
        {(footer || onSubmit) && (
          <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/[0.06]">
            {footer || (
              <>
                <button type="button" onClick={onClose} className="btn btn-secondary">Cancelar</button>
                <button type="submit" disabled={submitting || submitDisabled} className="btn btn-primary">
                  {submitting && <Loader2 className="animate-spin" />}
                  {submitLabel}
                </button>
              </>
            )}
          </footer>
        )}
      </Shell>
    </div>
  );
};

export default Modal;
