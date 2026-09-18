import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const pwa = readFileSync(new URL('../src/pwa.js', import.meta.url), 'utf8');

test('admin shell uses the PrismaStore logo asset in the sidebar brand', () => {
  assert.match(app, /\/icons\/prismastore-logo\.png/);
  assert.match(styles, /\.brand-mark img/);
  assert.doesNotMatch(styles, /\.brand-mark::after/);
  assert.match(sw, /\/icons\/prismastore-logo\.png/);
});

test('dashboard initial screen has no MVP label or quick action buttons', () => {
  assert.doesNotMatch(app, /PrismaStore · MVP/);
  assert.doesNotMatch(app, />Testar fluxo</);
  assert.doesNotMatch(app, />Ver pedidos</);
});

test('initial sidebar footer does not expose persistent-session implementation copy', () => {
  assert.doesNotMatch(app, /SQLite local · sessão persistente/);
});


test('dashboard removes static revenue comparison copy and products expose stock controls', () => {
  assert.doesNotMatch(app, /↑ 12,8% vs\. mês anterior/);
  assert.doesNotMatch(app, /No MVP de validação não há imagens de produtos/);
  assert.match(app, /data-stock-dec=/);
  assert.match(app, /data-stock-input=/);
  assert.match(app, /data-stock-inc=/);
});

test('PWA does not render the server online status badge', () => {
  assert.doesNotMatch(pwa, /Servidor online/);
  assert.doesNotMatch(pwa, /pwa-status/);
});
