import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhatsAppChatAdapter } from '../server/whatsapp-chat-adapter.js';

test('adapts a real WhatsApp message into chatbot sendText/sendMedia functions', async () => {
  const sent = [];
  const activeClient = { sendMessage: async (to, payload) => sent.push({ to, payload }) };
  const mediaFactory = { fromFilePath: (path) => ({ mediaPath: path }) };
  const calls = [];
  const chatbot = { handleIncoming: async (input) => { calls.push(input); await input.sendText('Olá'); await input.sendMedia('/assets/welcome.png'); } };
  const adapter = createWhatsAppChatAdapter({ chatbot, mediaFactory });
  const message = { from: '5511999999999@c.us', body: 'Oi', fromMe: false, getContact: async () => ({ pushname: 'Eduardo' }) };
  await adapter({ message, activeClient });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].chatId, message.from);
  assert.equal(calls[0].text, 'Oi');
  assert.equal(calls[0].contactName, 'Eduardo');
  assert.deepEqual(sent, [
    { to: message.from, payload: 'Olá' },
    { to: message.from, payload: { mediaPath: '/assets/welcome.png' } },
  ]);
});

test('ignores messages sent by the connected account itself', async () => {
  let calls = 0;
  const adapter = createWhatsAppChatAdapter({ chatbot: { handleIncoming: async () => { calls += 1; } }, mediaFactory: { fromFilePath: () => ({}) } });
  await adapter({ message: { from: '5511999999999@c.us', body: 'Oi', fromMe: true }, activeClient: { sendMessage: async () => {} } });
  assert.equal(calls, 0);
});
