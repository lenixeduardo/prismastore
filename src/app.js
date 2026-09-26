import {
  availableStock,
  isLowStock,
  calculateCart,
  nextOrderStatus,
  formatCurrencyBRL,
  computeProductStatus,
  isMetricCustomer,
} from './domain.js';
import { seedProducts, seedCustomers, seedOrders, receivingAccounts } from './data.js';
import { friendlyErrorMessage } from './error-messages.js';
import { CHATBOT_MESSAGE_DEFAULTS, CHATBOT_MESSAGE_FIELDS, messageValue } from './chatbot-settings.js';

const icons = {
  dashboard: '▦', orders: '◫', customers: '◎', products: '□', reports: '⌁', chatbot: '◌', settings: '⚙', search: '⌕', alert: '!', money: 'R$', box: '◇', close: '×'
};

const clone = (v) => JSON.parse(JSON.stringify(v));

const state = {
  view: 'dashboard',
  previousView: 'dashboard',
  orderFilter: 'all',
  search: '',
  selectedOrder: null,
  products: clone(seedProducts),
  customers: clone(seedCustomers),
  orders: clone(seedOrders),
  settings: { chatbotMessages: clone(CHATBOT_MESSAGE_DEFAULTS) },
  settingsHealth: { loading: false, payments: null, backups: null, error: null },
  serverConnected: false,
  serverError: null,
  whatsapp: { status: 'disconnected', qrDataUrl: null, pairingCode: null, account: null, error: null, errorCode: null },
  chatbot: { step: 'welcome', cart: {}, deliveryType: null, addressMode: null, paymentConfirmed: false },
};

async function loadOperationalState() {
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível carregar os dados locais.');
    const persisted = await response.json();
    state.products = Array.isArray(persisted.products) ? persisted.products : clone(seedProducts);
    state.customers = Array.isArray(persisted.customers) ? persisted.customers : clone(seedCustomers);
    state.orders = Array.isArray(persisted.orders) ? persisted.orders : clone(seedOrders);
    state.settings = persisted.settings && typeof persisted.settings === 'object'
      ? persisted.settings
      : { chatbotMessages: clone(CHATBOT_MESSAGE_DEFAULTS) };
    state.serverConnected = true;
    state.serverError = null;
    return true;
  } catch (error) {
    state.serverConnected = false;
    state.serverError = friendlyErrorMessage(error, 'Não foi possível conectar ao PrismaStore. Verifique se o sistema está iniciado.');
    return false;
  }
}

async function persist() {
  try {
    const response = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ products: state.products, customers: state.customers, orders: state.orders, settings: state.settings }),
    });
    if (!response.ok) throw new Error('Falha ao salvar dados locais.');
    const saved = await response.json();
    state.products = Array.isArray(saved.products) ? saved.products : state.products;
    state.customers = Array.isArray(saved.customers) ? saved.customers : state.customers;
    state.orders = Array.isArray(saved.orders) ? saved.orders : state.orders;
    state.settings = saved.settings && typeof saved.settings === 'object' ? saved.settings : state.settings;
    state.serverConnected = true;
    state.serverError = null;
    window.dispatchEvent(new CustomEvent('prismastore:state-updated', { detail: { source: 'persist' } }));
    return saved;
  } catch (error) {
    state.serverConnected = false;
    state.serverError = friendlyErrorMessage(error, 'Não foi possível salvar as alterações. Tente novamente.');
    console.error(error);
  }
}

