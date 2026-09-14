let selectedMonth = currentMonthKey();
let loading = false;

function currentMonthKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char]));
}

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0));
}

function monthLabel(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!year || !month) return monthKey;
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function statusLabel(status) {
  return ({
    PAYMENT_PENDING: 'Aguardando Pix', PAID: 'Pago · Embalar', PACKING: 'Embalando',
    SHIPPED: 'Enviado', OUT_FOR_DELIVERY: 'Saiu para entrega', DELIVERED: 'Entregue', CANCELLED: 'Cancelado',
  })[status] || status;
}

function reportOrderTable(orders) {
  if (!orders.length) return '<div class="empty">Nenhum pagamento confirmado neste mês.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Pago em</th><th>Cliente</th><th>Modalidade</th><th>Conta</th><th>Status</th><th>Total</th></tr></thead><tbody>${orders.map((order) => `<tr><td><span class="order-id">${esc(order.id)}</span></td><td>${esc(new Date(order.paidAt).toLocaleString('pt-BR'))}</td><td><div class="customer-name">${esc(order.customerName)}</div><div class="category">${esc(order.phone)}</div></td><td>${order.deliveryType === 'local_delivery' ? 'Entrega' : 'Envio'}</td><td>${esc(order.receivingAccountName || order.receivingAccountId || 'Não identificada')}</td><td><span class="badge gray">${esc(statusLabel(order.status))}</span></td><td class="mono"><strong>${money(order.total)}</strong></td></tr>`).join('')}</tbody></table></div>`;
}

function kpi(label, value, meta) {
  return `<div class="card padded kpi"><div><div class="kpi-label">${label}</div><div class="kpi-value mono">${value}</div></div><div class="kpi-meta">${meta}</div></div>`;
}

function renderRealReport(report) {
  const main = document.querySelector('.main');
  if (!main) return;
  const period = monthLabel(report.month);
  const maxDaily = Math.max(1, ...report.daily.map((entry) => Number(entry.total)));
  const dailyBars = report.daily.length
    ? report.daily.map((entry) => `<div class="bar-col"><div class="bar" style="height:${Math.max(4, Math.round(Number(entry.total) / maxDaily * 100))}%" title="${money(entry.total)}"></div><div class="bar-label">${esc(entry.date.slice(-2))}</div></div>`).join('')
    : '<div class="empty">Nenhum faturamento registrado neste mês.</div>';
  const accountBars = report.accounts.length
    ? report.accounts.map((account) => `<div class="account-row"><span>${esc(account.name)}</span><div class="progress"><i style="width:${report.revenue ? Math.max(4, Number(account.total) / Number(report.revenue) * 100) : 0}%"></i></div><strong class="mono">${money(account.total)}</strong></div>`).join('')
    : '<div class="empty">Nenhum recebimento registrado neste mês.</div>';

  const controls = `<label class="report-month-control"><span>Mês</span><input type="month" data-report-month value="${esc(report.month)}" /></label><button class="btn" data-export-report>Exportar CSV</button>`;

  main.innerHTML = `
    <div class="topbar"><div><div class="eyebrow">PrismaStore · MVP</div><h1>Relatórios</h1><div class="subtitle">Faturamento real calculado a partir dos pagamentos confirmados no SQLite.</div></div><div class="top-actions">${controls}</div></div>
    <div class="toolbar reports-mobile-toolbar">${controls}</div>
    <div class="grid cols-4">
      ${kpi(`Faturamento · ${period}`, money(report.revenue), 'Baseado em paidAt')}
      ${kpi('Pedidos pagos', String(report.orderCount), 'Inclui pedidos enviados/finalizados')}
      ${kpi('Ticket médio', money(report.averageTicket), 'Faturamento ÷ pedidos pagos')}
      ${kpi('Contas recebedoras', String(report.accountCount), 'Contas com recebimento no período')}
    </div>
    <div class="grid cols-2 section">
      <div class="card chart-card"><div class="section-head"><div class="section-title">Faturamento por dia</div><div class="section-note">${esc(period)}</div></div><div class="bar-chart">${dailyBars}</div></div>
      <div class="card chart-card"><div class="section-head"><div class="section-title">Recebimento por conta</div><div class="section-note">${esc(period)}</div></div><div class="account-bars">${accountBars}</div><div class="detail-block" style="margin-top:16px"><div class="detail-label">Regra financeira</div><div class="subtitle">Pedidos permanecem no faturamento depois de avançar para embalando, enviado ou finalizado.</div></div></div>
    </div>
    <div class="section"><div class="section-head"><div class="section-title">Pagamentos considerados no período</div><div class="section-note">${report.orders.length} registro(s)</div></div>${reportOrderTable(report.orders)}</div>`;
  main.dataset.realReportMonth = report.month;

  main.querySelectorAll('[data-report-month]').forEach((input) => input.addEventListener('change', () => {
    selectedMonth = input.value || currentMonthKey();
    loadReport(true);
  }));
  main.querySelectorAll('[data-export-report]').forEach((button) => button.addEventListener('click', () => {
    window.location.href = `/api/reports/monthly.csv?month=${encodeURIComponent(selectedMonth)}`;
  }));
}

function isReportsView() {
  return document.querySelector('.main .topbar h1')?.textContent?.trim() === 'Relatórios';
}

async function loadReport(force = false) {
  const main = document.querySelector('.main');
  if (!main || !isReportsView() || loading) return;
  if (!force && main.dataset.realReportMonth === selectedMonth) return;
  loading = true;
  try {
    const response = await fetch(`/api/reports/monthly?month=${encodeURIComponent(selectedMonth)}`, { cache: 'no-store' });
    const report = await response.json();
    if (!response.ok) throw new Error(report.error || 'Não foi possível carregar o relatório.');
    renderRealReport(report);
  } catch (error) {
    const current = document.querySelector('.main');
    if (current && isReportsView()) {
      current.insertAdjacentHTML('afterbegin', `<div class="notice">${esc(error instanceof Error ? error.message : 'Falha ao carregar relatório.')}</div>`);
    }
  } finally {
    loading = false;
  }
}

const app = document.querySelector('#app');
if (app) {
  new MutationObserver(() => loadReport()).observe(app, { childList: true, subtree: true });
}
loadReport();
