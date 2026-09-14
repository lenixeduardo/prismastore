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

### Passo 6 — Operação e tracker

- Painel avança pedidos por API, sem alterar status diretamente no navegador.
- `expectedStatus` impede avanço duplicado em retentativas.
- `PAID → PACKING`.
- Entrega local: `PACKING → OUT_FOR_DELIVERY → DELIVERED`.
- Envio: `PACKING → SHIPPED → DELIVERED`.
- Cada mudança dispara um tracker de quatro etapas no WhatsApp.
- Finalização envia a arte padrão `assets/prismastore-order-finished.b64 (reconstruída como PNG local ao iniciar)`.
- `statusHistory` registra as transições operacionais.
- Confirmação do Asaas também usa o tracker do ciclo do pedido.

### Passo 7 — Relatórios reais

- Faturamento mensal calculado a partir de `paidAt`, independentemente do status operacional atual.
- Pedidos pagos e ticket médio reais.
- Faturamento diário do mês selecionado.
- Totais agrupados pela conta recebedora registrada no pagamento.
- Seleção de mês no painel.
- JSON em `GET /api/reports/monthly?month=YYYY-MM`.
- CSV em `GET /api/reports/monthly.csv?month=YYYY-MM`.

### Passo 8 — Backup, recuperação e instalação

- Snapshot consistente do SQLite usando `node:sqlite.backup`.
- Sessão LocalAuth do WhatsApp incluída quando existente.
- Manifesto de integridade com SHA-256 e tamanho dos arquivos.
- Restauração bloqueada quando o backup está corrompido ou o id é inseguro.
- Backup automático `pre-restore` antes de qualquer restauração.
- Painel de Configurações cria, lista e restaura snapshots.
- Instalador Windows valida Node LTS, prepara dependências, `.env`, diretórios e inicializador na Área de Trabalho.
- Dados sensíveis e backups permanecem fora do Git.

## MVP 0.8.0

Passos 1 a 8 concluídos para homologação local. Antes de produção, validar políticas do WhatsApp, credenciais Asaas de produção, HTTPS público para webhook e rotina externa de cópia dos backups.
