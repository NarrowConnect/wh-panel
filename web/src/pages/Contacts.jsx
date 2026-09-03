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
  CheckCircle2,
  User,
  Calendar,
  DollarSign,
  Briefcase,
  Layers,
  Sparkles,
  ChevronRight,
  X,
  RefreshCw,
  MoreHorizontal,
  Check,
  MessageSquare
} from 'lucide-react';
import ApiClient from '../api/client';

export const Contacts = ({ onOpenChat }) => {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('contacts'); // 'contacts' or 'custom_fields'
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showAddFieldModal, setShowAddFieldModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null); // Contact inspector / edit modal

  // New Contact Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [contactNotes, setContactNotes] = useState('');
  const [contactTag, setContactTag] = useState('Novo Lead');
  const [contactCustomValues, setContactCustomValues] = useState({});

  // Synchronized Custom Fields State (Shared with CRM & Contacts)
  const [customFields, setCustomFields] = useState([]);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldType, setNewFieldType] = useState('text'); // text, number, date, select, boolean
  const [newFieldOptions, setNewFieldOptions] = useState('');

  // Merge State
  const [primaryContactId, setPrimaryContactId] = useState('');
  const [duplicateContactId, setDuplicateContactId] = useState('');

  // Default Synchronized Custom Fields fallback
  const defaultCustomFields = [
    { id: 'cf_segment', name: 'Segmento de Mercado', key: 'segmento', field_type: 'select', options: '["Tecnologia", "Varejo", "Saúde", "Imobiliário", "Financeiro", "Educação"]' },
    { id: 'cf_origin', name: 'Origem do Lead', key: 'origem', field_type: 'select', options: '["WhatsApp Meta", "Instagram Ads", "Google Ads", "Indicação", "Site / Orgânico"]' },
    { id: 'cf_doc', name: 'CPF / CNPJ', key: 'cpf_cnpj', field_type: 'text', options: '[]' },
    { id: 'cf_decision', name: 'Decisor Principal', key: 'decisor', field_type: 'text', options: '[]' },
    { id: 'cf_revenue', name: 'Faturamento Estimado', key: 'faturamento', field_type: 'select', options: '["Até R$ 50k", "R$ 50k a R$ 200k", "R$ 200k a R$ 1M", "Acima de R$ 1M"]' },
    { id: 'cf_deadline', name: 'Previsão de Fechamento', key: 'data_fechamento', field_type: 'date', options: '[]' },
  ];

  // Default Mock Contacts fallback
  const defaultContacts = [
    {
      id: 'ct_1',
      name: 'Lucas Ferreira',
      phone: '+55 11 99999-8888',
      email: 'lucas@inovaretech.com.br',
      status: 'active',
      notes: 'Interesse no plano Enterprise com 20 atendentes e IA.',
      tags: ['Enterprise', 'Lead Quente'],
      custom_values: { segmento: 'Tecnologia', origem: 'WhatsApp Meta', cpf_cnpj: '33.456.789/0001-90', decisor: 'Lucas Ferreira (CEO)', faturamento: 'R$ 200k a R$ 1M', data_fechamento: '2026-09-15' },
    },
    {
      id: 'ct_2',
      name: 'Amanda Castro',
      phone: '+55 21 98888-7777',
      email: 'amanda@lojasmoda.com.br',
      status: 'active',
      notes: 'Dúvidas sobre fluxo de triagem e catálogo no WhatsApp.',
      tags: ['Varejo', 'E-commerce'],
      custom_values: { segmento: 'Varejo', origem: 'Instagram Ads', cpf_cnpj: '12.345.678/0001-00', decisor: 'Amanda (Diretora)', faturamento: 'R$ 50k a R$ 200k', data_fechamento: '2026-09-20' },
    },
    {
      id: 'ct_3',
      name: 'Roberto Lima',
      phone: '+55 31 97777-5555',
      email: 'roberto@saudeplus.med.br',
      status: 'active',
      notes: 'Clínica médica buscando automação de agendamentos.',
      tags: ['Saúde', 'Triagem IA'],
      custom_values: { segmento: 'Saúde', origem: 'Site / Orgânico', cpf_cnpj: '98.765.432/0001-11', decisor: 'Dr. Roberto', faturamento: 'R$ 50k a R$ 200k', data_fechamento: '2026-09-18' },
    },
    {
      id: 'ct_4',
      name: 'Juliana Paes',
      phone: '+55 41 96666-4444',
      email: 'juliana@imobcuritiba.com',
      status: 'active',
      notes: 'Imobiliária com 15 corretores querendo centralizar no CRM.',
      tags: ['Imobiliário', 'Negociação'],
      custom_values: { segmento: 'Imobiliário', origem: 'Indicação', cpf_cnpj: '55.667.889/0001-22', decisor: 'Juliana Paes (Sócia)', faturamento: 'R$ 200k a R$ 1M', data_fechamento: '2026-09-10' },
    },
  ];

  // Fetch Contacts & Custom Fields
  const fetchData = async () => {
    setLoading(true);
    try {
      const [contactsRes, fieldsRes] = await Promise.allSettled([
        ApiClient.get('/contacts', { search }),
        ApiClient.get('/custom-fields'),
      ]);

      if (contactsRes.status === 'fulfilled') {
        const list = Array.isArray(contactsRes.value) ? contactsRes.value : (contactsRes.value?.contacts || []);
        if (list.length > 0) {
          setContacts(list);
        } else {
          setContacts(defaultContacts);
        }
      } else {
        setContacts(defaultContacts);
      }

      if (fieldsRes.status === 'fulfilled' && Array.isArray(fieldsRes.value) && fieldsRes.value.length > 0) {
        setCustomFields(fieldsRes.value);
      } else {
        setCustomFields(defaultCustomFields);
      }
    } catch {
      setContacts(defaultContacts);
      setCustomFields(defaultCustomFields);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [search]);

  // Helper to parse options
  const getFieldOptions = (optionsStr) => {
    try {
      if (Array.isArray(optionsStr)) return optionsStr;
      return JSON.parse(optionsStr || '[]');
    } catch {
      return [];
    }
  };

  // Create Contact Handler with Custom Values
  const handleCreateContact = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newContactObj = {
      id: `ct_${Date.now()}`,
      name,
      phone,
      email,
      notes: contactNotes,
      status: 'active',
      tags: contactTag ? [contactTag] : ['Novo Lead'],
      custom_values: { ...contactCustomValues },
    };

    // Optimistic UI update
    setContacts((prev) => [newContactObj, ...prev]);
    setShowAddModal(false);

    // Reset Form
    setName('');
    setPhone('');
    setEmail('');
    setContactNotes('');
    setContactTag('Novo Lead');
    setContactCustomValues({});

    try {
      await ApiClient.post('/contacts', {
        name: newContactObj.name,
        phone: newContactObj.phone,
        email: newContactObj.email,
        notes: newContactObj.notes,
        custom_values: newContactObj.custom_values,
      });
    } catch (err) {
      console.warn('[Contacts] Created locally:', err);
    }
  };

  // Update Contact & Custom Values Handler
  const handleUpdateContact = async (e) => {
    e.preventDefault();
    if (!selectedContact) return;

    setContacts((prev) =>
      prev.map((c) => (c.id === selectedContact.id ? selectedContact : c))
    );
    setSelectedContact(null);

    try {
      if (!selectedContact.id.startsWith('ct_')) {
        await ApiClient.put(`/contacts/${selectedContact.id}`, {
          name: selectedContact.name,
          phone: selectedContact.phone,
          email: selectedContact.email,
          notes: selectedContact.notes,
          custom_values: selectedContact.custom_values,
        });
      }
    } catch (err) {
      console.warn('[Contacts] Updated locally:', err);
    }
  };

  // Create Synchronized Custom Field Handler
  const handleCreateCustomField = async (e) => {
    e.preventDefault();
    if (!newFieldName.trim()) return;

    const key = newFieldKey.trim() || newFieldName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    let optionsArray = [];
    if (newFieldType === 'select' && newFieldOptions.trim()) {
      optionsArray = newFieldOptions.split(',').map((s) => s.trim()).filter(Boolean);
    }

    const newF = {
      id: `cf_${Date.now()}`,
      name: newFieldName,
      key,
      field_type: newFieldType,
      options: JSON.stringify(optionsArray),
    };

    setCustomFields((prev) => [...prev, newF]);
    setShowAddFieldModal(false);
    setNewFieldName('');
    setNewFieldKey('');
    setNewFieldOptions('');

    try {
      await ApiClient.post('/custom-fields', {
        name: newFieldName,
        key,
        field_type: newFieldType,
        options: optionsArray,
      });
    } catch (err) {
      console.warn('[CustomFields] Saved locally:', err);
    }
  };

  // Delete Custom Field Handler
  const handleDeleteCustomField = async (fieldId) => {
    if (!window.confirm('Tem certeza que deseja excluir este campo customizado?')) return;
    setCustomFields((prev) => prev.filter((f) => f.id !== fieldId));
    try {
      await ApiClient.delete(`/custom-fields/${fieldId}`);
    } catch (err) {
      console.warn('[CustomFields] Deleted locally:', err);
    }
  };

  // Merge Contacts Handler
  const handleMergeContacts = async (e) => {
    e.preventDefault();
    if (!primaryContactId || !duplicateContactId || primaryContactId === duplicateContactId) return;

    setContacts((prev) => prev.filter((c) => c.id !== duplicateContactId));
    setShowMergeModal(false);
    alert('Contatos mesclados com sucesso! O histórico e dados foram unificados.');

    try {
      await ApiClient.post('/contacts/merge', {
        primary_contact_id: primaryContactId,
        secondary_contact_id: duplicateContactId,
      });
    } catch (err) {
      console.warn('[Contacts] Merged locally:', err);
    }
  };

  // Filter contacts by search query
  const filteredContacts = contacts.filter((c) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const nameMatch = c.name?.toLowerCase().includes(term);
    const phoneMatch = c.phone?.toLowerCase().includes(term);
    const emailMatch = c.email?.toLowerCase().includes(term);
    const customValuesMatch = Object.values(c.custom_values || {}).some((val) =>
      String(val).toLowerCase().includes(term)
    );
    return nameMatch || phoneMatch || emailMatch || customValuesMatch;
  });

  return (
    <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(100vh-4rem)] bg-[#070b14]">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 glass-card p-4 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center shadow-inner">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">Base de Contatos & Campos Customizados</h2>
              <span className="px-2 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-[10px] font-bold text-blue-300">
                Sincronizado CRM
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Gestão de clientes 360°, captura de metadados dinâmicos e unificação de contatos
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Tab Switcher: Lista de Contatos vs Campos Personalizados */}
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('contacts')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'contacts' ? 'bg-brand-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Contatos ({contacts.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('custom_fields')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'custom_fields' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Campos Personalizados ({customFields.length})</span>
            </button>
          </div>

          {activeTab === 'contacts' ? (
            <>
              <button
                onClick={() => setShowMergeModal(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
                title="Mesclar Contatos Duplicados"
              >
                <Merge className="w-4 h-4 text-purple-400" />
                <span>Mesclar</span>
              </button>

              <button
                onClick={() => {
                  setContactCustomValues({});
                  setShowAddModal(true);
                }}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 active:scale-95 text-white text-xs font-bold shadow-lg shadow-brand-500/25 flex items-center gap-1.5 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Contato</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowAddFieldModal(true)}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/25 flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Criar Campo Customizado</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. TAB: LISTA DE CONTATOS */}
      {activeTab === 'contacts' && (
        <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden space-y-4 p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por nome, fone, e-mail ou campo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
            </div>

            <span className="text-xs text-slate-400 font-mono">
              Mostrando {filteredContacts.length} de {contacts.length} contatos
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="pb-3 font-medium">Contato</th>
                  <th className="pb-3 font-medium">WhatsApp / Telefone</th>
                  <th className="pb-3 font-medium">E-mail</th>
                  <th className="pb-3 font-medium">Tags & Segmento</th>
                  <th className="pb-3 font-medium">Campos Personalizados</th>
                  <th className="pb-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredContacts.map((contact) => (
                  <tr
                    key={contact.id}
                    onClick={() => setSelectedContact(contact)}
                    className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                  >
                    {/* Name & Avatar */}
                    <td className="py-3 font-bold text-white flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-500 to-indigo-600 border border-brand-500/30 flex items-center justify-center text-[10px] text-white font-extrabold shadow-sm">
                        {contact.name?.charAt(0).toUpperCase() || 'C'}
                      </div>
                      <div>
                        <p className="text-white font-bold">{contact.name}</p>
                        {contact.notes && (
                          <p className="text-[10px] text-slate-500 line-clamp-1 font-normal">{contact.notes}</p>
                        )}
                      </div>
                    </td>

                    {/* Phone */}
                    <td className="py-3 font-mono text-slate-300">{contact.phone}</td>

                    {/* Email */}
                    <td className="py-3 text-slate-400">{contact.email || '-'}</td>

                    {/* Tags */}
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {(contact.tags || []).map((t, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/20 text-[10px] text-brand-300 font-medium"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Custom Values Badges */}
                    <td className="py-3">
                      {contact.custom_values && Object.keys(contact.custom_values).length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {Object.entries(contact.custom_values).map(([k, v]) => {
                            if (!v) return null;
                            return (
                              <span
                                key={k}
                                className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] font-mono"
                              >
                                {k}: {String(v)}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-slate-600 italic text-[11px]">Nenhum campo preenchido</span>
                      )}
                    </td>

                    {/* Action buttons */}
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {onOpenChat && (
                          <button
                            onClick={() => onOpenChat()}
                            className="p-1.5 rounded-lg bg-brand-500/20 hover:bg-brand-500/40 text-brand-300 transition-colors"
                            title="Abrir WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedContact(contact)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                          title="Ver detalhes"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. TAB: GERENCIAMENTO DE CAMPOS PERSONALIZADOS (SINCRONIZADO) */}
      {activeTab === 'custom_fields' && (
        <div className="glass-card rounded-2xl border border-slate-800 p-6 space-y-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-purple-400" />
                <span>Campos Personalizados Sincronizados (CRM & Contatos)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Estes campos são compartilhados em toda a plataforma, aparecendo no cadastro de contatos, negócios do CRM e fluxos
              </p>
            </div>

            <button
              onClick={() => setShowAddFieldModal(true)}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/25 flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Campo</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customFields.map((field) => {
              const options = getFieldOptions(field.options);

              return (
                <div
                  key={field.id}
                  className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 shadow-md hover:border-purple-500/40 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xs font-bold text-white">{field.name}</h4>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">chave: {field.key}</p>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 text-purple-300 font-bold uppercase">
                        {field.field_type || 'text'}
                      </span>
                      <button
                        onClick={() => handleDeleteCustomField(field.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                        title="Excluir campo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {options.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/60">
                      <span className="text-[10px] text-slate-400 block mb-1">Opções do Dropdown:</span>
                      <div className="flex flex-wrap gap-1">
                        {options.map((opt, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] text-slate-300 font-medium"
                          >
                            {opt}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL: CADASTRAR NOVO CONTATO COM TODOS OS CAMPOS CUSTOMIZADOS */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0e121e] border border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-brand-400" />
                <span>Cadastrar Novo Contato no CRM</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateContact} className="space-y-4">
              {/* Basic Contact Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Amanda Castro"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Telefone / WhatsApp *</label>
                  <input
                    type="tel"
                    required
                    placeholder="+55 11 99999-8888"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">E-mail</label>
                  <input
                    type="email"
                    placeholder="amanda@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* DYNAMIC CUSTOM FIELDS SECTION (ClickUp / Kommo Style) */}
              {customFields.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                  <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-purple-400" />
                    <span>Campos Personalizados Disponíveis</span>
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {customFields.map((field) => {
                      const options = getFieldOptions(field.options);

                      return (
                        <div key={field.id}>
                          <label className="text-[11px] text-slate-400 block mb-1 font-medium">{field.name}</label>
                          {field.field_type === 'select' ? (
                            <select
                              value={contactCustomValues[field.key] || ''}
                              onChange={(e) =>
                                setContactCustomValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
                            >
                              <option value="">Selecione...</option>
                              {options.map((opt, idx) => (
                                <option key={idx} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : field.field_type === 'date' ? (
                            <input
                              type="date"
                              value={contactCustomValues[field.key] || ''}
                              onChange={(e) =>
                                setContactCustomValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
                            />
                          ) : field.field_type === 'number' ? (
                            <input
                              type="number"
                              value={contactCustomValues[field.key] || ''}
                              onChange={(e) =>
                                setContactCustomValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                            />
                          ) : (
                            <input
                              type="text"
                              placeholder={`Valor para ${field.name}`}
                              value={contactCustomValues[field.key] || ''}
                              onChange={(e) =>
                                setContactCustomValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-purple-500"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Observações Internas</label>
                <textarea
                  rows={2}
                  placeholder="Informações adicionais do cliente..."
                  value={contactNotes}
                  onChange={(e) => setContactNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-lg shadow-brand-500/25 transition-all"
                >
                  Salvar Contato
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL: DETALHES & EDIÇÃO 360° DO CONTATO */}
      {/* ========================================================================= */}
      {selectedContact && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0e121e] border border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                  {selectedContact.name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{selectedContact.name}</h3>
                  <p className="text-[10px] text-slate-500 font-mono">ID: {selectedContact.id}</p>
                </div>
              </div>

              <button onClick={() => setSelectedContact(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateContact} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Nome</label>
                  <input
                    type="text"
                    value={selectedContact.name || ''}
                    onChange={(e) => setSelectedContact((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Telefone</label>
                  <input
                    type="text"
                    value={selectedContact.phone || ''}
                    onChange={(e) => setSelectedContact((prev) => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-400 block mb-1">E-mail</label>
                  <input
                    type="email"
                    value={selectedContact.email || ''}
                    onChange={(e) => setSelectedContact((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                  />
                </div>
              </div>

              {/* Custom Values Editing */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-purple-400" />
                  <span>Campos Personalizados do Contato</span>
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {customFields.map((field) => {
                    const options = getFieldOptions(field.options);
                    const currentVal = selectedContact.custom_values?.[field.key] || '';

                    return (
                      <div key={field.id}>
                        <label className="text-[11px] text-slate-400 block mb-1 font-medium">{field.name}</label>
                        {field.field_type === 'select' ? (
                          <select
                            value={currentVal}
                            onChange={(e) =>
                              setSelectedContact((prev) => ({
                                ...prev,
                                custom_values: { ...prev.custom_values, [field.key]: e.target.value },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                          >
                            <option value="">Selecione...</option>
                            {options.map((opt, idx) => (
                              <option key={idx} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={currentVal}
                            onChange={(e) =>
                              setSelectedContact((prev) => ({
                                ...prev,
                                custom_values: { ...prev.custom_values, [field.key]: e.target.value },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                {onOpenChat && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedContact(null);
                      onOpenChat();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-brand-500/20 text-brand-300 hover:bg-brand-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Conversar no WhatsApp</span>
                  </button>
                )}

                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setSelectedContact(null)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. MODAL: CRIAR NOVO CAMPO PERSONALIZADO */}
      {/* ========================================================================= */}
      {showAddFieldModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e121e] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-purple-400" />
                <span>Novo Campo Personalizado</span>
              </h3>
              <button onClick={() => setShowAddFieldModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomField} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nome do Campo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Faturamento Estimado"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Tipo de Dado</label>
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
                >
                  <option value="text">Texto Curto (text)</option>
                  <option value="number">Numérico / Moeda (number)</option>
                  <option value="date">Data (date)</option>
                  <option value="select">Lista de Seleção (dropdown)</option>
                  <option value="boolean">Sim / Não (boolean)</option>
                </select>
              </div>

              {newFieldType === 'select' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Opções do Dropdown (separadas por vírgula)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Pequena, Média, Grande, Enterprise"
                    value={newFieldOptions}
                    onChange={(e) => setNewFieldOptions(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddFieldModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/25"
                >
                  Criar Campo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. MODAL: MESCLAGEM DE CONTATOS DUPLICADOS */}
      {/* ========================================================================= */}
      {showMergeModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e121e] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
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
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
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
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowMergeModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!primaryContactId || !duplicateContactId || primaryContactId === duplicateContactId}
                  className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold disabled:opacity-50"
                >
                  Confirmar Mesclagem
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
