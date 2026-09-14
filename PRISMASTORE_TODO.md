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

- [ ] **Passo 4 — Pedido e estoque**
  - [ ] Ao confirmar no WhatsApp, criar o pedido real no painel.
  - [ ] Reservar estoque do carrinho.
  - [ ] Exibir pedido como aguardando pagamento.
  - [ ] Alertar itens com menos de 3 unidades disponíveis.

- [ ] **Passo 5 — Pix**
  - [ ] Asaas Sandbox.
  - [ ] Pix dinâmico.
  - [ ] Webhook de pagamento.

- [ ] **Passo 6 — Operação**
  - [ ] Pago → embalar → enviado/em entrega → finalizado.
  - [ ] Enviar tracker/status ao cliente.
  - [ ] Enviar arte final aprovada.

- [ ] **Passo 7 — Relatórios**
  - [ ] Faturamento mensal real.
  - [ ] Pedidos e ticket médio.
  - [ ] Conta que recebeu cada pagamento.

- [ ] **Passo 8 — Backup e instalação**
  - [ ] Backup de `data/prismastore.db`.
  - [ ] Backup seguro de `.wwebjs_auth/`.
  - [ ] Rotina simples de backup/restauração.
