import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const heroSource = readFileSync(new URL('../src/hero.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('settings UI can connect WhatsApp Web and render the QR status from the local API', () => {
  assert.match(source, /\/api\/whatsapp\/status/);
  assert.match(source, /\/api\/whatsapp\/connect/);
  assert.match(source, /data-whatsapp-connect/);
  assert.match(source, /qrDataUrl/);
});

test('opening the admin panel does not auto-start a WhatsApp link loop', () => {
  assert.match(heroSource, /prismastore:dashboard-opened/);
  assert.doesNotMatch(html, /src\/whatsapp-onboarding\.js/);
  assert.match(source, /data-whatsapp-connect/);
  assert.match(source, /connectWhatsApp/);
});

test('dashboard surfaces the WhatsApp QR from the single core controller until the account is linked', () => {
  assert.match(source, /function whatsappConnectionPanel\(/);
  assert.match(source, /class="wa-qr"/);
  assert.match(source, /Conectar WhatsApp/);
  assert.match(source, /w\.status\s*===\s*['"]connected['"]/);
  assert.doesNotMatch(html, /src\/whatsapp-onboarding\.js/);
});

test('WhatsApp connection prefers QR Code and keeps phone pairing as the secondary option', () => {
  assert.match(source, /Leia o QR Code no WhatsApp/);
  assert.match(source, /Gerar QR Code/);
  assert.match(source, /Usar código de vínculo em vez do QR Code/);
  assert.match(source, /Usar código de vínculo como segunda opção/);
  assert.match(source, /Voltar para QR Code/);
  assert.doesNotMatch(source, /Alternativa: QR Code em outro dispositivo/);
});

test('settings UI owns Pix status in the core without a second DOM controller', () => {
  assert.match(source, /api\/payments\/status/);
  assert.match(source, /Pix Oscar/);
  assert.doesNotMatch(source, /Asaas|Sandbox|API KEY|WEBHOOK TOKEN/i);
  assert.doesNotMatch(html, /src\/payment-status\.js/);
});


test('core WhatsApp controller refreshes active connection states until they settle', () => {
  assert.match(source, /WHATSAPP_ACTIVE_STATUSES\s*=\s*new Set\(\[['"]connecting['"],\s*['"]authenticated['"],\s*['"]qr['"],\s*['"]pairing['"]\]\)/);
  assert.match(source, /function syncWhatsAppStatusPolling\(/);
  assert.match(source, /window\.setTimeout\([\s\S]*?refreshWhatsAppStatus\(\{ rerender: true \}\)[\s\S]*?WHATSAPP_STATUS_POLL_MS/);
  assert.match(source, /function stopWhatsAppStatusPolling\(/);
});
