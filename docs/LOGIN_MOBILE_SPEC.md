# PrismaStore — Spec da tela de login mobile

## Objetivo
Criar uma tela de autenticação mobile-first coerente com a identidade visual do PrismaStore, mantendo a autenticação administrativa existente e evitando chamadas ao estado operacional antes de a sessão estar validada.

## Diretrizes visuais
- Fundo verde/preto profundo, sem slogans adicionais.
- Marca PrismaStore + Operations no topo.
- Título principal: **Entrar**.
- Subtítulo: **Acesse o painel de controle da sua operação.**
- Prisma decorativo abstrato posicionado no canto superior direito.
- Card central com borda esmeralda discreta.
- Inputs de **Usuário** e **Senha**.
- Botão principal e botão secundário com glassmorphism, blur e borda esmeralda.
- Sem os textos:
  - "PRISMASTORE · MVP"
  - "Operação simples"
  - "Crescimento real"

## Comportamento
- O usuário continua sendo autenticado pela rota `POST /api/auth/login`.
- O usuário padrão é definido por `PRISMASTORE_ADMIN_USER`, com fallback `admin`.
- A senha não possui valor padrão e deve ser definida em `PRISMASTORE_ADMIN_PASSWORD`.
- Se a API de autenticação estiver indisponível, a tela deve permanecer bloqueada e exibir uma mensagem clara de servidor local indisponível.
- O app não deve chamar `/api/state` antes da autenticação ser concluída.

## Responsividade
- Prioridade para 375–430 px de largura.
- Desktop mantém o mesmo componente centralizado com largura máxima de 440 px.
- Respeitar safe areas em iOS.

## Asset
- `assets/login-prism-burst.svg`
- Uso exclusivamente decorativo.
- Sem texto embutido.
