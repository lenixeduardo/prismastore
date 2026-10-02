# Fechamento dos três pontos da auditoria

## Correções de código e ferramentas

1. Proxy: cabeçalhos só são aceitos de IPs confiáveis explícitos; XFF usa o último IP validado. Limite global de login complementa o limite por IP. O dossiê passa a usar a mesma origem validada.
2. Transporte: runtime exige HTTPS quando a URL pública é remota; login, APIs e confirmação recusam transporte inseguro antes de ler corpo. Cookies usam Secure. Scripts preparam ACME e instalam TLS com certificado confiável para IP, redirect e renovação documentada.
3. Segredos: script gera senha administrativa e segredo de entrega independentes, preserva PIX e demais dados, grava ambiente/backup com permissões privadas. A chave pública constante de fallback foi removida; sem chave persistente dedicada, runtime gera uma chave efêmera e links não sobrevivem ao reinício.

## Ativação na VM

Instale certificado e configuração HTTPS ANTES de reiniciar o novo runtime, pois acesso remoto por HTTP passa a ser bloqueado. Siga SECURITY_DEPLOY.md. Use o IP público 163.176.60.192, Certbot >=5.4 e perfil shortlived; mantenha porta80 para desafio ACME e porta443 liberada no firewall/Oracle.

No .env configure:

```env
PRISMASTORE_PUBLIC_URL=https://163.176.60.192/
PRISMASTORE_REQUIRE_HTTPS=true
PRISMASTORE_TRUSTED_PROXIES=127.0.0.1,::1
```

Depois execute a rotação uma única vez no diretório da instalação e reinicie com PM2:

```bash
node scripts/rotate-security-secrets.mjs
pm2 restart prismastore --update-env
```

A senha nova fica no arquivo privado indicado pelo script; leia somente localmente. Reinício invalida sessões e links anteriores. Credenciais injetadas no PM2 devem ser atualizadas também, pois podem prevalecer sobre .env. Reemita os links de entrega necessários.

## Pendências externas

Nenhum acesso SSH foi disponibilizado: não emitimos certificado, não alteramos .env real nem revogamos credenciais nas contas. Scripts e código não substituem esses atos. Revogue aparelhos comprometidos no WhatsApp e tokens/autorização Google, emita novas credenciais e revise logs históricos. --quarantine-integrations apenas suspende Drive localmente, sem revogar no provedor.

## Validação

18 testes focados de proxy, autenticação, HTTPS, configuração e rotação passaram. Scripts shell passam bash -n. A suíte completa mantém somente as 12 falhas preexistentes documentadas em SECURITY_VERIFICATION.md. Os testes de rotação usam ambientes fictícios e não mudam credenciais reais. Nginx e emissão ACME ainda precisam ser validados na VM.
