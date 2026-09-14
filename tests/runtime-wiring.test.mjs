import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');

test('runtime wires the persisted chatbot to incoming WhatsApp messages', () => {
  assert.match(source, /createChatbotEngine/);
  assert.match(source, /createWhatsAppChatAdapter/);
  assert.match(source, /messageHandler/);
  assert.match(source, /MessageMedia/);
});

test('approved welcome and catalog artwork are packaged as local chatbot assets', () => {
  const base = new URL('../assets/', import.meta.url);
  assert.equal(existsSync(join(base.pathname, 'prismastore-welcome.png')), true);
  assert.equal(existsSync(join(base.pathname, 'prismastore-catalog.png')), true);
});

test('runtime wires Asaas client, payment service and webhook token into the single process', () => {
  assert.match(source, /createAsaasClient/);
  assert.match(source, /createPaymentService/);
  assert.match(source, /createPaymentChatbot/);
  assert.match(source, /ASAAS_API_KEY/);
  assert.match(source, /ASAAS_WEBHOOK_TOKEN/);
  assert.match(source, /paymentService/);
});

test('runtime wires order lifecycle tracker and approved finalization artwork', () => {
  assert.match(source, /createOrderLifecycleService/);
  assert.match(source, /prismastore-order-finished\.b64/);
  assert.match(source, /ensureBase64Asset/);
  assert.match(source, /orderLifecycleService/);
  assert.equal(existsSync(new URL('../assets/prismastore-order-finished.b64', import.meta.url)), true);
});
