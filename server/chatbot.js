import { randomUUID } from 'node:crypto';
import { availableStock, calculateCart, consumeCartStock, formatCurrencyBRL, lineTotalForQuantity, unitPriceForQuantity } from '../src/domain.js';
import { resolveChatbotMessage } from './chatbot-messages.js';

function digits(value = '') { return String(value).replace(/\D/g, ''); }
function isPrivateChat(chatId = '') { return String(chatId).endsWith('@c.us') || String(chatId).endsWith('@lid'); }
function customerPhoneMatches(customer, phone) { return digits(customer?.phone) === phone; }
function customerName(contactName, phone) { return String(contactName ?? '').trim() || `Cliente ${phone.slice(-4)}`; }

function newSession(now) {
  const timestamp = now().toISOString();
  return {
    checkoutId: randomUUID(), step: 'catalog', cart: {}, selectedProductId: null,
    deliveryType: null, address: null, newAddress: false, addressMissingField: null,
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

function quantityPricingText(product) {
  const pricing = product?.quantityPricing;
  if (!pricing || typeof pricing !== 'object') return '';

  const exact = Object.entries(pricing.exactTotals ?? {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([quantity, total]) => `${quantity} por ${formatCurrencyBRL(total)}`);
  const minimum = Number(pricing.minQuantity ?? 0);
  const unitPrice = Number(pricing.unitPrice);
  if (minimum > 0 && Number.isFinite(unitPrice)) {
    exact.push(`${minimum}+ por ${formatCurrencyBRL(unitPrice)}/un`);
  }
  return exact.join(' · ');
}

function catalogText(stateStore, products) {
  if (!products.length) return 'Nosso catálogo está temporariamente sem itens disponíveis. Tente novamente mais tarde.';
  return [
    message(stateStore, 'catalogHeader'), '',
    ...products.map((product, index) => {
      const pricing = quantityPricingText(product);
      return `${index + 1}. ${product.name} — ${formatCurrencyBRL(product.price)}${pricing ? `\n   ${pricing}` : ''}`;
    }),
    '', message(stateStore, 'catalogInstruction'),
  ].join('\n');
}

function cartLines(stateStore, cart) {
  const state = stateStore.load();
  return Object.entries(cart).filter(([, quantity]) => Number(quantity) > 0).map(([productId, quantity]) => {
    const product = state.products.find((candidate) => candidate.id === productId);
    return product ? `${quantity}× ${product.name} — ${formatCurrencyBRL(lineTotalForQuantity(product, quantity))}` : null;
  }).filter(Boolean);
}

function cartSummary(stateStore, cart) {
  const state = stateStore.load();
  const total = calculateCart(state.products, cart);
  return ['🛒 *SEU PEDIDO*', ...cartLines(stateStore, cart), '', `Subtotal: *${formatCurrencyBRL(total.subtotal)}*`].join('\n');
}

const REQUIRED_ADDRESS_FIELDS = ['street', 'number', 'neighborhood'];

function cleanAddressValue(value = '') {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text || /^(undefined|null|n\/?a|não informado|nao informado|—|-)$/i.test(text)) return '';
  return text;
}

function isZipPart(value) {
  return /^\d{5}-?\d{3}$/.test(cleanAddressValue(value));
}

function isCityStatePart(value) {
  const text = cleanAddressValue(value);
  return /\/\s*[A-Za-z]{2}$/.test(text) || /^[A-Za-zÀ-ÿ .'-]+\s+-\s+[A-Za-z]{2}$/.test(text);
}

function isComplementPart(value) {
  return /^(ap(?:to|artamento)?|bloco|casa|fundos|sala|andar|cj|conjunto|complemento)\b/i.test(cleanAddressValue(value));
}

function isValidStreet(value) {
  const text = cleanAddressValue(value);
  return text.length >= 3 && /[A-Za-zÀ-ÿ]/.test(text);
}

function isValidNumber(value) {
  return /\d/.test(cleanAddressValue(value));
}

function isValidNeighborhood(value) {
  const text = cleanAddressValue(value);
  return text.length >= 2 && /[A-Za-zÀ-ÿ]/.test(text);
}

function addressPartsLabel(address, empty = '—') {
  if (!address) return empty;
  const street = cleanAddressValue(address.street);
  const number = cleanAddressValue(address.number);
  const complement = cleanAddressValue(address.complement);
  const neighborhood = cleanAddressValue(address.neighborhood);
  const city = cleanAddressValue(address.city);
  const state = cleanAddressValue(address.state);
  const zip = cleanAddressValue(address.zip);
  const first = [street, number].filter(Boolean).join(', ');
  const cityState = [city, state].filter(Boolean).join('/');
  const structured = [first, complement, neighborhood, cityState, zip].filter(Boolean).join(' · ');
  if (structured) return structured;
  const formatted = cleanAddressValue(address.formatted)
    .replace(/\b(?:undefined|null)\b/gi, '')
    .replace(/\s*([,·])\s*(?=\1|$)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return formatted || empty;
}

function parseAddressInput(value, existing = {}) {
  const raw = cleanAddressValue(value);
  const parsed = {
    street: cleanAddressValue(existing.street),
    number: cleanAddressValue(existing.number),
    complement: cleanAddressValue(existing.complement),
    neighborhood: cleanAddressValue(existing.neighborhood),
    city: cleanAddressValue(existing.city),
    state: cleanAddressValue(existing.state),
    zip: cleanAddressValue(existing.zip),
  };
  if (!raw) return { ...parsed, formatted: addressPartsLabel(parsed, '') };

  const tokens = raw
    .split(/\s*(?:,|;|\||·|\s[-–—]\s)\s*/)
    .map(cleanAddressValue)
    .filter(Boolean);

  const inline = tokens.length === 1
    ? raw.match(/^(.+?)\s+(?:n(?:º|°|o)?\.?\s*)?(\d+[A-Za-z0-9/-]*)\s+(.+)$/i)
    : null;
  if (inline) {
    if (!parsed.street) parsed.street = cleanAddressValue(inline[1]);
    if (!parsed.number) parsed.number = cleanAddressValue(inline[2]);
    const tail = cleanAddressValue(inline[3]);
    if (!parsed.neighborhood && tail && !isZipPart(tail) && !isCityStatePart(tail) && !isComplementPart(tail)) {
      parsed.neighborhood = tail.replace(/^bairro\s*[:\-]?\s*/i, '');
    }
  }

  let streetIndex = -1;
  if (!parsed.street) {
    const first = tokens[0] || '';
    const streetWithNumber = first.match(/^(.+?)\s+(?:n(?:º|°|o)?\.?\s*)?(\d+[A-Za-z0-9/-]*)$/i);
    if (streetWithNumber) {
      parsed.street = cleanAddressValue(streetWithNumber[1]);
      parsed.number = parsed.number || cleanAddressValue(streetWithNumber[2]);
      streetIndex = 0;
    } else if (isValidStreet(first) && !isCityStatePart(first) && !isComplementPart(first)) {
      parsed.street = first.replace(/^bairro\s*[:\-]?\s*/i, '');
      streetIndex = 0;
    }
  } else {
    streetIndex = tokens.findIndex((token) => token === parsed.street);
  }

  let numberIndex = -1;
  if (!parsed.number) {
    numberIndex = tokens.findIndex((token) => /^(?:n(?:º|°|o)?\.?\s*)?\d+[A-Za-z0-9/-]*$/i.test(token));
    if (numberIndex >= 0) parsed.number = tokens[numberIndex].replace(/^n(?:º|°|o)?\.?\s*/i, '');
  } else {
    numberIndex = tokens.findIndex((token) => token.includes(parsed.number));
  }

  const explicitNeighborhood = raw.match(/\bbairro\s*[:\-]?\s*([^,;|·]+?)(?=\s[-–—]\s|$)/i);
  if (!parsed.neighborhood && explicitNeighborhood) {
    parsed.neighborhood = cleanAddressValue(explicitNeighborhood[1]);
  }

  for (const token of tokens) {
    if (!parsed.zip && isZipPart(token)) parsed.zip = token;
    if (!parsed.complement && isComplementPart(token)) parsed.complement = token;
    if (isCityStatePart(token)) {
      const cityState = token.match(/^(.+?)[\/-]\s*([A-Za-z]{2})$/);
      if (cityState) {
        if (!parsed.city) parsed.city = cleanAddressValue(cityState[1]);
        if (!parsed.state) parsed.state = cleanAddressValue(cityState[2]).toUpperCase();
      }
    }
  }

  if (!parsed.neighborhood) {
    const start = Math.max(streetIndex, numberIndex);
    const candidate = tokens.find((token, index) => {
      if (index <= start) return false;
      if (isZipPart(token) || isCityStatePart(token) || isComplementPart(token)) return false;
      if (/^(?:n(?:º|°|o)?\.?\s*)?\d+[A-Za-z0-9/-]*$/i.test(token)) return false;
      return isValidNeighborhood(token);
    });
    if (candidate) parsed.neighborhood = candidate.replace(/^bairro\s*[:\-]?\s*/i, '');
  }

  return { ...parsed, formatted: addressPartsLabel(parsed, '') };
}

function normalizeAddress(address) {
  if (!address || typeof address !== 'object') return parseAddressInput('');
  const formatted = cleanAddressValue(address.formatted);
  return parseAddressInput(formatted, address);
}

function missingAddressFields(address) {
  const normalized = normalizeAddress(address);
  return REQUIRED_ADDRESS_FIELDS.filter((field) => {
    if (field === 'street') return !isValidStreet(normalized.street);
    if (field === 'number') return !isValidNumber(normalized.number);
    return !isValidNeighborhood(normalized.neighborhood);
  });
}

function addressMissingPrompt(stateStore, field) {
  const key = field === 'street'
    ? 'addressStreetPrompt'
    : field === 'number'
      ? 'addressNumberPrompt'
      : 'addressNeighborhoodPrompt';
  return message(stateStore, key);
}

function mergeAddressReply(address, input, expectedField = null) {
  const draft = normalizeAddress(address);
  const raw = cleanAddressValue(input);
  const looksLikeFullAddress = /[,;|·]|\s[-–—]\s/.test(raw) || (/[A-Za-zÀ-ÿ]/.test(raw) && /\d/.test(raw));

  if (expectedField && !looksLikeFullAddress) {
    draft[expectedField] = raw;
    return { ...draft, formatted: addressPartsLabel(draft, '') };
  }

  const parsed = parseAddressInput(raw);
  for (const field of ['street', 'number', 'complement', 'neighborhood', 'city', 'state', 'zip']) {
    if (cleanAddressValue(parsed[field])) draft[field] = parsed[field];
  }
  return { ...draft, formatted: addressPartsLabel(draft, '') };
}

function addressLabel(address) {
  return addressPartsLabel(normalizeAddress(address), '—');
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
      return { productId, name: product.name, quantity: Number(quantity), unitPrice: unitPriceForQuantity(product, quantity) };
    });
    if (!items.length) throw new Error('Carrinho vazio.');
    const totals = calculateCart(state.products, session.cart);
    state.products = consumeCartStock(state.products, session.cart);
    const createdAt = now().toISOString();
    order = {
      id: nextOrderId(state.orders), customerId: customer.id, customerName: customer.name, phone: `+${phone}`,
      status: 'PAYMENT_PENDING', deliveryType: session.deliveryType, total: totals.subtotal, createdAt,
      paidAt: null, receivingAccountId: null, items, address: structuredClone(session.address),
      newAddress: Boolean(session.newAddress), deliveryFee: 0, source: 'whatsapp',
      sourceCheckoutId: session.checkoutId,
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
        if (!savedAddress) {
          session.address = null; session.addressMissingField = null; session.step = 'address_input';
          saveSession(stateStore, phone, session, now);
          await sendText(message(stateStore, 'addressInputPrompt'));
          return { handled: true, step: session.step };
        }
        session.address = normalizeAddress(savedAddress);
        const missing = missingAddressFields(session.address);
        if (missing.length) {
          session.newAddress = true;
          session.addressMissingField = missing[0];
          session.step = 'address_input';
          saveSession(stateStore, phone, session, now);
          await sendText(addressMissingPrompt(stateStore, session.addressMissingField));
          return { handled: true, step: session.step };
        }
        session.newAddress = false; session.addressMissingField = null; session.step = 'confirm';
        saveSession(stateStore, phone, session, now);
        await sendText(confirmationText(stateStore, session));
        return { handled: true, step: session.step };
      }
      if (input === '2') {
        session.address = null; session.addressMissingField = null; session.newAddress = true; session.step = 'address_input';
        saveSession(stateStore, phone, session, now);
        await sendText(message(stateStore, 'addressInputPrompt'));
        return { handled: true, step: session.step };
      }
      await sendText(message(stateStore, 'savedAddressPrompt', { endereco: addressLabel(latestAddress(customer)) }));
      return { handled: true, step: session.step };
    }

    if (session.step === 'address_input') {
      session.address = mergeAddressReply(session.address, input, session.addressMissingField);
      session.newAddress = true;
      const missing = missingAddressFields(session.address);
      if (missing.length) {
        session.addressMissingField = missing[0];
        saveSession(stateStore, phone, session, now);
        await sendText(addressMissingPrompt(stateStore, session.addressMissingField));
        return { handled: true, step: session.step };
      }
      session.addressMissingField = null;
      session.address = normalizeAddress(session.address);
      session.step = 'confirm';
      saveSession(stateStore, phone, session, now);
      storeConfirmedAddress(stateStore, phone, session, now);
      await sendText(confirmationText(stateStore, session));
      return { handled: true, step: session.step };
    }

    if (session.step === 'confirm') {
      if (input === '2') {
        session.address = null; session.addressMissingField = null; session.newAddress = true; session.step = 'address_input';
        saveSession(stateStore, phone, session, now);
        await sendText(message(stateStore, 'addressInputPrompt'));
        return { handled: true, step: session.step };
      }
      if (input === '0') return cancelAndRestart({ phone, sendText, sendMedia });
      if (input !== '1') { await sendText(confirmationText(stateStore, session)); return { handled: true, step: session.step }; }
      try {
        const order = createPendingOrder(stateStore, phone, session, now);
        storeConfirmedAddress(stateStore, phone, session, now);
        session.orderId = order.id; session.confirmedAt = now().toISOString(); session.step = 'confirmed'; saveSession(stateStore, phone, session, now);
        await sendText(`✅ Pedido confirmado!\n${message(stateStore, 'paymentPending', { subtotal: formatCurrencyBRL(order.total), endereco: addressLabel(order.address) })}`);
        return { handled: true, step: session.step, orderId: order.id };
      } catch (error) {
        session.step = 'catalog'; session.selectedProductId = null; saveSession(stateStore, phone, session, now);
        await sendText(`${error instanceof Error ? error.message : 'Não foi possível confirmar o pedido.'}\nVou atualizar o catálogo para você.`);
        await sendCatalog(sendText);
        return { handled: true, step: session.step, error: 'availability-changed' };
      }
    }

    if (session.step === 'confirmed') {
      await sendText(message(stateStore, 'paymentPending'));
      return { handled: true, step: session.step, orderId: session.orderId };
    }

    session = await startConversation({ phone, contactName, sendText, sendMedia, includeWelcome: false });
    return { handled: true, step: session.step };
  }

  return { handleIncoming };
}
