#!/usr/bin/env bash
# Install an existing trusted certificate on a dedicated PrismaStore host.
set -euo pipefail
[[ ${EUID} -eq 0 ]] || { echo 'Execute com sudo.' >&2; exit 1; }
site='' host='' cert='' key=''
while [[ $# -gt 0 ]]; do
  [[ $# -ge 2 ]] || { echo 'Argumento sem valor.' >&2; exit 1; }
  case "$1" in
    --site) site=$2;; --host) host=$2;; --cert) cert=$2;; --key) key=$2;;
    *) echo 'Uso: setup-https.sh --site CONFIG --host DOMINIO --cert FULLCHAIN --key PRIVATEKEY' >&2; exit 1;;
  esac
  shift 2
done
[[ -n "$site" && -n "$host" && -n "$cert" && -n "$key" ]] || { echo 'Informe --site, --host, --cert e --key.' >&2; exit 1; }
[[ "$host" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ && "$host" == *.* && "$host" != *..* ]] || { echo 'Hostname inválido.' >&2; exit 1; }
identity_flag=-verify_hostname
if [[ "$host" =~ ^[0-9.]+$ ]]; then
  python3 - "$host" <<'IP'
import ipaddress,sys
ipaddress.IPv4Address(sys.argv[1])
IP
  identity_flag=-verify_ip
fi
for command in nginx openssl python3; do command -v "$command" >/dev/null; done
site=$(readlink -f -- "$site")
# Preserve Certbot live symlinks so reload picks up each renewed certificate.
cert=$(realpath --no-symlinks -- "$cert")
key=$(realpath --no-symlinks -- "$key")
[[ -f "$site" && -f "$cert" && -f "$key" ]] || { echo 'Arquivo ausente.' >&2; exit 1; }
[[ "$cert" =~ ^/[A-Za-z0-9/_.-]+$ && "$key" =~ ^/[A-Za-z0-9/_.-]+$ ]] || { echo 'Caminhos de certificado inválidos.' >&2; exit 1; }
if [[ "$identity_flag" == -verify_ip ]]; then
  openssl x509 -in "$cert" -noout -checkip "$host" >/dev/null
else
  openssl x509 -in "$cert" -noout -checkhost "$host" >/dev/null
fi
openssl x509 -in "$cert" -noout -checkend 86400 >/dev/null
# Certificate and key must match; no private material is displayed.
cert_public=$(openssl x509 -in "$cert" -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256)
key_public=$(openssl pkey -in "$key" -pubout -outform DER | openssl dgst -sha256)
[[ "$cert_public" == "$key_public" ]] || { echo 'Certificado e chave não correspondem.' >&2; exit 1; }
# Verify trust and hostname using the system CA store. Include supplied intermediates.
openssl verify -purpose sslserver "$identity_flag" "$host" -untrusted "$cert" "$cert" >/dev/null
work=$(mktemp -d); chmod 700 "$work"; trap 'rm -rf -- "$work"' EXIT
nginx -T >"$work/effective" 2>"$work/diagnostic"
python3 - "$site" "$work/effective" <<'PY'
import pathlib,re,sys
path=pathlib.Path(sys.argv[1]);dump=pathlib.Path(sys.argv[2]).read_text()
active={str(pathlib.Path(p).resolve()) for p in re.findall(r'^# configuration file (.+):\s*$',dump,re.M)}
if str(path) not in active: sys.exit('Configuração não está ativa; nenhuma alteração.')
s=re.sub(r'#.*','',path.read_text())
s=s.replace('include /etc/nginx/snippets/prismastore-security.conf;', '')
# Accept only the fixed ACME exception installed by our preparation script.
s=s.replace('location ^~ /.well-known/acme-challenge/ { root /var/www/prismastore-acme; default_type text/plain; try_files $uri =404; }', '')
if re.search(r'\b(?:include|root|alias|if|upstream|map)\b',s): sys.exit('Configuração complexa/mista recusada.')
if re.search(r'\blocation\s+(?:\^~|=|~)',s): sys.exit('Locations prioritários recusados.')
stack=[];blocks=[]
for m in re.finditer(r'\bserver\s*\{|[{}]',s):
 t=m.group()
 if t.startswith('server'):
  if stack: sys.exit('Servidor aninhado recusado.')
  stack.append(('server',m.end()))
 elif t=='{':stack.append(('other',m.end()))
 else:
  if not stack:sys.exit('Sintaxe não reconhecida.')
  kind,start=stack.pop()
  if kind=='server':blocks.append(s[start:m.start()])
if stack or not blocks:sys.exit('Configuração dedicada não reconhecida.')
for block in blocks:
 targets=re.findall(r'\bproxy_pass\s+([^;]+);',block)
 if not targets or any(not re.fullmatch(r'http://127\.0\.0\.1:4173/?',t.strip()) for t in targets):sys.exit('Host misto ou sem proxy PrismaStore; nenhuma alteração.')
PY
[[ -f /etc/nginx/snippets/prismastore-security.conf ]] || { echo 'Instale primeiro install-nginx-security.sh.' >&2; exit 1; }
backup=$(mktemp -d /etc/nginx/prismastore-https-rollback.XXXXXXXX); chmod 700 "$backup"
cp -p -- "$site" "$backup/site.conf"; printf '%s\n' "$site" >"$backup/site-path"
cat >"$work/site.conf" <<NGINX
server {
    listen 80;
    server_name $host;
    include /etc/nginx/snippets/prismastore-security.conf;
    location ^~ /.well-known/acme-challenge/ { root /var/www/prismastore-acme; default_type text/plain; try_files \$uri =404; }
    location / { return 308 https://$host\$request_uri; }
}
server {
    listen 443 ssl;
    server_name $host;
    ssl_certificate $cert;
    ssl_certificate_key $key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_tickets off;
    add_header Strict-Transport-Security "max-age=31536000" always;
    include /etc/nginx/snippets/prismastore-security.conf;
    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }
}
NGINX
cat "$work/site.conf" >"$site"
if ! nginx -t || ! nginx -s reload; then
  cp -p -- "$backup/site.conf" "$site"
  nginx -t && nginx -s reload
  echo "Falha; configuração anterior restaurada. Backup: $backup" >&2
  exit 1
fi
echo "HTTPS configurado para $host. Backup: $backup"
echo 'Verifique externamente HTTPS, redirect HTTP e renovação do certificado.'
