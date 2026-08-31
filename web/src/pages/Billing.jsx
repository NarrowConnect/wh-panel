import React, { useState } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Zap,
  Bot,
  Key,
  Shield,
  Sparkles,
  Building,
  Sliders,
  Gauge,
  Layers,
  Radio,
  Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Billing = () => {
  const { company } = useAuth();

  // AI Providers API Keys state (3.12)
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [claudeKey, setClaudeKey] = useState('');

  // AI Model Parameters
  const [selectedProvider, setSelectedProvider] = useState('openai'); // 'openai', 'gemini', 'claude'
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [saved, setSaved] = useState(false);

  const handleSaveKeys = (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* 3.12 Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Gestão de Planos SaaS & Motores de IA (3.12)</span>
            </h2>
            <p className="text-xs text-slate-400">
              Acompanhe quotas de consumo da empresa e configure chaves de API (OpenAI, Gemini e Claude)
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active SaaS Plan & Quotas Card */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs text-slate-400 uppercase font-semibold">Assinatura Ativa</span>
              <h3 className="text-xl font-black text-white">{company?.plan || 'Enterprise Omnichannel'}</h3>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-brand-500/20 text-brand-400 text-xs font-bold">
              Ativo
            </span>
          </div>

          {/* Resource Usage Meters */}
          <div className="space-y-3 pt-2 border-t border-slate-800 text-xs">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Atendentes Simultâneos:</span>
                <span className="text-white font-bold">12 / 50 Usuários</span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full w-[24%]" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Canais de WhatsApp Conectados:</span>
                <span className="text-white font-bold">3 / Ilimitados</span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full w-[15%]" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Mensagens Disparadas este Mês:</span>
                <span className="text-white font-bold">14.820 / 100.000</span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 rounded-full w-[14.8%]" />
              </div>
            </div>
          </div>
        </div>

        {/* AI Provider Keys & Fine-Tuning Parameters Form */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800 lg:col-span-2 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Bot className="w-4 h-4 text-purple-400" />
            <span>Configuração de Motores de IA SDR & Parâmetros (BYOK)</span>
          </h3>

          <form onSubmit={handleSaveKeys} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">OpenAI API Key (GPT-4o)</label>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    placeholder="sk-proj-..."
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Google Gemini Key</label>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Claude API Key (Anthropic)</label>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    placeholder="sk-ant-..."
                    value={claudeKey}
                    onChange={(e) => setClaudeKey(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Model Fine-Tuning Sliders */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-slate-300">Temperatura / Criatividade</span>
                  <span className="font-mono text-purple-400 font-bold">{temperature}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-purple-500 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">Valores menores geram respostas mais diretas e precisas.</span>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-slate-300">Limite Máximo de Tokens por Resposta</span>
                  <span className="font-mono text-purple-400 font-bold">{maxTokens} tokens</span>
                </div>
                <input
                  type="range"
                  min="256"
                  max="2048"
                  step="128"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  className="w-full accent-purple-500 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">Controla o tamanho máximo das respostas do bot SDR.</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-400">
                {saved && <span className="text-emerald-400 font-bold">✓ Configurações de IA salvas com sucesso!</span>}
              </span>

              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold shadow-lg shadow-purple-500/25 transition-all"
              >
                Salvar Configurações de IA
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Billing;
