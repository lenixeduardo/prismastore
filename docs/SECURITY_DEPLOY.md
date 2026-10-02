# Bloqueio imediato no Nginx

Este bloqueio pode ser aplicado na VM sem atualizar o aplicativo. Não foi aplicado automaticamente à produção. A configuração efetiva deve ser identificada na VM; não substitua um virtual host com TLS ou outras aplicações pelo exemplo porta 80.

Para um arquivo dedicado já ativo, aplique sem edição manual:

```bash
sudo bash scripts/install-nginx-security.sh
```

O instalador identifica o único arquivo ativo com proxy `127.0.0.1:4173`, segue links simbólicos, valida que todos seus servidores usam exclusivamente esse destino, insere a proteção, executa `nginx -t` e solicita reload. Se houver candidatos múltiplos, selecione explicitamente o arquivo dedicado:

```bash
sudo bash scripts/install-nginx-security.sh --site /etc/nginx/sites-enabled/prismastore
```

Configurações com `^~`, locations exatos/regex, outros includes, aliases ou hosts mistos são recusadas antes de qualquer alteração. O instalador preserva backups e restaura configuração e snippet se validação/reload falhar. Para configurações complexas ou contenção independente do repositório, siga o procedimento abaixo.

1. Na VM, execute `sudo nginx -T` e localize todos os blocos `server` que encaminham ao `127.0.0.1:4173`, incluindo hosts HTTP/HTTPS e o host padrão. A saída pode conter informações sensíveis: inspecione localmente, não a publique. Registre o arquivo indicado pelo comentário `# configuration file ...`. Se há múltiplos servidores, inclua a proteção em cada um. Não presuma que somente um arquivo em `sites-enabled` controla o acesso.
2. Instale a proteção abaixo, independentemente de `git pull`:

```bash
sudo install -d -m 0755 /etc/nginx/snippets
sudo tee /etc/nginx/snippets/prismastore-security.conf >/dev/null <<'NGINX'
location ~* (^|/)\.(?!well-known(?:/|$)) { return 404; }
location ~* ^/(?:data|backups|server|scripts|tests|docs|node_modules|deploy)(?:/|$) { return 404; }
location ~* ^/(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|README(?:\.[^/]*)?|PRISMASTORE_TODO\.md|design-qa\.md|(?:INICIAR|INSTALAR)_PRISMASTORE\.bat)$ { return 404; }
location ~* \.(?:db(?:-(?:wal|shm))?|sqlite(?:3)?|sql|log|bak|backup|old|orig|save|swp|pem|key|conf|env|ya?ml|toml|lock)$ { return 404; }
NGINX
```

Se o snippet já existe, faça antes uma cópia com `sudo cp -a /etc/nginx/snippets/prismastore-security.conf /etc/nginx/snippets/prismastore-security.conf.rollback`. O instalador do repositório também preserva uma cópia antes de atualizar o snippet: `sudo bash scripts/install-nginx-security.sh`. O instalador só modifica automaticamente um arquivo dedicado que passe suas verificações; configurações ambíguas exigem `--site`. Um include existente em um host não comprova proteção dos outros.

3. Defina `CONF` como o arquivo real identificado no passo 1; use `readlink -f` se for um link. Faça backup antes de editar:

```bash
CONF=/etc/nginx/sites-available/prismastore
CONF=$(readlink -f "$CONF")
sudo cp -a -- "$CONF" "$CONF.rollback"
sudoedit "$CONF"
```

Dentro de cada `server {}` público PrismaStore, adicione **antes de qualquer location regex**:

```nginx
include /etc/nginx/snippets/prismastore-security.conf;
```

Use `location /` para o proxy; remova o modificador `^~` de locations que cobrem arquivos protegidos, pois ele desativa a avaliação das regras regex. Remova aliases/root/exact locations que entreguem os diretórios protegidos e outros proxies que contornem o bloqueio. Nginx compara essas regex com URIs normalizadas, incluindo decodificação percentual e resolução de segmentos `.`. O modificador `~*` cobre variação de maiúsculas/minúsculas. A exceção `.well-known` permite renovação ACME; arquivos privados dentro dela continuam sujeitos aos demais bloqueios.

No proxy público direto à Internet, sobrescreva os cabeçalhos:

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
```

Se existir CDN/load balancer anterior, configure primeiro os IPs confiáveis no módulo real_ip; não confie indiscriminadamente em cabeçalhos enviados pelo cliente. O arquivo `deploy/prismastore.nginx.conf` exemplifica um virtual host HTTP dedicado, sem servir a raiz do repositório. Preserve o TLS existente. Habilite HTTPS para acesso administrativo remoto.

4. Valide e só então recarregue:

```bash
sudo nginx -t && sudo nginx -s reload
```

Se `nginx -t` falhar, restaure o arquivo antes de recarregar:

```bash
sudo cp -a -- "$CONF.rollback" "$CONF"
sudo nginx -t && sudo nginx -s reload
```

Restaure também o snippet anterior se ele foi alterado. Se não havia snippet anteriormente, restaure os arquivos dos virtual hosts antes de removê-lo. Para incidentes durante o bloqueio, prefira manter os bloqueios e corrigir a configuração; um rollback remove a proteção.

5. Verifique sem baixar conteúdo sensível (somente HEAD), em cada host público, HTTP e HTTPS:

```bash
BASE=http://163.176.60.192
for path in '/.env' '/%2eenv' '/.ENV' '/data/prismastore.db' '/DATA/prismastore.db' '/data/whatsapp-auth/creds.json' '/backups/probe/manifest.json' '/server/index.js' '/package.json'; do
  curl --path-as-is --silent --show-error --head "$BASE$path" | head -n 1
done
curl --silent --show-error --head "$BASE/" | head -n 1
```

Os caminhos protegidos devem responder `404` (ou bloqueio equivalente), e o painel deve continuar abrindo. HEAD não copia os arquivos. Estes comandos não testam disponibilidade de backups reais nem enumeram IDs. Bloqueie acesso direto à porta 4173 no firewall, mantenha `HOST=127.0.0.1`, configure uma senha administrativa e um segredo de entrega fortes. O proxy torna o loopback acessível externamente: senha vazia não é segura atrás dele.

Após bloquear, rotacione senha administrativa, segredo de entrega, credenciais Google Drive e sessão WhatsApp que poderiam ter sido expostos. Revise logs de acesso àqueles caminhos. Este snippet é contenção; mantenha também a correção no servidor Node com lista explícita de arquivos públicos.
