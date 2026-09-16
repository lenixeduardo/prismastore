import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server/app-server.js';

test('GET /api/state protege o painel de pedidos antigos sem address sem alterar o estado persistido', async () => {
  const persisted = {
    products: [],
    customers: [],
    orders: [{ id: 'PS-LEGACY', status: 'PAID', items: [] }],
    settings: { chatbotMessages: {} },
  };
  const stateStore = {
    load: () => structuredClone(persisted),
    save: (state) => structuredClone(state),
  };
  const server = createAppServer({ stateStore, staticDir: process.cwd() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(`${baseUrl}/api/state`);
    assert.equal(response.status, 200);
    const state = await response.json();
    assert.deepEqual(state.orders[0].address, {});
    assert.equal('address' in persisted.orders[0], false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
