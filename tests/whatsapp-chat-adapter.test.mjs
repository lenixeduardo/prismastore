import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhatsAppChatAdapter } from '../server/whatsapp-chat-adapter.js';

test('adapts a real WhatsApp message into chatbot sendText/sendMedia functions', async () => {
  const sent = [];
  const activeClient = { sendMessage: async (to, payload) => sent.push({ to, payload }) };
  const mediaFactory = { fromFilePath: (path) => ({ mediaPath: path }) };
  const calls = [];
  const chatbot = {
    handleIncoming: async (input) => {
      calls.push(input);
      await input.sendText('Olá');
      await input.sendMedia('/assets/welcome.png');
    },
  };
  const adapter = createWhatsAppChatAdapter({ chatbot, mediaFactory });
  const message = {
    from: '5511999999999@c.us',
    body: 'Oi',
    fromMe: false,
    getContact: async () => ({ pushname: 'Eduardo' }),
  };

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
  const adapter = createWhatsAppChatAdapter({
    chatbot: { handleIncoming: async () => { calls += 1; } },
    mediaFactory: { fromFilePath: () => ({}) },
  });
  await adapter({
    message: { from: '5511999999999@c.us', body: 'Oi', fromMe: true },
    activeClient: { sendMessage: async () => {} },
  });
  assert.equal(calls, 0);
});

test('ignores stale private messages replayed after the PrismaStore process starts', async () => {
  let calls = 0;
  const nowMs = Date.UTC(2026, 8, 14, 21, 0, 0);
  const adapter = createWhatsAppChatAdapter({
    chatbot: { handleIncoming: async () => { calls += 1; } },
    mediaFactory: { fromFilePath: () => ({}) },
    now: () => nowMs,
  });

  const result = await adapter({
    message: {
      from: '5511888888888@c.us',
      body: 'Mensagem antiga',
      fromMe: false,
      timestamp: Math.floor((nowMs - 60_000) / 1000),
      id: { _serialized: 'stale-message-1' },
    },
    activeClient: { sendMessage: async () => { throw new Error('não deveria enviar'); } },
  });

  assert.equal(calls, 0);
  assert.deepEqual(result, { handled: false, reason: 'stale-message' });
});

test('processes the same WhatsApp message id only once', async () => {
  let calls = 0;
  const nowMs = Date.UTC(2026, 8, 14, 21, 0, 0);
  const adapter = createWhatsAppChatAdapter({
    chatbot: { handleIncoming: async () => { calls += 1; return { handled: true }; } },
    mediaFactory: { fromFilePath: () => ({}) },
    now: () => nowMs,
  });
  const message = {
    from: '5511777777777@c.us',
    body: 'Oi',
    fromMe: false,
    timestamp: Math.floor(nowMs / 1000),
    id: { _serialized: 'same-message-1' },
  };
  const activeClient = { sendMessage: async () => {} };

  const first = await adapter({ message, activeClient });
  const second = await adapter({ message, activeClient });

  assert.equal(calls, 1);
  assert.deepEqual(first, { handled: true });
  assert.deepEqual(second, { handled: false, reason: 'duplicate-message' });
});

test('adapts in-memory base64 media such as Asaas Pix QR code', async () => {
  const sent = [];
  const activeClient = { sendMessage: async (to, payload) => sent.push({ to, payload }) };
  const mediaFactory = {
    fromFilePath: () => ({}),
    fromBase64: ({ mimeType, base64, filename }) => ({ mimeType, base64, filename }),
  };
  const chatbot = {
    handleIncoming: async (input) => input.sendMedia({ mimeType: 'image/png', base64: 'PNGDATA', filename: 'pix.png' }),
  };
  const adapter = createWhatsAppChatAdapter({ chatbot, mediaFactory });
  await adapter({ message: { from: '5511999999999@c.us', body: 'cpf', fromMe: false }, activeClient });
  assert.deepEqual(sent[0].payload, { mimeType: 'image/png', base64: 'PNGDATA', filename: 'pix.png' });
});
