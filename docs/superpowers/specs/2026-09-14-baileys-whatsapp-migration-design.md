# PrismaStore — Migração da camada WhatsApp para Baileys

Data: 2026-09-14
Status: design aprovado em conversa; aguardando revisão final da spec
Branch: `feat/baileys-whatsapp-migration`

## 1. Objetivo

Substituir a integração atual baseada em `whatsapp-web.js` por uma integração baseada em `@whiskeysockets/baileys`, usando como referência o padrão operacional já utilizado no repositório `lenixeduardo/pirattas`.

A mudança deve reduzir risco de respostas disparadas por sincronização/replay de mensagens antigas, manter cada resposta vinculada exclusivamente ao remetente do evento atual e preservar o fluxo existente do PrismaStore: catálogo real, carrinho, entrega/envio, endereço, pedido, estoque, Pix Asaas e confirmação automática de pagamento.

## 2. Princípios da migração

1. O transporte WhatsApp muda; o domínio do PrismaStore não muda.
2. Nenhuma resposta do chatbot pode selecionar destinatário a partir da lista de clientes.
3. O destinatário de toda resposta de uma execução deve ser o mesmo `remoteJid` do evento que iniciou aquela execução.
4. Apenas eventos novos de mensagem devem iniciar o chatbot.
5. Sincronização de histórico, mensagens próprias, grupos e eventos sem conteúdo útil devem ser ignorados antes de acessar o estado da conversa.
6. O Asaas continua sendo a fonte de verdade para confirmação de pagamento; não será introduzida validação manual de comprovante.
7. SQLite permanece como armazenamento operacional e de sessões do chatbot.
8. O contrato HTTP consumido pelo painel (`/api/whatsapp/status`, `/connect`, `/disconnect`) deve permanecer compatível para não exigir redesenho do frontend.

## 3. Referência adotada do Pirattas

O servidor WhatsApp do Pirattas usa Baileys com `useMultiFileAuthState`, `fetchLatestBaileysVersion`, reconexão após desconexões recuperáveis e `messages.upsert` como ponto único de entrada de mensagens.

O padrão essencial a preservar é:

- processar somente `messages.upsert` com `type === "notify"`;
- ignorar `msg.key.fromMe`;
- ignorar mensagens sem `msg.message`;
- obter o destinatário exclusivamente de `msg.key.remoteJid`;
- enviar a resposta de volta para esse mesmo `remoteJid`;
- persistir credenciais Baileys em pasta própria;
- reconectar apenas quando a sessão não tiver sido explicitamente deslogada.

O fluxo de pagamento manual do Pirattas não será copiado. O PrismaStore continuará usando Asaas.

## 4. Arquitetura proposta

### 4.1 `server/whatsapp-manager.js`

Será refeito como manager Baileys e continuará expondo a interface pública atual:

- `connect()`
- `disconnect()`
- `getStatus()`
- `sendText(phoneOrJid, text)`
- `sendMedia(phoneOrJid, source)`

Responsabilidades:

- carregar/salvar `authState` Baileys;
- abrir o socket com a versão mais recente suportada;
- publicar QR Code no estado usado pelo painel;
- manter status `disconnected`, `connecting`, `qr`, `authenticated`/equivalente e `connected`;
- expor metadados básicos da conta conectada;
- tratar reconexão recuperável;
- encaminhar apenas eventos `messages.upsert` elegíveis ao adaptador de entrada;
- nunca chamar o chatbot a partir de histórico/sincronização.

A implementação não deve expor tipos Baileys ao restante do domínio além da camada de adaptação.

### 4.2 `server/whatsapp-chat-adapter.js`

Será o limite entre Baileys e o chatbot.

Entrada esperada por mensagem:

- `message`: objeto Baileys individual;
- `socket`: socket ativo que originou o evento.

O adaptador deverá:

1. validar `remoteJid`;
2. aceitar apenas chats individuais suportados;
3. rejeitar grupos (`@g.us`) e broadcast/status;
4. rejeitar mensagens próprias;
5. extrair texto dos formatos suportados;
6. obter nome do contato quando disponível sem tornar isso requisito para responder;
7. criar `sendText` e `sendMedia` fechados sobre o mesmo `remoteJid` daquela mensagem;
8. chamar `chatbot.handleIncoming(...)` apenas depois de todas as validações.

Nenhum callback de envio criado pelo adaptador aceitará outro número como parâmetro. Isso impede que o fluxo troque o destinatário durante a mesma execução.

### 4.3 Identidade do chat

Para a camada WhatsApp, a identidade primária será o `remoteJid` recebido no evento.

Para o domínio do PrismaStore, o telefone continuará normalizado em dígitos. O adaptador fornecerá ao chatbot o `chatId` completo, e o chatbot continuará normalizando o número para localizar cliente e sessão.

A normalização de saída deve aceitar:

- JID já completo: usar sem alterar;
- telefone comum: converter para o JID Baileys correspondente.

A função de normalização será única e testada, evitando regras duplicadas entre `sendText` e `sendMedia`.

