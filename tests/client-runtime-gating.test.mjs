import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const liveSyncSource = readFileSync(new URL('../src/live-sync.js', import.meta.url), 'utf8');
const paymentSource = readFileSync(new URL('../src/payment-status.js', import.meta.url), 'utf8');
const whatsappSource = readFileSync(new URL('../src/whatsapp-onboarding.js', import.meta.url), 'utf8');
const authSource = readFileSync(new URL('../src/auth-ui.js', import.meta.url), 'utf8');

test('runtime operacional só inicia depois que o dashboard é aberto', () => {
  assert.match(appSource, /prismastore:dashboard-opened/);
  assert.match(appSource, /bootstrapOperationalRuntime/);
  assert.doesNotMatch(appSource, /\nbootstrap\(\);/);
  assert.doesNotMatch(appSource, /setInterval\(\(\) => refreshWhatsAppStatus/);
});

test('live sync não dispara requests antes do runtime autenticado e interrompe após falha', () => {
  assert.match(liveSyncSource, /prismastore:runtime-ready/);
  assert.match(liveSyncSource, /stopLiveSync/);
  assert.doesNotMatch(liveSyncSource, /\ncheckForServerChanges\(\);/);
  assert.doesNotMatch(liveSyncSource, /setInterval\(checkForServerChanges/);
});

test('status de pagamento é consultado sob demanda, sem polling global', () => {
  assert.match(paymentSource, /prismastore:view-changed/);
  assert.doesNotMatch(paymentSource, /setInterval\(refreshPaymentStatus/);
});

test('WhatsApp faz polling somente na tela inicial e para ao sair ou falhar', () => {
  assert.match(whatsappSource, /isDashboardVisible/);
  assert.match(whatsappSource, /prismastore:view-changed/);
  assert.match(whatsappSource, /stopStatusPolling/);
  assert.doesNotMatch(whatsappSource, /setInterval/);
});

test('autenticação não consulta o servidor automaticamente ao carregar o módulo', () => {
  assert.doesNotMatch(authSource, /refreshStatus\(\)\.catch\(\(\) => \{\}\);/);
});
