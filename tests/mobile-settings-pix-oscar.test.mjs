import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const pwa = readFileSync(new URL('../src/pwa.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
const data = readFileSync(new URL('../src/data.js', import.meta.url), 'utf8');

test('mobile bottom navigation exposes Configurações directly and keeps secondary views in Mais', () => {
  assert.match(app, /const mobileViews = \[[\s\S]*?['"]settings['"]/);
  assert.match(app, /data-view="settings"/);
  assert.match(app, /data-pwa-more/);
  assert.match(pwa, /data-pwa-view="customers"/);
  assert.match(pwa, /data-pwa-view="reports"/);
  assert.match(pwa, /data-pwa-view="chatbot"/);
});

test('service worker cache revision changes with the mobile navigation release', () => {
  assert.match(sw, /prismastore-shell-v0\.9\.2-mobile-secure-3/);
});

test('runtime terminal hides demo status and identifies the configured Pix as Pix Oscar', () => {
  assert.doesNotMatch(server, /Dados demo:/);
  assert.match(server, /Pix Oscar: CONFIGURADO/);
  assert.doesNotMatch(server, /Pix local:/);
});

test('admin settings support same-phone pairing and reflect Baileys session plus Pix Oscar', () => {
  assert.match(app, /\/api\/whatsapp\/pair/);
  assert.match(app, /data-whatsapp-pair-phone/);
  assert.match(app, /Gerar código neste celular/);
  assert.match(app, /Pix Oscar/);
  assert.match(app, /data\/whatsapp-auth/);
  assert.doesNotMatch(app, /Asaas API \+ webhook/);
  assert.doesNotMatch(app, /\.wwebjs_auth/);
});

test('financial receiving account list contains only Pix Oscar', () => {
  assert.match(data, /name:\s*['"]Pix Oscar['"]/);
  assert.doesNotMatch(data, /Asaas Principal/);
  assert.doesNotMatch(data, /Conta Secundária/);
});
