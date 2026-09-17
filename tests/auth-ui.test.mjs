import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) { return readFileSync(new URL(path, import.meta.url), 'utf8'); }

test('admin shell loads the auth gate before hero and app scripts', () => {
  const html = read('../index.html');
  const authIndex = html.indexOf('src/auth-gate.js');
  const heroIndex = html.indexOf('src/hero.js');
  const appIndex = html.indexOf('src/app.js');
  assert.ok(authIndex >= 0, 'auth-gate.js must be loaded');
  assert.ok(authIndex < heroIndex, 'auth gate must load before hero');
  assert.ok(authIndex < appIndex, 'auth gate must load before app');
  assert.match(html, /src\/auth-gate\.css/);
});

test('auth gate uses same-origin cookie session and exposes login/logout actions', () => {
  const source = read('../src/auth-gate.js');
  assert.match(source, /\/api\/auth\/session/);
  assert.match(source, /\/api\/auth\/login/);
  assert.match(source, /\/api\/auth\/logout/);
  assert.match(source, /credentials:\s*['"]same-origin['"]/);
  assert.match(source, /ensureAdminSession/);
  assert.match(source, /logoutAdmin/);
  assert.match(source, /prismastore:authenticated/);
  assert.match(source, /prismastore:logged-out/);
  assert.match(source, /type="password"/);
});

test('hero asks the auth gate before revealing the dashboard', () => {
  const source = read('../src/hero.js');
  assert.match(source, /PrismastoreAuth/);
  assert.match(source, /ensureAdminSession/);
  assert.match(source, /await/);
});

test('settings exposes admin logout without storing credentials in localStorage', () => {
  const auth = read('../src/auth-gate.js');
  assert.match(auth, /Sair do painel/);
  assert.doesNotMatch(auth, /localStorage\.setItem\([^)]*(password|senha)/i);
});
