import { confirmPayment, consumeReservedOrderStock } from '../src/domain.js';

function digits(value = '') {
  return String(value).replace(/\D/g, '');
}

function saoPauloDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function findOrder(state, orderId) {
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) throw new Error(`Pedido ${orderId} não encontrado.`);
  return order;
}

function findCustomer(state, customerId) {
  const customer = state.customers.find((candidate) => candidate.id === customerId);
  if (!customer) throw new Error('Cliente do pedido não encontrado.');
  return customer;
}

export function createPaymentService({ stateStore, asaasClient, now = () => new Date(), accountId = 'asaas-main' }) {
  function getStatus() {
    return {
      provider: 'asaas',
      environment: asaasClient.environment || 'sandbox',
      configured: Boolean(asaasClient.configured),
    };
  }

  function needsPayerDocument(orderId) {
    const state = stateStore.load();
    const order = findOrder(state, orderId);
    const customer = findCustomer(state, order.customerId);
    return !customer.asaasCustomerId;
  }

  async function generatePixForOrder({ orderId, cpfCnpj } = {}) {
    let state = stateStore.load();
    let order = findOrder(state, orderId);
    let customer = findCustomer(state, order.customerId);
    const documentDigits = digits(cpfCnpj);
    if (!customer.asaasCustomerId && ![11, 14].includes(documentDigits.length)) {
      throw new Error('CPF/CNPJ deve ter 11 ou 14 dígitos.');
    }
    if (order.status !== 'PAYMENT_PENDING') throw new Error('Pedido não está aguardando pagamento.');

    let asaasCustomerId = customer.asaasCustomerId;
    if (!asaasCustomerId) {
      const created = await asaasClient.createCustomer({
        name: customer.name || order.customerName,
        cpfCnpj: documentDigits,
        mobilePhone: digits(customer.phone || order.phone),
        externalReference: customer.id,
      });
      asaasCustomerId = created.id;
      stateStore.updateState((current) => {
        const stored = findCustomer(current, customer.id);
        stored.asaasCustomerId = asaasCustomerId;
        return current;
      });
    }

    state = stateStore.load();
    order = findOrder(state, orderId);
    let paymentId = order.asaasPaymentId;
    if (!paymentId) {
      const payment = await asaasClient.createPixPayment({
        customerId: asaasCustomerId,
        value: Number(order.total),
        dueDate: saoPauloDate(now()),
        description: `PrismaStore · Pedido ${order.id}`,
        externalReference: order.id,
      });
      paymentId = payment.id;
      stateStore.updateState((current) => {
        const stored = findOrder(current, orderId);
        stored.paymentProvider = 'asaas';
        stored.asaasPaymentId = paymentId;
        stored.paymentStatus = payment.status || 'PENDING';
        return current;
      });
    }

    const qr = await asaasClient.getPixQrCode(paymentId);
    stateStore.updateState((current) => {
      const stored = findOrder(current, orderId);
      stored.pixPayload = qr.payload || null;
      stored.pixExpirationDate = qr.expirationDate || null;
      return current;
    });
    return {
      paymentId,
      encodedImage: qr.encodedImage,
      payload: qr.payload,
      expirationDate: qr.expirationDate,
    };
  }

  async function handleAsaasEvent(payload = {}) {
    if (!['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(payload.event)) {
      return { handled: false, reason: 'ignored-event' };
    }
    const paymentId = payload.payment?.id;
    if (!paymentId) return { handled: false, reason: 'missing-payment-id' };

    let paidOrder = null;
    let duplicate = false;
    let mismatch = false;
    stateStore.updateState((state) => {
      const order = state.orders.find((candidate) => candidate.asaasPaymentId === paymentId);
      if (!order) return state;
      if (Math.abs(Number(payload.payment?.value) - Number(order.total)) > 0.009) {
        mismatch = true;
        return state;
      }
      if (order.status !== 'PAYMENT_PENDING') {
        duplicate = true;
        paidOrder = structuredClone(order);
        return state;
      }
      state.products = consumeReservedOrderStock(state.products, order.items);
      const updated = confirmPayment(order, accountId, now().toISOString());
      updated.paymentStatus = payload.payment?.status || payload.event.replace('PAYMENT_', '');
      Object.assign(order, updated);
      const customer = state.customers.find((candidate) => candidate.id === order.customerId);
      if (customer) {
        customer.orderCount = Number(customer.orderCount ?? 0) + 1;
        customer.totalSpent = Number(customer.totalSpent ?? 0) + Number(order.total ?? 0);
        customer.lastOrderAt = order.paidAt;
      }
      paidOrder = structuredClone(order);
      return state;
    });

    if (mismatch) return { handled: false, reason: 'amount-mismatch' };
    if (!paidOrder) return { handled: false, reason: 'order-not-found' };

    const phone = digits(paidOrder.phone);
    const session = stateStore.getChatSession(phone);
    if (session?.orderId === paidOrder.id && session.step !== 'paid') {
      stateStore.saveChatSession(phone, { ...session, step: 'paid', paidAt: paidOrder.paidAt });
    }
    return { handled: true, duplicate, order: paidOrder };
  }

  return { getStatus, needsPayerDocument, generatePixForOrder, handleAsaasEvent };
}
