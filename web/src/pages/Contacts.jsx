import React, { useState, useEffect } from 'react';
import { Users, Search, Plus, Merge, Trash2, Loader2, ChevronLeft, ChevronRight, SlidersHorizontal, MessageSquare } from 'lucide-react';
import ApiClient from '../api/client';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { normalizePhone } from '../lib/phone';

const PAGE_SIZE = 50;

const fieldTypes = {
  text: 'Texto',
  number: 'Número',
  date: 'Data',
  select: 'Lista de opções',
  boolean: 'Sim / Não',
};


const parseOptions = (options) => {
  try {
    if (Array.isArray(options)) return options;
    return JSON.parse(options || '[]');
  } catch {
    return [];
  }
};

const formatValue = (field, value) => {
  if (field?.field_type === 'date' && !Number.isNaN(Date.parse(value))) return new Date(value).toLocaleDateString('pt-BR');
  if (field?.field_type === 'boolean') return value === 'true' ? 'Sim' : 'Não';
  return String(value);
};

const CustomFieldInput = ({ field, value, onChange }) => {
  const id = `cf-${field.key}`;
  const common = { id, value: value || '', onChange: (e) => onChange(e.target.value), className: 'field' };
  let control;
  if (field.field_type === 'select') {
    control = (
      <select {...common}>
        <option value="">Selecione</option>
        {parseOptions(field.options).map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  } else if (field.field_type === 'boolean') {
    control = (
      <select {...common}>
        <option value="">Não informado</option>
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </select>
    );
  } else {
    control = <input {...common} type={field.field_type === 'date' ? 'date' : field.field_type === 'number' ? 'number' : 'text'} />;
  }
  return (
    <div>
      <label htmlFor={id} className="field-label">{field.name}</label>
      {control}
    </div>
  );
};

const emptyContact = { name: '', phone: '', email: '', notes: '', custom_values: {} };

export const Contacts = ({ onOpenChat }) => {
  const [view, setView] = useState('contacts');
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [customFields, setCustomFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [modal, setModal] = useState(null); // 'create' | 'edit' | 'field' | 'merge'
  const [draft, setDraft] = useState(emptyContact);
  const [fieldDraft, setFieldDraft] = useState({ name: '', type: 'text', options: '' });
  const [merge, setMerge] = useState({ primary: '', secondary: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Debounce the server-side search.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await ApiClient.get('/contacts', { search, page, limit: PAGE_SIZE });
      setContacts(res?.contacts || []);
      setTotal(res?.total || 0);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Não foi possível carregar os contatos.');
    } finally {
      setLoading(false);
    }
  };

  const fetchFields = () =>
    ApiClient.get('/custom-fields')
      .then((d) => setCustomFields(Array.isArray(d) ? d : []))
      .catch((err) => setLoadError(err.message || 'Não foi possível carregar os campos personalizados.'));

  useEffect(() => {
    fetchContacts();
  }, [search, page]);

  useEffect(() => {
    fetchFields();
  }, []);

  const open = (kind, contact) => {
    setFormError('');
    if (kind === 'create') setDraft(emptyContact);
    if (kind === 'edit') setDraft({ ...contact, custom_values: { ...(contact.custom_values || {}) } });
    if (kind === 'field') setFieldDraft({ name: '', type: 'text', options: '' });
    if (kind === 'merge') setMerge({ primary: '', secondary: '' });
    setModal(kind);
  };

  const close = () => !submitting && setModal(null);

  const run = async (fn, fallbackMsg) => {
    setSubmitting(true);
    setFormError('');
    try {
      await fn();
      setModal(null);
    } catch (err) {
      setFormError(err.message || fallbackMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const saveContact = (e) => {
    e.preventDefault();
    const phone = normalizePhone(draft.phone);
    if (!phone) {
      setFormError('Telefone inválido. Informe o número completo com código do país e DDD, por exemplo +55 11 99999-8888.');
      return;
    }
    const body = {
      name: draft.name.trim(),
      phone,
      email: draft.email?.trim() || null,
      custom_values: Object.fromEntries(Object.entries(draft.custom_values || {}).filter(([, v]) => v !== '')),
    };
    run(async () => {
      if (modal === 'create') await ApiClient.post('/contacts', { ...body, notes: draft.notes?.trim() || null });
      else await ApiClient.put(`/contacts/${draft.id}`, body);
      await fetchContacts();
    }, 'Não foi possível salvar o contato.');
  };

  const saveField = (e) => {
    e.preventDefault();
    const name = fieldDraft.name.trim();
    const key = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const options = fieldDraft.type === 'select' ? fieldDraft.options.split(',').map((s) => s.trim()).filter(Boolean) : [];
    run(async () => {
      await ApiClient.post('/custom-fields', { name, key, field_type: fieldDraft.type, options });
      await fetchFields();
    }, 'Não foi possível criar o campo.');
  };

  const deleteField = async (field) => {
    if (!window.confirm(`Excluir o campo "${field.name}"? Os valores preenchidos nos contatos deixam de aparecer.`)) return;
    try {
      await ApiClient.delete(`/custom-fields/${field.id}`);
      fetchFields();
    } catch (err) {
      setLoadError(err.message || 'Não foi possível excluir o campo.');
    }
  };

  const saveMerge = (e) => {
    e.preventDefault();
    run(async () => {
      await ApiClient.post('/contacts/merge', { primary_contact_id: merge.primary, secondary_contact_id: merge.secondary });
      await fetchContacts();
    }, 'Não foi possível mesclar os contatos.');
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fieldByKey = Object.fromEntries(customFields.map((f) => [f.key, f]));

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-5">
        <PageHeader
          description="Contatos são compartilhados com Conversas e CRM. Campos personalizados aparecem no cadastro, nos cards e nas regras de triagem."
          actions={
            <>
              <div className="segmented" role="group" aria-label="Visualização">
                <button type="button" aria-pressed={view === 'contacts'} onClick={() => setView('contacts')}>
                  Contatos <span className="text-slate-500 tabular-nums">{total}</span>
                </button>
                <button type="button" aria-pressed={view === 'fields'} onClick={() => setView('fields')}>
                  Campos <span className="text-slate-500 tabular-nums">{customFields.length}</span>
                </button>
              </div>
              {view === 'contacts' ? (
                <>
                  <button type="button" onClick={() => open('merge')} className="btn btn-secondary">
                    <Merge strokeWidth={1.75} />
                    Mesclar
                  </button>
                  <button type="button" onClick={() => open('create')} className="btn btn-primary">
                    <Plus strokeWidth={2} />
                    Novo contato
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => open('field')} className="btn btn-primary">
                  <Plus strokeWidth={2} />
                  Novo campo
                </button>
              )}
            </>
          }
        />

        {loadError && <p role="alert" className="alert-error">{loadError}</p>}

        {view === 'contacts' && (
          <section className="glass-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.06]">
              <div className="relative w-full sm:w-80">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.75} />
                <input
                  type="search"
                  aria-label="Buscar contatos"
                  placeholder="Buscar por nome, telefone ou e-mail"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="field pl-8"
                />
              </div>
              <p className="text-xs text-slate-500 tabular-nums">
                {total} {total === 1 ? 'contato' : 'contatos'}
                {search && ' encontrados'}
              </p>
            </div>

            {loading && contacts.length === 0 ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="w-5 h-5 text-slate-500 animate-spin" aria-label="Carregando" />
              </div>
            ) : contacts.length === 0 ? (
              !loadError && (
              <div className="px-6 py-14 text-center space-y-3">
                <Users className="w-5 h-5 text-slate-500 mx-auto" strokeWidth={1.75} />
                <h2 className="text-sm font-medium text-white">{search ? 'Nenhum contato encontrado' : 'Nenhum contato ainda'}</h2>
                <p className="text-[13px] text-slate-400 max-w-md mx-auto">
                  {search
                    ? `Nada corresponde a "${search}".`
                    : 'Contatos são criados automaticamente quando alguém escreve para um canal conectado, ou você pode cadastrar manualmente.'}
                </p>
                {!search && (
                  <button type="button" onClick={() => open('create')} className="btn btn-primary mt-2">
                    <Plus strokeWidth={2} />
                    Novo contato
                  </button>
                )}
              </div>
              )
            ) : (
              <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="text-xs text-slate-500">
                      <th className="px-4 py-2.5 font-normal">Nome</th>
                      <th className="px-4 py-2.5 font-normal">Telefone</th>
                      <th className="px-4 py-2.5 font-normal">E-mail</th>
                      <th className="px-4 py-2.5 font-normal">Campos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
                    {contacts.map((contact) => {
                      const values = Object.entries(contact.custom_values || {}).filter(([, v]) => v);
                      return (
                        <tr key={contact.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              onClick={() => open('edit', contact)}
                              className="flex items-center gap-2.5 text-left text-slate-100 hover:text-white"
                            >
                              <span className="w-6 h-6 rounded-md bg-white/[0.06] text-slate-200 text-[11px] font-medium flex items-center justify-center flex-shrink-0">
                                {contact.name?.charAt(0).toUpperCase() || '?'}
                              </span>
                              <span className="truncate max-w-[16rem]">{contact.name}</span>
                            </button>
                          </td>
                          <td className="px-4 py-2.5 text-slate-300 tabular-nums whitespace-nowrap">{contact.phone || '–'}</td>
                          <td className="px-4 py-2.5 text-slate-400 truncate max-w-[14rem]">{contact.email || '–'}</td>
                          <td className="px-4 py-2.5">
                            {values.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-w-md">
                                {values.slice(0, 3).map(([k, v]) => (
                                  <span key={k} className="px-1.5 h-5 inline-flex items-center rounded-md bg-white/[0.04] text-[11px] text-slate-300 whitespace-nowrap">
                                    <span className="text-slate-500 mr-1">{fieldByKey[k]?.name || k}</span>
                                    {formatValue(fieldByKey[k], v)}
                                  </span>
                                ))}
                                {values.length > 3 && <span className="text-[11px] text-slate-500">+{values.length - 3}</span>}
                              </div>
                            ) : (
                              <span className="text-slate-600">–</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {pages > 1 && (
              <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-white/[0.06]">
                <span className="text-xs text-slate-500 tabular-nums mr-2">Página {page} de {pages}</span>
                <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn btn-secondary btn-icon" aria-label="Página anterior">
                  <ChevronLeft strokeWidth={1.75} />
                </button>
                <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="btn btn-secondary btn-icon" aria-label="Próxima página">
                  <ChevronRight strokeWidth={1.75} />
                </button>
              </div>
            )}
          </section>
        )}

        {view === 'fields' &&
          (customFields.length === 0 ? (
            <div className="glass-card px-6 py-14 text-center space-y-3">
              <SlidersHorizontal className="w-5 h-5 text-slate-500 mx-auto" strokeWidth={1.75} />
              <h2 className="text-sm font-medium text-white">Nenhum campo personalizado</h2>
              <p className="text-[13px] text-slate-400 max-w-md mx-auto">
                Crie campos como CPF/CNPJ, segmento ou origem do lead para guardar o que importa sobre cada contato.
              </p>
              <button type="button" onClick={() => open('field')} className="btn btn-primary mt-2">
                <Plus strokeWidth={2} />
                Novo campo
              </button>
            </div>
          ) : (
            <ul className="glass-card divide-y divide-white/[0.05]">
              {customFields.map((field) => {
                const options = parseOptions(field.options);
                return (
                  <li key={field.id} className="px-5 py-3.5 flex items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-white">{field.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        <span className="font-mono">{field.key}</span> · {fieldTypes[field.field_type] || field.field_type}
                        {options.length > 0 && ` · ${options.join(', ')}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteField(field)}
                      className="btn btn-icon text-slate-500 hover:text-rose-300"
                      aria-label={`Excluir campo ${field.name}`}
                      title="Excluir"
                    >
                      <Trash2 strokeWidth={1.75} />
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}
      </div>

      {(modal === 'create' || modal === 'edit') && (
        <Modal
          title={modal === 'create' ? 'Novo contato' : draft.name || 'Contato'}
          size="lg"
          onClose={close}
          onSubmit={saveContact}
          submitting={submitting}
          submitLabel={modal === 'create' ? 'Salvar contato' : 'Salvar alterações'}
          error={formError}
          footer={
            <>
              {modal === 'edit' && onOpenChat && (
                <button type="button" onClick={() => { setModal(null); onOpenChat(); }} className="btn btn-secondary mr-auto">
                  <MessageSquare strokeWidth={1.75} />
                  Ir para Conversas
                </button>
              )}
              <button type="button" onClick={close} className="btn btn-secondary">Cancelar</button>
              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting && <Loader2 className="animate-spin" />}
                {modal === 'create' ? 'Salvar contato' : 'Salvar alterações'}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="ct-name" className="field-label">Nome</label>
              <input id="ct-name" autoFocus required type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="field" />
            </div>
            <div>
              <label htmlFor="ct-phone" className="field-label">Telefone / WhatsApp</label>
              <input id="ct-phone" required type="tel" placeholder="+55 11 99999-8888" value={draft.phone || ''} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className="field tabular-nums" />
            </div>
            <div>
              <label htmlFor="ct-email" className="field-label">E-mail</label>
              <input id="ct-email" type="email" value={draft.email || ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className="field" />
            </div>
          </div>

          {customFields.length > 0 && (
            <div className="pt-4 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-3">
              {customFields.map((field) => (
                <CustomFieldInput
                  key={field.id}
                  field={field}
                  value={draft.custom_values?.[field.key]}
                  onChange={(v) => setDraft((d) => ({ ...d, custom_values: { ...d.custom_values, [field.key]: v } }))}
                />
              ))}
            </div>
          )}

          {modal === 'create' ? (
            <div>
              <label htmlFor="ct-notes" className="field-label">Observações internas</label>
              <textarea id="ct-notes" rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className="field" />
            </div>
          ) : (
            draft.notes && (
              <div>
                <p className="field-label">Observações internas</p>
                <p className="text-[13px] text-slate-400 whitespace-pre-line">{draft.notes}</p>
              </div>
            )
          )}
        </Modal>
      )}

      {modal === 'field' && (
        <Modal title="Novo campo personalizado" onClose={close} onSubmit={saveField} submitting={submitting} submitLabel="Criar campo" error={formError}>
          <div>
            <label htmlFor="cf-name" className="field-label">Nome</label>
            <input id="cf-name" autoFocus required type="text" placeholder="Ex.: Segmento" value={fieldDraft.name} onChange={(e) => setFieldDraft({ ...fieldDraft, name: e.target.value })} className="field" />
          </div>
          <div>
            <label htmlFor="cf-type" className="field-label">Tipo</label>
            <select id="cf-type" value={fieldDraft.type} onChange={(e) => setFieldDraft({ ...fieldDraft, type: e.target.value })} className="field">
              {Object.entries(fieldTypes).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>
          {fieldDraft.type === 'select' && (
            <div>
              <label htmlFor="cf-options" className="field-label">Opções, separadas por vírgula</label>
              <input id="cf-options" required type="text" placeholder="Pequena, Média, Grande" value={fieldDraft.options} onChange={(e) => setFieldDraft({ ...fieldDraft, options: e.target.value })} className="field" />
            </div>
          )}
        </Modal>
      )}

      {modal === 'merge' && (
        <Modal
          title="Mesclar contatos"
          onClose={close}
          onSubmit={saveMerge}
          submitting={submitting}
          submitLabel="Mesclar"
          submitDisabled={!merge.primary || !merge.secondary || merge.primary === merge.secondary}
          error={formError}
        >
          <p className="text-[13px] text-slate-400">
            Os campos personalizados do duplicado passam para o principal, que também herda telefone e e-mail se não tiver. O duplicado fica marcado como mesclado; as conversas dele não são movidas.
          </p>
          <div>
            <label htmlFor="mg-primary" className="field-label">Contato principal</label>
            <select id="mg-primary" value={merge.primary} onChange={(e) => setMerge({ ...merge, primary: e.target.value })} className="field">
              <option value="">Selecione</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mg-secondary" className="field-label">Contato duplicado</label>
            <select id="mg-secondary" value={merge.secondary} onChange={(e) => setMerge({ ...merge, secondary: e.target.value })} className="field">
              <option value="">Selecione</option>
              {contacts.filter((c) => c.id !== merge.primary).map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
              ))}
            </select>
          </div>
          {contacts.length < total && (
            <p className="text-xs text-slate-500">A lista mostra a página atual. Use a busca para encontrar outros contatos antes de mesclar.</p>
          )}
        </Modal>
      )}
    </div>
  );
};

export default Contacts;
