#!/usr/bin/env bash
set -euo pipefail
[[ ${EUID} -eq 0 && $# -eq 2 && $1 == --site ]] || { echo 'Uso: sudo bash prepare-acme-webroot.sh --site CONFIG' >&2; exit 1; }
site=$(readlink -f -- "$2")
script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# Performs strict dedicated-host validation and installs the security guards.
bash "$script_dir/install-nginx-security.sh" --site "$site"
backup=$(mktemp -d /etc/nginx/prismastore-acme-rollback.XXXXXXXX); chmod 700 "$backup"
cp -p -- "$site" "$backup/site.conf"
install -d -m 0755 /var/www/prismastore-acme/.well-known/acme-challenge
python3 - "$site" <<'PY'
from pathlib import Path
import re,sys
p=Path(sys.argv[1]);s=p.read_text()
challenge='location ^~ /.well-known/acme-challenge/ { root /var/www/prismastore-acme; default_type text/plain; try_files $uri =404; }'
s=re.sub(r'^(\s*server\s*\{)',lambda m:m.group()+'\n    '+challenge,s,flags=re.M)
p.write_text(s)
PY
if ! nginx -t || ! nginx -s reload; then
  cp -p -- "$backup/site.conf" "$site"
  nginx -t && nginx -s reload
  echo 'Falha; configuração anterior restaurada.' >&2; exit 1
fi
echo "Webroot ACME preparado. Backup: $backup"
