import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { createAppServer } from '../server/app-server.js';

function fixture() {
  return { products: [], customers: [], orders: [], settings: {} };
}

function createFakeAuth() {
  const valid = new Set();
  return {
    enabled: true,
    session(cookie = '') {
      return { authenticated: cookie.includes('prismastore_session=good'), user: cookie.includes('good') ? 'admin' : null };
    },
    authenticate(cookie = '') {
      return { authenticated: cookie.includes('prismastore_session=good'), user: cookie.includes('good') ? 'admin' : null };
    },
    login({ username, password }) {
      if (username !== 'admin' || password !== 'secret') return { ok: false, reason: 'invalid' };
      valid.add('good');
      return { ok: true, token: 'good', user: 'admin', expiresAt: Date.now() + 60_000 };
    },
    logout() { valid.delete('good'); return { ok: true }; },
    cookieFor() { return 'prismastore_session=good; Path=/; HttpOnly; SameSite=Strict'; },
    clearCookie() { return 'prismastore_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'; },
  };
}

async function withServer(run) {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-auth-api-'));
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: fixture() });
  const authService = createFakeAuth();
  const server = createAppServer({ stateStore: store, staticDir: process.cwd(), authService });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run({ baseUrl });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('protected admin API returns 401 without a session', async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/state`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Autenticação necessária' });
  });
});

test('login creates session cookie and authenticated request reaches admin state', async () => {
  await withServer(async ({ baseUrl }) => {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secret' }),
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie') || '', /prismastore_session=good/);
    assert.equal((await login.json()).authenticated, true);

    const response = await fetch(`${baseUrl}/api/state`, { headers: { cookie: 'prismastore_session=good' } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), fixture());
  });
});

test('wrong password is rejected and lockout maps to HTTP 429', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-auth-lock-'));
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: fixture() });
  const authService = {
    enabled: true,
    authenticate: () => ({ authenticated: false }),
    session: () => ({ authenticated: false }),
    login: () => ({ ok: false, reason: 'locked', retryAfterMs: 10_000 }),
    logout: () => ({ ok: true }),
    clearCookie: () => 'prismastore_session=; Max-Age=0',
  };
  const server = createAppServer({ stateStore: store, staticDir: process.cwd(), authService });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'x' }),
    });
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error, 'Muitas tentativas. Tente novamente mais tarde.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('logout clears the browser cookie', async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { cookie: 'prismastore_session=good' } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie') || '', /Max-Age=0/);
  });
});
