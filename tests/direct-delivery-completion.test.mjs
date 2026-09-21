import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextOrderStatus } from '../src/domain.js';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const lifecycle = readFileSync(new URL('../server/order-lifecycle-service.js', import.meta.url), 'utf8');

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
