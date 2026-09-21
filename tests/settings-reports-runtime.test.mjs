import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { createReportService } from '../server/report-service.js';
import { createAppServer } from '../server/app-server.js';
import { DEFAULT_CHATBOT_MESSAGES } from '../server/chatbot-messages.js';

function seedState() {
  return {
    products: [{ id: 'p1', name: 'Produto real', price: 100, stock: 5, active: true }],
    customers: [],
    orders: [
      {
        id: 'PS-RUNTIME-1',
        customerName: 'Cliente Teste',
        phone: '5511999999999',
        deliveryType: 'shipping',
        status: 'DELIVERED',
        total: 150,
        paidAt: '2026-09-10T15:00:00.000Z',
        receivingAccountId: 'pix-local',
      },
      {
        id: 'PS-RUNTIME-2',
        customerName: 'Cliente Teste 2',
        phone: '5511888888888',
        deliveryType: 'local_delivery',
        status: 'PAID',
        total: 50,
        paidAt: '2026-09-11T16:00:00.000Z',
        receivingAccountId: 'pix-local',
      },
    ],
    settings: { chatbotMessages: { ...DEFAULT_CHATBOT_MESSAGES } },
  };
}

test('settings persist in the real SQLite store across close and reopen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-settings-runtime-'));
  const dbPath = join(dir, 'prismastore.db');
  try {
    let store = createStateStore({ dbPath, seedState: seedState() });
    const state = store.load();
    state.settings.chatbotMessages.welcome = 'Mensagem persistida de teste';
    store.save(state);
    store.close();

    store = createStateStore({ dbPath, seedState: seedState() });
    const reopened = store.load();
    assert.equal(reopened.settings.chatbotMessages.welcome, 'Mensagem persistida de teste');
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('settings and reports work together through the real HTTP server and SQLite data', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-runtime-http-'));
  const dbPath = join(dir, 'prismastore.db');
  const store = createStateStore({ dbPath, seedState: seedState() });
  const reportService = createReportService({
    stateStore: store,
    receivingAccounts: [{ id: 'pix-local', name: 'Pix Oscar' }],
  });
  const paymentService = {
    getStatus: () => ({ provider: 'pix-local', environment: 'local', configured: true }),
  };
  const whatsappManager = {
    getStatus: () => ({ status: 'disconnected', qrDataUrl: null, pairingCode: null, account: null, error: null, errorCode: null }),
  };
  const backupService = {
    listBackups: () => [],
    getExternalStatus: () => ({ enabled: false }),
    getScheduleStatus: () => ({ enabled: false, running: false }),
  };

  const server = createAppServer({
    stateStore: store,
    staticDir: process.cwd(),
    reportService,
    paymentService,
    whatsappManager,
    backupService,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    let response = await fetch(`${baseUrl}/api/state`);
    assert.equal(response.status, 200);
    const state = await response.json();
    state.settings.chatbotMessages.paymentConfirmed = 'Pagamento confirmado no runtime';
    response = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state),
    });
    assert.equal(response.status, 200);

    response = await fetch(`${baseUrl}/api/payments/status`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).configured, true);

    response = await fetch(`${baseUrl}/api/backups`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).backups, []);

    response = await fetch(`${baseUrl}/api/whatsapp/status`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'disconnected');

    response = await fetch(`${baseUrl}/api/reports/monthly?month=2026-09`);
    assert.equal(response.status, 200);
    const report = await response.json();
    assert.equal(report.revenue, 200);
    assert.equal(report.orderCount, 2);
    assert.equal(report.averageTicket, 100);
    assert.equal(report.accounts[0].name, 'Pix Oscar');

    response = await fetch(`${baseUrl}/api/reports/monthly.csv?month=2026-09`);
    assert.equal(response.status, 200);
    const csv = await response.text();
    assert.match(csv, /PS-RUNTIME-1/);
    assert.match(csv, /Pix Oscar/);

    response = await fetch(`${baseUrl}/api/state`);
    const persisted = await response.json();
    assert.equal(persisted.settings.chatbotMessages.paymentConfirmed, 'Pagamento confirmado no runtime');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
