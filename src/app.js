import {
  availableStock,
  isLowStock,
  calculateCart,
  nextOrderStatus,
  formatCurrencyBRL,
  computeProductStatus,
} from './domain.js';
import { seedProducts, seedCustomers, seedOrders, receivingAccounts } from './data.js';

const icons = {
  dashboard: '▦', orders: '◫', customers: '◎', products: '□', reports: '⌁', chatbot: '◌', settings: '⚙', search: '⌕', alert: '!', money: 'R$', box: '◇', close: '×'
};

const clone = (v) => JSON.parse(JSON.stringify(v));

const state = {
  view: 'dashboard',
  orderFilter: 'all',
  search: '',
  selectedOrder: null,
  products: clone(seedProducts),
  customers: clone(seedCustomers),
  orders: clone(seedOrders),
  serverConnected: false,
  serverError: null,
  whatsapp: { status: 'disconnected', qrDataUrl: null, account: null, error: null },
  chatbot: { step: 'welcome', cart: {}, deliveryType: null, addressMode: null, paymentConfirmed: false },
};

async function loadOperationalState() {
  const response = await fetch('/api/state', { cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível carregar os dados locais.');
  const persisted = await response.json();
  state.products = Array.isArray(persisted.products) ? persisted.products : clone(seedProducts);
  state.customers = Array.isArray(persisted.customers) ? persisted.customers : clone(seedCustomers);
  state.orders = Array.isArray(persisted.orders) ? persisted.orders : clone(seedOrders);
  state.serverConnected = true;
  state.serverError = null;
}

async function persist() {
  try {
    const response = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ products: state.products, customers: state.customers, orders: state.orders }),
    });
    if (!response.ok) throw new Error('Falha ao salvar dados locais.');
    state.serverConnected = true;
    state.serverError = null;
  } catch (error) {
    state.serverConnected = false;
    state.serverError = error instanceof Error ? error.message : 'Falha ao salvar dados locais.';
    console.error(error);
  }
}

