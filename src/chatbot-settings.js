export const CHATBOT_MESSAGE_DEFAULTS = Object.freeze({
  welcome: 'Olá, *{cliente}*! 👋\nBem-vindo à *Prisma Store*. Vou cuidar do seu pedido por aqui de forma simples.',
  catalogHeader: '🛍️ *CARDÁPIO PRISMA STORE*',
  catalogInstruction: 'Responda somente com o *número do item* que deseja.',
  invalidProduct: 'Não encontrei essa opção.',
  quantityPrompt: 'Você escolheu *{produto}*.\nQuantas unidades deseja? Restam {estoque} disponível(is) para este pedido.',
  invalidQuantity: 'Você pode adicionar de 1 até {estoque} unidade(s).',
  cartActions: '1 — Adicionar outro item\n2 — Finalizar pedido\n0 — Cancelar',
  deliveryPrompt: 'Como deseja receber?\n\n1 — Envio\n2 — Entrega no endereço',
  savedAddressPrompt: 'Seu último endereço é:\n*{endereco}*\n\n1 — Usar este endereço\n2 — Informar outro endereço',
  addressInputPrompt: 'Envie seu *endereço completo em uma única mensagem*: rua, número, complemento (se houver), bairro, cidade/UF e CEP.',
  confirmationPrompt: '1 — Confirmar pedido\n2 — Alterar endereço\n0 — Cancelar',
  cancelled: 'Pedido cancelado. Voltamos ao cardápio.',
  paymentPending: 'Pedido *{pedido}* criado. Aguardando pagamento.',
  paymentConfirmed: '✅ Pagamento confirmado para o pedido *{pedido}*.',
  orderFinished: '✅ *Seu pedido foi finalizado!*\nPedido: *{pedido}*\nObrigado por comprar com a Prisma Store.',
});

export const CHATBOT_MESSAGE_FIELDS = Object.freeze([
  { key: 'welcome', label: 'Saudação inicial', placeholders: ['{cliente}'] },
  { key: 'catalogHeader', label: 'Cabeçalho do catálogo', placeholders: [] },
  { key: 'catalogInstruction', label: 'Instrução do catálogo', placeholders: [] },
  { key: 'invalidProduct', label: 'Produto/opção inválida', placeholders: [] },
  { key: 'quantityPrompt', label: 'Pergunta de quantidade', placeholders: ['{produto}', '{estoque}', '{preco}'] },
  { key: 'invalidQuantity', label: 'Quantidade inválida', placeholders: ['{produto}', '{estoque}'] },
  { key: 'cartActions', label: 'Ações do carrinho', placeholders: ['{subtotal}', '{quantidade}'] },
  { key: 'deliveryPrompt', label: 'Modalidade de entrega', placeholders: [] },
  { key: 'savedAddressPrompt', label: 'Endereço já cadastrado', placeholders: ['{endereco}'] },
  { key: 'addressInputPrompt', label: 'Solicitação de endereço', placeholders: [] },
  { key: 'confirmationPrompt', label: 'Confirmação do pedido', placeholders: ['{subtotal}', '{endereco}'] },
  { key: 'cancelled', label: 'Pedido cancelado', placeholders: [] },
  { key: 'paymentPending', label: 'Aguardando pagamento', placeholders: ['{pedido}', '{subtotal}', '{endereco}'] },
  { key: 'paymentConfirmed', label: 'Pagamento confirmado', placeholders: ['{pedido}'] },
  { key: 'orderFinished', label: 'Pedido finalizado', placeholders: ['{pedido}'] },
]);

export function messageValue(settings, key) {
  const configured = settings?.chatbotMessages?.[key];
  return typeof configured === 'string' && configured.trim() ? configured : CHATBOT_MESSAGE_DEFAULTS[key] ?? '';
}
