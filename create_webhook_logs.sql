-- Tabela para logs de webhooks
CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    payload JSONB,
    status TEXT DEFAULT 'recebido'
);
-- Habilitar RLS
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
-- Política de leitura pública (para o dashboard)
CREATE POLICY "Permitir leitura logs" ON public.webhook_logs FOR
SELECT USING (true);
-- Política de inserção (para o webhook, que roda no server-side com a service role, mas definimos public para garantir)
CREATE POLICY "Permitir insercao logs" ON public.webhook_logs FOR
INSERT WITH CHECK (true);