function el(html) { const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstElementChild; }
function esc(s='') { return String(s).replace(/[&<>'"]/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[m])); }
function formatDate(iso) { return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)); }
function formatPhoneDisplay(value='') {
  let digits=String(value??'').replace(/\D/g,'');
  if(digits.length===13 && digits.startsWith('55')) digits=digits.slice(2);
  if(digits.length===12 && digits.startsWith('55')) digits=digits.slice(2);
  if(digits.length===11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  if(digits.length===10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  return String(value??'').trim();
}
function latestAddress(customer) { return customer?.addresses?.[customer.addresses.length-1]; }
function cleanAddressText(value='') {
  const text=String(value??'').trim().replace(/\s+/g,' ');
  return !text || /^(undefined|null|n\/?a|não informado|nao informado|—|-)$/i.test(text) ? '' : text;
}
function addressText(a,empty='—') {
  if(!a) return empty;
  const cleanFormatted=cleanAddressText(a.formatted)
    .replace(/\b(?:undefined|null)\b/gi,'')
    .replace(/\s{2,}/g,' ')
    .trim();
  const street=cleanAddressText(a.street), number=cleanAddressText(a.number);
  const complement=cleanAddressText(a.complement), neighborhood=cleanAddressText(a.neighborhood);
  const city=cleanAddressText(a.city), stateCode=cleanAddressText(a.state), zip=cleanAddressText(a.zip);
  const first=[street,number].filter(Boolean).join(', ');
  const cityState=[city,stateCode].filter(Boolean).join('/');
  const structured=[first,complement,neighborhood,cityState,zip].filter(Boolean).join(' · ');
  return structured || cleanFormatted || empty;
}
function statusBadge(status) {
  const cfg = {
    PAYMENT_PENDING:['Aguardando Pix','orange'], PAID:['Pago · Embalar','green'], PACKING:['Produto embalado','gold'], SHIPPED:['Enviado','gray'], OUT_FOR_DELIVERY:['Concluído','gray'], DELIVERED:['Concluído','gray'], CANCELLED:['Cancelado','red']
  }[status] || [status,'gray'];
  return `<span class="badge ${cfg[1]}">${cfg[0]}</span>`;
}
function productBadge(product) {
  const status=computeProductStatus(product);
  if(status==='OUT_OF_STOCK') return '<span class="badge red">Sem estoque</span>';
  if(status==='LOW_STOCK') return '<span class="badge orange">Estoque baixo</span>';
  return '<span class="badge green">Ativo</span>';
}

const views = [
  ['dashboard','Visão geral','▦'],['orders','Pedidos','◫'],['customers','Clientes','◎'],['products','Produtos','□'],['reports','Relatórios','⌁'],['chatbot','Simular chatbot','◌']
];

const mobileViews = [
  ['dashboard','Início','⌂'],
  ['orders','Pedidos','◫'],
  ['products','Produtos','□'],
  ['settings','Configurações','⚙'],
];

function shell(content) {
  return `
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-copy"><strong>PrismaStore</strong><span>Operations</span></div></div>
      <div class="nav-group">
        <div class="nav-label">Operação</div>
        ${views.map(([id,label,icon])=>`<button class="nav-btn ${state.view===id?'active':''}" data-view="${id}"><span class="nav-icon">${icon}</span>${label}</button>`).join('')}
        <div class="nav-label">Sistema</div>
        <button class="nav-btn ${state.view==='settings'?'active':''}" data-view="settings"><span class="nav-icon">⚙</span>Configurações</button>
      </div>
      <div class="sidebar-footer">
        <button class="theme-switch sidebar-theme-switch" type="button" role="switch" aria-checked="false" data-theme-toggle aria-label="Alternar tema claro e escuro">
          <span class="theme-switch-label" data-theme-label>Tema escuro</span>
          <span class="theme-switch-icon" aria-hidden="true">☀</span>
          <span class="theme-switch-track" aria-hidden="true"><span class="theme-switch-thumb"></span></span>
          <span class="theme-switch-icon" aria-hidden="true">☾</span>
        </button>
        <button class="nav-btn report-bug-btn" type="button" data-report-bug><span class="nav-icon">!</span>Reportar bug</button>
        <div class="status-row"><span>WhatsApp</span><span style="display:flex;gap:8px;align-items:center"><i class="status-dot ${state.whatsapp.status==='connected'?'':'offline'}"></i>${whatsappStatusLabel()}</span></div>
      </div>
    </aside>
    <header class="mobile-topbar">
      <div class="mobile-brand" aria-label="PrismaStore">Prisma<span>Store</span></div>
      <div class="mobile-top-actions">
        <button class="mobile-theme-button" type="button" role="switch" aria-checked="false" data-theme-toggle aria-label="Alternar tema claro e escuro">
          <span aria-hidden="true">◐</span>
        </button>
        <button class="mobile-whatsapp-status ${state.whatsapp.status==='connected'?'connected':''}" type="button" data-view="settings" aria-label="WhatsApp: ${whatsappStatusLabel()}">
          <i class="status-dot ${state.whatsapp.status==='connected'?'':'offline'}"></i>
          <span>WhatsApp</span>
        </button>
      </div>
    </header>
    <main class="main">${content}</main>
    <nav class="mobile-bottom">${mobileViews.map(([id,label,icon])=>`<button class="${state.view===id?'active':''}" data-view="${id}"><span class="mob-icon">${icon}</span>${label}</button>`).join('')}<button type="button" data-pwa-more><span class="mob-icon">•••</span>Mais</button></nav>
    ${state.selectedOrder ? orderDrawer(state.selectedOrder) : ''}
  </div>`;
}

function header(title, subtitle, actions='') {
  return `<div class="topbar"><div><h1>${title}</h1><div class="subtitle">${subtitle}</div></div>${actions ? `<div class="top-actions">${actions}</div>` : ''}</div>`;
}

function visibleOrders() {
  return state.orders.filter((order) => !isMetricCustomer(order));
}

function visibleCustomers() {
  return state.customers.filter((customer) => !isMetricCustomer(customer));
}

function dashboardView() {
  const lowProducts = state.products.filter(isLowStock);
  const low = lowProducts.length;
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthLabel = new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(now);
  const operationalOrders = visibleOrders();
  const paidMonth = operationalOrders.filter(o=>o.paidAt?.startsWith(monthKey));
  const revenue = paidMonth.reduce((s,o)=>s+o.total,0);
  const pendingOrders = operationalOrders.filter(o=>['PAID','PACKING'].includes(o.status));
  const pendingPacking = pendingOrders.length;

  return shell(`
    <div class="dashboard-screen">
      <section class="dashboard-hero">
        <div>
          <h1>Bem-vindo, <span class="dashboard-greeting-name">Eduardo</span></h1>
          <div class="subtitle">Aqui está o panorama da sua operação hoje.</div>
        </div>
      </section>

      <div class="dashboard-kpis">
        ${dashboardKpi('money','Faturamento do mês',formatCurrencyBRL(revenue),monthLabel)}
        ${dashboardKpi('cart','Pedidos pagos',String(paidMonth.length),monthLabel)}
        ${dashboardKpi('box','Para embalar',String(pendingPacking),'Prioridade operacional','warning')}
        ${dashboardKpi('alert','Estoque crítico',String(low),low?`${low} item(ns) abaixo do limite`:'Sem alertas no momento','danger')}
      </div>

      <section class="card padded dashboard-section whatsapp-home-card">
        <div class="section-head">
          <div>
            <div class="section-title">Conectar WhatsApp</div>
            <div class="section-note">Conexão disponível diretamente na tela inicial, sem depender de Configurações.</div>
          </div>
          ${whatsappStatusBadge()}
        </div>
        ${whatsappConnectionPanel()}
      </section>

      <section class="card padded dashboard-section order-queue-card">
        <div class="section-head">
          <div class="section-title">Fila de pedidos</div>
          <button class="btn sm ghost" data-view="orders">Abrir fila ›</button>
        </div>
        <div class="dashboard-order-list">
          ${pendingOrders.slice(0,4).map(orderCompact).join('') || '<div class="empty dashboard-empty">Nenhum pedido aguardando separação.</div>'}
        </div>
      </section>

      <section class="card padded dashboard-section stock-alert-card">
        <div class="section-head">
          <div class="section-title">Alertas de estoque</div>
          <button class="btn sm ghost" data-view="products">Gerenciar ›</button>
        </div>
        ${lowProducts.length ? `<div class="dashboard-stock-list">${lowProducts.map(p=>`<div class="item-row"><div><div class="product-name">${esc(p.name)}</div><div class="category">${availableStock(p)} disponível</div></div>${productBadge(p)}</div>`).join('')}</div>` : `
          <div class="stock-empty-state">
            <img src="/assets/empty-stock-ok.svg" alt="" aria-hidden="true" />
            <strong>Nenhum alerta ativo.</strong>
            <span>Seu estoque está sob controle.</span>
          </div>`}
      </section>

      <section class="card padded dashboard-section recent-orders-card">
        <div class="section-head recent-orders-head">
          <div class="section-title recent-orders-title">Últimos pedidos</div>
          <button class="btn sm ghost view-all-btn" data-view="orders" data-orders-history="true">Ver todos ›</button>
        </div>
        <div class="dashboard-order-list compact">
          ${visibleOrders().slice(0,5).map(orderCompact).join('') || '<div class="empty dashboard-empty">Nenhum pedido registrado.</div>'}
        </div>
      </section>
    </div>`);
}

function dashboardKpi(icon,label,value,meta,klass='') {
  const iconMarkup = icon === 'cart'
    ? '<img class="kpi-static-icon" src="/assets/metric-orders-cart.svg" alt="" />'
    : `<span data-kpi-icon="${icon}"></span>`;
  return `<div class="card padded dashboard-kpi ${klass}">
    <span class="dashboard-kpi-icon" aria-hidden="true">${iconMarkup}</span>
    <div class="dashboard-kpi-copy">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value mono">${value}</div>
      <div class="kpi-meta">${meta}</div>
    </div>
    <img class="dashboard-kpi-signal" src="/assets/metric-signal.svg" alt="" aria-hidden="true" />
  </div>`;
}

function summarizeOrderItems(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) return order.deliveryType==='shipping' ? 'Envio' : 'Entrega local';
  const shown = items.slice(0,2).map(item=>`${item.quantity}× ${item.name}`).join(' + ');
  const extra = items.length > 2 ? ` + ${items.length-2} item(ns)` : '';
  return shown + extra;
}

function orderCompact(o) {
  return `<button class="dashboard-order-row" type="button" data-open-order="${o.id}">
    <span class="order-main">
      <strong class="customer-name">${esc(o.customerName)}</strong>
      <span class="order-summary">${esc(summarizeOrderItems(o))}</span>
      <span class="category">${formatDate(o.createdAt)} · ${o.deliveryType==='shipping'?'Envio':'Entrega local'}</span>
    </span>
    <span class="order-side">
      ${statusBadge(o.status)}
      <strong class="mono">${formatCurrencyBRL(o.total)}</strong>
    </span>
  </button>`;
}

function ordersView() {
  let orders = visibleOrders();
  if(state.orderFilter!=='all') orders=orders.filter(o=>o.status===state.orderFilter);
  if(state.search) orders=orders.filter(o=>`${o.customerName} ${o.phone}`.toLowerCase().includes(state.search.toLowerCase()));
  return shell(`${header('Pedidos','Do pagamento confirmado até envio ou entrega no endereço do cliente.','<button class="btn primary" data-view="chatbot">+ Simular pedido</button>')}
    <div class="toolbar">
      <div class="tabs">${[['all','Todos'],['PAID','Embalar'],['PACKING','Produto embalado'],['SHIPPED','Enviados'],['DELIVERED','Concluídos']].map(([id,l])=>`<button class="tab ${state.orderFilter===id?'active':''}" data-order-filter="${id}">${l}</button>`).join('')}</div>
      <label class="searchbar"><span>⌕</span><input id="order-search" value="${esc(state.search)}" placeholder="Cliente ou celular" /></label>
    </div>
    ${ordersTable(orders,'Fila de pedidos')}`);
}
function ordersTable(orders,title) { return `<div class="section-head"><div class="section-title">${title}</div><div class="section-note">${orders.length} registro(s)</div></div><div class="table-wrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Modalidade</th><th>Status</th><th>Endereço</th><th>Total</th><th></th></tr></thead><tbody>${orders.map(o=>`<tr><td><div class="category">${formatDate(o.createdAt)}</div></td><td><div class="customer-name">${esc(o.customerName)}</div><div class="category">${esc(formatPhoneDisplay(o.phone))}</div></td><td>${o.deliveryType==='shipping'?'Envio':'Entrega'} </td><td>${statusBadge(o.status)}</td><td><div class="address">${o.newAddress?'<span class="badge gold" style="margin-right:5px">NOVO ENDEREÇO</span>':''}${esc(addressText(o.address,''))}</div></td><td class="mono"><strong>${formatCurrencyBRL(o.total)}</strong></td><td><button class="btn sm" data-open-order="${o.id}">Detalhes</button></td></tr>`).join('')}</tbody></table></div>`; }

function customersView() {
  return shell(`${header('Clientes','Cadastro unificado pelo número do WhatsApp, histórico de endereço e pedidos anteriores.')}
    <div class="toolbar"><label class="searchbar"><span>⌕</span><input id="customer-search" placeholder="Buscar nome ou celular" /></label></div>
    <div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Endereço atual</th><th>Monitoramento</th><th>Pedidos</th><th>Total gasto</th><th>Última compra</th></tr></thead><tbody>${visibleCustomers().map(c=>`<tr><td><div class="customer-name">${esc(c.name)}</div><div class="category">${esc(formatPhoneDisplay(c.phone))}</div></td><td><div class="address">${esc(addressText(latestAddress(c)))}</div></td><td>${c.addressChanged?'<span class="badge gold">NOVO ENDEREÇO</span>':'<span class="badge gray">Sem alteração</span>'}</td><td class="mono">${c.orderCount}</td><td class="mono"><strong>${formatCurrencyBRL(c.totalSpent)}</strong></td><td>${formatDate(c.lastOrderAt)}</td></tr>`).join('')}</tbody></table></div>
    <div class="grid cols-2 section"><div class="card padded"><div class="section-title">Regra de monitoramento</div><p class="subtitle">Ao receber um endereço diferente de todos os endereços históricos do cliente, o pedido recebe o badge <strong style="color:var(--gold)">NOVO ENDEREÇO</strong>. O pedido guarda o snapshot usado naquela compra.</p></div><div class="card padded"><div class="section-title">Identidade do cliente</div><p class="subtitle">O celular/WhatsApp é o identificador inicial. Nome, endereços e histórico evoluem sem sobrescrever pedidos antigos.</p></div></div>`);
}

function productsView() {
  return shell(`${header('Produtos','Resumo do catálogo e estoque atual.','<button class="btn ghost" type="button" data-back-view>← Voltar</button><button class="btn primary" id="add-demo-product">+ Produto demo</button>')}
    <div class="section product-list">
      ${state.products.map(p=>`<article class="product-list-item">
        <div class="product-list-main">
          <div class="product-name">${esc(p.name)}</div>
        </div>
        <div class="product-list-stock">
          <span>Estoque</span>
          <div class="product-stock-stepper" aria-label="Ajustar estoque de ${esc(p.name)}">
            <button type="button" data-stock-dec="${p.id}" aria-label="Diminuir estoque de ${esc(p.name)}">−</button>
            <input type="number" min="0" step="1" inputmode="numeric" data-stock-input="${p.id}" value="${p.stock}" aria-label="Estoque de ${esc(p.name)}" />
            <button type="button" data-stock-inc="${p.id}" aria-label="Aumentar estoque de ${esc(p.name)}">+</button>
          </div>
        </div>
        <button class="product-list-menu" type="button" data-real-product-details="${p.id}" aria-label="Ver detalhes de ${esc(p.name)}">•••</button>
      </article>`).join('')}
    </div>`);
}

function reportsView() {
  return shell(`${header('Relatórios','Faturamento mensal e conta recebedora de cada pagamento confirmado.')}
    <div class="report-loading card padded" role="status">Carregando relatório…</div>`);
}

function chatbotView() {
  return shell(`${header('Simulador do chatbot','Valide o fluxo do atendimento inicial até o pedido pago aparecer para o admin embalar.','<button class="btn" id="reset-chat">Reiniciar simulação</button>')}
    <div class="split-layout">
      <div class="card padded">
        <div class="section-head"><div class="section-title">Fluxo funcional</div><div class="badge gray">Dados simulados</div></div>
        <div class="notice" style="margin-bottom:14px">O MVP não conecta ao WhatsApp Web nem cria cobrança real. Ele demonstra exatamente o comportamento esperado dos adapters <code>MessagingProvider</code> e <code>PaymentProvider</code>.</div>
        ${chatControlPanel()}
      </div>
      <div>${phoneMockup()}</div>
    </div>`);
}

function chatControlPanel() {
  const c=state.chatbot;
  const totals=calculateCart(state.products,c.cart);
  if(c.step==='welcome') return `<div class="section-title">1. Atendimento inicial</div><p class="subtitle">A conversa começa com saudação e confirmação de maioridade. O cardápio só é exibido depois da confirmação.</p><button class="btn primary" data-chat-action="age-confirm">Confirmar 18+ e abrir cardápio</button>`;
  if(c.step==='catalog') return `<div class="section-title">2. Cardápio textual</div><p class="subtitle">Selecione produtos e quantidades como se o cliente estivesse respondendo no WhatsApp.</p><div class="catalog-list">${state.products.filter(p=>availableStock(p)>0).map(p=>`<div class="catalog-row"><div><div class="product-name">${esc(p.name)}</div><div class="category">${availableStock(p)} disp.</div></div><strong class="mono">${formatCurrencyBRL(p.price)}</strong><div class="qty-controls"><button data-cart-dec="${p.id}">−</button><span>${c.cart[p.id]||0}</span><button data-cart-inc="${p.id}">+</button></div></div>`).join('')}</div><div class="detail-block"><div class="summary-line"><span>${totals.quantity} item(ns)</span><strong>${formatCurrencyBRL(totals.subtotal)}</strong></div><button class="btn primary" data-chat-action="delivery" ${totals.quantity?'':'disabled'}>Continuar</button></div>`;
  if(c.step==='delivery') return `<div class="section-title">3. Modalidade</div><p class="subtitle">Não existe retirada. O cliente escolhe entre envio ou entrega no endereço.</p><div style="display:flex;gap:8px"><button class="btn ${c.deliveryType==='shipping'?'primary':''}" data-delivery="shipping">Envio</button><button class="btn ${c.deliveryType==='local_delivery'?'primary':''}" data-delivery="local_delivery">Entrega no endereço</button></div>${c.deliveryType?'<div style="margin-top:14px"><button class="btn primary" data-chat-action="address">Confirmar modalidade</button></div>':''}`;
  if(c.step==='address') return `<div class="section-title">4. Endereço</div><p class="subtitle">Simule se o cliente reutiliza o endereço salvo ou informa um endereço diferente.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-address-mode="saved">Usar endereço salvo</button><button class="btn gold" data-address-mode="new">Informar novo endereço</button></div>${c.addressMode?`<div class="detail-block"><div class="detail-label">Endereço selecionado ${c.addressMode==='new'?'<span class="badge gold">NOVO ENDEREÇO</span>':''}</div><div class="subtitle">${esc(addressText(chatAddress()))}</div><button class="btn primary" style="margin-top:12px" data-chat-action="review">Revisar pedido</button></div>`:''}`;
  if(c.step==='review') return `<div class="section-title">5. Revisão</div>${chatOrderSummary()}<button class="btn primary" data-chat-action="pix">Gerar Pix de demonstração</button>`;
  if(c.step==='pix') return `<div class="section-title">6. Pix</div><div class="qr-demo"></div><div class="demo-note">QR visual de demonstração — não efetua pagamento.</div>${chatOrderSummary()}<button class="btn primary" data-chat-action="confirm-payment">Simular webhook: pagamento confirmado</button>`;
  if(c.step==='paid') return `<div class="section-title">7. Pagamento confirmado</div><p class="subtitle">O webhook muda o pedido para <strong style="color:var(--emerald)">PAGO</strong>. Ele aparece imediatamente na fila do admin com ação <strong>Embalar</strong>.</p><div class="notice" style="border-color:rgba(41,217,128,.22);background:var(--emerald-dim);color:#a5edc1">Pedido demo criado e inserido na fila administrativa.</div><div style="margin-top:12px;display:flex;gap:8px"><button class="btn primary" data-view="orders">Abrir fila de pedidos</button><button class="btn" id="reset-chat-2">Novo teste</button></div>`;
  return '';
}
function chatAddress() { return state.chatbot.addressMode==='new' ? { street:'Rua Harmonia',number:'742',complement:'Casa 2',neighborhood:'Vila Madalena',city:'São Paulo',state:'SP',zip:'05435-001' } : latestAddress(state.customers[0]); }
function chatOrderSummary() { const t=calculateCart(state.products,state.chatbot.cart); const fee=state.chatbot.deliveryType==='shipping'?24.9:18; return `<div class="detail-block"><div class="detail-label">Resumo</div>${Object.entries(state.chatbot.cart).filter(([,q])=>q>0).map(([id,q])=>{const p=state.products.find(x=>x.id===id);return `<div class="summary-line"><span>${q}× ${esc(p.name)}</span><strong>${formatCurrencyBRL(p.price*q)}</strong></div>`}).join('')}<div class="summary-line"><span>${state.chatbot.deliveryType==='shipping'?'Frete':'Taxa de entrega'}</span><strong>${formatCurrencyBRL(fee)}</strong></div><div class="summary-line" style="padding-top:8px;border-top:1px solid var(--border-soft)"><strong>Total</strong><strong>${formatCurrencyBRL(t.subtotal+fee)}</strong></div></div>`; }
function phoneMockup() {
  const c=state.chatbot;
  let bubbles=`<div class="bubble bot">Olá! Você está falando com a PrismaStore.\n\nAntes de continuar, confirme que você tem 18 anos ou mais.</div>`;
  if(c.step!=='welcome') bubbles+=`<div class="bubble user">Tenho 18 anos ou mais.</div><div class="bubble bot">Perfeito. Nosso cardápio disponível hoje:</div><div class="bubble bot">${state.products.filter(p=>availableStock(p)>0).map((p,i)=>`${i+1}. ${p.name} — ${formatCurrencyBRL(p.price)}`).join('\n')}</div>`;
  if(['delivery','address','review','pix','paid'].includes(c.step)) { const t=calculateCart(state.products,c.cart); bubbles+=`<div class="bubble user">Quero ${t.quantity} item(ns). Total parcial ${formatCurrencyBRL(t.subtotal)}.</div><div class="bubble bot">Como você quer receber?\n1. Envio\n2. Entrega no endereço</div>`; }
  if(['address','review','pix','paid'].includes(c.step)) bubbles+=`<div class="bubble user">${c.deliveryType==='shipping'?'Envio':'Entrega no endereço'}.</div><div class="bubble bot">Confirme seu endereço atual ou informe um novo.</div>`;
  if(['review','pix','paid'].includes(c.step)) bubbles+=`<div class="bubble user">${addressText(chatAddress())}</div><div class="bubble bot">Pedido revisado. Posso gerar o Pix?</div>`;
  if(['pix','paid'].includes(c.step)) bubbles+=`<div class="bubble bot">Pix gerado. Assim que o pagamento for confirmado pelo sistema, seu pedido entra na fila de separação.</div>`;
  if(c.step==='paid') bubbles+=`<div class="bubble bot">✅ Pagamento confirmado. Pedido recebido e enviado para separação e embalagem.</div>`;
  return `<div class="phone-frame"><div class="phone-screen"><div class="chat-header"><div class="avatar">Pr</div><div><strong>PrismaStore</strong><span>online · atendimento automatizado</span></div></div><div class="chat-body">${bubbles}</div><div class="chat-actions"><span class="chat-chip">Fluxo WhatsApp simulado</span></div></div></div>`;
}

function whatsappStatusLabel(status = state.whatsapp.status) {
  return ({
    disconnected: 'Desconectado',
    connecting: 'Conectando',
    qr: 'Escaneie o QR',
    authenticated: 'Autenticando',
    connected: 'Conectado',
    error: 'Erro',
  })[status] || status;
}

function whatsappStatusBadge() {
  const cls = state.whatsapp.status === 'connected' ? 'green' : state.whatsapp.status === 'error' ? 'red' : 'orange';
  return `<span class="badge ${cls}">${whatsappStatusLabel().toUpperCase()}</span>`;
}

function whatsappRenderKey(whatsapp = state.whatsapp) {
  return JSON.stringify({
    status: whatsapp.status ?? null,
    pairingCode: whatsapp.pairingCode ?? null,
    account: whatsapp.account ?? null,
    error: whatsapp.error ?? null,
    errorCode: whatsapp.errorCode ?? null,
    hasQr: Boolean(whatsapp.qrDataUrl),
  });
}

const WHATSAPP_STATUS_POLL_MS = 2500;
let whatsappStatusPollTimer = null;
let whatsappPairingRequestInFlight = false;
let whatsappConnectionAttempted = false;

function stopWhatsAppStatusPolling() {
  if (whatsappStatusPollTimer) window.clearTimeout(whatsappStatusPollTimer);
  whatsappStatusPollTimer = null;
}

function syncWhatsAppStatusPolling() {
  const visibleControllerView = ['dashboard', 'settings'].includes(state.view);
  if (!visibleControllerView) {
    stopWhatsAppStatusPolling();
    return;
  }
  if (whatsappStatusPollTimer) return;
  whatsappStatusPollTimer = window.setTimeout(async () => {
    whatsappStatusPollTimer = null;
    await refreshWhatsAppStatus({ rerender: true });
    syncWhatsAppStatusPolling();
  }, WHATSAPP_STATUS_POLL_MS);
}

function cleanInitialWhatsAppStatus(remoteStatus = {}) {
  if (whatsappConnectionAttempted || remoteStatus.status !== 'error') return remoteStatus;
  return {
    status: 'disconnected',
    qrDataUrl: null,
    pairingCode: null,
    account: null,
    error: null,
    errorCode: null,
  };
}

async function refreshWhatsAppStatus({ rerender = false } = {}) {
  const before = whatsappRenderKey(state.whatsapp);
  try {
    const response = await fetch('/api/whatsapp/status', { cache: 'no-store' });
    const remoteStatus = await response.json();
    if (!response.ok && remoteStatus.status !== 'error') throw new Error(remoteStatus.error || 'Falha ao consultar WhatsApp');
    state.whatsapp = cleanInitialWhatsAppStatus(remoteStatus);
  } catch (error) {
    state.whatsapp = whatsappConnectionAttempted
      ? { status: 'error', qrDataUrl: null, pairingCode: null, account: null, error: friendlyErrorMessage(error, 'Não foi possível consultar o WhatsApp.'), errorCode: null }
      : { status: 'disconnected', qrDataUrl: null, pairingCode: null, account: null, error: null, errorCode: null };
  }
  if (rerender && ['dashboard','settings'].includes(state.view) && before !== whatsappRenderKey(state.whatsapp)) render();
  return state.whatsapp;
}

async function connectWhatsApp() {
  whatsappConnectionAttempted = true;
  state.whatsapp = { ...state.whatsapp, status: 'connecting', qrDataUrl: null, pairingCode: null, error: null };
  render();
  try {
    const response = await fetch('/api/whatsapp/connect', { method: 'POST' });
    state.whatsapp = await response.json();
    if (!response.ok) throw new Error(state.whatsapp.error || 'Falha ao conectar WhatsApp');
  } catch (error) {
    state.whatsapp = { status: 'error', qrDataUrl: null, pairingCode: null, account: null, error: friendlyErrorMessage(error, 'Não foi possível conectar o WhatsApp.'), errorCode: null };
  }
  render();
}

async function pairWhatsAppByPhone(phone) {
  if (whatsappPairingRequestInFlight) return;
  whatsappConnectionAttempted = true;
  whatsappPairingRequestInFlight = true;
  try {
    const response = await fetch('/api/whatsapp/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    state.whatsapp = await response.json();
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('prismastore:auth-required'));
      throw new Error('Autenticação necessária.');
    }
    if (!response.ok) throw new Error(state.whatsapp.error || 'Falha ao gerar código de pareamento');
  } catch (error) {
    state.whatsapp = { ...state.whatsapp, status: 'error', pairingCode: null, error: friendlyErrorMessage(error, 'Não foi possível gerar o código de pareamento.') };
  } finally {
    whatsappPairingRequestInFlight = false;
  }
  render();
}

async function disconnectWhatsApp() {
  try {
    const response = await fetch('/api/whatsapp/disconnect', { method: 'POST' });
    state.whatsapp = await response.json();
    if (response.ok && state.whatsapp.status === 'disconnected') whatsappConnectionAttempted = false;
  } catch (error) {
    state.whatsapp = { status: 'error', qrDataUrl: null, pairingCode: null, account: null, error: friendlyErrorMessage(error, 'Não foi possível desconectar o WhatsApp.'), errorCode: null };
  }
  render();
}

async function restartWhatsAppConnection() {
  whatsappConnectionAttempted = true;
  state.whatsapp = { ...state.whatsapp, status: 'connecting', pairingCode: null, qrDataUrl: null, error: null };
  render();
  try {
    const response = await fetch('/api/whatsapp/restart', { method: 'POST' });
    state.whatsapp = await response.json();
    if (!response.ok) throw new Error(state.whatsapp.error || 'Falha ao reiniciar conexão do WhatsApp');
  } catch (error) {
    state.whatsapp = { ...state.whatsapp, status: 'error', pairingCode: null, qrDataUrl: null, error: friendlyErrorMessage(error, 'Não foi possível reiniciar a conexão do WhatsApp.') };
  }
  render();
}

function whatsappPairingForm() {
  return `<div class="wa-pairing-form"><label class="wa-pairing-label">Número do WhatsApp<input type="tel" inputmode="tel" autocomplete="tel" placeholder="(11) 99999-9999" data-whatsapp-pair-phone /></label><button class="btn" type="button" data-whatsapp-pair>Gerar código de vínculo</button></div>`;
}

function whatsappConnectionPanel() {
  const w = state.whatsapp;
  if (w.status === 'pairing' && w.pairingCode) {
    return `<div class="wa-connection-panel success"><strong>Código de vínculo</strong><div class="wa-pairing-code-row"><code class="wa-pairing-code">${esc(w.pairingCode)}</code></div><div class="category">No celular: WhatsApp → Aparelhos conectados → Conectar aparelho → Conectar com número de telefone.</div><button class="btn primary" type="button" data-whatsapp-restart>Voltar para QR Code</button></div>`;
  }
  if (w.status === 'qr' && w.qrDataUrl) {
    return `<div class="wa-connection-panel"><strong>Leia o QR Code no WhatsApp</strong><div class="category">No celular: WhatsApp → Aparelhos conectados → Conectar aparelho e aponte a câmera para este QR Code.</div><img class="wa-qr" src="${esc(w.qrDataUrl)}" alt="QR Code para conectar o WhatsApp" /><div class="category wa-qr-status">Aguardando leitura do QR Code.</div><details class="wa-secondary-option"><summary>Usar código de vínculo em vez do QR Code</summary>${whatsappPairingForm()}</details><button class="btn" type="button" data-whatsapp-restart>Gerar novo QR Code</button></div>`;
  }
  if (w.status === 'connected') {
    return `<div class="wa-connection-panel success"><strong>WhatsApp conectado</strong><div class="category">${esc(w.account?.name || 'Conta ativa')}${w.account?.number ? ` · +${esc(w.account.number)}` : ''}</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" data-whatsapp-restart>Reiniciar conexão</button><button class="btn" data-whatsapp-disconnect>Desconectar</button></div></div>`;
  }
  if (['connecting', 'authenticated'].includes(w.status)) {
    return `<div class="wa-connection-panel"><strong>Gerando QR Code</strong><div class="category">Aguarde enquanto o PrismaStore prepara o QR Code para leitura no WhatsApp.</div><button class="btn" type="button" data-whatsapp-restart>Reiniciar geração</button></div>`;
  }
  if (w.status === 'error') {
    const rateLimited = Number(w.errorCode) === 429;
    const diagnostic = w.errorCode ? `<div class="category mono">Diagnóstico WhatsApp: ${esc(w.errorCode)}</div>` : '';
    return `<div class="wa-connection-panel error"><strong>Não foi possível gerar a conexão</strong><div class="category">${esc(friendlyErrorMessage(w.error, 'Não foi possível conectar ao WhatsApp. Tente novamente.'))}</div>${diagnostic}${rateLimited ? '<div class="notice">O código por número está temporariamente limitado pelo WhatsApp. Prefira o QR Code.</div>' : `<details class="wa-secondary-option"><summary>Usar código de vínculo como segunda opção</summary>${whatsappPairingForm()}</details>`}<button class="btn primary" type="button" data-whatsapp-restart>Gerar novo QR Code</button></div>`;
  }
  return `<div class="wa-connection-panel"><div class="category">A opção principal é a leitura por QR Code. O código de vínculo fica disponível como alternativa.</div><button class="btn primary" type="button" data-whatsapp-connect>Gerar QR Code</button><details class="wa-secondary-option"><summary>Usar código de vínculo como segunda opção</summary>${whatsappPairingForm()}</details></div>`;
}

function settingsBadge(ok, pending = false) {
  if (pending) return '<span class="badge orange">VERIFICANDO</span>';
  return ok ? '<span class="badge green">ATIVO</span>' : '<span class="badge red">ERRO</span>';
}

function whatsappSettingsBadge(pending = false) {
  if (pending) return '<span class="badge orange">VERIFICANDO</span>';
  if (state.whatsapp.status === 'connected') return '<span class="badge green">CONECTADO</span>';
  if (state.whatsapp.status === 'error') return '<span class="badge red">ERRO</span>';
  return '<span class="badge orange">NÃO CONECTADO</span>';
}

function settingsMessagesMarkup() {
  const settings = state.settings ?? { chatbotMessages: {} };
  return `
    <section class="card padded chatbot-message-settings" data-chatbot-message-settings>
      <div class="section-head">
        <div>
          <div class="section-title">Mensagens do atendimento</div>
          <div class="category">Estas mensagens são persistidas no SQLite e usadas nos próximos atendimentos.</div>
        </div>
        <span class="badge green">PERSISTENTE</span>
      </div>
      <div class="message-settings-grid">
        ${CHATBOT_MESSAGE_FIELDS.map((field) => `
          <label class="message-setting-field">
            <span class="message-setting-title">${esc(field.label)}</span>
            <textarea rows="4" data-message-key="${field.key}">${esc(messageValue(settings, field.key))}</textarea>
            <span class="message-setting-help">${field.placeholders.length ? `Variáveis: ${field.placeholders.map(esc).join(' · ')}` : 'Sem variáveis nesta etapa.'}</span>
            <button type="button" class="btn sm ghost" data-reset-message="${field.key}">Restaurar padrão</button>
          </label>`).join('')}
      </div>
      <div class="message-settings-footer">
        <span class="category" data-message-save-status></span>
        <button type="button" class="btn primary" data-save-chatbot-messages>Salvar mensagens</button>
      </div>
    </section>`;
}

function settingsView() {
  const health = state.settingsHealth;
  const paymentOk = Boolean(health.payments?.configured);
  const backupOk = Boolean(health.backups && !health.backups.error);
  const databaseOk = state.serverConnected;
  return shell(`${header('Configurações','Configurações reais do PrismaStore, com status consultado diretamente no servidor.')}
    ${health.error ? `<div class="notice settings-health-error">${esc(health.error)}</div>` : ''}
    <div class="grid cols-2 settings-runtime-grid">
      <section class="card padded">
        <div class="section-head"><div class="section-title">Sistema</div><span class="badge gray">TEMPO REAL</span></div>
        <div class="settings-list">
          <div class="setting-row"><div><div class="product-name">Banco de dados</div><div class="category">SQLite · data/prismastore.db</div></div>${settingsBadge(databaseOk, health.loading)}</div>
          <div class="setting-row"><div><div class="product-name">Pix Oscar</div><div class="category">Validação local por valor, destinatário, data e horário</div></div>${settingsBadge(paymentOk, health.loading)}</div>
          <div class="setting-row"><div><div class="product-name">Backups</div><div class="category">${health.backups?.external?.enabled ? 'Google Drive configurado' : 'Backup local disponível'}</div></div>${settingsBadge(backupOk, health.loading)}</div>
          <div class="setting-row"><div><div class="product-name">Aparência</div><div class="category">Alternar entre tema claro e escuro.</div></div><button class="theme-switch" type="button" role="switch" aria-checked="false" data-theme-toggle aria-label="Alternar tema claro e escuro">
          <span class="theme-switch-label" data-theme-label>Tema escuro</span>
          <span class="theme-switch-icon" aria-hidden="true">☀</span>
          <span class="theme-switch-track" aria-hidden="true"><span class="theme-switch-thumb"></span></span>
          <span class="theme-switch-icon" aria-hidden="true">☾</span>
        </button></div>
        </div>
        <button class="btn sm ghost" type="button" data-refresh-settings-health>Atualizar diagnóstico</button>
      </section>
      <section class="card padded">
        <div class="section-head"><div class="section-title">WhatsApp</div>${whatsappStatusBadge()}</div>
        <div class="settings-list">
          <div class="setting-row"><div><div class="product-name">Estado da conexão</div><div class="category">${esc(state.whatsapp.error || whatsappStatusLabel())}</div></div>${whatsappSettingsBadge(health.loading)}</div>
          <div class="setting-row"><div><div class="product-name">Conexão</div><div class="category">O vínculo e o QR Code ficam na tela inicial para não depender desta página.</div></div><button class="btn sm" type="button" data-view="dashboard">Abrir início</button></div>
        </div>
      </section>
    </div>
    ${settingsMessagesMarkup()}`);
}

async function refreshSettingsHealth() {
  if (state.view !== 'settings') return;
  state.settingsHealth = { ...state.settingsHealth, loading: true, error: null };
  render();
  try {
    const authResponse = await fetch('/api/auth/status', { cache: 'no-store' });
    const auth = await authResponse.json();
    if (auth.configured && !auth.authenticated) {
      state.settingsHealth = { ...state.settingsHealth, loading: false, error: 'Sua sessão expirou. Entre novamente para continuar.' };
      if (state.view === 'settings') render();
      window.dispatchEvent(new CustomEvent('prismastore:auth-required'));
      return;
    }

    const [paymentsResponse, backupsResponse] = await Promise.all([
      fetch('/api/payments/status', { cache: 'no-store' }),
      fetch('/api/backups', { cache: 'no-store' }),
      refreshWhatsAppStatus({ rerender: false }),
    ]);
    const [payments, backups] = await Promise.all([
      paymentsResponse.json(),
      backupsResponse.json(),
    ]);
    if (!paymentsResponse.ok) throw new Error(payments.error || 'Falha ao consultar o Pix.');
    if (!backupsResponse.ok) throw new Error(backups.error || 'Falha ao consultar backups.');
    state.settingsHealth = { loading: false, payments, backups, error: null };
  } catch (error) {
    state.settingsHealth = {
      ...state.settingsHealth,
      loading: false,
      error: friendlyErrorMessage(error, 'Não foi possível validar todas as configurações do servidor.'),
    };
  }
  if (state.view === 'settings') render();
}

async function saveChatbotMessageSettings() {
  state.settings = state.settings && typeof state.settings === 'object' ? state.settings : {};
  state.settings.chatbotMessages = state.settings.chatbotMessages && typeof state.settings.chatbotMessages === 'object'
    ? state.settings.chatbotMessages
    : {};
  document.querySelectorAll('[data-message-key]').forEach((field) => {
    state.settings.chatbotMessages[field.dataset.messageKey] = field.value;
  });
  const saved = await persist();
  const status = document.querySelector('[data-message-save-status]');
  if (status) status.textContent = saved
    ? 'Mensagens salvas no SQLite. O próximo atendimento usará estes textos.'
    : 'Não foi possível salvar as mensagens.';
}

function restoreChatbotMessageDefault(key) {
  const field = document.querySelector(`[data-message-key="${CSS.escape(key)}"]`);
  if (field) field.value = CHATBOT_MESSAGE_DEFAULTS[key] ?? '';
}

function deliveryConfirmationPilot(order) {
  return Array.isArray(order?.items)
    && order.items.some((item) => item?.productId === 'catalog-eduardo-teste');
}

function evidenceDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : formatDate(value);
}

