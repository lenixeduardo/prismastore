# Status do MVP

## Concluído

### Passo 1 — Persistência local

- Servidor Node único.
- SQLite em `data/prismastore.db`.
- Produtos, clientes e pedidos no estado operacional.
- Painel lê e grava via `/api/state`.

### Passo 2 — WhatsApp Web

- `whatsapp-web.js`.
- `LocalAuth` persistente.
- QR Code e estado de conexão no painel.
- Reconexão ao iniciar o PrismaStore.

### Passo 3 — Atendimento automático

- Evento real de mensagem do WhatsApp conectado ao chatbot.
- Mensagens próprias e grupos ignorados.
- Boas-vindas e cardápio visual.
- Menu textual dinâmico.
- Carrinho com validação de estoque.
- Envio/Entrega no endereço.
- Endereço salvo/novo.
- Sessão persistida para retomar após reinício.
- Fallback para texto se uma imagem não puder ser enviada.

## Em andamento

### Passo 4 — Pedido e reserva de estoque

Critério de conclusão:

- confirmação do WhatsApp cria exatamente um pedido `PAYMENT_PENDING`;
- estoque do carrinho é reservado atomicamente;
- repetição da confirmação não duplica pedido nem reserva;
- pedido aparece imediatamente no painel;
- estoque disponível reflete a reserva e alerta abaixo de 3 unidades.

## Depois

- Passo 5: Pix dinâmico + webhook.
- Passo 6: operação pós-pagamento e tracker.
- Passo 7: relatórios reais.
- Passo 8: backup/restauração e instalação final.
