import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexSource = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('runtime composes PrismaStore with Baileys instead of whatsapp-web.js', () => {
  assert.match(indexSource, /@whiskeysockets\/baileys/);
  assert.doesNotMatch(indexSource, /whatsapp-web\.js/);
  assert.match(indexSource, /useMultiFileAuthState/);
  assert.match(indexSource, /fetchLatestWaWebVersion/);
  assert.match(indexSource, /fetchLatestBaileysVersion/);
  assert.match(indexSource, /dataDir, 'whatsapp-auth'/);
  assert.match(indexSource, /DisconnectReason\.loggedOut/);
});

test('runtime dependencies use Baileys and pino only for WhatsApp transport', () => {
  assert.equal(packageJson.dependencies['@whiskeysockets/baileys'], '6.7.24');
  assert.ok(packageJson.dependencies.pino);
  assert.equal(packageJson.dependencies['whatsapp-web.js'], undefined);
  assert.equal(packageJson.dependencies.qrcode, '1.5.4');
});

test('runtime passes the Baileys adapter handler into the WhatsApp manager', () => {
  assert.match(indexSource, /messageHandler:\s*messageHandler\.handleMessage/);
  assert.match(indexSource, /authStateLoader/);
  assert.match(indexSource, /socketFactory/);
});

test('runtime enables the WhatsApp dev allowlist only when explicitly requested', () => {
  assert.match(indexSource, /PRISMASTORE_DEV_WHATSAPP_ONLY/);
  assert.match(indexSource, /PRISMASTORE_DEV_WHATSAPP_PHONE/);
  assert.match(indexSource, /devAllowedPhone:/);
});

test('runtime keeps the internal bind separate from the public production URL', () => {
  assert.match(indexSource, /PRISMASTORE_PUBLIC_URL/);
  assert.match(indexSource, /PrismaStore produção/);
  assert.match(indexSource, /requestedHost = process\.env\.HOST \|\| '127\.0\.0\.1'/);
});
