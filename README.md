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

O `checkoutId` impede duplicidade de pedido e a cobrança Asaas é reutilizada em retentativas. O webhook valida o ID da cobrança e o valor antes de liberar o pedido. Ao confirmar o pagamento, a reserva vira baixa de estoque físico e o cliente recebe uma mensagem automática no WhatsApp.

## Operação e tracker — Passo 6

Depois do pagamento, o operador avança o pedido pelo painel. Cada transição passa pela API local e notifica o cliente no WhatsApp com um tracker simples. O endpoint `POST /api/orders/:id/advance` recebe `expectedStatus`, impedindo que uma retentativa ou clique duplicado avance duas etapas.

## Relatórios reais — Passo 7

A tela **Relatórios** usa os pedidos persistidos no SQLite e considera `paidAt` como fonte de verdade financeira. O painel permite selecionar o mês e exibe faturamento, pedidos pagos, ticket médio, faturamento por dia, total por conta e exportação CSV.

## Configurar Asaas Sandbox

1. Crie uma conta separada no Sandbox do Asaas.
2. Copie `.env.example` para `.env`.
3. Preencha `ASAAS_API_KEY` com a chave Sandbox.
4. Gere `ASAAS_WEBHOOK_TOKEN` com 32–255 caracteres, sem espaços.
5. Configure no Asaas um webhook para `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED`.
6. A URL do webhook deve ser HTTPS pública e terminar em `/api/webhooks/asaas`.

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

Em **Configurações → Backup e recuperação**, o operador pode criar um snapshot local sem usar terminal. Cada backup contém o SQLite, a sessão WhatsApp quando existente e `manifest.json` com SHA-256. Antes de restaurar, a integridade é verificada e um backup `pre-restore` é criado automaticamente.

Na primeira instalação no Windows, dê duplo clique em `INSTALAR_PRISMASTORE.bat`. Depois disso, o uso diário é feito pelo atalho criado na Área de Trabalho ou por `INICIAR_PRISMASTORE.bat`.

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

> `whatsapp-web.js` é uma integração não oficial. Valide as políticas comerciais aplicáveis antes do uso em produção.
