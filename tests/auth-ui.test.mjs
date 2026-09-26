import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('login is the first screen and legacy hero entry is not mounted', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /src\/auth\.css/);
  assert.match(html, /src\/auth-ui\.js/);
  assert.doesNotMatch(html, /id="hero-page"/);
  assert.doesNotMatch(html, /data-enter-dashboard/);
  assert.doesNotMatch(html, /src\/hero\.js/);
  assert.doesNotMatch(html, /src\/hero\.css/);
});

test('authentication UI uses status login and logout APIs and exposes an auth gate', () => {
  const source = readFileSync(new URL('../src/auth-ui.js', import.meta.url), 'utf8');
  assert.match(source, /\/api\/auth\/status/);
  assert.match(source, /\/api\/auth\/login/);
  assert.match(source, /\/api\/auth\/logout/);
  assert.match(source, /PrismastoreAuth/);
  assert.match(source, /ensureAuthenticated/);
  assert.match(source, /type="password"/);
});

test('authentication UI boots the admin gate and reveals the dashboard only after access is allowed', () => {
  const source = readFileSync(new URL('../src/auth-ui.js', import.meta.url), 'utf8');
  assert.match(source, /async function startAdminAccess\(/);
  assert.match(source, /await ensureAuthenticated\(\)/);
  assert.match(source, /function revealDashboard\(/);
  assert.match(source, /prismastore:dashboard-opened/);
  assert.match(source, /startAdminAccess\(\)/);
});


test('successful login resumes the pending dashboard access without reloading the page', () => {
  const source = readFileSync(new URL('../src/auth-ui.js', import.meta.url), 'utf8');
  const loginStart = source.indexOf('async function login(form)');
  const logoutStart = source.indexOf('async function logout()');
  const loginSource = source.slice(loginStart, logoutStart);
  assert.match(loginSource, /settleLogin\(true\)/);
  assert.doesNotMatch(loginSource, /window\.location\.reload\(\)/);
});


test('login keeps the username locked to admin', () => {
  const source = readFileSync(new URL('../src/auth-ui.js', import.meta.url), 'utf8');
  assert.match(source, /value="admin" readonly aria-readonly="true"/);
  assert.match(source, /username: 'admin'/);
});

test('login uses a text-only PrismaStore brand with no triangular artwork', () => {
  const source = readFileSync(new URL('../src/auth-ui.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/auth.css', import.meta.url), 'utf8');
  assert.match(source, /<div class="auth-brand-copy">/);
  assert.match(source, /<strong>PrismaStore<\/strong>/);
  assert.doesNotMatch(source, /prismastore-prism-logo|icon-512\.svg|login-prism-burst\.svg|auth-prism-art/);
  assert.doesNotMatch(css, /\.auth-prism-art|\.auth-brand img/);
});

test('login inputs do not render decorative icons inside the fields', () => {
  const source = readFileSync(new URL('../src/auth-ui.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/auth.css', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /auth-input-icon/);
  assert.doesNotMatch(css, /\.auth-input-icon/);
});


test('login screen has no back action because it is the entry screen', () => {
  const source = readFileSync(new URL('../src/auth-ui.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /data-auth-back/);
  assert.doesNotMatch(source, />Voltar</);
});
