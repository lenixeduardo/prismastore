const WAIT_WARNING_MINUTES = 15;
const WAIT_DANGER_MINUTES = 30;

let enhancing = false;
let lastOrders = [];
let lastWhatsappStatus = 'disconnected';

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function paidTimestamp(order) {
  const value = order?.paidAt || order?.createdAt;
  const timestamp = value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function sortByPaymentTime(orders = []) {
  return [...orders].sort((a, b) => paidTimestamp(a) - paidTimestamp(b));
}

export function groupOperationalOrders(orders = []) {
  const sorted = sortByPaymentTime(orders);
  return {
    shipping: sorted.filter((order) => order.status === 'PAID' && order.deliveryType === 'shipping'),
    delivery: sorted.filter((order) => order.status === 'PAID' && order.deliveryType !== 'shipping'),
    attending: sorted.filter((order) => ['PAYMENT_PENDING', 'PACKING'].includes(order.status)),
  };
}

export function waitTimeState(minutes) {
  const safeMinutes = Math.max(0, Math.floor(Number(minutes) || 0));
  const tone = safeMinutes >= WAIT_DANGER_MINUTES
    ? 'red'
    : safeMinutes >= WAIT_WARNING_MINUTES
      ? 'yellow'
      : 'cyan';
  return { tone, label: `${String(safeMinutes).padStart(2, '0')} min` };
}

function minutesSincePayment(order, now = new Date()) {
  const paidAt = paidTimestamp(order);
  if (!Number.isFinite(paidAt)) return 0;
  return Math.max(0, Math.floor((new Date(now).getTime() - paidAt) / 60000));
}

function icon(name) {
  const icons = {
    truck: '<path d="M10 17h4V5H2v12h3"/><path d="M14 8h4l4 4v5h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/>',
    package: '<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v9"/><path d="m21 8v9l-9 5-9-5V8"/>',
    headset: '<path d="M4 14a8 8 0 0 1 16 0"/><path d="M18 19h1a2 2 0 0 0 2-2v-3h-3v5Z"/><path d="M6 19H5a2 2 0 0 1-2-2v-3h3v5Z"/><path d="M18 19c0 2-2 3-4 3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    message: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.2 9.2 0 0 1-4-.9L3 21l1.7-4.5A8.6 8.6 0 1 1 21 11.5Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
  };
  return `<svg class="orders-board-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.package}</svg>`;
}

function itemLines(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) return '<div class="order-board-item muted">Itens não informados</div>';
  return items.map((item) => `<div class="order-board-item"><span>${esc(item.name || 'Item')}</span><span class="order-board-dot">•</span><span>${Number(item.quantity || 0)} un.</span></div>`).join('');
}

function compactAddress(address) {
  if (!address) return '';
  if (address.formatted) return esc(address.formatted);
  const first = [address.street, address.number].filter(Boolean).join(', ');
  return esc([first, address.neighborhood].filter(Boolean).join(' · '));
}

function waitMarkup(order, now) {
  const wait = waitTimeState(minutesSincePayment(order, now));
  return `<div class="order-board-wait ${wait.tone}"><strong>${wait.label}</strong></div>`;
}

function paidCard(order, lane, now) {
  const address = lane === 'delivery' ? compactAddress(order.address) : '';
  return `<article class="order-board-card" data-order-id="${esc(order.id)}">
    ${waitMarkup(order, now)}
    <div class="order-board-items">${itemLines(order)}</div>
    <div class="order-board-customer">${esc(order.customerName || 'Cliente')}</div>
    ${address ? `<div class="order-board-address">${address}</div>` : ''}
    <button class="order-board-action" type="button" data-board-advance="${esc(order.id)}"><span>Marcar como produto embalado</span></button>
  </article>`;
}

