import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'prismastore_session';
const DEFAULT_SESSION_HOURS = 12;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_MS = 15 * 60_000;

function parseCookies(header = '') {
  const cookies = new Map();
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies.set(key, value);
  }
  return cookies;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createAuthService({
  username = 'admin',
  password = '',
  sessionHours = DEFAULT_SESSION_HOURS,
  now = () => Date.now(),
  randomToken = () => randomBytes(32).toString('base64url'),
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  lockoutMs = DEFAULT_LOCKOUT_MS,
  forceSecureCookie = false,
} = {}) {
  const configuredUsername = String(username || 'admin').trim() || 'admin';
  const configuredPassword = String(password || '');
  const enabled = configuredPassword.length > 0;
  const sessionTtlMs = positiveNumber(sessionHours, DEFAULT_SESSION_HOURS) * 60 * 60_000;
  const failureLimit = Math.max(1, Math.floor(positiveNumber(maxAttempts, DEFAULT_MAX_ATTEMPTS)));
  const failureLockoutMs = positiveNumber(lockoutMs, DEFAULT_LOCKOUT_MS);
  const sessions = new Map();
  const failures = new Map();
  const salt = enabled ? randomBytes(16) : null;
  const expectedHash = enabled ? scryptSync(configuredPassword, salt, 64) : null;

  function verifyPassword(candidate) {
    if (!enabled) return true;
    const candidateHash = scryptSync(String(candidate || ''), salt, 64);
    return candidateHash.length === expectedHash.length && timingSafeEqual(candidateHash, expectedHash);
  }

  function cleanupSessions() {
    const current = now();
    for (const [token, entry] of sessions) {
      if (entry.expiresAt <= current) sessions.delete(token);
    }
  }

  function tokenFromCookie(cookieHeader = '') {
    return parseCookies(cookieHeader).get(COOKIE_NAME) || null;
  }

  function authenticate(cookieHeader = '') {
    if (!enabled) return { authenticated: true, user: configuredUsername, authEnabled: false, expiresAt: null };
    cleanupSessions();
    const token = tokenFromCookie(cookieHeader);
    const entry = token ? sessions.get(token) : null;
    if (!entry || entry.expiresAt <= now()) {
      if (token) sessions.delete(token);
      return { authenticated: false, user: null, authEnabled: true, expiresAt: null };
    }
    return { authenticated: true, user: entry.user, authEnabled: true, expiresAt: entry.expiresAt };
  }

  function login({ username: attemptedUsername = '', password: attemptedPassword = '', clientKey = 'unknown' } = {}) {
    if (!enabled) {
      return { ok: true, token: '', user: configuredUsername, expiresAt: null, authEnabled: false };
    }

    const key = String(clientKey || 'unknown');
    const current = now();
    const failure = failures.get(key);
    if (failure?.lockedUntil && failure.lockedUntil > current) {
      return { ok: false, reason: 'locked', retryAfterMs: failure.lockedUntil - current };
    }
    if (failure?.lockedUntil && failure.lockedUntil <= current) failures.delete(key);

    const userMatches = String(attemptedUsername || '').trim() === configuredUsername;
    const passwordMatches = verifyPassword(attemptedPassword);
    if (!userMatches || !passwordMatches) {
      const previous = failures.get(key);
      const count = (previous?.count || 0) + 1;
      if (count >= failureLimit) {
        const lockedUntil = current + failureLockoutMs;
        failures.set(key, { count, lockedUntil });
        return { ok: false, reason: 'locked', retryAfterMs: failureLockoutMs };
      }
      failures.set(key, { count, lockedUntil: null });
      return { ok: false, reason: 'invalid' };
    }

    failures.delete(key);
    cleanupSessions();
    const token = String(randomToken());
    const expiresAt = current + sessionTtlMs;
    sessions.set(token, { user: configuredUsername, expiresAt });
    return { ok: true, token, user: configuredUsername, expiresAt, authEnabled: true };
  }

  function logout(cookieHeader = '') {
    const token = tokenFromCookie(cookieHeader);
    if (token) sessions.delete(token);
    return { ok: true };
  }

  function cookieFor(token, { secure = false } = {}) {
    const maxAge = Math.max(1, Math.floor(sessionTtlMs / 1000));
    return [
      `${COOKIE_NAME}=${encodeURIComponent(String(token || ''))}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${maxAge}`,
      (secure || forceSecureCookie) ? 'Secure' : null,
    ].filter(Boolean).join('; ');
  }

  function clearCookie({ secure = false } = {}) {
    return [
      `${COOKIE_NAME}=`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      'Max-Age=0',
      (secure || forceSecureCookie) ? 'Secure' : null,
    ].filter(Boolean).join('; ');
  }

  return {
    enabled,
    login,
    logout,
    authenticate,
    session: authenticate,
    cookieFor,
    clearCookie,
  };
}
