# PrismaStore — To-Do simplificado do MVP

## Concluído

- [x] **Passo 1 — Persistência local real**
  - [x] Um único servidor Node.js.
  - [x] SQLite local em `data/prismastore.db`.
  - [x] Produtos, clientes e pedidos persistidos no servidor.
  - [x] Painel sem `localStorage` como fonte de verdade.

- [x] **Passo 2 — Conexão simples ao WhatsApp Web**
  - [x] `whatsapp-web.js` no mesmo processo do PrismaStore.
  - [x] `LocalAuth` persistente em `.wwebjs_auth/`.
  - [x] Reconexão automática ao reiniciar.
  - [x] QR Code e status dentro do painel.

- [x] **Passo 3 — Atendimento automatizado real**
  - [x] Recebe mensagens do WhatsApp pelo evento `message`.
  - [x] Ignora mensagens enviadas pela própria conta e conversas de grupo.
  - [x] Envia a arte de boas-vindas como primeira resposta.
  - [x] Envia a arte do cardápio e um menu textual dinâmico com preço/estoque atuais.
  - [x] Guia item → quantidade → adicionar/finalizar → modalidade → endereço → confirmação.
  - [x] Permite reutilizar o último endereço de clientes existentes.
  - [x] Cadastra automaticamente cliente pelo número do WhatsApp.
  - [x] Persiste a etapa da conversa no SQLite para continuar após reinício.
  - [x] Impede adicionar ao carrinho quantidade maior que o estoque disponível.
  - [x] Continua por texto se uma arte não puder ser enviada.
  - [x] Comandos de recuperação: `MENU`, `INICIO`, `REINICIAR` e `CANCELAR`.

## Próximos passos

- [x] **Passo 4 — Pedido e estoque**
  - [x] Ao confirmar no WhatsApp, criar exatamente um pedido real no painel.
  - [x] Reservar estoque do carrinho atomicamente.
  - [x] Exibir pedido como aguardando pagamento.
  - [x] Impedir confirmação duplicada e reserva duplicada.
  - [x] Revalidar estoque no momento da confirmação.
  - [x] Atualizar o painel automaticamente sem recarregar a página.
  - [x] Alertar itens com menos de 3 unidades disponíveis.

- [x] **Passo 5 — Pix**
  - [x] Asaas Sandbox via `.env`.
  - [x] Cliente/pagador Asaas reutilizável sem persistir CPF/CNPJ bruto.
  - [x] Pix dinâmico com QR Code e Copia e Cola no WhatsApp.
  - [x] Webhook autenticado (`asaas-access-token`).
  - [x] `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` → `PAID` / Pago · Embalar.
  - [x] Baixa definitiva do estoque reservado após pagamento.
  - [x] Notificação automática de pagamento confirmado no WhatsApp.

- [x] **Passo 6 — Operação**
  - [x] Pago → embalar → enviado/em entrega → finalizado.
  - [x] Enviar tracker/status ao cliente em cada mudança.
  - [x] Enviar arte final aprovada ao finalizar.
  - [x] Transições idempotentes com `expectedStatus`.
  - [x] Histórico de status salvo no pedido.

- [x] **Passo 7 — Relatórios**
  - [x] Faturamento mensal real baseado em `paidAt`.
  - [x] Pedidos pagos e ticket médio.
  - [x] Faturamento por dia.
  - [x] Conta que recebeu cada pagamento.
  - [x] Seleção de mês no painel.
  - [x] Exportação CSV pelo mesmo cálculo do relatório.

- [ ] **Passo 8 — Backup e instalação**
  - [ ] Backup de `data/prismastore.db`.
  - [ ] Backup seguro de `.wwebjs_auth/`.
  - [ ] Rotina simples de backup/restauração.
