// Endpoint para reativar IA de um lead
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
    try {
        const { whatsapp_id } = await req.json();

        if (!whatsapp_id) {
            return NextResponse.json({ error: 'whatsapp_id é obrigatório' }, { status: 400 });
        }

        // Reativar IA
        const { error } = await supabase
            .from('leads')
            .update({ ai_paused: false })
            .eq('whatsapp_id', whatsapp_id);

        if (error) {
            console.error('Erro ao reativar IA:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        console.log(`[AI] IA reativada para ${whatsapp_id}`);
        return NextResponse.json({ success: true, message: 'IA reativada com sucesso' });

    } catch (error: any) {
        console.error('Erro no endpoint reativar-ia:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
