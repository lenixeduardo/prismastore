import { createBackupService } from './backup-service.js';
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const BRAND_ICON_SOURCES = {
  '/icons/favicon-16.png': 'icons/generated/favicon-16.b64',
  '/icons/favicon-32.png': 'icons/generated/favicon-32.b64',
  '/icons/apple-touch-icon.png': 'icons/generated/apple-touch-icon.b64',
  '/icons/icon-192.png': 'icons/generated/icon-192.b64',
  '/icons/icon-512.png': 'icons/generated/icon-512.b64',
};

function sendJson(res, statusCode, value, headers = {}) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(value));
}

function sendCsv(res, filename, csv) {
  res.writeHead(200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${filename}"`,
    'cache-control': 'no-store',
  });
  res.end(csv);
}

function stateForAdmin(state = {}) {
  return {
    ...state,
    orders: Array.isArray(state.orders)
      ? state.orders.map((order) => ({
          ...order,
          address: order?.address && typeof order.address === 'object' && !Array.isArray(order.address)
            ? order.address
            : {},
        }))
      : [],
  };
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Payload muito grande');
  }
  if (!body) return {};
  return JSON.parse(body);
}

function parseCookies(header = '') {
  return String(header)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf('=');
      if (separator <= 0) return cookies;
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      try { cookies[key] = decodeURIComponent(value); } catch { cookies[key] = value; }
      return cookies;
    }, {});
}

function sessionToken(req, authService) {
  if (!authService) return null;
  return parseCookies(req.headers.cookie || '')[authService.cookieName] || null;
}

function clientKey(req, username = '') {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const remote = forwarded || req.socket?.remoteAddress || 'unknown';
  return `${remote}:${String(username || '').trim().toLowerCase()}`;
}

function secureRequest(req, forceSecureCookies) {
  if (forceSecureCookies) return true;
  return String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
}

