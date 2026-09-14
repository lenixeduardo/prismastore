# Passo 8 — Backup, restauração e instalação

## Backup

`POST /api/backups` cria um snapshot em `backups/<id>/`. O SQLite usa `node:sqlite.backup`, e a sessão `.wwebjs_auth` é copiada depois de pausar o WhatsApp quando necessário.

O manifesto contém `schemaVersion`, versão do app, data, motivo, presença de LocalAuth e SHA-256/tamanho de todos os arquivos protegidos.

## Restauração

`POST /api/backups/:id/restore` valida o id e os hashes antes de tocar no estado ativo. Em seguida cria um snapshot `pre-restore`, restaura banco e LocalAuth e reconecta o WhatsApp. Em falha durante a substituição, tenta rollback pelo snapshot de segurança.

## Segurança

`.env` nunca é copiado. `backups/`, `.wwebjs_auth/`, `data/*.db*` e a arte PNG reconstruída são ignorados pelo Git.

## Windows

`INSTALAR_PRISMASTORE.bat` é o instalador inicial; `INICIAR_PRISMASTORE.bat` é o inicializador diário.
