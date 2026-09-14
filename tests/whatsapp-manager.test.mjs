import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createWhatsAppManager } from '../server/whatsapp-manager.js';

class FakeClient extends EventEmitter {
  constructor() {
    super();
    this.initializeCalls = 0;
    this.destroyCalls = 0;
    this.info = null;
  }
  async initialize() { this.initializeCalls += 1; }
  async destroy() { this.destroyCalls += 1; }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('turns a whatsapp qr event into browser-renderable status data', async () => {
  const client = new FakeClient();
  const manager = createWhatsAppManager({
    clientFactory: () => client,
    qrEncoder: async (value) => `data:image/png;base64,${value}`,
  });

  await manager.connect();
  assert.equal(manager.getStatus().status, 'connecting');
  client.emit('qr', 'QR123');
  await flush();

  assert.deepEqual(manager.getStatus(), {
    status: 'qr',
    qrDataUrl: 'data:image/png;base64,QR123',
    account: null,
    error: null,
  });
});

test('marks the session connected and exposes account metadata on ready', async () => {
  const client = new FakeClient();
  const manager = createWhatsAppManager({ clientFactory: () => client, qrEncoder: async () => null });
  await manager.connect();
  client.info = { pushname: 'Prisma Store', wid: { user: '5511999999999' } };
  client.emit('ready');

  assert.deepEqual(manager.getStatus(), {
    status: 'connected',
    qrDataUrl: null,
    account: { name: 'Prisma Store', number: '5511999999999' },
    error: null,
  });
});

test('disconnect destroys the runtime client without deleting LocalAuth session files', async () => {
  const client = new FakeClient();
  let factoryCalls = 0;
  const manager = createWhatsAppManager({
    clientFactory: () => { factoryCalls += 1; return client; },
    qrEncoder: async () => null,
  });

  await manager.connect();
  await manager.disconnect();

  assert.equal(client.destroyCalls, 1);
  assert.equal(factoryCalls, 1);
  assert.equal(manager.getStatus().status, 'disconnected');
});

test('delegates incoming WhatsApp messages to the configured message handler', async () => {
  const client = new FakeClient();
  const received = [];
  const manager = createWhatsAppManager({
    clientFactory: () => client,
    qrEncoder: async () => null,
    messageHandler: async ({ message, activeClient }) => received.push({ message, activeClient }),
  });
  await manager.connect();
  const message = { from: '5511999999999@c.us', body: 'Oi' };
  client.emit('message', message);
  await flush();
  assert.equal(received.length, 1);
  assert.equal(received[0].message, message);
  assert.equal(received[0].activeClient, client);
});

test('sendText uses the connected WhatsApp client and normalizes a phone number', async () => {
  const listeners = new Map();
  const sent = [];
  const client = {
    info: { pushname: 'Prisma', wid: { user: '5511000000000' } },
    on: (event, handler) => listeners.set(event, handler),
    initialize: async () => {},
    destroy: async () => {},
    sendMessage: async (to, text) => sent.push({ to, text }),
  };
  const manager = createWhatsAppManager({ clientFactory: () => client, qrEncoder: async () => 'data:image/png;base64,QR' });
  await manager.connect();
  listeners.get('ready')();
  await manager.sendText('+55 (11) 99999-9999', 'Pagamento confirmado');
  assert.deepEqual(sent, [{ to: '5511999999999@c.us', text: 'Pagamento confirmado' }]);
});

test('sendMedia uses MessageMedia factory and sends a local file to the connected phone', async () => {
  const listeners = new Map();
  const sent = [];
  const client = {
    info: { pushname: 'Prisma', wid: { user: '5511000000000' } },
    on: (event, handler) => listeners.set(event, handler),
    initialize: async () => {},
    destroy: async () => {},
    sendMessage: async (to, media) => sent.push({ to, media }),
  };
  const manager = createWhatsAppManager({
    clientFactory: () => client,
    qrEncoder: async () => null,
    mediaFactory: { fromFilePath: (filePath) => ({ kind: 'media', filePath }) },
  });
  await manager.connect();
  listeners.get('ready')();
  await manager.sendMedia('+55 (11) 99999-9999', '/tmp/final.png');
  assert.deepEqual(sent, [{ to: '5511999999999@c.us', media: { kind: 'media', filePath: '/tmp/final.png' } }]);
});
