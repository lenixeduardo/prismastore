# PrismaStore — MVP local

MVP operacional simplificado para rodar no mesmo computador/servidor: painel, SQLite, chatbot, WhatsApp Web e integração Pix ficam em um único processo Node.js.

## Arquitetura

```text
Cliente no WhatsApp
        │
        ▼
WhatsApp Web + LocalAuth
        │
        ▼
      Node.js único
      ├─ chatbot
      ├─ painel/API
      ├─ Asaas Pix
      └─ SQLite
        │
        └── POST /api/webhooks/asaas ← Asaas (HTTPS público)
```

Sem PostgreSQL, Redis, filas, microsserviços, ORM ou IA generativa no MVP.

## Requisitos

- Node.js 22.5+ (recomendado Node.js 24 LTS).
- Internet no computador que executa WhatsApp Web e Asaas.
- `data/`, `.wwebjs_auth/` e `.env` persistentes no servidor.

## Instalação

```bash
npm install
cp .env.example .env
npm start
```

No Windows, `INICIAR_PRISMASTORE.bat` instala dependências e abre `http://localhost:4173`.

## WhatsApp

Em **Configurações → WhatsApp Web**, clique em **Conectar WhatsApp** e leia o QR com **Aparelhos conectados**. A sessão fica em `.wwebjs_auth/` e é restaurada ao reiniciar.

## Fluxo atual — Passos 1 a 6

```text
mensagem
→ boas-vindas + cardápio
→ item + quantidade
→ envio/entrega + endereço
→ confirmação
→ pedido PAYMENT_PENDING + reserva de estoque
→ CPF/CNPJ do pagador (somente para o Asaas; não é persistido no PrismaStore)
→ Pix dinâmico + QR + Copia e Cola
→ webhook Asaas
→ PAID / Pago · Embalar
→ Em preparação
→ Enviado ou Saiu para entrega
→ Finalizado + arte final
```

O `checkoutId` impede duplicidade de pedido e a cobrança Asaas é reutilizada em retentativas. O webhook valida o ID da cobrança e o valor antes de liberar o pedido. Ao confirmar o pagamento, a reserva vira baixa de estoque físico e o cliente recebe uma mensagem automática no WhatsApp.

## Operação e tracker — Passo 6

Depois do pagamento, o operador avança o pedido pelo painel. Cada transição passa pela API local e notifica o cliente no WhatsApp com um tracker simples:

```text
✅ Pagamento confirmado
✅/○ Em preparação
✅/○ Pedido enviado ou Saiu para entrega
✅/○ Finalizado
```

O endpoint `POST /api/orders/:id/advance` recebe `expectedStatus`, impedindo que uma retentativa ou clique duplicado avance duas etapas. Para `local_delivery`, o fluxo é `PACKING → OUT_FOR_DELIVERY → DELIVERED`; para `shipping`, é `PACKING → SHIPPED → DELIVERED`. Ao chegar em `DELIVERED`, o WhatsApp envia a arte versionada em `assets/prismastore-order-finished.b64`, reconstruída como PNG local ao iniciar, antes da mensagem final.

## Configurar Asaas Sandbox

1. Crie uma conta separada no Sandbox do Asaas.
2. Copie `.env.example` para `.env`.
3. Preencha `ASAAS_API_KEY` com a chave Sandbox.
4. Gere `ASAAS_WEBHOOK_TOKEN` com 32–255 caracteres, sem espaços.
5. Configure no Asaas um webhook para `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED`, usando o mesmo token.
6. A URL do webhook deve ser HTTPS pública e terminar em `/api/webhooks/asaas`.

Exemplo:

```text
https://pagamentos.seudominio.com/api/webhooks/asaas
```

O painel mostra **Asaas · Sandbox · CONFIGURADO** quando API key e token local estão presentes.

> O PrismaStore pode continuar rodando no computador/servidor local, mas o Asaas precisa conseguir alcançar o endpoint do webhook pela internet. Use um domínio/reverse proxy HTTPS ou um túnel seguro durante a homologação.

## Persistência e segurança

Não entram no Git:

```text
.env
node_modules/
data/*.db
.wwebjs_auth/
```

O CPF/CNPJ recebido pelo WhatsApp é usado imediatamente para criar/reutilizar o pagador no Asaas; o PrismaStore persiste somente o `asaasCustomerId` retornado.

## Testes

```bash
npm test
```

> `whatsapp-web.js` é uma integração não oficial. Valide as políticas comerciais aplicáveis antes do uso em produção.
