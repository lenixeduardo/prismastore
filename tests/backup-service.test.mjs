import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { createBackupService } from '../server/backup-service.js';

function seed() {
  return {
    products: [{ id: 'p1', name: 'Produto', stock: 5, reserved: 0 }],
    customers: [{ id: 'c1', name: 'Cliente', phone: '+5511999999999', addresses: [] }],
    orders: [{ id: 'PS-1001', status: 'PAID', total: 25, paidAt: '2026-09-14T12:00:00Z' }],
  };
}

function harness({ connected = true, withAuth = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'prismastore-backup-'));
  const dataDir = join(root, 'data');
  const backupsDir = join(root, 'backups');
  const authPath = join(root, '.wwebjs_auth');
  mkdirSync(dataDir, { recursive: true });
  if (withAuth) {
    mkdirSync(join(authPath, 'session-prismastore-main'), { recursive: true });
    writeFileSync(join(authPath, 'session-prismastore-main', 'session.json'), 'auth-v1');
  }
  const stateStore = createStateStore({ dbPath: join(dataDir, 'prismastore.db'), seedState: seed() });
  let status = connected ? 'connected' : 'disconnected';
  const calls = [];
  const whatsappManager = {
    getStatus: () => ({ status }),
    disconnect: async () => { calls.push('disconnect'); status = 'disconnected'; return { status }; },
    connect: async () => { calls.push('connect'); status = 'connected'; return { status }; },
  };
  const service = createBackupService({
    stateStore,
    whatsappManager,
    authPath,
    backupsDir,
    appVersion: '0.8.0',
    now: () => new Date('2026-09-14T12:34:56.789Z'),
    suffix: () => 'a1b2',
  });
  return { root, dataDir, backupsDir, authPath, stateStore, calls, service };
}

function cleanup(h) {
  try { h.stateStore.close(); } catch {}
  rmSync(h.root, { recursive: true, force: true });
}

test('creates a validated backup with sqlite, LocalAuth manifest and reconnects WhatsApp', async () => {
  const h = harness();
  try {
    h.stateStore.saveChatSession('5511999999999', { step: 'awaiting_payment', orderId: 'PS-1001' });
    const backup = await h.service.createBackup();
    assert.match(backup.id, /^backup-20260914-123456-789-a1b2$/);
    assert.equal(backup.reason, 'manual');
    assert.equal(backup.hasWhatsAppSession, true);
    assert.deepEqual(h.calls, ['disconnect', 'connect']);
    const folder = join(h.backupsDir, backup.id);
    assert.equal(existsSync(join(folder, 'prismastore.db')), true);
    assert.equal(readFileSync(join(folder, 'whatsapp-auth', 'session-prismastore-main', 'session.json'), 'utf8'), 'auth-v1');
    const manifest = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8'));
    assert.equal(manifest.appVersion, '0.8.0');
    assert.equal(manifest.files.some((file) => file.path === 'prismastore.db' && /^[a-f0-9]{64}$/.test(file.sha256)), true);
    assert.equal((await h.service.validateBackup(backup.id)).valid, true);
  } finally { cleanup(h); }
});

test('creates backup without WhatsApp session when LocalAuth does not exist', async () => {
  const h = harness({ connected: false, withAuth: false });
  try {
    const backup = await h.service.createBackup();
    assert.equal(backup.hasWhatsAppSession, false);
    assert.deepEqual(h.calls, []);
  } finally { cleanup(h); }
});

test('rejects path traversal and corrupted backup before restoration', async () => {
  const h = harness({ connected: false });
  try {
    await assert.rejects(() => h.service.validateBackup('../outside'), /Backup inválido/);
    const backup = await h.service.createBackup();
    writeFileSync(join(h.backupsDir, backup.id, 'prismastore.db'), 'corrupted');
    await assert.rejects(() => h.service.restoreBackup(backup.id), /integridade|corrompido|hash/i);
    assert.deepEqual(h.stateStore.load(), seed());
  } finally { cleanup(h); }
});

test('restores sqlite and LocalAuth and creates a pre-restore safety backup', async () => {
  const h = harness();
  try {
    h.stateStore.saveChatSession('5511999999999', { step: 'paid', orderId: 'PS-1001' });
    const original = await h.service.createBackup();
    const changed = seed();
    changed.products[0].stock = 1;
    changed.orders[0].status = 'DELIVERED';
    h.stateStore.save(changed);
    h.stateStore.saveChatSession('5511999999999', { step: 'catalog' });
    writeFileSync(join(h.authPath, 'session-prismastore-main', 'session.json'), 'auth-v2');
    const result = await h.service.restoreBackup(original.id);
    assert.equal(result.restored, true);
    assert.equal(result.backupId, original.id);
    assert.match(result.safetyBackupId, /^backup-/);
    assert.notEqual(result.safetyBackupId, original.id);
    assert.deepEqual(h.stateStore.load(), seed());
    assert.deepEqual(h.stateStore.getChatSession('5511999999999'), { step: 'paid', orderId: 'PS-1001' });
    assert.equal(readFileSync(join(h.authPath, 'session-prismastore-main', 'session.json'), 'utf8'), 'auth-v1');
    assert.equal(h.service.listBackups().some((item) => item.reason === 'pre-restore'), true);
  } finally { cleanup(h); }
});
