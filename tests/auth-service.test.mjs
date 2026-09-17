import test from 'node:test';
import assert from 'node:assert/strict';

async function loadAuthFactory() {
  const mod = await import('../server/auth-service.js').catch(() => null);
  return mod?.createAuthService ?? null;
}

test('admin auth creates and validates an opaque session cookie', async () => {
  const createAuthService = await loadAuthFactory();
  assert.equal(typeof createAuthService, 'function', 'createAuthService must exist');
  const auth = createAuthService({ username: 'admin', password: 'segredo-forte', randomToken: () => 'token-123' });
  const result = auth.login({ username: 'admin', password: 'segredo-forte', clientKey: 'phone' });
  assert.equal(result.ok, true);
  const cookie = auth.cookieFor(result.token, { secure: true });
  assert.match(cookie, /^prismastore_session=token-123;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.equal(auth.authenticate('foo=bar; prismastore_session=token-123').authenticated, true);
});

test('admin auth rejects wrong password and locks after five failures', async () => {
  const createAuthService = await loadAuthFactory();
  assert.equal(typeof createAuthService, 'function', 'createAuthService must exist');
  let now = 1_000;
  const auth = createAuthService({ username: 'admin', password: 'segredo-forte', now: () => now, maxAttempts: 5, lockoutMs: 15 * 60_000 });
  for (let index = 0; index < 4; index += 1) {
    assert.equal(auth.login({ username: 'admin', password: 'errada', clientKey: 'same-phone' }).reason, 'invalid');
  }
  const fifth = auth.login({ username: 'admin', password: 'errada', clientKey: 'same-phone' });
  assert.equal(fifth.reason, 'locked');
  assert.ok(fifth.retryAfterMs > 0);
  assert.equal(auth.login({ username: 'admin', password: 'segredo-forte', clientKey: 'same-phone' }).reason, 'locked');
  now += 15 * 60_000 + 1;
  assert.equal(auth.login({ username: 'admin', password: 'segredo-forte', clientKey: 'same-phone' }).ok, true);
});

test('admin session expires and logout revokes it', async () => {
  const createAuthService = await loadAuthFactory();
  assert.equal(typeof createAuthService, 'function', 'createAuthService must exist');
  let now = 10_000;
  const auth = createAuthService({ username: 'admin', password: 'segredo-forte', sessionHours: 1, now: () => now, randomToken: () => 'one-hour-token' });
  const result = auth.login({ username: 'admin', password: 'segredo-forte', clientKey: 'phone' });
  const cookieHeader = `prismastore_session=${result.token}`;
  assert.equal(auth.authenticate(cookieHeader).authenticated, true);
  auth.logout(cookieHeader);
  assert.equal(auth.authenticate(cookieHeader).authenticated, false);

  const second = auth.login({ username: 'admin', password: 'segredo-forte', clientKey: 'phone' });
  const secondCookie = `prismastore_session=${second.token}`;
  now += 60 * 60_000 + 1;
  assert.equal(auth.authenticate(secondCookie).authenticated, false);
});

test('auth can be disabled for local development without a password', async () => {
  const createAuthService = await loadAuthFactory();
  assert.equal(typeof createAuthService, 'function', 'createAuthService must exist');
  const auth = createAuthService({ username: 'admin', password: '' });
  assert.equal(auth.enabled, false);
  assert.equal(auth.authenticate('').authenticated, true);
  assert.equal(auth.session('').authenticated, true);
});
