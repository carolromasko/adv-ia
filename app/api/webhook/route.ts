// Caminho sugerido: app/api/webhook/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { Redis } from '@upstash/redis';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Converter Markdown para formatação WhatsApp
function convertMarkdownToWhatsApp(text: string): string {
    return text
        // ** ou __ para *negrito*
        .replace(/\*\*(.+?)\*\*/g, '*$1*')
        .replace(/__(.+?)__/g, '*$1*')
        // * ou _ para _itálico_
        .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '_$1_')
        .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '_$1_')
        // ~~ para ~riscado~
        .replace(/~~(.+?)~~/g, '~$1~')
        // ` para `code`
        .replace(/`(.+?)`/g, '```$1```')
        // Remove # de headers
        .replace(/^#{1,6}\s+(.+)$/gm, '*$1*');
}

export async function POST(req: Request) {
    try {
        const body = await req.json();

        // 0. Log request for debugging
        const { data: logData } = await supabase.from('webhook_logs').insert({ payload: body, status: 'received' }).select().single();
        const logId = logData?.id;

        // 1. Validar se é uma mensagem recebida da Evolution API
        if (body.event !== "messages.upsert") {
            if (logId) await supabase.from('webhook_logs').update({ status: 'ignored_event' }).eq('id', logId);
            return NextResponse.json({ ok: true });
        }

        const messageData = body.data.messages?.[0] || body.data;

        if (!messageData || !messageData.key) {
            if (logId) await supabase.from('webhook_logs').update({ status: 'ignored_event' }).eq('id', logId);
            return NextResponse.json({ ok: true });
        }

        if (messageData.key.fromMe) {
            if (logId) await supabase.from('webhook_logs').update({ status: 'ignored_from_me' }).eq('id', logId);
            return NextResponse.json({ ok: true });
        }

        const whatsappId = messageData.key.remoteJid;
        let userMessage = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text;

        if (!userMessage) {
            if (logId) await supabase.from('webhook_logs').update({ status: 'ignored_no_text', payload: { ...body, message_data_debug: messageData } }).eq('id', logId);
            return NextResponse.json({ ok: true });
        }

        // BUFFER COM REDIS - Processamento inline
        const DEBOUNCE_SECONDS = 12;
        const bufferKey = `buffer:${whatsappId}`;
        const timestampKey = `timestamp:${whatsappId}`;

        // Verificar último timestamp
        const lastTimestamp = await redis.get(timestampKey);
        const now = Date.now();

        if (!lastTimestamp) {
            // PRIMEIRA MENSAGEM - Processar imediatamente
            console.log(`[Buffer] Primeira mensagem de ${whatsappId} - processando imediatamente`);
            await processMessages(whatsappId, userMessage, logId, body);

            // Marcar timestamp para próximas mensagens
            await redis.set(timestampKey, now);
            await redis.expire(timestampKey, DEBOUNCE_SECONDS + 5);

            return NextResponse.json({ processed: true, first_message: true });
        }

        const shouldProcess = (now - Number(lastTimestamp)) >= (DEBOUNCE_SECONDS * 1000);

        if (shouldProcess) {
            // PROCESSAR IMEDIATAMENTE
            const bufferedMessages = await redis.lrange(bufferKey, 0, -1);
            const allMessages = [...bufferedMessages, userMessage];
            const combinedMessage = allMessages.join('\n\n');

            console.log(`[Buffer] Processando ${allMessages.length} mensagens acumuladas`);

            // Limpar buffer e atualizar timestamp
            await redis.del(bufferKey);
            await redis.set(timestampKey, now);
            await redis.expire(timestampKey, DEBOUNCE_SECONDS + 5);

            // Processar (código inline)
            await processMessages(whatsappId, combinedMessage, logId, body);

            return NextResponse.json({ processed: true, messages_count: allMessages.length });
        } else {
            // ADICIONAR AO BUFFER
            await redis.rpush(bufferKey, userMessage);
            await redis.set(timestampKey, now);
            await redis.expire(bufferKey, DEBOUNCE_SECONDS + 5);
            await redis.expire(timestampKey, DEBOUNCE_SECONDS + 5);

            const bufferCount = await redis.llen(bufferKey);
            console.log(`[Buffer] Mensagem adicionada. Total: ${bufferCount}. Aguardando ${DEBOUNCE_SECONDS}s...`);

            if (logId) await supabase.from('webhook_logs').update({
                status: 'buffered',
                payload: { ...body, buffer_count: bufferCount }
            }).eq('id', logId);

            return NextResponse.json({ buffered: true, buffer_count: bufferCount });
        }

    } catch (error: any) {
        console.error("Erro no Webhook:", error);
        await supabase.from('webhook_logs').insert({ payload: { error: error.message || String(error) }, status: 'critical_error' });
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

async function processMessages(whatsappId: string, combinedMessage: string, logId: number | undefined, body: any) {
    // Verificar se IA está pausada para este lead
    const { data: leadData } = await supabase.from('leads')
        .select('ai_paused')
        .eq('whatsapp_id', whatsappId)
        .single();

    if (leadData?.ai_paused) {
        console.log(`[AI] IA pausada para ${whatsappId} - não processando mensagem`);
        if (logId) await supabase.from('webhook_logs').update({ status: 'ai_paused' }).eq('id', logId);
        return;
    }

    // Buscar configurações
    const { data: config } = await supabase.from('configuracoes').select('*').single();
    if (!config?.groq_api_key) {
        console.error('Groq API Key não configurada');
        return;
    }

    if (logId) await supabase.from('webhook_logs').update({ status: 'generating_ai' }).eq('id', logId);

    // Buscar histórico
    const { data: history } = await supabase.from('mensagens')
        .select('role, content')
        .eq('whatsapp_id', whatsappId)
        .order('created_at', { ascending: true });

    const formattedHistory: any[] = history?.map(m => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: m.content
    })) || [];

    // Chamar IA
    const groq = createGroq({ apiKey: config.groq_api_key });

    // Usar prompt do banco ou fallback para o padrão
    const systemPrompt = config.system_prompt || `Você é um assistente oficial da ADV Digital. Colete briefing e retorne JSON ao final:
[FINALIZADO]
{"nome_advogado": "valor", "nome_escritorio": "valor", "especialidades": "valor", "diferencial": "valor"}`;

    let aiResponseText = "";
    try {
        const { text } = await generateText({
            model: groq('openai/gpt-oss-120b'),
            system: systemPrompt,
            messages: [
                ...formattedHistory,
                { role: 'user', content: combinedMessage }
            ],
            temperature: 0.7,
            maxTokens: 1024,
        });
        aiResponseText = text;

        if (logId) await supabase.from('webhook_logs').update({ status: 'ai_generated', payload: { ...body, ai_response: aiResponseText } }).eq('id', logId);
    } catch (error: any) {
        console.error("Erro na geração IA:", error);
        if (logId) await supabase.from('webhook_logs').update({ status: 'error_ai_generation', payload: { ...body, error: error.message } }).eq('id', logId);
        aiResponseText = "Mensagem recebida, porém com erro. Nossa equipe verificará em breve.";
    }

    // Salvar histórico
    await supabase.from('mensagens').insert([
        { whatsapp_id: whatsappId, role: 'user', content: combinedMessage },
        { whatsapp_id: whatsappId, role: 'model', content: aiResponseText }
    ]);

    let responseText = aiResponseText;

    // Verificar se finalizou
    if (aiResponseText.includes("[FINALIZADO]") || aiResponseText.includes("{")) {
        try {
            const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const jsonString = jsonMatch[0];
                const leadData = JSON.parse(jsonString);

                await supabase.from('leads').upsert({
                    whatsapp_id: whatsappId,
                    status: 'Briefing Concluído',
                    nome_advogado: leadData.nome_advogado,
                    nome_escritorio: leadData.nome_escritorio,
                    especialidades: leadData.especialidades,
                    diferencial: leadData.diferencial,
                    ai_paused: true, // PAUSAR IA após briefing
                    updated_at: new Date()
                }, { onConflict: 'whatsapp_id' });

                console.log(`[AI] Briefing finalizado para ${whatsappId} - IA pausada automaticamente`);

                responseText = aiResponseText.replace(jsonString, "").replace("[FINALIZADO]", "").trim();
                if (!responseText) responseText = "Obrigado! Recebi todos os seus dados. Nossa equipe entrará em contato em breve.";
            }
        } catch (error) {
            console.error("Erro ao fazer parse do JSON:", error);
        }
    } else {
        await supabase.from('leads').upsert({
            whatsapp_id: whatsappId,
            status: 'Em Aberto',
            updated_at: new Date()
        }, { onConflict: 'whatsapp_id', ignoreDuplicates: true });
    }

    // Enviar resposta
    if (logId) await supabase.from('webhook_logs').update({ status: 'sending_evolution' }).eq('id', logId);

    const evolutionUrl = `${config?.evolution_api_url} /message/sendText / ${config?.evolution_instance} `;
    const number = whatsappId.replace('@s.whatsapp.net', '');

    // Converter Markdown para formatação WhatsApp antes de enviar
    responseText = convertMarkdownToWhatsApp(responseText || "");

    const evoBody = {
        number: number,
        text: responseText || "Recebido.",
        delay: 1200
    };

    const evoResponse = await fetch(evolutionUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': config?.evolution_api_key || ""
        },
        body: JSON.stringify(evoBody)
    });

    if (!evoResponse.ok) {
        console.error('[Evolution] Erro:', await evoResponse.text());
        if (logId) await supabase.from('webhook_logs').update({ status: 'error_evolution_api' }).eq('id', logId);
    } else {
        console.log(`[Evolution] Mensagem enviada para ${whatsappId} `);
        if (logId) await supabase.from('webhook_logs').update({ status: 'sent_to_user' }).eq('id', logId);
    }
}
