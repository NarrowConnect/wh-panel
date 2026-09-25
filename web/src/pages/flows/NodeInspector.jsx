import React, { useRef } from 'react';
import { Copy, Trash2, AlertTriangle, Info } from 'lucide-react';
import {
  NODE_SPECS,
  TONES,
  TRIGGER_EVENTS,
  CONDITION_OPERATORS,
  WAIT_UNITS,
  AI_PROVIDERS,
  STATIC_FIELDS,
  TEMPLATE_VARS,
} from './catalog';

const Field = ({ id, label, hint, children, optional }) => (
  <div>
    <label htmlFor={id} className="field-label">
      {label}
      {optional && <span className="text-slate-500"> (opcional)</span>}
    </label>
    {children}
    {hint && <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500">{hint}</p>}
  </div>
);

/** Textarea with one-click insertion of {{variables}} at the cursor. */
const TemplateArea = ({ id, value, onChange, rows = 4, placeholder, variables = [] }) => {
  const ref = useRef(null);
  const insert = (token) => {
    const el = ref.current;
    const cur = value || '';
    const start = el ? el.selectionStart : cur.length;
    const end = el ? el.selectionEnd : cur.length;
    const next = cur.slice(0, start) + token + cur.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };
  const tokens = [...TEMPLATE_VARS, ...variables.map((v) => ({ token: `{{var.${v}}}`, label: v }))];
  return (
    <>
      <textarea id={id} ref={ref} rows={rows} value={value || ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="field resize-y" />
      <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Inserir variável">
        {tokens.map((t) => (
          <button
            key={t.token}
            type="button"
            onClick={() => insert(t.token)}
            className="h-6 px-2 rounded-md border border-white/[0.08] text-[11px] text-slate-400 hover:text-white hover:border-white/[0.18] transition-colors"
            title={`Inserir ${t.token}`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </>
  );
};

const FieldPicker = ({ id, value, onChange, customFields, variables }) => {
  const isVar = value?.startsWith('var.');
  const known = STATIC_FIELDS.some((f) => f.id === value) || customFields.some((f) => `contact.${f.key}` === value);
  const selectValue = isVar ? '__var' : known || !value ? value || '' : '__var';
  return (
    <>
      <select
        id={id}
        value={selectValue}
        onChange={(e) => onChange(e.target.value === '__var' ? `var.${variables[0] || ''}` : e.target.value)}
        className="field"
      >
        <option value="">Selecione</option>
        <optgroup label="Conversa">
          {STATIC_FIELDS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </optgroup>
        {customFields.length > 0 && (
          <optgroup label="Campos personalizados">
            {customFields.map((f) => (
              <option key={f.key} value={`contact.${f.key}`}>{f.name}</option>
            ))}
          </optgroup>
        )}
        <option value="__var">Variável do fluxo…</option>
      </select>
      {selectValue === '__var' && (
        <input
          type="text"
          aria-label="Nome da variável"
          list="flow-variables"
          placeholder="nome_da_variavel"
          value={(value || '').replace(/^var\./, '')}
          onChange={(e) => onChange(`var.${e.target.value.replace(/\s+/g, '_')}`)}
          className="field mt-2 font-mono text-xs"
        />
      )}
      <datalist id="flow-variables">
        {variables.map((v) => <option key={v} value={v} />)}
      </datalist>
    </>
  );
};

export const NodeInspector = ({ node, lookups, variables, problems, warning, canEdit, onTitle, onConfig, onDuplicate, onDelete }) => {
  const spec = NODE_SPECS[node.type];
  const tone = TONES[spec.tone];
  const Icon = spec.icon;
  const d = node.data.config || {};
  const set = (patch) => onConfig(patch);
  const fid = (k) => `node-${node.id}-${k}`;
  const { queues = [], tags = [], customFields = [], stages = [], channels = [], aiProviders = [] } = lookups;

  const pipelines = stages.reduce((acc, s) => {
    if (!acc.some((p) => p.id === s.pipelineId)) acc.push({ id: s.pipelineId, name: s.pipelineName });
    return acc;
  }, []);
  const currentStage = stages.find((s) => s.id === d.stage_id);
  const configuredProviders = aiProviders.filter((p) => p.is_active !== false).map((p) => p.provider);

  return (
    <fieldset disabled={!canEdit} className="space-y-4 min-w-0">
      <div className="flex items-start gap-2.5">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tone.chip}`}>
          <Icon className="w-4 h-4" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-white">{spec.label}</p>
          <p className="text-xs text-slate-500">{spec.hint}</p>
        </div>
        {node.type !== 'trigger' && (
          <div className="flex items-center">
            <button type="button" onClick={onDuplicate} className="btn btn-icon text-slate-500 hover:text-white" aria-label="Duplicar etapa" title="Duplicar (Ctrl+D)">
              <Copy strokeWidth={1.75} />
            </button>
            <button type="button" onClick={onDelete} className="btn btn-icon text-slate-500 hover:text-rose-300" aria-label="Excluir etapa" title="Excluir (Delete)">
              <Trash2 strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>

      {problems?.length > 0 && (
        <ul className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 space-y-1">
          {problems.map((p) => (
            <li key={p} className="flex items-start gap-2 text-xs text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" strokeWidth={1.9} />
              {p}
            </li>
          ))}
        </ul>
      )}
      {warning && !problems?.length && (
        <p className="flex items-start gap-2 text-xs text-slate-400">
          <Info className="w-3.5 h-3.5 mt-px flex-shrink-0" strokeWidth={1.9} />
          {warning}. Conecte-a a uma etapa anterior ou exclua.
        </p>
      )}

      <Field id={fid('title')} label="Nome da etapa">
        <input id={fid('title')} type="text" maxLength={60} value={node.data.title || ''} onChange={(e) => onTitle(e.target.value)} className="field" />
      </Field>

      {node.type === 'trigger' && (
        <>
          <Field id={fid('event')} label="Começa quando" hint={TRIGGER_EVENTS.find((e) => e.id === d.event)?.hint}>
            <select id={fid('event')} value={d.event || 'new_conversation'} onChange={(e) => set({ event: e.target.value })} className="field">
              {TRIGGER_EVENTS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </Field>
          {d.event === 'keyword' && (
            <Field id={fid('kw')} label="Palavras-chave" hint="Separe por vírgula. Não diferencia maiúsculas; basta a mensagem conter a palavra.">
              <input id={fid('kw')} type="text" placeholder="boleto, 2ª via, fatura" value={d.keywords || ''} onChange={(e) => set({ keywords: e.target.value })} className="field" />
            </Field>
          )}
          {d.event !== 'manual' && (
            <div>
              <p className="field-label">Canais</p>
              {channels.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhum canal conectado ainda. O fluxo vale para todos os canais.</p>
              ) : (
                <div className="space-y-1">
                  {channels.map((ch) => {
                    const ids = Array.isArray(d.channel_ids) ? d.channel_ids : [];
                    const checked = ids.includes(ch.id);
                    return (
                      <label key={ch.id} className="flex items-center gap-2.5 h-8 px-2 rounded-md hover:bg-white/[0.03] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => set({ channel_ids: checked ? ids.filter((x) => x !== ch.id) : [...ids, ch.id] })}
                          className="accent-[#7468bd]"
                        />
                        <span className="text-[13px] text-slate-200 truncate">{ch.name}</span>
                        <span className="ml-auto text-[11px] text-slate-500">{ch.type}</span>
                      </label>
                    );
                  })}
                  <p className="text-[11.5px] text-slate-500 pt-1">Nenhum marcado = todos os canais.</p>
                </div>
              )}
            </div>
          )}
          <p className="text-[11.5px] leading-relaxed text-slate-500">
            Uma conversa roda um fluxo por vez. Quando um atendente responde, o bot para.
          </p>
        </>
      )}

      {node.type === 'send_message' && (
        <Field id={fid('msg')} label="Mensagem">
          <TemplateArea id={fid('msg')} rows={5} value={d.message} onChange={(v) => set({ message: v })} variables={variables} placeholder="Olá {{first_name}}! Como podemos ajudar?" />
        </Field>
      )}

      {node.type === 'ask' && (
        <>
          <Field id={fid('q')} label="Pergunta">
            <TemplateArea id={fid('q')} rows={3} value={d.message} onChange={(v) => set({ message: v })} variables={variables} placeholder="Qual é o seu e-mail?" />
          </Field>
          <Field id={fid('save')} label="Salvar resposta em" optional>
            <select id={fid('save')} value={d.save_to || ''} onChange={(e) => set({ save_to: e.target.value })} className="field">
              <option value="">Não salvar no contato</option>
              <option value="contact.name">Nome do contato</option>
              <option value="contact.email">E-mail do contato</option>
              {customFields.map((f) => <option key={f.key} value={`contact.${f.key}`}>{f.name}</option>)}
            </select>
          </Field>
          <Field id={fid('var')} label="Guardar como variável" optional hint={d.variable ? `Use {{var.${d.variable}}} nas próximas etapas.` : 'Permite reutilizar a resposta em mensagens e condições.'}>
            <input id={fid('var')} type="text" placeholder="email" value={d.variable || ''} onChange={(e) => set({ variable: e.target.value.replace(/[^\w]/g, '_') })} className="field font-mono text-xs" />
          </Field>
          <Field id={fid('to')} label="Sem resposta após (minutos)" hint="Depois desse prazo, segue pela saída Sem resposta. Use 0 para esperar indefinidamente.">
            <input id={fid('to')} type="number" min={0} value={d.timeout_minutes ?? ''} onChange={(e) => set({ timeout_minutes: e.target.value === '' ? '' : Number(e.target.value) })} className="field tabular-nums" />
          </Field>
        </>
      )}

      {node.type === 'condition' && (
        <>
          <Field id={fid('field')} label="Se">
            <FieldPicker id={fid('field')} value={d.field} onChange={(v) => set({ field: v })} customFields={customFields} variables={variables} />
          </Field>
          <Field id={fid('op')} label="Operador">
            <select id={fid('op')} value={d.operator || 'equals'} onChange={(e) => set({ operator: e.target.value })} className="field">
              {CONDITION_OPERATORS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
          {!CONDITION_OPERATORS.find((o) => o.id === d.operator)?.noValue && (
            <Field
              id={fid('val')}
              label="Valor"
              hint={['in', 'contains_any'].includes(d.operator) ? 'Separe as opções por vírgula.' : 'A comparação ignora maiúsculas e espaços nas pontas.'}
            >
              <input id={fid('val')} type="text" value={d.value ?? ''} onChange={(e) => set({ value: e.target.value })} className="field" />
            </Field>
          )}
        </>
      )}

      {node.type === 'wait' && (
        <div>
          <p className="field-label">Aguardar</p>
          <div className="flex gap-2">
            <input
              aria-label="Quantidade"
              type="number"
              min={1}
              value={d.amount ?? ''}
              onChange={(e) => set({ amount: e.target.value === '' ? '' : Number(e.target.value) })}
              className="field w-24 tabular-nums"
            />
            <select aria-label="Unidade" value={d.unit || 'minutes'} onChange={(e) => set({ unit: e.target.value })} className="field flex-1">
              {WAIT_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500">A espera sobrevive a reinícios do servidor. Se um atendente assumir, ela é cancelada.</p>
        </div>
      )}

      {node.type === 'transfer_queue' && (
        <>
          <Field id={fid('queue')} label="Fila">
            {queues.length > 0 ? (
              <select id={fid('queue')} value={d.queue_id || ''} onChange={(e) => set({ queue_id: e.target.value })} className="field">
                <option value="">Selecione uma fila</option>
                {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </select>
            ) : (
              <p className="text-xs text-slate-500">Nenhuma fila criada. Crie filas em Filas & Triagem.</p>
            )}
          </Field>
          <Field id={fid('tmsg')} label="Mensagem ao transferir" optional>
            <TemplateArea id={fid('tmsg')} rows={2} value={d.message} onChange={(v) => set({ message: v })} variables={variables} placeholder="Vou te passar para um especialista." />
          </Field>
          <p className="text-[11.5px] leading-relaxed text-slate-500">A conversa é distribuída pela estratégia da fila. Sem uma próxima etapa conectada, o fluxo termina aqui.</p>
        </>
      )}

      {node.type === 'add_tag' && (
        <Field id={fid('tag')} label="Tag" hint="Se a tag não existir, ela é criada.">
          <input id={fid('tag')} type="text" list={fid('tags')} value={d.tag || ''} onChange={(e) => set({ tag: e.target.value })} className="field" />
          <datalist id={fid('tags')}>
            {tags.map((t) => <option key={t.id} value={t.name} />)}
          </datalist>
        </Field>
      )}

      {node.type === 'crm_move' && (
        <>
          {stages.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum funil no CRM ainda. Crie um funil com etapas no CRM.</p>
          ) : (
            <Field id={fid('stage')} label="Etapa do funil" hint="Move o card do contato nesse funil, ou cria um se ele não tiver.">
              <select
                id={fid('stage')}
                value={currentStage ? d.stage_id : ''}
                onChange={(e) => {
                  const st = stages.find((s) => s.id === e.target.value);
                  set({ stage_id: st?.id || '', stage_name: st?.name || '' });
                }}
                className="field"
              >
                <option value="">{d.stage_name && !currentStage ? `${d.stage_name} (por nome)` : 'Selecione'}</option>
                {pipelines.map((p) => (
                  <optgroup key={p.id} label={p.name}>
                    {stages.filter((s) => s.pipelineId === p.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
          )}
          <Field id={fid('cstatus')} label="Situação do card">
            <select id={fid('cstatus')} value={d.status || 'open'} onChange={(e) => set({ status: e.target.value })} className="field">
              <option value="open">Em aberto</option>
              <option value="won">Ganho</option>
              <option value="lost">Perdido</option>
            </select>
          </Field>
          <Field id={fid('ctitle')} label="Título do card novo" optional hint="Usado só quando o card é criado. Padrão: nome do contato.">
            <input id={fid('ctitle')} type="text" value={d.title || ''} onChange={(e) => set({ title: e.target.value })} className="field" placeholder="{{contact.name}} — Orçamento" />
          </Field>
          <Field id={fid('cval')} label="Valor (R$)" optional>
            <input id={fid('cval')} type="number" min={0} step="0.01" value={d.value ?? ''} onChange={(e) => set({ value: e.target.value })} className="field tabular-nums" />
          </Field>
        </>
      )}

      {node.type === 'webhook' && (
        <>
          <div className="flex gap-2">
            <div className="w-28">
              <Field id={fid('method')} label="Método">
                <select id={fid('method')} value={(d.method || 'POST').toUpperCase()} onChange={(e) => set({ method: e.target.value })} className="field">
                  {['POST', 'PUT', 'PATCH', 'GET'].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </div>
            <div className="flex-1 min-w-0">
              <Field id={fid('url')} label="URL">
                <input id={fid('url')} type="url" placeholder="https://" value={d.url || ''} onChange={(e) => set({ url: e.target.value.trim() })} className="field font-mono text-xs" />
              </Field>
            </div>
          </div>
          {(d.method || 'POST').toUpperCase() !== 'GET' && (
            <Field id={fid('body')} label="Corpo JSON" optional hint="Vazio envia contato, conversa, última resposta e variáveis. Aceita {{variáveis}}.">
              <textarea id={fid('body')} rows={5} value={d.body || ''} onChange={(e) => set({ body: e.target.value })} className="field font-mono text-xs resize-y" placeholder={'{\n  "telefone": "{{contact.phone}}"\n}'} />
            </Field>
          )}
          <p className="text-[11.5px] leading-relaxed text-slate-500">
            Respostas 4xx/5xx, erros de rede ou mais de 10 s seguem pela saída Falhou. O status fica em {'{{var.webhook_status}}'}. Endereços internos são bloqueados.
          </p>
        </>
      )}

      {node.type === 'ai_agent' && (
        <>
          <Field id={fid('prov')} label="Provedor">
            <select id={fid('prov')} value={d.provider || ''} onChange={(e) => set({ provider: e.target.value })} className="field">
              {AI_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.id && !configuredProviders.includes(p.id) ? ' — sem chave' : ''}
                </option>
              ))}
            </select>
          </Field>
          {configuredProviders.length === 0 && (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-xs text-amber-200">
              Nenhuma chave de IA cadastrada. Sem chave, o agente segue direto pela saída Transferir. Cadastre em Plano & IA.
            </p>
          )}
          <Field id={fid('model')} label="Modelo" optional>
            <input
              id={fid('model')}
              type="text"
              value={d.model || ''}
              onChange={(e) => set({ model: e.target.value.trim() })}
              placeholder={AI_PROVIDERS.find((p) => p.id === d.provider)?.model || 'Modelo salvo na chave'}
              className="field font-mono text-xs"
            />
          </Field>
          <Field id={fid('instr')} label="Instruções" hint="Descreva o negócio, o tom e quando transferir. O agente transfere sozinho quando não souber responder.">
            <TemplateArea id={fid('instr')} rows={7} value={d.instructions} onChange={(v) => set({ instructions: v })} variables={variables} placeholder="Você é a assistente da Clínica São Pedro. Responda sobre horários e convênios. Para marcar consulta, transfira." />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field id={fid('turns')} label="Máx. respostas">
              <input id={fid('turns')} type="number" min={1} max={50} value={d.max_turns ?? ''} onChange={(e) => set({ max_turns: e.target.value === '' ? '' : Number(e.target.value) })} className="field tabular-nums" />
            </Field>
            <Field id={fid('ato')} label="Inatividade (min)">
              <input id={fid('ato')} type="number" min={0} value={d.timeout_minutes ?? ''} onChange={(e) => set({ timeout_minutes: e.target.value === '' ? '' : Number(e.target.value) })} className="field tabular-nums" />
            </Field>
          </div>
          <p className="text-[11.5px] leading-relaxed text-slate-500">
            Concluído: atingiu o máximo de respostas ou o contato parou de responder. Transferir: o agente pediu um humano, recusou ou falhou.
          </p>
        </>
      )}

      {node.type === 'end' && (
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" checked={!!d.resolve} onChange={(e) => set({ resolve: e.target.checked })} className="mt-0.5 accent-[#7468bd]" />
          <span>
            <span className="block text-[13px] text-slate-200">Marcar a conversa como resolvida</span>
            <span className="block text-[11.5px] text-slate-500">Sem isso, a conversa continua aberta para a equipe.</span>
          </span>
        </label>
      )}
    </fieldset>
  );
};

export default NodeInspector;
