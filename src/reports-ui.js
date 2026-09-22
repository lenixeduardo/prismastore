let selectedMonth = currentMonthKey();
let loadedMonth = null;
let requestSequence = 0;

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
  const number = Number(value ?? 0);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(Number.isFinite(number) ? number : 0);
}

function monthLabel(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!year || !month) return monthKey;
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function paidAtLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function statusLabel(status) {
  return ({
    PAYMENT_PENDING: 'Aguardando Pix',
    PAID: 'Pago · Embalar',
    PACKING: 'Produto embalado',
    SHIPPED: 'Enviado',
    OUT_FOR_DELIVERY: 'Concluído',
    DELIVERED: 'Concluído',
    CANCELLED: 'Cancelado',
  })[status] || status || '—';
}

function reportControls(month) {
  return `<label class="report-month-control"><span>Mês</span><input type="month" data-report-month value="${esc(month)}" /></label><button class="btn" type="button" data-export-report>Exportar CSV</button>`;
}

function reportOrderTable(orders) {
  if (!orders.length) return '<div class="empty report-empty">Nenhum pagamento confirmado neste mês.</div>';
  return `<div class="table-wrap report-table"><table><thead><tr><th>Pago em</th><th>Cliente</th><th>Modalidade</th><th>Conta</th><th>Status</th><th>Total</th></tr></thead><tbody>${orders.map((order) => `<tr><td>${esc(paidAtLabel(order.paidAt))}</td><td><div class="customer-name">${esc(order.customerName || 'Cliente')}</div><div class="category">${esc(order.phone || '')}</div></td><td>${order.deliveryType === 'local_delivery' ? 'Entrega' : 'Envio'}</td><td>${esc(order.receivingAccountName || 'Conta não identificada')}</td><td><span class="badge gray">${esc(statusLabel(order.status))}</span></td><td class="mono"><strong>${money(order.total)}</strong></td></tr>`).join('')}</tbody></table></div>`;
}

function kpi(label, value, meta) {
  return `<div class="card padded kpi"><div><div class="kpi-label">${label}</div><div class="kpi-value mono">${value}</div></div><div class="kpi-meta">${meta}</div></div>`;
}

function isReportsView() {
  return document.querySelector('.main .topbar h1')?.textContent?.trim() === 'Relatórios';
}

function bindReportControls() {
  document.querySelectorAll('[data-report-month]').forEach((input) => input.addEventListener('change', () => {
    selectedMonth = input.value || currentMonthKey();
    document.querySelectorAll('[data-report-month]').forEach((other) => { other.value = selectedMonth; });
    loadReport(true);
  }));

  document.querySelectorAll('[data-export-report]').forEach((button) => button.addEventListener('click', async () => {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Exportando…';
    try {
      await downloadCsv(selectedMonth);
    } catch (error) {
      renderError(error instanceof Error ? error.message : 'Não foi possível exportar o relatório.');
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = original;
      }
    }
  }));

  document.querySelector('[data-report-retry]')?.addEventListener('click', () => loadReport(true));
}

function renderLoading() {
  const main = document.querySelector('.main');
  if (!main || !isReportsView()) return;
  const controls = reportControls(selectedMonth);
  main.innerHTML = `
    <div class="topbar"><div><h1>Relatórios</h1><div class="subtitle">Faturamento mensal e conta recebedora de cada pagamento confirmado.</div></div><div class="top-actions">${controls}</div></div>
    <div class="toolbar reports-mobile-toolbar">${controls}</div>
    <div class="report-loading card padded" role="status">Carregando relatório…</div>`;
  bindReportControls();
}

function renderError(message) {
  const main = document.querySelector('.main');
  if (!main || !isReportsView()) return;
  const controls = reportControls(selectedMonth);
  main.innerHTML = `
    <div class="topbar"><div><h1>Relatórios</h1><div class="subtitle">Faturamento mensal e conta recebedora de cada pagamento confirmado.</div></div><div class="top-actions">${controls}</div></div>
    <div class="toolbar reports-mobile-toolbar">${controls}</div>
    <div class="report-error card padded"><strong>Não foi possível carregar os relatórios.</strong><span>${esc(message)}</span><button class="btn" type="button" data-report-retry>Tentar novamente</button></div>`;
  bindReportControls();
}

