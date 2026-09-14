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
├── chatbot.js                fluxo determinístico de atendimento
├── app-server.js             API local + arquivos do painel
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
- O catálogo textual usa preço e estoque atuais; a arte é apenas apoio visual.
- As únicas modalidades são `shipping` (Envio) e `local_delivery` (Entrega no endereço). Não existe retirada.

## Dados persistentes

Não entram no Git:

```text
data/*.db
.wwebjs_auth/
```

O diretório `data/` é versionado apenas com `.gitkeep`.

## Fluxo implementado

1. Cliente envia uma mensagem privada.
2. O chatbot identifica/cadastra o telefone.
3. Envia boas-vindas e catálogo.
4. Cliente escolhe produto e quantidade.
5. O sistema valida o estoque disponível.
6. Cliente escolhe Envio ou Entrega no endereço.
7. Cliente reutiliza ou informa endereço.
8. O chatbot mostra a revisão.
9. Cliente confirma os dados.

A criação/reserva do pedido operacional começa no Passo 4; Pix real começa no Passo 5.
