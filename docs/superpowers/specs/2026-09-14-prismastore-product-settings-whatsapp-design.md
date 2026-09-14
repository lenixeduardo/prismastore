# PrismaStore — Produtos Reais, Mensagens Configuráveis e WhatsApp

## Objetivo

Transformar o painel atual em uma operação utilizável sem dados de demonstração como fonte operacional. O catálogo usado pelo chatbot deve ser exatamente o catálogo cadastrado no painel, e as mensagens do fluxo do WhatsApp devem ser configuráveis pela própria interface.

## Princípios

- SQLite local continua sendo a única fonte de verdade da aplicação.
- O chatbot não mantém catálogo ou mensagens próprias fora do estado persistido.
- Produtos usados por pedidos antigos não são removidos fisicamente; são desativados.
- Configurações incompletas nunca podem interromper o atendimento: cada mensagem configurável possui fallback seguro.
- O QR Code do WhatsApp deve permanecer legível e compacto: 180 px no desktop e 160 px no mobile.
- A heropage continua sendo a primeira tela da aplicação e o painel é revelado ao clicar em “Acessar painel de controle”.
- O logotipo oficial PrismaStore é o prisma triangular verde-esmeralda com detalhes dourados, usado em favicon, PWA e marca do painel.

## Modelo de estado persistido

O objeto salvo no SQLite passa a seguir esta forma conceitual:

```js
{
  products: [],
  customers: [],
  orders: [],
  settings: {
    chatbotMessages: {
      welcome: "...",
      catalogHeader: "...",
      catalogInstruction: "...",
      invalidProduct: "...",
      quantityPrompt: "...",
      invalidQuantity: "...",
      cartActions: "...",
      deliveryPrompt: "...",
      savedAddressPrompt: "...",
      addressInputPrompt: "...",
      confirmationPrompt: "...",
      cancelled: "...",
      paymentPending: "...",
      paymentConfirmed: "...",
      orderFinished: "..."
    }
  }
}
```

A sanitização do estado deve aceitar bases antigas sem `settings` e preenchê-las com defaults sem apagar produtos, clientes ou pedidos existentes.

## Produtos reais

### Campos mínimos

Cada produto deve possuir:

- `id`: identificador estável gerado pela aplicação.
- `name`: nome exibido ao cliente.
- `category`: categoria operacional.
- `price`: preço numérico maior ou igual a zero.
- `stock`: estoque inteiro maior ou igual a zero.
- `reserved`: quantidade reservada por pedidos ainda não concluídos; default zero.
- `active`: controla disponibilidade sem apagar histórico.
- `createdAt` e `updatedAt` para auditoria básica.

### Operações da interface

A aba Produtos terá:

- botão `Cadastrar produto`;
- formulário para nome, categoria, preço, estoque e status;
- edição de produto existente;
- ativação/desativação;
- indicador de estoque baixo para menos de 3 unidades;
- bloqueio de exclusão física quando o produto já foi usado em pedidos.

O padrão operacional será desativar produtos, não deletá-los.

### Uso pelo chatbot

O catálogo enviado pelo WhatsApp será calculado a partir de `state.products` em tempo real. Um item aparece somente quando:

- `active !== false`;
- estoque disponível (`stock - reserved`) é maior que zero.

Nome, preço e disponibilidade vistos no WhatsApp devem refletir imediatamente o painel após persistência.

## Mensagens configuráveis do fluxo

### Local na interface

A seção `Configurações` será organizada em três grupos:

1. WhatsApp Web;
2. Mensagens do atendimento;
3. Sistema local.

### Editor de mensagens

Cada mensagem terá:

- título da etapa;
- textarea editável;
- lista curta de placeholders aceitos;
- botão para restaurar texto padrão daquela etapa;
- botão principal para salvar as alterações.

### Placeholders

Na primeira versão, os placeholders suportados serão:

- `{cliente}`
- `{produto}`
- `{quantidade}`
- `{preco}`
- `{subtotal}`
- `{pedido}`
- `{endereco}`
- `{estoque}`

Placeholders desconhecidos não causam exceção; permanecem como texto literal ou são ignorados de forma segura, conforme a função de template definida na implementação.

### Defaults

Os textos existentes hoje no `server/chatbot.js` tornam-se os defaults oficiais. Isso preserva o comportamento atual mesmo quando a instalação não possui configurações customizadas.

## Integração com o WhatsApp

O `server/chatbot.js` deixa de depender de strings fixas espalhadas pelo fluxo. Em cada etapa ele deve:

1. carregar o estado atual;
2. resolver a mensagem configurada em `settings.chatbotMessages`;
3. aplicar placeholders com os dados da etapa;
4. usar o default se a mensagem estiver ausente, vazia ou inválida;
5. enviar a resposta.

O catálogo não será configurado como texto estático: os itens continuam sendo gerados dinamicamente a partir dos produtos reais. Apenas cabeçalho e instrução final são configuráveis.

## Persistência e compatibilidade

`server/state-store.js` continuará usando a tabela `app_state`. Não serão criadas tabelas adicionais neste MVP.

A função de sanitização passa a preservar e normalizar `settings`. Bases antigas recebem defaults automaticamente na próxima leitura/gravação.

Backups existentes continuam válidos, já que a estrutura permanece dentro do mesmo JSON persistido.

## Dados mockados

Produtos de seed podem continuar existindo somente para testes automatizados e fixtures. Em uma instalação nova destinada à operação real:

- o banco inicia sem produtos reais cadastrados;
- o chatbot informa catálogo sem itens até o operador cadastrar produtos;
- clientes e pedidos de demonstração não devem ser inseridos automaticamente no banco operacional.

Se for necessário manter uma experiência demonstrativa para desenvolvimento, ela deve ser explicitamente opt-in e nunca o comportamento padrão de produção/local do cliente.

## QR Code do WhatsApp

O QR continuará sendo gerado internamente em alta resolução para garantir leitura, mas seu tamanho visual será limitado por CSS:

- desktop: 180 × 180 px;
- mobile: 160 × 160 px.

O bloco deve ficar centralizado e não pode ocupar altura dominante da tela.

## Tratamento de erros

- Produto inválido: formulário mostra erro e não persiste.
- Falha de persistência: painel mostra erro e mantém dados editados na tela para nova tentativa.
- Mensagem vazia: usa default no runtime.
- WhatsApp desconectado: configurações continuam editáveis e persistentes.
- Produto desativado durante um carrinho: a etapa seguinte deve validar novamente disponibilidade antes de criar o pedido.
- Estoque insuficiente: impedir quantidade maior que o estoque disponível.

## Testes

A implementação deve seguir TDD e incluir cobertura para:

- migração/sanitização de estado antigo sem `settings`;
- cadastro e persistência de produto real;
- edição e desativação;
- catálogo do chatbot refletindo somente produtos ativos e disponíveis;
- mensagens customizadas substituindo defaults;
- fallback quando configuração estiver vazia;
- placeholders principais;
- ausência de seeds operacionais em instalação nova;
- QR com dimensões CSS padrão 180/160 px;
- compatibilidade de backup e restore com o campo `settings`.

## Fora do escopo deste ciclo

- múltiplos usuários/roles;
- sincronização em nuvem;
- upload de imagem individual de produto;
- editor visual de fluxos;
- campanhas e mensagens em massa;
- múltiplos números de WhatsApp simultâneos;
- histórico versionado das mensagens.

Esses itens podem ser adicionados depois sem alterar a decisão atual de manter SQLite como fonte única do MVP.