function deliveryDossier(order) {
  if (!deliveryConfirmationPilot(order)) return '';
  const journey = order.deliveryJourney || {};
  const confirmation = order.deliveryConfirmation || {};
  const confirmed = Boolean(confirmation.confirmedAt);
  const rideLink = cleanAddressText(journey.rideLink);
  const publicLink = cleanAddressText(confirmation.link);

  return `<div class="detail-block delivery-dossier">
    <div class="delivery-dossier-head">
      <div>
        <div class="detail-label">Dossiê de entrega · piloto</div>
        <strong>${confirmed ? 'Recebimento confirmado' : 'Aguardando confirmação do cliente'}</strong>
      </div>
      <span class="badge ${confirmed ? 'green' : 'orange'}">${confirmed ? 'CONFIRMADO' : 'PENDENTE'}</span>
    </div>
    <div class="delivery-dossier-grid">
      <div><span>Solicitação da entrega</span><strong>${evidenceDate(journey.requestedAt)}</strong></div>
      <div><span>Corrida registrada</span><strong>${evidenceDate(journey.rideRegisteredAt)}</strong></div>
      <div><span>Entregue ao transportador</span><strong>${evidenceDate(journey.handoffAt)}</strong></div>
      <div><span>Recebimento confirmado</span><strong>${evidenceDate(confirmation.confirmedAt || journey.deliveredAt)}</strong></div>
    </div>
    ${rideLink ? `<div class="delivery-evidence-row"><span>Link da corrida</span><a href="${esc(rideLink)}" target="_blank" rel="noopener noreferrer">Abrir corrida</a></div>` : '<div class="delivery-evidence-row muted"><span>Link da corrida</span><strong>Não registrado</strong></div>'}
    ${confirmation.recipientName ? `<div class="delivery-evidence-row"><span>Recebedor</span><strong>${esc(confirmation.recipientName)}</strong></div>` : ''}
    ${confirmation.notes ? `<div class="delivery-evidence-note"><span>Observação</span><p>${esc(confirmation.notes)}</p></div>` : ''}
    ${confirmation.photoDataUrl ? `<div class="delivery-evidence-media"><span>Foto da entrega</span><img src="${confirmation.photoDataUrl}" alt="Foto registrada na confirmação de entrega" /></div>` : ''}
    ${confirmation.signatureDataUrl ? `<div class="delivery-evidence-media signature"><span>Assinatura</span><img src="${confirmation.signatureDataUrl}" alt="Assinatura de quem confirmou o recebimento" /></div>` : ''}
    ${!confirmed && order.status === 'DELIVERED' ? `
      <div class="delivery-dossier-actions">
        ${publicLink
          ? `<button class="btn" type="button" data-copy-delivery-link="${esc(publicLink)}">Copiar link</button><a class="btn" href="${esc(publicLink)}" target="_blank" rel="noopener noreferrer">Abrir</a>`
          : `<button class="btn primary" type="button" data-generate-delivery-link="${esc(order.id)}">Gerar link novamente</button>`}
      </div>
    ` : ''}
    ${confirmed ? `<div class="delivery-dossier-actions"><a class="btn" href="/api/orders/${encodeURIComponent(order.id)}/delivery-confirmation/export" download>Exportar dossiê</a></div>` : ''}
    ${confirmation.linkSentAt ? `<div class="delivery-evidence-row"><span>Link enviado</span><strong>${evidenceDate(confirmation.linkSentAt)} · ${esc(confirmation.linkSentChannel || 'WhatsApp')}</strong></div>` : ''}
  </div>`;
}

