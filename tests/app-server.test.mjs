import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { createAppServer } from '../server/app-server.js';
import { DEFAULT_CHATBOT_MESSAGES } from '../server/chatbot-messages.js';

function fixture() {
  return {
    products: [{ id: 'p1', name: 'Produto', stock: 4, reserved: 0 }],
    customers: [],
    orders: [],
    settings: { chatbotMessages: { ...DEFAULT_CHATBOT_MESSAGES } },
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

test('GET /api/state returns persisted operational state including chatbot settings', async () => {
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

test('WhatsApp API exposes status and triggers connect/restart/disconnect', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-wa-api-'));
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: fixture() });
  let status = { status: 'disconnected', qrDataUrl: null, account: null, error: null };
  let connects = 0;
  let restarts = 0;
  let disconnects = 0;
  const whatsappManager = {
    getStatus: () => structuredClone(status),
    connect: async () => { connects += 1; status = { ...status, status: 'connecting' }; return status; },
    restartConnection: async () => { restarts += 1; status = { ...status, status: 'connecting', qrDataUrl: null, pairingCode: null, error: null }; return status; },
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

    response = await fetch(`${baseUrl}/api/whatsapp/restart`, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal(restarts, 1);
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

test('WhatsApp pairing API preserves the real pairing error for the admin UI', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-wa-pair-api-'));
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: fixture() });
  const whatsappManager = {
    getStatus: () => ({ status: 'disconnected', qrDataUrl: null, pairingCode: null, account: null, error: null }),
    requestPairingCode: async () => { throw new Error('WhatsApp recusou o pareamento por telefone.'); },
  };
  const server = createAppServer({ stateStore: store, staticDir: process.cwd(), whatsappManager });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/api/whatsapp/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '(11) 99999-9999' }),
    });
    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.equal(payload.code, 'WHATSAPP_PAIRING_FAILED');
    assert.equal(payload.status, 'error');
    assert.match(payload.error, /recusou o pareamento/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('WhatsApp QR API starts a fresh pairing session and returns its QR state', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-wa-qr-'));
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: fixture() });
  let starts = 0;
  const whatsappManager = {
    getStatus: () => ({ status: 'disconnected', qrDataUrl: null, pairingCode: null, account: null, error: null }),
    startQrPairing: async () => {
      starts += 1;
      return { status: 'qr', qrDataUrl: 'data:image/png;base64,QR', pairingCode: null, account: null, error: null };
    },
  };
  const server = createAppServer({ stateStore: store, staticDir: process.cwd(), whatsappManager });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/api/whatsapp/qr`, { method: 'POST' });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(starts, 1);
    assert.equal(payload.status, 'qr');
    assert.match(payload.qrDataUrl, /^data:image\/png/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('WhatsApp connect API returns the real manager error instead of a generic 400', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-wa-connect-error-'));
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: fixture() });
  const whatsappManager = {
    getStatus: () => ({
      status: 'error',
      qrDataUrl: null,
      pairingCode: null,
      account: null,
      error: 'A conexão com o WhatsApp ainda não estava pronta para gerar o código (428).',
      errorCode: 428,
    }),
    connect: async () => {
      const error = new Error('Connection Closed');
      error.output = { statusCode: 428 };
      throw error;
    },
  };
  const server = createAppServer({ stateStore: store, staticDir: process.cwd(), whatsappManager });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/api/whatsapp/connect`, { method: 'POST' });
    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.equal(payload.code, 'WHATSAPP_CONNECTION_FAILED');
    assert.equal(payload.errorCode, 428);
    assert.match(payload.error, /428/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('payment API exposes local Pix status and no longer exposes Asaas webhook', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-local-pix-api-'));
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: fixture() });
  const paymentService = {
    getStatus: () => ({ provider: 'pix-local', environment: 'local', configured: true }),
  };
  const server = createAppServer({ stateStore: store, staticDir: process.cwd(), paymentService });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(`${baseUrl}/api/payments/status`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { provider: 'pix-local', environment: 'local', configured: true });

    response = await fetch(`${baseUrl}/api/webhooks/asaas`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('order lifecycle endpoint advances with expectedStatus and returns the updated order', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-step6-api-'));
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: fixture() });
  const calls = [];
  const orderLifecycleService = {
    advanceOrder: async (input) => {
      calls.push(input);
      return { changed: true, stale: false, order: { id: input.orderId, status: 'PACKING' } };
    },
  };
  const server = createAppServer({ stateStore: store, staticDir: process.cwd(), orderLifecycleService });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/api/orders/PS-1001/advance`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedStatus: 'PAID' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(calls, [{ orderId: 'PS-1001', expectedStatus: 'PAID' }]);
    assert.equal((await response.json()).order.status, 'PACKING');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('monthly report API returns real report JSON and CSV export', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-step7-api-'));
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: fixture() });
  const calls = [];
  const reportService = {
    getMonthlyReport: (month) => { calls.push(['json', month]); return { month, revenue: 150, orderCount: 2, averageTicket: 75, accountCount: 1, accounts: [], daily: [], orders: [] }; },
    exportMonthlyCsv: (month) => { calls.push(['csv', month]); return '\uFEFFPedido;Total\r\nPS-1;100,00'; },
  };
  const server = createAppServer({ stateStore: store, staticDir: process.cwd(), reportService });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(`${baseUrl}/api/reports/monthly?month=2026-09`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).revenue, 150);

    response = await fetch(`${baseUrl}/api/reports/monthly.csv?month=2026-09`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/csv/);
    assert.match(response.headers.get('content-disposition'), /prismastore-2026-09\.csv/);
    assert.match(await response.text(), /PS-1;100,00/);
    assert.deepEqual(calls, [['json', '2026-09'], ['csv', '2026-09']]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});


test('debug report API returns recent sanitized terminal logs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-debug-report-'));
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: fixture() });
  const runtimeLogProvider = {
    getRecent: () => [{ at: '2026-09-18T03:00:00.000Z', level: 'erro', message: 'Falha de teste' }],
    record: () => {},
  };
  const server = createAppServer({
    stateStore: store,
    staticDir: process.cwd(),
    runtimeLogProvider,
    appVersion: '0.9.2',
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/api/debug-report`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.appVersion, '0.9.2');
    assert.equal(payload.logs[0].message, 'Falha de teste');
    assert.equal(typeof payload.uptimeSeconds, 'number');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
