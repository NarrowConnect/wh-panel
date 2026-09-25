// API contract + tenant isolation check.
//
// Replays the payloads each page of web/ sends and verifies the responses,
// then registers a second company and checks it cannot read or change the
// first company's records by ID.
//
//   node scripts/contract-check.mjs                 # against http://localhost:8080
//   API_URL=https://painel.exemplo.com node scripts/contract-check.mjs
//
// Needs a running API with an empty or disposable database: it creates data.
const BASE = `${process.env.API_URL || 'http://localhost:8080'}/api/v1`;
const results = [];

const session = () => {
  let token = '';
  const call = async (label, method, path, body, { expect = [200, 201], raw = false } = {}) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {}
    const ok = expect.includes(res.status);
    results.push({ ok, label, status: res.status, note: ok ? '' : String(typeof data === 'string' ? data : JSON.stringify(data)).slice(0, 200) });
    return raw ? { status: res.status, data } : data;
  };
  return { call, setToken: (t) => (token = t) };
};
const check = (ok, label, note = '') => results.push({ ok: !!ok, label, status: '-', note: ok ? '' : String(note).slice(0, 200) });

const register = async (s, name) => {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const reg = await s.call(`auth.register ${name}`, 'POST', '/auth/register', {
    company_name: name, company_slug: `${name.toLowerCase()}-${stamp}`, admin_name: 'Admin',
    email: `admin-${stamp}@teste.com`, password: 'Senha1234',
  });
  s.setToken(reg.access_token);
  return reg;
};

// ---------------------------------------------------------------- company A
const A = session();
const call = A.call;
const reg = await register(A, 'EmpresaA');
await call('auth.me', 'GET', '/auth/me');

// Contacts
await call('custom-fields.create', 'POST', '/custom-fields', { name: 'Segmento', key: 'segmento', field_type: 'select', options: ['Varejo', 'Saúde'] });
await call('custom-fields.list', 'GET', '/custom-fields');
const c1 = await call('contacts.create', 'POST', '/contacts', { name: 'Maria Souza', phone: '+5511999990000', email: 'maria@x.com', custom_values: { segmento: 'Varejo' }, notes: 'nota' });
const c2 = await call('contacts.create2', 'POST', '/contacts', { name: 'Maria S. dup', phone: '+5511999990001', email: null, custom_values: {} });
const list = await call('contacts.list', 'GET', '/contacts?search=Maria&page=1&limit=50');
check(list?.total >= 2 && Array.isArray(list?.contacts), 'contacts.list shape', JSON.stringify(list));
await call('contacts.update', 'PUT', `/contacts/${c1.id}`, { name: 'Maria Souza', phone: '+5511999990000', email: 'maria@x.com', custom_values: { segmento: 'Saúde' } });
const c1b = await call('contacts.get', 'GET', `/contacts/${c1.id}`);
check(c1b?.custom_values?.segmento === 'Saúde', 'contacts.update persisted custom value', JSON.stringify(c1b?.custom_values));
await call('contacts.merge', 'POST', '/contacts/merge', { primary_contact_id: c1.id, secondary_contact_id: c2.id });
const afterMerge = await call('contacts.list after merge', 'GET', '/contacts?page=1&limit=50');
check(afterMerge?.total === 1, 'merged contact hidden from list', afterMerge?.total);

