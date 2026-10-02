import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../server/app-server.js';
import { createAuthService } from '../server/auth-service.js';

async function fixture(authService, run) {
  const dir = mkdtempSync(join(tmpdir(), 'ps-security-'));
  for (const name of ['src', 'data', 'assets', 'icons/generated', 'server', 'backups']) mkdirSync(join(dir, name), { recursive: true });
  for (const name of ['index.html', 'src/auth-ui.js', 'src/auth.css', 'manifest.webmanifest', 'service-worker.js', 'assets/logo.svg', '.env', 'data/prismastore.db', 'server/index.js', 'backups/private.json', 'src/private.json', 'src/private.js']) writeFileSync(join(dir, name), name);
  symlinkSync(join(dir, '.env'), join(dir, 'assets', 'secret.svg'));
  symlinkSync(join(dir, '.env'), join(dir, 'icons/generated/favicon-16.b64'));
  const server = createAppServer({ staticDir: dir, authService, stateStore: { load: () => ({ customers: [] }) }, backupService: {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); }
}

test('missing authentication configuration fails closed for status, login and admin APIs', async () => {
  await fixture(null, async base => {
    const status = await (await fetch(`${base}/api/auth/status`)).json();
    assert.equal(status.authenticated, false);
    for (const [path, method] of [['/api/auth/login', 'POST'], ['/api/state', 'GET'], ['/api/state', 'PUT'], ['/api/debug-report', 'GET']]) {
      assert.equal((await fetch(base + path, { method })).status, 503, path);
    }
  });
});

test('private files and symlinks are never served even with a valid admin session', async () => {
  const auth = createAuthService({ password: 'test-password' });
  const session = auth.login({ username: 'admin', password: 'test-password' });
  await fixture(auth, async base => {
    for (const cookie of ['', `${auth.cookieName}=${session.token}`]) {
      for (const path of ['/.env', '/data/prismastore.db', '/server/index.js', '/backups/private.json', '/src/private.json', '/src/private.js', '/assets/secret.svg', '/icons/favicon-16.png']) {
        for (const method of ['GET', 'HEAD']) assert.equal((await fetch(base + path, { method, headers: { cookie } })).status, 404, `${method} ${path}`);
      }
    }
    for (const path of ['/', '/src/auth-ui.js', '/src/auth.css', '/manifest.webmanifest', '/service-worker.js', '/assets/logo.svg']) assert.equal((await fetch(base + path)).status, 200, path);
    assert.equal((await fetch(base + '/api/state')).status, 401);
    assert.equal((await fetch(base + '/api/state', { headers: { cookie: `${auth.cookieName}=${session.token}` } })).status, 200);
  });
});

test('public pages prevent token referrers and MIME sniffing', async () => {
  await fixture(null, async base => {
    for (const path of ['/', '/api/auth/status', '/.env']) {
      const response = await fetch(base + path);
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    }
  });
});
