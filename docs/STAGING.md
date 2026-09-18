# PrismaStore — staging contínuo

Este modo mantém o PrismaStore rodando continuamente para homologação, usando o mesmo servidor Node.js do projeto, SQLite persistente e a sessão Baileys em disco.

> Este perfil é propositalmente fechado para homologação: o WhatsApp fica com allowlist obrigatória de um único telefone.

## 1. Preparar o servidor

Requisitos:

- Linux/VPS com disco persistente;
- Node.js 22.5+ (Node 24 LTS recomendado);
- repositório clonado em disco;
- portas externas fechadas para o processo Node; publique por proxy HTTPS quando necessário.

Instale as dependências:

```bash
npm ci
npm install -g pm2
```

## 2. Configurar o ambiente

Crie `.env` a partir de `.env.example` e configure pelo menos:

```env
HOST=127.0.0.1
PRISMASTORE_ADMIN_PASSWORD=uma-senha-forte
PRISMASTORE_DEV_WHATSAPP_ONLY=true
PRISMASTORE_DEV_WHATSAPP_PHONE=DDD_NUMERO_DE_TESTE
```

O staging falha ao iniciar caso a allowlist esteja ativa sem telefone. Isso evita conectar o WhatsApp de homologação de forma aberta.

Mantenha persistentes:

```text
.env
data/prismastore.db
data/whatsapp-auth/
backups/
```

## 3. Validar a conversa antes de conectar o WhatsApp

O smoke test usa o motor real do chatbot e um SQLite temporário, com produtos neutros de teste:

```bash
npm run smoke:conversation
```

Ele percorre:

```text
Oi
→ catálogo
→ produto
→ quantidade
→ modalidade
→ endereço
→ confirmação
→ criação de pedido PAYMENT_PENDING
```

Nenhuma mensagem é enviada ao WhatsApp e nenhum dado do banco operacional é alterado.

## 4. Manter o staging rodando

```bash
pm2 start ecosystem.staging.config.cjs
pm2 save
pm2 startup
```

O comando `pm2 startup` imprime um comando adicional com privilégios administrativos. Execute o comando exibido uma única vez e depois rode `pm2 save` novamente.

Comandos úteis:

```bash
npm run staging:logs
npm run staging:restart
npm run staging:stop
```

O PrismaStore usa **uma única instância**. Não habilite cluster/múltiplos workers porque SQLite e a sessão Baileys são estado local compartilhado.

## 5. Teste real pelo WhatsApp

Com o serviço no ar:

1. abra o painel;
2. vá a Configurações → WhatsApp;
3. conecte o aparelho;
4. envie `Oi` a partir do número configurado em `PRISMASTORE_DEV_WHATSAPP_PHONE`;
5. percorra o fluxo e confirme no painel que o contato, a sessão e o pedido de teste foram persistidos.

Qualquer outro número deve ser bloqueado no staging.

## Produção pública

A topologia técnica adequada é:

```text
Internet
   │
HTTPS / reverse proxy
   │
Node.js PrismaStore (1 processo)
   ├── painel + API
   ├── Baileys
   ├── SQLite em disco persistente
   └── backups externos
```

O requisito principal não é trocar `npm start`: é ter um **process manager**, inicialização automática após reboot, disco persistente, HTTPS, backup e observabilidade. O perfil deste documento mantém a aplicação em homologação fechada; a liberação pública deve ser feita somente depois de revisar catálogo, requisitos legais, segurança e operação.
