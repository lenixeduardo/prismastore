export function createBackupScheduler({
  backupService,
  intervalMs = 24 * 60 * 60 * 1000,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  now = () => new Date(),
} = {}) {
  if (!backupService?.createBackup) throw new Error('Serviço de backup não configurado.');
  const safeIntervalMs = Math.max(60_000, Number(intervalMs) || 24 * 60 * 60 * 1000);
  let timer = null;
  let activeRun = null;
  let lastSuccessAt = null;
  let lastError = null;

  async function run() {
    if (activeRun) return activeRun;
    activeRun = (async () => {
      try {
        const result = await backupService.createBackup({ reason: 'automatic' });
        lastSuccessAt = now().toISOString();
        lastError = null;
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Falha no backup automático.';
        throw error;
      } finally {
        activeRun = null;
      }
    })();
    return activeRun;
  }

  function start() {
    if (timer) return getStatus();
    timer = setIntervalFn(() => {
      run().catch(() => {});
    }, safeIntervalMs);
    timer?.unref?.();
    return getStatus();
  }

  function stop() {
    if (timer) clearIntervalFn(timer);
    timer = null;
    return getStatus();
  }

  function getStatus() {
    return {
      enabled: true,
      running: Boolean(timer),
      intervalMs: safeIntervalMs,
      intervalHours: Number((safeIntervalMs / 3_600_000).toFixed(2)),
      lastSuccessAt,
      lastError,
    };
  }

  return { run, start, stop, getStatus };
}
