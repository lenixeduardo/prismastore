#!/usr/bin/env bash
# Dedicated virtual hosts only. Never edit a mixed application config.
set -euo pipefail
if [[ ${EUID} -ne 0 ]]; then echo 'Execute com sudo.' >&2; exit 1; fi
site=''
if [[ $# -gt 0 ]]; then
  [[ $# -eq 2 && $1 == --site ]] || { echo 'Uso: install-nginx-security.sh [--site /caminho/config]' >&2; exit 1; }
  site=$2
fi
command -v nginx >/dev/null
command -v python3 >/dev/null
script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source_file="$script_dir/../deploy/nginx-security.conf"
destination=/etc/nginx/snippets/prismastore-security.conf
[[ -f "$source_file" ]] || { echo 'Snippet ausente.' >&2; exit 1; }
# Keep the effective config private: it can contain credentials.
work_dir=$(mktemp -d)
chmod 700 "$work_dir"
trap 'rm -rf -- "$work_dir"' EXIT
nginx -T >"$work_dir/effective" 2>"$work_dir/diagnostic"
python3 - "$site" "$work_dir/effective" "$work_dir/site" "$work_dir/proposed" <<'PY'
import pathlib, re, sys
explicit, dump_path, selected_path, proposed_path = sys.argv[1:]
dump = pathlib.Path(dump_path).read_text()
sections = re.split(r'^# configuration file (.+):\s*$', dump, flags=re.M)
active = {}
for i in range(1, len(sections), 2):
    path = pathlib.Path(sections[i]).resolve()
    active[str(path)] = sections[i + 1]
proxy = re.compile(r'\bproxy_pass\s+http://127\.0\.0\.1:4173/?\s*;')
if explicit:
    path = pathlib.Path(explicit).resolve()
    if str(path) not in active:
        sys.exit('O --site não está carregado em nginx -T; nenhuma alteração.')
else:
    candidates = set()
    for name, content in active.items():
        if proxy.search(content):
            candidates.add(name)
    if len(candidates) != 1:
        sys.exit('Configuração ausente ou ambígua; use --site com o arquivo dedicado ativo.')
    path = pathlib.Path(candidates.pop())
raw = path.read_text()
# Ignore comments for validation, preserve all original text for the edit.
clean = re.sub(r'#.*', '', raw)
if re.search(r'\blocation\s+(?:\^~|=|~\*?)', clean):
    sys.exit('Location prioritário/regex existente: revisão necessária; nenhuma alteração.')
if re.search(r'\b(?:root|alias|include|if)\b', clean.replace('include /etc/nginx/snippets/prismastore-security.conf;', '')):
    sys.exit('Configuração contém root/alias/include/if não verificado; nenhuma alteração.')
# Reject syntax we cannot safely parse, including quoted braces/regex braces.
if '"' in clean or "'" in clean or '$' in re.sub(r'\$(?:host|remote_addr|scheme|http_upgrade|connection_upgrade)\b', '', clean):
    sys.exit('Configuração complexa: revisão necessária; nenhuma alteração.')
stack, blocks = [], []
for match in re.finditer(r'\bserver\s*\{|[{}]', clean):
    token = match.group()
    if token.startswith('server'):
        if stack: sys.exit('server aninhado não suportado.')
        stack.append(('server', match.end()))
    elif token == '{': stack.append(('other', match.end()))
    else:
        if not stack: sys.exit('Chaves inválidas.')
        kind, start = stack.pop()
        if kind == 'server': blocks.append(clean[start:match.start()])
if stack or not blocks or len(re.findall(r'\bserver\s*\{', clean)) != len(blocks):
    sys.exit('Arquivo não é um virtual host dedicado reconhecido.')
for block in blocks:
    targets = re.findall(r'\bproxy_pass\s+([^;]+);', block)
    if not targets or any(not re.fullmatch(r'http://127\.0\.0\.1:4173/?', t.strip()) for t in targets):
        sys.exit('Arquivo contém servidor sem proxy PrismaStore exclusivo; nenhuma alteração.')
# Preserve text; place the include first and remove duplicates.
include = 'include /etc/nginx/snippets/prismastore-security.conf;'
proposed = re.sub(r'^\s*include\s+/etc/nginx/snippets/prismastore-security\.conf\s*;\s*$', '', raw, flags=re.M)
proposed = re.sub(r'^(\s*server\s*\{)', lambda m: m.group()+'\n    '+include, proposed, flags=re.M)
if proposed.count(include) != len(blocks): sys.exit('Formato server não suportado; nenhuma alteração.')
pathlib.Path(selected_path).write_text(str(path))
pathlib.Path(proposed_path).write_text(proposed)
PY
site=$(cat "$work_dir/site")
backup_dir=$(mktemp -d /etc/nginx/prismastore-security-rollback.XXXXXXXX)
chmod 700 "$backup_dir"
cp -p -- "$site" "$backup_dir/site.conf"
printf '%s\n' "$site" >"$backup_dir/site-path"
had_previous=false
if [[ -e "$destination" ]]; then cp -p -- "$destination" "$backup_dir/snippet.conf"; had_previous=true; fi
restore() {
  cp -p -- "$backup_dir/site.conf" "$site"
  if "$had_previous"; then cp -p -- "$backup_dir/snippet.conf" "$destination";
  else rm -f -- "$destination"; fi
}
mkdir -p /etc/nginx/snippets
install -m 0644 -- "$source_file" "$destination"
cat "$work_dir/proposed" >"$site"
if ! nginx -t; then
  restore
  echo "Validação falhou; configuração restaurada. Backup: $backup_dir" >&2
  exit 1
fi
if ! nginx -s reload; then
  restore
  nginx -t && nginx -s reload
  echo "Reload falhou; configuração restaurada. Backup: $backup_dir" >&2
  exit 1
fi
echo "Bloqueio incluído em $site; configuração validada e reload solicitado. Backup: $backup_dir"
