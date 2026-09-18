import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

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
