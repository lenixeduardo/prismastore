import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextOrderStatus } from '../src/domain.js';
import { createOrderLifecycleService } from '../server/order-lifecycle-service.js';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const lifecycle = readFileSync(new URL('../server/order-lifecycle-service.js', import.meta.url), 'utf8');
const board = readFileSync(new URL('../src/orders-board.js', import.meta.url), 'utf8');

test('local delivery completes immediately when packed order is handed to courier', () => {
  assert.equal(nextOrderStatus({ status: 'PACKING', deliveryType: 'local_delivery' }), 'DELIVERED');
});

test('shipping keeps its shipped stage before completion', () => {
  assert.equal(nextOrderStatus({ status: 'PACKING', deliveryType: 'shipping' }), 'SHIPPED');
  assert.equal(nextOrderStatus({ status: 'SHIPPED', deliveryType: 'shipping' }), 'DELIVERED');
});

test('admin no longer exposes out-for-delivery as an operational status', () => {
  assert.doesNotMatch(app, /\['OUT_FOR_DELIVERY','Em rota'\]/);
  assert.match(app, /DELIVERED:\['Concluído'/);
  assert.match(app, /'DELIVERED','Concluídos'/);
  assert.doesNotMatch(app, /OUT_FOR_DELIVERY:'Saiu para entrega'/);
});

test('local completion tracker has no intermediate courier route stage', () => {
  assert.doesNotMatch(lifecycle, /OUT_FOR_DELIVERY/);
  assert.doesNotMatch(lifecycle, /Saiu para entrega/);
  assert.match(lifecycle, /Concluído/);
});


test('packing delivery card exposes courier handoff completion action', () => {
  assert.match(board, /Entregue ao motoboy · Concluir/);
  assert.match(board, /expectedStatus:\s*'PACKING'/);
});


test('courier handoff issues and sends the confirmation link in the same status transition', async () => {
  let state = {
    orders: [{
      id: 'PS-LINK-1',
      customerName: 'Cliente',
      phone: '+5511999999999',
      status: 'PACKING',
      deliveryType: 'local_delivery',
      items: [{ productId: 'catalog-eduardo-teste', catalogItemNumber: 1, quantity: 1 }],
    }],
    settings: { chatbotMessages: {} },
  };
  const sent = [];
  let handoffOrderId = null;
  let issuedOrderId = null;
  let markedSentOrderId = null;
  const stateStore = {
    load: () => structuredClone(state),
    updateState: (mutator) => {
      const working = structuredClone(state);
      state = mutator(working) || working;
      return structuredClone(state);
    },
  };
  const service = createOrderLifecycleService({
    stateStore,
    now: () => new Date('2026-09-25T22:40:00.000Z'),
    messenger: {
      sendText: async (phone, text) => sent.push({ phone, text }),
    },
    deliveryConfirmationService: {
      isEligibleOrder: () => true,
      markHandoff: (orderId) => { handoffOrderId = orderId; },
      issueLink: (orderId) => {
        issuedOrderId = orderId;
        return { link: 'https://prisma.test/confirmar/abc' };
      },
      markLinkSent: (orderId) => { markedSentOrderId = orderId; },
    },
  });

  const result = await service.advanceOrder({ orderId: 'PS-LINK-1', expectedStatus: 'PACKING' });

  assert.equal(result.order.status, 'DELIVERED');
  assert.equal(result.confirmationLink, 'https://prisma.test/confirmar/abc');
  assert.equal(handoffOrderId, 'PS-LINK-1');
  assert.equal(issuedOrderId, 'PS-LINK-1');
  assert.equal(markedSentOrderId, 'PS-LINK-1');
  assert.equal(sent.some((message) => message.text.includes('https://prisma.test/confirmar/abc')), true);
});
