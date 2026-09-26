import { createHmac, timingSafeEqual } from 'node:crypto';

export const DELIVERY_CONFIRMATION_PILOT_PRODUCT_ID = 'catalog-eduardo-teste';

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function fromBase64url(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function tokenSignature(payloadPart, secret) {
  return createHmac('sha256', secret).update(payloadPart).digest('base64url');
}

function normalizePublicUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '');
}

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function validateDataUrl(value, label, maxLength = 900_000) {
  if (!value) return null;
  const text = String(value);
  if (text.length > maxLength) throw new Error(`${label} excede o tamanho permitido.`);
  if (!/^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(text)) {
    throw new Error(`${label} inválida.`);
  }
  return text;
}

function isEligibleOrder(order) {
  return Array.isArray(order?.items)
    && order.items.some((item) => item?.productId === DELIVERY_CONFIRMATION_PILOT_PRODUCT_ID);
}

function catalogItemNumber(item, state) {
  const explicit = Number(item?.catalogItemNumber);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;

  const products = Array.isArray(state?.products) ? state.products : [];
  const index = products.findIndex((product) => product?.id === item?.productId);
  return index >= 0 ? index + 1 : null;
}

function publicOrder(order, state) {
  return {
    customerName: String(order?.customerName || 'Cliente'),
    deliveryType: order?.deliveryType || null,
    items: Array.isArray(order?.items)
      ? order.items.map((item) => {
          const itemNumber = catalogItemNumber(item, state);
          return {
            id: itemNumber ? `#${itemNumber}` : '#—',
            quantity: Number(item?.quantity || 0),
          };
        })
      : [],
    address: order?.address && typeof order.address === 'object' ? {
      street: String(order.address.street || ''),
      number: String(order.address.number || ''),
      complement: String(order.address.complement || ''),
      neighborhood: String(order.address.neighborhood || ''),
      city: String(order.address.city || ''),
      state: String(order.address.state || ''),
      zip: String(order.address.zip || ''),
    } : null,
    status: order?.deliveryConfirmation?.confirmedAt ? 'confirmed' : 'pending',
    confirmedAt: order?.deliveryConfirmation?.confirmedAt || null,
  };
}

function makeToken({ orderId, issuedAt, secret }) {
  const payloadPart = base64url(JSON.stringify({ orderId, issuedAt }));
  return `${payloadPart}.${tokenSignature(payloadPart, secret)}`;
}

function verifyToken(token, secret) {
  const [payloadPart, signature, extra] = String(token || '').split('.');
  if (!payloadPart || !signature || extra) throw new Error('Link de confirmação inválido.');
  const expected = tokenSignature(payloadPart, secret);
  if (!safeEqual(signature, expected)) throw new Error('Link de confirmação inválido.');
  let payload;
  try {
    payload = JSON.parse(fromBase64url(payloadPart));
  } catch {
    throw new Error('Link de confirmação inválido.');
  }
  if (!payload?.orderId || !payload?.issuedAt) throw new Error('Link de confirmação inválido.');
  return payload;
}

