import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLowStock,
  isNewAddress,
  calculateCart,
  confirmPayment,
  buildMonthlyReport,
} from '../src/domain.js';

test('flags products with fewer than 3 physical stock units as low stock', () => {
  assert.equal(isLowStock({ stock: 2 }), true);
  assert.equal(isLowStock({ stock: 4, reserved: 4 }), false);
  assert.equal(isLowStock({ stock: 3, reserved: 99 }), false);
});

test('marks an address as new when it differs from every historical address', () => {
  const customer = {
    addresses: [
      { street: 'Rua Aurora', number: '120', zip: '01209-000', city: 'São Paulo' },
    ],
  };
  assert.equal(isNewAddress(customer, { street: 'Rua Aurora', number: '120', zip: '01209-000', city: 'São Paulo' }), false);
  assert.equal(isNewAddress(customer, { street: 'Rua Augusta', number: '555', zip: '01305-000', city: 'São Paulo' }), true);
});

test('calculates cart subtotal and quantity from product prices', () => {
  const products = [
    { id: 'p1', price: 18 },
    { id: 'p2', price: 32 },
  ];
  const result = calculateCart(products, { p1: 2, p2: 1 });
  assert.deepEqual(result, { quantity: 3, subtotal: 68 });
});

test('payment confirmation sets order to paid and records receiving account', () => {
  const order = { id: 'o1', status: 'PAYMENT_PENDING', total: 99.5 };
  const paid = confirmPayment(order, 'asaas-main', '2026-09-13T12:00:00.000Z');
  assert.equal(paid.status, 'PAID');
  assert.equal(paid.receivingAccountId, 'asaas-main');
  assert.equal(paid.paidAt, '2026-09-13T12:00:00.000Z');
});

test('builds monthly revenue grouped by receiving account', () => {
  const orders = [
    { status: 'PAID', total: 100, receivingAccountId: 'asaas-main', paidAt: '2026-09-03T12:00:00.000Z' },
    { status: 'PAID', total: 50, receivingAccountId: 'asaas-main', paidAt: '2026-09-10T12:00:00.000Z' },
    { status: 'PAID', total: 75, receivingAccountId: 'pix-secondary', paidAt: '2026-09-11T12:00:00.000Z' },
    { status: 'PAID', total: 200, receivingAccountId: 'asaas-main', paidAt: '2026-08-22T12:00:00.000Z' },
  ];
  const report = buildMonthlyReport(orders, '2026-09');
  assert.equal(report.revenue, 225);
  assert.equal(report.orderCount, 3);
  assert.equal(report.averageTicket, 75);
  assert.deepEqual(report.byAccount, {
    'asaas-main': 150,
    'pix-secondary': 75,
  });
});

test('monthly report keeps paid revenue after orders advance operational status', () => {
  const orders = [
    { status: 'DELIVERED', total: 120, receivingAccountId: 'asaas-main', paidAt: '2026-09-05T12:00:00.000Z' },
    { status: 'PACKING', total: 80, receivingAccountId: 'asaas-main', paidAt: '2026-09-06T12:00:00.000Z' },
    { status: 'PAYMENT_PENDING', total: 999, receivingAccountId: null, paidAt: null },
  ];
  const report = buildMonthlyReport(orders, '2026-09');
  assert.equal(report.orderCount, 2);
  assert.equal(report.revenue, 200);
  assert.deepEqual(report.byDay, { '2026-09-05': 120, '2026-09-06': 80 });
});
