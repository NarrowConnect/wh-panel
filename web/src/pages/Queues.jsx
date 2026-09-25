import React, { useState, useEffect } from 'react';
import { Layers, Plus, Trash2, Loader2, GitFork } from 'lucide-react';
import ApiClient from '../api/client';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

const asList = (data, key) => (Array.isArray(data) ? data : data?.[key] || []);

const strategies = {
  round_robin: { label: 'Rodízio', hint: 'Distribui em sequência entre os atendentes da fila.' },
  least_busy: { label: 'Menor carga', hint: 'Entrega para quem tem menos conversas abertas.' },
  manual: { label: 'Manual', hint: 'Conversas ficam na fila até um atendente puxar.' },
};

const conditionTypes = {
  tag: 'Tag da conversa',
  channel: 'Canal de origem',
  custom_field: 'Campo personalizado do contato',
};

const operators = { equals: 'é igual a', contains: 'contém' };


export const Queues = () => {
  const [queues, setQueues] = useState([]);
  const [rulesByQueue, setRulesByQueue] = useState({});
  const [channels, setChannels] = useState([]);
  const [tags, setTags] = useState([]);
  const [view, setView] = useState('queues');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [queueModal, setQueueModal] = useState(false);
  const [queueForm, setQueueForm] = useState({ name: '', strategy: 'round_robin' });
  const [ruleModal, setRuleModal] = useState(false);
  const [ruleForm, setRuleForm] = useState({ queueId: '', type: 'tag', key: '', operator: 'equals', value: '', priority: 1 });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchAll = async () => {
    try {
      const list = asList(await ApiClient.get('/queues'), 'queues');
      setQueues(list);
      const results = await Promise.allSettled(list.map((q) => ApiClient.get(`/queues/${q.id}/rules`)));
      setRulesByQueue(Object.fromEntries(list.map((q, i) => [q.id, results[i].status === 'fulfilled' ? asList(results[i].value, 'rules') : []])));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Não foi possível carregar as filas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    ApiClient.get('/channels').then((d) => setChannels(asList(d, 'channels'))).catch(() => {});
    ApiClient.get('/tags').then((d) => setTags(asList(d, 'tags'))).catch(() => {});
  }, []);

  const openQueueModal = () => {
    setQueueForm({ name: '', strategy: 'round_robin' });
    setFormError('');
    setQueueModal(true);
  };

  const openRuleModal = () => {
    setRuleForm({ queueId: queues[0]?.id || '', type: 'tag', key: '', operator: 'equals', value: '', priority: 1 });
    setFormError('');
    setRuleModal(true);
  };

  const handleCreateQueue = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await ApiClient.post('/queues', { name: queueForm.name.trim(), allocation_strategy: queueForm.strategy });
      setQueueModal(false);
      fetchAll();
    } catch (err) {
      setFormError(err.message || 'Não foi possível criar a fila.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateRule = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await ApiClient.post(`/queues/${ruleForm.queueId}/rules`, {
        priority: Number(ruleForm.priority) || 1,
        condition_type: ruleForm.type,
        condition_key: ruleForm.type === 'custom_field' ? ruleForm.key.trim() : null,
        condition_operator: ruleForm.type === 'channel' ? 'equals' : ruleForm.operator,
        condition_value: ruleForm.value.trim(),
      });
      setRuleModal(false);
      fetchAll();
    } catch (err) {
      setFormError(err.message || 'Não foi possível salvar a regra.');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRule = async (rule) => {
    if (!window.confirm('Excluir esta regra de triagem?')) return;
    try {
      await ApiClient.delete(`/queues/rules/${rule.id}`);
      fetchAll();
    } catch (err) {
      setLoadError(err.message || 'Não foi possível excluir a regra.');
    }
  };

  const describeRule = (rule) => {
    const type = conditionTypes[rule.condition_type] || rule.condition_type;
    const field = rule.condition_type === 'custom_field' && rule.condition_key ? ` "${rule.condition_key}"` : '';
    const value =
      rule.condition_type === 'channel'
        ? channels.find((c) => c.id === rule.condition_value)?.name || rule.condition_value
        : rule.condition_value;
    return `${type}${field} ${operators[rule.condition_operator] || rule.condition_operator} "${value}"`;
  };

  const allRules = queues
    .flatMap((q) => (rulesByQueue[q.id] || []).map((r) => ({ ...r, queueName: q.name })))
    .sort((a, b) => a.priority - b.priority);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-5">
        <PageHeader
          description="Filas separam o atendimento por equipe. Regras de triagem direcionam cada nova conversa para a fila certa."
          actions={
            <>
              <div className="segmented" role="group" aria-label="Visualização">
                <button type="button" aria-pressed={view === 'queues'} onClick={() => setView('queues')}>Filas</button>
                <button type="button" aria-pressed={view === 'rules'} onClick={() => setView('rules')}>Regras de triagem</button>
              </div>
              {view === 'queues' ? (
                <button type="button" onClick={openQueueModal} className="btn btn-primary">
                  <Plus strokeWidth={2} />
                  Nova fila
                </button>
              ) : (
                <button type="button" onClick={openRuleModal} disabled={queues.length === 0} className="btn btn-primary">
                  <Plus strokeWidth={2} />
                  Nova regra
                </button>
              )}
            </>
          }
        />

        {loadError && (
          <p role="alert" className="alert-error">{loadError}</p>
        )}

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-5 h-5 text-slate-500 animate-spin" aria-label="Carregando" />
          </div>
        ) : view === 'queues' ? (
          queues.length === 0 ? (
            <div className="glass-card px-6 py-14 text-center space-y-3">
              <Layers className="w-5 h-5 text-slate-500 mx-auto" strokeWidth={1.75} />
              <h2 className="text-sm font-medium text-white">Nenhuma fila configurada</h2>
              <p className="text-[13px] text-slate-400 max-w-md mx-auto">
                Crie filas como Comercial, Suporte ou Financeiro e escolha como as conversas são distribuídas.
              </p>
              <button type="button" onClick={openQueueModal} className="btn btn-primary mt-2">
                <Plus strokeWidth={2} />
                Nova fila
              </button>
            </div>
          ) : (
            <ul className="glass-card divide-y divide-white/[0.05]">
              {queues.map((q) => {
                const users = q.users || [];
                const rules = rulesByQueue[q.id] || [];
                return (
                  <li key={q.id} className="px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[13px] font-medium text-white truncate">{q.name}</h3>
                        {!q.is_active && (
                          <span className="px-1.5 h-5 inline-flex items-center rounded-md border border-white/[0.08] text-[11px] text-slate-400">Inativa</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{strategies[q.allocation_strategy]?.hint || q.allocation_strategy}</p>
                    </div>
                    <dl className="flex items-center gap-6 text-xs">
                      <div>
                        <dt className="text-slate-500">Distribuição</dt>
                        <dd className="text-slate-200">{strategies[q.allocation_strategy]?.label || q.allocation_strategy}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Atendentes</dt>
                        <dd className="text-slate-200 tabular-nums">{users.length}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Regras</dt>
                        <dd className="text-slate-200 tabular-nums">{rules.length}</dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          )
        ) : allRules.length === 0 ? (
          <div className="glass-card px-6 py-14 text-center space-y-3">
            <GitFork className="w-5 h-5 text-slate-500 mx-auto" strokeWidth={1.75} />
            <h2 className="text-sm font-medium text-white">Nenhuma regra de triagem</h2>
            <p className="text-[13px] text-slate-400 max-w-md mx-auto">
              {queues.length === 0
                ? 'Crie uma fila primeiro; cada regra aponta para uma fila de destino.'
                : 'Sem regras, novas conversas não são direcionadas automaticamente para nenhuma fila.'}
            </p>
            {queues.length > 0 && (
              <button type="button" onClick={openRuleModal} className="btn btn-primary mt-2">
                <Plus strokeWidth={2} />
                Nova regra
              </button>
            )}
          </div>
        ) : (
          <ul className="glass-card divide-y divide-white/[0.05]">
            {allRules.map((rule) => (
              <li key={rule.id} className="px-5 py-3.5 flex items-center gap-4">
                <span className="w-6 text-xs text-slate-500 tabular-nums" title="Prioridade">{rule.priority}</span>
                <p className="flex-1 min-w-0 text-[13px] text-slate-200 truncate">{describeRule(rule)}</p>
                <span className="text-xs text-slate-500 whitespace-nowrap">
                  para <span className="text-slate-200">{rule.queueName}</span>
                </span>
                <button
                  type="button"
                  onClick={() => deleteRule(rule)}
                  className="btn btn-icon text-slate-500 hover:text-rose-300"
                  aria-label="Excluir regra"
                  title="Excluir regra"
                >
                  <Trash2 strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {queueModal && (
        <Modal
          title="Nova fila"
          onClose={() => setQueueModal(false)}
          onSubmit={handleCreateQueue}
          submitting={submitting}
          submitLabel="Criar fila"
          error={formError}
        >
          <div>
            <label htmlFor="queue-name" className="field-label">Nome</label>
            <input
              id="queue-name"
              autoFocus
              required
              type="text"
              placeholder="Ex.: Comercial"
              value={queueForm.name}
              onChange={(e) => setQueueForm({ ...queueForm, name: e.target.value })}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="queue-strategy" className="field-label">Distribuição</label>
            <select
              id="queue-strategy"
              value={queueForm.strategy}
              onChange={(e) => setQueueForm({ ...queueForm, strategy: e.target.value })}
              className="field"
            >
              {Object.entries(strategies).map(([id, s]) => (
                <option key={id} value={id}>{s.label}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">{strategies[queueForm.strategy].hint}</p>
          </div>
        </Modal>
      )}

      {ruleModal && (
        <Modal
          title="Nova regra de triagem"
          onClose={() => setRuleModal(false)}
          onSubmit={handleCreateRule}
          submitting={submitting}
          submitLabel="Salvar regra"
          error={formError}
        >
          <div className="grid grid-cols-[1fr,5rem] gap-3">
            <div>
              <label htmlFor="rule-queue" className="field-label">Fila de destino</label>
              <select
                id="rule-queue"
                required
                value={ruleForm.queueId}
                onChange={(e) => setRuleForm({ ...ruleForm, queueId: e.target.value })}
                className="field"
              >
                {queues.map((q) => (
                  <option key={q.id} value={q.id}>{q.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rule-priority" className="field-label">Prioridade</label>
              <input
                id="rule-priority"
                type="number"
                min="1"
                value={ruleForm.priority}
                onChange={(e) => setRuleForm({ ...ruleForm, priority: e.target.value })}
                className="field tabular-nums"
              />
            </div>
          </div>

          <div>
            <label htmlFor="rule-type" className="field-label">Condição</label>
            <select
              id="rule-type"
              value={ruleForm.type}
              onChange={(e) => setRuleForm({ ...ruleForm, type: e.target.value, value: '', key: '' })}
              className="field"
            >
              {Object.entries(conditionTypes).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>

          {ruleForm.type === 'custom_field' && (
            <div>
              <label htmlFor="rule-key" className="field-label">Chave do campo</label>
              <input
                id="rule-key"
                required
                type="text"
                placeholder="Ex.: segmento"
                value={ruleForm.key}
                onChange={(e) => setRuleForm({ ...ruleForm, key: e.target.value })}
                className="field"
              />
            </div>
          )}

          <div className={ruleForm.type === 'channel' ? '' : 'grid grid-cols-[8rem,1fr] gap-3'}>
            {ruleForm.type !== 'channel' && (
              <div>
                <label htmlFor="rule-op" className="field-label">Operador</label>
                <select
                  id="rule-op"
                  value={ruleForm.operator}
                  onChange={(e) => setRuleForm({ ...ruleForm, operator: e.target.value })}
                  className="field"
                >
                  {Object.entries(operators).map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="rule-value" className="field-label">{ruleForm.type === 'channel' ? 'Canal' : 'Valor'}</label>
              {ruleForm.type === 'channel' ? (
                <select
                  id="rule-value"
                  required
                  value={ruleForm.value}
                  onChange={(e) => setRuleForm({ ...ruleForm, value: e.target.value })}
                  className="field"
                >
                  <option value="">Selecione um canal</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    id="rule-value"
                    required
                    type="text"
                    list={ruleForm.type === 'tag' ? 'rule-tag-options' : undefined}
                    placeholder={ruleForm.type === 'tag' ? 'Nome da tag' : 'Valor do campo'}
                    value={ruleForm.value}
                    onChange={(e) => setRuleForm({ ...ruleForm, value: e.target.value })}
                    className="field"
                  />
                  {ruleForm.type === 'tag' && (
                    <datalist id="rule-tag-options">
                      {tags.map((t) => (
                        <option key={t.id} value={t.name} />
                      ))}
                    </datalist>
                  )}
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Queues;
