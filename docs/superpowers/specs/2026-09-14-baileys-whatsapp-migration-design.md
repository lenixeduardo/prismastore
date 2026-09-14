# PrismaStore — Migração da camada WhatsApp para Baileys

Data: 2026-09-14
Status: design aprovado em conversa; aguardando revisão final da spec
Branch: `feat/baileys-whatsapp-migration`

## 1. Objetivo

Substituir a integração atual baseada em `whatsapp-web.js` por uma integração baseada em `@whiskeysockets/baileys`, usando como referência o padrão operacional já utilizado no repositório `lenixeduardo/pirattas`.

A mudança deve impedir que sincronização/replay de mensagens antigas inicie atendimento, manter cada resposta vinculada exclusivamente ao remetente do evento atual e preservar o fluxo existente do PrismaStore: catálogo real, carrinho, entrega/envio, endereço, pedido, estoque, Pix Asaas e confirmação automática de pagamento.

## 2. Princípios da migração

1. O transporte WhatsApp muda; o domínio do PrismaStore não muda.
2. Nenhuma resposta do chatbot pode selecionar destinatário a partir da lista de clientes.
3. O destinatário de toda resposta de uma execução é o `remoteJid` do evento que iniciou aquela execução.
4. Apenas eventos novos de mensagem podem iniciar o chatbot.
5. Histórico, mensagens próprias, grupos, broadcast e eventos sem conteúdo útil são ignorados antes de acessar estado de conversa.
6. O Asaas continua sendo a fonte de verdade para confirmação de pagamento; não haverá validação manual de comprovante.
7. SQLite permanece como armazenamento operacional e de sessões do chatbot.
8. O contrato HTTP do painel (`/api/whatsapp/status`, `/connect`, `/disconnect`) permanece compatível.

## 3. Referência adotada do Pirattas

O servidor WhatsApp do Pirattas usa Baileys com `useMultiFileAuthState`, `fetchLatestBaileysVersion`, reconexão após desconexões recuperáveis e `messages.upsert` como ponto único de entrada de mensagens.

O padrão que será preservado é:

- processar somente `messages.upsert` com `type === "notify"`;
- ignorar `msg.key.fromMe`;
- ignorar mensagens sem `msg.message`;
- obter o destinatário exclusivamente de `msg.key.remoteJid`;
- enviar a resposta de volta para esse mesmo `remoteJid`;
- persistir credenciais Baileys em pasta própria;
- reconectar apenas quando a sessão não tiver sido explicitamente deslogada.

O fluxo manual de comprovante do Pirattas não será copiado. O PrismaStore continuará usando Asaas.

## 4. Arquitetura proposta

### 4.1 `server/whatsapp-manager.js`

Será refeito como manager Baileys e continuará expondo a interface pública atual:

- `connect()`
- `disconnect()`
- `getStatus()`
- `sendText(phoneOrJid, text)`
- `sendMedia(phoneOrJid, source)`

Responsabilidades:

- carregar e salvar `authState` Baileys;
- abrir um único socket ativo;
- publicar QR Code no estado usado pelo painel;
- mapear conexão para `disconnected`, `connecting`, `qr`, `authenticated` e `connected`;
- expor metadados básicos da conta conectada;
- tratar reconexão recuperável sem criar sockets concorrentes;
- encaminhar apenas `messages.upsert` elegíveis ao adaptador;
- nunca chamar o chatbot por histórico/sincronização.

Tipos Baileys ficam confinados ao manager e ao adaptador.

### 4.2 `server/whatsapp-chat-adapter.js`

Será o limite entre Baileys e o chatbot.

Entrada por mensagem:

- `message`: objeto Baileys individual;
- `socket`: socket ativo que originou o evento.

O adaptador deverá:

1. validar o JID de origem;
2. aceitar somente chat individual suportado;
3. rejeitar `@g.us`, status e broadcast;
4. rejeitar mensagens próprias;
5. extrair o texto dos formatos suportados;
6. resolver identidade de domínio sem alterar o destinatário de resposta;
7. criar `sendText` e `sendMedia` fechados sobre o mesmo JID de origem;
8. chamar `chatbot.handleIncoming(...)` somente depois de todas as validações.

Os callbacks de envio do adaptador não aceitarão destinatário como argumento. Portanto o código do fluxo não consegue trocar de contato durante a execução.

### 4.3 Identidade do chat e LID

O destino da resposta é sempre o JID original recebido no evento.

Para localizar cliente e sessão no domínio, o adaptador resolve um identificador telefônico quando possível:

- se houver JID telefônico `@s.whatsapp.net`, ele é usado para normalização do telefone;
- se a mensagem vier por `@lid` e houver JID alternativo telefônico no próprio evento, o alternativo é usado apenas como identidade de domínio;
- se não houver equivalente telefônico, a execução mantém uma chave de sessão estável derivada do JID, sem inventar número de telefone.

Essa resolução nunca altera o JID usado para responder.

