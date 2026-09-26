import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const liveSync = readFileSync(new URL('../src/live-sync.js', import.meta.url), 'utf8');

test('operational state is persisted through the local API instead of localStorage', () => {
  assert.doesNotMatch(source, /localStorage/);
  assert.match(source, /\/api\/state/);
  assert.match(source, /method:\s*['"]PUT['"]/);
});

test('admin renders one-line addresses captured by the WhatsApp chatbot', () => {
  assert.match(source, /a\.formatted/);
});

test('admin sincroniza o estado somente depois que o runtime do painel está ativo', () => {
  assert.match(liveSync, /fetch\('\/api\/state'/);
  assert.match(liveSync, /prismastore:runtime-ready/);
  assert.match(liveSync, /setTimeout\(runLiveSync, 3000\)/);
  assert.doesNotMatch(liveSync, /setInterval\(checkForServerChanges/);
});

test('sincronização de pedidos preserva a tela e não recarrega a conversa do simulador', () => {
  assert.match(liveSync, /prismastore:external-state-changed/);
  assert.doesNotMatch(liveSync, /window\.location\.reload\(\)/);
  assert.match(source, /prismastore:external-state-changed/);
  assert.match(source, /const activeView = state\.view/);
  assert.match(source, /state\.view = activeView/);
});

test('orders view exposes a payment-pending filter for newly confirmed WhatsApp orders', () => {
  assert.match(liveSync, /Aguardando Pix/);
  assert.match(liveSync, /livePending/);
});


test('delivery dossier keeps technical evidence compact instead of rendering raw values', () => {
  assert.match(source, /formatPhoneDisplay/);
  assert.match(source, /compactIpEvidence/);
  assert.match(source, /compactEvidenceHash/);
  assert.match(source, /deviceEvidenceLabel/);
  assert.doesNotMatch(source, /IP da confirmação/);
  assert.doesNotMatch(source, /Hash de integridade/);
});
