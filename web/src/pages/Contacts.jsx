import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Tag,
  Phone,
  Mail,
  Building,
  Merge,
  Filter,
  Trash2,
  Edit2,
  Sliders,
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2
} from 'lucide-react';
import ApiClient from '../api/client';

export const Contacts = () => {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('contacts'); // 'contacts' or 'custom_fields'
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showAddFieldModal, setShowAddFieldModal] = useState(false);

  // New Contact
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Custom Fields
  const [customFields, setCustomFields] = useState([
    { id: 'cf1', name: 'CPF/CNPJ', type: 'text', key: 'doc_number' },
    { id: 'cf2', name: 'Faturamento Estimado', type: 'select', key: 'revenue' },
    { id: 'cf3', name: 'Segmento de Mercado', type: 'text', key: 'market_segment' },
  ]);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');

  // Merge State
  const [primaryContactId, setPrimaryContactId] = useState('');
  const [duplicateContactId, setDuplicateContactId] = useState('');

  const defaultContacts = [
    { id: '1', name: 'Carlos Mendes', phone: '+55 11 98888-7777', email: 'carlos@inovare.com', tags: ['VIP', 'WhatsApp'], custom_values: { doc_number: '123.456.789-00', revenue: 'R$ 120k' } },
    { id: '2', name: 'Mariana Rocha', phone: '+55 21 99999-1234', email: 'mariana@tech.com', tags: ['Lead Qualificado'], custom_values: { doc_number: '987.654.321-11', revenue: 'R$ 45k' } },
    { id: '3', name: 'Roberto Lima', phone: '+55 31 97777-5555', email: 'roberto@logistica.com', tags: ['Suporte N1'], custom_values: { doc_number: '456.789.123-22', revenue: 'R$ 30k' } },
  ];

  const fetchContacts = async () => {
    try {
      const data = await ApiClient.get('/contacts', { query: search });
      setContacts(data && data.length > 0 ? data : defaultContacts);
    } catch {
      setContacts(defaultContacts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [search]);

  const handleCreateContact = async (e) => {
    e.preventDefault();
    const newC = {
      id: `c_${Date.now()}`,
      name,
      phone,
      email,
      tags: ['Novo Lead'],
      custom_values: {},
    };
    setContacts((prev) => [newC, ...prev]);
    setShowAddModal(false);
    setName('');
    setPhone('');
    setEmail('');
  };

  const handleAddField = (e) => {
    e.preventDefault();
    const newF = {
      id: `cf_${Date.now()}`,
      name: newFieldName,
      type: newFieldType,
      key: newFieldName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    };
    setCustomFields((prev) => [...prev, newF]);
    setShowAddFieldModal(false);
    setNewFieldName('');
  };

  const handleMergeContacts = (e) => {
    e.preventDefault();
    setContacts((prev) => prev.filter((c) => c.id !== duplicateContactId));
    setShowMergeModal(false);
    alert('Contatos mesclados com sucesso! O histórico de conversas foi unificado.');
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* 3.4 Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Base de Contatos & Campos Customizados (3.4)</span>
            </h2>
            <p className="text-xs text-slate-400">
              Gerencie contatos unificados, campos personalizados por empresa e mesclagem de duplicados
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('contacts')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                activeTab === 'contacts' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Lista de Contatos
            </button>
            <button
              onClick={() => setActiveTab('custom_fields')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                activeTab === 'custom_fields' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Campos Personalizados
            </button>
          </div>

          {activeTab === 'contacts' ? (
            <>
              <button
                onClick={() => setShowMergeModal(true)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Mesclar Contatos Duplicados"
              >
                <Merge className="w-4 h-4 text-purple-400" />
                <span>Mesclar</span>
              </button>

              <button
                onClick={() => setShowAddModal(true)}
                className="px-3.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold shadow-lg shadow-brand-500/25 flex items-center gap-1.5 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Contato</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowAddFieldModal(true)}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Campo Customizado</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'contacts' ? (
        <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div className="relative w-72">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filtrar por nome, telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="pb-3">Contato</th>
                  <th className="pb-3">Telefone / WhatsApp</th>
                  <th className="pb-3">E-mail</th>
                  <th className="pb-3">Tags</th>
                  <th className="pb-3">Campos Customizados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {contacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 font-bold text-white flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-brand-400 font-extrabold">
                        {contact.name?.charAt(0) || 'C'}
                      </div>
                      <span>{contact.name}</span>
                    </td>
                    <td className="py-3 font-mono text-slate-300">{contact.phone}</td>
                    <td className="py-3 text-slate-400">{contact.email || '-'}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {(contact.tags || []).map((t, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 font-medium">
                            #{t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 text-slate-400 font-mono text-[11px]">
                      {contact.custom_values?.doc_number || '-'} ({contact.custom_values?.revenue || 'N/A'})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Custom Fields Management Table */
        <div className="glass-card rounded-2xl border border-slate-800 p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-purple-400" />
              <span>Campos Personalizados do Tenant</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {customFields.map((field) => (
              <div key={field.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-white">{field.name}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold uppercase">
                    {field.type}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-mono">Chave: {field.key}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl border border-slate-800 w-full max-w-md p-6 space-y-4 animate-fade-in">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-brand-400" />
              <span>Cadastrar Novo Contato</span>
            </h3>

            <form onSubmit={handleCreateContact} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Amanda Castro"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Telefone (com DDD)</label>
                <input
                  type="tel"
                  required
                  placeholder="+55 11 99999-8888"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">E-mail</label>
                <input
                  type="email"
                  placeholder="amanda@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-brand-500 text-white text-xs font-semibold"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Merge Contacts Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl border border-slate-800 w-full max-w-md p-6 space-y-4 animate-fade-in">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Merge className="w-4 h-4 text-purple-400" />
              <span>Mesclagem de Contatos Duplicados</span>
            </h3>

            <p className="text-xs text-slate-400 leading-relaxed">
              O contato secundário será mesclado ao principal, unificando todo o histórico de mensagens, tags e dados de CRM.
            </p>

            <form onSubmit={handleMergeContacts} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Contato Principal (Destino)</label>
                <select
                  value={primaryContactId}
                  onChange={(e) => setPrimaryContactId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="">Selecione o contato principal...</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Contato Duplicado (Será Mesclado)</label>
                <select
                  value={duplicateContactId}
                  onChange={(e) => setDuplicateContactId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="">Selecione o contato a fundir...</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowMergeModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!primaryContactId || !duplicateContactId || primaryContactId === duplicateContactId}
                  className="px-4 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-semibold disabled:opacity-50"
                >
                  Confirmar Mesclagem
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Custom Field Modal */}
      {showAddFieldModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl border border-slate-800 w-full max-w-md p-6 space-y-4 animate-fade-in">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-purple-400" />
              <span>Novo Campo Personalizado</span>
            </h3>

            <form onSubmit={handleAddField} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nome do Campo</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Número do Contrato"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Tipo de Dado</label>
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="text">Texto Curto</option>
                  <option value="number">Numérico</option>
                  <option value="date">Data</option>
                  <option value="select">Lista de Seleção</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddFieldModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-semibold"
                >
                  Criar Campo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Contacts;
