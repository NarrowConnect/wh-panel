import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const slugify = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const Register = ({ onSwitchToLogin }) => {
  const { register } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [companySlug, setCompanySlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCompanyNameChange = (val) => {
    setCompanyName(val);
    if (!slugTouched) setCompanySlug(slugify(val));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(companyName, companySlug, adminName, email, password);
    } catch (err) {
      setError(err.message || 'Não foi possível criar a conta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5 mb-8">
          <span className="w-7 h-7 rounded-md bg-accent-500 text-white text-[11px] font-bold flex items-center justify-center">WH</span>
          <span className="text-[15px] font-medium text-white">WH Panel</span>
        </div>

        <h1 className="text-xl font-medium text-white tracking-tight">Cadastrar empresa</h1>
        <p className="text-[13px] text-slate-400 mt-1 mb-6">Você será o administrador e poderá convidar a equipe depois.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p role="alert" className="alert-error">{error}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="reg-company" className="field-label">Nome da empresa</label>
              <input
                id="reg-company"
                type="text"
                required
                autoFocus
                autoComplete="organization"
                value={companyName}
                onChange={(e) => handleCompanyNameChange(e.target.value)}
                className="field h-10"
              />
            </div>
            <div>
              <label htmlFor="reg-slug" className="field-label">Identificador</label>
              <input
                id="reg-slug"
                type="text"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="Letras minúsculas, números e hífens"
                placeholder="minha-empresa"
                value={companySlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setCompanySlug(slugify(e.target.value));
                }}
                className="field h-10 font-mono text-xs"
              />
            </div>
          </div>

          <div>
            <label htmlFor="reg-name" className="field-label">Seu nome</label>
            <input id="reg-name" type="text" required autoComplete="name" value={adminName} onChange={(e) => setAdminName(e.target.value)} className="field h-10" />
          </div>

          <div>
            <label htmlFor="reg-email" className="field-label">E-mail</label>
            <input id="reg-email" type="email" required autoComplete="email" placeholder="voce@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} className="field h-10" />
          </div>

          <div>
            <label htmlFor="reg-password" className="field-label">Senha</label>
            <input
              id="reg-password"
              type="password"
              required
              minLength={8}
              pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}"
              title="Mínimo de 8 caracteres, com letra maiúscula, minúscula e número"
              autoComplete="new-password"
              aria-describedby="reg-password-hint"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field h-10"
            />
            <p id="reg-password-hint" className="mt-1.5 text-xs text-slate-500">
              Mínimo de 8 caracteres, com letra maiúscula, minúscula e número.
            </p>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary w-full h-10">
            {loading && <Loader2 className="animate-spin" />}
            {loading ? 'Criando conta…' : 'Criar conta'}
          </button>
        </form>

        <p className="mt-8 pt-6 border-t border-white/[0.06] text-[13px] text-slate-400">
          Já tem conta?{' '}
          <button type="button" onClick={onSwitchToLogin} className="text-accent-300 hover:text-accent-200 underline-offset-4 hover:underline">
            Entrar
          </button>
        </p>
      </div>
    </div>
  );
};

export default Register;
