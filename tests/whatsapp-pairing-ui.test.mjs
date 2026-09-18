import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const onboarding = readFileSync(new URL('../src/whatsapp-onboarding.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('WhatsApp pairing is kept out of the dashboard onboarding', () => {
  assert.match(onboarding, /does not render on the dashboard/);
  assert.match(onboarding, /Pairing remains available only from Configurações/);
  assert.doesNotMatch(onboarding, /fetch\('\/api\/whatsapp\/status'/);
  assert.doesNotMatch(onboarding, /setInterval|setTimeout/);
  assert.match(onboarding, /whatsappDashboardCard\(\) \{\s*return '';/);
});

test('Configurações keeps phone pairing and QR fallback controls', () => {
  assert.match(app, /\/api\/whatsapp\/pair/);
  assert.match(app, /pairingCode/);
  assert.match(app, /data-whatsapp-pair-phone/);
  assert.match(app, /Conectar com número de telefone/);
  assert.match(app, /qrDataUrl/);
});
