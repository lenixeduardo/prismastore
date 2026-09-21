# PrismaStore — MVP local

MVP operacional simplificado para rodar em um único servidor Node.js: painel, SQLite, chatbot, integração WhatsApp via Baileys e validação local de Pix por comprovante.

## Arquitetura

```text
Cliente no WhatsApp
        │
        ▼
Baileys (multi-device)
        │
        ▼
      Node.js único
      ├─ chatbot
      ├─ painel/API
      ├─ Pix local + OCR de comprovante
      └─ SQLite
```

Sem PostgreSQL, Redis, filas, microsserviços, ORM, gateway de pagamento ou IA generativa no MVP.

## Requisitos

- Node.js 22.5+ (recomendado Node.js 24 LTS).
- Internet no servidor para a integração com o WhatsApp.
- `data/`, `data/whatsapp-auth/` e `.env` persistentes no servidor.

## Instalação

```bash
npm install
cp .env.example .env
npm start
```

No Windows, `INICIAR_PRISMASTORE.bat` instala dependências e abre `http://localhost:4173`.

## WhatsApp

Em **Configurações → WhatsApp**, clique em **Conectar WhatsApp** e leia o QR com **Aparelhos conectados**. A sessão Baileys fica em `data/whatsapp-auth/` e é restaurada ao reiniciar.

A integração anterior usava `whatsapp-web.js` e `.wwebjs_auth/`. Esse formato não é compatível com Baileys. Na primeira execução depois da migração será necessário ler um novo QR Code. A pasta `.wwebjs_auth/` antiga não é utilizada pelo runtime novo e pode ser mantida temporariamente apenas para rollback manual.

O PrismaStore processa somente eventos novos (`messages.upsert` do tipo `notify`), ignora mensagens próprias, grupos, status/broadcast e histórico sincronizado, e mantém cada resposta vinculada ao `remoteJid` que originou a mensagem.

### Ambiente DEV com WhatsApp restrito

Para homologação sem risco de responder clientes reais, ative a allowlist no `.env`:

```env
PRISMASTORE_DEV_WHATSAPP_ONLY=true
PRISMASTORE_DEV_WHATSAPP_PHONE=DDD_NUMERO
```

Quando esse modo está ativo, somente o telefone configurado pode disparar o chatbot. O mesmo bloqueio vale para saídas automáticas, incluindo mensagens de pagamento, tracker e finalização. Qualquer outro destinatário é bloqueado antes do envio. Para números brasileiros informados com DDD + número, o runtime normaliza o país `55` automaticamente.

Se `PRISMASTORE_DEV_WHATSAPP_ONLY=true` estiver ativo sem `PRISMASTORE_DEV_WHATSAPP_PHONE`, o servidor não inicia; isso evita uma homologação aparentemente protegida rodar sem restrição.

## Fluxo atual — Passos 1 a 9

```text
mensagem
→ boas-vindas + cardápio
→ item + quantidade
→ envio/entrega + endereço
→ confirmação
→ pedido PAYMENT_PENDING + reserva de estoque
→ Pix local + QR + Copia e Cola
→ cliente envia imagem do comprovante
→ OCR local extrai valor, destinatário, data, horário e identificador
→ validação local do comprovante
→ PAID / Pago · Embalar
→ Produto embalado
→ Enviado ou Saiu para entrega
→ Finalizado + arte final
```

O `checkoutId` impede duplicidade de pedido. O comprovante só libera o pedido automaticamente quando o valor bate com o total, o destinatário corresponde ao configurado e a data/hora do Pix é estritamente posterior à criação do pedido. O sistema também bloqueia reutilização do mesmo comprovante ou identificador de transação.

Se algum dado estiver ausente ou divergente, o pedido permanece em `PAYMENT_PENDING` e recebe marcação de **validação manual**. A imagem recebida pelo WhatsApp é usada apenas durante o OCR; o PrismaStore persiste o hash SHA-256 e os campos extraídos necessários para auditoria e deduplicação, não a imagem do comprovante.

## Configurar Pix local

Copie `.env.example` para `.env` e preencha:

```env
PIX_KEY=sua-chave-pix
PIX_RECIPIENT_NAME=PRISMA STORE
PIX_RECIPIENT_CITY=SAO PAULO
PIX_ACCOUNT_ID=pix-local
```

`PIX_KEY` pode ser telefone, e-mail, CPF/CNPJ ou chave aleatória. `PIX_RECIPIENT_NAME` deve corresponder ao nome que aparece nos comprovantes bancários, pois ele faz parte da validação automática.

O painel mostra **Pix local · Comprovante · CONFIGURADO** quando a chave, o destinatário e a cidade estão preenchidos. Não é necessário criar conta em gateway, configurar webhook público ou manter API key de serviço de pagamento.

## Operação e tracker — Passo 6

Depois do pagamento, o operador avança o pedido pelo painel. Cada transição passa pela API local e notifica o cliente no WhatsApp com um tracker simples:

```text
✅ Pagamento confirmado
✅/○ Produto embalado
✅/○ Pedido enviado ou Saiu para entrega
✅/○ Finalizado
```

O endpoint `POST /api/orders/:id/advance` recebe `expectedStatus`, impedindo que uma retentativa ou clique duplicado avance duas etapas. Para `local_delivery`, o fluxo é `PACKING → OUT_FOR_DELIVERY → DELIVERED`; para `shipping`, é `PACKING → SHIPPED → DELIVERED`. Ao chegar em `DELIVERED`, o WhatsApp envia `assets/prismastore-order-finished.b64` (reconstruída como PNG local ao iniciar) antes da mensagem final.