A normalização de saída aceita:

- JID completo: usar sem alterar;
- telefone comum: converter para `<digitos>@s.whatsapp.net`.

Uma única função testada será usada por `sendText` e `sendMedia`.

## 5. Política de entrada de mensagens

O chatbot somente será acionado quando todas as condições forem verdadeiras:

- evento `messages.upsert`;
- `type === "notify"`;
- existe `msg.message`;
- `msg.key.fromMe !== true`;
- existe `msg.key.remoteJid` válido;
- não é grupo;
- não é status/broadcast;
- existe conteúdo suportado pelo fluxo;
- o ID da mensagem ainda não foi processado nesta janela de deduplicação.

Eventos `append`, carga de histórico, sincronizações e mensagens sem conteúdo de usuário não entram no chatbot.

### Deduplicação defensiva obrigatória

Além do filtro `notify`, o manager manterá cache em memória por `msg.key.id`:

- TTL: 10 minutos;
- limite máximo: 1.000 IDs;
- ao atingir o limite, remover entradas expiradas e depois as mais antigas;
- mensagem repetida dentro da janela não executa o chatbot novamente.

A deduplicação é uma segunda barreira; não substitui o filtro semântico `type === "notify"`.

## 6. Conteúdo suportado

Na primeira entrega, entrada do fluxo comercial continua textual. O adaptador aceita pelo menos:

- `conversation`;
- `extendedTextMessage.text`.

O envio de mídia permanece necessário para:

- arte de boas-vindas;
- arte de catálogo;
- QR Pix do Asaas;
- arte de pedido finalizado.

`sendMedia` converte os formatos internos atuais para Baileys:

- caminho de arquivo local;
- imagem Base64 em memória, usada pelo Pix.

Recebimento de imagem do cliente não faz parte do pagamento porque o Asaas confirma via webhook.

## 7. Autenticação e sessão WhatsApp

A pasta atual `.wwebjs_auth` não é compatível com Baileys e não será migrada.

A nova sessão será armazenada em:

`data/whatsapp-auth`

No primeiro uso após a atualização:

1. PrismaStore inicia sem credenciais Baileys;
2. manager gera QR;
3. painel e terminal mostram o QR;
4. usuário escaneia uma vez;
5. `useMultiFileAuthState` persiste as credenciais;
6. reinícios reutilizam a sessão salva.

A pasta `.wwebjs_auth` não será apagada automaticamente. Ela deixa de ser usada e permanece disponível para rollback manual durante a transição.

## 8. Ciclo de conexão e reconexão

`connect()` é idempotente. Se houver socket conectando ou conectado, não cria outro.

`connection.update` será convertido para o contrato atual do painel.

Quando `connection === "close"`:

- detectar razão de desconexão;
- logout explícito: permanecer desconectado e exigir novo QR;
- falha recuperável: agendar uma única reconexão;
- cancelar timer de reconexão anterior antes de criar outro;
- garantir apenas um socket ativo por vez.

`disconnect()` encerra o socket sem apagar credenciais, permitindo reconectar sem novo QR.

Logout/desvinculação completa fica fora desta migração.

## 9. Sessão do chatbot e máquina de estados

A conversa continua persistida em SQLite, uma sessão lógica por identidade de cliente.

Fluxo preservado:

`catalog -> quantity -> cart_action -> delivery -> address_choice/address_input -> confirm -> payment_document/awaiting_payment -> paid`

Comandos de recuperação permanecem (`menu`, `inicio`, `reiniciar`, `cancelar`).

A migração não altera regras de estoque, carrinho, endereço ou criação do pedido.

A máquina reduzida do Pirattas não será copiada porque o PrismaStore possui carrinho e entrega adicionais.

## 10. Pagamento Asaas

O pagamento atual será preservado:

1. confirmação cria pedido `PAYMENT_PENDING` e reserva estoque;
2. quando necessário, chatbot solicita CPF/CNPJ;
3. `paymentService` cria o Pix no Asaas;
4. QR Base64 e Pix Copia e Cola são enviados via Baileys;
5. sessão entra em `awaiting_payment`;
6. mensagens adicionais informam que não é necessário comprovante;
7. webhook Asaas confirma o pagamento;
8. processamento idempotente avança pedido para `PAID`;
9. `orderLifecycleService` notifica o telefone/JID correto pelo novo manager.

Nenhuma validação de comprovante do Pirattas será importada.

## 11. Backup e restauração

O backup continuará incluindo banco e credenciais WhatsApp.

Mudanças:

- `createAppServer` deixa de assumir `.wwebjs_auth`;
- caminho de autenticação é injetado por `server/index.js`;
- novos snapshots copiam `data/whatsapp-auth` para `whatsapp-auth`;
- novos manifests usam `schemaVersion: 2` e `whatsappAuthProvider: "baileys"`;
- restore v2 pausa Baileys, restaura SQLite + credenciais e reconecta quando apropriado;
- backup legado v1 continua elegível para restaurar o SQLite, mas sua autenticação WhatsApp é ignorada e o PrismaStore exige novo QR;
- autenticação `whatsapp-web.js` nunca é copiada para a pasta Baileys.

