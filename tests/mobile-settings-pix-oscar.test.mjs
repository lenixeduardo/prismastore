import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const pwa = readFileSync(new URL('../src/pwa.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
const data = readFileSync(new URL('../src/data.js', import.meta.url), 'utf8');

test('mobile bottom navigation exposes Configurações directly and keeps secondary views in Mais', () => {
  const mobileViews = app.match(/const mobileViews = \[([\s\S]*?)\n\];/)?.[1] || '';
  assert.match(mobileViews, /['"]settings['"]\s*,\s*['"]Configurações['"]/);
  assert.doesNotMatch(mobileViews, /['"]customers['"]/);
  assert.match(app, /data-pwa-more/);
  assert.match(pwa, /data-pwa-view="customers"/);
  assert.match(pwa, /data-pwa-view="reports"/);
  assert.match(pwa, /data-pwa-view="chatbot"/);
});

test('service worker cache revision changes with the mobile navigation release', () => {
  assert.match(sw, /prismastore-shell-v0\.9\.2-[^'"]+/);
});

test('WhatsApp pairing uses a canonical Baileys browser identity', () => {
  assert.match(server, /Browsers/);
  assert.match(server, /browser:\s*Browsers\.macOS\(['"]Desktop['"]\)/);
  assert.doesNotMatch(server, /browser:\s*\[['"]PrismaStore['"]/);
});

test('runtime terminal hides demo status and identifies the configured Pix as Pix Oscar', () => {
  assert.doesNotMatch(server, /Dados demo:/);
  assert.match(server, /Pix Oscar: CONFIGURADO/);
  assert.doesNotMatch(server, /Pix local:/);
});

test('admin supports same-phone pairing from the home and reflects Pix Oscar', () => {
  assert.match(app, /\/api\/whatsapp\/pair/);
  assert.match(app, /data-whatsapp-pair-phone/);
  assert.match(app, /Gerar código neste celular/);
  assert.match(app, /Pix Oscar/);
  assert.doesNotMatch(app, /Asaas API \+ webhook/);
  assert.doesNotMatch(app, /\.wwebjs_auth/);
});

test('financial receiving account list contains only Pix Oscar', () => {
  assert.match(data, /name:\s*['"]Pix Oscar['"]/);
  assert.doesNotMatch(data, /Asaas Principal/);
  assert.doesNotMatch(data, /Conta Secundária/);
});


test('WhatsApp settings allow restarting the connection process', () => {
  assert.match(app, /\/api\/whatsapp\/restart/);
  assert.match(app, /data-whatsapp-restart/);
  assert.match(app, /Reiniciar conexão/);
});

test('WhatsApp has a single UI controller and server autoconnect is opt-in', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /src\/whatsapp-onboarding\.js/);
  assert.match(server, /WHATSAPP_AUTO_CONNECT\s*===\s*['"]true['"]/);
  assert.doesNotMatch(server, /WHATSAPP_AUTO_CONNECT\s*!==\s*['"]false['"]/);
});

test('core settings view performs real server health checks', () => {
  assert.match(app, /\/api\/payments\/status/);
  assert.match(app, /\/api\/backups/);
  assert.match(app, /\/api\/whatsapp\/status/);
  assert.match(app, /data-refresh-settings-health/);
  assert.match(app, /Salvar mensagens/);
});
