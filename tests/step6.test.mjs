import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStateStore } from '../server/state-store.js';
import { createOrderLifecycleService, buildOrderTracker } from '../server/order-lifecycle-service.js';

function harness({ deliveryType = 'local_delivery', status = 'PAID' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prismastore-step6-'));
  const store = createStateStore({
    dbPath: path.join(dir, 'db.sqlite'),
    seedState: {
      products: [],
      customers: [{ id: 'c1', name: 'Cliente', phone: '+5511999999999', orderCount: 1, totalSpent: 50, addresses: [] }],
      orders: [{
        id: 'PS-1001', customerId: 'c1', customerName: 'Cliente', phone: '+5511999999999',
        status, deliveryType, total: 50, items: [], address: { formatted: 'Rua Teste, 1' },
        createdAt: '2026-09-14T12:00:00Z', paidAt: '2026-09-14T12:01:00Z',
      }],
    },
  });
  const sent = [];
  const service = createOrderLifecycleService({
    stateStore: store,
    now: () => new Date('2026-09-14T13:00:00Z'),
    finalArtworkPath: '/assets/prismastore-order-finished.png',
    messenger: {
      sendText: async (phone, text) => sent.push({ type: 'text', phone, text }),
      sendMedia: async (phone, source) => sent.push({ type: 'media', phone, source }),
    },
  });
  return { store, service, sent, close: () => store.close() };
}

test('tracker representa Pago, Produto embalado, Transporte e Finalizado', () => {
  const tracker = buildOrderTracker({ id: 'PS-1', status: 'PACKING', deliveryType: 'local_delivery' });
  assert.match(tracker, /✅ Pagamento confirmado/);
  assert.match(tracker, /✅ Produto embalado/);
  assert.match(tracker, /○ Saiu para entrega/);
  assert.match(tracker, /○ Finalizado/);
});

test('avança PAID para PACKING e envia tracker ao WhatsApp', async () => {
  const h = harness();
  try {
    const result = await h.service.advanceOrder({ orderId: 'PS-1001', expectedStatus: 'PAID' });
    assert.equal(result.changed, true);
    assert.equal(result.order.status, 'PACKING');
    assert.equal(h.store.load().orders[0].status, 'PACKING');
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].type, 'text');
    assert.match(h.sent[0].text, /embalado/);
  } finally { h.close(); }
});

test('PACKING segue para OUT_FOR_DELIVERY em entrega local e SHIPPED em envio', async () => {
  const local = harness({ status: 'PACKING', deliveryType: 'local_delivery' });
  const shipping = harness({ status: 'PACKING', deliveryType: 'shipping' });
  try {
    assert.equal((await local.service.advanceOrder({ orderId: 'PS-1001', expectedStatus: 'PACKING' })).order.status, 'OUT_FOR_DELIVERY');
    assert.equal((await shipping.service.advanceOrder({ orderId: 'PS-1001', expectedStatus: 'PACKING' })).order.status, 'SHIPPED');
    assert.match(local.sent[0].text, /Saiu para entrega/);
    assert.match(shipping.sent[0].text, /Pedido enviado/);
  } finally { local.close(); shipping.close(); }
});

test('finalização envia primeiro a arte padrão e depois o tracker finalizado', async () => {
  const h = harness({ status: 'OUT_FOR_DELIVERY' });
  try {
    const result = await h.service.advanceOrder({ orderId: 'PS-1001', expectedStatus: 'OUT_FOR_DELIVERY' });
    assert.equal(result.order.status, 'DELIVERED');
    assert.equal(h.sent[0].type, 'media');
    assert.equal(h.sent[0].source, '/assets/prismastore-order-finished.png');
    assert.equal(h.sent[1].type, 'text');
    assert.match(h.sent[1].text, /Seu pedido foi finalizado/);
    assert.match(h.sent[1].text, /✅ Finalizado/);
  } finally { h.close(); }
});

test('retry com expectedStatus antigo é idempotente e não envia mensagem duplicada', async () => {
  const h = harness();
  try {
    const first = await h.service.advanceOrder({ orderId: 'PS-1001', expectedStatus: 'PAID' });
    const second = await h.service.advanceOrder({ orderId: 'PS-1001', expectedStatus: 'PAID' });
    assert.equal(first.changed, true);
    assert.equal(second.changed, false);
    assert.equal(second.stale, true);
    assert.equal(h.store.load().orders[0].status, 'PACKING');
    assert.equal(h.sent.length, 1);
  } finally { h.close(); }
});

test('painel intercepta avanço legado e usa API com expectedStatus', () => {
  const source = fs.readFileSync(new URL('../src/order-lifecycle-ui.js', import.meta.url), 'utf8');
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(source, /\/api\/orders\/\$\{encodeURIComponent\(orderId\)\}\/advance/);
  assert.match(source, /expectedStatus:\s*order\.status/);
  assert.match(source, /stopImmediatePropagation\(\)/);
  assert.match(index, /order-lifecycle-ui\.js/);
});
