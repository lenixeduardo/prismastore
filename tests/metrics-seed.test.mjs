import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { seedMetricOrders } from '../scripts/seed-metrics.mjs';

test('metrics seed adds 12 completed orders for the current report month and is idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-metrics-'));
  const dbPath = join(dir, 'prismastore.db');
  try {
    const now = new Date('2026-09-20T15:00:00-03:00');
    const first = seedMetricOrders({ dbPath, now });
    const second = seedMetricOrders({ dbPath, now });

    assert.equal(first.inserted, 12);
    assert.equal(second.inserted, 0);
    assert.equal(second.metricOrders, 12);

    const store = createStateStore({
      dbPath,
      seedState: { products: [], customers: [], orders: [] },
    });
    try {
      const metricOrders = store.load().orders.filter((order) => order.metricsSeed === true);
      assert.equal(metricOrders.length, 12);
      assert.equal(metricOrders.every((order) => order.status === 'DELIVERED'), true);
      assert.equal(metricOrders.every((order) => String(order.paidAt).startsWith('2026-09')), true);
      assert.equal(metricOrders.every((order) => order.receivingAccountId === 'pix-local'), true);
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
