# PrismaStore Passo 8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar backup/restauração seguros do SQLite + LocalAuth e instalação Windows simplificada no MVP 0.8.0.

**Architecture:** O `state-store` cria/restaura snapshots SQLite consistentes. `backup-service` orquestra banco, sessão WhatsApp, SHA-256 e rollback. `app-server` expõe a API e `backup-ui.js` adiciona a experiência ao painel sem reestruturar `app.js`.

**Tech Stack:** Node.js 22.5+, `node:sqlite`, `node:crypto`, SQLite WAL, JavaScript ES modules, Batch Windows.

**Spec:** `docs/superpowers/specs/2026-09-14-step8-backup-install-design.md`

## Global Constraints

- Manter um único processo Node.js.
- Não adicionar PostgreSQL, Redis, Docker ou ORM.
- `.env` nunca entra no backup nem no Git.
- `backups/`, `.wwebjs_auth/` e banco local ficam fora do Git.
- Restauração valida id, manifesto e SHA-256 antes de modificar dados ativos.
- Toda restauração cria backup `pre-restore`.

---

### Task 1: Snapshot SQLite consistente

**Files:**
- Modify: `server/state-store.js`
- Modify: `tests/state-store.test.mjs`

**Interfaces:**
- Produces: `backupTo(targetPath)` e `restoreFrom(sourcePath)`.

- [x] Escrever teste que salva estado + chat session, cria snapshot, altera dados e restaura o snapshot.
- [x] Executar o teste e confirmar falha por métodos ausentes.
- [x] Implementar `node:sqlite.backup`, `PRAGMA quick_check`, fechamento/reabertura e limpeza WAL/SHM.
- [x] Executar o teste e confirmar restauração do estado e sessão.

### Task 2: Orquestração de backup e integridade

**Files:**
- Create: `server/backup-service.js`
- Create: `tests/backup-service.test.mjs`

**Interfaces:**
- Produces: `listBackups()`, `createBackup()`, `validateBackup(id)`, `restoreBackup(id)`.

- [x] Testar criação com e sem `.wwebjs_auth`.
- [x] Testar rejeição de path traversal e arquivo corrompido.
- [x] Implementar manifesto com SHA-256/tamanho e cópia segura sem symlinks.
- [x] Implementar pausa/reconexão do WhatsApp, `pre-restore` e tentativa de rollback.
- [x] Confirmar testes verdes.

### Task 3: API local

**Files:**
- Modify: `server/app-server.js`
- Create: `tests/backup-api.test.mjs`
- Create: `tests/backup-runtime.test.mjs`

**Interfaces:**
- Produces: `GET /api/backups`, `POST /api/backups`, `POST /api/backups/:id/restore`.

- [x] Escrever testes HTTP para listagem, criação e restauração.
- [x] Confirmar 404 antes da implementação.
- [x] Injetar ou criar `backup-service` pelo `staticDir`.
- [x] Confirmar endpoints verdes.

### Task 4: Configurações no painel

**Files:**
- Create: `src/backup-ui.js`
- Create: `src/backup.css`
- Modify: `index.html`
- Create: `tests/backup-ui.test.mjs`

**Interfaces:**
- Consumes: API de backup da Task 3.

- [x] Testar carregamento do módulo, criação e confirmação de restauração.
- [x] Implementar card “Backup e recuperação” apenas na tela Configurações.
- [x] Exibir último backup, integridade, sessão WhatsApp e histórico.
- [x] Confirmar testes verdes e responsividade.

### Task 5: Instalação Windows e documentação

**Files:**
- Create: `INSTALAR_PRISMASTORE.bat`
- Modify: `INICIAR_PRISMASTORE.bat`
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `PRISMASTORE_TODO.md`
- Modify: `docs/MVP_STATUS.md`
- Create: `docs/PASSO_8.md`
- Modify: `package.json`
- Create: `tests/installer.test.mjs`

**Interfaces:**
- Produces primeira instalação e inicialização diária sem terminal.

- [x] Testar Node, `.env`, `npm install`, `data/`, `backups/` e launcher da Área de Trabalho.
- [x] Implementar instalador sem contornar políticas do Windows.
- [x] Atualizar versão para `0.8.0` e regras de ignore.
- [x] Documentar backup/restauração e instalação.

### Task 6: Verificação e integração

- [x] Executar `npm test` e exigir zero falhas.
- [x] Executar `node --check` nos módulos alterados.
- [x] Verificar ausência de segredos nos arquivos versionáveis.
- [ ] Abrir PR `step8-backup-install` contra `main`, mesclar e conferir SHA/versionamento remoto.
