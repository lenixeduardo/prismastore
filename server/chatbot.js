import { randomUUID } from 'node:crypto';
import { availableStock, calculateCart, formatCurrencyBRL, reserveCartStock } from '../src/domain.js';
import { resolveChatbotMessage } from './chatbot-messages.js';

function digits(value = '') { return String(value).replace(/\D/g, ''); }
function isPrivateChat(chatId = '') { return String(chatId).endsWith('@c.us') || String(chatId).endsWith('@lid'); }
function customerPhoneMatches(customer, phone) { return digits(customer?.phone) === phone; }
function customerName(contactName, phone) { return String(contactName ?? '').trim() || `Cliente ${phone.slice(-4)}`; }

function newSession(now) {
  const timestamp = now().toISOString();
  return {
    checkoutId: randomUUID(), step: 'catalog', cart: {}, selectedProductId: null,
    deliveryType: null, address: null, newAddress: false,
    startedAt: timestamp, updatedAt: timestamp, confirmedAt: null,
  };
}

function message(stateStore, key, values = {}) {
  return resolveChatbotMessage(stateStore.load(), key, values);
}

function upsertCustomer(stateStore, phone, contactName) {
  let resolved = null;
  stateStore.updateState((state) => {
    const existing = state.customers.find((customer) => customerPhoneMatches(customer, phone));
    if (existing) {
      if ((!existing.name || /^Cliente \d{4}$/.test(existing.name)) && contactName) existing.name = String(contactName).trim();
      resolved = structuredClone(existing);
      return state;
    }
    const created = {
      id: `wa-${phone}`, name: customerName(contactName, phone), phone: `+${phone}`,
      totalSpent: 0, orderCount: 0, addresses: [], lastOrderAt: null, addressChanged: false,
    };
    state.customers.push(created);
    resolved = structuredClone(created);
    return state;
  });
  return resolved;
}

function activeProducts(stateStore) {
  return stateStore.load().products.filter((product) => product.active !== false && availableStock(product) > 0);
}

function catalogText(stateStore, products) {
  if (!products.length) return 'Nosso catálogo está temporariamente sem itens disponíveis. Tente novamente mais tarde.';
  return [
    message(stateStore, 'catalogHeader'), '',
    ...products.map((product, index) => `${index + 1}. ${product.name} — ${formatCurrencyBRL(product.price)}`),
    '', message(stateStore, 'catalogInstruction'),
  ].join('\n');
}

function cartLines(stateStore, cart) {
  const state = stateStore.load();
  return Object.entries(cart).filter(([, quantity]) => Number(quantity) > 0).map(([productId, quantity]) => {
    const product = state.products.find((candidate) => candidate.id === productId);
    return product ? `${quantity}× ${product.name} — ${formatCurrencyBRL(Number(product.price) * Number(quantity))}` : null;
  }).filter(Boolean);
}

function cartSummary(stateStore, cart) {
  const state = stateStore.load();
  const total = calculateCart(state.products, cart);
  return ['🛒 *SEU PEDIDO*', ...cartLines(stateStore, cart), '', `Subtotal: *${formatCurrencyBRL(total.subtotal)}*`].join('\n');
}

function addressLabel(address) {
  if (!address) return '—';
  if (address.formatted) return address.formatted;
  return [[address.street, address.number].filter(Boolean).join(', '), address.complement, address.neighborhood, [address.city, address.state].filter(Boolean).join('/'), address.zip].filter(Boolean).join(' · ');
}

function confirmationText(stateStore, session) {
  const delivery = session.deliveryType === 'shipping' ? 'Envio' : 'Entrega no endereço';
  const state = stateStore.load();
  const subtotal = formatCurrencyBRL(calculateCart(state.products, session.cart).subtotal);
  return [
    '✅ *CONFIRME SEU PEDIDO*', '', cartSummary(stateStore, session.cart), '',
    `Modalidade: *${delivery}*`, `Endereço: ${addressLabel(session.address)}`, '',
    resolveChatbotMessage(state, 'confirmationPrompt', { subtotal, endereco: addressLabel(session.address) }),
  ].join('\n');
}

