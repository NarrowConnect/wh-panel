import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  Lock,
  Bot,
  CheckCheck,
  Check,
  Clock,
  Tag,
  Kanban,
  CheckCircle2,
  RotateCcw,
  PanelRightOpen,
  PanelRightClose,
  FileText,
  UserPlus,
  X,
  Loader2,
  AlertTriangle,
  ArrowLeft,
} from 'lucide-react';
import ApiClient from '../api/client';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';

const WINDOW_MS = 24 * 60 * 60 * 1000;

const statusLabels = { open: 'Aberta', pending: 'Pendente', resolved: 'Resolvida' };
const statusCls = {
  open: 'text-sky-300',
  pending: 'text-amber-300',
  resolved: 'text-emerald-300',
};

const isOfficialType = (type) => type === 'whatsapp_meta' || type === 'whatsapp_official';
const channelKind = (ch) => {
  if (!ch) return null;
  if (isOfficialType(ch.type)) return { label: 'Oficial', cls: 'text-emerald-300 border-emerald-500/25' };
  if (ch.type === 'whatsapp_qr') return { label: 'QR', cls: 'text-amber-300 border-amber-500/25' };
  return { label: 'Webchat', cls: 'text-slate-300 border-white/[0.1]' };
};

const nameOf = (conv) => conv?.contact?.name || conv?.contact_name || conv?.contact?.phone || 'Contato sem nome';
const phoneOf = (conv) => conv?.contact?.phone || conv?.contact_phone || '';
const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