function attendingCard(order, position, now) {
  const awaitingPayment = order.status === 'PAYMENT_PENDING';
  const nextAction = awaitingPayment
    ? ''
    : order.deliveryType === 'local_delivery'
      ? `<button class="order-board-action complete" type="button" data-board-complete-delivery="${esc(order.id)}"><span>Entregue ao motoboy · Concluir</span></button>`
      : `<button class="order-board-action" type="button" data-board-ready-shipping="${esc(order.id)}"><span>Pedido pronto para envio</span></button>`;
  const paymentState = awaitingPayment
    ? `<div class="order-board-payment-state"><span class="orders-board-status-dot"></span><strong>Aguardando pagamento</strong></div>`
    : '';
  return `<article class="order-board-card attending ${awaitingPayment ? 'awaiting-payment' : ''}" data-order-id="${esc(order.id)}">
    ${awaitingPayment ? waitMarkup(order, now) : ''}
    <div class="order-board-person"><strong>${esc(order.customerName || 'Cliente')}</strong></div>
    ${paymentState}
    <div class="order-board-items">${itemLines(order)}</div>
    ${nextAction}
    <div class="order-board-actions-stack">
      <button class="order-board-message" type="button" data-board-message="${esc(order.id)}"><span>${awaitingPayment ? 'Abrir conversa sobre o pagamento' : 'Enviar mensagem referente à demanda'}</span></button>
      ${awaitingPayment ? '' : `<button class="order-board-message secondary" type="button" data-board-queue="${esc(order.id)}" data-queue-position="${position}"><span>Informar a ordem na fila</span></button>`}
    </div>
  </article>`;
}

function emptyLane(message) {
  return `<div class="order-board-empty">${esc(message)}</div>`;
}

function laneMarkup({ title, subtitle, iconName, orders, type, now }) {
  return `<section class="orders-board-lane">
    <div class="orders-board-lane-head">
      <div class="orders-board-lane-icon">${icon(iconName)}</div>
      <div><h2>${title}</h2><p>${subtitle}</p></div>
    </div>
    <div class="orders-board-list">
      ${orders.length
        ? orders.map((order, index) => type === 'attending' ? attendingCard(order, index + 1, now) : paidCard(order, type, now)).join('')
        : emptyLane(type === 'attending' ? 'Nenhum pedido em atendimento.' : 'Nenhum pedido aguardando nesta fila.')}
    </div>
  </section>`;
}

export function renderOrdersBoard({ orders = [], whatsappStatus = 'disconnected', now = new Date() } = {}) {
  const grouped = groupOperationalOrders(orders);
  const whatsappConnected = whatsappStatus === 'connected';
  return `<div class="orders-board-page">
    <div class="orders-board-topbar">
      <div>
        <h1>Fila de pedidos</h1>
        <p>Do pagamento em andamento à separação do pedido</p>
      </div>
      <div class="orders-board-top-actions">
        <div class="orders-board-whatsapp ${whatsappConnected ? 'connected' : 'disconnected'}"><span class="orders-board-status-dot"></span>${whatsappConnected ? 'WhatsApp conectado' : 'WhatsApp desconectado'}</div>
        <button class="btn orders-board-chatbot" type="button" data-board-view="chatbot">${icon('message')}<span>Simular chatbot</span></button>
      </div>
    </div>
    <div class="orders-board-grid">
      ${laneMarkup({ title: 'Pedidos pagos — envio', subtitle: 'Pagos e aguardando separação para envio', iconName: 'truck', orders: grouped.shipping, type: 'shipping', now })}
      ${laneMarkup({ title: 'Pedidos pagos — entregas', subtitle: 'Pagos e aguardando saída para entrega', iconName: 'package', orders: grouped.delivery, type: 'delivery', now })}
      ${laneMarkup({ title: 'Em atendimento', subtitle: 'Clientes pagando ou pedidos em atendimento pela equipe', iconName: 'headset', orders: grouped.attending, type: 'attending', now })}
    </div>
  </div>`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Falha na operação.');
  return payload;
}

async function loadBoardState() {
  const state = await fetchJson('/api/state', { cache: 'no-store' });
  let whatsapp = { status: 'disconnected' };
  try {
    whatsapp = await fetchJson('/api/whatsapp/status', { cache: 'no-store' });
  } catch {
    // A fila continua funcional mesmo quando o WhatsApp estiver indisponível.
  }
  return { orders: Array.isArray(state.orders) ? state.orders : [], whatsappStatus: whatsapp.status || 'disconnected' };
}

function isOrdersView(main) {
  if (!main) return false;
  if (main.querySelector('.orders-board-page')) return true;
  return main.querySelector('h1')?.textContent?.trim() === 'Pedidos';
}

export async function enhanceOrdersView({ force = false } = {}) {
  if (typeof document === 'undefined' || enhancing) return false;
  const main = document.querySelector('#app .main');
  if (!isOrdersView(main)) return false;
  if (!force && main.querySelector('.orders-board-page')) return true;

  enhancing = true;
  try {
    const data = await loadBoardState();
    lastOrders = data.orders;
    lastWhatsappStatus = data.whatsappStatus;
    main.innerHTML = renderOrdersBoard({ orders: lastOrders, whatsappStatus: lastWhatsappStatus, now: new Date() });
    return true;
  } catch (error) {
    console.error('Falha ao montar a fila operacional de pedidos:', error);
    return false;
  } finally {
    enhancing = false;
  }
}

