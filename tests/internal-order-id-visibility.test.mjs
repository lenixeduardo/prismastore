import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const paymentService = readFileSync(new URL('../server/payment-service.js', import.meta.url), 'utf8');
const paymentChatbot = readFileSync(new URL('../server/payment-chatbot.js', import.meta.url), 'utf8');
const lifecycle = readFileSync(new URL('../server/order-lifecycle-service.js', import.meta.url), 'utf8');

test('order id remains internal on dashboard and orders screens', () => {
  assert.doesNotMatch(app, /<span class="order-id">\$\{o\.id\}<\/span>/);
  assert.doesNotMatch(app, /<h2>\$\{o\.id\}<\/h2>/);
  assert.match(app, /<th>Data<\/th><th>Cliente<\/th>/);
  assert.match(app, /placeholder="Cliente ou celular"/);
});

test('Pix customer metadata does not use the internal order id', () => {
  assert.match(paymentService, /txid: '\*\*\*'/);
  assert.match(paymentService, /description: 'PrismaStore'/);
  assert.doesNotMatch(paymentService, /description: `PrismaStore · Pedido \$\{order\.id\}`/);
});

test('customer-facing payment and tracking copy does not interpolate the internal id', () => {
  assert.doesNotMatch(paymentChatbot, /Pix do pedido \$\{session\.orderId\}/);
  assert.doesNotMatch(paymentChatbot, /Pix gerado para o pedido \$\{session\.orderId\}/);
  assert.doesNotMatch(lifecycle, /ACOMPANHAMENTO · \$\{order\.id\}/);
  assert.doesNotMatch(lifecycle, /Seu pedido \*\$\{order\.id\}\*/);
});
