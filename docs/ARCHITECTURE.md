# Arquitetura — PrismaStore MVP

## Objetivo

Manter a operação simples para um cliente sem domínio técnico de chatbot: um único computador/servidor executa painel, API, banco local e conexão ao WhatsApp Web.

## Componentes

```text
WhatsApp do cliente
       │
       ▼
whatsapp-web.js + LocalAuth
       │
       ▼
Node.js — server/index.js
├── whatsapp-manager.js       sessão, QR e status
├── whatsapp-chat-adapter.js  converte mensagens em eventos do chatbot
├── chatbot.js                fluxo determinístico + criação de pedido
├── app-server.js             API local + webhook Asaas
├── asaas-client.js           chamadas REST do Asaas
├── payment-service.js        Pix + conciliação + baixa de estoque
└── state-store.js            persistência SQLite
       │
       ▼
data/prismastore.db

Navegador → index.html + src/app.js → /api/*
```

## Decisões do MVP

- Sem PostgreSQL.
- Sem Redis/BullMQ.
- Sem microsserviços.
- Sem ORM.
- Sem IA generativa no atendimento principal.
- SQLite é a fonte de verdade local.
- `LocalAuth` mantém a sessão do WhatsApp em `.wwebjs_auth/`.
- Conversas são persistidas por telefone na tabela `chat_sessions`.
- Cada checkout recebe `checkoutId` para garantir idempotência.
- A confirmação cria pedido `PAYMENT_PENDING` e reserva estoque numa atualização atômica.
- O catálogo textual usa preço e estoque atuais; a arte é apenas apoio visual.
- As únicas modalidades são `shipping` e `local_delivery`. Não existe retirada.

## Dados persistentes

Não entram no Git:

```text
data/*.db
.wwebjs_auth/
```

O diretório `data/` é versionado apenas com `.gitkeep`.


## Pagamentos

- Sandbox por padrão: `https://api-sandbox.asaas.com/v3`.
- Segredos ficam somente em `.env`.
- O Asaas autentica o webhook pelo header `asaas-access-token`.
- O webhook precisa de uma URL HTTPS pública; isso é requisito de rede, não um novo serviço interno do PrismaStore.
- O pagamento só libera o pedido quando o ID da cobrança e o valor conferem.
