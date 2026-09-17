import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('WhatsApp onboarding supports phone pairing code while keeping QR fallback', () => {
  const source = readFileSync(new URL('../src/whatsapp-onboarding.js', import.meta.url), 'utf8');
  assert.match(source, /\/api\/whatsapp\/pair/);
  assert.match(source, /pairingCode/);
  assert.match(source, /data-whatsapp-pair-phone/);
  assert.match(source, /Conectar com número de telefone/);
  assert.match(source, /data-dashboard-whatsapp-connect/);
  assert.match(source, /qrDataUrl/);
});


test('single-phone pairing keeps the phone field stable while status polling runs', () => {
  const source = readFileSync(new URL('../src/whatsapp-onboarding.js', import.meta.url), 'utf8');
  assert.match(source, /function statusRenderKey\(/);
  assert.match(source, /lastRenderedKey/);
  assert.match(source, /if \(nextKey === lastRenderedKey && document\.getElementById\(CARD_ID\)\) return;/);
  assert.match(source, /Vincular neste celular/);
  assert.match(source, /Gerar código neste celular/);
});
