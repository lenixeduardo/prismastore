import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { createAuthService } from '../server/auth-service.js';
import { createAppServer } from '../server/app-server.js';

test('admin APIs require login and authenticated session cookie grants access', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ps-auth-api-'));
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: { products: [], customers: [], orders: [], settings: {} } });
  const authService = createAuthService({ username: 'admin', password: 'senha-forte', tokenGenerator: () => 'session-test' });
  const server = createAppServer({ stateStore: store, staticDir: process.cwd(), authService });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(`${baseUrl}/api/state`);
    assert.equal(response.status, 401);

    response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'senha-forte' }),
    });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie');
    assert.match(cookie, /prismastore_session=session-test/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);

    response = await fetch(`${baseUrl}/api/state`, { headers: { cookie } });
    assert.equal(response.status, 200);

    response = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { cookie } });
    assert.equal(response.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
