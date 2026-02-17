// Caminho sugerido: app/api/webhook/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { Redis } from '@upstash/redis';
import { Client as QStashClient } from '@upstash/qstash';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const qstash = new QStashClient({
    token: process.env.QSTASH_TOKEN!,
});

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

        // SISTEMA DE BUFFER COM REDIS + QSTASH
        const DEBOUNCE_SECONDS = 12;
        const bufferKey = `buffer:${whatsappId}`;
        const scheduleKey = `schedule:${whatsappId}`;

        // Adicionar mensagem ao buffer Redis
        await redis.rpush(bufferKey, userMessage);
        const bufferCount = await redis.llen(bufferKey);

        console.log(`[Buffer] Mensagem adicionada. Total: ${bufferCount}`);

        // Cancelar agendamento anterior se existir
        const existingScheduleId = await redis.get(scheduleKey);
        if (existingScheduleId) {
            try {
                await qstash.messages.delete(existingScheduleId as string);
                console.log(`[QStash] Agendamento anterior cancelado: ${existingScheduleId}`);
            } catch (error) {
                console.log(`[QStash] Erro ao cancelar agendamento (pode já ter expirado):`, error);
            }
        }

        // Agendar novo processamento para daqui 12 segundos
        const processUrl = `${process.env.VERCEL_URL || 'https://adv-ia.vercel.app'}/api/process-buffer`;

        const scheduleResponse = await qstash.publishJSON({
            url: processUrl,
            delay: DEBOUNCE_SECONDS,
            body: { whatsappId },
        });

        // Salvar ID do agendamento
        await redis.set(scheduleKey, scheduleResponse.messageId, { ex: DEBOUNCE_SECONDS + 5 });

        console.log(`[QStash] Novo agendamento criado: ${scheduleResponse.messageId} (em ${DEBOUNCE_SECONDS}s)`);

        if (logId) await supabase.from('webhook_logs').update({
            status: 'buffered',
            payload: {
                ...body,
                buffer_count: bufferCount,
                schedule_id: scheduleResponse.messageId
            }
        }).eq('id', logId);

        return NextResponse.json({
            queued: true,
            buffer_count: bufferCount,
            will_process_in: `${DEBOUNCE_SECONDS}s`
        });

    } catch (error: any) {
        console.error("Erro no Webhook:", error);
        await supabase.from('webhook_logs').insert({ payload: { error: error.message || String(error) }, status: 'critical_error' });
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
