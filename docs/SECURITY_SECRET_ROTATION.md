# Rotação após possível exposição

Use o comando no host autorizado após atualizar o bloqueio HTTP de arquivos privados. O script não faz acesso remoto, não altera credenciais no provedor e não reinicia processos.

```sh
node scripts/rotate-security-secrets.mjs
# Para um ambiente específico:
node scripts/rotate-security-secrets.mjs --env /caminho/privado/.env
# Para suspender a integração Drive localmente:
node scripts/rotate-security-secrets.mjs --quarantine-integrations
```

O script gera senha administrativa e segredo delivery independentes, salva o ambiente atomicamente com permissão 0600 e preserva Pix e demais configurações. Backup integral do ambiente anterior e arquivo separado da nova senha ficam em `security-private/`, ao lado do `.env`, com diretório 0700 e arquivos 0600. Mantenha esse diretório fora de qualquer document root, de sincronizações e do Git. O backup contém segredos antigos: mantenha-o privado até concluir recuperação e descarte segundo a política do operador. O script recusa caminhos sob diretórios chamados `public` e links simbólicos no arquivo de ambiente ou diretório privado. Use somente formatos convencionais de `.env`, uma atribuição por linha.

Leia a nova senha diretamente no host, sem copiá-la para chat, logs ou tickets. Reinicie o processo PrismaStore pelo gerenciador já utilizado: sessões administrativas são mantidas em memória, e links delivery antigos deixam de passar na verificação do novo segredo. Gere novos links quando necessário. Até o reinício, o processo continua com os segredos antigos. Se variáveis forem injetadas por systemd, container ou outro gerenciador, atualize também essa fonte: ela pode prevalecer sobre o `.env`.

`--quarantine-integrations` limpa somente as três credenciais Google Drive do ambiente local. Isso suspende novos backups Drive após o reinício; não revoga autorização remota, não remove backups existentes e não elimina credenciais de ambientes externos. Revogue o token/autorização comprometido na conta Google e emita novas credenciais antes de retomar a integração.

No telefone vinculado ao WhatsApp, abra **Aparelhos conectados** e desconecte os dispositivos comprometidos ou desconhecidos. Isso exige ação na conta e não é substituído por apagar arquivos locais. O script preserva integralmente o estado WhatsApp. Se um novo pareamento for necessário, use a ação de desconectar/reiniciar da aplicação somente depois da revogação remota e da confirmação explícita do operador.

Para revisar histórico HTTP, analise cópias privadas dos logs nginx. Conte acessos e códigos de resposta para `.env`, bancos SQLite, `/data/`, `/backups/`, `/server/` e `/security-private/`. Um 200 para caminho privado exige investigação; não prova sozinho que houve exfiltração, e ausência nos logs não exclui acesso. Não publique linhas completas: podem conter IPs, tokens delivery, URLs e outros dados pessoais. Compartilhe apenas contagens por família de caminho/código e intervalo temporal. Não registre novos tokens ou senhas durante essa revisão.
