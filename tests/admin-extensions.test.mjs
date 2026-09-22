import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/admin-extensions.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/admin-extensions.css', import.meta.url), 'utf8');

test('loads operational extensions after the core admin app', () => {
  assert.match(html, /src\/admin-extensions\.js/);
  assert.match(html, /src\/admin-extensions\.css/);
});

test('products page keeps a grouped stock stepper beside the compact product summary', () => {
  assert.match(app, /class="[^"]*product-list[^"]*"/);
  assert.match(app, /class="product-list-item"/);
  assert.match(app, /class="product-stock-stepper"/);
  assert.match(app, /data-stock-dec=/);
  assert.match(app, /data-stock-input=/);
  assert.match(app, /data-stock-inc=/);
  assert.match(app, /data-real-product-details=/);
  assert.match(app, />•••<\/button>/);
  assert.doesNotMatch(app, /product-list-price/);
  assert.doesNotMatch(app, /<th>Disponível<\/th>/);
  assert.match(styles, /\.product-stock-stepper\s*\{[^}]*display:grid[^}]*grid-template-columns:\s*32px 48px 32px[^}]*overflow:hidden/s);
  assert.match(styles, /\.product-stock-stepper button\s*\{[^}]*border:0/s);
  assert.match(styles, /\.product-stock-stepper input\s*\{[^}]*border:0[^}]*text-align:center/s);
  assert.match(source, /function productDetailsMarkup\(/);
});

test('settings page owns persisted chatbot configuration in the core app without duplicate extension handlers', () => {
  assert.match(app, /Mensagens do atendimento/);
  assert.match(app, /data-message-key/);
  assert.match(app, /data-save-chatbot-messages/);
  assert.match(app, /settings\.chatbotMessages/);
  assert.doesNotMatch(source, /data-save-chatbot-messages/);
  assert.doesNotMatch(source, /enhanceSettings/);
});

test('QR code is compact by default on desktop and mobile', () => {
  assert.match(styles, /\.wa-qr\s*\{[^}]*width:\s*180px/s);
  assert.match(styles, /@media\s*\(max-width:\s*520px\)[\s\S]*\.wa-qr\s*\{[^}]*width:\s*160px/s);
});


test('document head does not render the escaped newline token', () => {
  assert.doesNotMatch(html, /\/>\\n\s*<link rel="icon"/);
});
