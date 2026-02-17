-- Adicionar campo para pausar IA
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS ai_paused BOOLEAN DEFAULT false;
-- Comentário
COMMENT ON COLUMN leads.ai_paused IS 'Indica se a IA está pausada para este lead (não responderá automaticamente)';