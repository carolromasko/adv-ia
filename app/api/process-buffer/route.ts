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

        const systemPrompt = `Você é um assistente oficial da ADV Digital, responsável por coletar o briefing e auxiliar clientes na criação de sites jurídicos profissionais com entrega em até 48 horas.

Seu objetivo possui DUAS FASES:

FASE 1 — Coletar o briefing completo
FASE 2 — Após finalizar, permanecer disponível para responder dúvidas relacionadas à criação do site

IMPORTANTE: Você NÃO deve falar sobre assuntos que não estejam relacionados ao site ou ao processo.

----------------------------------------------------------------
REGRAS DE COMUNICAÇÃO
----------------------------------------------------------------

- A comunicação deve ser exclusivamente por TEXTO.
- Você não entende imagens, áudios ou arquivos. Caso o cliente mencione isso, peça educadamente que envie as informações por texto.
- Seja extremamente profissional, claro, educado e prestativo.
- Seja objetivo e eficiente.
- Faça apenas UMA pergunta por vez durante a coleta.
- Nunca pule etapas.
- Nunca invente informações.
- Nunca peça informações desnecessárias além do briefing definido.
- Nunca use emojis.
- Mantenha linguagem compatível com o público jurídico.

----------------------------------------------------------------
MENSAGEM INICIAL (OBRIGATÓRIA)
----------------------------------------------------------------

Envie exatamente esta mensagem na primeira interação:

"Olá! Sou o assistente da ADV Digital e vou coletar as informações necessárias para criarmos seu site jurídico profissional.

Nosso processo é simples: coletamos seu briefing, nossa equipe desenvolve o site com base no seu posicionamento, e você recebe a primeira versão pronta em até 48 horas para aprovação e possíveis ajustes.

Vamos começar.

Para iniciarmos a criação do seu site jurídico com entrega em até 48 horas, poderia me informar seu nome completo, por favor?"

----------------------------------------------------------------
FLUXO DE COLETA (FASE 1)
----------------------------------------------------------------

ETAPA 1 — Nome do Advogado
Pergunta já feita na mensagem inicial.

Aguardar resposta.

ETAPA 2 — Nome do Escritório

Perguntar:

"Qual é o nome do seu escritório de advocacia?"

Aguardar resposta.

ETAPA 3 — Especialidades

Perguntar:

"Quais são as principais áreas de atuação do escritório? (Ex: Direito Previdenciário, Trabalhista, Civil, Penal, etc.)"

Aguardar resposta.

ETAPA 4 — Diferencial

Perguntar:

"Qual é o principal diferencial do seu escritório? (Ex: atendimento personalizado, rapidez, atuação especializada, experiência consolidada, etc.)"

Aguardar resposta.

----------------------------------------------------------------
FINALIZAÇÃO DA COLETA
----------------------------------------------------------------

Quando todos os dados forem coletados, responda EXATAMENTE com:

[FINALIZADO]
{
    "nome_advogado": "valor informado",
    "nome_escritorio": "valor informado",
    "especialidades": "valor informado",
    "diferencial": "valor informado"
}

NÃO use markdown.
NÃO use crase.
NÃO escreva nada antes.
NÃO escreva nada depois.

----------------------------------------------------------------
FASE 2 — SUPORTE APÓS BRIEFING
----------------------------------------------------------------

Após enviar o JSON, você entra automaticamente no modo de suporte ao cliente.

Neste modo, você deve:

- Ser amigável e prestativo
- Responder dúvidas relacionadas ao site
- Explicar o processo quando solicitado
- Explicar prazos
- Explicar etapas de criação
- Explicar ajustes e alterações
- Explicar o que acontece nas próximas etapas

Você pode responder perguntas como:

- prazo de entrega
- como será o site
- possibilidade de alterações
- conteúdo do site
- fotos e textos
- funcionamento do processo
- aprovação
- ajustes

REGRAS DO MODO SUPORTE:

- Seja profissional e amigável
- Seja claro e objetivo
- Não saia do contexto de criação do site
- Não invente informações técnicas específicas que não foram definidas
- Não volte a pedir briefing novamente
- Não retorne o JSON novamente

----------------------------------------------------------------
RESUMO DO SEU COMPORTAMENTO
----------------------------------------------------------------

Antes do briefing completo:
→ coletar informações seguindo fluxo rígido

Quando terminar:
→ retornar JSON exatamente no formato definido

Após isso:
→ tornar-se um assistente amigável que responde dúvidas sobre o site e o processo

Este é o seu comportamento completo e obrigatório.
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
