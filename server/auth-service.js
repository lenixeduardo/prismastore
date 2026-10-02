import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

function defaultTokenGenerator() {
  return randomBytes(32).toString('base64url');
}

function constantTimePasswordMatch(password, expectedPassword, salt) {
  const actual = scryptSync(String(password ?? ''), salt, 32);
  const expected = scryptSync(String(expectedPassword ?? ''), salt, 32);
  return timingSafeEqual(actual, expected);
}

export function createAuthService({
  username = 'admin',
  password,
  now = Date.now,
  sessionDurationMs = 12 * 60 * 60 * 1000,
  maxAttempts = 5,
  lockoutMs = 15 * 60 * 1000,
  globalMaxAttempts = 20,
  globalWindowMs = 15 * 60 * 1000,
  globalLockoutMs = 15 * 60 * 1000,
  tokenGenerator = defaultTokenGenerator,
  cookieName = 'prismastore_session',
} = {}) {
  if (!String(password ?? '')) throw new Error('Senha administrativa não configurada.');
  const salt = randomBytes(16);
  const sessions = new Map();
  const attempts = new Map();
  let globalAttempts = { failures: 0, windowStartedAt: Number(now()), lockedUntil: 0 };

  function cleanupSessions() {
    const current = Number(now());
    for (const [token, session] of sessions) {
      if (session.expiresAt <= current) sessions.delete(token);
    }
  }

  function login({ username: candidateUsername = '', password: candidatePassword = '', key = 'global' } = {}) {
    const current = Number(now());
    if (globalAttempts.lockedUntil > current) {
      return { ok: false, reason: 'locked', retryAfterMs: globalAttempts.lockedUntil - current };
    }
    if (globalAttempts.lockedUntil || current - globalAttempts.windowStartedAt >= globalWindowMs) {
      globalAttempts = { failures: 0, windowStartedAt: current, lockedUntil: 0 };
    }
    const attemptKey = String(key || 'global');
    const record = attempts.get(attemptKey);
    if (record?.lockedUntil > current) {
      return { ok: false, reason: 'locked', retryAfterMs: record.lockedUntil - current };
    }
    if (record?.lockedUntil && record.lockedUntil <= current) attempts.delete(attemptKey);

    const usernameMatches = String(candidateUsername) === String(username);
    const passwordMatches = constantTimePasswordMatch(candidatePassword, password, salt);
    if (!usernameMatches || !passwordMatches) {
      globalAttempts.failures += 1;
      if (globalAttempts.failures >= globalMaxAttempts) {
        globalAttempts.lockedUntil = current + globalLockoutMs;
        return { ok: false, reason: 'locked', retryAfterMs: globalLockoutMs };
      }
      const failures = (attempts.get(attemptKey)?.failures || 0) + 1;
      if (failures >= maxAttempts) {
        attempts.set(attemptKey, { failures, lockedUntil: current + lockoutMs });
        return { ok: false, reason: 'locked', retryAfterMs: lockoutMs };
      }
      attempts.set(attemptKey, { failures, lockedUntil: 0 });
      return { ok: false, reason: 'invalid_credentials' };
    }

    attempts.delete(attemptKey);
    cleanupSessions();
    const token = String(tokenGenerator());
    const expiresAt = current + sessionDurationMs;
    sessions.set(token, { username: String(username), expiresAt });
    return { ok: true, token, username: String(username), expiresAt };
  }

  function validateSession(token) {
    if (!token) return { authenticated: false };
    cleanupSessions();
    const session = sessions.get(String(token));
    if (!session) return { authenticated: false };
    return { authenticated: true, username: session.username, expiresAt: session.expiresAt };
  }

  function logout(token) {
    if (token) sessions.delete(String(token));
    return { authenticated: false };
  }

  return {
    cookieName,
    login,
    logout,
    validateSession,
    getStatus: (token) => validateSession(token),
  };
}
