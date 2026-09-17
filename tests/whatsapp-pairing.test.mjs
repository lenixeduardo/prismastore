import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhatsAppManager } from '../server/whatsapp-manager.js';

function fakeSocket() {
  const handlers = new Map();
  return {
    user: null,
    ev: {
      on(event, handler) { handlers.set(event, handler); },
    },
    pairingRequests: [],
    async requestPairingCode(phone) {
      this.pairingRequests.push(phone);
      return 'ABCD-1234';
    },
    async sendMessage() {},
    async end() {},
  };
}

test('WhatsApp manager requests a pairing code using normalized Brazilian phone number', async () => {
  const socket = fakeSocket();
  const manager = createWhatsAppManager({
    socketFactory: async () => socket,
    authStateLoader: async () => ({ state: { creds: { registered: false } }, saveCreds: async () => {} }),
    qrEncoder: async () => 'data:image/png;base64,qr',
    disconnectReasonLoggedOut: 401,
  });

  await manager.connect();
  const result = await manager.requestPairingCode('(11) 99999-9999');

  assert.deepEqual(socket.pairingRequests, ['5511999999999']);
  assert.equal(result.status, 'pairing');
  assert.equal(result.pairingCode, 'ABCD-1234');
  assert.equal(manager.getStatus().pairingCode, 'ABCD-1234');
});

test('WhatsApp manager rejects an invalid pairing phone', async () => {
  const socket = fakeSocket();
  const manager = createWhatsAppManager({
    socketFactory: async () => socket,
    authStateLoader: async () => ({ state: { creds: { registered: false } }, saveCreds: async () => {} }),
    qrEncoder: async () => 'qr',
    disconnectReasonLoggedOut: 401,
  });

  await assert.rejects(() => manager.requestPairingCode('123'), /telefone/i);
});
