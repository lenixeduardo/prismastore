import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhatsAppChatAdapter } from '../server/whatsapp-chat-adapter.js';

test('binds every reply to inbound Baileys remoteJid', async () => {
  const sent = [];
  const socket = { sendMessage: async (jid, payload) => sent.push({ jid, payload }) };
  const chatbot = { handleIncoming: async ({ chatId, text, contactName, sendText, sendMedia }) => {
    assert.equal(chatId, '5511999990000@s.whatsapp.net');
    assert.equal(text, 'oi');
    assert.equal(contactName, 'Cliente A');
    await sendText('resposta');
    await sendMedia('/tmp/catalog.png');
    return { handled: true };
  } };
  const adapter = createWhatsAppChatAdapter({ chatbot });
  await adapter.handleMessage({ message: {
    key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe: false, id: 'A1' },
    pushName: 'Cliente A', message: { conversation: 'oi' },
  }, socket });
  assert.deepEqual(sent, [
    { jid: '5511999990000@s.whatsapp.net', payload: { text: 'resposta' } },
    { jid: '5511999990000@s.whatsapp.net', payload: { image: { url: '/tmp/catalog.png' } } },
  ]);
});

test('rejects group status own and unsupported content', async () => {
  let calls = 0;
  const adapter = createWhatsAppChatAdapter({ chatbot: { handleIncoming: async () => { calls += 1; } } });
  const socket = { sendMessage: async () => {} };
  const cases = [
    { key: { remoteJid: '1203630@g.us', fromMe: false }, message: { conversation: 'oi' } },
    { key: { remoteJid: 'status@broadcast', fromMe: false }, message: { conversation: 'oi' } },
    { key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe: true }, message: { conversation: 'oi' } },
    { key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe: false }, message: { imageMessage: {} } },
  ];
  for (const message of cases) await adapter.handleMessage({ message, socket });
  assert.equal(calls, 0);
});

test('routes receipt images through OCR and forwards only extracted text and fingerprint', async () => {
  const imageBuffer = Buffer.from('receipt-image');
  let incoming = null;
  const chatbot = { handleIncoming: async (args) => { incoming = args; return { handled: true }; } };
  const receiptOcr = {
    extractText: async (buffer) => {
      assert.deepEqual(buffer, imageBuffer);
      return 'Valor R$ 20,00\nDestinatário PRISMA STORE\n16/09/2026 17:05:00';
    },
  };
  const adapter = createWhatsAppChatAdapter({
    chatbot,
    receiptOcr,
    downloadMedia: async () => imageBuffer,
  });
  const socket = { sendMessage: async () => {} };

  const result = await adapter.handleMessage({
    message: {
      key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe: false, id: 'PIX1' },
      message: { imageMessage: { mimetype: 'image/jpeg' } },
    },
    socket,
  });

  assert.equal(result.handled, true);
  assert.equal(incoming.text, '');
  assert.match(incoming.receiptText, /R\$ 20,00/);
  assert.match(incoming.receiptFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(incoming, 'imageBuffer'), false);
});

test('unwraps ephemeral and view-once text so the catalog flow can start', async () => {
  const incoming = [];
  const adapter = createWhatsAppChatAdapter({
    chatbot: { handleIncoming: async (args) => { incoming.push(args); return { handled: true }; } },
  });
  const socket = { sendMessage: async () => {} };
  await adapter.handleMessage({
    message: {
      key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe: false, id: 'E1' },
      message: { ephemeralMessage: { message: { conversation: 'Oi' } } },
    },
    socket,
  });
  await adapter.handleMessage({
    message: {
      key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe: false, id: 'E2' },
      message: { viewOnceMessageV2: { message: { extendedTextMessage: { text: '1' } } } },
    },
    socket,
  });
  assert.equal(incoming[0].text, 'Oi');
  assert.equal(incoming[1].text, '1');
});

test('supports extended text and Base64 Pix media', async () => {
  const sent = [];
  const socket = { sendMessage: async (jid, payload) => sent.push({ jid, payload }) };
  const chatbot = { handleIncoming: async ({ text, sendMedia }) => {
    assert.equal(text, 'texto estendido');
    return sendMedia({ mimeType: 'image/png', base64: 'aGVsbG8=', filename: 'pix.png' });
  } };
  const adapter = createWhatsAppChatAdapter({ chatbot });
  await adapter.handleMessage({ message: {
    key: { remoteJid: '123456789@lid', fromMe: false, id: 'L1' },
    message: { extendedTextMessage: { text: 'texto estendido' } },
  }, socket });
  assert.equal(sent[0].jid, '123456789@lid');
  assert.deepEqual(sent[0].payload, {
    image: Buffer.from('aGVsbG8=', 'base64'), mimetype: 'image/png', fileName: 'pix.png',
  });
});