## 5. Política de entrada de mensagens

O chatbot somente será acionado quando todas as condições forem verdadeiras:

- evento originado de `messages.upsert`;
- `type === "notify"`;
- mensagem possui `msg.message`;
- `msg.key.fromMe !== true`;
- existe `msg.key.remoteJid` válido;
- não é grupo;
- não é status/broadcast;
- existe conteúdo suportado pelo fluxo.

Eventos `append`, carga de histórico, sincronizações ou mensagens sem conteúdo de usuário não entram no chatbot.

Essa política substitui a necessidade de inferir se a mensagem é antiga pela comparação de timestamp do processo. O filtro principal passa a ser a semântica do evento Baileys, como no Pirattas.

Uma deduplicação curta por `msg.key.id` poderá permanecer como segunda barreira defensiva, desde que limitada em memória e sem substituir o filtro `type === "notify"`.

## 6. Conteúdo suportado

Na primeira entrega, o fluxo de compra continuará textual. O adaptador deve aceitar pelo menos:

- `conversation`;
- `extendedTextMessage.text`.

O envio de mídia do PrismaStore continuará necessário para:

- arte de boas-vindas;
- arte de catálogo;
- QR Pix do Asaas;
- arte de pedido finalizado.

`sendMedia` deverá converter os formatos internos atuais do PrismaStore para a estrutura de envio do Baileys:

- caminho de arquivo local;
- imagem Base64 em memória, utilizada pelo Pix.

Recebimento de imagens do cliente não será necessário para pagamento, porque o Asaas confirma automaticamente via webhook.

## 7. Autenticação e sessão WhatsApp

A pasta atual `.wwebjs_auth` não é compatível com Baileys e não será migrada.

A nova sessão será armazenada em uma pasta dedicada, proposta:

`data/whatsapp-auth`

No primeiro uso após a atualização:

1. o PrismaStore inicia sem credenciais Baileys;
2. o manager gera um QR;
3. o painel e o terminal mostram o QR;
4. o usuário escaneia uma única vez;
5. `useMultiFileAuthState` persiste as credenciais;
6. reinícios subsequentes reutilizam a sessão salva.

A pasta antiga `.wwebjs_auth` não será apagada automaticamente durante a migração. Ela deixa de ser usada, mas permanece disponível para rollback manual durante a fase inicial.

## 8. Ciclo de conexão e reconexão

`connect()` deve ser idempotente: se uma conexão estiver em andamento ou ativa, não cria outro socket concorrente.

`connection.update` deverá mapear os estados Baileys para o contrato já usado pelo painel.

Em `connection === "close"`:

- identificar a razão da desconexão;
- se for logout explícito, permanecer desconectado e exigir novo QR;
- se for falha recuperável, agendar uma única reconexão;
- impedir loops de múltiplos sockets/reconexões concorrentes.

`disconnect()` deve encerrar o socket atual sem apagar as credenciais, preservando a possibilidade de reconectar sem novo QR.

Logout/desvinculação completa não entra nesta migração inicial; poderá ser uma ação separada depois.

## 9. Sessão do chatbot e máquina de estados

A sessão de conversa continua persistida em SQLite pela tabela `chat_sessions`, com uma sessão por telefone.

O fluxo do PrismaStore permanece:

`catalog -> quantity -> cart_action -> delivery -> address_choice/address_input -> confirm -> payment_document/awaiting_payment -> paid`

Comandos de recuperação continuam disponíveis (`menu`, `inicio`, `reiniciar`, `cancelar`).

A migração para Baileys não deve alterar regras de estoque, carrinho, endereço ou criação do pedido.

Não será adotada a máquina de estados reduzida do Pirattas porque o PrismaStore possui requisitos adicionais de carrinho e entrega.

## 10. Pagamento Asaas

O pagamento atual será preservado.

Após confirmação do pedido:

1. pedido é criado como `PAYMENT_PENDING` e reserva estoque;
2. se necessário, o chatbot solicita CPF/CNPJ do pagador;
3. o `paymentService` cria o pagamento Pix no Asaas;
4. QR/Base64 e Pix Copia e Cola são enviados pelo novo `sendMedia`/`sendText` Baileys;
5. sessão entra em `awaiting_payment`;
6. mensagens adicionais nesse estado informam que não é necessário enviar comprovante;
7. webhook Asaas confirma o pagamento;
8. pagamento idempotente avança o pedido para `PAID`;
9. `orderLifecycleService` notifica o mesmo telefone pelo novo manager Baileys.

Nenhuma lógica de validação de comprovante do Pirattas será importada.

## 11. Backup e restauração

O sistema de backup atual inclui a pasta de autenticação do WhatsApp. Ele deverá continuar fazendo isso com a nova pasta Baileys.

Mudanças previstas:

- `createAppServer` deixa de assumir `.wwebjs_auth` internamente;
- o caminho da autenticação passa a ser injetado pela composição em `server/index.js`;
- o backup copia `data/whatsapp-auth` para `whatsapp-auth` dentro do snapshot;
- restore pausa o socket Baileys, restaura SQLite e credenciais e então reconecta quando apropriado;
- snapshots antigos que contenham autenticação `whatsapp-web.js` não devem ser tratados como credenciais Baileys válidas.

