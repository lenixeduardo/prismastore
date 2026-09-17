import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { basename, join, relative, resolve, sep } from 'node:path';

const BACKUP_ID = /^backup-\d{8}-\d{6}-\d{3}-[a-f0-9]{4}(?:-\d{2})?$/;

function pad(value, width = 2) {
  return String(value).padStart(width, '0');
}

function timestampForId(date) {
  return [date.getUTCFullYear(), pad(date.getUTCMonth() + 1), pad(date.getUTCDate())].join('') + '-' +
    [pad(date.getUTCHours()), pad(date.getUTCMinutes()), pad(date.getUTCSeconds())].join('') + '-' +
    pad(date.getUTCMilliseconds(), 3);
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function ensureInside(root, candidate) {
  const safeRoot = resolve(root);
  const safeCandidate = resolve(candidate);
  if (safeCandidate !== safeRoot && !safeCandidate.startsWith(`${safeRoot}${sep}`)) {
    throw new Error('Backup inválido: caminho fora da pasta de backups.');
  }
  return safeCandidate;
}

function assertBackupId(id) {
  if (!BACKUP_ID.test(String(id ?? ''))) throw new Error('Backup inválido.');
}

function copyDirectory(source, destination) {
  if (!existsSync(source)) return false;
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    const info = lstatSync(from);
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) copyDirectory(from, to);
    else if (info.isFile()) copyFileSync(from, to);
  }
  return true;
}

function collectFiles(root, current = root) {
  if (!existsSync(current)) return [];
  const result = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) result.push(...collectFiles(root, path));
    else if (entry.isFile() && entry.name !== 'manifest.json') {
      result.push({
        path: relative(root, path).split(sep).join('/'),
        size: statSync(path).size,
        sha256: hashFile(path),
      });
    }
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

function summaryFromManifest(id, manifest) {
  return {
    id,
    createdAt: manifest.createdAt,
    reason: manifest.reason,
    appVersion: manifest.appVersion,
    hasWhatsAppSession: Boolean(manifest.hasWhatsAppSession),
    whatsappAuthProvider: manifest.whatsappAuthProvider || null,
    fileCount: Array.isArray(manifest.files) ? manifest.files.length : 0,
    totalBytes: Array.isArray(manifest.files) ? manifest.files.reduce((sum, file) => sum + Number(file.size || 0), 0) : 0,
  };
}

function wasActive(status) {
  return ['connected', 'authenticated', 'connecting', 'qr', 'pairing'].includes(status);
}

