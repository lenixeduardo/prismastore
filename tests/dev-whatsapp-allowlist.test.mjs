import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhatsAppManager } from '../server/whatsapp-manager.js';

const ALLOWED_LOCAL = '11987654321';
const ALLOWED_JID = '5511987654321@s.whatsapp.net';
const OTHER_JID = '5511999999999@s.whatsapp.net';

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
    async sendMessage(jid, payload) { sent.push({ jid, payload }); },
    async end() {},
  };
}

function harness() {
  const socket = createSocket();
  const handled = [];
  const manager = createWhatsAppManager({
    socketFactory: async () => socket,
    authStateLoader: async () => ({ state: { creds: {} }, saveCreds: async () => {} }),
    qrEncoder: async (value) => value,
    messageHandler: async ({ message }) => handled.push(message.key.remoteJid),
    disconnectReasonLoggedOut: 401,
    devAllowedPhone: ALLOWED_LOCAL,
  });
  return { manager, socket, handled };
}

const msg = (jid, id) => ({
  key: { remoteJid: jid, id, fromMe: false },
  message: { conversation: 'oi' },
});

test('dev mode accepts inbound only from configured phone', async () => {
  const { manager, socket, handled } = harness();
  await manager.connect();

  await socket.ev.emit('messages.upsert', {
    type: 'notify',
    messages: [msg(ALLOWED_JID, 'SELF-TEST'), msg(OTHER_JID, 'OTHER')],
  });

  assert.deepEqual(handled, [ALLOWED_JID]);
});

test('dev mode blocks outbound messages to any other phone', async () => {
  const { manager, socket } = harness();
  await manager.connect();
  await socket.ev.emit('connection.update', { connection: 'open' });

  await manager.sendText(ALLOWED_LOCAL, 'permitido');
  await manager.sendMedia(ALLOWED_JID, '/tmp/ok.png');
  await assert.rejects(() => manager.sendText('11999999999', 'bloqueado'), /Modo DEV/);
  await assert.rejects(() => manager.sendMedia(OTHER_JID, '/tmp/no.png'), /Modo DEV/);

  assert.equal(socket.sent.length, 2);
  assert.ok(socket.sent.every(({ jid }) => jid === ALLOWED_JID));
});
