import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthService } from '../server/auth-service.js';

test('admin auth creates expiring sessions and rejects invalid credentials', () => {
  let nowMs = 1_700_000_000_000;
  let tokenIndex = 0;
  const auth = createAuthService({
    username: 'admin',
    password: 'senha-forte',
    now: () => nowMs,
    sessionDurationMs: 60_000,
    tokenGenerator: () => `token-${++tokenIndex}`,
  });

  assert.deepEqual(auth.login({ username: 'admin', password: 'errada', key: 'ip-1' }), {
    ok: false,
    reason: 'invalid_credentials',
  });

  const login = auth.login({ username: 'admin', password: 'senha-forte', key: 'ip-1' });
  assert.equal(login.ok, true);
  assert.equal(login.token, 'token-1');
  assert.equal(auth.validateSession('token-1').authenticated, true);

  nowMs += 60_001;
  assert.equal(auth.validateSession('token-1').authenticated, false);
});

test('admin auth temporarily locks repeated failed attempts', () => {
  let nowMs = 1_700_000_000_000;
  const auth = createAuthService({
    username: 'admin',
    password: 'senha-forte',
    now: () => nowMs,
    maxAttempts: 3,
    lockoutMs: 30_000,
  });

  auth.login({ username: 'admin', password: 'x', key: 'same-ip' });
  auth.login({ username: 'admin', password: 'x', key: 'same-ip' });
  const third = auth.login({ username: 'admin', password: 'x', key: 'same-ip' });
  assert.equal(third.reason, 'locked');
  assert.ok(third.retryAfterMs > 0);

  const blockedCorrectPassword = auth.login({ username: 'admin', password: 'senha-forte', key: 'same-ip' });
  assert.equal(blockedCorrectPassword.reason, 'locked');

  nowMs += 30_001;
  assert.equal(auth.login({ username: 'admin', password: 'senha-forte', key: 'same-ip' }).ok, true);
});
