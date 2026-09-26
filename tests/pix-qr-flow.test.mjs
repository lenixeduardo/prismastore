import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { createChatbotEngine } from '../server/chatbot.js';
import { createPaymentChatbot } from '../server/payment-chatbot.js';
import { createPaymentService } from '../server/payment-service.js';
import { createWhatsAppChatAdapter } from '../server/whatsapp-chat-adapter.js';

function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-pix-qr-'));
  const store = createStateStore({
    dbPath: join(dir, 'db.sqlite'),
    seedState: {
      products: [{ id: 'p1', name: 'Produto A', category: 'Teste', price: 10, stock: 3, reserved: 0, active: true }],
      customers: [],
      orders: [],
    },
  });
  const paymentService = createPaymentService({
    stateStore: store,
    pixConfig: {
      key: '2d03d745-5b05-4829-833d-60e4a210a664',
      recipientName: 'OSCAR FILIPE SILVA DOS SANTOS',
      recipientCity: 'SAO PAULO',
      accountId: 'pix-local',
    },
    qrEncoder: async (payload) => Buffer.from(`QR:${payload.slice(0, 12)}`).toString('base64'),
    now: () => new Date('2026-09-14T12:00:00Z'),
  });
  const chatbot = createPaymentChatbot({
    baseChatbot: createChatbotEngine({ stateStore: store, now: () => new Date('2026-09-14T12:00:00Z') }),
    stateStore: store,
    paymentService,
  });
  const sent = [];
  const adapter = createWhatsAppChatAdapter({ chatbot });
  const socket = {
    sendMessage: async (jid, payload) => sent.push({ jid, payload }),
  };
  const incoming = async (text, id = `M${sent.length + 1}`) => adapter.handleMessage({
    message: {
      key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id },
      pushName: 'Cliente Teste',
      message: { conversation: text },
    },
    socket,
  });
  return {
    store,
    sent,
    incoming,
    close: () => { store.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}

test('fluxo WhatsApp Baileys chega até a tela de pagamento com QR Code Pix', async () => {
  const h = harness();
  try {
    await h.incoming('oi');
    await h.incoming('1');
    await h.incoming('1');
    await h.incoming('2');
    await h.incoming('2');
    await h.incoming('Rua Teste, 123 - São Paulo/SP - 01000-000');
    const result = await h.incoming('1');

    const order = h.store.load().orders[0];
    assert.equal(result.step, 'awaiting_payment');
    assert.equal(result.paymentId, 'local:PS-1001');
    assert.equal(h.store.getChatSession('5511999999999').step, 'awaiting_payment');
    assert.equal(order.status, 'PAYMENT_PENDING');
    assert.equal(order.items[0].name, 'Produto A');
    assert.equal(order.items[0].quantity, 1);
    assert.equal(order.items[0].unitPrice, 10);
    assert.equal(order.total, 10);
    assert.equal(order.deliveryFee, 0);

    const qr = h.sent.find((item) => item.payload?.image && item.payload?.fileName?.startsWith('pix-'));
    const copyPaste = h.sent.find((item) => String(item.payload?.text || '').includes('Pix Copia e Cola'));
    assert.ok(qr, 'QR Code Pix não foi enviado');
    assert.match(Buffer.from(qr.payload.image).toString('utf8'), /^QR:000201/);
    assert.match(copyPaste.payload.text, /^000201/m);
    assert.match(copyPaste.payload.text, /540510\.00/);
    assert.match(order.pixPayload, /540510\.00/);
    assert.equal(qr.jid, '5511999999999@s.whatsapp.net');
  } finally { h.close(); }
});