// Conversations
const conv = await call('conversations.create', 'POST', '/conversations', { contact_id: c1.id });
await call('conversations.list mine', 'GET', '/conversations?limit=100&assigned_to=me&status=open');
const all = await call('conversations.list all', 'GET', '/conversations?limit=100&assigned_to=all&status=all&search=Maria');
check(all?.conversations?.[0]?.contact?.name === 'Maria Souza', 'conversations.list includes contact', JSON.stringify(all?.conversations?.[0]));
await call('conversations.360', 'GET', `/conversations/${conv.id}`);
await call('messages.send', 'POST', `/conversations/${conv.id}/messages`, { body: 'Olá', message_type: 'text', is_internal: false });
await call('messages.whisper', 'POST', `/conversations/${conv.id}/messages`, { body: 'nota', message_type: 'text', is_internal: true });
await call('messages.list', 'GET', `/conversations/${conv.id}/messages`);
await call('conversations.status', 'PATCH', `/conversations/${conv.id}/status`, { status: 'resolved' });
await call('conversations.reopen', 'PATCH', `/conversations/${conv.id}/status`, { status: 'open' });
await call('conversations.status invalid', 'PATCH', `/conversations/${conv.id}/status`, { status: 'xyz' }, { expect: [400] });
await call('conversations.assign', 'PATCH', `/conversations/${conv.id}/assign`, { user_id: reg.user.id });
await call('tags.attach', 'POST', `/conversations/${conv.id}/tags`, { name: 'vip' });
const conv360 = await call('conversations.360 tags', 'GET', `/conversations/${conv.id}`);
const tag = conv360?.tags?.[0];
check(tag, 'conversation tags returned', JSON.stringify(conv360?.tags));
const withPreview = await call('conversations.preview', 'GET', '/conversations?limit=100&assigned_to=all&status=all');
check(withPreview?.conversations?.some((c) => c.last_message_preview === 'Olá'), 'inbox preview is last public message', JSON.stringify(withPreview?.conversations?.map((c) => c.last_message_preview)));

// CRM
const pipe = await call('crm.pipeline.create', 'POST', '/crm/pipelines', { name: 'Vendas', is_default: true });
await call('crm.pipelines', 'GET', '/crm/pipelines');
const st1 = await call('crm.stage.create', 'POST', `/crm/pipelines/${pipe.id}/stages`, { name: 'Novo', color: '#7468bd', order_index: 1 });
const st2 = await call('crm.stage.create2', 'POST', `/crm/pipelines/${pipe.id}/stages`, { name: 'Proposta', color: '#7468bd', order_index: 2 });
await call('crm.field.create', 'POST', '/crm/custom-fields', { name: 'Origem', field_type: 'select', options: ['Site', 'Instagram'] });
const crmFields = await call('crm.fields', 'GET', `/crm/custom-fields?pipeline_id=${pipe.id}`);
const card = await call('crm.card.create', 'POST', '/crm/cards', { pipeline_id: pipe.id, stage_id: st1.id, title: 'Plano anual', value: 1200, contact_name: 'Lead Novo', contact_phone: '+5511988887777', custom_values: { [crmFields?.[0]?.key || 'origem']: 'Site' } });
const board = await call('crm.kanban', 'GET', `/crm/pipelines/${pipe.id}/kanban`);
check(board?.find((s) => s.id === st1.id)?.cards?.[0]?.contact?.name === 'Lead Novo', 'crm.kanban has card with contact', JSON.stringify(board?.find((s) => s.id === st1.id)));
await call('crm.card.move', 'PATCH', `/crm/cards/${card.id}/move`, { stage_id: st2.id, status: 'won' });
await call('crm.card.fields', 'PATCH', `/crm/cards/${card.id}`, { custom_values: { origem: 'Instagram' } });
await call('crm.cards by contact', 'GET', `/crm/cards?contact_id=${c1.id}&status=open`);
const cardDup = await call('crm.card reuse contact', 'POST', '/crm/cards', { pipeline_id: pipe.id, stage_id: st1.id, title: 'Dup', value: 1, contact_name: 'Outro nome', contact_phone: '5511999990000' });
check(cardDup?.contact_id === c1.id, 'crm card links existing contact by phone', `${cardDup?.contact_id} vs ${c1.id}`);

// Queues
const q = await call('queues.create', 'POST', '/queues', { name: 'Comercial', allocation_strategy: 'least_busy' });
const qs = await call('queues.list', 'GET', '/queues');
check(qs?.[0]?.allocation_strategy === 'least_busy', 'queue strategy persisted', qs?.[0]?.allocation_strategy);
const rule = await call('queues.rule.create', 'POST', `/queues/${q.id}/rules`, { priority: 1, condition_type: 'tag', condition_key: null, condition_operator: 'equals', condition_value: 'vip' });
await call('queues.rules', 'GET', `/queues/${q.id}/rules`);
await call('queues.rule.delete', 'DELETE', `/queues/rules/${rule.id}`);
await call('queues.add user', 'POST', `/queues/${q.id}/users`, { user_id: reg.user.id, queue_role: 'operator' });

