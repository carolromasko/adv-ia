"use client";
import React, { useState, useEffect } from 'react';
import {
    Users, Settings, Globe, CheckCircle, Clock, Search, Save,
    Database, ShieldCheck, LayoutDashboard, MessageSquare, AlertCircle, Zap, RefreshCw
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
    const [config, setConfig] = useState({
        gemini_api_key: '',
        evolution_api_url: '',
        evolution_api_key: '',
        evolution_instance: '',
        webhook_secret: ''
    });

    const [saveStatus, setSaveStatus] = useState('');

    // Busca dados reais do Supabase
    useEffect(() => {
        if (supabaseUrl && supabaseKey) {
            fetchLeads();
            fetchConfig();
        }
    }, []);

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
                gemini_api_key: data.gemini_api_key || '',
                evolution_api_url: data.evolution_api_url || '',
                evolution_api_key: data.evolution_api_key || '',
                evolution_instance: data.evolution_instance || '',
                webhook_secret: data.webhook_secret || ''
            });
        }
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
                </nav>

                <div className="mt-auto p-4 bg-slate-800/40 rounded-2xl border border-slate-700/50">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-amber-500 uppercase mb-1">
                        <Database size={10} /> PostgreSQL Pooler
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">Supabase Connected</div>
                </div>
            </aside>

            {/* Main Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-10 shrink-0">
                    <h1 className="text-lg font-bold text-slate-800 uppercase tracking-widest">
                        {activeTab === 'dashboard' ? 'Fila de Produção' : 'Painel de Controle'}
                    </h1>
                    <div className="flex items-center gap-4">
                        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-xs font-bold text-slate-500">Sistema Online</span>
                    </div>
                </header>

                <main className="p-10 overflow-y-auto">
                    {activeTab === 'dashboard' ? (
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

                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                {leads.length === 0 ? (
                                    <div className="p-10 text-center text-slate-400">
                                        Nenhum lead encontrado ainda.
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-bold border-b border-slate-100">
                                                <tr>
                                                    <th className="px-8 py-4">Advogado</th>
                                                    <th className="px-8 py-4">Status</th>
                                                    <th className="px-8 py-4">Data</th>
                                                    <th className="px-8 py-4">Detalhes</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {leads.map((l) => (
                                                    <tr key={l.id} className="hover:bg-slate-50/50 transition">
                                                        <td className="px-8 py-5">
                                                            <div className="font-bold">{l.nome_advogado || 'Em Prospecção'}</div>
                                                            <div className="text-xs text-slate-400">{l.nome_escritorio || l.whatsapp_id}</div>
                                                        </td>
                                                        <td className="px-8 py-5 text-sm">
                                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${l.status === 'Briefing Concluído'
                                                                ? 'bg-green-50 text-green-700'
                                                                : 'bg-amber-50 text-amber-700'
                                                                }`}>
                                                                {l.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-8 py-5 text-slate-400 text-xs">{formatDate(l.created_at)}</td>
                                                        <td className="px-8 py-5 text-xs text-slate-500 max-w-xs truncate">
                                                            {l.especialidades || '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-3xl mx-auto space-y-6">
                            <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-2xl space-y-8">
                                <div>
                                    <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                                        <Zap className="text-amber-500" size={20} /> Integração IA
                                    </h2>
                                    <p className="text-slate-400 text-sm mb-6">Configure sua chave do Google Gemini para processar as mensagens do WhatsApp.</p>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Gemini API Key</label>
                                    <input
                                        type="password"
                                        value={config.gemini_api_key}
                                        onChange={(e) => setConfig({ ...config, gemini_api_key: e.target.value })}
                                        placeholder="AIza..."
                                        className="w-full bg-slate-800 border-none rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-amber-500 transition outline-none"
                                    />
                                </div>

                                <div className="pt-8 border-t border-slate-800">
                                    <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                                        <MessageSquare className="text-blue-500" size={20} /> Evolution API
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
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
                </main>
            </div>
        </div>
    );
};

export default App;