import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { createAppServer } from '../server/app-server.js';

function fixture() {
  return { products: [], customers: [], orders: [] };
}

test('backup API lists, creates and restores snapshots by safe id', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-step8-api-'));
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: fixture() });
  const calls = [];
  const backupService = {
    listBackups: () => [{ id: 'backup-20260914-123456-789-a1b2', reason: 'manual' }],
    createBackup: async () => { calls.push(['create']); return { id: 'backup-20260914-123456-789-a1b2', reason: 'manual' }; },
    restoreBackup: async (id) => { calls.push(['restore', id]); return { restored: true, backupId: id, safetyBackupId: 'backup-20260914-123500-000-c3d4' }; },
  };
  const server = createAppServer({ stateStore: store, staticDir: dir, backupService });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(`${baseUrl}/api/backups`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).backups.length, 1);
    response = await fetch(`${baseUrl}/api/backups`, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).id, 'backup-20260914-123456-789-a1b2');
    response = await fetch(`${baseUrl}/api/backups/backup-20260914-123456-789-a1b2/restore`, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).restored, true);
    assert.deepEqual(calls, [['create'], ['restore', 'backup-20260914-123456-789-a1b2']]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
