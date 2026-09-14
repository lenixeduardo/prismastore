import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, value) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
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

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Payload muito grande');
  }
  if (!body) return {};
  return JSON.parse(body);
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

export function createAppServer({ stateStore, staticDir, whatsappManager = null, paymentService = null, orderLifecycleService = null, reportService = null, asaasWebhookToken = '' }) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/api/state') {
        sendJson(res, 200, stateStore.load());
        return;
      }

      if (req.method === 'PUT' && url.pathname === '/api/state') {
        const state = await readJson(req);
        sendJson(res, 200, stateStore.save(state));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/whatsapp/status') {
        if (!whatsappManager) return sendJson(res, 503, { status: 'error', qrDataUrl: null, account: null, error: 'WhatsApp não configurado' });
        sendJson(res, 200, whatsappManager.getStatus());
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/whatsapp/connect') {
        if (!whatsappManager) return sendJson(res, 503, { status: 'error', qrDataUrl: null, account: null, error: 'WhatsApp não configurado' });
        sendJson(res, 200, await whatsappManager.connect());
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/whatsapp/disconnect') {
        if (!whatsappManager) return sendJson(res, 503, { status: 'error', qrDataUrl: null, account: null, error: 'WhatsApp não configurado' });
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

      if (req.method === 'GET' && url.pathname === '/api/payments/status') {
        if (!paymentService) return sendJson(res, 503, { provider: 'asaas', environment: 'sandbox', configured: false });
        sendJson(res, 200, { ...paymentService.getStatus(), webhookConfigured: Boolean(asaasWebhookToken) });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/webhooks/asaas') {
        if (!paymentService || !asaasWebhookToken) return sendJson(res, 503, { error: 'Webhook Asaas não configurado' });
        if (req.headers['asaas-access-token'] !== asaasWebhookToken) return sendJson(res, 401, { error: 'Token de webhook inválido' });
        const payload = await readJson(req);
        const result = await paymentService.handleAsaasEvent(payload);
        if (result.handled && !result.duplicate && result.order?.status === 'PAID') {
          try {
            if (orderLifecycleService?.notifyOrderStatus) await orderLifecycleService.notifyOrderStatus(result.order);
            else if (whatsappManager?.sendText) await whatsappManager.sendText(result.order.phone, `✅ Pagamento confirmado para o pedido *${result.order.id}*. Seu pedido entrou na fila de separação e embalagem.`);
          } catch (error) {
            console.error('Pagamento confirmado, mas falhou a notificação no WhatsApp:', error);
          }
        }
        sendJson(res, 200, result);
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

      serveStatic(staticDir, url.pathname, res);
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Erro inesperado' });
    }
  });
}
