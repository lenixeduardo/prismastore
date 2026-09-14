# PrismaStore — MVP local

MVP operacional simplificado para rodar no mesmo computador/servidor: painel, SQLite, chatbot, WhatsApp Web e integração Pix ficam em um único processo Node.js.

## Arquitetura

```text
Cliente no WhatsApp
        │
        ▼
WhatsApp Web + LocalAuth
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
- Internet no computador que executa WhatsApp Web e Asaas.
- `data/`, `.wwebjs_auth/` e `.env` persistentes no servidor.

## Instalação

```bash
npm install
cp .env.example .env
npm start
```

No Windows, `INICIAR_PRISMASTORE.bat` instala dependências e abre `http://localhost:4173`.

## WhatsApp

Em **Configurações → WhatsApp Web**, clique em **Conectar WhatsApp** e leia o QR com **Aparelhos conectados**. A sessão fica em `.wwebjs_auth/` e é restaurada ao reiniciar.

## Fluxo atual — Passos 1 a 8

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

O `checkoutId` impede duplicidade de pedido e a cobrança Asaas é reutilizada em retentativas. O webhook valida o ID da cobrança e o valor antes de liberar o pedido. Ao confirmar o pagamento, a reserva vira baixa de estoque físico e o cliente recebe uma mensagem automática no WhatsApp.

## Operação e tracker — Passo 6

Depois do pagamento, o operador avança o pedido pelo painel. Cada transição passa pela API local e notifica o cliente no WhatsApp com um tracker simples:

```text
✅ Pagamento confirmado
✅/○ Em preparação
✅/○ Pedido enviado ou Saiu para entrega
✅/○ Finalizado
```

O endpoint `POST /api/orders/:id/advance` recebe `expectedStatus`, impedindo que uma retentativa ou clique duplicado avance duas etapas. Para `local_delivery`, o fluxo é `PACKING → OUT_FOR_DELIVERY → DELIVERED`; para `shipping`, é `PACKING → SHIPPED → DELIVERED`. Ao chegar em `DELIVERED`, o WhatsApp envia `assets/prismastore-order-finished.b64 (reconstruída como PNG local ao iniciar)` antes da mensagem final.

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
.wwebjs_auth/
backups/
```

O CPF/CNPJ recebido pelo WhatsApp é usado imediatamente para criar/reutilizar o pagador no Asaas; o PrismaStore persiste somente o `asaasCustomerId` retornado.

## Backup e recuperação — Passo 8

Em **Configurações → Backup e recuperação**, o operador pode criar um snapshot local sem usar terminal. Cada backup fica em `backups/` e contém:

```text
prismastore.db
whatsapp-auth/   (quando existe uma sessão LocalAuth)
manifest.json
```

O SQLite é copiado pela API de backup do próprio `node:sqlite`, mantendo consistência mesmo com WAL ativo. O `manifest.json` registra SHA-256 e tamanho de cada arquivo. Antes de restaurar, todos os hashes são verificados; se houver corrupção, nada é substituído.

Toda restauração cria primeiro um backup `pre-restore`. O WhatsApp é desconectado durante a troca dos arquivos e reconectado em seguida. O `.env`, a chave do Asaas e o token do webhook **não entram no backup**.

Endpoints locais:

- `GET /api/backups`
- `POST /api/backups`
- `POST /api/backups/:id/restore`

### Instalação simples no Windows

Na primeira instalação, dê duplo clique em `INSTALAR_PRISMASTORE.bat`. Ele verifica Node.js, abre a página oficial do Node LTS caso esteja ausente, executa `npm install`, cria `.env`, `data/`, `backups/` e um inicializador **PrismaStore.cmd** na Área de Trabalho.

Depois disso, o uso diário é feito pelo atalho ou por `INICIAR_PRISMASTORE.bat`.

> Guarde a pasta `backups/` também em uma mídia ou armazenamento seguro externo periodicamente. Ela contém dados operacionais e pode conter a sessão do WhatsApp, portanto deve ser tratada como informação sensível.

## Testes

```bash
npm test
```

> `whatsapp-web.js` é uma integração não oficial. Valide as políticas comerciais aplicáveis antes do uso em produção.