function orderDrawer(orderId) {
  const o=state.orders.find(x=>x.id===orderId); if(!o) return '';
  const canAdvance=['PAID','PACKING','SHIPPED','OUT_FOR_DELIVERY'].includes(o.status);
  const next=nextOrderStatus(o);
  const label=next==='DELIVERED' && o.deliveryType==='local_delivery' ? 'Entregue ao motoboy · Concluir' : ({PACKING:'Marcar como produto embalado',SHIPPED:'Marcar como enviado',DELIVERED:'Concluir pedido'}[next]||'Atualizar');
  return `<div class="drawer-backdrop" data-close-drawer><aside class="drawer" onclick="event.stopPropagation()"><div class="drawer-head"><div><div class="eyebrow">Pedido</div><h2>Detalhes do pedido</h2><div class="subtitle">${formatDate(o.createdAt)} · ${esc(o.customerName)}</div></div><button class="btn" data-close-drawer>${icons.close}</button></div>
    <div>${statusBadge(o.status)} ${o.newAddress?'<span class="badge gold">NOVO ENDEREÇO</span>':''}</div>
    <div class="detail-block"><div class="detail-label">Cliente</div><div class="customer-name">${esc(o.customerName)}</div><div class="category">${esc(formatPhoneDisplay(o.phone))}</div></div>
    <div class="detail-block"><div class="detail-label">Endereço do pedido</div><div class="subtitle">${esc(addressText(o.address))}</div></div>
    <div class="detail-block"><div class="detail-label">Itens</div>${o.items.map(i=>`<div class="item-row"><span>${i.quantity}× ${esc(i.name)}</span><strong>${formatCurrencyBRL(i.quantity*i.unitPrice)}</strong></div>`).join('')}<div class="item-row"><span>${o.deliveryType==='shipping'?'Frete':'Entrega'}</span><strong>${formatCurrencyBRL(o.deliveryFee||0)}</strong></div><div class="item-row" style="border-top:1px solid var(--border-soft);padding-top:12px"><strong>Total</strong><strong>${formatCurrencyBRL(o.total)}</strong></div></div>
    <div class="detail-block"><div class="detail-label">Pagamento</div><div class="subtitle">${o.paidAt?`Confirmado em ${formatDate(o.paidAt)} · ${esc(receivingAccounts.find(a=>a.id===o.receivingAccountId)?.name||o.receivingAccountId)}`:'Aguardando confirmação'}</div></div>
    ${deliveryDossier(o)}
    ${canAdvance?`<button class="btn primary" style="width:100%" data-advance-order="${o.id}" data-order-status="${o.status}">${label}</button>`:''}
  </aside></div>`;
}

