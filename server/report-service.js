import { buildMonthlyReport } from '../src/domain.js';

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

export function createReportService({ stateStore, receivingAccounts = [] }) {
  const names = accountNameMap(receivingAccounts);

  function getMonthlyReport(monthKey) {
    assertMonthKey(monthKey);
    const state = stateStore.load();
    const orders = (state.orders ?? [])
      .filter((order) => String(order.paidAt ?? '').startsWith(monthKey))
      .sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
    const summary = buildMonthlyReport(orders, monthKey);
    const accountIds = new Set([...receivingAccounts.map((account) => account.id), ...Object.keys(summary.byAccount)]);
    const accounts = [...accountIds]
      .map((id) => ({
        id,
        name: names.get(id) || (id === 'sem-conta' ? 'Conta não identificada' : id),
        total: Number(summary.byAccount[id] ?? 0),
      }))
      .filter((account) => account.total > 0)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    const daily = Object.entries(summary.byDay)
      .map(([date, total]) => ({
        date,
        total: Number(total),
        orderCount: orders.filter((order) => String(order.paidAt).startsWith(date)).length,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      month: monthKey,
      revenue: summary.revenue,
      orderCount: summary.orderCount,
      averageTicket: summary.averageTicket,
      accountCount: accounts.length,
      accounts,
      daily,
      orders,
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
        names.get(order.receivingAccountId) || (order.receivingAccountId ? order.receivingAccountId : 'Conta não identificada'),
        order.status,
        Number(order.total ?? 0).toFixed(2).replace('.', ','),
      ]),
    ];
    return `\uFEFF${lines.map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
  }

  return { getMonthlyReport, exportMonthlyCsv };
}
