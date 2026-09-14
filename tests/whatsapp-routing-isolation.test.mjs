import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhatsAppChatAdapter } from '../server/whatsapp-chat-adapter.js';
import { createWhatsAppManager } from '../server/whatsapp-manager.js';

function eventBus() {
  const handlers = new Map();
  return {
    on(event, handler) { handlers.set(event, handler); },
    async emit(event, payload) { return handlers.get(event)?.(payload); },
  };
}

function message(jid, id, text = 'oi') {
  return {
    key: { remoteJid: jid, id, fromMe: false },
    pushName: `Contato ${id}`,
    message: { conversation: text },
  };
}

test('end-to-end inbound routing never crosses replies between contacts', async () => {
  const ev = eventBus();
  const sent = [];
  const socket = {
    ev,
    user: { id: '5511000000000@s.whatsapp.net', name: 'Prisma Store' },
    async sendMessage(jid, payload) { sent.push({ jid, payload }); },
    async end() {},
  };

  const chatbot = {
    handleIncoming: async ({ chatId, sendText }) => {
      await sendText(`reply:${chatId}`);
      return { handled: true };
    },
  };
  const adapter = createWhatsAppChatAdapter({ chatbot });
  const manager = createWhatsAppManager({
    socketFactory: async () => socket,
    authStateLoader: async () => ({ state: { creds: {} }, saveCreds: async () => {} }),
    qrEncoder: async (value) => value,
    messageHandler: adapter.handleMessage,
    disconnectReasonLoggedOut: 401,
  });

  await manager.connect();
  await ev.emit('connection.update', { connection: 'open' });

  const a = '5511111111111@s.whatsapp.net';
  const b = '5522222222222@s.whatsapp.net';
  await ev.emit('messages.upsert', { type: 'notify', messages: [message(a, 'A'), message(b, 'B')] });

  assert.deepEqual(sent, [
    { jid: a, payload: { text: `reply:${a}` } },
    { jid: b, payload: { text: `reply:${b}` } },
  ]);

  await ev.emit('messages.upsert', { type: 'notify', messages: [message(a, 'A')] });
  await ev.emit('messages.upsert', { type: 'append', messages: [message('5533333333333@s.whatsapp.net', 'C')] });
  await ev.emit('messages.upsert', { type: 'notify', messages: [message('1203630@g.us', 'G'), message('status@broadcast', 'S')] });

  assert.equal(sent.length, 2);
});
