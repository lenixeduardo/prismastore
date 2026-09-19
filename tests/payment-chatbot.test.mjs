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
  assert.doesNotMatch(h.sent.at(-1), /PS-1001/);
  assert.equal(h.media[0].filename, 'pix-prismastore.png');
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


test('mensagens de pagamento não expõem o ID interno do pedido', async () => {
  const h = harness({ needsDocument: false });
  await h.incoming('1');
  assert.equal(h.sent.some((message) => /PS-1001/.test(message)), false);
  h.sent.length = 0;
  h.sessions.set('5511999999999', { step: 'awaiting_payment', orderId: 'PS-1001' });
  await h.incoming('oi');
  assert.equal(h.sent.some((message) => /PS-1001/.test(message)), false);
});
