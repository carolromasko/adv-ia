-- Execute esse script no Editor SQL do seu Supabase Dashboard para adicionar a coluna da Groq
ALTER TABLE public.configuracoes
ADD COLUMN IF NOT EXISTS groq_api_key text;
-- (Opcional) Você pode remover a coluna antiga se quiser limpar o banco
-- ALTER TABLE public.configuracoes DROP COLUMN gemini_api_key;