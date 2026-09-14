# PrismaStore — MVP local

MVP operacional simplificado para rodar no mesmo computador/servidor: painel, SQLite, chatbot, integração WhatsApp via Baileys e Pix Asaas ficam em um único processo Node.js.

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
      ├─ Asaas Pix
      └─ SQLite
        │
        └── POST /api/webhooks/asaas ← Asaas (HTTPS público)
```

Sem PostgreSQL, Redis, filas, microsserviços, ORM ou IA generativa no MVP.

## Requisitos

- Node.js 22.5+ (recomendado Node.js 24 LTS).
- Internet no computador que executa a integração WhatsApp e o Asaas.
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

## Fluxo atual — Passos 1 a 9

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

O `checkoutId` impede duplicidade de pedido e a cobrança Asaas é reutilizada em retentativas. O webhook valida o ID da cobrança e o valor antes de liberar o pedido. Ao confirmar o pagamento, a reserva vira baixa de estoque físico e o cliente recebe uma mensagem automática no WhatsApp. O cliente não precisa enviar comprovante: a confirmação do Pix continua automática pelo webhook do Asaas.

## Operação e tracker — Passo 6

Depois do pagamento, o operador avança o pedido pelo painel. Cada transição passa pela API local e notifica o cliente no WhatsApp com um tracker simples:

```text
✅ Pagamento confirmado
✅/○ Em preparação
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
data/whatsapp-auth/
.wwebjs_auth/   (legado, se ainda existir)
backups/
```

O CPF/CNPJ recebido pelo WhatsApp é usado imediatamente para criar/reutilizar o pagador no Asaas; o PrismaStore persiste somente o `asaasCustomerId` retornado.

## Backup e recuperação — Passo 8

Em **Configurações → Backup e recuperação**, o operador pode criar um snapshot local sem usar terminal. Cada backup fica em `backups/` e contém:

```text
prismastore.db
whatsapp-auth/   (quando existe uma sessão Baileys)
manifest.json
```

O `manifest.json` registra, além dos hashes SHA-256 e tamanhos, o provedor da sessão WhatsApp. Backups novos usam `whatsappAuthProvider: "baileys"`. Um backup antigo pode restaurar os dados SQLite, mas credenciais de `whatsapp-web.js` não são copiadas para `data/whatsapp-auth/`.

O SQLite é copiado pela API de backup do próprio `node:sqlite`, mantendo consistência mesmo com WAL ativo. Antes de restaurar, todos os hashes são verificados; se houver corrupção, nada é substituído.

Toda restauração cria primeiro um backup `pre-restore`. O WhatsApp é desconectado durante a troca dos arquivos e reconectado em seguida. O `.env`, a chave do Asaas e o token do webhook **não entram no backup**.

Endpoints locais:

- `GET /api/backups`
- `POST /api/backups`
- `POST /api/backups/:id/restore`

### Instalação simples no Windows

Na primeira instalação, dê duplo clique em `INSTALAR_PRISMASTORE.bat`. Ele verifica Node.js, abre a página oficial do Node LTS caso esteja ausente, executa `npm install`, cria `.env`, `data/`, `backups/` e um inicializador **PrismaStore.cmd** na Área de Trabalho.

Depois disso, o uso diário é feito pelo atalho ou por `INICIAR_PRISMASTORE.bat`. Na primeira inicialização com Baileys, conecte novamente o WhatsApp pelo QR Code do painel; as credenciais seguintes ficam em `data/whatsapp-auth/`.

> Guarde a pasta `backups/` também em uma mídia ou armazenamento seguro externo periodicamente. Ela contém dados operacionais e pode conter a sessão do WhatsApp, portanto deve ser tratada como informação sensível.

## PWA Mobile — Passo 9

A versão `0.9.0` adiciona uma camada PWA e responsiva sem mover dados para o celular. O computador servidor continua sendo a única fonte de verdade para SQLite, WhatsApp, Asaas e backups.

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
