import test from 'node:test';
import assert from 'node:assert/strict';
import { createReportService } from '../server/report-service.js';

function storeWith(orders) {
  return { load: () => ({ products: [], customers: [], orders: structuredClone(orders) }) };
}

const accounts = [
  { id: 'asaas-main', name: 'Asaas Principal' },
  { id: 'pix-secondary', name: 'Conta Secundária' },
];

const orders = [
  { id: 'PS-1', customerName: 'Ana', phone: '+551100000001', status: 'DELIVERED', deliveryType: 'shipping', total: 100, paidAt: '2026-09-02T10:00:00.000Z', receivingAccountId: 'asaas-main' },
  { id: 'PS-2', customerName: 'Bia', phone: '+551100000002', status: 'PACKING', deliveryType: 'local_delivery', total: 50, paidAt: '2026-09-02T12:00:00.000Z', receivingAccountId: 'pix-secondary' },
  { id: 'PS-3', customerName: 'Caio', phone: '+551100000003', status: 'SHIPPED', deliveryType: 'shipping', total: 75, paidAt: '2026-09-11T12:00:00.000Z', receivingAccountId: 'asaas-main' },
  { id: 'PS-4', customerName: 'Dani', phone: '+551100000004', status: 'DELIVERED', deliveryType: 'shipping', total: 200, paidAt: '2026-08-31T12:00:00.000Z', receivingAccountId: 'asaas-main' },
];

test('monthly report returns real summary, daily totals and receiving accounts', () => {
  const service = createReportService({ stateStore: storeWith(orders), receivingAccounts: accounts });
  const report = service.getMonthlyReport('2026-09');
  assert.equal(report.revenue, 225);
  assert.equal(report.orderCount, 3);
  assert.equal(report.averageTicket, 75);
  assert.equal(report.accountCount, 2);
  assert.deepEqual(report.accounts.map((a) => [a.id, a.total]), [['asaas-main', 175], ['pix-secondary', 50]]);
  assert.deepEqual(report.daily, [
    { date: '2026-09-02', total: 150, orderCount: 2 },
    { date: '2026-09-11', total: 75, orderCount: 1 },
  ]);
  assert.deepEqual(report.orders.map((o) => o.id), ['PS-3', 'PS-2', 'PS-1']);
});

test('monthly report validates YYYY-MM month key', () => {
  const service = createReportService({ stateStore: storeWith([]), receivingAccounts: accounts });
  assert.throws(() => service.getMonthlyReport('setembro'), /YYYY-MM/);
});

test('CSV export uses same monthly paid orders and account labels', () => {
  const service = createReportService({ stateStore: storeWith(orders), receivingAccounts: accounts });
  const csv = service.exportMonthlyCsv('2026-09');
  assert.match(csv, /^\uFEFFPedido;Pago em;Cliente;/);
  assert.match(csv, /PS-1;2026-09-02T10:00:00.000Z;Ana;/);
  assert.match(csv, /Asaas Principal/);
  assert.match(csv, /Conta Secundária/);
  assert.doesNotMatch(csv, /PS-4/);
});
