# Status do MVP

## Concluído

### Passo 1 — Persistência local

- Servidor Node único.
- SQLite em `data/prismastore.db`.
- Painel lê e grava via `/api/state`.

### Passo 2 — WhatsApp Web

- `whatsapp-web.js` + `LocalAuth`.
- QR Code e estado de conexão no painel.
- Reconexão ao iniciar.

### Passo 3 — Atendimento automático

- Evento real de mensagem ligado ao chatbot.
- Boas-vindas, cardápio, carrinho, modalidade e endereço.
- Sessão persistida e fallback de mídia para texto.

### Passo 4 — Pedido e reserva de estoque

- Confirmação cria exatamente um pedido `PAYMENT_PENDING`.
- Estoque é reservado atomicamente.
- Repetição da confirmação não duplica pedido nem reserva.
- Estoque é revalidado no instante da confirmação.
- Sessões antigas do Passo 3 ganham `checkoutId` automaticamente.
- Pedido aparece no painel por atualização automática a cada 2 segundos.
- Fila `Aguardando Pix` identifica pedidos recém-confirmados.
- Estoque disponível reflete reservas e alerta abaixo de 3 unidades.

### Passo 5 — Pix dinâmico + webhook

- Asaas Sandbox configurável por `.env`.
- Cliente Asaas criado/reutilizado por `asaasCustomerId`.
- CPF/CNPJ bruto não é persistido no PrismaStore.
- Cobrança PIX idempotente por pedido.
- QR Code Base64 e Pix Copia e Cola enviados pelo WhatsApp.
- Webhook autenticado em `POST /api/webhooks/asaas`.
- `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` mudam o pedido para `PAID`.
- O estoque reservado é baixado do estoque físico apenas uma vez.
- Cliente é notificado pelo WhatsApp após confirmação.

## Próximo

### Passo 6 — Operação e tracker
