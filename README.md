# PrismaStore — MVP local

MVP operacional simplificado para rodar sempre no mesmo computador/servidor. Painel, SQLite, atendimento automatizado e conexão com WhatsApp Web ficam no mesmo processo Node.js.

## Arquitetura

```text
Cliente no WhatsApp
        │
        ▼
 WhatsApp Web / LocalAuth
        │
        ▼
     Node.js único
     ├─ Chatbot determinístico
     ├─ API local
     ├─ Painel web
     └─ SQLite
```

Sem PostgreSQL, Redis, BullMQ, microsserviços, ORM ou IA generativa no MVP.

## Requisitos

- Node.js 22.5 ou superior.
- Internet no computador que executa o WhatsApp Web.
- `data/` e `.wwebjs_auth/` em disco persistente.

## Instalação no Windows

Depois de instalar Node.js 24 LTS, dê dois cliques em `INICIAR_PRISMASTORE.bat`.
Na primeira execução ele instala as dependências e abre o painel.

### Terminal

```bash
npm install
npm start
```

Painel:

```text
http://localhost:4173
```

## Conectar o WhatsApp

1. Abra **Configurações** no PrismaStore.
2. Clique em **Conectar WhatsApp** caso a conexão ainda não tenha iniciado automaticamente.
3. No celular: WhatsApp → **Aparelhos conectados** → **Conectar aparelho**.
4. Escaneie o QR exibido no painel.
5. Quando aparecer **Conectado**, a sessão estará salva localmente.

## Atendimento automático — Passo 3

A primeira mensagem recebida em uma conversa individual inicia o atendimento automaticamente.

Fluxo atual:

```text
Mensagem do cliente
  → arte de boas-vindas
  → arte do cardápio
  → escolha do item
  → quantidade
  → adicionar outro / finalizar
  → Envio ou Entrega no endereço
  → endereço salvo ou novo endereço
  → revisão
  → confirmação
```

O cliente não precisa aprender comandos. Na maior parte do fluxo basta responder com `1`, `2`, quantidade ou o endereço solicitado.

Comandos opcionais de recuperação:

- `MENU`, `INICIO` ou `REINICIAR`: começa um novo carrinho.
- `CANCELAR`: cancela o carrinho atual e volta ao cardápio.

### Artes

- `assets/prismastore-welcome.png`: enviada primeiro no início de uma nova conversa.
- `assets/prismastore-catalog.png`: cardápio visual.

O catálogo em texto é enviado junto e usa os produtos/preços/estoque atuais do SQLite. Portanto ele continua sendo a referência operacional mesmo que a arte visual ainda não tenha sido atualizada.

## Persistência

- Operação: `data/prismastore.db`
- Sessão WhatsApp: `.wwebjs_auth/`
- Etapa de cada conversa: tabela `chat_sessions` dentro do mesmo SQLite.

Se o servidor reiniciar no meio de um atendimento, a etapa da conversa permanece salva.

## Estado desta versão — Passo 4

Ao confirmar o pedido no WhatsApp, o PrismaStore cria um pedido real `PAYMENT_PENDING`, reserva o estoque atomicamente e o mostra no painel na fila **Aguardando Pix**. A confirmação é idempotente: repetir a mesma etapa não duplica o pedido nem a reserva.

O próximo passo é o **Passo 5 — Pix dinâmico + webhook**.

## Testes

```bash
npm test
```

> `whatsapp-web.js` é uma integração não oficial. Valide as políticas comerciais aplicáveis antes do uso em produção.