function renderRealReport(report) {
  const main = document.querySelector('.main');
  if (!main || !isReportsView()) return;
  const period = monthLabel(report.month);
  const daily = Array.isArray(report.daily) ? report.daily : [];
  const accounts = Array.isArray(report.accounts) ? report.accounts : [];
  const orders = Array.isArray(report.orders) ? report.orders : [];
  const maxDaily = Math.max(1, ...daily.map((entry) => Number(entry.total) || 0));

  const dailyBars = daily.length
    ? daily.map((entry) => `<div class="bar-col"><div class="bar" style="height:${Math.max(4, Math.round((Number(entry.total) || 0) / maxDaily * 100))}%" title="${money(entry.total)} · ${Number(entry.orderCount || 0)} pedido(s)"></div><div class="bar-label">${esc(String(entry.date || '').slice(-2))}</div></div>`).join('')
    : '<div class="empty report-empty">Nenhum faturamento registrado neste mês.</div>';

  const revenue = Number(report.revenue) || 0;
  const accountBars = accounts.length
    ? accounts.map((account) => `<div class="account-row"><span>${esc(account.name || 'Conta não identificada')}</span><div class="progress"><i style="width:${revenue ? Math.max(4, (Number(account.total) || 0) / revenue * 100) : 0}%"></i></div><strong class="mono">${money(account.total)}</strong></div>`).join('')
    : '<div class="empty report-empty">Nenhum recebimento registrado neste mês.</div>';

  const controls = reportControls(report.month);
  main.innerHTML = `
    <div class="topbar"><div><h1>Relatórios</h1><div class="subtitle">Faturamento mensal e conta recebedora de cada pagamento confirmado.</div></div><div class="top-actions">${controls}</div></div>
    <div class="toolbar reports-mobile-toolbar">${controls}</div>
    <div class="grid cols-4">
      ${kpi(`Faturamento · ${period}`, money(revenue), 'Pagamentos confirmados')}
      ${kpi('Pedidos pagos', String(Number(report.orderCount) || 0), 'Confirmados no período')}
      ${kpi('Ticket médio', money(report.averageTicket), 'Faturamento ÷ pedidos pagos')}
      ${kpi('Contas recebedoras', String(Number(report.accountCount) || 0), 'Contas com recebimento')}
    </div>
    <div class="grid cols-2 section">
      <div class="card chart-card"><div class="section-head"><div class="section-title">Faturamento por dia</div><div class="section-note">${esc(period)}</div></div><div class="bar-chart">${dailyBars}</div></div>
      <div class="card chart-card"><div class="section-head"><div class="section-title">Recebimento por conta</div><div class="section-note">${esc(period)}</div></div><div class="account-bars">${accountBars}</div><div class="detail-block" style="margin-top:16px"><div class="detail-label">Regra financeira</div><div class="subtitle">O faturamento usa a confirmação efetiva do pagamento. O pedido continua contabilizado quando avança para embalagem, envio ou conclusão.</div></div></div>
    </div>
    <div class="section"><div class="section-head"><div class="section-title">Pagamentos considerados no período</div><div class="section-note">${orders.length} registro(s)</div></div>${reportOrderTable(orders)}</div>`;

  loadedMonth = report.month;
  selectedMonth = report.month;
  bindReportControls();
}

async function reportJson(month) {
  const response = await fetch(`/api/reports/monthly?month=${encodeURIComponent(month)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    if (response.status === 401) throw new Error('Sua sessão expirou. Entre novamente para acessar os relatórios.');
    throw new Error(payload?.error || 'Não foi possível carregar o relatório.');
  }
  return payload;
}

async function downloadCsv(month) {
  const response = await fetch(`/api/reports/monthly.csv?month=${encodeURIComponent(month)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) {
    let message = 'Não foi possível exportar o relatório.';
    try {
      const payload = await response.json();
      message = payload?.error || message;
    } catch {}
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `prismastore-${month}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function loadReport(force = false) {
  if (!isReportsView()) return;
  if (!force && loadedMonth === selectedMonth) return;

  const requestId = ++requestSequence;
  renderLoading();

  try {
    const report = await reportJson(selectedMonth);
    if (requestId !== requestSequence || !isReportsView()) return;
    renderRealReport(report);
  } catch (error) {
    if (requestId !== requestSequence || !isReportsView()) return;
    renderError(error instanceof Error ? error.message : 'Falha ao carregar relatório.');
  }
}

window.addEventListener('prismastore:view-changed', (event) => {
  if (event.detail?.view === 'reports') loadReport();
});
window.addEventListener('prismastore:runtime-ready', () => {
  if (isReportsView()) loadReport(true);
});
window.addEventListener('prismastore:state-updated', () => {
  if (isReportsView()) loadReport(true);
});
window.addEventListener('prismastore:orders-updated', () => {
  if (isReportsView()) loadReport(true);
});

queueMicrotask(() => loadReport());
