import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consumeCartStock,
  nextOrderStatus,
  formatCurrencyBRL,
  computeProductStatus,
} from '../src/domain.js';

test('consumes cart quantities directly from physical stock', () => {
  const products = [
    { id: 'p1', stock: 10 },
    { id: 'p2', stock: 4 },
  ];
  const updated = consumeCartStock(products, { p1: 2, p2: 1 });
  assert.deepEqual(updated, [
    { id: 'p1', stock: 8 },
    { id: 'p2', stock: 3 },
  ]);
});

test('rejects cart consumption when requested quantity exceeds physical stock', () => {
  assert.throws(() => consumeCartStock([{ id: 'p1', stock: 1 }], { p1: 2 }), /estoque insuficiente/i);
});

test('drops legacy category and reserved fields when stock is consumed', () => {
  const updated = consumeCartStock([{ id: 'p1', stock: 3, reserved: 2, category: 'Legado' }], { p1: 1 });
  assert.deepEqual(updated, [{ id: 'p1', stock: 2 }]);
});

test('advances paid orders through fulfillment states by delivery mode', () => {
  assert.equal(nextOrderStatus({ status: 'PAID', deliveryType: 'shipping' }), 'PACKING');
  assert.equal(nextOrderStatus({ status: 'PACKING', deliveryType: 'shipping' }), 'SHIPPED');
  assert.equal(nextOrderStatus({ status: 'PACKING', deliveryType: 'local_delivery' }), 'DELIVERED');
  assert.equal(nextOrderStatus({ status: 'SHIPPED', deliveryType: 'shipping' }), 'DELIVERED');
  assert.equal(nextOrderStatus({ status: 'OUT_FOR_DELIVERY', deliveryType: 'local_delivery' }), 'DELIVERED');
});

test('formats BRL values for the admin interface', () => {
  assert.equal(formatCurrencyBRL(1234.5), 'R$ 1.234,50');
});

test('classifies product availability from physical stock only', () => {
  assert.equal(computeProductStatus({ stock: 0 }), 'OUT_OF_STOCK');
  assert.equal(computeProductStatus({ stock: 2 }), 'LOW_STOCK');
  assert.equal(computeProductStatus({ stock: 5, reserved: 5 }), 'ACTIVE');
});
