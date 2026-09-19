import test from 'node:test';
import assert from 'node:assert/strict';
import { createPaymentChatbot } from '../server/payment-chatbot.js';

function harness({ needsDocument = true } = {}) {
  const sessions = new Map();
  const sent = [];
  const media = [];
  const paymentCalls = [];
  sessions.set('5511999999999', { step: 'confirm', orderId: null, cart: { p1: 1 } });
  const stateStore = {
    getChatSession: (phone) => structuredClone(sessions.get(phone) ?? null),
    saveChatSession: (phone, session) => sessions.set(phone, structuredClone(session)),
  };
  const baseChatbot = {
    async handleIncoming(args) {
      if (String(args.text) === '1') {
        const session = sessions.get('5511999999999');
        sessions.set('5511999999999', { ...session, step: 'confirmed', orderId: 'PS-1001' });
        return { handled: true, step: 'confirmed', orderId: 'PS-1001' };
      }
      return { handled: true, step: sessions.get('5511999999999')?.step };
    },
  };
  const paymentService = {
    needsPayerDocument: () => needsDocument,
    async generatePixForOrder(input) {
      paymentCalls.push(input);
      return { paymentId: 'pay_1', encodedImage: 'BASE64PNG', payload: '000201PIX', expirationDate: '2026-09-14T15:00:00Z' };
    },
  };
  const chatbot = createPaymentChatbot({ baseChatbot, stateStore, paymentService });
  const incoming = (text) => chatbot.handleIncoming({
    chatId: '5511999999999@c.us', text,
    sendText: async (value) => sent.push(value),
    sendMedia: async (value) => media.push(value),
  });
  return { sessions, sent, media, paymentCalls, incoming };
}

test('primeiro pagamento pede CPF/CNPJ depois que o pedido real é criado', async () => {
  const h = harness();
  const result = await h.incoming('1');
  assert.equal(result.step, 'payment_document');
  assert.equal(h.sessions.get('5511999999999').step, 'payment_document');
  assert.match(h.sent.at(-1), /CPF ou CNPJ/);
});

test('CPF/CNPJ válido gera QR, Copia e Cola e não fica salvo na sessão', async () => {
  const h = harness();
  await h.incoming('1');
  const result = await h.incoming('123.456.789-01');
  assert.equal(result.step, 'awaiting_payment');
  assert.equal(h.paymentCalls[0].cpfCnpj, '12345678901');
  assert.equal(h.media[0].base64, 'BASE64PNG');
  assert.match(h.sent.at(-1), /000201PIX/);
  assert.doesNotMatch(JSON.stringify(h.sessions.get('5511999999999')), /12345678901/);
});

test('cliente com asaasCustomerId pula documento e recebe Pix direto', async () => {
  const h = harness({ needsDocument: false });
  const result = await h.incoming('1');
  assert.equal(result.step, 'awaiting_payment');
  assert.equal(h.paymentCalls.length, 1);
  assert.equal(h.paymentCalls[0].cpfCnpj, undefined);
});

test('estado awaiting_payment informa que não precisa comprovante', async () => {
  const h = harness();
  h.sessions.set('5511999999999', { step: 'awaiting_payment', orderId: 'PS-1001' });
  await h.incoming('oi');
  assert.match(h.sent.at(-1), /não precisa enviar comprovante/i);
});

test('Pix local gera QR e Copia e Cola imediatamente após confirmar o pedido no JID Baileys', async () => {
  const sessions = new Map();
  const sent = [];
  const media = [];
  sessions.set('5511999999999', { step: 'confirm', orderId: null, cart: { p1: 1 } });
  const stateStore = {
    getChatSession: (phone) => structuredClone(sessions.get(phone) ?? null),
    saveChatSession: (phone, session) => sessions.set(phone, structuredClone(session)),
  };
  const baseChatbot = {
    async handleIncoming() {
      sessions.set('5511999999999', { step: 'confirmed', orderId: 'PS-1001' });
      return { handled: true, step: 'confirmed', orderId: 'PS-1001' };
    },
  };
  const paymentService = {
    getStatus: () => ({ provider: 'pix-local', environment: 'local', configured: true }),
    needsPayerDocument: () => false,
    async generatePixForOrder() {
      return { paymentId: 'local:PS-1001', encodedImage: 'BASE64PNG', payload: '000201PIXLOCAL' };
    },
  };
  const chatbot = createPaymentChatbot({ baseChatbot, stateStore, paymentService });
  const result = await chatbot.handleIncoming({
    chatId: '5511999999999@s.whatsapp.net',
    text: '1',
    sendText: async (value) => sent.push(value),
    sendMedia: async (value) => media.push(value),
  });
  assert.equal(result.step, 'awaiting_payment');
  assert.equal(result.paymentId, 'local:PS-1001');
  assert.equal(media[0].base64, 'BASE64PNG');
  assert.match(sent.at(-1), /000201PIXLOCAL/);
  assert.match(sent.at(-1), /imagem do comprovante/i);
});
