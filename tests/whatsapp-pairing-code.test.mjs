import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWhatsAppManager } from '../server/whatsapp-manager.js';
import { createStateStore } from '../server/state-store.js';
import { createAppServer } from '../server/app-server.js';

function fakeSocket() {
  const emitter = new EventEmitter();
  const calls = [];
  return {
    ev: { on: emitter.on.bind(emitter) },
    calls,
    user: null,
    async requestPairingCode(phone) { calls.push(phone); return '1234-5678'; },
    async sendMessage() {},
    async end() {},
  };
}

test('WhatsApp manager normalizes Brazilian phone and requests Baileys pairing code', async () => {
  const socket = fakeSocket();
  const manager = createWhatsAppManager({
    socketFactory: async () => socket,
    authStateLoader: async () => ({ state: {}, saveCreds() {} }),
    qrEncoder: async () => 'data:image/png;base64,qr',
    disconnectReasonLoggedOut: 401,
  });
  const status = await manager.requestPairingCode('(11) 99999-0000');
  assert.deepEqual(socket.calls, ['5511999990000']);
  assert.equal(status.status, 'pairing');
  assert.equal(status.pairingCode, '1234-5678');
});

test('WhatsApp pairing rejects invalid phone numbers', async () => {
  const socket = fakeSocket();
  const manager = createWhatsAppManager({
    socketFactory: async () => socket,
    authStateLoader: async () => ({ state: {}, saveCreds() {} }),
    qrEncoder: async () => null,
    disconnectReasonLoggedOut: 401,
  });
  await assert.rejects(() => manager.requestPairingCode('123'), /número/i);
  assert.deepEqual(socket.calls, []);
});

test('admin API exposes POST /api/whatsapp/pairing-code', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-pairing-api-'));
  const stateStore = createStateStore({ dbPath: join(dir, 'db.sqlite'), seedState: { products: [], customers: [], orders: [] } });
  let received = null;
  const whatsappManager = {
    getStatus: () => ({ status: 'disconnected', qrDataUrl: null, pairingCode: null, account: null, error: null }),
    requestPairingCode: async (phone) => { received = phone; return { status: 'pairing', pairingCode: '87654321', qrDataUrl: null, account: null, error: null }; },
  };
  const server = createAppServer({ stateStore, staticDir: process.cwd(), whatsappManager });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/whatsapp/pairing-code`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: '5511999990000' }),
    });
    assert.equal(response.status, 200);
    assert.equal(received, '5511999990000');
    assert.equal((await response.json()).pairingCode, '87654321');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    stateStore.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('WhatsApp onboarding offers phone pairing, copy action and QR fallback', () => {
  const source = readFileSync(new URL('../src/whatsapp-onboarding.js', import.meta.url), 'utf8');
  assert.match(source, /pairing-code/);
  assert.match(source, /Número do WhatsApp/);
  assert.match(source, /Gerar código/);
  assert.match(source, /Copiar código/);
  assert.match(source, /Aparelhos conectados/);
  assert.match(source, /qrDataUrl/);
});
