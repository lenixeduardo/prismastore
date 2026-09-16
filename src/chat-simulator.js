import { availableStock, calculateCart, formatCurrencyBRL } from './domain.js';
import { messageValue } from './chatbot-settings.js';

const SIM_TITLE = 'Simulador do chatbot';
let operationalState = { products: [], customers: [], orders: [], settings: { chatbotMessages: {} } };
let simulator = freshSimulator();
let enhancing = false;

function freshSimulator() {
  return {
    step: 'catalog',
    cart: {},
    deliveryType: null,
    addressMode: null,
    pixDemo: { loading: false, payload: null, encodedImage: null, error: null },
  };
}

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function nl(value = '') {
  return esc(value).replace(/\n/g, '<br>');
}

async function fetchOperationalState() {
  const response = await fetch('/api/state', { cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível carregar os dados do simulador.');
  operationalState = await response.json();
  operationalState.products = Array.isArray(operationalState.products) ? operationalState.products : [];
  operationalState.customers = Array.isArray(operationalState.customers) ? operationalState.customers : [];
  operationalState.orders = Array.isArray(operationalState.orders) ? operationalState.orders : [];
  operationalState.settings = operationalState.settings && typeof operationalState.settings === 'object'
    ? operationalState.settings
    : { chatbotMessages: {} };
  return operationalState;
}

function msg(key, vars = {}) {
  const template = messageValue(operationalState.settings, key);
  return String(template).replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? `{${name}}`);
}

function products() {
  return operationalState.products.filter((product) => product.active !== false && availableStock(product) > 0);
}

function latestAddress() {
  const customer = operationalState.customers[0];
  return customer?.addresses?.[customer.addresses.length - 1] || {
    street: 'Rua Harmonia', number: '742', complement: 'Casa 2', neighborhood: 'Vila Madalena', city: 'São Paulo', state: 'SP', zip: '05435-001',
  };
}

function newAddress() {
  return { street: 'Rua Harmonia', number: '742', complement: 'Casa 2', neighborhood: 'Vila Madalena', city: 'São Paulo', state: 'SP', zip: '05435-001' };
}

function selectedAddress() {
  return simulator.addressMode === 'new' ? newAddress() : latestAddress();
}

function addressText(address) {
  if (!address) return '—';
  if (address.formatted) return address.formatted;
  return `${address.street || ''}, ${address.number || ''}${address.complement ? ` · ${address.complement}` : ''} · ${address.neighborhood || ''} · ${address.city || ''}/${address.state || ''} · ${address.zip || ''}`;
}

function cartTotals() {
  return calculateCart(operationalState.products, simulator.cart);
}

function deliveryFee() {
  return simulator.deliveryType === 'shipping' ? 24.9 : 18;
}

function finalTotal() {
  return cartTotals().subtotal + deliveryFee();
}

function demoOrderId() {
  return `PS-DEMO-${Math.round(finalTotal() * 100)}`;
}

function catalogText() {
  return products().map((product, index) => `${index + 1}. ${product.name} — ${formatCurrencyBRL(product.price)}`).join('\n');
}

function orderSummary() {
  const rows = Object.entries(simulator.cart)
    .filter(([, quantity]) => quantity > 0)
    .map(([id, quantity]) => {
      const product = operationalState.products.find((item) => item.id === id);
      if (!product) return '';
      return `<div class="summary-line"><span>${quantity}× ${esc(product.name)}</span><strong>${formatCurrencyBRL(product.price * quantity)}</strong></div>`;
    }).join('');
  return `<div class="detail-block"><div class="detail-label">Resumo</div>${rows}<div class="summary-line"><span>${simulator.deliveryType === 'shipping' ? 'Frete' : 'Taxa de entrega'}</span><strong>${formatCurrencyBRL(deliveryFee())}</strong></div><div class="summary-line" style="padding-top:8px;border-top:1px solid var(--border-soft)"><strong>Total</strong><strong>${formatCurrencyBRL(finalTotal())}</strong></div></div>`;
}

function pixMarkup({ compact = false } = {}) {
  const pix = simulator.pixDemo;
  if (pix.loading) return '<div class="notice">Gerando QR Code Pix de demonstração…</div>';
  if (pix.error) return `<div class="notice" style="border-color:rgba(255,107,107,.24);color:#ffb0b0">${esc(pix.error)}</div>`;
  if (!pix.encodedImage || !pix.payload) return '<div class="notice">QR Code Pix ainda não foi gerado.</div>';
  const size = compact ? 154 : 180;
  return `<div style="display:grid;gap:9px;justify-items:center">
    <div style="background:#fff;padding:9px;border-radius:6px"><img src="data:image/png;base64,${esc(pix.encodedImage)}" alt="QR Code Pix de demonstração" style="display:block;width:${size}px;height:${size}px;object-fit:contain" /></div>
    <div class="demo-note">QR Code Pix BR Code de demonstração — não use para pagamento.</div>
    ${compact ? '' : `<label style="width:100%;display:grid;gap:6px"><span class="detail-label" style="margin-bottom:0">Pix Copia e Cola de demonstração</span><textarea readonly style="width:100%;min-height:88px;border:1px solid var(--border);background:#09120e;color:#eef5f0;border-radius:5px;padding:10px 12px;font:inherit;line-height:1.4;resize:vertical">${esc(pix.payload)}</textarea></label>`}
  </div>`;
}

function flowPanel() {
  const totals = cartTotals();
  if (simulator.step === 'catalog') {
    return `<div class="section-title">1. Catálogo</div><p class="subtitle">${nl(msg('welcome', { cliente: 'Lucas' }))}</p><div class="notice" style="margin:12px 0 14px"><strong>${nl(msg('catalogHeader'))}</strong><br>${nl(msg('catalogInstruction'))}</div><div class="catalog-list">${products().map((product) => `<div class="catalog-row"><div><div class="product-name">${esc(product.name)}</div><div class="category">${esc(product.category)} · ${availableStock(product)} disp.</div></div><strong class="mono">${formatCurrencyBRL(product.price)}</strong><div class="qty-controls"><button data-sim-cart-dec="${esc(product.id)}">−</button><span>${simulator.cart[product.id] || 0}</span><button data-sim-cart-inc="${esc(product.id)}">+</button></div></div>`).join('')}</div><div class="detail-block"><div class="summary-line"><span>${totals.quantity} item(ns)</span><strong>${formatCurrencyBRL(totals.subtotal)}</strong></div><button class="btn primary" data-sim-action="delivery" ${totals.quantity ? '' : 'disabled'}>Continuar</button></div>`;
  }
  if (simulator.step === 'delivery') {
    return `<div class="section-title">2. Modalidade</div><p class="subtitle">${nl(msg('deliveryPrompt'))}</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ${simulator.deliveryType === 'shipping' ? 'primary' : ''}" data-sim-delivery="shipping">Envio</button><button class="btn ${simulator.deliveryType === 'local_delivery' ? 'primary' : ''}" data-sim-delivery="local_delivery">Entrega no endereço</button></div>${simulator.deliveryType ? '<div style="margin-top:14px"><button class="btn primary" data-sim-action="address">Confirmar modalidade</button></div>' : ''}`;
  }
  if (simulator.step === 'address') {
    const prompt = simulator.addressMode === 'new' ? msg('addressInputPrompt') : msg('savedAddressPrompt', { endereco: addressText(latestAddress()) });
    return `<div class="section-title">3. Endereço</div><p class="subtitle">${nl(prompt)}</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-sim-address="saved">Usar endereço salvo</button><button class="btn gold" data-sim-address="new">Informar novo endereço</button></div>${simulator.addressMode ? `<div class="detail-block"><div class="detail-label">Endereço selecionado ${simulator.addressMode === 'new' ? '<span class="badge gold">NOVO ENDEREÇO</span>' : ''}</div><div class="subtitle">${esc(addressText(selectedAddress()))}</div><button class="btn primary" style="margin-top:12px" data-sim-action="review">Revisar pedido</button></div>` : ''}`;
  }
  if (simulator.step === 'review') {
    return `<div class="section-title">4. Revisão</div><p class="subtitle">${nl(msg('confirmationPrompt', { subtotal: formatCurrencyBRL(finalTotal()), endereco: addressText(selectedAddress()) }))}</p>${orderSummary()}<button class="btn primary" data-sim-action="pix">Gerar Pix de demonstração</button>`;
  }
  if (simulator.step === 'pix') {
    return `<div class="section-title">5. Pix</div><p class="subtitle">${nl(msg('paymentPending', { pedido: demoOrderId(), subtotal: formatCurrencyBRL(finalTotal()), endereco: addressText(selectedAddress()) }))}</p>${pixMarkup()}${orderSummary()}<button class="btn primary" data-sim-action="confirm-payment" ${simulator.pixDemo.loading || simulator.pixDemo.error ? 'disabled' : ''}>Simular pagamento confirmado</button>`;
  }
  return `<div class="section-title">6. Pagamento confirmado</div><p class="subtitle">${nl(msg('paymentConfirmed', { pedido: demoOrderId() }))}</p><div class="notice" style="border-color:rgba(41,217,128,.22);background:var(--emerald-dim);color:#a5edc1">${nl(msg('orderFinished', { pedido: demoOrderId() }))}</div><div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-sim-action="open-orders">Abrir fila de pedidos</button><button class="btn" data-sim-action="reset">Novo teste</button></div>`;
}

function phoneMockup() {
  const totals = cartTotals();
  let bubbles = `<div class="bubble bot">${nl(msg('welcome', { cliente: 'Lucas' }))}</div><div class="bubble bot">${nl(msg('catalogHeader'))}</div><div class="bubble bot">${nl(catalogText())}</div><div class="bubble bot">${nl(msg('catalogInstruction'))}</div>`;
  const firstSelected = Object.entries(simulator.cart).find(([, quantity]) => quantity > 0);
  if (firstSelected) {
    const product = operationalState.products.find((item) => item.id === firstSelected[0]);
    if (product) bubbles += `<div class="bubble user">${firstSelected[1]}× ${esc(product.name)}</div><div class="bubble bot">${nl(msg('quantityPrompt', { produto: product.name, estoque: availableStock(product), preco: formatCurrencyBRL(product.price) }))}</div>`;
  }
  if (['delivery', 'address', 'review', 'pix', 'paid'].includes(simulator.step)) bubbles += `<div class="bubble user">Quero ${totals.quantity} item(ns). Total parcial ${formatCurrencyBRL(totals.subtotal)}.</div><div class="bubble bot">${nl(msg('cartActions', { subtotal: formatCurrencyBRL(totals.subtotal), quantidade: totals.quantity }))}</div><div class="bubble bot">${nl(msg('deliveryPrompt'))}</div>`;
  if (['address', 'review', 'pix', 'paid'].includes(simulator.step)) bubbles += `<div class="bubble user">${simulator.deliveryType === 'shipping' ? 'Envio' : 'Entrega no endereço'}.</div><div class="bubble bot">${nl(simulator.addressMode === 'new' ? msg('addressInputPrompt') : msg('savedAddressPrompt', { endereco: addressText(latestAddress()) }))}</div>`;
  if (['review', 'pix', 'paid'].includes(simulator.step)) bubbles += `<div class="bubble user">${esc(addressText(selectedAddress()))}</div><div class="bubble bot">${nl(msg('confirmationPrompt', { subtotal: formatCurrencyBRL(finalTotal()), endereco: addressText(selectedAddress()) }))}</div>`;
  if (['pix', 'paid'].includes(simulator.step)) bubbles += `<div class="bubble bot">${nl(msg('paymentPending', { pedido: demoOrderId(), subtotal: formatCurrencyBRL(finalTotal()), endereco: addressText(selectedAddress()) }))}</div>${simulator.pixDemo.encodedImage ? `<div class="bubble bot" style="max-width:96%;display:grid;gap:8px">${pixMarkup({ compact: true })}<span style="font-size:9px;word-break:break-all">${esc(simulator.pixDemo.payload)}</span></div>` : ''}`;
  if (simulator.step === 'paid') bubbles += `<div class="bubble bot">${nl(msg('paymentConfirmed', { pedido: demoOrderId() }))}</div><div class="bubble bot">${nl(msg('orderFinished', { pedido: demoOrderId() }))}</div>`;
  return `<div class="phone-frame"><div class="phone-screen"><div class="chat-header"><div class="avatar">Pr</div><div><strong>PrismaStore</strong><span>online · atendimento automatizado</span></div></div><div class="chat-body">${bubbles}</div><div class="chat-actions"><span class="chat-chip">Fluxo WhatsApp simulado</span></div></div></div>`;
}

function simulatorMarkup() {
  return `<div class="card padded"><div class="section-head"><div class="section-title">Fluxo funcional</div><div class="badge gray">Dados simulados</div></div><div class="notice" style="margin-bottom:14px">Esta prévia usa exatamente as mensagens salvas em <strong>Configurações</strong>. O Pix usa um BR Code válido apenas para demonstração, sem chave de cobrança real.</div>${flowPanel()}</div><div>${phoneMockup()}</div>`;
}

function renderSimulator() {
  const split = document.querySelector('.main .split-layout');
  if (!split || document.querySelector('.main h1')?.textContent?.trim() !== SIM_TITLE) return;
  split.dataset.realChatSimulator = 'true';
  split.innerHTML = simulatorMarkup();
}

async function enhanceSimulator({ reloadState = false } = {}) {
  if (enhancing) return;
  if (document.querySelector('.main h1')?.textContent?.trim() !== SIM_TITLE) return;
  const split = document.querySelector('.main .split-layout');
  if (!split) return;
  if (split.dataset.realChatSimulator === 'true' && !reloadState) return;
  enhancing = true;
  try {
    await fetchOperationalState();
    renderSimulator();
  } catch (error) {
    split.innerHTML = `<div class="card padded"><div class="notice">${esc(error instanceof Error ? error.message : 'Falha ao abrir simulador.')}</div></div>`;
  } finally {
    enhancing = false;
  }
}

async function loadDemoPix() {
  simulator.pixDemo = { loading: true, payload: null, encodedImage: null, error: null };
  renderSimulator();
  try {
    const response = await fetch(`/api/payments/demo-pix?amount=${encodeURIComponent(finalTotal().toFixed(2))}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível gerar o Pix de demonstração.');
    simulator.pixDemo = { loading: false, payload: data.payload || null, encodedImage: data.encodedImage || null, error: null };
  } catch (error) {
    simulator.pixDemo = { loading: false, payload: null, encodedImage: null, error: error instanceof Error ? error.message : 'Falha ao gerar Pix de demonstração.' };
  }
  renderSimulator();
}

async function persistPaidDemoOrder() {
  const current = await fetchOperationalState();
  const totals = cartTotals();
  const items = Object.entries(simulator.cart).filter(([, quantity]) => quantity > 0).map(([productId, quantity]) => {
    const product = current.products.find((item) => item.id === productId);
    return { productId, name: product?.name || productId, quantity, unitPrice: Number(product?.price || 0) };
  });
  const order = {
    id: `PS-${1050 + current.orders.length}`,
    customerId: current.customers[0]?.id || 'c1',
    customerName: current.customers[0]?.name || 'Cliente demonstração',
    phone: current.customers[0]?.phone || '+55 11 90000-0000',
    status: 'PAID',
    deliveryType: simulator.deliveryType,
    total: totals.subtotal + deliveryFee(),
    createdAt: new Date().toISOString(),
    paidAt: new Date().toISOString(),
    receivingAccountId: 'pix-demo',
    items,
    address: selectedAddress(),
    newAddress: simulator.addressMode === 'new',
    deliveryFee: deliveryFee(),
  };
  current.orders.unshift(order);
  const response = await fetch('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(current) });
  if (!response.ok) throw new Error('Não foi possível registrar o pedido simulado.');
  operationalState = await response.json();
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (document.querySelector('.main h1')?.textContent?.trim() !== SIM_TITLE) return;

  if (target.id === 'reset-chat') {
    event.preventDefault();
    event.stopImmediatePropagation();
    simulator = freshSimulator();
    await enhanceSimulator({ reloadState: true });
    return;
  }

  const increment = target.dataset.simCartInc;
  const decrement = target.dataset.simCartDec;
  const delivery = target.dataset.simDelivery;
  const address = target.dataset.simAddress;
  const action = target.dataset.simAction;
  if (!increment && !decrement && !delivery && !address && !action) return;
  event.preventDefault();
  event.stopPropagation();

  if (increment) {
    const product = operationalState.products.find((item) => item.id === increment);
    const current = simulator.cart[increment] || 0;
    if (product && current < availableStock(product)) simulator.cart[increment] = current + 1;
    renderSimulator();
    return;
  }
  if (decrement) {
    simulator.cart[decrement] = Math.max(0, (simulator.cart[decrement] || 0) - 1);
    renderSimulator();
    return;
  }
  if (delivery) {
    simulator.deliveryType = delivery;
    renderSimulator();
    return;
  }
  if (address) {
    simulator.addressMode = address;
    renderSimulator();
    return;
  }
  if (action === 'delivery') simulator.step = 'delivery';
  if (action === 'address') simulator.step = 'address';
  if (action === 'review') simulator.step = 'review';
  if (action === 'pix') {
    simulator.step = 'pix';
    await loadDemoPix();
    return;
  }
  if (action === 'confirm-payment') {
    try {
      await persistPaidDemoOrder();
      simulator.step = 'paid';
    } catch (error) {
      simulator.pixDemo.error = error instanceof Error ? error.message : 'Falha ao confirmar pagamento simulado.';
    }
  }
  if (action === 'reset') {
    simulator = freshSimulator();
    await enhanceSimulator({ reloadState: true });
    return;
  }
  if (action === 'open-orders') {
    document.querySelector('[data-view="orders"]')?.click();
    return;
  }
  renderSimulator();
}, true);

const observer = new MutationObserver(() => queueMicrotask(() => enhanceSimulator()));
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('DOMContentLoaded', () => enhanceSimulator());
queueMicrotask(() => enhanceSimulator());
