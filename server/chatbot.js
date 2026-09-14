import { randomUUID } from 'node:crypto';
import { availableStock, calculateCart, formatCurrencyBRL, reserveCartStock } from '../src/domain.js';

function digits(value = '') {
  return String(value).replace(/\D/g, '');
}

function isPrivateChat(chatId = '') {
  return String(chatId).endsWith('@c.us') || String(chatId).endsWith('@lid');
}

function newSession(now) {
  const timestamp = now().toISOString();
  return {
    checkoutId: randomUUID(),
    step: 'catalog',
    cart: {},
    selectedProductId: null,
    deliveryType: null,
    address: null,
    newAddress: false,
    startedAt: timestamp,
    updatedAt: timestamp,
    confirmedAt: null,
  };
}

function customerPhoneMatches(customer, phone) {
  return digits(customer?.phone) === phone;
}

function customerName(contactName, phone) {
  const name = String(contactName ?? '').trim();
  return name || `Cliente ${phone.slice(-4)}`;
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
      id: `wa-${phone}`,
      name: customerName(contactName, phone),
      phone: `+${phone}`,
      totalSpent: 0,
      orderCount: 0,
      addresses: [],
      lastOrderAt: null,
      addressChanged: false,
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

function catalogText(products) {
  if (!products.length) return 'Nosso catálogo está temporariamente sem itens disponíveis. Tente novamente mais tarde.';
  return [
    '🛍️ *CARDÁPIO PRISMA STORE*',
    '',
    ...products.map((product, index) => `${index + 1}. ${product.name} — ${formatCurrencyBRL(product.price)}`),
    '',
    'Responda somente com o *número do item* que deseja.',
  ].join('\n');
}

function cartLines(stateStore, cart) {
  const state = stateStore.load();
  return Object.entries(cart)
    .filter(([, quantity]) => Number(quantity) > 0)
    .map(([productId, quantity]) => {
      const product = state.products.find((candidate) => candidate.id === productId);
      if (!product) return null;
      return `${quantity}× ${product.name} — ${formatCurrencyBRL(Number(product.price) * Number(quantity))}`;
    })
    .filter(Boolean);
}

function cartSummary(stateStore, cart) {
  const state = stateStore.load();
  const total = calculateCart(state.products, cart);
  return [
    '🛒 *SEU PEDIDO*',
    ...cartLines(stateStore, cart),
    '',
    `Subtotal: *${formatCurrencyBRL(total.subtotal)}*`,
  ].join('\n');
}

function addressLabel(address) {
  if (!address) return '—';
  if (address.formatted) return address.formatted;
  return [
    [address.street, address.number].filter(Boolean).join(', '),
    address.complement,
    address.neighborhood,
    [address.city, address.state].filter(Boolean).join('/'),
    address.zip,
  ].filter(Boolean).join(' · ');
}

function confirmationText(stateStore, session) {
  const delivery = session.deliveryType === 'shipping' ? 'Envio' : 'Entrega no endereço';
  return [
    '✅ *CONFIRME SEU PEDIDO*',
    '',
    cartSummary(stateStore, session.cart),
    '',
    `Modalidade: *${delivery}*`,
    `Endereço: ${addressLabel(session.address)}`,
    '',
    '1 — Confirmar pedido',
    '2 — Alterar endereço',
    '0 — Cancelar',
  ].join('\n');
}

function saveSession(stateStore, phone, session, now) {
  session.updatedAt = now().toISOString();
  stateStore.saveChatSession(phone, session);
  return session;
}

function latestAddress(customer) {
  return customer?.addresses?.length ? customer.addresses[customer.addresses.length - 1] : null;
}

function nextOrderId(orders) {
  const max = orders.reduce((highest, order) => {
    const match = String(order?.id ?? '').match(/^PS-(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 1000);
  return `PS-${max + 1}`;
}

function createPendingOrder(stateStore, phone, session, now) {
  let order = null;
  stateStore.updateState((state) => {
    const existing = state.orders.find((candidate) => candidate.sourceCheckoutId === session.checkoutId);
    if (existing) {
      order = structuredClone(existing);
      return state;
    }

    const customer = state.customers.find((candidate) => customerPhoneMatches(candidate, phone));
    if (!customer) throw new Error('Cliente não encontrado para criar o pedido.');

    const items = Object.entries(session.cart)
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([productId, quantity]) => {
        const product = state.products.find((candidate) => candidate.id === productId);
        if (!product) throw new Error(`Produto ${productId} não encontrado.`);
        return {
          productId,
          name: product.name,
          quantity: Number(quantity),
          unitPrice: Number(product.price),
        };
      });
    if (!items.length) throw new Error('Carrinho vazio.');

    state.products = reserveCartStock(state.products, session.cart);
    const totals = calculateCart(state.products, session.cart);
    const createdAt = now().toISOString();
    order = {
      id: nextOrderId(state.orders),
      customerId: customer.id,
      customerName: customer.name,
      phone: `+${phone}`,
      status: 'PAYMENT_PENDING',
      deliveryType: session.deliveryType,
      total: totals.subtotal,
      createdAt,
      paidAt: null,
      receivingAccountId: null,
      items,
      address: structuredClone(session.address),
      newAddress: Boolean(session.newAddress),
      deliveryFee: 0,
      source: 'whatsapp',
      sourceCheckoutId: session.checkoutId,
      reservedAt: createdAt,
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

export function createChatbotEngine({
  stateStore,
  welcomeMediaPath = null,
  catalogMediaPath = null,
  now = () => new Date(),
}) {
  async function trySendMedia(sendMedia, mediaPath) {
    if (!mediaPath) return false;
    try {
      await sendMedia(mediaPath);
      return true;
    } catch {
      return false;
    }
  }

  async function sendCatalog(sendText, sendMedia) {
    const products = activeProducts(stateStore);
    await trySendMedia(sendMedia, catalogMediaPath);
    await sendText(catalogText(products));
  }

  async function startConversation({ phone, contactName, sendText, sendMedia, includeWelcome = true }) {
    const customer = upsertCustomer(stateStore, phone, contactName);
    const session = newSession(now);
    stateStore.saveChatSession(phone, session);
    if (includeWelcome) {
      await trySendMedia(sendMedia, welcomeMediaPath);
      await sendText(`Olá, *${customer.name}*! 👋\nBem-vindo à *Prisma Store*. Vou cuidar do seu pedido por aqui de forma simples.`);
    }
    await sendCatalog(sendText, sendMedia);
    return session;
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
    if (!session.checkoutId) {
      session.checkoutId = randomUUID();
      saveSession(stateStore, phone, session, now);
    }

    upsertCustomer(stateStore, phone, contactName);
    const normalized = input.toLowerCase();
    if (['menu', 'início', 'inicio', 'reiniciar'].includes(normalized)) {
      session = await startConversation({ phone, contactName, sendText, sendMedia, includeWelcome: false });
      return { handled: true, step: session.step };
    }
    if (normalized === 'cancelar') {
      session = newSession(now);
      saveSession(stateStore, phone, session, now);
      await sendText('Pedido cancelado. Sem problema — voltamos ao cardápio.');
      await sendCatalog(sendText, sendMedia);
      return { handled: true, step: session.step };
    }

    const customer = stateStore.load().customers.find((candidate) => customerPhoneMatches(candidate, phone));

    if (session.step === 'catalog') {
      const products = activeProducts(stateStore);
      const index = Number.parseInt(input, 10) - 1;
      const product = Number.isInteger(index) ? products[index] : null;
      if (!product) {
        await sendText(`Não encontrei essa opção.\n\n${catalogText(products)}`);
        return { handled: true, step: session.step };
      }
      const remaining = Math.max(0, availableStock(product) - Number(session.cart[product.id] ?? 0));
      if (remaining <= 0) {
        await sendText(`Você já adicionou todo o estoque disponível de *${product.name}* ao pedido. Escolha outro item.`);
        await sendCatalog(sendText, sendMedia);
        return { handled: true, step: session.step };
      }
      session.selectedProductId = product.id;
      session.step = 'quantity';
      saveSession(stateStore, phone, session, now);
      await sendText(`Você escolheu *${product.name}*.\nQuantas unidades deseja? Restam ${remaining} disponível(is) para este pedido.`);
      return { handled: true, step: session.step };
    }

    if (session.step === 'quantity') {
      const state = stateStore.load();
      const product = state.products.find((candidate) => candidate.id === session.selectedProductId);
      if (!product) {
        session.step = 'catalog';
        session.selectedProductId = null;
        saveSession(stateStore, phone, session, now);
        await sendText('Esse produto não está mais disponível. Escolha outro item.');
        await sendCatalog(sendText, sendMedia);
        return { handled: true, step: session.step };
      }
      const quantity = Number.parseInt(input, 10);
      const currentInCart = Number(session.cart[product.id] ?? 0);
      const remaining = Math.max(0, availableStock(product) - currentInCart);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > remaining) {
        const unitLabel = remaining === 1 ? 'unidade' : 'unidades';
        await sendText(`Você pode adicionar de *1 até ${remaining} ${unitLabel}*. Há ${remaining} ${unitLabel} restante(s) para este pedido.`);
        return { handled: true, step: session.step };
      }
      session.cart[product.id] = currentInCart + quantity;
      session.selectedProductId = null;
      session.step = 'cart_action';
      saveSession(stateStore, phone, session, now);
      await sendText(`${cartSummary(stateStore, session.cart)}\n\n1 — Adicionar outro item\n2 — Finalizar pedido\n0 — Cancelar`);
      return { handled: true, step: session.step };
    }

    if (session.step === 'cart_action') {
      if (input === '1') {
        session.step = 'catalog';
        saveSession(stateStore, phone, session, now);
        await sendCatalog(sendText, sendMedia);
        return { handled: true, step: session.step };
      }
      if (input === '2') {
        session.step = 'delivery';
        saveSession(stateStore, phone, session, now);
        await sendText('Como deseja receber?\n\n1 — Envio\n2 — Entrega no endereço');
        return { handled: true, step: session.step };
      }
      if (input === '0') {
        session = newSession(now);
        saveSession(stateStore, phone, session, now);
        await sendText('Pedido cancelado. Voltamos ao cardápio.');
        await sendCatalog(sendText, sendMedia);
        return { handled: true, step: session.step };
      }
      await sendText('Responda com:\n1 — Adicionar outro item\n2 — Finalizar pedido\n0 — Cancelar');
      return { handled: true, step: session.step };
    }

    if (session.step === 'delivery') {
      if (input !== '1' && input !== '2') {
        await sendText('Escolha uma opção:\n1 — Envio\n2 — Entrega no endereço');
        return { handled: true, step: session.step };
      }
      session.deliveryType = input === '1' ? 'shipping' : 'local_delivery';
      const savedAddress = latestAddress(customer);
      if (savedAddress) {
        session.step = 'address_choice';
        saveSession(stateStore, phone, session, now);
        await sendText(`Seu último endereço é:\n*${addressLabel(savedAddress)}*\n\n1 — Usar este endereço\n2 — Informar outro endereço`);
      } else {
        session.step = 'address_input';
        saveSession(stateStore, phone, session, now);
        await sendText('Envie seu *endereço completo em uma única mensagem*: rua, número, complemento (se houver), bairro, cidade/UF e CEP.');
      }
      return { handled: true, step: session.step };
    }

    if (session.step === 'address_choice') {
      if (input === '1') {
        const savedAddress = latestAddress(customer);
        if (!savedAddress) {
          session.step = 'address_input';
          saveSession(stateStore, phone, session, now);
          await sendText('Não encontrei um endereço salvo. Envie seu endereço completo em uma única mensagem.');
          return { handled: true, step: session.step };
        }
        session.address = structuredClone(savedAddress);
        session.newAddress = false;
        session.step = 'confirm';
        saveSession(stateStore, phone, session, now);
        await sendText(confirmationText(stateStore, session));
        return { handled: true, step: session.step };
      }
      if (input === '2') {
        session.step = 'address_input';
        saveSession(stateStore, phone, session, now);
        await sendText('Envie seu *endereço completo em uma única mensagem*: rua, número, complemento (se houver), bairro, cidade/UF e CEP.');
        return { handled: true, step: session.step };
      }
      await sendText('Responda com:\n1 — Usar o endereço salvo\n2 — Informar outro endereço');
      return { handled: true, step: session.step };
    }

    if (session.step === 'address_input') {
      if (input.length < 8) {
        await sendText('O endereço parece incompleto. Envie rua, número, bairro, cidade/UF e CEP em uma única mensagem.');
        return { handled: true, step: session.step };
      }
      session.address = { formatted: input };
      session.newAddress = true;
      session.step = 'confirm';
      saveSession(stateStore, phone, session, now);
      await sendText(confirmationText(stateStore, session));
      return { handled: true, step: session.step };
    }

    if (session.step === 'confirm') {
      if (input === '1') {
        try {
          const order = createPendingOrder(stateStore, phone, session, now);
          storeConfirmedAddress(stateStore, phone, session, now);
          session.step = 'confirmed';
          session.confirmedAt = now().toISOString();
          session.orderId = order.id;
          saveSession(stateStore, phone, session, now);
          await sendText(`✅ *Pedido confirmado!*\nCódigo: *${order.id}*\n\n${cartSummary(stateStore, session.cart)}\n\nO estoque foi reservado e o pedido está aguardando pagamento.`);
          return { handled: true, step: session.step, orderId: order.id };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Não foi possível reservar o estoque.';
          await sendText(`O estoque mudou antes da confirmação e não consegui reservar seu pedido. ${message}\n\nRevise o pedido ou digite *MENU* para montar novamente.`);
          return { handled: true, step: session.step, error: 'stock-changed' };
        }
      }
      if (input === '2') {
        session.step = 'address_input';
        saveSession(stateStore, phone, session, now);
        await sendText('Certo. Envie o novo endereço completo em uma única mensagem.');
        return { handled: true, step: session.step };
      }
      if (input === '0') {
        session = newSession(now);
        saveSession(stateStore, phone, session, now);
        await sendText('Pedido cancelado. Voltamos ao cardápio.');
        await sendCatalog(sendText, sendMedia);
        return { handled: true, step: session.step };
      }
      await sendText(confirmationText(stateStore, session));
      return { handled: true, step: session.step };
    }

    if (session.step === 'confirmed') {
      await sendText('Seu pedido já está confirmado. Digite *MENU* se quiser iniciar um novo pedido.');
      return { handled: true, step: session.step };
    }

    session = newSession(now);
    saveSession(stateStore, phone, session, now);
    await sendCatalog(sendText, sendMedia);
    return { handled: true, step: session.step };
  }

  return { handleIncoming };
}
