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
- Estoque é reservado atomicamente e revalidado na confirmação.
- Retentativas não duplicam pedido nem reserva.
- Pedido aparece no painel por atualização automática.

### Passo 5 — Pix dinâmico + webhook
- Asaas Sandbox configurável por `.env`.
- Cliente Asaas reutilizado por `asaasCustomerId`.
- CPF/CNPJ bruto não é persistido.
- QR Code/Copia e Cola enviados pelo WhatsApp.
- Webhook autenticado muda o pedido para `PAID` e baixa o estoque uma vez.

### Passo 6 — Operação e tracker
- `PAID → PACKING`.
- Entrega local: `PACKING → OUT_FOR_DELIVERY → DELIVERED`.
- Envio: `PACKING → SHIPPED → DELIVERED`.
- Tracker no WhatsApp e arte final no encerramento.
- `expectedStatus` evita avanço duplicado.

### Passo 7 — Relatórios reais
- Faturamento por `paidAt`, ticket médio, total diário e por conta recebedora.
- Seleção de mês e exportação CSV.

### Passo 8 — Backup, recuperação e instalação
- Snapshot consistente do SQLite.
- Sessão LocalAuth incluída quando existente.
- SHA-256 por arquivo e validação pré-restauração.
- Backup `pre-restore` automático.
- Painel de backup/restauração e instalador Windows.

### Passo 9 — PWA Mobile
- Manifest instalável e ícones 192/512.
- Service worker com cache versionado somente do shell estático.
- `/api/` e dados operacionais nunca são atendidos pelo cache.
- Registro do worker somente em contexto seguro.
- Instalação Chromium e orientação para iPhone.
- Navegação mobile com aba Mais.
- Tabelas em cards, grids de uma coluna, drawers full-screen e safe area.
- Indicador de servidor online/indisponível.

## MVP 0.9.0

Passos 1 a 9 concluídos. O painel funciona responsivamente por navegador na rede local. Para instalação PWA real, usar HTTPS, localhost ou loopback; a configuração HTTPS externa deve permanecer protegida e é separada da lógica do MVP.