## Relatórios reais — Passo 7

A tela **Relatórios** usa os pedidos persistidos no SQLite e considera `paidAt` como fonte de verdade financeira. Isso significa que um pedido continua no faturamento mesmo depois de avançar para `PACKING`, `SHIPPED`, `OUT_FOR_DELIVERY` ou `DELIVERED`.

O painel permite selecionar o mês e exibe:

- faturamento total do período;
- quantidade de pedidos pagos;
- ticket médio;
- faturamento por dia;
- total recebido por conta (`receivingAccountId`);
- tabela dos pagamentos considerados.

A exportação usa `GET /api/reports/monthly.csv?month=YYYY-MM` e gera CSV compatível com Excel. O JSON equivalente está em `GET /api/reports/monthly?month=YYYY-MM`.

## Massa de métricas para homologação

Para preencher a base de homologação com histórico suficiente para validar faturamento, ticket médio e gráfico diário, execute uma vez:

```bash
npm run seed:metrics
```

O comando adiciona **12 pedidos concluídos de demonstração** no mês atual, distribuídos entre envio e entrega, com valores variados e `paidAt` válido. A rotina é idempotente: executar novamente no mesmo mês não duplica os pedidos já criados.

Os pedidos recebem `metricsSeed: true` para permanecerem distinguíveis de pedidos operacionais. Use essa massa somente para homologação/validação de métricas.

## Persistência e segurança

Não entram no Git:

```text
.env
node_modules/
data/*.db
data/whatsapp-auth/
.wwebjs_auth/   (legado, se ainda existir)
backups/
```

A imagem do comprovante não é armazenada pelo fluxo de validação. Para pagamentos aprovados, o pedido registra o hash do comprovante, o identificador Pix quando reconhecido e os campos extraídos necessários para evitar reutilização e permitir auditoria operacional.

## Backup e recuperação — Passo 8

Em **Configurações → Backup e recuperação**, o operador pode criar um snapshot local sem usar terminal. Cada backup fica em `backups/` e contém:

```text
prismastore.db
whatsapp-auth/   (quando existe uma sessão Baileys)
manifest.json
```

O `manifest.json` registra, além dos hashes SHA-256 e tamanhos, o provedor da sessão WhatsApp. Backups novos usam `whatsappAuthProvider: "baileys"`. Um backup antigo pode restaurar os dados SQLite, mas credenciais de `whatsapp-web.js` não são copiadas para `data/whatsapp-auth/`.

O SQLite é copiado pela API de backup do próprio `node:sqlite`, mantendo consistência mesmo com WAL ativo. Antes de restaurar, todos os hashes são verificados; se houver corrupção, nada é substituído.

Toda restauração cria primeiro um backup `pre-restore`. O WhatsApp é desconectado durante a troca dos arquivos e reconectado em seguida. O `.env` e a chave Pix **não entram no backup**.

Endpoints locais:

- `GET /api/backups`
- `POST /api/backups`
- `POST /api/backups/:id/restore`

### Instalação simples no Windows

Na primeira instalação, dê duplo clique em `INSTALAR_PRISMASTORE.bat`. Ele verifica Node.js, abre a página oficial do Node LTS caso esteja ausente, executa `npm install`, cria `.env`, `data/`, `backups/` e um inicializador **PrismaStore.cmd** na Área de Trabalho.

Depois disso, o uso diário é feito pelo atalho ou por `INICIAR_PRISMASTORE.bat`. Na primeira inicialização com Baileys, conecte novamente o WhatsApp pelo QR Code do painel; as credenciais seguintes ficam em `data/whatsapp-auth/`.

> Guarde a pasta `backups/` também em uma mídia ou armazenamento seguro externo periodicamente. Ela contém dados operacionais e pode conter a sessão do WhatsApp, portanto deve ser tratada como informação sensível.

## PWA Mobile — Passo 9

A camada PWA e responsiva permite usar o painel pelo celular sem mover os dados para o aparelho. O servidor continua sendo a fonte de verdade para SQLite, WhatsApp, pagamentos e backups.

No celular:

- sidebar desktop é substituída pela navegação inferior **Início · Pedidos · Clientes · Produtos · Mais**;
- **Mais** abre Relatórios, Simular chatbot e Configurações;
- tabelas viram cards verticais;
- KPIs e grids se adaptam para uma coluna;
- drawers ocupam a tela inteira;
- safe area do iPhone é respeitada;
- o painel mostra **Servidor online**, **Sem conexão** ou **Servidor indisponível**.

O service worker cacheia somente o shell estático listado explicitamente. Rotas `/api/`, pedidos, estoque, Pix, relatórios e backups **nunca são atendidos pelo cache**. Não existe fila offline de operações.

### Rede local x instalação

O acesso por navegador na mesma rede continua funcionando via `http://IP-DO-SERVIDOR:4173`. Para instalar a PWA de verdade, o navegador exige contexto seguro: HTTPS, `localhost` ou loopback.

No Android/Chromium, quando disponível, o PrismaStore oferece o botão **Instalar**. No iPhone, a interface orienta **Compartilhar → Adicionar à Tela de Início**. A publicação HTTPS externa deve ser configurada separadamente e protegida; a PWA não abre portas nem expõe o painel automaticamente à internet.

## Testes

```bash
npm test
```

> Baileys é uma integração não oficial com o WhatsApp. Valide as políticas comerciais aplicáveis antes do uso em produção.