function render() {
  const app=document.querySelector('#app');
  const renderer={dashboard:dashboardView,orders:ordersView,customers:customersView,products:productsView,reports:reportsView,chatbot:chatbotView,settings:settingsView}[state.view]||dashboardView;
  app.innerHTML=renderer();
  bind();
  window.PrismastoreTheme?.sync(app);
  syncWhatsAppStatusPolling();
}

function openView(view) {
  const allowed = new Set(['dashboard','orders','customers','products','reports','chatbot','settings']);
  if (!allowed.has(view)) return false;
  if (view !== state.view) state.previousView = state.view;
  state.view = view;
  state.selectedOrder = null;
  render();
  window.dispatchEvent(new CustomEvent('prismastore:view-changed', { detail: { view: state.view } }));
  if (state.view === 'dashboard') refreshWhatsAppStatus({ rerender: true });
  if (state.view === 'settings') refreshSettingsHealth();
  return true;
}

window.PrismastoreApp = {
  ...(window.PrismastoreApp || {}),
  openView,
};

function bind() {
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{
    const openHistory=b.dataset.ordersHistory==='true';
    openView(b.dataset.view);
    if(openHistory) window.dispatchEvent(new CustomEvent('prismastore:orders-history-requested'));
  }));
  document.querySelector('[data-back-view]')?.addEventListener('click',()=>openView(state.previousView || 'dashboard'));
  document.querySelectorAll('[data-order-filter]').forEach(b=>b.addEventListener('click',()=>{state.orderFilter=b.dataset.orderFilter;render();}));
  document.querySelector('#order-search')?.addEventListener('input',(e)=>{state.search=e.target.value; render(); requestAnimationFrame(()=>{const input=document.querySelector('#order-search');input?.focus();input?.setSelectionRange(state.search.length,state.search.length);});});
  document.querySelectorAll('[data-open-order]').forEach(b=>b.addEventListener('click',()=>{state.selectedOrder=b.dataset.openOrder;render();}));
  document.querySelectorAll('[data-close-drawer]').forEach(b=>b.addEventListener('click',(event)=>{
    if (b.classList.contains('drawer-backdrop') && event.target !== b) return;
    state.selectedOrder=null;
    render();
  }));
  document.querySelectorAll('[data-generate-delivery-link]').forEach((button) => button.addEventListener('click', async (event) => {
    event.stopPropagation();
    const orderId = button.dataset.generateDeliveryLink;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Gerando…';
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/delivery-confirmation/link`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Falha ao gerar link.');
      await loadOperationalState();
      state.selectedOrder = orderId;
      render();
      if (payload.link && navigator.clipboard?.writeText) await navigator.clipboard.writeText(payload.link);
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      button.title = error instanceof Error ? error.message : 'Falha ao gerar link.';
    }
  }));
  document.querySelectorAll('[data-copy-delivery-link]').forEach((button) => button.addEventListener('click', async (event) => {
    event.stopPropagation();
    const link = button.dataset.copyDeliveryLink || '';
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      button.textContent = 'Link copiado';
    } catch {
      window.prompt('Copie o link de confirmação:', link);
    }
  }));
  document.querySelectorAll('[data-advance-order]').forEach(b=>b.addEventListener('click',async(event)=>{
    event.stopPropagation();
    const o=state.orders.find(x=>x.id===b.dataset.advanceOrder);
    if(!o) return;
    b.disabled=true;
    const original=b.textContent;
    b.textContent='Atualizando…';
    try{
      const response=await fetch(`/api/orders/${encodeURIComponent(o.id)}/advance`,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({expectedStatus:o.status}),
      });
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||'Falha ao atualizar pedido.');
      await loadOperationalState();
      window.dispatchEvent(new CustomEvent('prismastore:orders-updated',{detail:{orderId:o.id,status:result.order?.status||null}}));
      state.selectedOrder=o.id;
      render();
    }catch(error){
      console.error(error);
      b.disabled=false;
      b.textContent=original;
      b.title=error instanceof Error?error.message:'Falha ao atualizar pedido.';
    }
  }));
  document.querySelectorAll('[data-stock-inc]').forEach(b=>b.addEventListener('click',()=>{const p=state.products.find(x=>x.id===b.dataset.stockInc);p.stock+=1;persist();render();}));
  document.querySelectorAll('[data-stock-dec]').forEach(b=>b.addEventListener('click',()=>{const p=state.products.find(x=>x.id===b.dataset.stockDec);p.stock=Math.max(0,p.stock-1);persist();render();}));
  document.querySelectorAll('[data-stock-input]').forEach(input=>input.addEventListener('change',()=>{const p=state.products.find(x=>x.id===input.dataset.stockInput);const value=Math.max(0,Number.parseInt(input.value,10)||0);p.stock=value;persist();render();}));
  document.querySelector('#add-demo-product')?.addEventListener('click',()=>{state.products.push({id:`p${Date.now()}`,name:'Novo produto de demonstração',price:19.9,stock:5,active:true});persist();render();});
  document.querySelectorAll('[data-cart-inc]').forEach(b=>b.addEventListener('click',()=>{const p=state.products.find(x=>x.id===b.dataset.cartInc);const current=state.chatbot.cart[p.id]||0;if(current<availableStock(p)) state.chatbot.cart[p.id]=current+1;render();}));
  document.querySelectorAll('[data-cart-dec]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.cartDec;state.chatbot.cart[id]=Math.max(0,(state.chatbot.cart[id]||0)-1);render();}));
  document.querySelectorAll('[data-delivery]').forEach(b=>b.addEventListener('click',()=>{state.chatbot.deliveryType=b.dataset.delivery;render();}));
  document.querySelectorAll('[data-address-mode]').forEach(b=>b.addEventListener('click',()=>{state.chatbot.addressMode=b.dataset.addressMode;render();}));
  document.querySelectorAll('[data-chat-action]').forEach(b=>b.addEventListener('click',()=>chatAction(b.dataset.chatAction)));
  document.querySelector('#reset-chat')?.addEventListener('click',resetChat); document.querySelector('#reset-chat-2')?.addEventListener('click',resetChat);
  document.querySelector('[data-whatsapp-connect]')?.addEventListener('click', connectWhatsApp);
  document.querySelector('[data-whatsapp-pair]')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    const phone = document.querySelector('[data-whatsapp-pair-phone]')?.value?.trim() || '';
    button.disabled = true;
    pairWhatsAppByPhone(phone).finally(() => { button.disabled = false; });
  });
  document.querySelector('[data-whatsapp-restart]')?.addEventListener('click', restartWhatsAppConnection);
  document.querySelector('[data-whatsapp-disconnect]')?.addEventListener('click', disconnectWhatsApp);
  document.querySelector('[data-refresh-settings-health]')?.addEventListener('click', refreshSettingsHealth);
  document.querySelector('[data-save-chatbot-messages]')?.addEventListener('click', saveChatbotMessageSettings);
  document.querySelectorAll('[data-reset-message]').forEach((button) => button.addEventListener('click', () => restoreChatbotMessageDefault(button.dataset.resetMessage)));
}
function resetChat(){state.chatbot={step:'welcome',cart:{},deliveryType:null,addressMode:null,paymentConfirmed:false};render();}
async function chatAction(action){
  const map={'age-confirm':'catalog','delivery':'delivery','address':'address','review':'review','pix':'pix'};
  if(map[action]){state.chatbot.step=map[action];render();return;}
  if(action==='confirm-payment'){
    const t=calculateCart(state.products,state.chatbot.cart);const fee=state.chatbot.deliveryType==='shipping'?24.9:18;
    const id=`PS-${1050+state.orders.length}`;
    const activeCatalog=state.products.filter(p=>p.active!==false&&availableStock(p)>0);
    const items=Object.entries(state.chatbot.cart).filter(([,q])=>q>0).map(([pid,q])=>{const p=state.products.find(x=>x.id===pid);const activeIndex=activeCatalog.findIndex(x=>x.id===pid);const fallbackIndex=state.products.findIndex(x=>x.id===pid);return{productId:pid,name:p.name,catalogItemNumber:(activeIndex>=0?activeIndex:fallbackIndex)+1,quantity:q,unitPrice:p.price}});
    state.orders.unshift({id,customerId:'c1',customerName:'Lucas Almeida',phone:'+55 11 98888-1204',status:'PAID',deliveryType:state.chatbot.deliveryType,total:t.subtotal+fee,createdAt:new Date().toISOString(),paidAt:new Date().toISOString(),receivingAccountId:'pix-local',items,address:chatAddress(),newAddress:state.chatbot.addressMode==='new',deliveryFee:fee});
    state.chatbot.step='paid';state.chatbot.paymentConfirmed=true;
    await persist();
    window.dispatchEvent(new CustomEvent('prismastore:orders-updated', { detail: { source: 'chat-simulator', orderId: id } }));
    render();
  }
}

let operationalRuntimeStarted = false;

async function bootstrapOperationalRuntime() {
  if (operationalRuntimeStarted) return;
  operationalRuntimeStarted = true;
  const loaded = await loadOperationalState();
  await refreshWhatsAppStatus({ rerender: false });
  if (loaded) window.dispatchEvent(new CustomEvent('prismastore:runtime-ready'));
  render();
}

let externalStateRefreshRunning = false;

async function refreshOperationalStateWithoutReset() {
  if (externalStateRefreshRunning) return false;
  externalStateRefreshRunning = true;
  const activeView = state.view;
  const selectedOrder = state.selectedOrder;
  try {
    const loaded = await loadOperationalState();
    if (!loaded) return false;
    state.view = activeView;
    state.selectedOrder = selectedOrder && state.orders.some((order) => order.id === selectedOrder)
      ? selectedOrder
      : null;
    render();
    window.dispatchEvent(new CustomEvent('prismastore:state-updated', {
      detail: { source: 'live-sync' },
    }));
    return true;
  } finally {
    externalStateRefreshRunning = false;
  }
}

render();
window.addEventListener('prismastore:dashboard-opened', bootstrapOperationalRuntime, { once: true });
window.addEventListener('prismastore:external-state-changed', refreshOperationalStateWithoutReset);
window.addEventListener('prismastore:auth-restored', () => {
  if (state.view === 'settings') refreshSettingsHealth();
});
if (!document.querySelector('#app')?.hidden) bootstrapOperationalRuntime();
