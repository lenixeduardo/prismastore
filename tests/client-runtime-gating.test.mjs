import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const liveSyncSource = readFileSync(new URL('../src/live-sync.js', import.meta.url), 'utf8');
const paymentSource = readFileSync(new URL('../src/payment-status.js', import.meta.url), 'utf8');
const authSource = readFileSync(new URL('../src/auth-ui.js', import.meta.url), 'utf8');

test('runtime operacional inicia somente depois que o painel é aberto', () => {
  assert.match(appSource, /prismastore:dashboard-opened/);
  assert.match(appSource, /bootstrapOperationalRuntime/);
  assert.match(appSource, /prismastore:runtime-ready/);
  assert.doesNotMatch(appSource, /\nbootstrap\(\);/);
  assert.doesNotMatch(appSource, /setInterval\(\(\) =>/);
});

test('live sync não dispara request no carregamento e para após falha', () => {
  assert.match(liveSyncSource, /prismastore:runtime-ready/);
  assert.match(liveSyncSource, /stopLiveSync/);
  assert.match(liveSyncSource, /setTimeout\(runLiveSync, 3000\)/);
  assert.doesNotMatch(liveSyncSource, /\ncheckForServerChanges\(\);/);
  assert.doesNotMatch(liveSyncSource, /setInterval\(checkForServerChanges/);
});

test('status Pix é consultado sob demanda, sem polling global', () => {
  assert.match(paymentSource, /prismastore:view-changed/);
  assert.doesNotMatch(paymentSource, /setInterval\(refreshPaymentStatus/);
  assert.doesNotMatch(paymentSource, /\nrefreshPaymentStatus\(\);/);
});

test('autenticação não consulta o servidor automaticamente ao carregar o módulo', () => {
  assert.doesNotMatch(authSource, /refreshStatus\(\)\.catch\(\(\) => \{\}\);/);
  assert.match(authSource, /Servidor local indisponível/);
});
