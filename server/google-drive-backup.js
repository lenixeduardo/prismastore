import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const DRIVE_API = 'https://www.googleapis.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function collectBundleFiles(root, current = root) {
  if (!existsSync(current)) return [];
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    const info = lstatSync(path);
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) files.push(...collectBundleFiles(root, path));
    else if (info.isFile()) {
      files.push({
        path: relative(root, path).split(sep).join('/'),
        base64: readFileSync(path).toString('base64'),
      });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function bundleBackup({ id, path }) {
  const payload = {
    format: 'prismastore-backup-bundle-v1',
    backupId: id,
    files: collectBundleFiles(path),
  };
  return gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'), { level: 9 });
}

async function jsonResponse(response, message) {
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || message);
  return payload;
}

export function createGoogleDriveAccessTokenProvider({
  clientId,
  clientSecret,
  refreshToken,
  fetchImpl = fetch,
} = {}) {
  const configured = Boolean(clientId && clientSecret && refreshToken);
  return async function getAccessToken() {
    if (!configured) throw new Error('Google Drive não configurado.');
    const body = new URLSearchParams({
      client_id: String(clientId),
      client_secret: String(clientSecret),
      refresh_token: String(refreshToken),
      grant_type: 'refresh_token',
    });
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const payload = await jsonResponse(response, 'Falha ao autenticar no Google Drive.');
    if (!payload.access_token) throw new Error('Google Drive não retornou token de acesso.');
    return payload.access_token;
  };
}

export function createGoogleDriveBackupStore({
  enabled = false,
  accessTokenProvider = null,
  fetchImpl = fetch,
  folderName = 'PrismaStore Backups',
  now = () => new Date(),
} = {}) {
  let lastSuccessAt = null;
  let lastError = null;
  let folderId = null;
  const configured = Boolean(enabled && accessTokenProvider);

  function getStatus() {
    return {
      provider: 'google-drive',
      configured,
      folderName,
      lastSuccessAt,
      lastError,
    };
  }

  async function driveJson(url, options = {}) {
    const token = await accessTokenProvider();
    const response = await fetchImpl(url, {
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    return jsonResponse(response, 'Falha ao acessar o Google Drive.');
  }

  async function ensureFolder() {
    if (folderId) return folderId;
    const escaped = folderName.replace(/'/g, "\\'");
    const query = `name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchUrl = `${DRIVE_API}/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent('files(id,name)')}&pageSize=1`;
    const found = await driveJson(searchUrl);
    if (found.files?.[0]?.id) {
      folderId = found.files[0].id;
      return folderId;
    }
    const created = await driveJson(`${DRIVE_API}/drive/v3/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!created.id) throw new Error('Não foi possível criar a pasta de backup no Google Drive.');
    folderId = created.id;
    return folderId;
  }

  async function uploadBackup({ id, path }) {
    if (!configured) return { uploaded: false, skipped: true, reason: 'not_configured' };
    try {
      const parentId = await ensureFolder();
      const fileName = `${id}.json.gz`;
      const compressed = bundleBackup({ id, path });
      const metadata = { name: fileName, parents: [parentId], mimeType: 'application/gzip' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([compressed], { type: 'application/gzip' }), fileName);
      const payload = await driveJson(`${DRIVE_API}/upload/drive/v3/files?uploadType=multipart&fields=${encodeURIComponent('id,name')}`, {
        method: 'POST',
        body: form,
      });
      lastSuccessAt = now().toISOString();
      lastError = null;
      return { uploaded: true, fileId: payload.id, fileName: payload.name || fileName, bytes: compressed.length };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Falha ao enviar backup ao Google Drive.';
      throw error;
    }
  }

  return { uploadBackup, getStatus };
}
