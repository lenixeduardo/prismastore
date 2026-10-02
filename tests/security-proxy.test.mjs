import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server/app-server.js';
import { createAuthService } from '../server/auth-service.js';

async function withServer(options, run) {
  const server = createAppServer({ staticDir: process.cwd(), stateStore: { load: () => ({ orders: [] }) }, backupService: {}, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const password = 'test-password';
const login = (base, headers = {}, secret = 'wrong') => fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ username: 'admin', password: secret }) });

test('untrusted clients cannot rotate forwarded IPs to evade lockout or forge HTTPS', async () => {
  await withServer({ authService: createAuthService({ password, maxAttempts: 2 }) }, async base => {
    assert.equal((await login(base, { 'x-forwarded-for': '203.0.113.1' })).status, 401);
    assert.equal((await login(base, { 'x-forwarded-for': '203.0.113.2' })).status, 429);
    assert.equal((await login(base, { 'x-forwarded-for': '203.0.113.3' }, password)).status, 429);
  });
  await withServer({ authService: createAuthService({ password }) }, async base => {
    const response = await login(base, { 'x-forwarded-proto': 'https' }, password);
    assert.equal(response.status, 200);
    assert.doesNotMatch(response.headers.get('set-cookie'), /; Secure/);
  });
});

test('explicitly trusted proxy uses its last forwarded IP rather than client prepended IP', async () => {
  await withServer({ authService: createAuthService({ password, maxAttempts: 2 }), trustedProxyIps: ['127.0.0.1'] }, async base => {
    assert.equal((await login(base, { 'x-forwarded-for': '203.0.113.1, 198.51.100.1' })).status, 401);
    assert.equal((await login(base, { 'x-forwarded-for': '203.0.113.2, 198.51.100.1' })).status, 429);
    const response = await login(base, { 'x-forwarded-for': '198.51.100.2', 'x-forwarded-proto': 'https' }, password);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /; Secure/);
    assert.equal((await login(base, { 'x-forwarded-for': 'not-an-ip' })).status, 401);
    assert.equal((await login(base, { 'x-forwarded-for': 'another-invalid' })).status, 429);
  });
});

test('HTTPS policy rejects credentials, session APIs and public delivery on HTTP before processing payloads', async () => {
  const authService = createAuthService({ password });
  const session = authService.login({ username: 'admin', password });
  await withServer({ authService, requireHttps: true, secureCookies: true }, async base => {
    for (const [path, method] of [['/api/auth/login', 'POST'], ['/api/state', 'GET'], ['/api/state', 'PUT'], ['/api/auth/logout', 'POST'], ['/api/delivery-confirmations/token', 'GET'], ['/api/delivery-confirmations/token', 'POST'], ['/delivery-confirmation.html?token=private', 'GET']]) {
      const response = await fetch(base + path, { method, headers: { cookie: `${authService.cookieName}=${session.token}`, 'x-forwarded-proto': 'https' }, ...(method === 'POST' || method === 'PUT' ? { body: 'invalid-json' } : {}) });
      assert.equal(response.status, 426, path);
      assert.equal((await response.json()).code, 'HTTPS_REQUIRED');
    }
    assert.equal((await fetch(base + '/')).status, 200);
    assert.equal((await fetch(base + '/api/auth/status')).status, 200);
  });
  await withServer({ authService, requireHttps: true, trustedProxyIps: ['127.0.0.1'] }, async base => {
    const response = await login(base, { 'x-forwarded-proto': 'https' }, password);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /; Secure/);
    assert.equal((await fetch(base + '/api/state', { headers: { 'x-forwarded-proto': 'https', cookie: response.headers.get('set-cookie') } })).status, 200);
  });
});

test('global failure budget locks rotated client keys and expires predictably', () => {
  let now = 1000;
  const auth = createAuthService({ password, now: () => now, globalMaxAttempts: 3, globalWindowMs: 100, globalLockoutMs: 200 });
  assert.equal(auth.login({ password: 'bad', key: 'a' }).reason, 'invalid_credentials');
  assert.equal(auth.login({ password: 'bad', key: 'b' }).reason, 'invalid_credentials');
  assert.equal(auth.login({ password: 'bad', key: 'c' }).reason, 'locked');
  assert.equal(auth.login({ username: 'admin', password, key: 'd' }).reason, 'locked');
  now += 201;
  assert.equal(auth.login({ username: 'admin', password, key: 'e' }).ok, true);
  auth.login({ password: 'bad', key: 'f' });
  auth.login({ password: 'bad', key: 'g' });
  now += 101;
  assert.equal(auth.login({ password: 'bad', key: 'h' }).reason, 'invalid_credentials');
});