function saveSession(stateStore, phone, session, now) {
  session.updatedAt = now().toISOString();
  stateStore.saveChatSession(phone, session);
  return session;
}

function latestAddress(customer) { return customer?.addresses?.length ? customer.addresses[customer.addresses.length - 1] : null; }

function nextOrderId(orders) {
  const max = orders.reduce((highest, order) => {
    const match = String(order?.id ?? '').match(/^PS-(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 1000);
  return `PS-${max + 1}`;
}

function assertCartProductsAvailable(state, cart) {
  for (const [productId, quantity] of Object.entries(cart)) {
    if (Number(quantity) <= 0) continue;
    const product = state.products.find((candidate) => candidate.id === productId);
    if (!product || product.active === false) throw new Error('Um produto do pedido não está mais disponível.');
    if (availableStock(product) < Number(quantity)) throw new Error(`Estoque insuficiente para ${product.name}.`);
  }
}

function createPendingOrder(stateStore, phone, session, now) {
  let order = null;
  stateStore.updateState((state) => {
    const existing = state.orders.find((candidate) => candidate.sourceCheckoutId === session.checkoutId);
    if (existing) { order = structuredClone(existing); return state; }
    const customer = state.customers.find((candidate) => customerPhoneMatches(candidate, phone));
    if (!customer) throw new Error('Cliente não encontrado para criar o pedido.');
    assertCartProductsAvailable(state, session.cart);
    const items = Object.entries(session.cart).filter(([, quantity]) => Number(quantity) > 0).map(([productId, quantity]) => {
      const product = state.products.find((candidate) => candidate.id === productId);
      return { productId, name: product.name, quantity: Number(quantity), unitPrice: Number(product.price) };
    });
    if (!items.length) throw new Error('Carrinho vazio.');
    const totals = calculateCart(state.products, session.cart);
    state.products = reserveCartStock(state.products, session.cart);
    const createdAt = now().toISOString();
    order = {
      id: nextOrderId(state.orders), customerId: customer.id, customerName: customer.name, phone: `+${phone}`,
      status: 'PAYMENT_PENDING', deliveryType: session.deliveryType, total: totals.subtotal, createdAt,
      paidAt: null, receivingAccountId: null, items, address: structuredClone(session.address),
      newAddress: Boolean(session.newAddress), deliveryFee: 0, source: 'whatsapp',
      sourceCheckoutId: session.checkoutId, reservedAt: createdAt,
    };
    state.orders.unshift(order);
    return state;
  });
  return order;
}

function storeConfirmedAddress(stateStore, phone, session, now) {
  if (!session.newAddress || !session.address) return;
  stateStore.updateState((state) => {
    const customer = state.customers.find((candidate) => customerPhoneMatches(candidate, phone));
    if (!customer) return state;
    customer.addresses = Array.isArray(customer.addresses) ? customer.addresses : [];
    const formatted = addressLabel(session.address);
    const exists = customer.addresses.some((address) => addressLabel(address).trim().toLowerCase() === formatted.trim().toLowerCase());
    if (!exists) {
      customer.addresses.push({ ...session.address, usedAt: now().toISOString().slice(0, 10) });
      customer.addressChanged = customer.addresses.length > 1;
    }
    return state;
  });
}

export function createChatbotEngine({ stateStore, now = () => new Date() }) {
  async function sendCatalog(sendText) {
    const products = activeProducts(stateStore);
    await sendText(catalogText(stateStore, products));
  }

  async function startConversation({ phone, contactName, sendText, includeWelcome = true }) {
    const customer = upsertCustomer(stateStore, phone, contactName);
    const session = newSession(now);
    stateStore.saveChatSession(phone, session);
    if (includeWelcome) {
      await sendText(message(stateStore, 'welcome', { cliente: customer.name }));
    }
    await sendCatalog(sendText);
    return session;
  }

  async function cancelAndRestart({ phone, sendText, sendMedia }) {
    const session = newSession(now);
    saveSession(stateStore, phone, session, now);
    await sendText(message(stateStore, 'cancelled'));
    await sendCatalog(sendText);
    return { handled: true, step: session.step };
  }

  async function handleIncoming({ chatId, text, contactName = null, sendText, sendMedia = async () => {} }) {
    if (!isPrivateChat(chatId)) return { handled: false, reason: 'not-private' };
    const phone = digits(String(chatId).split('@')[0]);
    if (!phone) return { handled: false, reason: 'invalid-phone' };
    const input = String(text ?? '').trim();
    let session = stateStore.getChatSession(phone);
    if (!session) {
      await startConversation({ phone, contactName, sendText, sendMedia, includeWelcome: true });
      return { handled: true, step: 'catalog' };
    }
    if (!session.checkoutId) { session.checkoutId = randomUUID(); saveSession(stateStore, phone, session, now); }
    upsertCustomer(stateStore, phone, contactName);
    const normalized = input.toLowerCase();
    if (['menu', 'início', 'inicio', 'reiniciar'].includes(normalized)) {
      session = await startConversation({ phone, contactName, sendText, sendMedia, includeWelcome: false });
      return { handled: true, step: session.step };
    }
    if (normalized === 'cancelar') return cancelAndRestart({ phone, sendText, sendMedia });
    const customer = stateStore.load().customers.find((candidate) => customerPhoneMatches(candidate, phone));

    if (session.step === 'catalog') {
      const products = activeProducts(stateStore);
      const index = Number.parseInt(input, 10) - 1;
      const product = Number.isInteger(index) ? products[index] : null;
      if (!product) {
        await sendText(`${message(stateStore, 'invalidProduct')}\n\n${catalogText(stateStore, products)}`);
        return { handled: true, step: session.step };
      }
      const remaining = Math.max(0, availableStock(product) - Number(session.cart[product.id] ?? 0));
      if (remaining <= 0) {
        await sendText(`Você já adicionou todo o estoque disponível de *${product.name}* ao pedido. Escolha outro item.`);
        await sendCatalog(sendText);
        return { handled: true, step: session.step };
      }
      session.selectedProductId = product.id;
      session.step = 'quantity';
      saveSession(stateStore, phone, session, now);
      await sendText(message(stateStore, 'quantityPrompt', { produto: product.name, estoque: remaining, preco: formatCurrencyBRL(product.price) }));
      return { handled: true, step: session.step };
    }

    if (session.step === 'quantity') {
      const state = stateStore.load();
      const product = state.products.find((candidate) => candidate.id === session.selectedProductId);
      if (!product || product.active === false) {
        session.step = 'catalog'; session.selectedProductId = null; saveSession(stateStore, phone, session, now);
        await sendText('Esse produto não está mais disponível. Escolha outro item.');
        await sendCatalog(sendText);
        return { handled: true, step: session.step };
      }
      const quantity = Number.parseInt(input, 10);
      const currentInCart = Number(session.cart[product.id] ?? 0);
      const remaining = Math.max(0, availableStock(product) - currentInCart);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > remaining) {
        await sendText(`${message(stateStore, 'invalidQuantity', { produto: product.name, estoque: remaining })} Há ${remaining} unidade(s) restante(s) para este pedido.`);
        return { handled: true, step: session.step };
      }
      session.cart[product.id] = currentInCart + quantity;
      session.selectedProductId = null;
      session.step = 'cart_action';
      saveSession(stateStore, phone, session, now);
      const subtotal = formatCurrencyBRL(calculateCart(stateStore.load().products, session.cart).subtotal);
      await sendText(`${cartSummary(stateStore, session.cart)}\n\n${message(stateStore, 'cartActions', { subtotal, quantidade: quantity })}`);
      return { handled: true, step: session.step };
    }

    if (session.step === 'cart_action') {
      if (input === '1') { session.step = 'catalog'; saveSession(stateStore, phone, session, now); await sendCatalog(sendText); return { handled: true, step: session.step }; }
      if (input === '2') { session.step = 'delivery'; saveSession(stateStore, phone, session, now); await sendText(message(stateStore, 'deliveryPrompt')); return { handled: true, step: session.step }; }
      if (input === '0') return cancelAndRestart({ phone, sendText, sendMedia });
      await sendText(`Responda com:\n${message(stateStore, 'cartActions')}`);
      return { handled: true, step: session.step };
    }

    if (session.step === 'delivery') {
      if (!['1', '2'].includes(input)) { await sendText(message(stateStore, 'deliveryPrompt')); return { handled: true, step: session.step }; }
      session.deliveryType = input === '1' ? 'shipping' : 'local_delivery';
      const savedAddress = latestAddress(customer);
      if (savedAddress) {
        session.step = 'address_choice'; saveSession(stateStore, phone, session, now);
        await sendText(message(stateStore, 'savedAddressPrompt', { endereco: addressLabel(savedAddress) }));
      } else {
        session.step = 'address_input'; saveSession(stateStore, phone, session, now);
        await sendText(message(stateStore, 'addressInputPrompt'));
      }
      return { handled: true, step: session.step };
    }

    if (session.step === 'address_choice') {
      if (input === '1') {
        const savedAddress = latestAddress(customer);
        if (!savedAddress) { session.step = 'address_input'; saveSession(stateStore, phone, session, now); await sendText(message(stateStore, 'addressInputPrompt')); return { handled: true, step: session.step }; }
        session.address = structuredClone(savedAddress); session.newAddress = false; session.step = 'confirm'; saveSession(stateStore, phone, session, now);
        await sendText(confirmationText(stateStore, session)); return { handled: true, step: session.step };
      }
      if (input === '2') { session.step = 'address_input'; saveSession(stateStore, phone, session, now); await sendText(message(stateStore, 'addressInputPrompt')); return { handled: true, step: session.step }; }
      await sendText(message(stateStore, 'savedAddressPrompt', { endereco: addressLabel(latestAddress(customer)) }));
      return { handled: true, step: session.step };
    }

    if (session.step === 'address_input') {
      if (input.length < 8) { await sendText(message(stateStore, 'addressInputPrompt')); return { handled: true, step: session.step }; }
      session.address = { formatted: input }; session.newAddress = true; session.step = 'confirm'; saveSession(stateStore, phone, session, now);
      await sendText(confirmationText(stateStore, session));
      return { handled: true, step: session.step };
    }

    if (session.step === 'confirm') {
      if (input === '2') { session.step = 'address_input'; saveSession(stateStore, phone, session, now); await sendText(message(stateStore, 'addressInputPrompt')); return { handled: true, step: session.step }; }
      if (input === '0') return cancelAndRestart({ phone, sendText, sendMedia });
      if (input !== '1') { await sendText(confirmationText(stateStore, session)); return { handled: true, step: session.step }; }
      try {
        const order = createPendingOrder(stateStore, phone, session, now);
        storeConfirmedAddress(stateStore, phone, session, now);
        session.orderId = order.id; session.confirmedAt = now().toISOString(); session.step = 'confirmed'; saveSession(stateStore, phone, session, now);
        await sendText(`✅ Pedido confirmado!\n${message(stateStore, 'paymentPending', { pedido: order.id, subtotal: formatCurrencyBRL(order.total), endereco: addressLabel(order.address) })}`);
        return { handled: true, step: session.step, orderId: order.id };
      } catch (error) {
        session.step = 'catalog'; session.selectedProductId = null; saveSession(stateStore, phone, session, now);
        await sendText(`${error instanceof Error ? error.message : 'Não foi possível confirmar o pedido.'}\nVou atualizar o catálogo para você.`);
        await sendCatalog(sendText);
        return { handled: true, step: session.step, error: 'availability-changed' };
      }
    }

    if (session.step === 'confirmed') {
      await sendText(message(stateStore, 'paymentPending', { pedido: session.orderId ?? '' }));
      return { handled: true, step: session.step, orderId: session.orderId };
    }

    session = await startConversation({ phone, contactName, sendText, sendMedia, includeWelcome: false });
    return { handled: true, step: session.step };
  }

  return { handleIncoming };
}
