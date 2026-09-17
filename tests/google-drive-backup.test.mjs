import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGoogleDriveBackupStore } from '../server/google-drive-backup.js';

test('uploads a compressed backup bundle to PrismaStore Backups', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ps-drive-'));
  const backupPath = join(dir, 'backup-20260917-120000-000-abcd');
  mkdirSync(backupPath, { recursive: true });
  writeFileSync(join(backupPath, 'prismastore.db'), Buffer.from('db'));
  writeFileSync(join(backupPath, 'manifest.json'), '{"schemaVersion":1}');
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/upload/drive/v3/files')) return new Response(JSON.stringify({ id: 'file-test' }), { status: 200 });
    if (String(url).includes('/drive/v3/files?')) return new Response(JSON.stringify({ files: [] }), { status: 200 });
    if (String(url).endsWith('/drive/v3/files')) return new Response(JSON.stringify({ id: 'folder-test' }), { status: 200 });
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const drive = createGoogleDriveBackupStore({
      enabled: true,
      accessTokenProvider: async () => 'access-test',
      fetchImpl,
      now: () => new Date('2026-09-17T15:00:00.000Z'),
      retentionCount: 0,
    });
    const result = await drive.uploadBackup({ id: 'backup-20260917-120000-000-abcd', path: backupPath });
    assert.equal(result.uploaded, true);
    assert.equal(result.fileId, 'file-test');
    assert.match(result.fileName, /\.json\.gz$/);
    assert.equal(drive.getStatus().lastSuccessAt, '2026-09-17T15:00:00.000Z');
    assert.ok(calls.some((url) => url.includes('/upload/drive/v3/files')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deletes oldest Drive backups beyond configured retention count', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ps-drive-retention-'));
  const backupPath = join(dir, 'backup-20260917-120000-000-abcd');
  mkdirSync(backupPath, { recursive: true });
  writeFileSync(join(backupPath, 'prismastore.db'), 'db');
  const calls = [];
  let listCount = 0;
  const fetchImpl = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, method: options.method || 'GET' });
    if (href.includes('/upload/drive/v3/files')) return new Response(JSON.stringify({ id: 'new-file', name: 'new.json.gz' }), { status: 200 });
    if (href.includes('/drive/v3/files?')) {
      listCount += 1;
      if (listCount === 1) return new Response(JSON.stringify({ files: [{ id: 'folder-1', name: 'PrismaStore Backups' }] }), { status: 200 });
      return new Response(JSON.stringify({ files: [
        { id: 'new-file', name: 'backup-3.json.gz', createdTime: '2026-09-17T15:00:00Z' },
        { id: 'old-2', name: 'backup-2.json.gz', createdTime: '2026-09-16T15:00:00Z' },
        { id: 'old-1', name: 'backup-1.json.gz', createdTime: '2026-09-15T15:00:00Z' },
      ] }), { status: 200 });
    }
    if (href.includes('/drive/v3/files/old-1') && options.method === 'DELETE') return new Response('', { status: 204 });
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const drive = createGoogleDriveBackupStore({ enabled: true, accessTokenProvider: async () => 'access-test', fetchImpl, retentionCount: 2 });
    await drive.uploadBackup({ id: 'backup-20260917-120000-000-abcd', path: backupPath });
    assert.ok(calls.some((call) => call.method === 'DELETE' && call.href.includes('/drive/v3/files/old-1')));
    assert.equal(drive.getStatus().retentionCount, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reports disabled when Drive sync is not configured', () => {
  const drive = createGoogleDriveBackupStore({ enabled: false });
  assert.equal(drive.getStatus().configured, false);
});
