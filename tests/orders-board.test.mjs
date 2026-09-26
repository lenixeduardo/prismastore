import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const indexSource = readFileSync(resolve(root, 'index.html'), 'utf8');
const serviceWorkerSource = readFileSync(resolve(root, 'service-worker.js'), 'utf8');
const appSource = readFileSync(resolve(root, 'src/app.js'), 'utf8');
const boardUrl = pathToFileURL(resolve(root, 'src/orders-board.js')).href;

async function loadBoardModule() {
  try {
    return await import(boardUrl);
  } catch {
    return {};
  }
}

test('orders page loads the operational board enhancement instead of relying on the legacy table alone', async () => {
  assert.match(indexSource, /src="\.\/src\/orders-board\.js(?:\?[^"]*)?"/);
  const { enhanceOrdersView } = await loadBoardModule();
  assert.equal(typeof enhanceOrdersView, 'function');
});

test('orders board assets are loaded and cached by the PWA shell', () => {
  assert.match(indexSource, /href="\.\/src\/orders-board\.css(?:\?[^"]*)?"/);
  assert.match(serviceWorkerSource, /\/src\/orders-board\.css/);
  assert.match(serviceWorkerSource, /\/src\/orders-board\.js/);
});

test('operational orders are split into paid shipping, paid delivery and active attention lanes', async () => {
  const { groupOperationalOrders } = await loadBoardModule();
  assert.equal(typeof groupOperationalOrders, 'function');
  if (typeof groupOperationalOrders !== 'function') return;

  const orders = [
    { id: 'ship-newer', status: 'PAID', deliveryType: 'shipping', paidAt: '2026-09-16T18:20:00.000Z' },
    { id: 'delivery', status: 'PAID', deliveryType: 'local_delivery', paidAt: '2026-09-16T18:10:00.000Z' },
    { id: 'packing', status: 'PACKING', deliveryType: 'shipping', paidAt: '2026-09-16T18:05:00.000Z' },
    { id: 'paying', status: 'PAYMENT_PENDING', deliveryType: 'shipping', createdAt: '2026-09-16T18:03:00.000Z' },
    { id: 'ship-older', status: 'PAID', deliveryType: 'shipping', paidAt: '2026-09-16T18:00:00.000Z' },
    { id: 'done', status: 'DELIVERED', deliveryType: 'local_delivery', paidAt: '2026-09-16T17:00:00.000Z' },
  ];

  const grouped = groupOperationalOrders(orders);
  assert.deepEqual(grouped.shipping.map((order) => order.id), ['ship-older', 'ship-newer']);
  assert.deepEqual(grouped.delivery.map((order) => order.id), ['delivery']);
  assert.deepEqual(grouped.attending.map((order) => order.id), ['paying', 'packing']);
});

test('wait time uses cyan before 15 minutes, yellow from 15 and red from 30', async () => {
  const { waitTimeState } = await loadBoardModule();
  assert.equal(typeof waitTimeState, 'function');
  if (typeof waitTimeState !== 'function') return;

  assert.deepEqual(waitTimeState(4), { tone: 'cyan', label: '04 min' });
  assert.deepEqual(waitTimeState(18), { tone: 'yellow', label: '18 min' });
  assert.deepEqual(waitTimeState(32), { tone: 'red', label: '32 min' });
});

test('board markup exposes the reference lane titles and operational actions', async () => {
  const { renderOrdersBoard } = await loadBoardModule();
  assert.equal(typeof renderOrdersBoard, 'function');
  if (typeof renderOrdersBoard !== 'function') return;

  const now = new Date('2026-09-16T18:34:00.000Z');
  const html = renderOrdersBoard({
    orders: [
      { id: 'PS-1', customerName: 'Carlos Silva', phone: '+5511999999999', status: 'PAID', deliveryType: 'shipping', paidAt: '2026-09-16T18:30:00.000Z', items: [{ name: 'Papel slim', quantity: 1 }], address: {} },
      { id: 'PS-2', customerName: 'Lucas Pereira', phone: '+5511888888888', status: 'PAID', deliveryType: 'local_delivery', paidAt: '2026-09-16T18:28:00.000Z', items: [{ name: 'Blunt sabor uva', quantity: 1 }], address: { street: 'Rua das Flores', number: '127', neighborhood: 'Vila Mariana' } },
      { id: 'PS-3', customerName: 'Letícia Azevedo', phone: '+5511777777777', status: 'PACKING', deliveryType: 'shipping', paidAt: '2026-09-16T18:20:00.000Z', items: [{ name: 'Isqueiro Clipper', quantity: 2 }], address: {} },
      { id: 'PS-4', customerName: 'Rafael Costa', phone: '+5511666666666', status: 'PAYMENT_PENDING', deliveryType: 'shipping', createdAt: '2026-09-16T18:25:00.000Z', items: [{ name: 'Seda slim', quantity: 1 }], address: {} },
    ],
    whatsappStatus: 'connected',
    now,
  });

  assert.match(html, /Fila de pedidos/);
  assert.match(html, /Pedidos pagos — envio/);
  assert.match(html, /Pedidos pagos — entregas/);
  assert.match(html, /Em atendimento/);
  assert.match(html, /Aguardando pagamento/);
  assert.match(html, /Abrir conversa sobre o pagamento/);
  assert.match(html, /Marcar como produto embalado/);
  assert.equal((html.match(/data-board-advance=/g) || []).length, 2);
  assert.match(html, /Enviar mensagem referente à demanda/);
  assert.match(html, /Informar a ordem na fila/);
  assert.match(html, /WhatsApp conectado/);
  assert.match(html, /data-board-view="chatbot"/);
  assert.match(html, /Todos os pedidos/);
  assert.match(html, /data-all-orders/);
});

