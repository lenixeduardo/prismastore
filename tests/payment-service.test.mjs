import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { createPaymentService } from '../server/payment-service.js';

function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-payments-'));
  const store = createStateStore({
    dbPath: join(dir, 'db.sqlite'),
    seedState: {
      products: [{ id: 'p1', name: 'Produto', price: 10, stock: 1, active: true }],
      customers: [{ id: 'c1', name: 'Cliente', phone: '+5511999999999', addresses: [], totalSpent: 0, orderCount: 0, lastOrderAt: null }],
      orders: [{ id: 'PS-1001', customerId: 'c1', customerName: 'Cliente', phone: '+5511999999999', status: 'PAYMENT_PENDING', total: 20, items: [{ productId: 'p1', name: 'Produto', quantity: 2, unitPrice: 10 }], sourceCheckoutId: 'chk-1' }],
    },
  });
  store.saveChatSession('5511999999999', { step: 'awaiting_payment', orderId: 'PS-1001' });
  const calls = { customer: 0, payment: 0, qr: 0, paymentInput: null };
  const asaasClient = {
    environment: 'sandbox', configured: true,
    createCustomer: async () => { calls.customer += 1; return { id: 'cus_1' }; },
    createPixPayment: async (input) => { calls.payment += 1; calls.paymentInput = input; return { id: 'pay_1', status: 'PENDING' }; },
    getPixQrCode: async () => { calls.qr += 1; return { encodedImage: 'PNGDATA', payload: 'PIX-COPIA-COLA', expirationDate: '2026-09-14 23:59:59' }; },
  };
  const service = createPaymentService({ stateStore: store, asaasClient, now: () => new Date('2026-09-14T15:00:00Z') });
  return { dir, store, service, calls, close: () => { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test('generates Pix idempotently, stores provider IDs and does not persist raw CPF/CNPJ', async () => {
  const h = harness();
  try {
    const first = await h.service.generatePixForOrder({ orderId: 'PS-1001', cpfCnpj: '12345678909' });
    const second = await h.service.generatePixForOrder({ orderId: 'PS-1001', cpfCnpj: '12345678909' });
    assert.equal(first.payload, 'PIX-COPIA-COLA');
    assert.equal(second.paymentId, 'pay_1');
    assert.equal(h.calls.customer, 1);
    assert.equal(h.calls.payment, 1);
    assert.equal(h.calls.qr, 2);
    assert.equal(h.calls.paymentInput.description, 'PrismaStore');
    assert.equal(h.calls.paymentInput.externalReference, 'PS-1001');
    assert.doesNotMatch(h.calls.paymentInput.description, /PS-1001/);
    const state = h.store.load();
    assert.equal(state.customers[0].asaasCustomerId, 'cus_1');
    assert.equal(state.orders[0].asaasPaymentId, 'pay_1');
    assert.equal(state.orders[0].pixPayload, 'PIX-COPIA-COLA');
    assert.equal(JSON.stringify(state).includes('12345678909'), false);
  } finally { h.close(); }
});

test('PAYMENT_CONFIRMED marks order PAID without consuming stock a second time', async () => {
  const h = harness();
  try {
    await h.service.generatePixForOrder({ orderId: 'PS-1001', cpfCnpj: '12345678909' });
    const event = { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1', value: 20 } };
    const result = await h.service.handleAsaasEvent(event);
    await h.service.handleAsaasEvent(event);
    assert.equal(result.handled, true);
    const state = h.store.load();
    assert.equal(state.orders[0].status, 'PAID');
    assert.equal(state.orders[0].receivingAccountId, 'asaas-main');
    assert.ok(state.orders[0].paidAt);
    assert.equal(state.products[0].stock, 1);
    assert.equal('reserved' in state.products[0], false);
    assert.equal(state.customers[0].orderCount, 1);
    assert.equal(state.customers[0].totalSpent, 20);
    assert.equal(h.store.getChatSession('5511999999999').step, 'paid');
  } finally { h.close(); }
});

test('webhook refuses amount mismatch and unknown events', async () => {
  const h = harness();
  try {
    await h.service.generatePixForOrder({ orderId: 'PS-1001', cpfCnpj: '12345678909' });
    let result = await h.service.handleAsaasEvent({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1', value: 19 } });
    assert.equal(result.handled, false);
    assert.equal(result.reason, 'amount-mismatch');
    result = await h.service.handleAsaasEvent({ event: 'PAYMENT_CREATED', payment: { id: 'pay_1', value: 20 } });
    assert.equal(result.handled, false);
    assert.equal(h.store.load().orders[0].status, 'PAYMENT_PENDING');
  } finally { h.close(); }
});

test('returning Asaas customer does not require CPF/CNPJ again', async () => {
  const h = harness();
  try {
    h.store.updateState((state) => { state.customers[0].asaasCustomerId = 'cus_saved'; return state; });
    assert.equal(h.service.needsPayerDocument('PS-1001'), false);
    await h.service.generatePixForOrder({ orderId: 'PS-1001' });
    assert.equal(h.calls.customer, 0);
    assert.equal(h.calls.payment, 1);
  } finally { h.close(); }
});
