// Caminho sugerido: app/api/webhook/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Função com Exponential Backoff para chamadas de API (Regra do Sistema)
 */
async function fetchWithRetry(url: string, options: any, retries = 5, backoff = 1000) {
    try {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        return await res.json();
    } catch (err) {
        if (retries <= 0) throw err;
        await new Promise(resolve => setTimeout(resolve, backoff));
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();

        // 1. Validar se é uma mensagem recebida da Evolution API
        if (body.event !== "messages.upsert") return NextResponse.json({ ok: true });

        const messageData = body.data.messages[0];
        if (messageData.key.fromMe) return NextResponse.json({ ok: true });

        const whatsappId = messageData.key.remoteJid;
        const userMessage = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text;

        if (!userMessage) return NextResponse.json({ ok: true });

        // 2. Buscar Configurações e Histórico no Supabase
        const { data: config } = await supabase.from('configuracoes').select('*').single();
        const { data: history } = await supabase.from('mensagens')
            .select('role, content')
            .eq('whatsapp_id', whatsappId)
            .order('created_at', { ascending: true });

        const formattedHistory = history?.map(m => ({
            role: m.role,
            parts: [{ text: m.content }]
        })) || [];

        // 3. Chamar Gemini 2.5 Flash
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${config?.gemini_api_key || ""}`;

        const systemPrompt = `Você é um assistente de vendas da ADV Digital. 
    Seu objetivo é coletar dados para criar um site jurídico em 48h.
    Colete os seguintes dados:
    1. Nome do Advogado
    2. Nome do Escritório
    3. Especialidades
    4. Principal Diferencial

    Seja formal, mas prestativo. Pergunte uma coisa por vez.
    
    IMPORTANTE:
    Quando o usuário fornecer todos os 4 pontos acima, você DEVE retornar APENAS O SEGUINTE JSON no final da sua resposta, sem markdown (backticks):
    
    [FINALIZADO]
    {
        "nome_advogado": "Nome...",
        "nome_escritorio": "Escritório...",
        "especialidades": "Áreas...",
        "diferencial": "Texto do diferencial..."
    }
    `;

        // Adiciona a instrução do sistema e o histórico + nova mensagem
        const contents = [{ role: 'user', parts: [{ text: systemPrompt }] }, ...formattedHistory, { role: "user", parts: [{ text: userMessage }] }];

        const geminiResponse = await fetchWithRetry(geminiUrl, {
            method: 'POST',
            body: JSON.stringify({
                contents: contents
            })
        });

        const aiText = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não entendi. Pode repetir?";

        // 4. Salvar histórico
        await supabase.from('mensagens').insert([
            { whatsapp_id: whatsappId, role: 'user', content: userMessage },
            { whatsapp_id: whatsappId, role: 'model', content: aiText }
        ]);

        let responseText = aiText;

        // Lógica de Extração e Salvamento Inteligente
        if (aiText.includes("[FINALIZADO]") || aiText.includes("{")) {
            try {
                // Tenta extrair JSON (mesmo com texto ao redor)
                const jsonMatch = aiText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const jsonString = jsonMatch[0];
                    const leadData = JSON.parse(jsonString);

                    // Salva os dados estruturados no banco
                    await supabase.from('leads').upsert({
                        whatsapp_id: whatsappId,
                        status: 'Briefing Concluído',
                        nome_advogado: leadData.nome_advogado,
                        nome_escritorio: leadData.nome_escritorio,
                        especialidades: leadData.especialidades,
                        diferencial: leadData.diferencial,
                        updated_at: new Date()
                    }, { onConflict: 'whatsapp_id' });

                    // Limpa a resposta para o usuário (remove o JSON)
                    responseText = aiText.replace(jsonString, "").replace("[FINALIZADO]", "").trim();
                    if (!responseText) responseText = "Obrigado! Recebi todos os seus dados. Nossa equipe entrará em contato em breve.";
                }
            } catch (jsonError) {
                console.error("Erro ao fazer parse do JSON do Gemini:", jsonError);
                // Fallback: Salva como erro mas mantém o fluxo
            }
        } else {
            // Apenas atualiza o timestamp se não terminou
            await supabase.from('leads').upsert({
                whatsapp_id: whatsappId,
                status: 'Em Aberto',
                updated_at: new Date()
            }, { onConflict: 'whatsapp_id', ignoreDuplicates: true });
        }

        // 5. Responder via Evolution API
        const evolutionUrl = `${config?.evolution_api_url}/message/sendText/${config?.evolution_instance}`;

        await fetch(evolutionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': config?.evolution_api_key || "" },
            body: JSON.stringify({ number: whatsappId, text: responseText || "Recebido." })
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Erro no Webhook:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}