import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Search,
  Filter,
  Send,
  Lock,
  Paperclip,
  Smile,
  Bot,
  UserCheck,
  CheckCheck,
  Check,
  Clock,
  Radio,
  Tag,
  Kanban,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
  Building,
  ChevronRight,
  MoreVertical,
  Layers,
  Sparkles,
  Zap,
  Play,
  RotateCcw,
  X
} from 'lucide-react';
import ApiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';

export const Conversations = () => {
  const { user } = useAuth();
  const { subscribe, emit } = useWebSocket();

  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Filters
  const [filterTab, setFilterTab] = useState('mine'); // 'mine', 'unassigned', 'all', 'resolved', 'bot'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedQueue, setSelectedQueue] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('');

  // Composer
  const [inputMode, setInputMode] = useState('message'); // 'message' or 'whisper'
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);

  // 360 Drawer
  const [showDrawer, setShowDrawer] = useState(true);
  const [contact360, setContact360] = useState(null);
  const [newTagInput, setNewTagInput] = useState('');
  const [templates, setTemplates] = useState([]);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);

  // AI SDR Control
  const [aiMode, setAiMode] = useState('copilot'); // 'off', 'copilot', 'autonomous'
  const [aiGenerating, setAiGenerating] = useState(false);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch conversations
  const fetchConversations = async () => {
    try {
      const params = {};
      if (filterTab === 'mine') params.assigned_user_id = user?.id;
      if (filterTab === 'unassigned') params.status = 'open';
      if (filterTab === 'resolved') params.status = 'resolved';
      if (selectedQueue) params.queue_id = selectedQueue;
      if (selectedChannel) params.channel_id = selectedChannel;

      const data = await ApiClient.get('/conversations', params);
      setConversations(data || []);
      if (!selectedConv && data && data.length > 0) {
        selectConversation(data[0]);
      }
    } catch (err) {
      console.error('[Conversations] Error fetching list:', err);
    } finally {
      setLoading(false);
    }
  };

  // Select conversation & load messages & contact 360
  const selectConversation = async (conv) => {
    setSelectedConv(conv);
    setMessagesLoading(true);
    try {
      const [msgs, contactData] = await Promise.all([
        ApiClient.get(`/conversations/${conv.id}/messages`),
        conv.contact_id ? ApiClient.get(`/contacts/${conv.contact_id}`) : Promise.resolve(null),
      ]);
      setMessages(msgs || []);
      setContact360(contactData);
    } catch (err) {
      console.error('[Conversations] Error fetching messages:', err);
    } finally {
      setMessagesLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  };

  // Initial load
  useEffect(() => {
    fetchConversations();
    // Load approved templates for quick response
    ApiClient.get('/templates').then((res) => setTemplates(res || [])).catch(() => {});
  }, [filterTab, selectedQueue, selectedChannel]);

  // WebSocket Subscription for Real-time incoming messages
  useEffect(() => {
    const unsubscribe = subscribe('new_message', (payload) => {
      if (payload && payload.conversation_id === selectedConv?.id) {
        setMessages((prev) => [...prev, payload]);
        setTimeout(scrollToBottom, 100);
      }
      // Update last message in conversation list
      setConversations((prev) =>
        prev.map((c) =>
          c.id === payload.conversation_id
            ? { ...c, last_message_preview: payload.body, last_message_at: payload.created_at }
            : c
        )
      );
    });

    return () => unsubscribe();
  }, [selectedConv, subscribe]);

  // Send message or whisper note
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!messageText.trim() || !selectedConv) return;

    setSending(true);
    try {
      const isWhisper = inputMode === 'whisper';
      const newMsg = await ApiClient.post(`/conversations/${selectedConv.id}/messages`, {
        body: messageText.trim(),
        message_type: 'text',
        is_internal: isWhisper,
      });

      setMessages((prev) => [...prev, newMsg]);
      setMessageText('');
      setTimeout(scrollToBottom, 50);

      // Emit WS event
      emit('message_sent', { conversation_id: selectedConv.id, message: newMsg });
    } catch (err) {
      alert(err.message || 'Erro ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  // AI SDR Copilot Suggestion
  const handleGenerateAiResponse = async () => {
    if (!selectedConv) return;
    setAiGenerating(true);
    try {
      // Simulate/Trigger AI response generation from Redis context window
      setTimeout(() => {
        const contactName = contact360?.name?.split(' ')[0] || 'Cliente';
        setMessageText(`Olá, ${contactName}! Entendi perfeitamente a sua solicitação. Posso te ajudar a avançar com as informações agora mesmo.`);
        setAiGenerating(false);
      }, 700);
    } catch (err) {
      setAiGenerating(false);
    }
  };

  // Change conversation status (Resolve / Reopen)
  const handleStatusChange = async (newStatus) => {
    if (!selectedConv) return;
    try {
      await ApiClient.patch(`/conversations/${selectedConv.id}/status`, { status: newStatus });
      setSelectedConv((prev) => ({ ...prev, status: newStatus }));
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedConv.id ? { ...c, status: newStatus } : c))
      );
    } catch (err) {
      alert('Erro ao atualizar status');
    }
  };

  // Add Tag to Contact/Conversation
  const handleAddTag = async (e) => {
    e.preventDefault();
    if (!newTagInput.trim() || !selectedConv) return;
    const tag = newTagInput.trim();
    try {
      await ApiClient.post(`/conversations/${selectedConv.id}/tags`, { name: tag });
      setContact360((prev) => ({
        ...prev,
        tags: [...(prev?.tags || []), tag],
      }));
      setNewTagInput('');
    } catch (err) {
      alert('Erro ao adicionar tag');
    }
  };

  // Filtered list
  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.contact_name?.toLowerCase().includes(q) ||
      c.contact_phone?.includes(q) ||
      c.last_message_preview?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden bg-[#070b14]">
      {/* 1. LEFT COLUMN: CONVERSATION LIST & FILTERS (Width: 320px - 360px) */}
      <div className="w-80 sm:w-96 flex flex-col border-r border-slate-800 bg-[#0c1222] z-10 flex-shrink-0">
        {/* Header Tabs */}
        <div className="p-3 border-b border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-brand-400" />
              <span>Atendimentos</span>
            </h2>
            <span className="text-[11px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
              {filteredConversations.length}
            </span>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar contato, telefone, mensagem..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-700/60 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {[
              { id: 'mine', label: 'Minhas' },
              { id: 'unassigned', label: 'Não Atribuídas' },
              { id: 'all', label: 'Todas' },
              { id: 'resolved', label: 'Resolvidas' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                  filterTab === tab.id
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation Cards Scroll List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
          {loading ? (
            <div className="p-8 text-center text-slate-500 text-xs">Carregando conversas...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Nenhuma conversa encontrada nesta fila.
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedConv?.id === conv.id;
              const channelType = conv.channel_type || 'whatsapp';

              return (
                <div
                  key={conv.id}
                  onClick={() => selectConversation(conv)}
                  className={`p-3.5 flex items-start gap-3 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-brand-500/10 border-l-4 border-l-brand-500'
                      : 'hover:bg-slate-800/40 border-l-4 border-l-transparent'
                  }`}
                >
                  {/* Contact Avatar & Channel Badge */}
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-slate-800 text-slate-200 font-bold flex items-center justify-center border border-slate-700 text-xs">
                      {conv.contact_name?.charAt(0) || 'C'}
                    </div>
                    {/* Channel Indicator Badge */}
                    <div
                      className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white border-2 border-[#0c1222] ${
                        channelType === 'whatsapp'
                          ? 'bg-emerald-500'
                          : channelType === 'instagram'
                          ? 'bg-pink-500'
                          : 'bg-blue-500'
                      }`}
                    >
                      <Radio className="w-2.5 h-2.5" />
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-xs font-bold text-white truncate">
                        {conv.contact_name || conv.contact_phone || 'Contato Desconhecido'}
                      </h4>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap ml-1">
                        {conv.last_message_at ? new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 truncate mb-1.5">
                      {conv.last_message_preview || 'Nova conversa iniciada'}
                    </p>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                          conv.status === 'open'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                            : conv.status === 'pending'
                            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {conv.status}
                      </span>

                      {conv.assigned_user_name && (
                        <span className="text-[9px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded truncate max-w-[90px]">
                          👤 {conv.assigned_user_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. MIDDLE COLUMN: LIVE CHAT & CONVERSATION THREAD */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#070b14] relative">
        {selectedConv ? (
          <>
            {/* Live Chat Top Header */}
            <div className="h-16 px-4 bg-[#0f172a]/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between z-10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-slate-800 text-brand-400 font-bold flex items-center justify-center border border-slate-700 text-xs">
                  {selectedConv.contact_name?.charAt(0) || 'C'}
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white truncate">
                      {selectedConv.contact_name || 'Contato Sem Nome'}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {selectedConv.contact_phone}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>Canal: {selectedConv.channel_name || 'WhatsApp'}</span>
                    <span>•</span>
                    <span className="text-slate-400">Fila: {selectedConv.queue_name || 'Geral'}</span>
                  </div>
                </div>
              </div>

              {/* Chat Actions & IA SDR Co-Pilot Controls */}
              <div className="flex items-center gap-2">
                {/* AI SDR Mode Switcher Pill */}
                <div className="hidden md:flex items-center gap-1 p-1 bg-slate-900 border border-purple-500/30 rounded-xl">
                  <button
                    onClick={() => setAiMode('off')}
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded-lg transition-colors ${
                      aiMode === 'off' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    IA Off
                  </button>
                  <button
                    onClick={() => setAiMode('copilot')}
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded-lg flex items-center gap-1 transition-colors ${
                      aiMode === 'copilot' ? 'bg-purple-600 text-white shadow-sm' : 'text-purple-300 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" /> Co-Piloto
                  </button>
                  <button
                    onClick={() => setAiMode('autonomous')}
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded-lg flex items-center gap-1 transition-colors ${
                      aiMode === 'autonomous' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-400 hover:text-brand-300'
                    }`}
                  >
                    <Bot className="w-3 h-3" /> IA 100%
                  </button>
                </div>

                {/* Status Toggle (Resolve/Reopen) */}
                {selectedConv.status === 'resolved' ? (
                  <button
                    onClick={() => handleStatusChange('open')}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reabrir</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleStatusChange('resolved')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Resolver</span>
                  </button>
                )}

                {/* Toggle 360 Contact Drawer */}
                <button
                  onClick={() => setShowDrawer(!showDrawer)}
                  className={`p-2 rounded-xl border transition-colors ${
                    showDrawer
                      ? 'bg-slate-800 border-slate-700 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                  title="Visão 360° do Contato"
                >
                  <Kanban className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* AI Assistant Banner when Copilot or Autonomous is active */}
            {aiMode !== 'off' && (
              <div className="bg-purple-950/40 border-b border-purple-800/40 px-4 py-2 flex items-center justify-between text-xs text-purple-200">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-purple-400 animate-pulse" />
                  <span>
                    <strong>Agente SDR Ativo:</strong> {aiMode === 'copilot' ? 'Modo Assistido com sugestões inteligentes e formulário de qualificação' : 'Modo Autônomo executando fluxo de atendimento'}
                  </span>
                </div>
                {aiMode === 'copilot' && (
                  <button
                    onClick={handleGenerateAiResponse}
                    disabled={aiGenerating}
                    className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-semibold rounded-lg flex items-center gap-1 transition-all"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{aiGenerating ? 'Gerando...' : 'Sugerir Resposta'}</span>
                  </button>
                )}
              </div>
            )}

            {/* Messages Thread Canvas */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messagesLoading ? (
                <div className="py-12 text-center text-slate-500 text-xs">Carregando histórico...</div>
              ) : messages.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Nenhuma mensagem registrada nesta conversa ainda.
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isOutbound = msg.sender_type === 'user' || msg.sender_type === 'bot';
                  const isWhisper = msg.is_internal;

                  return (
                    <div
                      key={msg.id || idx}
                      className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'} ${
                        isWhisper ? 'w-full' : ''
                      }`}
                    >
                      {/* Whisper Note Banner */}
                      {isWhisper ? (
                        <div className="w-full max-w-xl mx-auto my-1 whisper-bg p-3 rounded-xl text-xs text-amber-200 shadow-sm">
                          <div className="flex items-center gap-1.5 font-bold text-amber-400 mb-1">
                            <Lock className="w-3 h-3" />
                            <span>Nota Interna Privada (Visível apenas para a equipe)</span>
                          </div>
                          <p className="whitespace-pre-wrap">{msg.body}</p>
                          <span className="text-[10px] text-amber-400/70 block text-right mt-1">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ) : (
                        <div
                          className={`max-w-lg rounded-2xl px-4 py-2.5 shadow-md relative group ${
                            isOutbound
                              ? 'bg-brand-600 text-white rounded-br-none'
                              : 'bg-slate-800 text-slate-100 rounded-bl-none border border-slate-700/60'
                          }`}
                        >
                          {/* Sender name on outbound if bot */}
                          {msg.sender_type === 'bot' && (
                            <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-200 mb-0.5">
                              <Bot className="w-3 h-3" />
                              <span>IA SDR</span>
                            </div>
                          )}

                          <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.body}</p>

                          <div
                            className={`flex items-center justify-end gap-1 text-[10px] mt-1 ${
                              isOutbound ? 'text-emerald-200' : 'text-slate-400'
                            }`}
                          >
                            <span>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isOutbound && <CheckCheck className="w-3.5 h-3.5 text-emerald-200" />}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Composer Box */}
            <div className="p-3 bg-[#0f172a] border-t border-slate-800">
              {/* Tab Selector: Customer Message vs Whisper Note */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setInputMode('message')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      inputMode === 'message'
                        ? 'bg-brand-500 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Send className="w-3 h-3" />
                    <span>Mensagem</span>
                  </button>

                  <button
                    onClick={() => setInputMode('whisper')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      inputMode === 'whisper'
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'text-amber-400 hover:bg-amber-500/10'
                    }`}
                  >
                    <Lock className="w-3 h-3" />
                    <span>Nota Interna (Whisper)</span>
                  </button>
                </div>

                {/* Templates Quick Reply Button */}
                <button
                  onClick={() => setShowTemplatesModal(true)}
                  className="text-xs text-slate-400 hover:text-brand-400 flex items-center gap-1 font-medium transition-colors"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Respostas Rápidas / Templates</span>
                </button>
              </div>

              {/* Text Input Area */}
              <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                <div
                  className={`flex-1 rounded-xl p-2 border transition-all ${
                    inputMode === 'whisper'
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                      : 'bg-slate-900 border-slate-700/80 text-white focus-within:border-brand-500'
                  }`}
                >
                  <textarea
                    rows={2}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={
                      inputMode === 'whisper'
                        ? 'Escreva uma anotação privada visível apenas para os colegas de equipe...'
                        : 'Digite sua mensagem (Enter para enviar)...'
                    }
                    className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={sending || !messageText.trim()}
                  className={`p-3 rounded-xl text-white font-semibold shadow-lg transition-all disabled:opacity-50 ${
                    inputMode === 'whisper'
                      ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                      : 'bg-brand-500 hover:bg-brand-600 shadow-brand-500/25'
                  }`}
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/80 text-slate-500 flex items-center justify-center mb-3">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Nenhuma conversa selecionada</h3>
            <p className="text-xs text-slate-400 max-w-sm">
              Selecione uma conversa na lista lateral para iniciar o atendimento ou acionar o agente de IA.
            </p>
          </div>
        )}
      </div>

      {/* 3. RIGHT COLUMN: "VISÃO 360°" CONTACT DRAWER (Width: 320px) */}
      {showDrawer && selectedConv && (
        <div className="w-80 border-l border-slate-800 bg-[#0c1222] flex flex-col overflow-y-auto p-4 space-y-5 flex-shrink-0 z-10 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-brand-400" />
              <span>Visão 360° do Cliente</span>
            </h3>
            <button onClick={() => setShowDrawer(false)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Contact Details Card */}
          <div className="space-y-2">
            <div className="text-center p-3 rounded-xl bg-slate-900 border border-slate-800">
              <div className="w-12 h-12 rounded-full bg-brand-500/20 text-brand-400 font-extrabold flex items-center justify-center mx-auto mb-2 text-sm border border-brand-500/30">
                {selectedConv.contact_name?.charAt(0) || 'C'}
              </div>
              <h4 className="text-sm font-bold text-white">{selectedConv.contact_name || 'Contato Sem Nome'}</h4>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedConv.contact_phone || 'Sem telefone'}</p>
            </div>
          </div>

          {/* CRM Deal & Stage Link */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Kanban className="w-3.5 h-3.5 text-blue-400" />
              <span>Oportunidade CRM</span>
            </span>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium">Etapa do Funil:</span>
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-semibold text-[10px]">
                  Qualificação IA
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium">Valor Estimado:</span>
                <span className="text-emerald-400 font-bold font-mono">R$ 2.400,00</span>
              </div>
            </div>
          </div>

          {/* AI SDR Collected Form Stage */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Bot className="w-3.5 h-3.5 text-purple-400" />
              <span>Dados Coletados pela IA</span>
            </span>
            <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-800/30 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Interesse:</span>
                <span className="text-purple-200 font-medium">Plano Enterprise</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Empresa:</span>
                <span className="text-purple-200 font-medium">Tech Solutions</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Urgência:</span>
                <span className="text-emerald-400 font-bold">Alta (Esta semana)</span>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-amber-400" />
              <span>Tags de Atendimento</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(contact360?.tags || ['Lead Qualificado', 'WhatsApp', 'VIP']).map((tag, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 font-medium"
                >
                  #{tag}
                </span>
              ))}
            </div>
            <form onSubmit={handleAddTag} className="flex gap-1 mt-1">
              <input
                type="text"
                placeholder="Nova tag..."
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none"
              />
              <button
                type="submit"
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold"
              >
                +
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Templates Modal */}
      {showTemplatesModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl border border-slate-800 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Modelos de Mensagem / Respostas Rápidas</span>
              </h3>
              <button onClick={() => setShowTemplatesModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2">
              {templates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  onClick={() => {
                    setMessageText(tmpl.components_json || tmpl.name);
                    setShowTemplatesModal(false);
                  }}
                  className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 cursor-pointer transition-colors"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-white">{tmpl.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 font-semibold">
                      {tmpl.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{tmpl.components_json || 'Template pronto'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Conversations;
