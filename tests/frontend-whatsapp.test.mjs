import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('settings UI can connect WhatsApp Web and render the QR status from the local API', () => {
  assert.match(source, /\/api\/whatsapp\/status/);
  assert.match(source, /\/api\/whatsapp\/connect/);
  assert.match(source, /data-whatsapp-connect/);
  assert.match(source, /qrDataUrl/);
});

test('settings UI exposes Asaas Sandbox payment configuration status', () => {
  const paymentStatus = readFileSync(new URL('../src/payment-status.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(paymentStatus, /api\/payments\/status/);
  assert.match(paymentStatus, /Asaas/);
  assert.match(paymentStatus, /Sandbox/i);
  assert.match(html, /src\/payment-status\.js/);
});