O retorno da restauração deverá indicar se a sessão WhatsApp foi restaurada ou se será necessário novo QR.

## 12. API e painel

Permanecem:

- `GET /api/whatsapp/status`
- `POST /api/whatsapp/connect`
- `POST /api/whatsapp/disconnect`

Payload continua contendo:

- `status`;
- `qrDataUrl`;
- `account`;
- `error`.

O painel não conhecerá Baileys. O QR permanece compacto no terminal e na interface.

## 13. Dependências

Remover:

- `whatsapp-web.js`

Adicionar seguindo a linha já validada pelo Pirattas:

- `@whiskeysockets/baileys` compatível com `^6.7.16`;
- `pino` compatível com `^9.6.0`.

A migração elimina Chromium/Puppeteer do fluxo normal de conexão WhatsApp.

## 14. Arquivos previstos para alteração

Principalmente:

- `package.json` e lockfile;
- `server/index.js`;
- `server/whatsapp-manager.js`;
- `server/whatsapp-chat-adapter.js`;
- `server/app-server.js`;
- `server/backup-service.js`;
- testes de manager, adaptador, runtime, backup e instalação.

Chatbot, pagamento e estoque só mudam se testes demonstrarem incompatibilidade de interface necessária para Baileys.

## 15. Estratégia de testes

A implementação seguirá TDD.

### Entrada e isolamento

- `notify` de A executa chatbot uma vez;
- resposta do evento de A só vai para A;
- evento de B em paralelo só responde para B;
- `append` não executa chatbot;
- mensagem própria não executa chatbot;
- grupo não executa chatbot;
- status/broadcast não executa chatbot;
- mensagem sem conteúdo não executa chatbot;
- ID repetido dentro de 10 minutos não executa duas vezes;
- limpeza do cache respeita limite de 1.000 IDs;
- JID `@lid` com alternativo telefônico mantém resposta no JID original e sessão no identificador resolvido.

### Conexão

- QR atualiza `qrDataUrl`;
- conexão aberta marca `connected`;
- logout explícito não reconecta;
- falha recuperável agenda uma única reconexão;
- `disconnect()` não apaga credenciais;
- chamadas repetidas de `connect()` não criam sockets concorrentes.

### Envio

- telefone comum vira JID correto;
- JID completo é preservado;
- arquivo local é enviado como imagem;
- Pix Base64 é enviado como imagem;
- ausência de conexão produz erro claro.

### Pagamento/regressão

- fluxo cria `PAYMENT_PENDING`;
- CPF/CNPJ continua transitório;
- Pix Asaas continua idempotente;
- webhook altera para `PAID` uma única vez;
- confirmação notifica o cliente correto;
- estoque continua reservado/consumido sem duplicação.

### Backup

- backup v2 registra provedor Baileys;
- backup contém credenciais Baileys quando presentes;
- restore v2 reconecta com credenciais válidas;
- restore v1 preserva dados e ignora autenticação antiga;
- formato `whatsapp-web.js` nunca é interpretado como Baileys.

A suíte completa `npm test` deve permanecer verde.

## 16. Migração operacional

Ao publicar:

1. atualizar código e dependências;
2. preservar SQLite e dados reais;
3. preservar `.wwebjs_auth` sem utilizá-la;
4. iniciar PrismaStore;
5. escanear novo QR Baileys;
6. testar com número controlado;
7. validar catálogo, carrinho, pedido e Pix;
8. validar webhook Asaas;
9. só então deixar o chatbot ativo para atendimento normal.

## 17. Não objetivos

Ficam fora desta migração:

- trocar Asaas;
- validar comprovante por IA;
- migrar SQLite para Supabase;
- copiar frontend/admin do Pirattas;
- suportar grupos ou listas de transmissão;
- campanhas ou disparos ativos;
- apagar automaticamente `.wwebjs_auth`;
- redesenhar o fluxo comercial aprovado;
- criar ação de logout/desvinculação completa.

## 18. Critérios de aceite

A migração estará pronta quando:

1. `whatsapp-web.js` não estiver mais no runtime;
2. PrismaStore conectar via Baileys e reutilizar credenciais após reinício;
3. somente `messages.upsert` `notify` válido iniciar chatbot;
4. cada resposta permanecer presa ao JID que originou a mensagem;
5. histórico/replay/duplicação não iniciar atendimento indevido;
6. catálogo, carrinho, entrega, endereço e estoque continuarem funcionando;
7. Pix Asaas continuar sendo gerado e confirmado automaticamente;
8. webhook notificar o cliente correto;
9. backup/restauração suportarem sessão Baileys sem confundir formato legado;
10. toda a suíte automatizada passar sem regressões.