Para evitar restauração silenciosa de formato incompatível, o manifesto de backup deverá registrar o provedor/formato de autenticação, por exemplo `whatsappAuthProvider: "baileys"`.

## 12. API e painel

Os endpoints existentes permanecem:

- `GET /api/whatsapp/status`
- `POST /api/whatsapp/connect`
- `POST /api/whatsapp/disconnect`

O payload de status continuará entregando ao frontend:

- `status`;
- `qrDataUrl`;
- `account`;
- `error`.

O painel não precisa conhecer Baileys.

O QR continuará compacto no terminal e no painel.

## 13. Dependências

Remover dependência de runtime:

- `whatsapp-web.js`

Adicionar:

- `@whiskeysockets/baileys`
- logger compatível requerido pela integração, preferencialmente `pino` se necessário pelo socket

A remoção do `whatsapp-web.js` elimina a dependência do Chromium/Puppeteer no fluxo normal do PrismaStore, simplificando a instalação local.

## 14. Arquivos previstos para alteração

Principalmente:

- `package.json`
- lockfile do projeto
- `server/index.js`
- `server/whatsapp-manager.js`
- `server/whatsapp-chat-adapter.js`
- `server/app-server.js`
- `server/backup-service.js`
- testes de manager/adaptador/runtime/backup/instalação

Arquivos de domínio do chatbot, pagamento e estoque só devem mudar se um teste revelar incompatibilidade real de interface.

## 15. Estratégia de testes

A implementação seguirá TDD.

Cobertura mínima obrigatória:

### Entrada e isolamento

- `messages.upsert` `notify` de A executa o chatbot exatamente uma vez;
- a resposta do evento de A só pode ir para A;
- evento de B em paralelo só responde para B;
- `append` não executa chatbot;
- mensagem própria não executa chatbot;
- grupo não executa chatbot;
- status/broadcast não executa chatbot;
- mensagem sem conteúdo não executa chatbot;
- mesmo `msg.key.id` repetido não executa duas vezes quando a deduplicação defensiva estiver ativa.

### Conexão

- QR atualiza `qrDataUrl`;
- conexão aberta marca `connected`;
- logout explícito não reconecta automaticamente;
- falha recuperável agenda apenas uma reconexão;
- `disconnect()` não apaga credenciais.

### Envio

- `sendText` normaliza telefone comum para JID correto;
- JID completo é preservado;
- arquivo local é enviado como mídia;
- Pix Base64 é enviado como imagem;
- ausência de conexão produz erro claro.

### Pagamento/regressão

- fluxo completo continua criando `PAYMENT_PENDING`;
- CPF/CNPJ continua transitório;
- Pix Asaas continua idempotente;
- webhook continua alterando para `PAID` uma única vez;
- confirmação de pagamento notifica o telefone correto;
- estoque continua reservado/consumido sem duplicação.

### Backup

- backup contém credenciais Baileys quando presentes;
- restore reconecta com credenciais Baileys válidas;
- formato antigo de autenticação não é confundido com Baileys.

A suíte completa `npm test` deve permanecer verde.

## 16. Migração operacional

Ao publicar a versão:

1. atualizar código/dependências;
2. preservar banco SQLite e dados reais;
3. preservar `.wwebjs_auth` sem utilizá-la;
4. iniciar o PrismaStore;
5. escanear o novo QR Baileys;
6. testar mensagem a partir de um número controlado;
7. validar catálogo, criação de pedido e geração Pix;
8. validar webhook Asaas em ambiente configurado;
9. somente depois colocar o chatbot em atendimento normal.

Durante a validação inicial, recomenda-se testar com um número controlado antes de manter o processo ligado para clientes reais.

## 17. Não objetivos

Ficam fora desta migração:

- mudar o provedor Asaas;
- validar comprovante por IA;
- migrar SQLite para Supabase;
- copiar o frontend/admin do Pirattas;
- adicionar grupos ou listas de transmissão;
- implementar campanhas/disparos ativos;
- apagar automaticamente a sessão antiga `.wwebjs_auth`;
- redesenhar o fluxo comercial já aprovado do PrismaStore.

## 18. Critérios de aceite

A migração estará pronta quando:

1. `whatsapp-web.js` não for mais usado em runtime;
2. PrismaStore conectar via Baileys e reutilizar credenciais após reinício;
3. somente eventos `notify` válidos iniciarem o chatbot;
4. cada resposta permanecer vinculada ao `remoteJid` da mensagem que a originou;
5. nenhum replay/histórico iniciar atendimento;
6. catálogo, carrinho, entrega, endereço e estoque continuarem funcionando;
7. Pix Asaas continuar sendo gerado e confirmado automaticamente;
8. webhook notificar o cliente correto;
9. backup/restauração suportarem a sessão Baileys;
10. toda a suíte automatizada passar sem regressões.