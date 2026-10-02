# Validação PrismaStore — auditar-seguranca-prismastore

Os casos locais não demonstraram acesso anônimo a dados privados. A proteção de arquivos e APIs também respondeu com bloqueios nos pedidos externos que concluíram. Isso não comprova segurança global: HTTPS, rotação real de segredos e configuração efetiva da VM continuam pendentes. A revisão encontrou validação incompleta de imagens de evidência, ausência de verificação de Origin em ações administrativas e permissões locais insuficientes no banco criado com umask022.

## Alvo e alcance

- Repositório lenixeduardo/prismastore; base main `1366918e38919436a2f6c610fd9d1a998ababecc`; mudanças locais na branch security/proxy-https-secret-rotation.
- Data: 02/10/2026, UTC; nova amostra externa encerrada às 13:32:28 UTC. Endereço fornecido: http://163.176.60.192. Respostas atuais confirmaram servidor HTTP nesse endereço; revisão publicada não foi obtida do servidor.
- Modalidades: revisão de código, testes locais com registros sintéticos e poucos HEAD externos sem baixar dados internos. Node/SQLite/WhatsApp verificados no código; PM2/Nginx da instalação não inspecionados diretamente.
- Acessos disponíveis: checkout e GitHub. Sem SSH/sudo na VM, conta administrativa de produção, clientes A/B ou contas de provedores. Nenhum AGENTS.md encontrado na busca em /workspace.
- Skill e suas duas referências lidas. Três agentes especializados revisaram APIs, autenticação e infraestrutura/segredos.

## Matriz de dez categorias

| Nº | Verificação | Método/identidade | Esperado | Observado | Estado | Evidência |
|---|---|---|---|---|---|---|
| 1 | Arquivos internos | GET/HEAD local, anônimo/admin; HEAD externo | Arquivos privados e symlinks rejeitados | Local 404 inclusive symlinks; externo banco/código 404; .env teve timeout na nova amostra | sem falha observada | E1, E6; antiga amostra E7 |
| 2 | APIs sem login | 18 rotas locais × sessão ausente/inválida/expirada | Todas privadas rejeitadas | 54 casos 401; backups/relatório externos 401; state externo timeout atual | sem falha observada | E2, E6 |
| 3 | Acesso entre clientes | Troca sintética de ID em token de confirmação | Token não autoriza outro pedido | HMAC adulterada rejeitada; não há login de cliente A/B no modelo atual | sem falha observada | E3; comparação entre contas não testada |
| 4 | Papéis e sessão | Login/logout/expiração sintéticos e revisão | Sessão válida exigida; expiração/revogação | Testes passam; modelo é administrador único, sem papel de cliente | sem falha observada | E4; papéis múltiplos não testados |
| 5 | Link do bot | Tokens sintéticos, escopo, expiração e reemissão | Dados mínimos, token limitado, ação idempotente | Testes passam; sem PII no GET; reemissão invalida link anterior; URL pública usa IP configurado | sem falha observada | E3; bot real não acionado |
| 6 | Injeção/uploads | SQL estático e entradas sintéticas de imagem | Consultas parametrizadas e imagem válida | SQLite parametrizado; SVG/tamanho rejeitados; base64 de conteúdo não imagem aceito | vulnerável | E5, achado A1 |
| 7 | CSRF/CORS/abuso | Proxy/login/origem adversa em fixture admin | Cabeçalhos confiáveis e origem de escrita controlada | Proxy corrigido; Origin hostil com cookie explícito executa backup; GET token incrementa contador sem limite | vulnerável | E4, E5, achado A2; risco A3 |
| 8 | Nginx/serviços | Revisão scripts, bash -n, fixtures locais | Root público, proxy e TLS corretos | Scripts preparados e sintaxe válida; nginx -T/-t da VM, aliases ativos e portas não obtidos | não testado | E8; código revisado, instalação não validada |
| 9 | Transporte/cache/erros | HTTP externo; HTTPS exigido localmente; headers | HTTPS, no-store e sem dados em erro | HTTP externo ainda responde sem redirect; local recusa APIs/entrega com 426 e cookie Secure; erros testados no-store | vulnerável | E1, E4, E6; código corrigido, TLS publicado não confirmado |
| 10 | Segredos/dependências/permissões | Revisão tracked, script e SQLite sintéticos; advisory oficial | Segredos privados/rotacionados; arquivos privados; dependências triadas | Banco0644 e diretório0755 sob umask022; sem matches em149 textos; rotação fixture passa; advisory consultado corrigido na versão declarada | vulnerável | E9, achado A4; segredos reais/histórico/transitivas não integralmente verificados |

Estados referem-se ao alcance descrito em cada linha. Aprovação de casos específicos não cobre todos os caminhos possíveis.

## Achados e correções

### A1 — Evidência que não é imagem é aceita (baixa)

Pré-condição: possuir token válido de entrega. `validateDataUrl` em server/delivery-confirmation-service.js verifica prefixo PNG/JPEG/WebP e tamanho, mas não decodifica e valida imagem. Uma fixture aceitou `data:image/png;base64,aGVsbG8=` (texto sintético) e confirmou a entrega. Afeta a qualidade/integridade da assinatura ou foto; não foi demonstrada execução de código ou acesso ao disco. Corrigir com decodificação estrita, validação do formato/dimensões e rejeição de conteúdo inválido antes de confirmar. Ainda não corrigido nesta rodada.

### A2 — Origin não verificada nas ações administrativas (média, condicional)

