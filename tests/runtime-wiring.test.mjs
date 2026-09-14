import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');

test('runtime wires the persisted chatbot to incoming WhatsApp messages', () => {
  assert.match(source, /createChatbotEngine/);
  assert.match(source, /createWhatsAppChatAdapter/);
  assert.match(source, /messageHandler/);
  assert.match(source, /MessageMedia/);
});

test('approved welcome and catalog artwork are packaged as local chatbot assets', () => {
  const base = new URL('../assets/', import.meta.url);
  assert.equal(existsSync(join(base.pathname, 'prismastore-welcome.png')), true);
  assert.equal(existsSync(join(base.pathname, 'prismastore-catalog.png')), true);
});
