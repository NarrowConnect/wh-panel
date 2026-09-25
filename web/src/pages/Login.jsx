import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Login = ({ onSwitchToRegister }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState(() => localStorage.getItem('wh_remembered_email') || '');
  const [password, setPassword] = useState('');
  const [companySlug, setCompanySlug] = useState(() => localStorage.getItem('wh_remembered_slug') || '');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, companySlug, rememberMe);
    } catch (err) {
      setError(err.message || 'Não foi possível entrar. Confira e-mail e senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8">
          <span className="w-7 h-7 rounded-md bg-accent-500 text-white text-[11px] font-bold flex items-center justify-center">WH</span>
          <span className="text-[15px] font-medium text-white">WH Panel</span>
        </div>

        <h1 className="text-xl font-medium text-white tracking-tight">Entrar</h1>
        <p className="text-[13px] text-slate-400 mt-1 mb-6">Acesse o atendimento da sua empresa.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p role="alert" className="alert-error">{error}</p>}

          <div>
            <label htmlFor="login-email" className="field-label">E-mail</label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              autoFocus={!email}
              placeholder="voce@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field h-10"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="field-label">Senha</label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              autoFocus={!!email}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field h-10"
            />
          </div>

          <div>
            <label htmlFor="login-slug" className="field-label">
              Empresa <span className="text-slate-500">(opcional, se o e-mail está em mais de uma)</span>
            </label>
            <input
              id="login-slug"
              type="text"
              autoComplete="organization"
              placeholder="minha-empresa"
              value={companySlug}
              onChange={(e) => setCompanySlug(e.target.value)}
              className="field h-10"
            />
          </div>

          <label className="flex items-center gap-2 text-[13px] text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-3.5 h-3.5 accent-accent-500"
            />
            Lembrar meu e-mail
          </label>

          <button type="submit" disabled={loading} className="btn btn-primary w-full h-10">
            {loading && <Loader2 className="animate-spin" />}
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-8 pt-6 border-t border-white/[0.06] text-[13px] text-slate-400">
          Sua empresa ainda não tem conta?{' '}
          <button type="button" onClick={onSwitchToRegister} className="text-accent-300 hover:text-accent-200 underline-offset-4 hover:underline">
            Cadastrar empresa
          </button>
        </p>
      </div>
    </div>
  );
};

export default Login;
