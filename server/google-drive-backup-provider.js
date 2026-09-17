import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ROOT_FOLDER_NAME = 'PrismaStore Backups';

function escapeQuery(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function jsonResponse(response, label) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${label}: ${payload?.error?.message || payload?.error_description || response.status}`);
  return payload;
}

export function createGoogleDriveBackupProvider({
  clientId = '',
  clientSecret = '',
  refreshToken = '',
  parentFolderId = '',
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
} = {}) {
  const configured = Boolean(clientId && clientSecret && refreshToken && typeof fetchImpl === 'function');
  let accessToken = null;
  let tokenExpiresAt = 0;
  let cachedRootFolderId = parentFolderId || null;

  async function token() {
    if (accessToken && tokenExpiresAt > now() + 60_000) return accessToken;
    if (!configured) throw new Error('Google Drive não configurado.');
    const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' });
    const response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const payload = await jsonResponse(response, 'Falha ao autenticar no Google Drive');
    accessToken = payload.access_token;
    tokenExpiresAt = now() + Number(payload.expires_in || 3600) * 1000;
    return accessToken;
  }

  async function driveRequest(url, init = {}, label = 'Falha no Google Drive') {
    const authToken = await token();
    const response = await fetchImpl(url, {
      ...init,
      headers: { authorization: `Bearer ${authToken}`, ...(init.headers || {}) },
    });
    return jsonResponse(response, label);
  }

  async function findFolder(name, parentId = null) {
    const clauses = [
      `name = '${escapeQuery(name)}'`,
      `mimeType = '${FOLDER_MIME}'`,
      'trashed = false',
    ];
    if (parentId) clauses.push(`'${escapeQuery(parentId)}' in parents`);
    const params = new URLSearchParams({ q: clauses.join(' and '), fields: 'files(id,name)', pageSize: '1' });
    const payload = await driveRequest(`https://www.googleapis.com/drive/v3/files?${params}`, { method: 'GET' }, 'Falha ao localizar pasta no Google Drive');
    return payload.files?.[0]?.id || null;
  }

  async function createFolder(name, parentId = null) {
    const metadata = { name, mimeType: FOLDER_MIME };
    if (parentId) metadata.parents = [parentId];
    const payload = await driveRequest('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(metadata),
    }, 'Falha ao criar pasta no Google Drive');
    return payload.id;
  }

  async function ensureFolder(name, parentId = null) {
    return (await findFolder(name, parentId)) || createFolder(name, parentId);
  }

  async function rootFolderId() {
    if (cachedRootFolderId) return cachedRootFolderId;
    cachedRootFolderId = await ensureFolder(ROOT_FOLDER_NAME);
    return cachedRootFolderId;
  }

  async function uploadFile(path, name, parentId) {
    const boundary = `prismastore-${randomBytes(8).toString('hex')}`;
    const metadata = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parentId] })}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`);
    const ending = Buffer.from(`\r\n--${boundary}--`);
    const body = Buffer.concat([metadata, readFileSync(path), ending]);
    return driveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
      method: 'POST',
      headers: { 'content-type': `multipart/related; boundary=${boundary}` },
      body,
    }, `Falha ao enviar ${name} para o Google Drive`);
  }

  async function uploadDirectory(path, parentId) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const childPath = join(path, entry.name);
      if (entry.isDirectory()) {
        const folderId = await ensureFolder(entry.name, parentId);
        await uploadDirectory(childPath, folderId);
      } else if (entry.isFile()) {
        await uploadFile(childPath, entry.name, parentId);
      }
    }
  }

  async function uploadBackupDirectory({ id, path }) {
    if (!configured) throw new Error('Google Drive não configurado.');
    const rootId = await rootFolderId();
    const backupFolderId = await ensureFolder(String(id || basename(path)), rootId);
    await uploadDirectory(path, backupFolderId);
    return { provider: 'google-drive', remoteFolderId: backupFolderId };
  }

  function getStatus() {
    return { provider: 'google-drive', configured, rootFolderId: cachedRootFolderId };
  }

  return { provider: 'google-drive', configured, uploadBackupDirectory, getStatus };
}
