const DEFAULT_INTERVAL_HOURS = 24;

export function startBackupScheduler({
  backupService,
  intervalHours = DEFAULT_INTERVAL_HOURS,
  now = () => Date.now(),
  schedule = setInterval,
  clearSchedule = clearInterval,
} = {}) {
  if (!backupService) throw new Error('Backup service é obrigatório para o scheduler.');
  const intervalMs = Math.max(1, Number(intervalHours) || DEFAULT_INTERVAL_HOURS) * 60 * 60_000;
  let running = null;

  async function runIfDue() {
    if (running) return running;
    const latestScheduled = backupService.listBackups()
      .filter((backup) => backup.reason === 'scheduled')
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    if (latestScheduled) {
      const createdAt = Date.parse(latestScheduled.createdAt);
      if (Number.isFinite(createdAt) && now() - createdAt < intervalMs) return null;
    }
    running = Promise.resolve(backupService.createBackup({ reason: 'scheduled' })).finally(() => { running = null; });
    return running;
  }

  const timer = schedule(() => { runIfDue().catch(() => {}); }, Math.min(intervalMs, 60 * 60_000));
  function stop() { if (timer !== null && timer !== undefined) clearSchedule(timer); }
  return { runIfDue, stop };
}
