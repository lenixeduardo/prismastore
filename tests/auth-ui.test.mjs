import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('admin shell loads authentication UI before hero entry logic', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /src\/auth\.css/);
  const authIndex = html.indexOf('src/auth-ui.js');
  const heroIndex = html.indexOf('src/hero.js');
  assert.ok(authIndex >= 0 && heroIndex > authIndex);
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

test('hero waits for authentication before revealing the dashboard', () => {
  const source = readFileSync(new URL('../src/hero.js', import.meta.url), 'utf8');
  assert.match(source, /ensureAuthenticated/);
  assert.match(source, /await/);
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

test('login uses the crisp PrismaStore SVG logo and no decorative artwork behind the form', () => {
  const source = readFileSync(new URL('../src/auth-ui.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/auth.css', import.meta.url), 'utf8');
  assert.match(source, /src="\/icons\/icon-512\.svg"/);
  assert.doesNotMatch(source, /login-prism-burst\.svg/);
  assert.doesNotMatch(source, /auth-prism-art/);
  assert.doesNotMatch(css, /\.auth-prism-art/);
  assert.match(css, /\.auth-brand img\s*\{[\s\S]*?height:\s*auto/);
  assert.match(css, /object-fit:\s*contain/);
});

test('login inputs do not render decorative icons inside the fields', () => {
  const source = readFileSync(new URL('../src/auth-ui.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/auth.css', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /auth-input-icon/);
  assert.doesNotMatch(css, /\.auth-input-icon/);
});
