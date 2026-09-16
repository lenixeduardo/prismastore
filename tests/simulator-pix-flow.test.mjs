import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAppServer } from '../server/app-server.js';
import { createPaymentService } from '../server/payment-service.js';

const simulatorSource = readFileSync(new URL('../src/chat-simulator.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('simulador usa mensagens configuradas e não exige confirmação de maioridade', () => {
  assert.match(simulatorSource, /messageValue\(operationalState\.settings,/);
  assert.match(simulatorSource, /chatbotMessages/);
  assert.doesNotMatch(simulatorSource, /age-confirm/);
  assert.doesNotMatch(simulatorSource, /18 anos|18\+/i);
  assert.match(indexSource, /src\/chat-simulator\.js/);
  assert.doesNotMatch(indexSource, /chatbot-simulator-fixes\.js/);
});

test('Pix de demonstração usa BR Code real e encoder de QR', async () => {
  let encodedPayload = null;
  const service = createPaymentService({
    stateStore: {},
    qrEncoder: async (payload) => {
      encodedPayload = payload;
      return 'BASE64-DEMO-QR';
    },
  });

  const result = await service.generateDemoPix({ amount: 174.9 });
  assert.equal(result.encodedImage, 'BASE64-DEMO-QR');
  assert.equal(encodedPayload, result.payload);
  assert.equal(result.demo, true);
  assert.match(result.payload, /^000201/);
  assert.match(result.payload, /0014BR\.GOV\.BCB\.PIX/);
  assert.match(result.payload, /5303986/);
  assert.match(result.payload, /5406174\.90/);
  assert.match(result.payload, /5802BR/);
  assert.match(result.payload, /6304[0-9A-F]{4}$/);
});

test('API entrega QR Pix de demonstração para o simulador', async () => {
  const calls = [];
  const paymentService = {
    getStatus: () => ({ provider: 'pix-local', environment: 'local', configured: true }),
    generateDemoPix: async ({ amount }) => {
      calls.push(amount);
      return { payload: '000201DEMO6304ABCD', encodedImage: 'BASE64-DEMO-QR', amount };
    },
  };
  const stateStore = { load: () => ({ products: [], customers: [], orders: [], settings: {} }), save: (value) => value };
  const backupService = { listBackups: () => [], createBackup: async () => ({}), restoreBackup: async () => ({}) };
  const server = createAppServer({ stateStore, staticDir: process.cwd(), paymentService, backupService });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/api/payments/demo-pix?amount=174.90`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.encodedImage, 'BASE64-DEMO-QR');
    assert.equal(body.payload, '000201DEMO6304ABCD');
    assert.deepEqual(calls, [174.9]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('simulador renderiza imagem do QR real e não usa placeholder quadriculado', () => {
  assert.match(simulatorSource, /\/api\/payments\/demo-pix/);
  assert.match(simulatorSource, /data:image\/png;base64/);
  assert.doesNotMatch(simulatorSource, /QR_SVG|<div class=\"qr-demo\"><\/div>/);
});