export function createDeliveryConfirmationService({
  stateStore,
  secret,
  publicUrl = '',
  now = () => new Date(),
}) {
  const signingSecret = String(secret || '').trim();
  if (signingSecret.length < 16) {
    throw new Error('PRISMASTORE_DELIVERY_SECRET deve ter ao menos 16 caracteres.');
  }
  const baseUrl = normalizePublicUrl(publicUrl);

  function issueLink(orderId) {
    let issued = null;
    stateStore.updateState((state) => {
      const order = state.orders.find((candidate) => candidate.id === orderId);
      if (!order) throw new Error('Pedido não encontrado.');
      if (!isEligibleOrder(order)) throw new Error('Confirmação de entrega ainda está liberada somente para Eduardo teste.');
      if (order.status !== 'DELIVERED') throw new Error('O link de confirmação só pode ser gerado após a conclusão operacional da entrega.');

      const current = order.deliveryConfirmation && typeof order.deliveryConfirmation === 'object'
        ? order.deliveryConfirmation
        : {};
      const issuedAt = current.issuedAt || now().toISOString();
      const token = makeToken({ orderId: order.id, issuedAt, secret: signingSecret });
      const relativeLink = `/delivery-confirmation.html?token=${encodeURIComponent(token)}`;
      const link = baseUrl ? `${baseUrl}${relativeLink}` : relativeLink;

      order.deliveryConfirmation = {
        ...current,
        pilot: true,
        issuedAt,
        lastGeneratedAt: now().toISOString(),
        link,
        confirmedAt: current.confirmedAt || null,
      };
      issued = { link, token, order: structuredClone(order) };
      return state;
    });
    return issued;
  }

  function markLinkSent(orderId, channel = 'whatsapp') {
    let result = null;
    stateStore.updateState((state) => {
      const order = state.orders.find((candidate) => candidate.id === orderId);
      if (!order || !isEligibleOrder(order)) return state;
      order.deliveryConfirmation = {
        ...(order.deliveryConfirmation || {}),
        linkSentAt: now().toISOString(),
        linkSentChannel: cleanText(channel, 40),
      };
      result = structuredClone(order.deliveryConfirmation);
      return state;
    });
    return result;
  }

  function resolveOrderByToken(token) {
    const payload = verifyToken(token, signingSecret);
    const state = stateStore.load();
    const order = state.orders.find((candidate) => candidate.id === payload.orderId);
    if (!order || !isEligibleOrder(order)) throw new Error('Link de confirmação inválido.');
    if (order.deliveryConfirmation?.issuedAt !== payload.issuedAt) throw new Error('Link de confirmação expirado.');
    return { payload, order };
  }

  function getPublicConfirmation(token, requestMeta = {}) {
    const { payload } = resolveOrderByToken(token);
    let snapshot = null;
    stateStore.updateState((state) => {
      const order = state.orders.find((candidate) => candidate.id === payload.orderId);
      if (!order) throw new Error('Pedido não encontrado.');
      const current = order.deliveryConfirmation || {};
      order.deliveryConfirmation = {
        ...current,
        openedAt: current.openedAt || now().toISOString(),
        lastOpenedAt: now().toISOString(),
        openCount: Number(current.openCount || 0) + 1,
        lastOpenedIp: cleanText(requestMeta.ip, 120) || null,
        lastOpenedUserAgent: cleanText(requestMeta.userAgent, 500) || null,
      };
      snapshot = publicOrder(order, state);
      return state;
    });
    return snapshot;
  }

  function confirmDelivery({
    token,
    recipientName,
    accepted,
    signatureDataUrl = null,
    photoDataUrl = null,
    notes = '',
    requestMeta = {},
  }) {
    if (accepted !== true) throw new Error('É necessário confirmar o recebimento.');
    const cleanRecipient = cleanText(recipientName, 120);
    if (cleanRecipient.length < 2) throw new Error('Informe o nome de quem recebeu.');
    const signature = validateDataUrl(signatureDataUrl, 'Assinatura');
    if (!signature) throw new Error('A assinatura é obrigatória.');
    const photo = validateDataUrl(photoDataUrl, 'Foto da entrega', 1_800_000);

    const { payload } = resolveOrderByToken(token);
    let result = null;
    stateStore.updateState((state) => {
      const order = state.orders.find((candidate) => candidate.id === payload.orderId);
      if (!order) throw new Error('Pedido não encontrado.');
      const current = order.deliveryConfirmation || {};
      if (current.confirmedAt) {
        result = { alreadyConfirmed: true, confirmation: structuredClone(current), order: publicOrder(order, state) };
        return state;
      }

      const confirmedAt = now().toISOString();
      const confirmationIp = cleanText(requestMeta.ip, 120) || null;
      const confirmationUserAgent = cleanText(requestMeta.userAgent, 500) || null;
      const confirmationNotes = cleanText(notes, 1000);
      const evidenceHash = createHmac('sha256', signingSecret)
        .update(JSON.stringify({
          orderId: order.id,
          confirmedAt,
          recipientName: cleanRecipient,
          confirmationIp,
          confirmationUserAgent,
          notes: confirmationNotes,
          signature,
          photo,
        }))
        .digest('hex');
      order.deliveryJourney = {
        ...(order.deliveryJourney || {}),
        deliveredAt: confirmedAt,
      };
      order.deliveryConfirmation = {
        ...current,
        confirmedAt,
        recipientName: cleanRecipient,
        accepted: true,
        notes: confirmationNotes,
        signatureDataUrl: signature,
        photoDataUrl: photo,
        confirmationIp,
        confirmationUserAgent,
        evidenceHash,
      };
      result = {
        alreadyConfirmed: false,
        confirmation: structuredClone(order.deliveryConfirmation),
        order: publicOrder(order, state),
      };
      return state;
    });
    return result;
  }

  function recordRideLink({ orderId, rideLink, source = 'whatsapp' }) {
    const link = cleanText(rideLink, 1000);
    if (!/^https?:\/\//i.test(link)) throw new Error('Link da corrida inválido.');
    let result = null;
    stateStore.updateState((state) => {
      const order = state.orders.find((candidate) => candidate.id === orderId);
      if (!order) throw new Error('Pedido não encontrado.');
      if (!isEligibleOrder(order)) return state;
      const at = now().toISOString();
      order.deliveryJourney = {
        ...(order.deliveryJourney || {}),
        rideLink: link,
        rideRegisteredAt: at,
        rideSource: cleanText(source, 40),
      };
      result = structuredClone(order.deliveryJourney);
      return state;
    });
    return result;
  }

  function markHandoff(orderId, at = now().toISOString()) {
    let result = null;
    stateStore.updateState((state) => {
      const order = state.orders.find((candidate) => candidate.id === orderId);
      if (!order || !isEligibleOrder(order)) return state;
      order.deliveryJourney = {
        ...(order.deliveryJourney || {}),
        handoffAt: order.deliveryJourney?.handoffAt || at,
      };
      result = structuredClone(order.deliveryJourney);
      return state;
    });
    return result;
  }

  return {
    issueLink,
    markLinkSent,
    getPublicConfirmation,
    confirmDelivery,
    recordRideLink,
    markHandoff,
    isEligibleOrder,
  };
}
