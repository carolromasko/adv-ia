-- Execute esse script no Editor SQL do seu Supabase Dashboard
-- 1. Habilitar RLS em todas as tabelas (boa prática)
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
-- 2. Criar políticas permissivas para acesso público/anônimo
-- NOTA: Em produção, você deve restringir isso para usuários autenticados,
-- mas para este MVP funcionar sem login, vamos permitir acesso total.
-- Políticas para 'configuracoes'
CREATE POLICY "Permitir leitura pública de configuracoes" ON public.configuracoes FOR
SELECT USING (true);
CREATE POLICY "Permitir inserção e atualização pública de configuracoes" ON public.configuracoes FOR ALL USING (true) WITH CHECK (true);
-- Políticas para 'mensagens'
CREATE POLICY "Permitir acesso total a mensagens" ON public.mensagens FOR ALL USING (true) WITH CHECK (true);
-- Políticas para 'leads'
CREATE POLICY "Permitir acesso total a leads" ON public.leads FOR ALL USING (true) WITH CHECK (true);