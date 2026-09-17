import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { createBackupService } from '../server/backup-service.js';

function harness(provider) {
  const root = mkdtempSync(join(tmpdir(), 'prismastore-external-'));
  const dataDir = join(root, 'data');
  const backupsDir = join(root, 'backups');
  mkdirSync(dataDir, { recursive: true });
  const stateStore = createStateStore({ dbPath: join(dataDir, 'prismastore.db'), seedState: { products: [], customers: [], orders: [] } });
  const service = createBackupService({
    stateStore,
    authPath: join(dataDir, 'whatsapp-auth'),
    backupsDir,
    externalBackupProvider: provider,
    now: () => new Date('2026-09-17T15:00:00.000Z'),
    suffix: () => 'a1b2',
  });
  return { root, backupsDir, stateStore, service };
}

function cleanup(h) { h.stateStore.close(); rmSync(h.root, { recursive: true, force: true }); }

test('successful local backup is synced to Drive and metadata persists in backup list', async () => {
  const uploads = [];
  const provider = {
    configured: true,
    provider: 'google-drive',
    async uploadBackupDirectory(input) { uploads.push(input); return { provider: 'google-drive', remoteFolderId: 'drive-folder-1' }; },
  };
  const h = harness(provider);
  try {
    const backup = await h.service.createBackup({ reason: 'manual' });
    assert.equal(uploads.length, 1);
    assert.equal(existsSync(uploads[0].path), true);
    assert.equal(backup.external.status, 'synced');
    assert.equal(backup.external.remoteFolderId, 'drive-folder-1');
    assert.equal(h.service.listBackups()[0].external.status, 'synced');
    const metadata = JSON.parse(readFileSync(join(h.backupsDir, '.external-sync.json'), 'utf8'));
    assert.equal(metadata[backup.id].remoteFolderId, 'drive-folder-1');
  } finally { cleanup(h); }
});

test('Drive failure never invalidates the completed local backup and is surfaced as sync error', async () => {
  const provider = { configured: true, provider: 'google-drive', async uploadBackupDirectory() { throw new Error('Drive offline'); } };
  const h = harness(provider);
  try {
    const backup = await h.service.createBackup({ reason: 'manual' });
    assert.equal(existsSync(join(h.backupsDir, backup.id, 'manifest.json')), true);
    assert.equal(backup.external.status, 'error');
    assert.match(backup.external.error, /Drive offline/);
    assert.equal((await h.service.validateBackup(backup.id)).valid, true);
  } finally { cleanup(h); }
});

test('backup list reports Drive as not configured without affecting local behavior', async () => {
  const h = harness(null);
  try {
    const backup = await h.service.createBackup();
    assert.equal(backup.external.status, 'not-configured');
    assert.equal(h.service.listBackups()[0].external.status, 'not-configured');
  } finally { cleanup(h); }
});
