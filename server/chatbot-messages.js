export const DEFAULT_CHATBOT_MESSAGES = Object.freeze({
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
  orderFinished: '✅ Pedido *{pedido}* finalizado.',
});

export function normalizeChatbotMessages(messages = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_CHATBOT_MESSAGES).map(([key, fallback]) => {
      const configured = messages?.[key];
      return [key, typeof configured === 'string' && configured.trim() ? configured : fallback];
    }),
  );
}

export function resolveChatbotMessage(state, key, values = {}) {
  const configured = state?.settings?.chatbotMessages?.[key];
  const fallback = DEFAULT_CHATBOT_MESSAGES[key] ?? '';
  const template = typeof configured === 'string' && configured.trim() ? configured : fallback;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, token) => (
    Object.prototype.hasOwnProperty.call(values, token) ? String(values[token]) : match
  ));
}
