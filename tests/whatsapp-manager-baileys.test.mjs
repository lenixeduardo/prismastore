import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhatsAppManager } from '../server/whatsapp-manager.js';

function createEventBus() {
  const handlers = new Map();
  return {
    on(event, handler) { handlers.set(event, handler); },
    async emit(event, payload) { return handlers.get(event)?.(payload); },
  };
}

function createSocket() {
  const ev = createEventBus();
  const sent = [];
  return {
    ev,
    sent,
    user: { id: '5511000000000@s.whatsapp.net', name: 'Prisma Store' },
    pairingRequests: [],
    async requestPairingCode(phone) { this.pairingRequests.push(phone); return 'ABCD-1234'; },
    async sendMessage(jid, payload) { sent.push({ jid, payload }); },
    async end() { this.endCalls = (this.endCalls || 0) + 1; },
  };
}

function harness(overrides = {}) {
  const socket = createSocket();
  const handled = [];
  const scheduled = [];
  const manager = createWhatsAppManager({
    socketFactory: async () => socket,
    authStateLoader: async () => ({ state: { creds: {} }, saveCreds: async () => {} }),
    qrEncoder: async (value) => `data:image/png;base64,${value}`,
    messageHandler: async ({ message, socket: activeSocket }) => handled.push({ message, socket: activeSocket }),
    disconnectReasonLoggedOut: 401,
    schedule: (fn, ms) => { const token = { fn, ms }; scheduled.push(token); return token; },
    clearSchedule: (token) => { const index = scheduled.indexOf(token); if (index >= 0) scheduled.splice(index, 1); },
    ...overrides,
  });
  return { manager, socket, handled, scheduled };
}

const msg = (jid, id, text = 'oi', fromMe = false) => ({
  key: { remoteJid: jid, id, fromMe },
  message: text === null ? null : { conversation: text },
});

test('processes notify once, ignores duplicate and append history', async () => {
  const { manager, socket, handled } = harness();
  await manager.connect();
  await socket.ev.emit('messages.upsert', { type: 'notify', messages: [msg('5511111111111@s.whatsapp.net', 'A')] });
  await socket.ev.emit('messages.upsert', { type: 'notify', messages: [msg('5511111111111@s.whatsapp.net', 'A')] });
  await socket.ev.emit('messages.upsert', { type: 'append', messages: [msg('5511111111111@s.whatsapp.net', 'B')] });
  assert.equal(handled.length, 1);
});

test('filters own group status and missing-content events before handler', async () => {
  const { manager, socket, handled } = harness();
  await manager.connect();
  await socket.ev.emit('messages.upsert', { type: 'notify', messages: [
    msg('5511111111111@s.whatsapp.net', 'SELF', 'oi', true),
    msg('1203630@g.us', 'GROUP'),
    msg('status@broadcast', 'STATUS'),
    msg('5511111111111@s.whatsapp.net', 'EMPTY', null),
  ] });
  assert.equal(handled.length, 0);
});

test('handles two inbound contacts independently', async () => {
  const { manager, socket, handled } = harness();
  await manager.connect();
  const a = msg('5511111111111@s.whatsapp.net', 'A');
  const b = msg('5522222222222@s.whatsapp.net', 'B');
  await socket.ev.emit('messages.upsert', { type: 'notify', messages: [a, b] });
  assert.deepEqual(handled.map(({ message }) => message.key.remoteJid), [a.key.remoteJid, b.key.remoteJid]);
  assert.ok(handled.every(({ socket: activeSocket }) => activeSocket === socket));
});

test('maps qr and open connection state', async () => {
  const { manager, socket } = harness();
  await manager.connect();
  await socket.ev.emit('connection.update', { qr: 'QR123' });
  assert.equal(manager.getStatus().status, 'qr');
  assert.equal(manager.getStatus().qrDataUrl, 'data:image/png;base64,QR123');
  await socket.ev.emit('connection.update', { connection: 'open' });
  assert.deepEqual(manager.getStatus().account, { name: 'Prisma Store', number: '5511000000000' });
  assert.equal(manager.getStatus().status, 'connected');
});

