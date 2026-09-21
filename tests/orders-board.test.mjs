import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const indexSource = readFileSync(resolve(root, 'index.html'), 'utf8');
const serviceWorkerSource = readFileSync(resolve(root, 'service-worker.js'), 'utf8');
const boardUrl = pathToFileURL(resolve(root, 'src/orders-board.js')).href;

async function loadBoardModule() {
  try {
    return await import(boardUrl);
  } catch {
    return {};
  }
}

test('orders page loads the operational board enhancement instead of relying on the legacy table alone', async () => {
  assert.match(indexSource, /src="\.\/src\/orders-board\.js"/);
  const { enhanceOrdersView } = await loadBoardModule();
  assert.equal(typeof enhanceOrdersView, 'function');
});

test('orders board assets are loaded and cached by the PWA shell', () => {
  assert.match(indexSource, /href="\.\/src\/orders-board\.css"/);
  assert.match(serviceWorkerSource, /\/src\/orders-board\.css/);
  assert.match(serviceWorkerSource, /\/src\/orders-board\.js/);
});

test('operational orders are split into paid shipping, paid delivery and packing attention lanes', async () => {
  const { groupOperationalOrders } = await loadBoardModule();
  assert.equal(typeof groupOperationalOrders, 'function');
  if (typeof groupOperationalOrders !== 'function') return;

  const orders = [
    { id: 'ship-newer', status: 'PAID', deliveryType: 'shipping', paidAt: '2026-09-16T18:20:00.000Z' },
    { id: 'delivery', status: 'PAID', deliveryType: 'local_delivery', paidAt: '2026-09-16T18:10:00.000Z' },
    { id: 'packing', status: 'PACKING', deliveryType: 'shipping', paidAt: '2026-09-16T18:05:00.000Z' },
    { id: 'ship-older', status: 'PAID', deliveryType: 'shipping', paidAt: '2026-09-16T18:00:00.000Z' },
    { id: 'done', status: 'DELIVERED', deliveryType: 'local_delivery', paidAt: '2026-09-16T17:00:00.000Z' },
  ];

  const grouped = groupOperationalOrders(orders);
  assert.deepEqual(grouped.shipping.map((order) => order.id), ['ship-older', 'ship-newer']);
  assert.deepEqual(grouped.delivery.map((order) => order.id), ['delivery']);
  assert.deepEqual(grouped.attending.map((order) => order.id), ['packing']);
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
    ],
    whatsappStatus: 'connected',
    now,
  });

  assert.match(html, /Fila de pedidos pagos/);
  assert.match(html, /Pedidos pagos — envio/);
  assert.match(html, /Pedidos pagos — entregas/);
  assert.match(html, /Em atendimento/);
  assert.match(html, /Marcar como produto embalado/);
  assert.equal((html.match(/data-board-advance=/g) || []).length, 2);
  assert.match(html, /Enviar mensagem referente à demanda/);
  assert.match(html, /Informar a ordem na fila/);
  assert.match(html, /WhatsApp conectado/);
  assert.match(html, /data-board-view="chatbot"/);
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
