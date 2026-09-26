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
  '.webp': 'image/webp',
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

function sendJsonDownload(res, filename, value) {
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-disposition': `attachment; filename="${filename}"`,
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(value, null, 2));
}

function deliveryConfirmationForDashboard(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const {
    confirmationIp: _confirmationIp,
    confirmationUserAgent: _confirmationUserAgent,
    evidenceHash: _evidenceHash,
    lastOpenedIp: _lastOpenedIp,
    lastOpenedUserAgent: _lastOpenedUserAgent,
    ...safeConfirmation
  } = value;
  return safeConfirmation;
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
          deliveryConfirmation: deliveryConfirmationForDashboard(order?.deliveryConfirmation),
        }))
      : [],
  };
}

function preserveDeliveryEvidence(incomingState = {}, currentState = {}) {
  if (!Array.isArray(incomingState.orders)) return incomingState;
  const currentById = new Map(
    (Array.isArray(currentState.orders) ? currentState.orders : [])
      .filter((order) => order?.id)
      .map((order) => [order.id, order]),
  );
  return {
    ...incomingState,
    orders: incomingState.orders.map((order) => {
      const current = currentById.get(order?.id);
      if (!current) return order;
      return {
        ...order,
        ...(current.deliveryJourney ? { deliveryJourney: structuredClone(current.deliveryJourney) } : {}),
        ...(current.deliveryConfirmation ? { deliveryConfirmation: structuredClone(current.deliveryConfirmation) } : {}),
      };
    }),
  };
}

async function readJson(req, maxBytes = 1_000_000) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > maxBytes) throw new Error('Payload muito grande');
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

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function secureRequest(req, forceSecureCookies) {
  if (forceSecureCookies) return true;
  return String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
}

