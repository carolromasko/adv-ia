"use client";
import React, { useState, useEffect } from 'react';
import {
    Users, Settings, Globe, CheckCircle, Clock, Search, Save,
    Database, ShieldCheck, LayoutDashboard, MessageSquare, AlertCircle, Zap, RefreshCw, Copy, Lock, ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// Inicialização do Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const App = () => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [loading, setLoading] = useState(false);
    const [leads, setLeads] = useState([]);
    const [webhookLogs, setWebhookLogs] = useState([]);
    const [aiLogs, setAILogs] = useState([]);
    const [expandedLogs, setExpandedLogs] = useState({});
    const [expandedLeads, setExpandedLeads] = useState({});

    const toggleLog = (id) => {
        setExpandedLogs(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const toggleLead = (id) => {
        setExpandedLeads(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // Autenticação
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [authError, setAuthError] = useState('');

    useEffect(() => {
        const savedAuth = localStorage.getItem('adv_auth');
        if (savedAuth === 'true') {
            setIsAuthenticated(true);
        }
    }, []);

    const handleLogin = (e) => {
        e.preventDefault();
        // Senha padrão: admin123 ou configurada no .env
        const correctPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin123";

        if (passwordInput === correctPassword) {
            setIsAuthenticated(true);
            localStorage.setItem('adv_auth', 'true');
            setAuthError('');
        } else {
            setAuthError('Senha incorreta');
        }
    };
    const [config, setConfig] = useState({
        groq_api_key: '',
        evolution_api_url: '',
        evolution_api_key: '',
        evolution_instance: '',
        webhook_secret: ''
    });
    const [webhookUrl, setWebhookUrl] = useState('');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setWebhookUrl(`${window.location.origin}/api/webhook`);
        }
    }, []);

    const [saveStatus, setSaveStatus] = useState('');

    // Busca dados reais do Supabase
    useEffect(() => {
        if (supabaseUrl && supabaseKey) {
            fetchLeads();
            fetchLeads();
            fetchConfig();
        }
    }, []);

    // Busca logs quando a aba mudar
    useEffect(() => {
        if (activeTab === 'webhooks') {
            fetchWebhookLogs();
            const interval = setInterval(fetchWebhookLogs, 5000);
            return () => clearInterval(interval);
        }
        if (activeTab === 'ai_logs') {
            fetchAILogs();
        }
    }, [activeTab]);

    const fetchLeads = async () => {
        const { data, error } = await supabase
            .from('leads')
            .select('*')
            .order('created_at', { ascending: false });

        if (data) setLeads(data);
        if (error) console.error("Erro ao buscar leads:", error);
    };

    const fetchConfig = async () => {
        const { data, error } = await supabase
            .from('configuracoes')
            .select('*')
            .single();

        if (data) {
            setConfig({
                groq_api_key: data.groq_api_key || '',
                evolution_api_url: data.evolution_api_url || '',
                evolution_api_key: data.evolution_api_key || '',
                evolution_instance: data.evolution_instance || '',
                webhook_secret: data.webhook_secret || ''
            });
        }
    };

    const fetchWebhookLogs = async () => {
        const { data, error } = await supabase
            .from('webhook_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50); // Últimos 50 logs

        if (data) setWebhookLogs(data);
        if (error) console.error("Erro ao buscar logs:", error);
    };

    const fetchAILogs = async () => {
        const { data, error } = await supabase
            .from('mensagens')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);

        if (data) setAILogs(data);
        if (error) console.error("Erro ao buscar logs de IA:", error);
    };

    const handleSaveConfig = async (e) => {
        e.preventDefault();
        setLoading(true);
        setSaveStatus('Salvando...');

        try {
            // Upsert na tabela de configurações (sempre assume ID 1)
            const { error } = await supabase
                .from('configuracoes')
                .upsert({ id: 1, ...config });

            if (error) throw error;

            setSaveStatus('Salvo!');
            setTimeout(() => setSaveStatus(''), 3000);
        } catch (error) {
            console.error(error);
            setSaveStatus('Erro!');
        } finally {
            setLoading(false);
        }
    };

    // Formata data
    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        });
    };


    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4">
                <div className="bg-slate-900 p-8 rounded-2xl shadow-2xl border border-slate-700 w-full max-w-md">
                    <div className="text-center mb-8">
                        <div className="flex justify-center mb-4">
                            <div className="bg-amber-500/10 p-4 rounded-full">
                                <Lock className="text-amber-500" size={32} />
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">Acesso Restrito</h1>
                        <p className="text-slate-400 text-sm">Digite a senha de administrador para continuar.</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <input
                                type="password"
                                value={passwordInput}
                                onChange={(e) => setPasswordInput(e.target.value)}
                                placeholder="Senha de acesso..."
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-amber-500 transition outline-none"
                                autoFocus
                            />
                        </div>

                        {authError && (
                            <div className="text-red-500 text-sm font-bold text-center bg-red-500/10 py-2 rounded-lg">
                                {authError}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-amber-500/20"
                        >
                            Entrar no Sistema
                        </button>
                    </form>
                    <div className="mt-6 text-center">
                        <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">ADVFLOW SECURITY</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
            {/* Sidebar */}
            <aside className="w-64 bg-[#0a0f1e] text-white flex flex-col p-6 shadow-xl shrink-0">
                <div className="text-2xl font-bold mb-10 flex items-center gap-2">
                    <Zap className="text-amber-500 fill-amber-500" />
                    <span>ADV<span className="text-amber-500">FLOW</span></span>
                </div>

                <nav className="space-y-1 flex-1">
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition ${activeTab === 'dashboard' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <LayoutDashboard size={20} /> Dashboard
                    </button>
                    <button
                        onClick={() => setActiveTab('integrations')}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition ${activeTab === 'integrations' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <Settings size={20} /> Integrações
                    </button>
                    <button
                        onClick={() => setActiveTab('webhooks')}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition ${activeTab === 'webhooks' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <ShieldCheck size={20} /> Monitor Webhook
                    </button>
                    <button
                        onClick={() => setActiveTab('ai_logs')}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition ${activeTab === 'ai_logs' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        <MessageSquare size={20} /> Logs de IA
                    </button>
                </nav>

                <div className="mt-auto p-4 bg-slate-800/40 rounded-2xl border border-slate-700/50 flex flex-col gap-3">
                    <div>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-amber-500 uppercase mb-1">
                            <Database size={10} /> PostgreSQL Pooler
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">Supabase Connected</div>
                    </div>
                    <button
                        onClick={() => {
                            localStorage.removeItem('adv_auth');
                            setIsAuthenticated(false);
                        }}
                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 mt-2 border-t border-slate-700 pt-2 w-full"
                    >
                        <Lock size={12} /> Sair do Sistema
                    </button>
                </div>
            </aside>

            {/* Main Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-10 shrink-0">
                    <h1 className="text-lg font-bold text-slate-800 uppercase tracking-widest">
                        {activeTab === 'dashboard' && 'Fila de Produção'}
                        {activeTab === 'integrations' && 'Configurações'}
                        {activeTab === 'webhooks' && 'Monitor de Webhook'}
                        {activeTab === 'ai_logs' && 'Histórico de Conversas IA'}
                    </h1>
                    <div className="flex items-center gap-4">
                        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-xs font-bold text-slate-500">Sistema Online</span>
                    </div>
                </header>

                <main className="p-10 overflow-y-auto">
                    {activeTab === 'dashboard' && (
                        <div className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                    <div className="text-slate-400 text-xs font-bold uppercase mb-1">Total de Leads</div>
                                    <div className="text-3xl font-bold">{leads.length}</div>
                                </div>
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                    <div className="text-slate-400 text-xs font-bold uppercase mb-1">Em Aberto</div>
                                    <div className="text-3xl font-bold text-amber-600">
                                        {leads.filter(l => l.status === 'Em Aberto').length}
                                    </div>
                                </div>
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                    <div className="text-slate-400 text-xs font-bold uppercase mb-1">Briefings Concluídos</div>
                                    <div className="text-3xl font-bold text-green-600">
                                        {leads.filter(l => l.status === 'Briefing Concluído').length}
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <button onClick={fetchLeads} className="flex items-center gap-2 text-sm text-slate-500 hover:text-amber-500 transition">
                                    <RefreshCw size={14} /> Atualizar Lista
                                </button>
                            </div>

                            {leads.length === 0 ? (
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center text-slate-400">
                                    Nenhum lead encontrado ainda.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {leads.map((lead) => (
                                        <div key={lead.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition">
                                            <div
                                                className="p-6 cursor-pointer flex justify-between items-start gap-4"
                                                onClick={() => toggleLead(lead.id)}
                                            >
                                                <div className="flex items-start gap-4">
                                                    <div className={`p-3 rounded-xl ${lead.status === 'Briefing Concluído' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'
                                                        }`}>
                                                        <Users size={20} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-slate-800 text-lg">
                                                                {lead.nome_advogado || 'Em Prospecção'}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-slate-500">
                                                            {lead.nome_escritorio || lead.whatsapp_id}
                                                        </p>
                                                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                                                            <span className="flex items-center gap-1">
                                                                <Clock size={12} /> {formatDate(lead.created_at)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col items-end gap-2">
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${lead.status === 'Briefing Concluído' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                                                        }`}>
                                                        {lead.status}
                                                    </span>
                                                    {expandedLeads[lead.id] ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                                                </div>
                                            </div>

                                            {expandedLeads[lead.id] && (
                                                <div className="bg-slate-50 border-t border-slate-100 p-6">
                                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Detalhes do Briefing</h4>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                                                            <div className="text-xs font-bold text-slate-400 uppercase mb-1">Nome do Advogado</div>
                                                            <div className="text-sm font-bold text-slate-800">{lead.nome_advogado || '-'}</div>
                                                        </div>
                                                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                                                            <div className="text-xs font-bold text-slate-400 uppercase mb-1">Nome do Escritório</div>
                                                            <div className="text-sm font-bold text-slate-800">{lead.nome_escritorio || '-'}</div>
                                                        </div>
                                                        <div className="bg-white rounded-xl p-4 border border-slate-200 md:col-span-2">
                                                            <div className="text-xs font-bold text-slate-400 uppercase mb-1">Especialidades</div>
                                                            <div className="text-sm text-slate-700 whitespace-pre-wrap">{lead.especialidades || '-'}</div>
                                                        </div>
                                                        <div className="bg-white rounded-xl p-4 border border-slate-200 md:col-span-2">
                                                            <div className="text-xs font-bold text-slate-400 uppercase mb-1">Principal Diferencial</div>
                                                            <div className="text-sm text-slate-700 whitespace-pre-wrap">{lead.diferencial || '-'}</div>
                                                        </div>
                                                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                                                            <div className="text-xs font-bold text-slate-400 uppercase mb-1">WhatsApp ID</div>
                                                            <div className="text-xs font-mono text-slate-600">{lead.whatsapp_id}</div>
                                                        </div>
                                                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                                                            <div className="text-xs font-bold text-slate-400 uppercase mb-1">Última Atualização</div>
                                                            <div className="text-sm text-slate-700">{formatDate(lead.updated_at)}</div>
                                                        </div>
                                                    </div>
                                                    <div className="mt-4 flex justify-end">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActiveTab('ai_logs');
                                                            }}
                                                            className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition flex items-center gap-2"
                                                        >
                                                            <MessageSquare size={14} /> Ver Conversa Completa
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'integrations' && (
                        <div className="max-w-3xl mx-auto space-y-6">
                            <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-2xl space-y-8">
                                <div>
                                    <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                                        <Zap className="text-amber-500" size={20} /> Integração IA
                                    </h2>
                                    <p className="text-slate-400 text-sm mb-6">Configure sua chave da Groq Cloud para processar as mensagens do WhatsApp (Modelo: openai/gpt-oss-120b).</p>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Groq API Key</label>
                                    <input
                                        type="password"
                                        value={config.groq_api_key}
                                        onChange={(e) => setConfig({ ...config, groq_api_key: e.target.value })}
                                        placeholder="gsk_..."
                                        className="w-full bg-slate-800 border-none rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-amber-500 transition outline-none"
                                    />
                                </div>

                                <div className="pt-8 border-t border-slate-800">
                                    <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                                        <MessageSquare className="text-blue-500" size={20} /> Evolution API
                                    </h2>

                                    {/* Webhook URL Display */}
                                    <div className="mt-6 mb-8 p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
                                        <label className="block text-[10px] font-bold text-blue-400 uppercase mb-2 tracking-widest flex items-center gap-2">
                                            <Globe size={12} /> URL do Webhook (Copie e cole na Evolution)
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                readOnly
                                                value={webhookUrl}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-300 font-mono text-sm focus:outline-none focus:border-blue-500 transaction"
                                            />
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(webhookUrl);
                                                    alert("URL copiada!");
                                                }}
                                                className="bg-blue-600 hover:bg-blue-500 text-white px-4 rounded-lg transition flex items-center justify-center"
                                                title="Copiar URL"
                                            >
                                                <Copy size={18} />
                                            </button>
                                        </div>
                                        <p className="text-[11px] text-slate-400 mt-2">
                                            Configure esta URL no campo <strong>webhook.url</strong> da sua instância e habilite os eventos <strong>MESSAGES_UPSERT</strong>.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="md:col-span-2">
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">URL do Servidor</label>
                                            <input
                                                type="text"
                                                value={config.evolution_api_url}
                                                onChange={(e) => setConfig({ ...config, evolution_api_url: e.target.value })}
                                                placeholder="https://sua-api.com"
                                                className="w-full bg-slate-800 border-none rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-amber-500 transition outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Nome da Instância</label>
                                            <input
                                                type="text"
                                                value={config.evolution_instance}
                                                onChange={(e) => setConfig({ ...config, evolution_instance: e.target.value })}
                                                className="w-full bg-slate-800 border-none rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-amber-500 transition outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">API Key Global</label>
                                            <input
                                                type="password"
                                                value={config.evolution_api_key}
                                                onChange={(e) => setConfig({ ...config, evolution_api_key: e.target.value })}
                                                className="w-full bg-slate-800 border-none rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-amber-500 transition outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-10 flex items-center justify-between">
                                    <span className={`text-sm font-bold ${saveStatus.includes('Erro') ? 'text-red-500' : 'text-green-500'}`}>{saveStatus}</span>
                                    <button
                                        onClick={handleSaveConfig}
                                        disabled={loading}
                                        className="bg-amber-500 text-white px-10 py-4 rounded-2xl font-bold hover:bg-amber-600 transition flex items-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50"
                                    >
                                        {loading ? <RefreshCw className="animate-spin" size={20} /> : <Save size={20} />}
                                        {loading ? 'Salvando...' : 'Salvar Tudo'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}



                    {activeTab === 'webhooks' && (
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800">Logs de Recebimento</h2>
                                    <p className="text-sm text-slate-500">Monitoramento em tempo real das mensagens recebidas da Evolution API.</p>
                                </div>
                                <button onClick={fetchWebhookLogs} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition">
                                    <RefreshCw size={20} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                {webhookLogs.map((log) => {
                                    // Extração segura dos dados para o resumo
                                    const payload = log.payload || {};
                                    const messageData = payload.data?.messages?.[0] || payload.data || {};
                                    const key = messageData.key || {};
                                    const pushName = messageData.pushName || 'Desconhecido';
                                    const remoteJid = key.remoteJid || 'N/A';
                                    const conversation = messageData.message?.conversation ||
                                        messageData.message?.extendedTextMessage?.text ||
                                        'Mensagem sem texto / Evento de sistema';
                                    const eventType = payload.event || 'Evento desconhecido';

                                    // Identifica se é envio ou recebimento
                                    const isSent = log.status === 'sent_to_user';
                                    const evolutionPayload = payload.evolution_payload || {};

                                    return (
                                        <div key={log.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition">
                                            <div
                                                className="p-6 cursor-pointer flex justify-between items-start gap-4"
                                                onClick={() => toggleLog(log.id)}
                                            >
                                                <div className="flex items-start gap-4">
                                                    <div className={`p-3 rounded-xl ${isSent ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                                                        {isSent ? <Zap size={20} /> : <MessageSquare size={20} />}
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-slate-800 text-sm">
                                                                {isSent ? 'Enviado para' : 'Recebido de'}: {isSent ? evolutionPayload.number : pushName}
                                                            </span>
                                                            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-mono">
                                                                {isSent ? evolutionPayload.number : remoteJid}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-slate-600 font-medium line-clamp-2">
                                                            {isSent ? evolutionPayload.text : conversation}
                                                        </p>
                                                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                                                            <span className="flex items-center gap-1">
                                                                <Clock size={12} /> {formatDate(log.created_at)}
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <Database size={12} /> ID: {log.id}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col items-end gap-2">
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${log.status === 'error_ai_generation' || log.status === 'error_evolution_api' ? 'bg-red-50 text-red-700 border-red-200' :
                                                        log.status === 'sent_to_user' ? 'bg-green-50 text-green-700 border-green-200' :
                                                            'bg-slate-50 text-slate-600 border-slate-200'
                                                        }`}>
                                                        {log.status}
                                                    </span>
                                                    {expandedLogs[log.id] ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                                                </div>
                                            </div>

                                            {expandedLogs[log.id] && (
                                                <div className="bg-slate-50 border-t border-slate-100 p-6 space-y-6">

                                                    {/* Timeline do Fluxo de Execução */}
                                                    <div>
                                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Fluxo de Processamento</h4>
                                                        <div className="flex items-center justify-between relative">
                                                            {/* Linha de conexão de fundo */}
                                                            <div className="absolute left-0 top-1/2 w-full h-0.5 bg-slate-200 -z-0"></div>

                                                            {['Recebido', 'Processando', 'IA', 'Enviado'].map((stepLabel, index) => {
                                                                // Definição dos estados para cada passo baseada no log.status
                                                                let stepStatus = 'pending'; // pending, active, completed, error, ignored

                                                                const s = log.status;

                                                                // Lógica simplificada de estado
                                                                if (index === 0) { // Recebido
                                                                    if (s.includes('ignored')) stepStatus = 'ignored';
                                                                    else stepStatus = 'completed';
                                                                } else if (index === 1) { // Processando (Dados)
                                                                    if (s === 'received') stepStatus = 'active';
                                                                    else if (s === 'fetching_data') stepStatus = 'active';
                                                                    else if (s === 'error_no_api_key') stepStatus = 'error';
                                                                    else if (['generating_ai', 'ai_generated', 'sending_evolution', 'sent_to_user', 'error_ai_generation', 'error_evolution_api'].includes(s)) stepStatus = 'completed';
                                                                    else if (s.includes('ignored')) stepStatus = 'ignored';
                                                                } else if (index === 2) { // IA
                                                                    if (s === 'generating_ai') stepStatus = 'active';
                                                                    else if (s === 'error_ai_generation') stepStatus = 'error';
                                                                    else if (['ai_generated', 'sending_evolution', 'sent_to_user', 'error_evolution_api'].includes(s)) stepStatus = 'completed';
                                                                } else if (index === 3) { // Enviado
                                                                    if (s === 'sending_evolution' || s === 'ai_generated') stepStatus = 'active';
                                                                    else if (s === 'error_evolution_api') stepStatus = 'error';
                                                                    else if (s === 'sent_to_user') stepStatus = 'completed';
                                                                }

                                                                return (
                                                                    <div key={index} className="relative z-10 flex flex-col items-center gap-2 bg-slate-50 px-2">
                                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${stepStatus === 'completed' ? 'bg-green-500 border-green-500 text-white' :
                                                                            stepStatus === 'error' ? 'bg-red-500 border-red-500 text-white' :
                                                                                stepStatus === 'active' ? 'bg-blue-500 border-blue-500 text-white animate-pulse' :
                                                                                    stepStatus === 'ignored' ? 'bg-slate-200 border-slate-300 text-slate-400' :
                                                                                        'bg-white border-slate-300 text-slate-300'
                                                                            }`}>
                                                                            {stepStatus === 'completed' && <CheckCircle2 size={16} />}
                                                                            {stepStatus === 'error' && <XCircle size={16} />}
                                                                            {stepStatus === 'active' && <Loader2 size={16} className="animate-spin" />}
                                                                            {stepStatus === 'ignored' && <XCircle size={16} />}
                                                                            {stepStatus === 'pending' && <span className="text-xs font-bold text-slate-300">{index + 1}</span>}
                                                                        </div>
                                                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${stepStatus === 'completed' ? 'text-green-600' :
                                                                            stepStatus === 'error' ? 'text-red-600' :
                                                                                stepStatus === 'active' ? 'text-blue-600' :
                                                                                    'text-slate-400'
                                                                            }`}>{stepLabel}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                    {(payload.ai_response || evolutionPayload.text) && (
                                                        <div className="mb-4">
                                                            <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                                                                <Zap size={14} /> Resposta Gerada pela IA
                                                            </h4>
                                                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-slate-800 text-sm whitespace-pre-wrap font-medium">
                                                                {payload.ai_response || evolutionPayload.text}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Payload Completo (JSON)</h4>
                                                        <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto relative group">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    navigator.clipboard.writeText(JSON.stringify(log.payload, null, 2));
                                                                    alert('JSON copiado!');
                                                                }}
                                                                className="absolute top-2 right-2 p-2 bg-white/10 text-white rounded hover:bg-white/20 opacity-0 group-hover:opacity-100 transition"
                                                                title="Copiar JSON"
                                                            >
                                                                <Copy size={14} />
                                                            </button>
                                                            <pre className="text-xs text-green-400 font-mono">
                                                                {JSON.stringify(log.payload, null, 2)}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}

                                {webhookLogs.length === 0 && (
                                    <div className="text-center py-20 text-slate-400">
                                        Nenhum log registrado ainda.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'ai_logs' && (
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800">Conversas com IA</h2>
                                    <p className="text-sm text-slate-500">Histórico completo das interações entre usuários e a IA.</p>
                                </div>
                                <button onClick={fetchAILogs} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition">
                                    <RefreshCw size={20} />
                                </button>
                            </div>

                            <div className="space-y-6">
                                {Object.entries(
                                    aiLogs.reduce((acc, msg) => {
                                        if (!acc[msg.whatsapp_id]) acc[msg.whatsapp_id] = [];
                                        acc[msg.whatsapp_id].push(msg);
                                        return acc;
                                    }, {})
                                ).map(([whatsappId, messages]) => (
                                    <div key={whatsappId} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-4 text-white">
                                            <div className="flex items-center gap-2">
                                                <Users size={16} />
                                                <span className="font-bold text-sm">{whatsappId}</span>
                                            </div>
                                            <div className="text-xs opacity-80 mt-1">{messages.length} mensagens</div>
                                        </div>
                                        <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
                                            {messages.reverse().map((msg, idx) => (
                                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                                                    <div className={`max-w-[80%] rounded-2xl p-4 ${msg.role === 'user'
                                                        ? 'bg-blue-50 text-blue-900 border border-blue-200'
                                                        : 'bg-amber-50 text-amber-900 border border-amber-200'
                                                        }`}>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <div className={`w-2 h-2 rounded-full ${msg.role === 'user' ? 'bg-blue-500' : 'bg-amber-500'
                                                                }`}></div>
                                                            <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                                                                {msg.role === 'user' ? 'Usuário' : 'IA'}
                                                            </span>
                                                            <span className="text-[9px] opacity-40 ml-auto">
                                                                {formatDate(msg.created_at)}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}

                                {aiLogs.length === 0 && (
                                    <div className="text-center py-20 text-slate-400">
                                        Nenhuma conversa registrada ainda.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </main>
            </div >
        </div >
    );
};

export default App;