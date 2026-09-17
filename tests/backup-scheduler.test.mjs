import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupScheduler } from '../server/backup-scheduler.js';

test('automatic backup scheduler runs backup with automatic reason and records success', async () => {
  const calls = [];
  const scheduler = createBackupScheduler({
    backupService: { createBackup: async (input) => { calls.push(input); return { id: 'backup-1' }; } },
    intervalMs: 24 * 60 * 60 * 1000,
    now: () => new Date('2026-09-17T15:00:00.000Z'),
  });

  const result = await scheduler.run();
  assert.equal(result.id, 'backup-1');
  assert.deepEqual(calls, [{ reason: 'automatic' }]);
  assert.equal(scheduler.getStatus().lastSuccessAt, '2026-09-17T15:00:00.000Z');
  assert.equal(scheduler.getStatus().lastError, null);
});

test('automatic backup scheduler starts one interval and can stop it', () => {
  const scheduled = [];
  const cleared = [];
  const scheduler = createBackupScheduler({
    backupService: { createBackup: async () => ({ id: 'backup-1' }) },
    intervalMs: 12345,
    setIntervalFn: (callback, delay) => { scheduled.push({ callback, delay }); return 'timer-1'; },
    clearIntervalFn: (timer) => cleared.push(timer),
  });

  scheduler.start();
  scheduler.start();
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 12345);
  assert.equal(scheduler.getStatus().running, true);

  scheduler.stop();
  assert.deepEqual(cleared, ['timer-1']);
  assert.equal(scheduler.getStatus().running, false);
});