function whatsappFailurePayload(whatsappManager, error, code) {
  const current = whatsappManager?.getStatus?.() ?? {};
  return {
    ...current,
    status: 'error',
    qrDataUrl: current.qrDataUrl ?? null,
    pairingCode: current.pairingCode ?? null,
    account: current.account ?? null,
    error: current.error || (error instanceof Error && error.message ? error.message : 'Falha na conexão com o WhatsApp.'),
    errorCode: current.errorCode ?? null,
    code,
  };
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
  deliveryConfirmationService = null,
  reportService = null,
  backupService = null,
  whatsappAuthPath = null,
  whatsappAuthProvider = 'baileys',
  authService = null,
  secureCookies = false,
  runtimeLogProvider = null,
  appVersion = '0.9.2',
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
          key: clientKey(req),
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
          'set-cookie': sessionCookie({ authService, token: result.token, secure: secureRequest(req, secureCookies) }),
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

      const publicDeliveryMatch = url.pathname.match(/^\/api\/delivery-confirmations\/([^/]+)$/);
      if (publicDeliveryMatch && ['GET', 'POST'].includes(req.method)) {
        if (!deliveryConfirmationService) {
          return sendJson(res, 503, { error: 'Confirmação de entrega não configurada.' });
        }
        const token = decodeURIComponent(publicDeliveryMatch[1]);
        const requestMeta = {
          ip: clientKey(req),
          userAgent: String(req.headers['user-agent'] || ''),
        };
        try {
          if (req.method === 'GET') {
            return sendJson(res, 200, deliveryConfirmationService.getPublicConfirmation(token, requestMeta));
          }
          const body = await readJson(req, 2_500_000);
          const result = deliveryConfirmationService.confirmDelivery({
            token,
            recipientName: body.recipientName,
            accepted: body.accepted === true,
            signatureDataUrl: body.signatureDataUrl || null,
            photoDataUrl: body.photoDataUrl || null,
            notes: body.notes || '',
            requestMeta,
          });
          return sendJson(res, 200, {
            ok: true,
            alreadyConfirmed: result.alreadyConfirmed,
            confirmedAt: result.confirmation?.confirmedAt || result.order?.confirmedAt || null,
          });
        } catch (error) {
          return sendJson(res, req.method === 'GET' ? 404 : 422, {
            error: error instanceof Error ? error.message : 'Não foi possível registrar a confirmação.',
          });
        }
      }

      if (url.pathname.startsWith('/api/') && authService) {
        const auth = authService.validateSession(sessionToken(req, authService));
        if (!auth.authenticated) {
          sendJson(res, 401, { error: 'Autenticação necessária.', code: 'AUTH_REQUIRED' });
          return;
        }
      }

      if (req.method === 'GET' && url.pathname === '/api/debug-report') {
        return sendJson(res, 200, {
          generatedAt: new Date().toISOString(),
          appVersion,
          uptimeSeconds: Math.round(process.uptime()),
          logs: runtimeLogProvider?.getRecent?.(80) ?? [],
        });
      }

      if (req.method === 'GET' && url.pathname === '/api/state') return sendJson(res, 200, stateForAdmin(stateStore.load()));
      if (req.method === 'PUT' && url.pathname === '/api/state') {
        const current = stateStore.load();
        const incoming = await readJson(req);
        const saved = stateStore.save(preserveDeliveryEvidence(incoming, current));
        return sendJson(res, 200, stateForAdmin(saved));
      }

      if (req.method === 'GET' && url.pathname === '/api/whatsapp/status') {
        if (!whatsappManager) return sendJson(res, 503, { status: 'error', qrDataUrl: null, pairingCode: null, account: null, error: 'WhatsApp não configurado' });
        return sendJson(res, 200, whatsappManager.getStatus());
      }
      if (req.method === 'POST' && url.pathname === '/api/whatsapp/connect') {
        if (!whatsappManager) return sendJson(res, 503, { status: 'error', qrDataUrl: null, pairingCode: null, account: null, error: 'WhatsApp não configurado' });
        try {
          return sendJson(res, 200, await whatsappManager.connect());
        } catch (error) {
          runtimeLogProvider?.record?.('erro', error);
          return sendJson(res, 422, whatsappFailurePayload(whatsappManager, error, 'WHATSAPP_CONNECTION_FAILED'));
        }
      }
      if (req.method === 'POST' && url.pathname === '/api/whatsapp/pair') {
        if (!whatsappManager?.requestPairingCode) return sendJson(res, 503, { error: 'Pareamento por telefone não configurado' });
        const body = await readJson(req);
        try {
          return sendJson(res, 200, await whatsappManager.requestPairingCode(body.phone));
        } catch (error) {
          runtimeLogProvider?.record?.('erro', error);
          const current = whatsappManager.getStatus?.() ?? {};
          const message = current.error || (error instanceof Error && error.message
            ? error.message
            : 'Não foi possível gerar o código de pareamento do WhatsApp.');
          return sendJson(res, 422, {
            ...current,
            status: 'error',
            qrDataUrl: current.qrDataUrl ?? null,
            pairingCode: null,
            account: current.account ?? null,
            error: message,
            errorCode: current.errorCode ?? null,
            code: 'WHATSAPP_PAIRING_FAILED',
          });
        }
      }
      if (req.method === 'POST' && url.pathname === '/api/whatsapp/restart') {
        if (!whatsappManager?.restartConnection) return sendJson(res, 503, { status: 'error', error: 'Reinício do WhatsApp não configurado' });
        try {
          return sendJson(res, 200, await whatsappManager.restartConnection());
        } catch (error) {
          runtimeLogProvider?.record?.('erro', error);
          return sendJson(res, 422, whatsappFailurePayload(whatsappManager, error, 'WHATSAPP_RESTART_FAILED'));
        }
      }
      if (req.method === 'POST' && url.pathname === '/api/whatsapp/disconnect') {
        if (!whatsappManager) return sendJson(res, 503, { status: 'error', qrDataUrl: null, pairingCode: null, account: null, error: 'WhatsApp não configurado' });
        return sendJson(res, 200, await whatsappManager.disconnect());
      }

      const advanceMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/advance$/);
      if (req.method === 'POST' && advanceMatch) {
        if (!orderLifecycleService) return sendJson(res, 503, { error: 'Fluxo operacional não configurado' });
        const body = await readJson(req);
        const result = await orderLifecycleService.advanceOrder({ orderId: decodeURIComponent(advanceMatch[1]), expectedStatus: body.expectedStatus || null });
        return sendJson(res, 200, result);
      }

      const deliveryExportMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/delivery-confirmation\/export$/);
      if (req.method === 'GET' && deliveryExportMatch) {
        if (!deliveryConfirmationService?.exportDossier) {
          return sendJson(res, 503, { error: 'Exportação da confirmação de entrega não configurada.' });
        }
        try {
          const orderId = decodeURIComponent(deliveryExportMatch[1]);
          const dossier = deliveryConfirmationService.exportDossier(orderId);
          const safeId = String(orderId).replace(/[^a-zA-Z0-9_-]+/g, '-');
          return sendJsonDownload(res, `prismastore-confirmacao-${safeId}.json`, dossier);
        } catch (error) {
          return sendJson(res, 422, { error: error instanceof Error ? error.message : 'Não foi possível exportar o dossiê.' });
        }
      }

      const deliveryLinkMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/delivery-confirmation\/link$/);
      if (req.method === 'POST' && deliveryLinkMatch) {
        if (!deliveryConfirmationService) return sendJson(res, 503, { error: 'Confirmação de entrega não configurada.' });
        try {
          const result = deliveryConfirmationService.issueLink(decodeURIComponent(deliveryLinkMatch[1]));
          return sendJson(res, 200, {
            link: result.link,
            confirmation: deliveryConfirmationForDashboard(result.order?.deliveryConfirmation || null),
          });
        } catch (error) {
          return sendJson(res, 422, { error: error instanceof Error ? error.message : 'Não foi possível gerar o link.' });
        }
      }

      if (req.method === 'GET' && url.pathname === '/api/reports/monthly') {
        if (!reportService) return sendJson(res, 503, { error: 'Relatórios não configurados' });
        return sendJson(res, 200, reportService.getMonthlyReport(url.searchParams.get('month') || ''));
      }
      if (req.method === 'GET' && url.pathname === '/api/reports/monthly.csv') {
        if (!reportService) return sendJson(res, 503, { error: 'Relatórios não configurados' });
        const month = url.searchParams.get('month') || '';
        return sendCsv(res, `prismastore-${month}.csv`, reportService.exportMonthlyCsv(month));
      }

      if (req.method === 'GET' && url.pathname === '/api/backups') {
        return sendJson(res, 200, {
          backups: resolvedBackupService.listBackups(),
          external: resolvedBackupService.getExternalStatus?.() ?? null,
          schedule: resolvedBackupService.getScheduleStatus?.() ?? null,
        });
      }
      if (req.method === 'POST' && url.pathname === '/api/backups') return sendJson(res, 200, await resolvedBackupService.createBackup({ reason: 'manual' }));
      const restoreBackupMatch = url.pathname.match(/^\/api\/backups\/([^/]+)\/restore$/);
      if (req.method === 'POST' && restoreBackupMatch) return sendJson(res, 200, await resolvedBackupService.restoreBackup(decodeURIComponent(restoreBackupMatch[1])));

      if (req.method === 'GET' && url.pathname === '/api/payments/status') {
        if (!paymentService) return sendJson(res, 503, { provider: 'pix-local', environment: 'local', configured: false });
        return sendJson(res, 200, paymentService.getStatus());
      }
      if (req.method === 'GET' && url.pathname === '/api/payments/demo-pix') {
        if (!paymentService?.generateDemoPix) return sendJson(res, 503, { error: 'Pix de demonstração não configurado' });
        return sendJson(res, 200, await paymentService.generateDemoPix({ amount: Number(url.searchParams.get('amount')) }));
      }

      if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Endpoint não encontrado' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Método não permitido' });
      if (serveGeneratedIcon(staticDir, url.pathname, req.method, res)) return;
      serveStatic(staticDir, url.pathname, res);
    } catch (error) {
      runtimeLogProvider?.record?.('erro', error);
      sendJson(res, 400, { error: 'Não foi possível concluir esta ação. Tente novamente ou use “Reportar bug” para enviar o diagnóstico.' });
    }
  });
}
