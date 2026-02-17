-- Criar tabela para buffer de mensagens
CREATE TABLE IF NOT EXISTS message_buffer (
    whatsapp_id TEXT PRIMARY KEY,
    messages JSONB NOT NULL DEFAULT '[]',
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    should_process_after TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Índice para buscar buffers prontos para processar
CREATE INDEX IF NOT EXISTS idx_buffer_ready ON message_buffer(should_process_after);
-- Comentários
COMMENT ON TABLE message_buffer IS 'Buffer de mensagens acumuladas aguardando processamento em lote';
COMMENT ON COLUMN message_buffer.should_process_after IS 'Timestamp após o qual as mensagens devem ser processadas';