import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { createBackupService } from '../server/backup-service.js';

function createHarness() {
  const root = mkdtempSync(join(tmpdir(), 'prismastore-baileys-backup-'));
  const authPath = join(root, 'data', 'whatsapp-auth');
  const backupsDir = join(root, 'backups');
  mkdirSync(authPath, { recursive: true });
  writeFileSync(join(authPath, 'creds.json'), 'auth-original');
  const stateStore = createStateStore({
    dbPath: join(root, 'data', 'prismastore.db'),
    seedState: { products: [{ id: 'p1', stock: 5 }], customers: [], orders: [] },
  });
  return { root, authPath, backupsDir, stateStore };
}

test('new backups identify Baileys auth provider in the manifest', async () => {
  const h = createHarness();
  try {
    const service = createBackupService({
      stateStore: h.stateStore,
      authPath: h.authPath,
      backupsDir: h.backupsDir,
      whatsappAuthProvider: 'baileys',
      suffix: () => 'b001',
    });
    const backup = await service.createBackup();
    const manifest = JSON.parse(readFileSync(join(h.backupsDir, backup.id, 'manifest.json'), 'utf8'));
    assert.equal(manifest.whatsappAuthProvider, 'baileys');
    assert.equal(manifest.hasWhatsAppSession, true);
  } finally {
    h.stateStore.close();
    rmSync(h.root, { recursive: true, force: true });
  }
});

test('legacy auth bytes are not restored into Baileys auth directory while SQLite is restored', async () => {
  const h = createHarness();
  try {
    const legacyService = createBackupService({
      stateStore: h.stateStore,
      authPath: h.authPath,
      backupsDir: h.backupsDir,
      whatsappAuthProvider: 'whatsapp-web.js',
      suffix: () => 'b002',
    });
    const legacy = await legacyService.createBackup();
    h.stateStore.save({ products: [{ id: 'p1', stock: 1 }], customers: [], orders: [] });
    writeFileSync(join(h.authPath, 'creds.json'), 'current-baileys-auth');

    const baileysService = createBackupService({
      stateStore: h.stateStore,
      authPath: h.authPath,
      backupsDir: h.backupsDir,
      whatsappAuthProvider: 'baileys',
      suffix: () => 'b003',
    });
    await baileysService.restoreBackup(legacy.id);

    assert.equal(h.stateStore.load().products[0].stock, 5);
    assert.equal(existsSync(join(h.authPath, 'creds.json')), false);
  } finally {
    h.stateStore.close();
    rmSync(h.root, { recursive: true, force: true });
  }
});
