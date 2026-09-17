import test from 'node:test';
import assert from 'node:assert/strict';

async function loadFactory() {
  const mod = await import('../server/backup-scheduler.js').catch(() => null);
  return mod?.startBackupScheduler ?? null;
}

test('scheduler creates scheduled backup when none exists', async () => {
  const startBackupScheduler = await loadFactory();
  assert.equal(typeof startBackupScheduler, 'function', 'scheduler factory must exist');
  const calls = [];
  const service = { listBackups: () => [], createBackup: async (input) => { calls.push(input); return { id: 'b1' }; } };
  const scheduler = startBackupScheduler({ backupService: service, intervalHours: 24, schedule: () => 99, clearSchedule() {} });
  await scheduler.runIfDue();
  assert.deepEqual(calls, [{ reason: 'scheduled' }]);
  scheduler.stop();
});

test('scheduler skips a recent scheduled backup and runs after interval elapses', async () => {
  const startBackupScheduler = await loadFactory();
  assert.equal(typeof startBackupScheduler, 'function', 'scheduler factory must exist');
  let nowMs = Date.parse('2026-09-17T15:00:00.000Z');
  const calls = [];
  const backups = [{ reason: 'scheduled', createdAt: '2026-09-17T10:00:00.000Z' }];
  const service = { listBackups: () => backups, createBackup: async (input) => { calls.push(input); return { id: 'b2' }; } };
  const scheduler = startBackupScheduler({ backupService: service, intervalHours: 24, now: () => nowMs, schedule: () => 5, clearSchedule() {} });
  assert.equal(await scheduler.runIfDue(), null);
  nowMs = Date.parse('2026-09-18T11:00:01.000Z');
  assert.deepEqual(await scheduler.runIfDue(), { id: 'b2' });
  assert.equal(calls.length, 1);
  scheduler.stop();
});

test('stop clears the installed interval', async () => {
  const startBackupScheduler = await loadFactory();
  assert.equal(typeof startBackupScheduler, 'function', 'scheduler factory must exist');
  let cleared = null;
  const scheduler = startBackupScheduler({ backupService: { listBackups: () => [], createBackup: async () => ({}) }, schedule: () => 42, clearSchedule: (id) => { cleared = id; } });
  scheduler.stop();
  assert.equal(cleared, 42);
});
