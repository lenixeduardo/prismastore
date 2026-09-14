# PrismaStore Passo 8 — Backup, restauração e instalação

## Objetivo

Fechar o MVP 0.8.0 com recuperação operacional segura em Windows sem exigir terminal: snapshots consistentes do SQLite, inclusão opcional da sessão LocalAuth do WhatsApp, restauração validada com backup de segurança automático e instalador/inicializador simplificados.

## Arquitetura

O `state-store` passa a expor backup e restauração do banco sem trocar o formato dos dados. O backup usa `node:sqlite.backup()` para produzir uma cópia consistente mesmo com WAL ativo. A restauração fecha o handle atual, substitui o arquivo e reabre o banco, recriando os statements internos.

Um novo `backup-service` orquestra banco, `.wwebjs_auth`, manifestos, hashes SHA-256 e reconexão do WhatsApp. Backups ficam em `backups/` e nunca entram no Git. O `.env` não é copiado.

O servidor expõe listagem, criação e restauração. A tela de Configurações recebe um módulo isolado `backup-ui.js`, seguindo o padrão modular dos Passos 5–7.

## Formato do backup

Cada snapshot usa um id seguro no formato `backup-YYYYMMDD-HHMMSS-mmm-xxxx` e contém:

- `prismastore.db`
- `whatsapp-auth/` quando existir
- `manifest.json`

O manifesto registra versão, data, motivo, inclusão de sessão WhatsApp e uma lista de arquivos com tamanho e SHA-256.

## Criação

Ao criar backup, o serviço detecta se o WhatsApp está conectado. Se estiver, desconecta temporariamente, cria snapshot consistente do SQLite, copia a sessão LocalAuth, grava o manifesto e reconecta ao final. Falhas removem o diretório temporário e preservam o ambiente ativo.

## Restauração

A restauração primeiro valida id/path e todos os hashes. Antes de substituir qualquer dado, cria um novo backup de segurança (`pre-restore`). Em seguida desconecta o WhatsApp, restaura o SQLite e a sessão LocalAuth e reconecta quando aplicável.

Se a validação inicial falhar, nada é substituído. Se uma falha ocorrer durante a substituição, o serviço tenta rollback usando o backup de segurança recém-criado.

## API

- `GET /api/backups`
- `POST /api/backups`
- `POST /api/backups/:id/restore`

Ids inválidos ou path traversal retornam erro antes de acesso a disco fora de `backups/`.

## Painel

Configurações ganha “Backup e recuperação” com último backup, botão “Criar backup agora”, histórico, indicação “WhatsApp incluído” e ação Restaurar. A restauração exige confirmação no navegador.

## Windows

`INSTALAR_PRISMASTORE.bat` verifica Node.js e abre a página oficial do Node LTS caso esteja ausente, prepara `.env`, dependências, diretórios e cria um inicializador na Área de Trabalho apontando para `INICIAR_PRISMASTORE.bat`. O inicializador diário continua sendo o ponto de entrada normal.

## Segurança

- `.env`, API keys e tokens não entram no backup.
- `backups/`, `.wwebjs_auth/`, `data/*.db*` e arte reconstruída continuam ignorados pelo Git.
- Restauração nunca aceita caminho arbitrário enviado pelo navegador.
- Manifesto e hashes são validados antes de modificar o estado ativo.
