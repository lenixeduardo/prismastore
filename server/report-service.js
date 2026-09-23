import { isMetricCustomer } from '../src/domain.js';

const REPORT_TIME_ZONE = 'America/Sao_Paulo';

function assertMonthKey(monthKey) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthKey ?? ''))) {
    throw new Error('Mês inválido. Use o formato YYYY-MM.');
  }
}

function csvCell(value) {
  const text = String(value ?? '');
  if (!/[;"\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function accountNameMap(receivingAccounts = []) {
  return new Map(receivingAccounts.map((account) => [account.id, account.name]));
}

function dateParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return null;
  return { monthKey: `${year}-${month}`, dateKey: `${year}-${month}-${day}` };
}

function safeTotal(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function createReportService({ stateStore, receivingAccounts = [] }) {
  const names = accountNameMap(receivingAccounts);

  function accountName(id) {
    if (!id) return 'Conta não identificada';
    return names.get(id) || id;
  }

  function getMonthlyReport(monthKey) {
    assertMonthKey(monthKey);
    const state = stateStore.load();
    const orders = (Array.isArray(state.orders) ? state.orders : [])
      .filter((order) => !isMetricCustomer(order))
      .map((order) => ({ order, parts: dateParts(order?.paidAt) }))
      .filter(({ parts }) => parts?.monthKey === monthKey)
      .sort((a, b) => String(b.order.paidAt).localeCompare(String(a.order.paidAt)));

    const byAccount = new Map();
    const byDay = new Map();
    let revenue = 0;

    for (const { order, parts } of orders) {
      const total = safeTotal(order.total);
      revenue += total;
      const accountId = order.receivingAccountId || 'sem-conta';
      byAccount.set(accountId, (byAccount.get(accountId) || 0) + total);
      const day = byDay.get(parts.dateKey) || { total: 0, orderCount: 0 };
      day.total += total;
      day.orderCount += 1;
      byDay.set(parts.dateKey, day);
    }

    const accounts = [...byAccount.entries()]
      .map(([id, total]) => ({
        id,
        name: id === 'sem-conta' ? 'Conta não identificada' : accountName(id),
        total,
      }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    const daily = [...byDay.entries()]
      .map(([date, value]) => ({ date, total: value.total, orderCount: value.orderCount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const normalizedOrders = orders.map(({ order }) => ({
      ...order,
      total: safeTotal(order.total),
      receivingAccountName: accountName(order.receivingAccountId),
    }));

    return {
      month: monthKey,
      timeZone: REPORT_TIME_ZONE,
      revenue,
      orderCount: normalizedOrders.length,
      averageTicket: normalizedOrders.length ? revenue / normalizedOrders.length : 0,
      accountCount: accounts.length,
      accounts,
      daily,
      orders: normalizedOrders,
    };
  }

  function exportMonthlyCsv(monthKey) {
    const report = getMonthlyReport(monthKey);
    const lines = [
      ['Pedido', 'Pago em', 'Cliente', 'Telefone', 'Modalidade', 'Conta recebedora', 'Status', 'Total'],
      ...report.orders.map((order) => [
        order.id,
        order.paidAt,
        order.customerName,
        order.phone,
        order.deliveryType === 'local_delivery' ? 'Entrega no endereço' : 'Envio',
        order.receivingAccountName,
        order.status,
        safeTotal(order.total).toFixed(2).replace('.', ','),
      ]),
    ];
    return `\uFEFF${lines.map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
  }

  return { getMonthlyReport, exportMonthlyCsv };
}