function el(html) { const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstElementChild; }
function esc(s='') { return String(s).replace(/[&<>'"]/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[m])); }
function formatDate(iso) { return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)); }
function latestAddress(customer) { return customer?.addresses?.[customer.addresses.length-1]; }
function addressText(a) { if(!a) return '—'; if(a.formatted) return a.formatted; return `${a.street}, ${a.number}${a.complement ? ` · ${a.complement}`:''} · ${a.neighborhood} · ${a.city}/${a.state} · ${a.zip}`; }
function statusBadge(status) {
  const cfg = {
    PAYMENT_PENDING:['Aguardando Pix','orange'], PAID:['Pago · Embalar','green'], PACKING:['Embalando','gold'], SHIPPED:['Enviado','gray'], OUT_FOR_DELIVERY:['Saiu para entrega','gold'], DELIVERED:['Entregue','gray'], CANCELLED:['Cancelado','red']
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
  ['customers','Clientes','◎'],
  ['products','Produtos','□'],
];

function shell(content) {
  return `
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark"><img src="/icons/prismastore-logo.png" alt="" aria-hidden="true" /></div><div class="brand-copy"><strong>PrismaStore</strong><span>Operations</span></div></div>
      <div class="nav-group">
        <div class="nav-label">Operação</div>
        ${views.map(([id,label,icon])=>`<button class="nav-btn ${state.view===id?'active':''}" data-view="${id}"><span class="nav-icon">${icon}</span>${label}</button>`).join('')}
        <div class="nav-label">Sistema</div>
        <button class="nav-btn ${state.view==='settings'?'active':''}" data-view="settings"><span class="nav-icon">⚙</span>Configurações</button>
      </div>
      <div class="sidebar-footer"><div class="status-row"><span>WhatsApp</span><span style="display:flex;gap:8px;align-items:center"><i class="status-dot ${state.whatsapp.status==='connected'?'':'offline'}"></i>${whatsappStatusLabel()}</span></div></div>
    </aside>
    <main class="main">${content}</main>
    <nav class="mobile-bottom">${mobileViews.map(([id,label,icon])=>`<button class="${state.view===id?'active':''}" data-view="${id}"><span class="mob-icon">${icon}</span>${label}</button>`).join('')}<button type="button" data-pwa-more><span class="mob-icon">•••</span>Mais</button></nav>
    ${state.selectedOrder ? orderDrawer(state.selectedOrder) : ''}
  </div>`;
}

function header(title, subtitle, actions='') {
  return `<div class="topbar"><div><h1>${title}</h1><div class="subtitle">${subtitle}</div></div>${actions ? `<div class="top-actions">${actions}</div>` : ''}</div>`;
}

function dashboardView() {
  const lowProducts = state.products.filter(isLowStock);
  const low = lowProducts.length;
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthLabel = new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(now);
  const paidMonth = state.orders.filter(o=>o.paidAt?.startsWith(monthKey));
  const revenue = paidMonth.reduce((s,o)=>s+o.total,0);
  const pendingOrders = state.orders.filter(o=>['PAID','PACKING'].includes(o.status));
  const pendingPacking = pendingOrders.length;
  const criticalAvailable = lowProducts.reduce((sum,p)=>sum+Math.max(0,availableStock(p)),0);
  const criticalBars = low ? Math.max(1,Math.min(5,Math.round((criticalAvailable/(low*3))*5))) : 0;

  return shell(`
    <div class="dashboard-screen">
      <section class="dashboard-hero">
        <div>
          <div class="eyebrow">PRISMASTORE · MVP</div>
          <h1>Central de Operações</h1>
          <div class="subtitle">Tudo o que importa para o seu pós-pagamento, em uma única visão.</div>
        </div>
        <img class="dashboard-prism" src="/assets/prism-hero.svg" alt="" aria-hidden="true" />
      </section>

      <div class="dashboard-kpis">
        ${dashboardKpi('money','Faturamento do mês',formatCurrencyBRL(revenue),'↑ 12,8% vs. mês anterior','positive',0)}
        ${dashboardKpi('cart','Pedidos pagos',String(paidMonth.length),monthLabel,'',Math.min(5,paidMonth.length))}
        ${dashboardKpi('box','Para embalar',String(pendingPacking),'Prioridade operacional','warning',Math.min(5,pendingPacking))}
        ${dashboardKpi('alert','Estoque crítico',String(low),low?`${low} item(ns) abaixo do limite`:'Sem alertas no momento','danger',criticalBars)}
      </div>

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
        ${lowProducts.length ? `<div class="dashboard-stock-list">${lowProducts.map(p=>`<div class="item-row"><div><div class="product-name">${esc(p.name)}</div><div class="category">${availableStock(p)} disponível · ${p.reserved} reservado</div></div>${productBadge(p)}</div>`).join('')}</div>` : `
          <div class="stock-empty-state">
            <img src="/assets/empty-stock-ok.svg" alt="" aria-hidden="true" />
            <strong>Nenhum alerta ativo.</strong>
            <span>Seu estoque está sob controle.</span>
          </div>`}
      </section>

      <section class="card padded dashboard-section recent-orders-card">
        <div class="section-head">
          <div class="section-title">Últimos pedidos</div>
          <button class="btn sm ghost" data-view="orders">Ver todos ›</button>
        </div>
        <div class="dashboard-order-list compact">
          ${state.orders.slice(0,5).map(orderCompact).join('') || '<div class="empty dashboard-empty">Nenhum pedido registrado.</div>'}
        </div>
      </section>
    </div>`);
}

function dashboardBars(count=0, tone='green') {
  const safe = Math.max(0,Math.min(5,Number(count)||0));
  return `<span class="mini-bars ${tone}" aria-hidden="true">${[1,2,3,4,5].map(i=>`<i class="${i<=safe?'on':''}"></i>`).join('')}</span>`;
}

function dashboardKpi(icon,label,value,meta,klass='',bars=0) {
  const tone = klass==='warning' ? 'gold' : klass==='danger' ? 'muted' : 'green';
  return `<div class="card padded dashboard-kpi ${klass}">
    <div class="dashboard-kpi-top">
      <span class="dashboard-kpi-icon ${klass}">${icon==='money'?'$':icon==='cart'?'⌑':icon==='box'?'◇':'!'}</span>
      <div class="kpi-label">${label}</div>
    </div>
    <div class="dashboard-kpi-value-row">
      <div class="kpi-value mono">${value}</div>
      ${bars ? dashboardBars(bars,tone) : ''}
    </div>
    <div class="kpi-meta ${klass==='positive'?'positive':''}">${meta}</div>
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
    <span class="order-cart" aria-hidden="true">⌑</span>
    <span class="order-main">
      <strong class="customer-name">${esc(o.customerName)}</strong>
      <span class="order-summary">${esc(summarizeOrderItems(o))}</span>
      <span class="category">${formatDate(o.createdAt)} · ${o.deliveryType==='shipping'?'Envio':'Entrega local'}</span>
    </span>
    <span class="order-side">
      ${statusBadge(o.status)}
      <strong class="mono">${formatCurrencyBRL(o.total)}</strong>
    </span>
    <span class="order-chevron" aria-hidden="true">›</span>
  </button>`;
}

function ordersView() {
  let orders = [...state.orders];
  if(state.orderFilter!=='all') orders=orders.filter(o=>o.status===state.orderFilter);
  if(state.search) orders=orders.filter(o=>`${o.id} ${o.customerName} ${o.phone}`.toLowerCase().includes(state.search.toLowerCase()));
  return shell(`${header('Pedidos','Do pagamento confirmado até envio ou entrega no endereço do cliente.','<button class="btn primary" data-view="chatbot">+ Simular pedido</button>')}
    <div class="toolbar">
      <div class="tabs">${[['all','Todos'],['PAID','Embalar'],['PACKING','Embalando'],['SHIPPED','Enviados'],['OUT_FOR_DELIVERY','Em rota'],['DELIVERED','Entregues']].map(([id,l])=>`<button class="tab ${state.orderFilter===id?'active':''}" data-order-filter="${id}">${l}</button>`).join('')}</div>
      <label class="searchbar"><span>⌕</span><input id="order-search" value="${esc(state.search)}" placeholder="Pedido, cliente ou celular" /></label>
    </div>
    ${ordersTable(orders,'Fila de pedidos')}`);
}
function ordersTable(orders,title) { return `<div class="section-head"><div class="section-title">${title}</div><div class="section-note">${orders.length} registro(s)</div></div><div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Modalidade</th><th>Status</th><th>Endereço</th><th>Total</th><th></th></tr></thead><tbody>${orders.map(o=>`<tr><td><span class="order-id">${o.id}</span><div class="category">${formatDate(o.createdAt)}</div></td><td><div class="customer-name">${esc(o.customerName)}</div><div class="category">${esc(o.phone)}</div></td><td>${o.deliveryType==='shipping'?'Envio':'Entrega'} </td><td>${statusBadge(o.status)}</td><td><div class="address">${o.newAddress?'<span class="badge gold" style="margin-right:5px">NOVO ENDEREÇO</span>':''}${esc(`${o.address.street}, ${o.address.number} · ${o.address.neighborhood}`)}</div></td><td class="mono"><strong>${formatCurrencyBRL(o.total)}</strong></td><td><button class="btn sm" data-open-order="${o.id}">Detalhes</button></td></tr>`).join('')}</tbody></table></div>`; }

function customersView() {
  return shell(`${header('Clientes','Cadastro unificado pelo número do WhatsApp, histórico de endereço e pedidos anteriores.')}
    <div class="toolbar"><label class="searchbar"><span>⌕</span><input id="customer-search" placeholder="Buscar nome ou celular" /></label></div>
    <div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Endereço atual</th><th>Monitoramento</th><th>Pedidos</th><th>Total gasto</th><th>Última compra</th></tr></thead><tbody>${state.customers.map(c=>`<tr><td><div class="customer-name">${esc(c.name)}</div><div class="category">${esc(c.phone)}</div></td><td><div class="address">${esc(addressText(latestAddress(c)))}</div></td><td>${c.addressChanged?'<span class="badge gold">NOVO ENDEREÇO</span>':'<span class="badge gray">Sem alteração</span>'}</td><td class="mono">${c.orderCount}</td><td class="mono"><strong>${formatCurrencyBRL(c.totalSpent)}</strong></td><td>${formatDate(c.lastOrderAt)}</td></tr>`).join('')}</tbody></table></div>
    <div class="grid cols-2 section"><div class="card padded"><div class="section-title">Regra de monitoramento</div><p class="subtitle">Ao receber um endereço diferente de todos os endereços históricos do cliente, o pedido recebe o badge <strong style="color:var(--gold)">NOVO ENDEREÇO</strong>. O pedido guarda o snapshot usado naquela compra.</p></div><div class="card padded"><div class="section-title">Identidade do cliente</div><p class="subtitle">O celular/WhatsApp é o identificador inicial. Nome, endereços e histórico evoluem sem sobrescrever pedidos antigos.</p></div></div>`);
}

function productsView() {
  return shell(`${header('Produtos','Catálogo em texto, estoque físico, reserva e alerta automático abaixo de 3 unidades.','<button class="btn primary" id="add-demo-product">+ Produto demo</button>')}
    <div class="section table-wrap"><table><thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Físico</th><th>Reservado</th><th>Disponível</th><th>Status</th><th>Ajuste</th></tr></thead><tbody>${state.products.map(p=>`<tr><td><div class="product-name">${esc(p.name)}</div><div class="category">ID ${p.id}</div></td><td>${esc(p.category)}</td><td class="mono">${formatCurrencyBRL(p.price)}</td><td class="mono">${p.stock}</td><td class="mono">${p.reserved}</td><td class="mono"><strong>${availableStock(p)}</strong></td><td>${productBadge(p)}</td><td><div class="qty-controls stock-control"><button type="button" aria-label="Subtrair estoque" data-stock-dec="${p.id}">−</button><input type="number" min="0" step="1" inputmode="numeric" aria-label="Estoque físico de ${esc(p.name)}" data-stock-input="${p.id}" value="${p.stock}" /><button type="button" aria-label="Adicionar estoque" data-stock-inc="${p.id}">+</button></div></td></tr>`).join('')}</tbody></table></div>`);
}

function reportsView() {
  const monthOrders=state.orders.filter(o=>o.paidAt?.startsWith('2026-09'));
  const revenue=monthOrders.reduce((s,o)=>s+o.total,0);
  const avg=monthOrders.length?revenue/monthOrders.length:0;
  const accounts=receivingAccounts.map(a=>({ ...a, total:monthOrders.filter(o=>o.receivingAccountId===a.id).reduce((s,o)=>s+o.total,0) }));
  const daily=[120,280,190,420,355,510,320,580,440,690,535,760,620];
  const max=Math.max(...daily);
  return shell(`${header('Relatórios','Faturamento mensal e rastreabilidade de qual conta recebeu cada pagamento.','<button class="btn">Exportar CSV</button>')}
    <div class="grid cols-4">${kpi('Faturamento setembro',formatCurrencyBRL(revenue),'Pagamentos confirmados','positive')}${kpi('Pedidos pagos',String(monthOrders.length),'Baseado em paidAt')}${kpi('Ticket médio',formatCurrencyBRL(avg),'Pedidos pagos')}${kpi('Contas recebedoras',String(accounts.filter(a=>a.total>0).length),'Identificadas por transação')}</div>
    <div class="grid cols-2 section">
      <div class="card chart-card"><div class="section-head"><div class="section-title">Fluxo do mês</div><div class="section-note">Demonstração visual</div></div><div class="bar-chart">${daily.map((v,i)=>`<div class="bar-col"><div class="bar" style="height:${Math.round(v/max*100)}%" title="${formatCurrencyBRL(v)}"></div><div class="bar-label">${String(i+1).padStart(2,'0')}</div></div>`).join('')}</div></div>
      <div class="card chart-card"><div class="section-head"><div class="section-title">Recebimento por conta</div><div class="section-note">Setembro</div></div><div class="account-bars">${accounts.map(a=>`<div class="account-row"><span>${esc(a.name)}</span><div class="progress ${a.accent==='gold'?'gold':''}"><i style="width:${revenue?Math.max(4,a.total/revenue*100):0}%"></i></div><strong class="mono">${formatCurrencyBRL(a.total)}</strong></div>`).join('')}</div><div class="detail-block" style="margin-top:16px"><div class="detail-label">Regra financeira</div><div class="subtitle">O relatório usa a data efetiva de confirmação do pagamento e a conta recebedora registrada pelo webhook.</div></div></div>
    </div>
    <div class="section">${ordersTable(monthOrders,'Transações consideradas no mês')}</div>`);
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
  if(c.step==='catalog') return `<div class="section-title">2. Cardápio textual</div><p class="subtitle">Selecione produtos e quantidades como se o cliente estivesse respondendo no WhatsApp.</p><div class="catalog-list">${state.products.filter(p=>availableStock(p)>0).map(p=>`<div class="catalog-row"><div><div class="product-name">${esc(p.name)}</div><div class="category">${esc(p.category)} · ${availableStock(p)} disp.</div></div><strong class="mono">${formatCurrencyBRL(p.price)}</strong><div class="qty-controls"><button data-cart-dec="${p.id}">−</button><span>${c.cart[p.id]||0}</span><button data-cart-inc="${p.id}">+</button></div></div>`).join('')}</div><div class="detail-block"><div class="summary-line"><span>${totals.quantity} item(ns)</span><strong>${formatCurrencyBRL(totals.subtotal)}</strong></div><button class="btn primary" data-chat-action="delivery" ${totals.quantity?'':'disabled'}>Continuar</button></div>`;
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
    hasQr: Boolean(whatsapp.qrDataUrl),
  });
}

