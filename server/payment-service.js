import { confirmPayment } from '../src/domain.js';
import { buildPixPayload } from './pix-brcode.js';
import { validatePixReceipt } from './pix-receipt.js';

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

function updateCustomerAfterPayment(state, order) {
  const customer = state.customers.find((candidate) => candidate.id === order.customerId);
  if (!customer) return;
  customer.orderCount = Number(customer.orderCount ?? 0) + 1;
  customer.totalSpent = Number(customer.totalSpent ?? 0) + Number(order.total ?? 0);
  customer.lastOrderAt = order.paidAt;
}

export function createPaymentService({
  stateStore,
  asaasClient = null,
  now = () => new Date(),
  accountId = 'asaas-main',
  pixConfig = null,
  qrEncoder = null,
}) {
  const localPixConfigured = Boolean(
    pixConfig?.key && pixConfig?.recipientName && pixConfig?.recipientCity,
  );

  function getStatus() {
    if (pixConfig) {
      return {
        provider: 'pix-local',
        environment: 'local',
        configured: localPixConfigured,
      };
    }
    return {
      provider: 'asaas',
      environment: asaasClient?.environment || 'sandbox',
      configured: Boolean(asaasClient?.configured),
    };
  }

  async function generateDemoPix({ amount } = {}) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new Error('Valor do Pix de demonstração inválido.');
    }

    const payload = buildPixPayload({
      key: '00000000-0000-0000-0000-000000000000',
      recipientName: 'PRISMASTORE DEMO',
      recipientCity: 'SAO PAULO',
      amount: numericAmount,
      txid: 'PRISMASTOREDEMO',
    });
    const encodedImage = qrEncoder ? await qrEncoder(payload) : null;

    return {
      paymentId: 'demo:pix',
      encodedImage,
      payload,
      expirationDate: null,
      amount: numericAmount,
      demo: true,
    };
  }

  function needsPayerDocument(orderId) {
    if (pixConfig) return false;
    const state = stateStore.load();
    const order = findOrder(state, orderId);
    const customer = findCustomer(state, order.customerId);
    return !customer.asaasCustomerId;
  }

  async function generateLocalPix(orderId) {
    if (!localPixConfigured) throw new Error('Pix local não configurado.');
    const state = stateStore.load();
    const order = findOrder(state, orderId);
    if (order.status !== 'PAYMENT_PENDING') throw new Error('Pedido não está aguardando pagamento.');

    const payload = buildPixPayload({
      key: pixConfig.key,
      recipientName: pixConfig.recipientName,
      recipientCity: pixConfig.recipientCity,
      amount: Number(order.total),
      txid: '***',
    });
    let encodedImage = null;
    if (qrEncoder) encodedImage = await qrEncoder(payload);

    stateStore.updateState((current) => {
      const stored = findOrder(current, orderId);
      stored.paymentProvider = 'pix-local';
      stored.paymentStatus = 'PENDING_RECEIPT';
      stored.pixPayload = payload;
      stored.pixGeneratedAt = stored.pixGeneratedAt || now().toISOString();
      return current;
    });

    return {
      paymentId: `local:${order.id}`,
      encodedImage,
      payload,
      expirationDate: null,
    };
  }

  async function generateAsaasPix({ orderId, cpfCnpj } = {}) {
    if (!asaasClient) throw new Error('Asaas não configurado.');
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
        description: 'PrismaStore',
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

  async function generatePixForOrder(input = {}) {
    if (pixConfig) return generateLocalPix(input.orderId);
    return generateAsaasPix(input);
  }

  function validateReceiptForOrder({ orderId, text, fingerprint } = {}) {
    if (!pixConfig) throw new Error('Validação local de comprovante não configurada.');
    let outcome = null;
    let paidOrder = null;
    let duplicate = false;

    stateStore.updateState((state) => {
      const order = findOrder(state, orderId);
      if (order.status !== 'PAYMENT_PENDING') {
        if (
          (fingerprint && order.paymentReceiptFingerprint === fingerprint)
          || (order.paymentTransactionId && String(text).includes(order.paymentTransactionId))
        ) {
          duplicate = true;
          paidOrder = structuredClone(order);
          outcome = { valid: true, manualReview: false, reasons: [], extracted: order.paymentReceiptExtracted || {}, fingerprint };
          return state;
        }
        outcome = { valid: false, manualReview: true, reasons: ['order-not-pending'], extracted: {}, fingerprint };
        return state;
      }

      outcome = validatePixReceipt({
        text,
        order,
        recipientName: pixConfig.recipientName,
        fingerprint,
        existingOrders: state.orders,
        timeZone: 'America/Sao_Paulo',
      });

      if (!outcome.valid) {
        order.paymentReview = {
          status: 'MANUAL_REVIEW',
          reasons: outcome.reasons,
          submittedAt: now().toISOString(),
          fingerprint: fingerprint || null,
          transactionId: outcome.extracted.transactionId || null,
        };
        return state;
      }

      const updated = confirmPayment(order, pixConfig.accountId || 'pix-local', now().toISOString());
      updated.paymentProvider = 'pix-local';
      updated.paymentStatus = 'CONFIRMED_LOCAL';
      updated.paymentReceiptFingerprint = fingerprint || null;
      updated.paymentTransactionId = outcome.extracted.transactionId || null;
      updated.paymentReceiptExtracted = outcome.extracted;
      updated.paymentReview = null;
      Object.assign(order, updated);
      updateCustomerAfterPayment(state, order);
      paidOrder = structuredClone(order);
      return state;
    });

    if (!outcome?.valid) {
      return {
        handled: false,
        manualReview: true,
        reason: 'manual-review',
        reasons: outcome?.reasons ?? ['invalid-receipt'],
        extracted: outcome?.extracted ?? {},
      };
    }

    if (paidOrder) {
      const phone = digits(paidOrder.phone);
      const session = stateStore.getChatSession(phone);
      if (session?.orderId === paidOrder.id && session.step !== 'paid') {
        stateStore.saveChatSession(phone, { ...session, step: 'paid', paidAt: paidOrder.paidAt });
      }
    }
    return { handled: true, duplicate, order: paidOrder, extracted: outcome.extracted };
  }

  async function handleAsaasEvent(payload = {}) {
    if (!asaasClient) return { handled: false, reason: 'asaas-disabled' };
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
      updateCustomerAfterPayment(state, order);
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

  return {
    getStatus,
    generateDemoPix,
    needsPayerDocument,
    generatePixForOrder,
    validateReceiptForOrder,
    handleAsaasEvent,
  };
}
