import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const heroSource = readFileSync(new URL('../src/hero.js', import.meta.url), 'utf8');

test('settings UI can connect WhatsApp Web and render the QR status from the local API', () => {
  assert.match(source, /\/api\/whatsapp\/status/);
  assert.match(source, /\/api\/whatsapp\/connect/);
  assert.match(source, /data-whatsapp-connect/);
  assert.match(source, /qrDataUrl/);
});

test('opening the admin panel starts WhatsApp linking when the account is not yet connected', () => {
  assert.match(heroSource, /prismastore:dashboard-opened/);
  assert.match(source, /addEventListener\(['"]prismastore:dashboard-opened['"]/);
  assert.match(source, /ensureWhatsAppConnection/);
});

test('dashboard surfaces the WhatsApp QR until the account is linked', () => {
  assert.match(source, /function whatsappDashboardCard\(\)/);
  assert.match(source, /\$\{whatsappDashboardCard\(\)\}/);
  assert.match(source, /class="wa-qr"/);
  assert.match(source, /Conectar WhatsApp/);
});

test('settings UI exposes local Pix receipt configuration status', () => {
  const paymentStatus = readFileSync(new URL('../src/payment-status.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(paymentStatus, /api\/payments\/status/);
  assert.match(paymentStatus, /Pix local/);
  assert.match(paymentStatus, /CONFIGURAR PIX/);
  assert.doesNotMatch(paymentStatus, /Asaas|Sandbox|API KEY|WEBHOOK TOKEN/i);
  assert.match(html, /src\/payment-status\.js/);
});
