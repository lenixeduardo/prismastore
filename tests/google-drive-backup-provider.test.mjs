import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function loadFactory() {
  const mod = await import('../server/google-drive-backup-provider.js').catch(() => null);
  return mod?.createGoogleDriveBackupProvider ?? null;
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('Google Drive provider refreshes OAuth token, creates folders and uploads backup files', async () => {
  const createGoogleDriveBackupProvider = await loadFactory();
  assert.equal(typeof createGoogleDriveBackupProvider, 'function', 'Drive provider factory must exist');
  const root = mkdtempSync(join(tmpdir(), 'prismastore-drive-'));
  mkdirSync(join(root, 'whatsapp-auth'), { recursive: true });
  writeFileSync(join(root, 'manifest.json'), '{}');
  writeFileSync(join(root, 'prismastore.db'), 'sqlite');
  writeFileSync(join(root, 'whatsapp-auth', 'creds.json'), '{}');
  const calls = [];
  let folderCounter = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('oauth2.googleapis.com/token')) return response({ access_token: 'access-1', expires_in: 3600 });
    if (String(url).includes('/drive/v3/files?') && init.method === 'GET') return response({ files: [] });
    if (String(url).includes('/drive/v3/files') && !String(url).includes('/upload/') && init.method === 'POST') {
      folderCounter += 1;
      return response({ id: folderCounter === 1 ? 'root-folder' : `folder-${folderCounter}` });
    }
    if (String(url).includes('/upload/drive/v3/files')) return response({ id: `file-${calls.length}` });
    throw new Error(`Unexpected request ${url}`);
  };
  const provider = createGoogleDriveBackupProvider({ clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh', fetchImpl });
  try {
    assert.equal(provider.configured, true);
    const result = await provider.uploadBackupDirectory({ id: 'backup-20260917-120000-000-abcd', path: root });
    assert.equal(result.provider, 'google-drive');
    assert.ok(result.remoteFolderId);
    assert.equal(calls.filter((call) => call.url.includes('/upload/drive/v3/files')).length, 3);
    assert.equal(calls.some((call) => call.url.includes('oauth2.googleapis.com/token')), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Google Drive provider remains disabled when OAuth credentials are incomplete', async () => {
  const createGoogleDriveBackupProvider = await loadFactory();
  assert.equal(typeof createGoogleDriveBackupProvider, 'function', 'Drive provider factory must exist');
  const provider = createGoogleDriveBackupProvider({ clientId: 'client', clientSecret: '', refreshToken: '' });
  assert.equal(provider.configured, false);
  await assert.rejects(() => provider.uploadBackupDirectory({ id: 'backup-x', path: '/tmp/x' }), /configurado/i);
});