async function refreshWhatsAppStatus({ rerender = false } = {}) {
  const before = whatsappRenderKey(state.whatsapp);
  try {
    const response = await fetch('/api/whatsapp/status', { cache: 'no-store' });
    state.whatsapp = await response.json();
    if (!response.ok && state.whatsapp.status !== 'error') throw new Error(state.whatsapp.error || 'Falha ao consultar WhatsApp');
  } catch (error) {
    state.whatsapp = { status: 'error', qrDataUrl: null, account: null, error: error instanceof Error ? error.message : 'Falha ao consultar WhatsApp' };
  }
  if (rerender && state.view === 'settings' && before !== whatsappRenderKey(state.whatsapp)) render();
  return state.whatsapp;
}

async function connectWhatsApp() {
  state.whatsapp = { ...state.whatsapp, status: 'connecting', error: null };
  render();
  try {
    const response = await fetch('/api/whatsapp/connect', { method: 'POST' });
    state.whatsapp = await response.json();
    if (!response.ok) throw new Error(state.whatsapp.error || 'Falha ao conectar WhatsApp');
  } catch (error) {
    state.whatsapp = { status: 'error', qrDataUrl: null, account: null, error: error instanceof Error ? error.message : 'Falha ao conectar WhatsApp' };
  }
  render();
}

