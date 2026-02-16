// Caminho sugerido: app/api/webhook/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { createGroq } from '@ai-sdk/groq';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
    try {
        const body = await req.json();


        // 0. Log request for debugging
        await supabase.from('webhook_logs').insert({ payload: body, status: 'received' });

        // 1. Validar se é uma mensagem recebida da Evolution API
        if (body.event !== "messages.upsert") return NextResponse.json({ ok: true });

        const messageData = body.data.messages[0];
        if (messageData.key.fromMe) return NextResponse.json({ ok: true });

        const whatsappId = messageData.key.remoteJid;
        const userMessage = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text;

        if (!userMessage) return NextResponse.json({ ok: true });

        // 2. Buscar Configurações e Histórico no Supabase
        const { data: config } = await supabase.from('configuracoes').select('*').single();

        if (!config?.groq_api_key) {
            console.error("Groq API Key não configurada.");
            return NextResponse.json({ error: "API Key missing" }, { status: 500 });
        }

        const { data: history } = await supabase.from('mensagens')
            .select('role, content')
            .eq('whatsapp_id', whatsappId)
            .order('created_at', { ascending: true });

        // Mapeia histórico para o formato do AI SDK (user/assistant)
        // O banco salva 'model', o SDK usa 'assistant'
        const formattedHistory: any[] = history?.map(m => ({
            role: m.role === 'model' ? 'assistant' : 'user',
            content: m.content
        })) || [];

        // 3. Chamar Groq (openai/gpt-oss-120b) via AI SDK
        const groq = createGroq({
            apiKey: config.groq_api_key,
        });

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

        const { text: aiText } = await generateText({
            model: groq('openai/gpt-oss-120b'),
            system: systemPrompt,
            messages: [
                ...formattedHistory,
                { role: 'user', content: userMessage }
            ],
            temperature: 1,
            maxTokens: 8192,
        });

        // 4. Salvar histórico (usa 'model' para manter compatibilidade com banco existente)
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
                console.error("Erro ao fazer parse do JSON do Groq:", jsonError);
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

        // 5. Responder via Evolution API (com delay)
        const evolutionUrl = `${config?.evolution_api_url}/message/sendText/${config?.evolution_instance}`;

        await fetch(evolutionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': config?.evolution_api_key || ""
            },
            body: JSON.stringify({
                number: whatsappId,
                text: responseText || "Recebido.",
                delay: 1200 // Atraso de 1.2s para parecer digitação humana
            })
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Erro no Webhook:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
