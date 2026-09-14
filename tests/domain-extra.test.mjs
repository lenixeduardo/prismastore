import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reserveCartStock,
  releaseCartStock,
  nextOrderStatus,
  formatCurrencyBRL,
  computeProductStatus,
} from '../src/domain.js';

test('reserves cart quantities without changing physical stock', () => {
  const products = [
    { id: 'p1', stock: 10, reserved: 1 },
    { id: 'p2', stock: 4, reserved: 0 },
  ];
  const updated = reserveCartStock(products, { p1: 2, p2: 1 });
  assert.deepEqual(updated, [
    { id: 'p1', stock: 10, reserved: 3 },
    { id: 'p2', stock: 4, reserved: 1 },
  ]);
});

test('rejects reservation when requested quantity exceeds available stock', () => {
  assert.throws(() => reserveCartStock([{ id: 'p1', stock: 2, reserved: 1 }], { p1: 2 }), /estoque insuficiente/i);
});

test('releases reserved quantities without going below zero', () => {
  const updated = releaseCartStock([{ id: 'p1', stock: 10, reserved: 1 }], { p1: 3 });
  assert.equal(updated[0].reserved, 0);
});

test('advances paid orders to packing and fulfillment states by delivery mode', () => {
  assert.equal(nextOrderStatus({ status: 'PAID', deliveryType: 'shipping' }), 'PACKING');
  assert.equal(nextOrderStatus({ status: 'PACKING', deliveryType: 'shipping' }), 'SHIPPED');
  assert.equal(nextOrderStatus({ status: 'PACKING', deliveryType: 'local_delivery' }), 'OUT_FOR_DELIVERY');
  assert.equal(nextOrderStatus({ status: 'SHIPPED', deliveryType: 'shipping' }), 'DELIVERED');
  assert.equal(nextOrderStatus({ status: 'OUT_FOR_DELIVERY', deliveryType: 'local_delivery' }), 'DELIVERED');
});

test('formats BRL values for the admin interface', () => {
  assert.equal(formatCurrencyBRL(1234.5), 'R$ 1.234,50');
});

test('classifies product availability for stock badges', () => {
  assert.equal(computeProductStatus({ stock: 0, reserved: 0 }), 'OUT_OF_STOCK');
  assert.equal(computeProductStatus({ stock: 2, reserved: 0 }), 'LOW_STOCK');
  assert.equal(computeProductStatus({ stock: 5, reserved: 1 }), 'ACTIVE');
});
