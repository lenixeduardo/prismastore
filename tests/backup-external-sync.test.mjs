import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBackupService } from '../server/backup-service.js';

test('created local backup is also synchronized to the external backup store', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ps-backup-external-'));
  const authPath = join(dir, 'auth');
  const backupsDir = join(dir, 'backups');
  mkdirSync(authPath, { recursive: true });
  writeFileSync(join(authPath, 'creds.json'), '{}');
  const uploads = [];
  const stateStore = {
    async backupTo(path) { writeFileSync(path, Buffer.from('sqlite')); },
    restoreFrom() {},
  };
  const externalBackupStore = {
    async uploadBackup(input) { uploads.push(input); return { uploaded: true, fileId: 'drive-1', fileName: `${input.id}.json.gz` }; },
    getStatus() { return { provider: 'google-drive', configured: true, lastSuccessAt: '2026-09-17T15:00:00.000Z', lastError: null }; },
  };
  try {
    const service = createBackupService({ stateStore, authPath, backupsDir, externalBackupStore, suffix: () => 'abcd' });
    const result = await service.createBackup({ reason: 'manual' });
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].id, result.id);
    assert.match(uploads[0].path, new RegExp(`${result.id}$`));
    assert.equal(result.external.uploaded, true);
    assert.equal(service.getExternalStatus().provider, 'google-drive');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('external sync failure does not destroy a valid local backup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ps-backup-external-fail-'));
  const stateStore = { async backupTo(path) { writeFileSync(path, Buffer.from('sqlite')); }, restoreFrom() {} };
  const externalBackupStore = {
    async uploadBackup() { throw new Error('drive offline'); },
    getStatus() { return { provider: 'google-drive', configured: true, lastSuccessAt: null, lastError: 'drive offline' }; },
  };
  try {
    const service = createBackupService({ stateStore, authPath: join(dir, 'auth'), backupsDir: join(dir, 'backups'), externalBackupStore, suffix: () => 'abcd' });
    const result = await service.createBackup({ reason: 'manual' });
    assert.equal(result.external.uploaded, false);
    assert.match(result.external.error, /drive offline/);
    assert.equal(service.listBackups().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
