import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { createPaymentService } from '../server/payment-service.js';

function receipt({ amount = '20,00', time = '17:05:00', transactionId = 'E1234567890123456789012345678901' } = {}) {
  return `Comprovante Pix\nValor R$ ${amount}\nData e hora 16/09/2026 às ${time}\nDestinatário PRISMA STORE\nID da transação ${transactionId}`;
}

function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-local-pix-'));
  const store = createStateStore({
    dbPath: join(dir, 'db.sqlite'),
    seedState: {
      products: [{ id: 'p1', name: 'Produto', price: 10, stock: 3, reserved: 2, active: true }],
      customers: [{ id: 'c1', name: 'Cliente', phone: '+5511999999999', addresses: [], totalSpent: 0, orderCount: 0, lastOrderAt: null }],
      orders: [{
        id: 'PS-1001', customerId: 'c1', customerName: 'Cliente', phone: '+5511999999999',
        status: 'PAYMENT_PENDING', total: 20, createdAt: '2026-09-16T20:00:00.000Z',
        items: [{ productId: 'p1', name: 'Produto', quantity: 2, unitPrice: 10 }], sourceCheckoutId: 'chk-1',
      }],
    },
  });
  store.saveChatSession('5511999999999', { step: 'awaiting_payment', orderId: 'PS-1001' });
  const service = createPaymentService({
    stateStore: store,
    pixConfig: { key: 'pix@example.com', recipientName: 'PRISMA STORE', recipientCity: 'SAO PAULO', accountId: 'pix-local' },
    qrEncoder: async () => 'BASE64PNG',
    now: () => new Date('2026-09-16T20:10:00.000Z'),
  });
  return { dir, store, service, close: () => { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test('gera QR/Copia e Cola local sem CPF/CNPJ nem gateway', async () => {
  const h = harness();
  try {
    assert.deepEqual(h.service.getStatus(), { provider: 'pix-local', environment: 'local', configured: true });
    assert.equal(h.service.needsPayerDocument('PS-1001'), false);
    const pix = await h.service.generatePixForOrder({ orderId: 'PS-1001' });
    assert.match(pix.payload, /^000201/);
    assert.equal(pix.encodedImage, 'BASE64PNG');
    assert.equal(h.store.load().orders[0].paymentProvider, 'pix-local');
  } finally { h.close(); }
});

test('comprovante válido marca PAID, consome reserva e libera sessão para embalagem', async () => {
  const h = harness();
  try {
    await h.service.generatePixForOrder({ orderId: 'PS-1001' });
    const result = h.service.validateReceiptForOrder({ orderId: 'PS-1001', text: receipt(), fingerprint: 'receipt-1' });
    assert.equal(result.handled, true);
    const state = h.store.load();
    assert.equal(state.orders[0].status, 'PAID');
    assert.equal(state.orders[0].receivingAccountId, 'pix-local');
    assert.equal(state.orders[0].paymentReceiptFingerprint, 'receipt-1');
    assert.equal(state.products[0].stock, 1);
    assert.equal(state.products[0].reserved, 0);
    assert.equal(state.customers[0].orderCount, 1);
    assert.equal(h.store.getChatSession('5511999999999').step, 'paid');
  } finally { h.close(); }
});

test('comprovante com horário não posterior ao pedido fica em revisão manual e não baixa estoque', async () => {
  const h = harness();
  try {
    const result = h.service.validateReceiptForOrder({ orderId: 'PS-1001', text: receipt({ time: '17:00:00' }), fingerprint: 'receipt-2' });
    assert.equal(result.handled, false);
    assert.equal(result.manualReview, true);
    assert.ok(result.reasons.includes('payment-not-after-order'));
    const state = h.store.load();
    assert.equal(state.orders[0].status, 'PAYMENT_PENDING');
    assert.equal(state.orders[0].paymentReview.status, 'MANUAL_REVIEW');
    assert.equal(state.products[0].stock, 3);
    assert.equal(state.products[0].reserved, 2);
  } finally { h.close(); }
});
