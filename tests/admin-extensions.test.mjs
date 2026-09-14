import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/admin-extensions.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/admin-extensions.css', import.meta.url), 'utf8');

test('loads operational extensions after the core admin app', () => {
  assert.match(html, /src\/admin-extensions\.js/);
  assert.match(html, /src\/admin-extensions\.css/);
});

test('products page replaces demo creation with real create edit and deactivate actions', () => {
  assert.match(source, /Cadastrar produto/);
  assert.match(source, /data-real-product-new/);
  assert.match(source, /data-real-product-edit/);
  assert.match(source, /data-real-product-toggle/);
  assert.doesNotMatch(source, /Novo produto de demonstração/);
});

test('settings page exposes persisted chatbot message configuration', () => {
  assert.match(source, /Mensagens do atendimento/);
  assert.match(source, /data-message-key/);
  assert.match(source, /data-save-chatbot-messages/);
  assert.match(source, /settings\.chatbotMessages/);
});

test('QR code is compact by default on desktop and mobile', () => {
  assert.match(styles, /\.wa-qr\s*\{[^}]*width:\s*180px/s);
  assert.match(styles, /@media\s*\(max-width:\s*520px\)[\s\S]*\.wa-qr\s*\{[^}]*width:\s*160px/s);
});
