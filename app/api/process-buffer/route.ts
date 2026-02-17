// Endpoint chamado pelo QStash para processar buffer
import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { Redis } from '@upstash/redis';
import { createClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { createGroq } from '@ai-sdk/groq';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function handler(req: Request) {
    try {
        const { whatsappId } = await req.json();

        console.log(`[QStash] Processando buffer de ${whatsappId}`);

        // Buscar mensagens do Redis
        const messages = await redis.lrange(`buffer:${whatsappId}`, 0, -1);

        if (!messages || messages.length === 0) {
            console.log(`[QStash] Buffer vazio para ${whatsappId}`);
            return NextResponse.json({ ok: true, processed: 0 });
        }

        const combinedMessage = messages.join('\n\n');
        console.log(`[QStash] ${messages.length} mensagens acumuladas`);

        // Limpar buffer do Redis
        await redis.del(`buffer:${whatsappId}`);
        await redis.del(`schedule:${whatsappId}`);

        // Buscar configurações
        const { data: config } = await supabase.from('configuracoes').select('*').single();
        if (!config?.groq_api_key) {
            console.error('[QStash] Groq API Key não configurada');
            return NextResponse.json({ error: 'Config missing' }, { status: 500 });
        }

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
                    ...formattedHistory,
                    { role: 'user', content: combinedMessage }
                ],
                temperature: 0.7,
                maxTokens: 1024,
            });
            aiResponseText = text;
            console.log(`[QStash] IA respondeu: ${aiResponseText.substring(0, 100)}...`);
        } catch (error: any) {
            console.error("[QStash] Erro na geração IA:", error);
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
                        updated_at: new Date()
                    }, { onConflict: 'whatsapp_id' });

                    responseText = aiResponseText.replace(jsonString, "").replace("[FINALIZADO]", "").trim();
                    if (!responseText) responseText = "Obrigado! Recebi todos os seus dados. Nossa equipe entrará em contato em breve.";
                }
            } catch (error) {
                console.error("[QStash] Erro ao fazer parse do JSON:", error);
            }
        } else {
            await supabase.from('leads').upsert({
                whatsapp_id: whatsappId,
                status: 'Em Aberto',
                updated_at: new Date()
            }, { onConflict: 'whatsapp_id', ignoreDuplicates: true });
        }

        // Enviar resposta via Evolution API
        const evolutionUrl = `${config?.evolution_api_url}/message/sendText/${config?.evolution_instance}`;
        const number = whatsappId.replace('@s.whatsapp.net', '');

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
            console.error('[QStash] Erro ao enviar Evolution:', await evoResponse.text());
        } else {
            console.log(`[QStash] Mensagem enviada com sucesso para ${whatsappId}`);
        }

        return NextResponse.json({ ok: true, processed: messages.length });
    } catch (error: any) {
        console.error('[QStash] Erro:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const POST = verifySignatureAppRouter(handler);
