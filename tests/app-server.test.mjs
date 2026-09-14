import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { createAppServer } from '../server/app-server.js';

function fixture() {
  return {
    products: [{ id: 'p1', name: 'Produto', stock: 4, reserved: 0 }],
    customers: [],
    orders: [],
  };
}

async function withServer(run) {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-server-'));
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: fixture() });
  const server = createAppServer({ stateStore: store, staticDir: process.cwd() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run({ baseUrl: `http://127.0.0.1:${port}`, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('GET /api/state returns persisted operational state', async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/state`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), fixture());
  });
});

test('PUT /api/state updates sqlite-backed operational state', async () => {
  await withServer(async ({ baseUrl, store }) => {
    const changed = fixture();
    changed.products[0].stock = 9;
    const response = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(changed),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(store.load(), changed);
  });
});

test('serves the existing admin index from the same process', async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /PrismaStore/i);
  });
});

test('WhatsApp API exposes status and triggers connect/disconnect', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-wa-api-'));
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: fixture() });
  let status = { status: 'disconnected', qrDataUrl: null, account: null, error: null };
  let connects = 0;
  let disconnects = 0;
  const whatsappManager = {
    getStatus: () => structuredClone(status),
    connect: async () => { connects += 1; status = { ...status, status: 'connecting' }; return status; },
    disconnect: async () => { disconnects += 1; status = { ...status, status: 'disconnected' }; return status; },
  };
  const server = createAppServer({ stateStore: store, staticDir: process.cwd(), whatsappManager });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    let response = await fetch(`${baseUrl}/api/whatsapp/status`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'disconnected');

    response = await fetch(`${baseUrl}/api/whatsapp/connect`, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal(connects, 1);
    assert.equal((await response.json()).status, 'connecting');

    response = await fetch(`${baseUrl}/api/whatsapp/disconnect`, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal(disconnects, 1);
    assert.equal((await response.json()).status, 'disconnected');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Asaas webhook requires token, processes payment event and notifies WhatsApp', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-asaas-webhook-'));
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: fixture() });
  const events = [];
  const notifications = [];
  const paymentService = {
    getStatus: () => ({ provider: 'asaas', environment: 'sandbox', configured: true }),
    handleAsaasEvent: async (payload) => { events.push(payload); return { handled: true, order: { id: 'PS-1', phone: '+5511999999999', status: 'PAID' } }; },
  };
  const whatsappManager = { sendText: async (phone, text) => notifications.push({ phone, text }) };
  const server = createAppServer({ stateStore: store, staticDir: process.cwd(), whatsappManager, paymentService, asaasWebhookToken: 'x'.repeat(32) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(`${baseUrl}/api/payments/status`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).configured, true);

    response = await fetch(`${baseUrl}/api/webhooks/asaas`, { method: 'POST', headers: { 'content-type': 'application/json', 'asaas-access-token': 'wrong' }, body: JSON.stringify({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1', value: 20 } }) });
    assert.equal(response.status, 401);
    assert.equal(events.length, 0);

    response = await fetch(`${baseUrl}/api/webhooks/asaas`, { method: 'POST', headers: { 'content-type': 'application/json', 'asaas-access-token': 'x'.repeat(32) }, body: JSON.stringify({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1', value: 20 } }) });
    assert.equal(response.status, 200);
    assert.equal(events.length, 1);
    assert.equal(notifications.length, 1);
    assert.match(notifications[0].text, /Pagamento confirmado/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
