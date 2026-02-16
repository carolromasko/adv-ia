# ADVFLOW - Agente de IA para Advocacia

Este projeto é uma aplicação web desenvolvida em **Next.js** que atua como um sistema de automação de atendimento e gestão de leads para escritórios de advocacia. Ele utiliza Inteligência Artificial (**Google Gemini**) para interagir com clientes via **WhatsApp** (através da Evolution API), qualificando leads e coletando informações iniciais (briefing).

## 🚀 Funcionalidades

### 1. Dashboard Administrativo (`app/page.jsx`)
Uma interface moderna e responsiva para acompanhamento em tempo real:
*   **Métricas**: Visualização de Total de Leads, Leads em Aberto e Taxa de Conversão.
*   **Lista de Leads**: Tabela com nome do advogado, status (ex: "Em Produção", "Aguardando Dados"), data e ações rápidas.
*   **Configurações**: Área para gerenciar as chaves de API do Gemini e da Evolution API, além da URL da instância do WhatsApp.

### 2. Agente de IA via Webhook (`app/api/webhook/route.ts`)
Um endpoint de API que processa mensagens recebidas do WhatsApp:
*   **Interação Natural**: Utiliza o modelo `Gemini 2.5 Flash` para conversar com o cliente como um assistente de vendas da "ADV Digital".
*   **Coleta de Dados**: O assistente é instruído a coletar progressivamente:
    *   Nome do Advogado
    *   Nome do Escritório
    *   Áreas de Atuação
    *   Principal Diferencial
*   **Persistência**: Salva todo o histórico de conversa e o status do lead no **Supabase**.
*   **Retry Logic**: Implementa lógica de re-tentativa (exponential backoff) para chamadas de API externas, garantindo robustez.

## 🛠️ Tecnologias Utilizadas

*   **Frontend**: React, Next.js (App Router), Tailwind CSS, Lucide React (ícones).
*   **Backend**: Next.js API Routes.
*   **Banco de Dados**: Supabase (PostgreSQL).
*   **IA**: Google Gemini 2.5 Flash Preview.
*   **Mensageria**: Evolution API (Integração com WhatsApp).

## ⚙️ Configuração do Ambiente

Para rodar este projeto, você precisará configurar as variáveis de ambiente e o banco de dados.

### Variáveis de Ambiente (`.env`)
Certifique-se de ter um arquivo `.env` na raiz do projeto com as credenciais do Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=sua_url_do_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima_do_supabase
```

### Estrutura do Banco de Dados (Supabase)
O sistema espera as seguintes tabelas no Supabase:

1.  **`configuracoes`**:
    *   `gemini_api_key`: Chave da API do Google Gemini.
    *   `evolution_api_url`, `evolution_api_key`, `evolution_instance`: Credenciais da Evolution API.

2.  **`mensagens`**:
    *   `whatsapp_id`: ID do usuário no WhatsApp.
    *   `role`: 'user' ou 'model'.
    *   `content`: Conteúdo da mensagem.
    *   `created_at`: Data e hora.

3.  **`leads`**:
    *   `whatsapp_id`: Identificador do lead.
    *   `status`: Status atual (ex: 'Briefing Concluído').
    *   Outros campos conforme necessidade.

## 📦 Como Usar

1.  **Instalação**: Instale as dependências (assumindo que há um `package.json` configurado):
    ```bash
    npm install
    ```

2.  **Execução**: Inicie o servidor de desenvolvimento:
    ```bash
    npm run dev
    ```

3.  **Webhook**: Configure a URL do seu webhook na Evolution API para apontar para `https://seu-dominio.com/api/webhook`.

## 📝 Notas sobre o Código

*   **`app/page.jsx`**: Contém a lógica de UI, incluindo mocks de dados para visualização inicial e formulários de configuração.
*   **`app/api/webhook/route.ts`**: Contém a lógica de negócios do bot, incluindo a integração com o Gemini e o controle de fluxo da conversa.
