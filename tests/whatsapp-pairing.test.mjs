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
    emit(event, payload) { handlers.get(event)?.(payload); },
    pairingRequests: [],
    async requestPairingCode(phone) {
      this.pairingRequests.push(phone);
      return 'ABCD-1234';
    },
    async sendMessage() {},
    async end() {},
  };
}

test('WhatsApp manager waits for socket readiness before requesting pairing code', async () => {
  const socket = fakeSocket();
  const manager = createWhatsAppManager({
    socketFactory: async () => socket,
    authStateLoader: async () => ({ state: { creds: { registered: false } }, saveCreds: async () => {} }),
    qrEncoder: async () => 'data:image/png;base64,qr',
    disconnectReasonLoggedOut: 401,
    pairingReadyTimeoutMs: 1000,
  });

  const pairing = manager.requestPairingCode('(11) 99999-9999');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(socket.pairingRequests, []);

  socket.emit('connection.update', { qr: 'QR_PAYLOAD' });
  const result = await pairing;

  assert.deepEqual(socket.pairingRequests, ['5511999999999']);
  assert.equal(result.status, 'pairing');
  assert.equal(result.pairingCode, 'ABCD-1234');
});

test('WhatsApp manager coalesces duplicate pairing requests', async () => {
  const socket = fakeSocket();
  const manager = createWhatsAppManager({
    socketFactory: async () => socket,
    authStateLoader: async () => ({ state: { creds: { registered: false } }, saveCreds: async () => {} }),
    qrEncoder: async () => 'data:image/png;base64,qr',
    disconnectReasonLoggedOut: 401,
    pairingReadyTimeoutMs: 1000,
  });

  const first = manager.requestPairingCode('(11) 99999-9999');
  const second = manager.requestPairingCode('(11) 99999-9999');
  await new Promise((resolve) => setTimeout(resolve, 0));
  socket.emit('connection.update', { qr: 'QR_PAYLOAD' });

  const [a, b] = await Promise.all([first, second]);
  assert.equal(socket.pairingRequests.length, 1);
  assert.equal(a.pairingCode, 'ABCD-1234');
  assert.equal(b.pairingCode, 'ABCD-1234');
});

test('WhatsApp manager exposes rate limit and does not loop reconnect while pairing', async () => {
  const socket = fakeSocket();
  socket.requestPairingCode = async () => {
    const error = new Error('rate-overlimit');
    error.output = { statusCode: 429 };
    throw error;
  };
  const scheduled = [];
  const manager = createWhatsAppManager({
    socketFactory: async () => socket,
    authStateLoader: async () => ({ state: { creds: { registered: false } }, saveCreds: async () => {} }),
    qrEncoder: async () => 'data:image/png;base64,qr',
    disconnectReasonLoggedOut: 401,
    pairingReadyTimeoutMs: 1000,
    schedule: (fn, ms) => { scheduled.push({ fn, ms }); return scheduled.length; },
    clearSchedule: () => {},
  });

  const pairing = manager.requestPairingCode('(11) 99999-9999');
  await new Promise((resolve) => setTimeout(resolve, 0));
  socket.emit('connection.update', { qr: 'QR_PAYLOAD' });

  await assert.rejects(pairing, /limitou novas tentativas/i);
  assert.equal(manager.getStatus().errorCode, 429);
  assert.equal(scheduled.length, 0);
});

test('WhatsApp manager rejects an invalid pairing phone before creating a socket', async () => {
  let sockets = 0;
  const manager = createWhatsAppManager({
    socketFactory: async () => { sockets += 1; return fakeSocket(); },
    authStateLoader: async () => ({ state: { creds: { registered: false } }, saveCreds: async () => {} }),
    qrEncoder: async () => 'qr',
    disconnectReasonLoggedOut: 401,
  });

  await assert.rejects(() => manager.requestPairingCode('123'), /telefone/i);
  assert.equal(sockets, 0);
});

test('pairing recovers once from stale 401 credentials using a clean auth state', async () => {
  const stale = fakeSocket();
  const fresh = fakeSocket();
  let sockets = 0;
  let resets = 0;

  stale.requestPairingCode = async () => {
    const error = new Error('logged out');
    error.output = { statusCode: 401 };
    throw error;
  };

  const manager = createWhatsAppManager({
    socketFactory: async () => (++sockets === 1 ? stale : fresh),
    authStateLoader: async () => ({ state: { creds: { registered: sockets > 0 } }, saveCreds: async () => {} }),
    qrEncoder: async () => 'data:image/png;base64,qr',
    disconnectReasonLoggedOut: 401,
    pairingReadyTimeoutMs: 1000,
    resetAuthState: async () => { resets += 1; },
  });

  const resultPromise = manager.requestPairingCode('(11) 99999-9999');
  await new Promise((resolve) => setTimeout(resolve, 0));
  stale.emit('connection.update', { qr: 'STALE_QR' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  fresh.emit('connection.update', { qr: 'FRESH_QR' });

  const result = await resultPromise;
  assert.equal(resets, 1);
  assert.equal(sockets, 2);
  assert.equal(result.status, 'pairing');
  assert.equal(result.pairingCode, 'ABCD-1234');
});