// Flows
const flowDef = {
  nodes: [
    { id: 'start', type: 'trigger', title: 'Início', data: { trigger: 'new_conversation' }, position: { x: 0, y: 0 } },
    { id: 'n1', type: 'send_message', title: 'Oi', data: { message: 'Olá' }, position: { x: 0, y: 120 } },
    { id: 'n2', type: 'transfer_queue', title: 'T', data: { queue_id: q.id }, position: { x: 0, y: 240 } },
  ],
  edges: [
    { id: 'e0', source: 'start', target: 'n1' },
    { id: 'e1', source: 'n1', target: 'n2' },
  ],
};
const flow = await call('flows.create', 'POST', '/flows', { name: 'Triagem', description: null, definition: flowDef });
await call('flows.list', 'GET', '/flows');
await call('flows.update', 'PUT', `/flows/${flow.id}`, { name: 'Triagem', description: '', status: 'active', definition: flowDef });
const f2 = await call('flows.get', 'GET', `/flows/${flow.id}`);
const f2def = JSON.parse(f2?.definition_json || '{}');
check(f2def.edges?.length === 2 && f2?.status === 'active' && f2def.nodes?.[1]?.title === 'Oi', 'flow definition, titles and status persisted', f2?.definition_json);
await call('flows.toggle (no definition)', 'PUT', `/flows/${flow.id}`, { name: 'Triagem', description: '', status: 'inactive' });
const f3 = await call('flows.get2', 'GET', `/flows/${flow.id}`);
check((JSON.parse(f3?.definition_json || '{}').nodes || []).length === 3, 'toggle keeps definition', f3?.definition_json);

// Campaigns (no official channel: create ok, start must fail with a readable error)
const tagList = await call('tags.list', 'GET', '/tags');
const camp = await call('campaigns.create', 'POST', '/campaigns', { name: 'Teste', channel_id: null, template_id: null, rate_limit_per_minute: 60, tag_id: tagList?.[0]?.id });
await call('campaigns.list', 'GET', '/campaigns');
const start = await call('campaigns.start (expect error)', 'POST', `/campaigns/${camp.id}/start`, null, { expect: [400, 500], raw: true });
check(typeof start?.data?.error === 'string', 'campaign start error is readable', JSON.stringify(start?.data));
await call('campaigns.cancel', 'POST', `/campaigns/${camp.id}/cancel`);
if (tag) await call('tags.detach', 'DELETE', `/conversations/${conv.id}/tags/${tag.id}`);

// Integrations
const hook = await call('webhooks.create', 'POST', '/webhooks-subscriptions', { name: 'n8n', event_type: 'conversation.created', target_url: 'https://example.com/hook', secret_token: null });
await call('webhooks.list', 'GET', '/webhooks-subscriptions');
await call('webhooks.delete', 'DELETE', `/webhooks-subscriptions/${hook.id}`);
const tf = await call('integrations.transform-test', 'POST', '/integrations/transform-test', { script: '{"nome":"payload.name","x":"fixo"}', payload: { name: 'Maria' } });
check(tf?.output?.nome === 'Maria', 'transform mapping works', JSON.stringify(tf));

// Billing
await call('billing.subscription', 'GET', '/billing/subscription');
const ai = await call('billing.ai.save', 'POST', '/billing/ai-providers', { provider: 'openai', api_key: 'sk-test', model_name: '' });
await call('billing.ai.list', 'GET', '/billing/ai-providers');
await call('billing.ai.delete', 'DELETE', `/billing/ai-providers/${ai.id}`);
await call('company.users', 'GET', '/companies/me/users');

// Dashboard / reports
const d = new Date().toISOString().slice(0, 10);
for (const p of ['kpis', 'channels-volume', 'attendants-performance', 'funnel']) await call(`dashboard.${p}`, 'GET', `/dashboard/${p}?start_date=${d}`);
await call('reports.conversations', 'GET', `/reports/conversations?start_date=${d}`);
await call('reports.csv', 'GET', `/reports/conversations/export/csv?start_date=${d}`);
await call('reports.attendants.csv', 'GET', '/reports/attendants/export/csv');