const listTimeOf = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return timeOf(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const templateBody = (tmpl) => {
  try {
    const comps = typeof tmpl.components_json === 'string' ? JSON.parse(tmpl.components_json) : tmpl.components_json;
    return comps?.find((c) => c.type === 'BODY')?.text || tmpl.name;
  } catch {
    return tmpl.name;
  }
};

const MessageStatus = ({ status }) => {
  if (status === 'failed') return <span className="text-rose-200">Falha no envio</span>;
  if (status === 'pending') return <Clock aria-label="Aguardando envio" className="w-3.5 h-3.5" />;
  if (status === 'delivered' || status === 'read') {
    return <CheckCheck aria-label={status === 'read' ? 'Lida' : 'Entregue'} className={`w-3.5 h-3.5 ${status === 'read' ? 'text-sky-200' : ''}`} />;
  }
  return <Check aria-label="Enviada" className="w-3.5 h-3.5" />;
};

export const Conversations = () => {
  const { user } = useAuth();
  const { subscribe, emit } = useWebSocket();

  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const messageStatuses = useRef(new Map());
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [channels, setChannels] = useState({});

  const [filterTab, setFilterTab] = useState('mine');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [inputMode, setInputMode] = useState('message'); // 'message' | 'whisper'
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState('');

  const [showDrawer, setShowDrawer] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1280);
  const [details, setDetails] = useState(null);
  const [crmCard, setCrmCard] = useState(null);
  const [newTagInput, setNewTagInput] = useState('');
  const [templates, setTemplates] = useState([]);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);

  const messagesEndRef = useRef(null);
  const selectedIdRef = useRef(null);

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Debounced server-side search.
  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInput.trim()), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  const fetchConversations = async () => {
    try {
      const params = { limit: 100 };
      if (filterTab === 'mine') Object.assign(params, { assigned_to: 'me', status: 'open' });
      else if (filterTab === 'unassigned') Object.assign(params, { assigned_to: 'unassigned', status: 'open' });
      else if (filterTab === 'all') Object.assign(params, { assigned_to: 'all', status: 'all' });
      else if (filterTab === 'resolved') params.status = 'resolved';
      if (searchQuery) params.search = searchQuery;

      const data = await ApiClient.get('/conversations', params);
      const list = Array.isArray(data) ? data : data?.conversations || [];
      setConversations(list);
      setListError('');
      // On phones the list and the thread share the screen, so don't jump into a thread.
      if (!selectedIdRef.current && list.length > 0 && window.innerWidth >= 768) selectConversation(list[0]);
    } catch (err) {
      setListError(err.message || 'Não foi possível carregar as conversas.');
    } finally {
      setLoading(false);
    }
  };

  const selectConversation = async (conv) => {
    selectedIdRef.current = conv.id;
    setSelectedConv(conv);
    setMessagesLoading(true);
    setChatError('');
    setDetails(null);
    setCrmCard(null);
    try {
      const [msgs, full, cards] = await Promise.all([
        ApiClient.get(`/conversations/${conv.id}/messages`),
        ApiClient.get(`/conversations/${conv.id}`).catch(() => null),
        conv.contact_id ? ApiClient.get('/crm/cards', { contact_id: conv.contact_id, status: 'open' }).catch(() => null) : null,
      ]);
      if (selectedIdRef.current !== conv.id) return;
      setMessages(Array.isArray(msgs) ? msgs : msgs?.messages || []);
      setDetails(full);
      const cardList = Array.isArray(cards) ? cards : cards?.cards || [];
      setCrmCard(cardList[0] || null);
      setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, unread_count: 0 } : c)));
    } catch (err) {
      if (selectedIdRef.current === conv.id) {
        setMessages([]);
        setChatError(err.message || 'Não foi possível carregar as mensagens.');
      }
    } finally {
      if (selectedIdRef.current === conv.id) {
        setMessagesLoading(false);
        setTimeout(() => scrollToBottom('auto'), 50);
      }
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [filterTab, searchQuery]);

  // List-shaping events (new conversation, assignment, status) refetch the
  // current filter; bursts are coalesced into one request.
  const fetchRef = useRef(fetchConversations);
  fetchRef.current = fetchConversations;
  const refetchTimer = useRef(null);
  const scheduleRefetch = () => {
    clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => fetchRef.current(), 400);
  };

  useEffect(() => {
    const offs = ['conversation_created', 'assigned_changed', 'status_changed'].map((evt) => subscribe(evt, scheduleRefetch));
    return () => {
      offs.forEach((off) => off());
      clearTimeout(refetchTimer.current);
    };
  }, [subscribe]);

  useEffect(() => {
    ApiClient.get('/channels')
      .then((d) => {
        const list = Array.isArray(d) ? d : d?.channels || [];
        setChannels(Object.fromEntries(list.map((c) => [c.id, c])));
      })
      .catch(() => {});
    ApiClient.get('/templates')
      .then((d) => setTemplates((Array.isArray(d) ? d : d?.templates || []).filter((t) => String(t.status).toLowerCase() === 'approved')))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const offMessage = subscribe('new_message', (payload) => {
      if (!payload) return;
      if (payload.conversation_id === selectedConv?.id) {
        setMessages((prev) =>
          prev.some((m) => m.id === payload.id) ? prev : [...prev, { ...payload, status: messageStatuses.current.get(payload.id) || payload.status }]
        );
        setTimeout(scrollToBottom, 50);
      }
      setConversations((prev) => {
        if (!prev.some((c) => c.id === payload.conversation_id)) {
          scheduleRefetch();
          return prev;
        }
        return prev.map((c) =>
          c.id === payload.conversation_id
            ? {
                ...c,
                last_message_preview: payload.is_internal ? c.last_message_preview : payload.body,
                last_message_at: payload.created_at || new Date().toISOString(),
                unread_count: c.id === selectedConv?.id || payload.sender_type !== 'contact' ? c.unread_count : (c.unread_count || 0) + 1,
              }
            : c
        ).sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
      });
    });
    const offStatus = subscribe('message_status', (payload) => {
      if (payload?.conversation_id !== selectedConv?.id) return;
      messageStatuses.current.set(payload.id, payload.status);
      setMessages((prev) => prev.map((m) => (m.id === payload.id ? { ...m, status: payload.status } : m)));
    });
    return () => {
      offMessage();
      offStatus();
    };
  }, [selectedConv, subscribe]);

  const channel = selectedConv ? channels[selectedConv.channel_id] : null;
  const isOfficial = isOfficialType(channel?.type);
  const lastInbound = [...messages].reverse().find((m) => m.sender_type === 'contact' && !m.is_internal);
  const windowEndsAt = lastInbound?.created_at ? new Date(lastInbound.created_at).getTime() + WINDOW_MS : null;
  const windowOpen = windowEndsAt ? windowEndsAt > Date.now() : false;
  const freeTextBlocked = isOfficial && !windowOpen && inputMode === 'message';
  const hoursLeft = windowEndsAt ? Math.max(0, Math.floor((windowEndsAt - Date.now()) / 3600000)) : 0;

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!messageText.trim() || !selectedConv || freeTextBlocked) return;
    setSending(true);
    setChatError('');
    try {
      const isWhisper = inputMode === 'whisper';
      const newMsg = await ApiClient.post(`/conversations/${selectedConv.id}/messages`, {
        body: messageText.trim(),
        message_type: 'text',
        is_internal: isWhisper,
      });
      setMessages((prev) =>
        prev.some((m) => m.id === newMsg.id) ? prev : [...prev, { ...newMsg, status: messageStatuses.current.get(newMsg.id) || newMsg.status }]
      );
      setMessageText('');
      setTimeout(scrollToBottom, 50);
      emit('message_sent', { conversation_id: selectedConv.id, message: newMsg });
    } catch (err) {
      setChatError(err.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  };

  const updateConv = (id, patch) => {
    setSelectedConv((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const handleStatusChange = async (newStatus) => {
    if (!selectedConv) return;
    setChatError('');
    try {
      await ApiClient.patch(`/conversations/${selectedConv.id}/status`, { status: newStatus });
      updateConv(selectedConv.id, { status: newStatus });
    } catch (err) {
      setChatError(err.message || 'Não foi possível atualizar o status.');
    }
  };

  const handleAssignToMe = async () => {
    if (!selectedConv || !user?.id) return;
    setChatError('');
    try {
      await ApiClient.patch(`/conversations/${selectedConv.id}/assign`, { user_id: user.id });
      updateConv(selectedConv.id, { assigned_user_id: user.id, assigned_user: { id: user.id, name: user.name } });
    } catch (err) {
      setChatError(err.message || 'Não foi possível assumir a conversa.');
    }
  };

  const handleAddTag = async (e) => {
    e.preventDefault();
    const name = newTagInput.trim();
    if (!name || !selectedConv) return;
    try {
      await ApiClient.post(`/conversations/${selectedConv.id}/tags`, { name });
      const full = await ApiClient.get(`/conversations/${selectedConv.id}`);
      setDetails(full);
      setNewTagInput('');
    } catch (err) {
      setChatError(err.message || 'Não foi possível adicionar a tag.');
    }
  };

  const handleRemoveTag = async (tag) => {
    try {
      await ApiClient.delete(`/conversations/${selectedConv.id}/tags/${tag.id}`);
      setDetails((prev) => ({ ...prev, tags: (prev?.tags || []).filter((t) => t.id !== tag.id) }));
    } catch (err) {
      setChatError(err.message || 'Não foi possível remover a tag.');
    }
  };

  const assignedName = selectedConv?.assigned_user?.name || selectedConv?.assigned_user_name || '';
  const isUnassigned = selectedConv && !selectedConv.assigned_user_id;
  const kind = channelKind(channel);

  return (
    <div className="h-full flex overflow-hidden">
      {/* Conversation list */}
      <aside
        className={`w-full md:w-80 xl:w-96 flex-col md:border-r border-white/[0.06] flex-shrink-0 ${selectedConv ? 'hidden md:flex' : 'flex'}`}
        aria-label="Lista de conversas"
      >
        <div className="p-3 space-y-2.5 border-b border-white/[0.06]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.75} />
            <input
              type="search"
              aria-label="Buscar conversas"
              placeholder="Buscar por nome, telefone ou e-mail"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="field h-8 pl-8"
            />
          </div>
          <div className="segmented w-full overflow-x-auto" role="group" aria-label="Filtro">
            {[
              ['mine', 'Minhas'],
              ['unassigned', 'Sem atendente'],
              ['all', 'Todas'],
              ['resolved', 'Resolvidas'],
            ].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={filterTab === id} onClick={() => setFilterTab(id)} className="flex-1 justify-center px-1.5">
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-5 h-5 text-slate-500 animate-spin" aria-label="Carregando" />
            </div>
          ) : listError ? (
            <p role="alert" className="m-3 alert-error">{listError}</p>
          ) : conversations.length === 0 ? (
            <p className="px-6 py-12 text-center text-[13px] text-slate-500">
              {searchQuery
                ? `Nenhuma conversa encontrada para "${searchQuery}".`
                : filterTab === 'mine'
                  ? 'Nenhuma conversa aberta atribuída a você.'
                  : filterTab === 'unassigned'
                    ? 'Nenhuma conversa aguardando atendente.'
                    : 'Nenhuma conversa aqui.'}
            </p>
          ) : (
            <ul>
              {conversations.map((conv) => {
                const isSelected = selectedConv?.id === conv.id;
                const k = channelKind(channels[conv.channel_id]);
                const unread = !isSelected && conv.unread_count > 0;
                return (
                  <li key={conv.id}>
                    <button
                      type="button"
                      onClick={() => selectConversation(conv)}
                      aria-current={isSelected ? 'true' : undefined}
                      className={`w-full text-left px-3 py-3 flex items-start gap-3 border-b border-white/[0.04] transition-colors ${
                        isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.025]'
                      }`}
                    >
                      <span className="w-8 h-8 rounded-md bg-white/[0.06] text-slate-200 text-xs font-medium flex items-center justify-center flex-shrink-0">
                        {nameOf(conv).charAt(0).toUpperCase()}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`text-[13px] truncate ${unread ? 'text-white font-medium' : 'text-slate-100'}`}>{nameOf(conv)}</span>
                          <span className={`text-[11px] tabular-nums flex-shrink-0 ${unread ? 'text-accent-300' : 'text-slate-500'}`}>{listTimeOf(conv.last_message_at)}</span>
                        </span>
                        <span className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs truncate flex-1 ${unread ? 'text-slate-300' : 'text-slate-500'}`}>
                            {conv.last_message_preview || phoneOf(conv) || 'Sem mensagens'}
                          </span>
                          {unread && (
                            <span className="min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-accent-500 text-white text-[10px] font-medium flex items-center justify-center tabular-nums">
                              {conv.unread_count}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1.5 mt-1.5 text-[11px]">
                          {k && <span className={`px-1 h-4 inline-flex items-center rounded border ${k.cls}`}>{k.label}</span>}
                          <span className={statusCls[conv.status] || 'text-slate-400'}>{statusLabels[conv.status] || conv.status}</span>
                          {conv.assigned_user?.name && filterTab !== 'mine' && (
                            <span className="text-slate-500 truncate">· {conv.assigned_user.name}</span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Thread */}
      <section className={`flex-1 flex-col min-w-0 ${selectedConv ? 'flex' : 'hidden md:flex'}`} aria-label="Conversa">
        {selectedConv ? (
          <>
            <header className="h-14 px-4 border-b border-white/[0.06] flex items-center justify-between gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  selectedIdRef.current = null;
                  setSelectedConv(null);
                }}
                className="btn btn-icon -ml-2 text-slate-400 hover:text-white md:hidden"
                aria-label="Voltar para a lista"
              >
                <ArrowLeft strokeWidth={1.75} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-medium text-white truncate">{nameOf(selectedConv)}</h2>
                  {kind && <span className={`px-1.5 h-5 inline-flex items-center rounded-md border text-[11px] ${kind.cls}`}>{kind.label}</span>}
                </div>
                <p className="text-xs text-slate-500 truncate tabular-nums">
                  {[phoneOf(selectedConv), channel?.name, assignedName ? `com ${assignedName}` : 'sem atendente'].filter(Boolean).join(' · ')}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {isUnassigned && selectedConv.status !== 'resolved' && (
                  <button type="button" onClick={handleAssignToMe} className="btn btn-secondary">
                    <UserPlus strokeWidth={1.75} />
                    Assumir
                  </button>
                )}
                {selectedConv.status === 'resolved' ? (
                  <button type="button" onClick={() => handleStatusChange('open')} className="btn btn-secondary">
                    <RotateCcw strokeWidth={1.75} />
                    Reabrir
                  </button>
                ) : (
                  <button type="button" onClick={() => handleStatusChange('resolved')} className="btn btn-primary" aria-label="Resolver conversa">
                    <CheckCircle2 strokeWidth={1.75} />
                    <span className="hidden sm:inline">Resolver</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDrawer(!showDrawer)}
                  className="btn btn-secondary btn-icon"
                  aria-pressed={showDrawer}
                  aria-label={showDrawer ? 'Ocultar detalhes do contato' : 'Mostrar detalhes do contato'}
                  title="Detalhes do contato"
                >
                  {showDrawer ? <PanelRightClose strokeWidth={1.75} /> : <PanelRightOpen strokeWidth={1.75} />}
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
              {messagesLoading ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-5 h-5 text-slate-500 animate-spin" aria-label="Carregando mensagens" />
                </div>
              ) : messages.length === 0 ? (
                <p className="py-12 text-center text-[13px] text-slate-500">Nenhuma mensagem nesta conversa ainda.</p>
              ) : (
                messages.map((msg, idx) => {
                  const isOutbound = msg.sender_type === 'user' || msg.sender_type === 'bot';
                  if (msg.is_internal) {
                    return (
                      <div key={msg.id || idx} className="max-w-xl mx-auto whisper-bg px-3 py-2 rounded-lg">
                        <p className="flex items-center gap-1.5 text-[11px] text-amber-300 mb-1">
                          <Lock className="w-3 h-3" strokeWidth={1.75} />
                          Nota interna · só a equipe vê
                        </p>
                        <p className="text-[13px] text-amber-100/90 whitespace-pre-wrap">{msg.body}</p>
                        <p className="text-[11px] text-amber-300/60 text-right mt-1 tabular-nums">{timeOf(msg.created_at)}</p>
                      </div>
                    );
                  }
                  return (
                    <div key={msg.id || idx} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[34rem] rounded-xl px-3 py-2 ${
                          isOutbound ? 'bg-accent-600 text-white rounded-br-sm' : 'bg-white/[0.05] text-slate-100 rounded-bl-sm'
                        }`}
                      >
                        {msg.sender_type === 'bot' && (
                          <p className="flex items-center gap-1 text-[11px] text-white/70 mb-0.5">
                            <Bot className="w-3 h-3" strokeWidth={1.75} />
                            Automação
                          </p>
                        )}
                        <p className="text-[13px] whitespace-pre-wrap leading-relaxed break-words">{msg.body}</p>
                        <p className={`flex items-center justify-end gap-1 text-[11px] mt-0.5 tabular-nums ${isOutbound ? 'text-white/70' : 'text-slate-500'}`}>
                          {timeOf(msg.created_at)}
                          {isOutbound && <MessageStatus status={msg.status} />}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="border-t border-white/[0.06] p-3 space-y-2">
              {isOfficial && inputMode === 'message' && (
                windowOpen ? (
                  <p className="text-xs text-slate-500">
                    Janela de 24h aberta · {hoursLeft < 1 ? 'menos de 1 hora restante' : `${hoursLeft}h restantes`}
                  </p>
                ) : (
                  <p className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] text-xs text-amber-100/90">
                    <AlertTriangle className="w-3.5 h-3.5 mt-px text-amber-300 flex-shrink-0" strokeWidth={1.75} />
                    <span>
                      {lastInbound ? 'A janela de 24h desde a última mensagem do contato fechou.' : 'O contato ainda não escreveu nesta conversa.'} A Meta só entrega mensagens livres
                      dentro da janela; para retomar o contato, use um template aprovado em uma campanha.
                    </span>
                  </p>
                )
              )}
              {chatError && <p role="alert" className="text-xs text-rose-300">{chatError}</p>}

              <div className="flex items-center justify-between gap-2">
                <div className="segmented" role="group" aria-label="Tipo de mensagem">
                  <button type="button" aria-pressed={inputMode === 'message'} onClick={() => setInputMode('message')}>
                    <Send strokeWidth={1.75} />
                    Mensagem
                  </button>
                  <button type="button" aria-pressed={inputMode === 'whisper'} onClick={() => setInputMode('whisper')}>
                    <Lock strokeWidth={1.75} />
                    Nota interna
                  </button>
                </div>
                {inputMode === 'message' && templates.length > 0 && !freeTextBlocked && (
                  <button type="button" onClick={() => setShowTemplatesModal(true)} className="btn text-slate-400 hover:text-white">
                    <FileText strokeWidth={1.75} />
                    Inserir texto de template
                  </button>
                )}
              </div>

              <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                <textarea
                  rows={2}
                  aria-label={inputMode === 'whisper' ? 'Nota interna' : 'Mensagem'}
                  value={messageText}
                  disabled={freeTextBlocked}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={
                    freeTextBlocked
                      ? 'Mensagens livres indisponíveis fora da janela de 24h'
                      : inputMode === 'whisper'
                        ? 'Nota visível só para a equipe'
                        : 'Mensagem para o contato · Enter envia, Shift+Enter quebra linha'
                  }
                  className={`field flex-1 resize-none disabled:opacity-60 ${inputMode === 'whisper' ? 'border-amber-500/30 focus:border-amber-400 bg-amber-500/[0.04]' : ''}`}
                />
                <button
                  type="submit"
                  disabled={sending || !messageText.trim() || freeTextBlocked}
                  className="btn btn-primary btn-icon h-[3.75rem] w-10"
                  aria-label={inputMode === 'whisper' ? 'Salvar nota' : 'Enviar mensagem'}
                >
                  {sending ? <Loader2 className="animate-spin" /> : <Send strokeWidth={1.75} />}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-2">
            <MessageSquare className="w-5 h-5 text-slate-500" strokeWidth={1.75} />
            <h2 className="text-sm font-medium text-white">Nenhuma conversa selecionada</h2>
            <p className="text-[13px] text-slate-400 max-w-xs">Escolha uma conversa na lista para ver o histórico e responder.</p>
          </div>
        )}
      </section>

      {/* Contact details */}
      {showDrawer && selectedConv && (
        <aside className="w-72 border-l border-white/[0.06] flex flex-col overflow-y-auto flex-shrink-0" aria-label="Detalhes do contato">
          <div className="p-4 border-b border-white/[0.06]">
            <p className="text-[13px] font-medium text-white">{nameOf(details || selectedConv)}</p>
            <p className="text-xs text-slate-400 tabular-nums">{phoneOf(details || selectedConv) || 'Sem telefone'}</p>
            {details?.contact?.email && <p className="text-xs text-slate-400 truncate">{details.contact.email}</p>}
          </div>

          <div className="p-4 border-b border-white/[0.06] space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs text-slate-400">
              <Kanban className="w-3.5 h-3.5" strokeWidth={1.75} />
              Oportunidade no CRM
            </h3>
            {crmCard ? (
              <div className="text-[13px]">
                <p className="text-slate-100 truncate">{crmCard.title}</p>
                <p className="text-xs text-slate-400 tabular-nums">
                  {(crmCard.value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  {crmCard.stage_name && ` · ${crmCard.stage_name}`}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Nenhuma oportunidade aberta para este contato.</p>
            )}
          </div>

          {details?.contact?.custom_values && Object.keys(details.contact.custom_values).length > 0 && (
            <div className="p-4 border-b border-white/[0.06] space-y-2">
              <h3 className="text-xs text-slate-400">Campos</h3>
              <dl className="space-y-1.5 text-xs">
                {Object.entries(details.contact.custom_values).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-slate-500 truncate">{k}</dt>
                    <dd className="text-slate-200 truncate text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div className="p-4 space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs text-slate-400">
              <Tag className="w-3.5 h-3.5" strokeWidth={1.75} />
              Tags da conversa
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {(details?.tags || []).length > 0 ? (
                details.tags.map((tag) => (
                  <span key={tag.id} className="inline-flex items-center gap-1 pl-2 pr-1 h-6 rounded-md bg-white/[0.05] text-xs text-slate-200">
                    {tag.name}
                    <button type="button" onClick={() => handleRemoveTag(tag)} className="p-0.5 rounded text-slate-500 hover:text-white" aria-label={`Remover tag ${tag.name}`}>
                      <X className="w-3 h-3" strokeWidth={2} />
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">Nenhuma tag</span>
              )}
            </div>
            <form onSubmit={handleAddTag} className="flex gap-1.5">
              <input
                type="text"
                aria-label="Nova tag"
                placeholder="Adicionar tag"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                className="field h-8 flex-1"
              />
              <button type="submit" disabled={!newTagInput.trim()} className="btn btn-secondary">Adicionar</button>
            </form>
          </div>
        </aside>
      )}

      {showTemplatesModal && (
        <Modal title="Inserir texto de template" size="lg" onClose={() => setShowTemplatesModal(false)}>
          <p className="text-xs text-slate-500">O texto é inserido no campo de mensagem para você revisar antes de enviar.</p>
          <ul className="-mx-5 divide-y divide-white/[0.05] max-h-80 overflow-y-auto border-y border-white/[0.06]">
            {templates.map((tmpl) => {
              const body = templateBody(tmpl);
              return (
                <li key={tmpl.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setMessageText(body);
                      setShowTemplatesModal(false);
                    }}
                    className="w-full text-left px-5 py-3 hover:bg-white/[0.03] transition-colors"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13px] text-white font-mono">{tmpl.name}</span>
                      <span className="text-[11px] text-slate-500">{tmpl.category}</span>
                    </span>
                    <span className="block text-xs text-slate-400 line-clamp-2 mt-0.5">{body}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}
    </div>
  );
};

export default Conversations;