export function createBackupService({
  stateStore,
  whatsappManager = null,
  authPath,
  backupsDir,
  appVersion = 'unknown',
  whatsappAuthProvider = 'baileys',
  externalBackupStore = null,
  scheduleStatusProvider = null,
  now = () => new Date(),
  suffix = () => randomBytes(2).toString('hex'),
}) {
  mkdirSync(backupsDir, { recursive: true });

  function makeBackupId() {
    const base = `backup-${timestampForId(now())}-${suffix()}`;
    let id = base;
    let counter = 1;
    while (existsSync(join(backupsDir, id))) {
      id = `${base}-${pad(counter)}`;
      counter += 1;
    }
    return id;
  }

  function backupPath(id) {
    assertBackupId(id);
    return ensureInside(backupsDir, join(backupsDir, id));
  }

  async function createSnapshot({ reason = 'manual' } = {}) {
    const id = makeBackupId();
    const destination = backupPath(id);
    const temp = ensureInside(backupsDir, `${destination}.tmp`);
    rmSync(temp, { recursive: true, force: true });
    mkdirSync(temp, { recursive: true });
    try {
      await stateStore.backupTo(join(temp, 'prismastore.db'));
      const hasWhatsAppSession = copyDirectory(authPath, join(temp, 'whatsapp-auth'));
      const files = collectFiles(temp);
      const manifest = {
        schemaVersion: 1,
        appVersion,
        createdAt: now().toISOString(),
        reason,
        hasWhatsAppSession,
        whatsappAuthProvider,
        database: 'prismastore.db',
        files,
      };
      writeFileSync(join(temp, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      renameSync(temp, destination);
      return summaryFromManifest(id, manifest);
    } catch (error) {
      rmSync(temp, { recursive: true, force: true });
      throw error;
    }
  }

  async function withWhatsappPaused(action, { reconnect = true } = {}) {
    const initialStatus = whatsappManager?.getStatus?.()?.status ?? 'disconnected';
    const active = wasActive(initialStatus);
    if (active && whatsappManager?.disconnect) await whatsappManager.disconnect();
    try {
      return await action();
    } finally {
      if (active && reconnect && whatsappManager?.connect) await whatsappManager.connect();
    }
  }

  async function syncExternal(summary) {
    if (!externalBackupStore?.uploadBackup) return { uploaded: false, skipped: true, reason: 'not_configured' };
    try {
      return await externalBackupStore.uploadBackup({
        id: summary.id,
        path: backupPath(summary.id),
        summary,
      });
    } catch (error) {
      return {
        uploaded: false,
        error: error instanceof Error ? error.message : 'Falha ao sincronizar backup externo.',
      };
    }
  }

  async function createBackup({ reason = 'manual' } = {}) {
    return withWhatsappPaused(async () => {
      const summary = await createSnapshot({ reason });
      const external = await syncExternal(summary);
      return { ...summary, external };
    }, { reconnect: true });
  }

  function listBackups() {
    if (!existsSync(backupsDir)) return [];
    return readdirSync(backupsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && BACKUP_ID.test(entry.name))
      .map((entry) => {
        try {
          const manifest = JSON.parse(readFileSync(join(backupsDir, entry.name, 'manifest.json'), 'utf8'));
          return summaryFromManifest(entry.name, manifest);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async function validateBackup(id) {
    const root = backupPath(id);
    if (!existsSync(root)) throw new Error('Backup inválido: não encontrado.');
    const manifestPath = join(root, 'manifest.json');
    if (!existsSync(manifestPath)) throw new Error('Backup inválido: manifesto ausente.');
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      throw new Error('Backup inválido: manifesto corrompido.');
    }
    if (manifest.schemaVersion !== 1 || manifest.database !== 'prismastore.db' || !Array.isArray(manifest.files)) {
      throw new Error('Backup inválido: formato de manifesto incompatível.');
    }
    if (!manifest.files.find((file) => file.path === 'prismastore.db')) {
      throw new Error('Backup inválido: banco não listado no manifesto.');
    }

    for (const file of manifest.files) {
      const relativePath = String(file.path ?? '');
      if (!relativePath || relativePath.startsWith('/') || relativePath.includes('..')) {
        throw new Error('Backup inválido: caminho inseguro no manifesto.');
      }
      const path = ensureInside(root, join(root, relativePath));
      if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`Falha de integridade: ${relativePath} ausente.`);
      if (statSync(path).size !== Number(file.size) || hashFile(path) !== file.sha256) {
        throw new Error(`Falha de integridade: hash inválido em ${relativePath}.`);
      }
    }
    return { valid: true, id, manifest, path: root };
  }

  function restoreAuthFrom(root, manifest) {
    rmSync(authPath, { recursive: true, force: true });
    const compatible = manifest.hasWhatsAppSession && manifest.whatsappAuthProvider === whatsappAuthProvider;
    if (compatible) copyDirectory(join(root, 'whatsapp-auth'), authPath);
  }

  async function restoreBackup(id) {
    const target = await validateBackup(id);
    const initialStatus = whatsappManager?.getStatus?.()?.status ?? 'disconnected';
    const active = wasActive(initialStatus);
    if (active && whatsappManager?.disconnect) await whatsappManager.disconnect();

    let safety = null;
    try {
      safety = await createSnapshot({ reason: 'pre-restore' });
      stateStore.restoreFrom(join(target.path, target.manifest.database));
      restoreAuthFrom(target.path, target.manifest);
      if (active && whatsappManager?.connect) await whatsappManager.connect();
      return { restored: true, backupId: id, safetyBackupId: safety.id };
    } catch (error) {
      if (safety) {
        try {
          const rollback = await validateBackup(safety.id);
          stateStore.restoreFrom(join(rollback.path, rollback.manifest.database));
          restoreAuthFrom(rollback.path, rollback.manifest);
        } catch {}
      }
      if (active && whatsappManager?.connect) {
        try { await whatsappManager.connect(); } catch {}
      }
      throw error;
    }
  }

  function getExternalStatus() {
    return externalBackupStore?.getStatus?.() ?? {
      provider: 'google-drive',
      configured: false,
      folderName: 'PrismaStore Backups',
      lastSuccessAt: null,
      lastError: null,
    };
  }

  function getScheduleStatus() {
    return scheduleStatusProvider?.() ?? null;
  }

  return {
    listBackups,
    createBackup,
    validateBackup,
    restoreBackup,
    getExternalStatus,
    getScheduleStatus,
    backupsDir: basename(backupsDir),
  };
}