async function pairWhatsAppByPhone(phone) {
  try {
    const response = await fetch('/api/whatsapp/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    state.whatsapp = await response.json();
    if (!response.ok) throw new Error(state.whatsapp.error || 'Falha ao gerar código de pareamento');
  } catch (error) {
    state.whatsapp = { ...state.whatsapp, status: 'error', pairingCode: null, error: error instanceof Error ? error.message : 'Falha ao gerar código de pareamento' };
  }
  render();
}

async function disconnectWhatsApp() {
  try {
    const response = await fetch('/api/whatsapp/disconnect', { method: 'POST' });
    state.whatsapp = await response.json();
  } catch (error) {
    state.whatsapp = { status: 'error', qrDataUrl: null, account: null, error: error instanceof Error ? error.message : 'Falha ao desconectar WhatsApp' };
  }
  render();
}

async function restartWhatsAppConnection() {
  state.whatsapp = { ...state.whatsapp, status: 'connecting', pairingCode: null, qrDataUrl: null, error: null };
  render();
  try {
    const response = await fetch('/api/whatsapp/restart', { method: 'POST' });
    state.whatsapp = await response.json();
    if (!response.ok) throw new Error(state.whatsapp.error || 'Falha ao reiniciar conexão do WhatsApp');
  } catch (error) {
    state.whatsapp = { ...state.whatsapp, status: 'error', pairingCode: null, qrDataUrl: null, error: error instanceof Error ? error.message : 'Falha ao reiniciar conexão do WhatsApp' };
  }
  render();
}

function whatsappPairingForm() {
  return `<div class="wa-pairing-form"><label class="wa-pairing-label">Número deste celular<input type="tel" inputmode="tel" autocomplete="tel" placeholder="(11) 99999-9999" data-whatsapp-pair-phone /></label><button class="btn primary" type="button" data-whatsapp-pair>Gerar código neste celular</button></div>`;
}

function whatsappConnectionPanel() {
  const w = state.whatsapp;
  if (w.status === 'pairing' && w.pairingCode) {
    return `<div class="wa-connection-panel success"><strong>Digite este código no próprio WhatsApp</strong><div class="wa-pairing-code-row"><code class="wa-pairing-code">${esc(w.pairingCode)}</code></div><div class="category">No celular: WhatsApp → Aparelhos conectados → Conectar aparelho → Conectar com número de telefone.</div><button class="btn" type="button" data-whatsapp-restart>Reiniciar conexão</button></div>`;
  }
  if (w.status === 'qr' && w.qrDataUrl) {
    return `<div class="wa-connection-panel"><strong>Conectar usando este mesmo celular</strong><div class="category">Informe o número abaixo. Não é necessário ter um segundo aparelho.</div>${whatsappPairingForm()}<details class="wa-qr-fallback"><summary>Alternativa: QR Code em outro dispositivo</summary><img class="wa-qr" src="${esc(w.qrDataUrl)}" alt="QR Code para conectar o WhatsApp" /></details><button class="btn" type="button" data-whatsapp-restart>Reiniciar conexão</button></div>`;
  }
  if (w.status === 'connected') {
    return `<div class="wa-connection-panel success"><strong>WhatsApp conectado</strong><div class="category">${esc(w.account?.name || 'Conta ativa')}${w.account?.number ? ` · +${esc(w.account.number)}` : ''}</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" data-whatsapp-restart>Reiniciar conexão</button><button class="btn" data-whatsapp-disconnect>Desconectar</button></div></div>`;
  }
  if (['connecting', 'authenticated'].includes(w.status)) {
    return `<div class="wa-connection-panel"><strong>${whatsappStatusLabel()}</strong><div class="category">Preparando o pareamento por número deste celular.</div><button class="btn" type="button" data-whatsapp-restart>Reiniciar conexão</button></div>`;
  }
  if (w.status === 'error') {
    return `<div class="wa-connection-panel error"><strong>Não foi possível conectar</strong><div class="category">${esc(w.error || 'Verifique a conexão do servidor.')}</div>${whatsappPairingForm()}<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" type="button" data-whatsapp-restart>Reiniciar conexão</button><button class="btn" data-whatsapp-connect>Tentar QR Code</button></div></div>`;
  }
  return `<div class="wa-connection-panel"><strong>Conectar WhatsApp</strong><div class="category">Use o número do WhatsApp deste próprio celular para gerar o código de vínculo.</div>${whatsappPairingForm()}<button class="btn" data-whatsapp-connect>Alternativa: usar QR Code</button></div>`;
}

function settingsView() { return shell(`${header('Configurações','Pensado para uso no celular: conecte o WhatsApp por código no próprio aparelho e gerencie o sistema daqui.')}
  <div class="grid cols-2"><div class="card padded"><div class="section-head"><div class="section-title">WhatsApp</div>${whatsappStatusBadge()}</div>${whatsappConnectionPanel()}<div class="settings-list"><div class="setting-row"><div><div class="product-name">Sessão persistente</div><div class="category">Baileys · data/whatsapp-auth</div></div><span class="badge green">ATIVA</span></div><div class="setting-row"><div><div class="product-name">Reconexão</div><div class="category">A sessão é restaurada automaticamente ao iniciar o PrismaStore</div></div><span class="badge green">AUTOMÁTICA</span></div></div></div>
  <div class="card padded"><div class="section-title">Sistema</div><div class="settings-list"><div class="setting-row"><div><div class="product-name">Banco de dados</div><div class="category">SQLite · data/prismastore.db</div></div><span class="badge green">ATIVO</span></div><div class="setting-row"><div><div class="product-name">Pix Oscar</div><div class="category">Validação do comprovante por valor, destinatário, data e horário</div></div><span class="badge green">ATIVO</span></div><div class="setting-row"><div><div class="product-name">Alerta de estoque</div><div class="category">Disponível &lt; 3 unidades</div></div><span class="badge green">ATIVO</span></div></div></div></div>`); }

function orderDrawer(orderId) {
  const o=state.orders.find(x=>x.id===orderId); if(!o) return '';
  const canAdvance=['PAID','PACKING','SHIPPED','OUT_FOR_DELIVERY'].includes(o.status);
  const next=nextOrderStatus(o);
  const label={PACKING:'Marcar como embalando',SHIPPED:'Marcar como enviado',OUT_FOR_DELIVERY:'Saiu para entrega',DELIVERED:'Marcar como entregue'}[next]||'Atualizar';
  return `<div class="drawer-backdrop" data-close-drawer><aside class="drawer" onclick="event.stopPropagation()"><div class="drawer-head"><div><div class="eyebrow">Pedido</div><h2>${o.id}</h2><div class="subtitle">${formatDate(o.createdAt)} · ${esc(o.customerName)}</div></div><button class="btn" data-close-drawer>${icons.close}</button></div>
    <div>${statusBadge(o.status)} ${o.newAddress?'<span class="badge gold">NOVO ENDEREÇO</span>':''}</div>
    <div class="detail-block"><div class="detail-label">Cliente</div><div class="customer-name">${esc(o.customerName)}</div><div class="category">${esc(o.phone)}</div></div>
    <div class="detail-block"><div class="detail-label">Endereço do pedido</div><div class="subtitle">${esc(addressText(o.address))}</div></div>
    <div class="detail-block"><div class="detail-label">Itens</div>${o.items.map(i=>`<div class="item-row"><span>${i.quantity}× ${esc(i.name)}</span><strong>${formatCurrencyBRL(i.quantity*i.unitPrice)}</strong></div>`).join('')}<div class="item-row"><span>${o.deliveryType==='shipping'?'Frete':'Entrega'}</span><strong>${formatCurrencyBRL(o.deliveryFee||0)}</strong></div><div class="item-row" style="border-top:1px solid var(--border-soft);padding-top:12px"><strong>Total</strong><strong>${formatCurrencyBRL(o.total)}</strong></div></div>
    <div class="detail-block"><div class="detail-label">Pagamento</div><div class="subtitle">${o.paidAt?`Confirmado em ${formatDate(o.paidAt)} · ${esc(receivingAccounts.find(a=>a.id===o.receivingAccountId)?.name||o.receivingAccountId)}`:'Aguardando confirmação'}</div></div>
    ${canAdvance?`<button class="btn primary" style="width:100%" data-advance-order="${o.id}">${label}</button>`:''}
  </aside></div>`;
}

function render() {
  const app=document.querySelector('#app');
  const renderer={dashboard:dashboardView,orders:ordersView,customers:customersView,products:productsView,reports:reportsView,chatbot:chatbotView,settings:settingsView}[state.view]||dashboardView;
  app.innerHTML=renderer();
  bind();
}

function bind() {
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{
    state.view=b.dataset.view;
    state.selectedOrder=null;
    render();
    window.dispatchEvent(new CustomEvent('prismastore:view-changed', { detail: { view: state.view } }));
    if (state.view === 'settings') refreshWhatsAppStatus({ rerender: true });
  }));
  document.querySelectorAll('[data-order-filter]').forEach(b=>b.addEventListener('click',()=>{state.orderFilter=b.dataset.orderFilter;render();}));
  document.querySelector('#order-search')?.addEventListener('input',(e)=>{state.search=e.target.value; render(); requestAnimationFrame(()=>{const input=document.querySelector('#order-search');input?.focus();input?.setSelectionRange(state.search.length,state.search.length);});});
  document.querySelectorAll('[data-open-order]').forEach(b=>b.addEventListener('click',()=>{state.selectedOrder=b.dataset.openOrder;render();}));
  document.querySelectorAll('[data-close-drawer]').forEach(b=>b.addEventListener('click',()=>{state.selectedOrder=null;render();}));
  document.querySelectorAll('[data-advance-order]').forEach(b=>b.addEventListener('click',()=>{const o=state.orders.find(x=>x.id===b.dataset.advanceOrder);o.status=nextOrderStatus(o);persist();state.selectedOrder=o.id;render();}));
  document.querySelectorAll('[data-stock-inc]').forEach(b=>b.addEventListener('click',()=>{const p=state.products.find(x=>x.id===b.dataset.stockInc);p.stock+=1;persist();render();}));
  document.querySelectorAll('[data-stock-dec]').forEach(b=>b.addEventListener('click',()=>{const p=state.products.find(x=>x.id===b.dataset.stockDec);p.stock=Math.max(0,p.stock-1);persist();render();}));
  document.querySelectorAll('[data-stock-input]').forEach(input=>input.addEventListener('change',()=>{const p=state.products.find(x=>x.id===input.dataset.stockInput);const value=Math.max(0,Number.parseInt(input.value,10)||0);p.stock=value;persist();render();}));
  document.querySelector('#add-demo-product')?.addEventListener('click',()=>{state.products.push({id:`p${Date.now()}`,name:'Novo produto de demonstração',category:'Acessórios',price:19.9,stock:5,reserved:0,active:true});persist();render();});
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
}
function resetChat(){state.chatbot={step:'welcome',cart:{},deliveryType:null,addressMode:null,paymentConfirmed:false};render();}
function chatAction(action){
  const map={'age-confirm':'catalog','delivery':'delivery','address':'address','review':'review','pix':'pix'};
  if(map[action]){state.chatbot.step=map[action];render();return;}
  if(action==='confirm-payment'){
    const t=calculateCart(state.products,state.chatbot.cart);const fee=state.chatbot.deliveryType==='shipping'?24.9:18;
    const id=`PS-${1050+state.orders.length}`;
    const items=Object.entries(state.chatbot.cart).filter(([,q])=>q>0).map(([pid,q])=>{const p=state.products.find(x=>x.id===pid);return{productId:pid,name:p.name,quantity:q,unitPrice:p.price}});
    state.orders.unshift({id,customerId:'c1',customerName:'Lucas Almeida',phone:'+55 11 98888-1204',status:'PAID',deliveryType:state.chatbot.deliveryType,total:t.subtotal+fee,createdAt:new Date().toISOString(),paidAt:new Date().toISOString(),receivingAccountId:'pix-local',items,address:chatAddress(),newAddress:state.chatbot.addressMode==='new',deliveryFee:fee});
    state.chatbot.step='paid';state.chatbot.paymentConfirmed=true;persist();render();
  }
}

let operationalRuntimeStarted = false;

async function bootstrapOperationalRuntime() {
  if (operationalRuntimeStarted) return;
  operationalRuntimeStarted = true;
  try {
    await loadOperationalState();
    window.dispatchEvent(new CustomEvent('prismastore:runtime-ready'));
  } catch (error) {
    state.serverConnected = false;
    state.serverError = error instanceof Error ? error.message : 'Falha ao conectar ao servidor local.';
  }
  render();
}

render();
window.addEventListener('prismastore:dashboard-opened', bootstrapOperationalRuntime, { once: true });
if (!document.querySelector('#app')?.hidden) bootstrapOperationalRuntime();
