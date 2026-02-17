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
        const { data: logData } = await supabase.from('webhook_logs').insert({ payload: body, status: 'received' }).select().single();
        const logId = logData?.id;

        // 1. Validar se é uma mensagem recebida da Evolution API
        if (body.event !== "messages.upsert") {
            if (logId) await supabase.from('webhook_logs').update({ status: 'ignored_event' }).eq('id', logId);
            return NextResponse.json({ ok: true });
        }

        // Tenta extrair a mensagem de maneiras diferentes (array ou objeto direto)
        const messageData = body.data.messages?.[0] || body.data;

        if (!messageData || !messageData.key) {
            console.log("Estrutura de mensagem inválida ou evento ignorado.");
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
            console.log("Mensagem sem texto.");
            if (logId) await supabase.from('webhook_logs').update({ status: 'ignored_no_text', payload: { ...body, message_data_debug: messageData } }).eq('id', logId);
            return NextResponse.json({ ok: true });
        }

        // SISTEMA DE BUFFER - Acumular mensagens por 12 segundos
        const DEBOUNCE_SECONDS = 12;
        const now = new Date();
        const processAfter = new Date(now.getTime() + DEBOUNCE_SECONDS * 1000);

        // Verificar buffer existente
        const { data: existingBuffer } = await supabase
            .from('message_buffer')
            .select('*')
            .eq('whatsapp_id', whatsappId)
            .single();

        if (existingBuffer) {
            const shouldProcessNow = new Date(existingBuffer.should_process_after) <= now;

            if (!shouldProcessNow) {
                // Ainda não passou o tempo, acumular mensagem
                const updatedMessages = [...(existingBuffer.messages || []), userMessage];
                await supabase
                    .from('message_buffer')
                    .update({
                        messages: updatedMessages,
                        last_message_at: now,
                        should_process_after: processAfter,
                        updated_at: now
                    })
                    .eq('whatsapp_id', whatsappId);

                console.log(`Mensagem adicionada ao buffer (${updatedMessages.length} total). Aguardando silêncio...`);
                if (logId) await supabase.from('webhook_logs').update({ status: 'buffered', payload: { ...body, buffer_count: updatedMessages.length } }).eq('id', logId);
                return NextResponse.json({ queued: true, buffer_count: updatedMessages.length });
            } else {
                // Passou o tempo, processar buffer + mensagem atual
                const allMessages = [...(existingBuffer.messages || []), userMessage];
                const combinedMessage = allMessages.join('\n\n');

                console.log(`Processando ${allMessages.length} mensagens acumuladas do buffer`);

                // Limpar buffer
                await supabase.from('message_buffer').delete().eq('whatsapp_id', whatsappId);

                // Usar mensagem combinada
                userMessage = combinedMessage;
                if (logId) await supabase.from('webhook_logs').update({ payload: { ...body, processed_buffer: allMessages.length } }).eq('id', logId);
            }
        } else {
            // Primeiro registro, criar buffer
            await supabase.from('message_buffer').insert({
                whatsapp_id: whatsappId,
                messages: [userMessage],
                last_message_at: now,
                should_process_after: processAfter
            });

            console.log("Primeira mensagem no buffer. Aguardando silêncio...");
            if (logId) await supabase.from('webhook_logs').update({ status: 'buffered', payload: { ...body, buffer_count: 1 } }).eq('id', logId);
            return NextResponse.json({ queued: true, buffer_count: 1 });
        }

        // 2. Buscar Configurações e Histórico no Supabase
        if (logId) await supabase.from('webhook_logs').update({ status: 'fetching_data' }).eq('id', logId);

        const { data: config } = await supabase.from('configuracoes').select('*').single();

        if (!config?.groq_api_key) {
            console.error("Groq API Key não configurada.");
            if (logId) await supabase.from('webhook_logs').update({ status: 'error_no_api_key' }).eq('id', logId);
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
        if (logId) await supabase.from('webhook_logs').update({ status: 'generating_ai' }).eq('id', logId);

        const groq = createGroq({
            apiKey: config.groq_api_key,
        });

        // Debug Log
        console.log("Chamando Groq AI para:", userMessage);

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

        let aiResponseText = "";
        try {
            const { text } = await generateText({
                model: groq('openai/gpt-oss-120b'),
                system: systemPrompt,
                messages: [
                    ...formattedHistory, // Histórico formatado
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.7, // Reduzi um pouco a temperatura para ser mais focado
                maxTokens: 1024,
            });
            aiResponseText = text;

            // Atualiza log com sucesso da IA, salvando a resposta gerada para debug
            if (logId) await supabase.from('webhook_logs').update({ status: 'ai_generated', payload: { ...body, ai_response: aiResponseText } }).eq('id', logId);
        } catch (aiError: any) {
            console.error("Erro na Geração da IA:", aiError);
            if (logId) await supabase.from('webhook_logs').update({ status: 'error_ai_generation', payload: { ...body, error: aiError.message || String(aiError) } }).eq('id', logId);
            // Define mensagem de fallback ao invés de retornar erro
            aiResponseText = "Mensagem recebida, porém com erro. Nossa equipe verificará em breve.";
        }





        // 4. Salvar histórico (usa 'model' para manter compatibilidade com banco existente)
        await supabase.from('mensagens').insert([
            { whatsapp_id: whatsappId, role: 'user', content: userMessage },
            { whatsapp_id: whatsappId, role: 'model', content: aiResponseText }
        ]);

        let responseText = aiResponseText;

        // Lógica de Extração e Salvamento Inteligente
        if (aiResponseText.includes("[FINALIZADO]") || aiResponseText.includes("{")) {
            try {
                // Tenta extrair JSON (mesmo com texto ao redor)
                const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
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
                    responseText = aiResponseText.replace(jsonString, "").replace("[FINALIZADO]", "").trim();
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
        if (logId) await supabase.from('webhook_logs').update({ status: 'sending_evolution' }).eq('id', logId);

        const evolutionUrl = `${config?.evolution_api_url}/message/sendText/${config?.evolution_instance}`;

        // Remover sufixo do número se existir, para garantir compatibilidade
        const number = whatsappId.replace('@s.whatsapp.net', '');

        const evoBody = {
            number: number,
            text: responseText || "Recebido.",
            delay: 1200
        };

        console.log("Enviando para Evolution:", evolutionUrl, evoBody);
        console.log("Headers:", { 'Content-Type': 'application/json', 'apikey': config?.evolution_api_key ? '***' : 'VAZIO' });

        const evoResponse = await fetch(evolutionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': config?.evolution_api_key || ""
            },
            body: JSON.stringify(evoBody)
        });

        console.log("Evolution Response Status:", evoResponse.status, evoResponse.statusText);
        const evoResponseText = await evoResponse.text();
        console.log("Evolution Response Body:", evoResponseText);

        if (!evoResponse.ok) {
            console.error("Erro Evolution API - Status:", evoResponse.status);
            console.error("Erro Evolution API - Body:", evoResponseText);
            if (logId) await supabase.from('webhook_logs').update({
                status: 'error_evolution_api',
                payload: {
                    ...body,
                    evolution_payload: evoBody,
                    evolution_response_status: evoResponse.status,
                    evolution_error: evoResponseText
                }
            }).eq('id', logId);
        } else {
            console.log("Envio Evolution OK - Resposta:", evoResponseText);
            if (logId) await supabase.from('webhook_logs').update({
                status: 'sent_to_user',
                payload: {
                    ...body,
                    evolution_payload: evoBody,
                    evolution_response: evoResponseText
                }
            }).eq('id', logId);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Erro no Webhook:", error);
        // Tenta logar o erro geral se possível, mas sem acesso ao ID do log original se falhou antes
        await supabase.from('webhook_logs').insert({ payload: { error: error.message || String(error) }, status: 'critical_error' });
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