// Templates / channels
await call('templates.list', 'GET', '/templates');
await call('templates.create draft', 'POST', '/templates', { name: 'teste_rascunho', category: 'UTILITY', language: 'pt_BR', components: [{ type: 'BODY', text: 'Olá, tudo bem?' }], submit_meta: false });
await call('channels.list', 'GET', '/channels');

// ------------------------------------------------- company B (isolation)
const B = session();
const regB = await register(B, 'EmpresaB');
const b = B.call;
const notFound = [403, 404, 400];
const bContacts = await b('B contacts.list', 'GET', '/contacts?page=1&limit=100');
check(bContacts?.total === 0, 'B sees none of A contacts', JSON.stringify(bContacts));
await b('B contacts.get A', 'GET', `/contacts/${c1.id}`, null, { expect: notFound });
await b('B contacts.update A', 'PUT', `/contacts/${c1.id}`, { name: 'hijack' }, { expect: notFound });
await b('B conversations.360 A', 'GET', `/conversations/${conv.id}`, null, { expect: notFound });
const bMsgs = await b('B messages.list A', 'GET', `/conversations/${conv.id}/messages`, null, { expect: [200, ...notFound] });
check(!(bMsgs?.messages || []).length, 'B cannot read A messages', JSON.stringify(bMsgs));
await b('B messages.send A', 'POST', `/conversations/${conv.id}/messages`, { body: 'x', message_type: 'text', is_internal: true }, { expect: notFound });
await b('B conversations.status A', 'PATCH', `/conversations/${conv.id}/status`, { status: 'resolved' }, { expect: [...notFound, 500] });
await b('B tags.detach A', 'DELETE', `/conversations/${conv.id}/tags/${tag?.id}`, null, { expect: notFound });
await b('B crm.kanban A', 'GET', `/crm/pipelines/${pipe.id}/kanban`, null, { expect: [200, ...notFound] }).then((r) => check(!(Array.isArray(r) && r.some((s) => (s.cards || []).length)), 'B kanban of A pipeline is empty', JSON.stringify(r)));
await b('B crm.card.move A', 'PATCH', `/crm/cards/${card.id}/move`, { stage_id: st1.id, status: 'open' }, { expect: [...notFound, 500] });
await b('B queues.rule on A queue', 'POST', `/queues/${q.id}/rules`, { priority: 1, condition_type: 'tag', condition_value: 'x' }, { expect: notFound });
await b('B queue add user to A queue', 'POST', `/queues/${q.id}/users`, { user_id: regB.user.id }, { expect: notFound });
const bQueueB = await b('B queues.create', 'POST', '/queues', { name: 'Fila B', allocation_strategy: 'round_robin' });
await b('B adds A user to own queue', 'POST', `/queues/${bQueueB.id}/users`, { user_id: reg.user.id }, { expect: notFound });
const bCamp = await b('B campaign with A contacts', 'POST', '/campaigns', { name: 'x', contact_ids: [c1.id] });
const bRec = await b('B campaign recipients', 'GET', `/campaigns/${bCamp.id}/recipients`);
check(Array.isArray(bRec) && bRec.length === 0, 'B campaign cannot target A contacts', JSON.stringify(bRec));
await b('B flows.get A', 'GET', `/flows/${flow.id}`, null, { expect: notFound });
const bFlows = await b('B flows.list', 'GET', '/flows');
check(Array.isArray(bFlows) && bFlows.length === 0, 'B sees none of A flows', JSON.stringify(bFlows));
await b('B flows.update A', 'PUT', `/flows/${flow.id}`, { name: 'x', status: 'inactive' }, { expect: notFound });
const aFlowAfter = await call('A flow unchanged by B', 'GET', `/flows/${flow.id}`);
check(aFlowAfter?.name === 'Triagem', 'A flow not modified by B', aFlowAfter?.name);
const aContactAfter = await call('A contact unchanged by B', 'GET', `/contacts/${c1.id}`);
check(aContactAfter?.name === 'Maria Souza', 'A contact not modified by B', aContactAfter?.name);

for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${String(r.status).padEnd(4)} ${r.label}${r.note ? '  -> ' + r.note : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed} falhas de ${results.length}`);
process.exitCode = failed ? 1 : 0;