test('concurrent connect calls create only one Baileys socket', async () => {
  let authLoads = 0;
  let socketCreates = 0;
  let releaseAuth;
  const authGate = new Promise((resolve) => { releaseAuth = resolve; });
  const socket = createSocket();
  const manager = createWhatsAppManager({
    authStateLoader: async () => {
      authLoads += 1;
      await authGate;
      return { state: { creds: {} }, saveCreds: async () => {} };
    },
    socketFactory: async () => {
      socketCreates += 1;
      return socket;
    },
    qrEncoder: async (value) => value,
    disconnectReasonLoggedOut: 401,
  });

  const first = manager.connect();
  const second = manager.connect();
  releaseAuth();
  await Promise.all([first, second]);

  assert.equal(authLoads, 1);
  assert.equal(socketCreates, 1);
});

test('connect failure exposes error state and a later retry is allowed', async () => {
  let attempts = 0;
  const socket = createSocket();
  const manager = createWhatsAppManager({
    authStateLoader: async () => ({ state: { creds: {} }, saveCreds: async () => {} }),
    socketFactory: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('socket factory failed');
      return socket;
    },
    qrEncoder: async (value) => value,
    disconnectReasonLoggedOut: 401,
  });

  await assert.rejects(() => manager.connect(), /socket factory failed/);
  assert.equal(manager.getStatus().status, 'error');
  await manager.connect();
  assert.equal(attempts, 2);
});

test('logged out close does not reconnect and recoverable close schedules once', async () => {
  const loggedOut = harness();
  await loggedOut.manager.connect();
  await loggedOut.socket.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } });
  assert.equal(loggedOut.scheduled.length, 0);

  const recoverable = harness();
  await recoverable.manager.connect();
  await recoverable.socket.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 500 } } } });
  await recoverable.socket.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 500 } } } });
  assert.equal(recoverable.scheduled.length, 1);
  assert.equal(recoverable.scheduled[0].ms, 3000);
});

test('disconnect closes socket and send operations use Baileys jid payloads', async () => {
  const { manager, socket } = harness();
  await manager.connect();
  await socket.ev.emit('connection.update', { connection: 'open' });
  await manager.sendText('+55 (11) 99999-9999', 'Pagamento confirmado');
  await manager.sendMedia('5511999999999@s.whatsapp.net', '/tmp/final.png');
  await manager.sendMedia('123456789@lid', { mimeType: 'image/png', base64: 'aGVsbG8=', filename: 'pix.png' });
  assert.equal(socket.sent[0].jid, '5511999999999@s.whatsapp.net');
  assert.deepEqual(socket.sent[0].payload, { text: 'Pagamento confirmado' });
  assert.deepEqual(socket.sent[1].payload, { image: { url: '/tmp/final.png' } });
  assert.deepEqual(socket.sent[2].payload, { image: Buffer.from('aGVsbG8=', 'base64'), mimetype: 'image/png', fileName: 'pix.png' });
  await manager.disconnect();
  assert.equal(socket.endCalls, 1);
  assert.equal(manager.getStatus().status, 'disconnected');
});

test('send operations fail clearly while disconnected', async () => {
  const { manager } = harness();
  await assert.rejects(() => manager.sendText('5511999999999', 'oi'), /WhatsApp não conectado/);
  await assert.rejects(() => manager.sendMedia('5511999999999', '/tmp/a.png'), /WhatsApp não conectado/);
});


test('pairing waits for readiness and a generic close does not enter an automatic retry loop', async () => {
  const { manager, socket, scheduled } = harness({ pairingReadyTimeoutMs: 1000 });
  await manager.connect();
  const pairingPromise = manager.requestPairingCode('(11) 99999-9999');
  await socket.ev.emit('connection.update', { qr: 'QR-PAIR' });
  const pairing = await pairingPromise;
  assert.equal(pairing.status, 'pairing');
  assert.equal(pairing.pairingCode, 'ABCD-1234');

  await socket.ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: 500 } } },
  });

  assert.equal(manager.getStatus().status, 'error');
  assert.equal(manager.getStatus().pairingCode, null);
  assert.equal(manager.getStatus().errorCode, 500);
  assert.equal(scheduled.length, 0);
});

test('restart-required 515 after pairing schedules one controlled reconnect', async () => {
  const { manager, socket, scheduled } = harness({
    pairingReadyTimeoutMs: 1000,
    disconnectReasonRestartRequired: 515,
  });
  await manager.connect();
  const pairingPromise = manager.requestPairingCode('(11) 99999-9999');
  await socket.ev.emit('connection.update', { qr: 'QR-PAIR' });
  await pairingPromise;

  await socket.ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: 515 } } },
  });

  assert.equal(manager.getStatus().status, 'connecting');
  assert.equal(manager.getStatus().pairingCode, null);
  assert.equal(manager.getStatus().errorCode, 515);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].ms, 3000);
});