async function advancePaidOrder(orderId) {
  const result = await fetchJson(`/api/orders/${encodeURIComponent(orderId)}/advance`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedStatus: 'PAID' }),
  });
  window.dispatchEvent(new CustomEvent('prismastore:orders-updated', {
    detail: { orderId, status: result.order?.status || null, changed: Boolean(result.changed), stale: Boolean(result.stale) },
  }));
  await enhanceOrdersView({ force: true });
  return result;
}

async function advancePackedOrder(orderId) {
  const result = await fetchJson(`/api/orders/${encodeURIComponent(orderId)}/advance`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedStatus: 'PACKING' }),
  });
  window.dispatchEvent(new CustomEvent('prismastore:orders-updated', {
    detail: { orderId, status: result.order?.status || null, changed: Boolean(result.changed), stale: Boolean(result.stale) },
  }));
  await enhanceOrdersView({ force: true });
  return result;
}

function orderById(orderId) {
  return lastOrders.find((order) => order.id === orderId) || null;
}

function normalizedPhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function openWhatsapp(order, text) {
  const phone = normalizedPhone(order?.phone);
  if (!phone || typeof window === 'undefined') return;
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function messageDemand(order) {
  const text = order?.status === 'PAYMENT_PENDING'
    ? `Olá, ${order.customerName || 'cliente'}. Seu pedido está aguardando o pagamento. Se precisar de ajuda com o Pix ou com o envio do comprovante, responda por aqui.`
    : `Olá, ${order.customerName || 'cliente'}. Estamos atendendo seu pedido. Se precisar complementar alguma informação, responda por aqui.`;
  openWhatsapp(order, text);
}

function messageQueue(order, position) {
  openWhatsapp(order, `Olá, ${order.customerName || 'cliente'}. Seu pedido está na posição ${position} da fila de atendimento.`);
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  document.addEventListener('click', async (event) => {
    const target = event.target.closest?.('button');
    if (!target) return;

    if (target.matches('[data-board-view="chatbot"]')) {
      document.querySelector('.nav-btn[data-view="chatbot"], .mobile-bottom [data-view="chatbot"]')?.click();
      return;
    }

    if (target.matches('[data-board-advance]')) {
      target.disabled = true;
      try {
        await advancePaidOrder(target.dataset.boardAdvance);
      } catch (error) {
        console.error(error);
        target.disabled = false;
        target.title = error instanceof Error ? error.message : 'Falha ao atualizar pedido.';
      }
      return;
    }

    if (target.matches('[data-board-complete-delivery], [data-board-ready-shipping]')) {
      target.disabled = true;
      try {
        const orderId = target.dataset.boardCompleteDelivery || target.dataset.boardReadyShipping;
        await advancePackedOrder(orderId);
      } catch (error) {
        console.error(error);
        target.disabled = false;
        target.title = error instanceof Error ? error.message : 'Falha ao atualizar pedido.';
      }
      return;
    }

    if (target.matches('[data-board-message]')) {
      const order = orderById(target.dataset.boardMessage);
      if (order) messageDemand(order);
      return;
    }

    if (target.matches('[data-board-queue]')) {
      const order = orderById(target.dataset.boardQueue);
      if (order) messageQueue(order, Number(target.dataset.queuePosition) || 1);
    }
  });

  const app = document.querySelector('#app');
  if (app) {
    const observer = new MutationObserver(() => queueMicrotask(() => enhanceOrdersView()));
    observer.observe(app, { childList: true, subtree: true });
  }

  window.addEventListener('prismastore:dashboard-opened', () => queueMicrotask(() => enhanceOrdersView()));
  window.addEventListener('prismastore:state-updated', () => queueMicrotask(() => enhanceOrdersView({ force: true })));
  window.addEventListener('prismastore:orders-updated', () => queueMicrotask(() => enhanceOrdersView({ force: true })));
  window.setInterval(() => {
    const main = document.querySelector('#app .main');
    if (main?.querySelector('.orders-board-page')) enhanceOrdersView({ force: true });
  }, 5000);

  queueMicrotask(() => enhanceOrdersView());
}
