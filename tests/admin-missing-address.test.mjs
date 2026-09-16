import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStateStore } from '../server/state-store.js';

test('normaliza pedidos antigos sem address antes de expor o estado ao painel', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prismastore-address-'));
  const store = createStateStore({
    dbPath: path.join(dir, 'prismastore.db'),
    seedState: {
      products: [],
      customers: [],
      orders: [{ id: 'PS-LEGACY', status: 'PAID', items: [] }],
    },
  });

  try {
    const [order] = store.load().orders;
    assert.deepEqual(order.address, {});
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
