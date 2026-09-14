import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { createBackupService } from '../server/backup-service.js';

test('new backups identify Baileys auth provider in the manifest', async () => {
  const root = mkdtempSync(join(tmpdir(), 'prismastore-baileys-backup-'));
  const authPath = join(root, 'data', 'whatsapp-auth');
  const backupsDir = join(root, 'backups');
  mkdirSync(authPath, { recursive: true });
  writeFileSync(join(authPath, 'creds.json'), '{}');
  const stateStore = createStateStore({
    dbPath: join(root, 'data', 'prismastore.db'),
    seedState: { products: [], customers: [], orders: [] },
  });
  try {
    const service = createBackupService({
      stateStore,
      authPath,
      backupsDir,
      whatsappAuthProvider: 'baileys',
      suffix: () => 'b001',
    });
    const backup = await service.createBackup();
    const manifest = JSON.parse(readFileSync(join(backupsDir, backup.id, 'manifest.json'), 'utf8'));
    assert.equal(manifest.whatsappAuthProvider, 'baileys');
    assert.equal(manifest.hasWhatsAppSession, true);
  } finally {
    stateStore.close();
    rmSync(root, { recursive: true, force: true });
  }
});