test('orders views never render undefined when address data is absent or invalid', async () => {
  const { renderOrdersBoard } = await loadBoardModule();
  const html = renderOrdersBoard({
    orders: [{
      id: 'PS-MISSING',
      customerName: 'Cliente',
      status: 'PAID',
      deliveryType: 'local_delivery',
      paidAt: '2026-09-16T18:28:00.000Z',
      items: [{ name: 'Item', quantity: 1 }],
      address: { street: 'undefined', number: undefined, neighborhood: 'undefined', formatted: 'undefined undefined' },
    }],
    whatsappStatus: 'connected',
    now: new Date('2026-09-16T18:34:00.000Z'),
  });

  assert.doesNotMatch(html, /undefined/i);
  assert.match(appSource, /addressText\(o\.address,''\)/);
  assert.doesNotMatch(appSource, /o\.address\.street/);
});

test('orders board stylesheet stacks lanes vertically on mobile', () => {
  let source = '';
  try { source = readFileSync(resolve(root, 'src/orders-board.css'), 'utf8'); } catch {}
  assert.match(source, /\.orders-board-grid/);
  assert.match(source, /@media\s*\(max-width:\s*720px\)/);
  assert.match(source, /grid-template-columns:\s*1fr/);
});


test('orders board refresh cadence and update events keep new paid orders in the correct lane', async () => {
  const source = readFileSync(resolve(root, 'src/orders-board.js'), 'utf8');
  assert.match(source, /prismastore:orders-updated/);
  assert.match(source, /prismastore:state-updated/);
  assert.match(source, /}, 5000\);/);
  assert.match(source, /expectedStatus: 'PAID'/);
});


test('Cliente Métrica orders are hidden from every operational lane', async () => {
  const { groupOperationalOrders, renderOrdersBoard } = await loadBoardModule();
  const orders = [
    { id: 'REAL', customerName: 'Cliente Real', status: 'PAID', deliveryType: 'shipping', paidAt: '2026-09-16T18:00:00.000Z', items: [{ name: 'Item real', quantity: 1 }] },
    { id: 'METRIC', customerName: 'Cliente Métrica', status: 'PAID', deliveryType: 'shipping', paidAt: '2026-09-16T18:01:00.000Z', items: [{ name: 'Item métrica', quantity: 1 }] },
  ];
  const grouped = groupOperationalOrders(orders);
  assert.deepEqual(grouped.shipping.map((order) => order.id), ['REAL']);
  const html = renderOrdersBoard({ orders, now: new Date('2026-09-16T18:05:00.000Z') });
  assert.doesNotMatch(html, /Cliente Métrica|Item métrica|METRIC/);
  assert.match(html, /Cliente Real/);
});


test('complete history includes concluded orders and hides metric customers', async () => {
  const { allOrdersMarkup } = await loadBoardModule();
  assert.equal(typeof allOrdersMarkup, 'function');
  const html = allOrdersMarkup([
    { id: 'DONE', customerName: 'Cliente Real', phone: '+5511987654321', status: 'DELIVERED', total: 150, createdAt: '2026-09-25T20:00:00.000Z', items: [{ name: 'Item', quantity: 1 }] },
    { id: 'ACTIVE', customerName: 'Cliente Ativo', phone: '+5511912345678', status: 'PAID', total: 80, createdAt: '2026-09-25T21:00:00.000Z', items: [{ name: 'Outro', quantity: 1 }] },
    { id: 'METRIC', customerName: 'Cliente Métrica', phone: '+5511900000000', status: 'DELIVERED', total: 1, createdAt: '2026-09-25T22:00:00.000Z', items: [{ name: 'Métrica', quantity: 1 }] },
  ]);
  assert.match(html, /Todos os pedidos/);
  assert.match(html, /Cliente Real/);
  assert.match(html, /Cliente Ativo/);
  assert.match(html, /Concluído/);
  assert.match(html, /\(11\) 98765-4321/);
  assert.doesNotMatch(html, /Cliente Métrica|METRIC/);
});

test('dashboard recent orders routes directly to complete order history', () => {
  assert.match(appSource, /data-orders-history="true"/);
  assert.match(appSource, /prismastore:orders-history-requested/);
});
