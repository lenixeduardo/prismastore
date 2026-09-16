import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');

test('runtime wires the persisted chatbot to incoming Baileys WhatsApp messages', () => {
  assert.match(source, /createChatbotEngine/);
  assert.match(source, /createWhatsAppChatAdapter/);
  assert.match(source, /messageHandler:\s*messageHandler\.handleMessage/);
  assert.match(source, /@whiskeysockets\/baileys/);
  assert.doesNotMatch(source, /MessageMedia|LocalAuth|whatsapp-web\.js/);
});

test('approved welcome and catalog artwork are packaged as local chatbot assets', () => {
  const base = new URL('../assets/', import.meta.url);
  assert.equal(existsSync(join(base.pathname, 'prismastore-welcome.png')), true);
  assert.equal(existsSync(join(base.pathname, 'prismastore-catalog.png')), true);
});

test('runtime wires local Pix, receipt OCR and payment chatbot without Asaas credentials', () => {
  assert.match(source, /createPaymentService/);
  assert.match(source, /createPaymentChatbot/);
  assert.match(source, /createReceiptOcr/);
  assert.match(source, /PIX_KEY/);
  assert.match(source, /PIX_RECIPIENT_NAME/);
  assert.match(source, /downloadMediaMessage/);
  assert.match(source, /paymentService/);
  assert.doesNotMatch(source, /createAsaasClient/);
  assert.doesNotMatch(source, /ASAAS_API_KEY|ASAAS_WEBHOOK_TOKEN/);
});

test('runtime usa a chave aleatória Pix padrão quando PIX_KEY não está configurada', () => {
  assert.match(source, /2d03d745-5b05-4829-833d-60e4a210a664/);
  assert.match(source, /key:\s*process\.env\.PIX_KEY\s*\|\|\s*DEFAULT_PIX_KEY/);
});

test('runtime usa o beneficiário Pix padrão para cobrança e validação de comprovante', () => {
  assert.match(source, /OSCAR FILIPE SILVA DOS SANTOS/);
  assert.match(source, /recipientName:\s*process\.env\.PIX_RECIPIENT_NAME\s*\|\|\s*DEFAULT_PIX_RECIPIENT_NAME/);
});

test('runtime wires order lifecycle tracker and approved finalization artwork', () => {
  assert.match(source, /createOrderLifecycleService/);
  assert.match(source, /prismastore-order-finished\.b64/);
  assert.match(source, /ensureBase64Asset/);
  assert.match(source, /orderLifecycleService/);
  assert.equal(existsSync(new URL('../assets/prismastore-order-finished.b64', import.meta.url)), true);
});

test('runtime wires real monthly reports into the same local server', () => {
  assert.match(source, /createReportService/);
  assert.match(source, /receivingAccounts/);
  assert.match(source, /reportService/);
});