Fixture isolada: POST /api/backups, cookie administrativo sintético válido, Origin https://untrusted.example.test e Content-Type text/plain retornou 200 e criou um backup fictício. O teste injeta cookie manualmente e não reproduz comportamento de browser. SameSite=Strict mitiga CSRF cross-site comum, e ACAO está ausente; uma origem hostil same-site que receba envio de cookie é a pré-condição relevante. O servidor não valida Origin/CSRF. Corrigir por validação de origem nas mutações e contrato de conteúdo JSON onde aplicável, preservando clientes autorizados. Ainda não corrigido nesta rodada.

### A3 — Abertura de link sem limite de taxa (hipótese de abuso)

Quatro GET sintéticos de token válido retornaram 200 e incrementaram openCount. Sem limite no serviço; possível ruído de auditoria/escritas repetidas. Não houve teste de carga ou demonstração de indisponibilidade. Não classificado como vazamento confirmado.

### A4 — Banco legível por outros usuários locais (média, condicional)

Fixture isolada com umask022 confirmou diretório data0755 e SQLite0644. Causa: mkdir/open sem restrição explícita em server/state-store.js; backup-service.js também usa criação padrão de diretórios. Um usuário local que atravesse os diretórios pais pode ler banco com dados de clientes; permissões da VM e presença de outros usuários não foram verificadas. Corrigir modos0700/0600 também para arquivos existentes, backups e credenciais, preservando o acesso do usuário do serviço. Ainda não corrigido nesta rodada. O bootstrap contém nomes/telefones de exemplo; sua natureza real não foi confirmada e os valores não são reproduzidos neste relatório.

### Pontos do relatório anterior

1. X-Forwarded-For: correção local e reteste concluídos. Só peers explicitamente confiáveis fornecem cabeçalhos; último IP válido é usado; limite global complementa limite por IP. Provas de cabeçalho falso/rotacionado agora bloqueadas. Deploy dessa revisão não confirmado.
2. HTTP: risco alto quando credenciais/tokens trafegam pela rede. Runtime local exige HTTPS para URL pública remota; scripts preparam certificado IP e Nginx com rollback. A amostra externa ainda respondeu em HTTP sem Location. Nenhum certificado emitido ou Nginx real alterado por esta sessão.
3. Segredos anteriormente expostos: procedimento e ferramenta de rotação criados, testados com .env fictício. Senha/segredo independentes, gravação 0600 e diretório0700, sem publicar valores. Credenciais reais e autorizações de Google/WhatsApp não foram revogadas. Não declarar incidente encerrado por criação do script.

## Mudanças e regressão

Mudanças efetivas no checkout: confiança explícita de proxy, bloqueio HTTPS no backend, limite global de login, segredo efêmero aleatório quando não configurado, scripts ACME/TLS e rotação, bloqueio do diretório security-private e documentação operacional.

18 testes focados passaram. Suíte completa: 326 testes, 314 aprovados, 12 falhas preexistentes documentadas em SECURITY_VERIFICATION.md. As suítes de autenticação, leitura admin autorizada e confirmação sintética preservaram os fluxos exercitados. Não foi enviado WhatsApp, feito pagamento, alterado pedido real ou validado painel/bot em produção. Instalar TLS antes de reiniciar o runtime novo para evitar bloquear o uso legítimo por HTTP.

## Evidências reproduzíveis

- E1: `node --test tests/security-access.test.mjs`: arquivos privados/symlinks, fail-closed, no-referrer/nosniff; leitura admin autorizada.
- E2: tests/admin-auth-api.test.mjs e prova temporária do agente: 18 caminhos privados × três estados de sessão, todos401, sem dados reais. A prova temporária não está versionada; evidência de execução relatada pelo agente, com menor reprodutibilidade que as suítes persistidas.
- E3: tests/delivery-confirmation-security.test.mjs e tests/delivery-confirmation.test.mjs: HMAC, expiração, reemissão, escopo e confirmação sintética.
- E4: tests/auth-service.test.mjs, tests/security-proxy.test.mjs, tests/security-runtime-config.test.mjs: logout/expiração, proxy e política de HTTPS. Agente auth relatou12/12 aprovados.
- E5: provas temporárias dos agentes, sem persistir tokens/cookies: imagem de texto aceita; backup Origin hostil com cookie explícito; quatro aberturas de link. Limitação: fixtures não versionadas.
- E6: docs/security-evidence/skill-external.json, seis HEAD em produção, quatro respostas e dois timeouts; no-store nos casos concluídos. Sem leitura de corpos.
- E7: amostra anterior de 02/10 às13:19:48 UTC: dez HEAD, seis404 e quatro401. Resultado histórico, não substitui a nova amostra e não representa dez categorias independentes.
- E8: `bash -n scripts/setup-https.sh scripts/prepare-acme-webroot.sh scripts/install-nginx-security.sh`; inspeção estática dos scripts. Configuração operacional não disponível.
- E9: `node --test tests/rotate-security-secrets.test.mjs`; revisão package.json e [advisory oficial GHSA-qvv5-jq5g-4cgg](https://github.com/WhiskeySockets/Baileys/security/advisories/GHSA-qvv5-jq5g-4cgg), corrigido em6.7.22. Isso não constitui varredura completa de dependências; ausência de lockfile impede determinar a árvore transitiva publicada.

## Pendências concretas

Acesso à VM para nginx -T sanitizado, validação nginx -t, portas e firewall, instalação TLS, rotação real e reteste externo HTTPS. Revogação nas contas Google/WhatsApp e revisão dos logs históricos. Testes browser de origem/cookie; corrigir A1/A2; avaliar limites do link. Não foi obtido conteúdo de banco, arquivo .env ou PII de produção nesta validação.