function sessionCookie({ authService, token, secure = false, clear = false }) {
  const parts = [
    `${authService.cookieName}=${clear ? '' : encodeURIComponent(token || '')}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    clear ? 'Max-Age=0' : 'Max-Age=43200',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function serveGeneratedIcon(staticDir, pathname, method, res) {
  const source = BRAND_ICON_SOURCES[pathname];
  if (!source) return false;
  const sourcePath = resolve(join(staticDir, source));
  if (!existsSync(sourcePath)) {
    sendJson(res, 404, { error: 'Ícone da marca não encontrado' });
    return true;
  }
  const buffer = Buffer.from(readFileSync(sourcePath, 'utf8').trim(), 'base64');
  res.writeHead(200, {
    'content-type': 'image/png',
    'content-length': buffer.length,
    'cache-control': 'public, max-age=3600',
  });
  res.end(method === 'HEAD' ? undefined : buffer);
  return true;
}

function serveStatic(staticDir, pathname, res) {
  const root = resolve(staticDir);
  const requested = pathname === '/' ? '/index.html' : pathname;
  const cleanPath = normalize(decodeURIComponent(requested)).replace(/^([/\\])+/, '');
  const filePath = resolve(join(root, cleanPath));
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    sendJson(res, 403, { error: 'Caminho inválido' });
    return;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    sendJson(res, 404, { error: 'Não encontrado' });
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}

export function createAppServer({
  stateStore,
  staticDir,
  whatsappManager = null,
  paymentService = null,
  orderLifecycleService = null,
  reportService = null,
  backupService = null,
  whatsappAuthPath = null,
  whatsappAuthProvider = 'baileys',
  authService = null,
  secureCookies = false,
}) {
  const resolvedBackupService = backupService ?? createBackupService({
    stateStore,
    whatsappManager,
    authPath: whatsappAuthPath ?? join(staticDir, 'data', 'whatsapp-auth'),
    whatsappAuthProvider,
    backupsDir: join(staticDir, 'backups'),
    appVersion: '0.9.2',
  });

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/api/auth/status') {
        if (!authService) return sendJson(res, 200, { configured: false, authenticated: true, username: null });
        const status = authService.getStatus(sessionToken(req, authService));
        sendJson(res, 200, { configured: true, ...status });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/login') {
        if (!authService) return sendJson(res, 200, { configured: false, authenticated: true });
        const body = await readJson(req);
        const result = authService.login({
          username: body.username,
          password: body.password,
          key: clientKey(req, body.username),
        });
        if (!result.ok) {
          const locked = result.reason === 'locked';
          const retrySeconds = Math.max(1, Math.ceil(Number(result.retryAfterMs || 0) / 1000));
          return sendJson(
            res,
            locked ? 429 : 401,
            { error: locked ? 'Muitas tentativas. Aguarde antes de tentar novamente.' : 'Usuário ou senha inválidos.', reason: result.reason, retryAfterSeconds: locked ? retrySeconds : null },
            locked ? { 'retry-after': String(retrySeconds) } : {},
          );
        }
        sendJson(res, 200, { configured: true, authenticated: true, username: result.username, expiresAt: result.expiresAt }, {
          'set-cookie': sessionCookie({
            authService,
            token: result.token,
            secure: secureRequest(req, secureCookies),
          }),
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
        if (!authService) return sendJson(res, 200, { authenticated: false });
        authService.logout(sessionToken(req, authService));
        sendJson(res, 200, { authenticated: false }, {
          'set-cookie': sessionCookie({ authService, clear: true, secure: secureRequest(req, secureCookies) }),
        });
        return;
      }

      if (url.pathname.startsWith('/api/') && authService) {
        const auth = authService.validateSession(sessionToken(req, authService));
        if (!auth.authenticated) {
          sendJson(res, 401, { error: 'Autenticação necessária.', code: 'AUTH_REQUIRED' });
          return;
        }
      }

      if (req.method === 'GET' && url.pathname === '/api/state') {
        sendJson(res, 200, stateForAdmin(stateStore.load()));
        return;
      }

      if (req.method === 'PUT' && url.pathname === '/api/state') {
        const state = await readJson(req);
        sendJson(res, 200, stateStore.save(state));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/whatsapp/status') {
        if (!whatsappManager) return sendJson(res, 503, { status: 'error', qrDataUrl: null, pairingCode: null, account: null, error: 'WhatsApp não configurado' });
        sendJson(res, 200, whatsappManager.getStatus());
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/whatsapp/connect') {
        if (!whatsappManager) return sendJson(res, 503, { status: 'error', qrDataUrl: null, pairingCode: null, account: null, error: 'WhatsApp não configurado' });
        sendJson(res, 200, await whatsappManager.connect());
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/whatsapp/pair') {
        if (!whatsappManager?.requestPairingCode) return sendJson(res, 503, { error: 'Pareamento por telefone não configurado' });
        const body = await readJson(req);
        sendJson(res, 200, await whatsappManager.requestPairingCode(body.phone));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/whatsapp/disconnect') {
        if (!whatsappManager) return sendJson(res, 503, { status: 'error', qrDataUrl: null, pairingCode: null, account: null, error: 'WhatsApp não configurado' });
        sendJson(res, 200, await whatsappManager.disconnect());
        return;
      }

      const advanceMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/advance$/);
      if (req.method === 'POST' && advanceMatch) {
        if (!orderLifecycleService) return sendJson(res, 503, { error: 'Fluxo operacional não configurado' });
        const body = await readJson(req);
        const result = await orderLifecycleService.advanceOrder({
          orderId: decodeURIComponent(advanceMatch[1]),
          expectedStatus: body.expectedStatus || null,
        });
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/reports/monthly') {
        if (!reportService) return sendJson(res, 503, { error: 'Relatórios não configurados' });
        const month = url.searchParams.get('month') || '';
        sendJson(res, 200, reportService.getMonthlyReport(month));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/reports/monthly.csv') {
        if (!reportService) return sendJson(res, 503, { error: 'Relatórios não configurados' });
        const month = url.searchParams.get('month') || '';
        sendCsv(res, `prismastore-${month}.csv`, reportService.exportMonthlyCsv(month));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/backups') {
        sendJson(res, 200, {
          backups: resolvedBackupService.listBackups(),
          external: resolvedBackupService.getExternalStatus?.() ?? null,
          schedule: resolvedBackupService.getScheduleStatus?.() ?? null,
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/backups') {
        sendJson(res, 200, await resolvedBackupService.createBackup({ reason: 'manual' }));
        return;
      }

      const restoreBackupMatch = url.pathname.match(/^\/api\/backups\/([^/]+)\/restore$/);
      if (req.method === 'POST' && restoreBackupMatch) {
        sendJson(res, 200, await resolvedBackupService.restoreBackup(decodeURIComponent(restoreBackupMatch[1])));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/payments/status') {
        if (!paymentService) return sendJson(res, 503, { provider: 'pix-local', environment: 'local', configured: false });
        sendJson(res, 200, paymentService.getStatus());
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/payments/demo-pix') {
        if (!paymentService?.generateDemoPix) return sendJson(res, 503, { error: 'Pix de demonstração não configurado' });
        const amount = Number(url.searchParams.get('amount'));
        sendJson(res, 200, await paymentService.generateDemoPix({ amount }));
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'Endpoint não encontrado' });
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendJson(res, 405, { error: 'Método não permitido' });
        return;
      }

      if (serveGeneratedIcon(staticDir, url.pathname, req.method, res)) return;
      serveStatic(staticDir, url.pathname, res);
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Erro inesperado' });
    }
  });
}
