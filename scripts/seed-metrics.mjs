import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStateStore } from '../server/state-store.js';

const TOTAL_DEMO_ORDERS = 12;

function saoPauloYearMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return { year: value('year'), month: value('month') };
}

export function buildMetricOrders({ now = new Date(), count = TOTAL_DEMO_ORDERS } = {}) {
  const { year, month } = saoPauloYearMonth(now);
  const totals = [79, 118, 96, 145, 64, 132, 87, 156, 109, 173, 92, 128];
  return Array.from({ length: count }, (_, index) => {
    const ordinal = index + 1;
    const day = String(Math.min(ordinal + 1, 28)).padStart(2, '0');
    const hour = String(10 + (index % 8)).padStart(2, '0');
    const deliveryType = index % 2 === 0 ? 'local_delivery' : 'shipping';
    const total = totals[index % totals.length];
    const id = `metrics-${year}${month}-${String(ordinal).padStart(2, '0')}`;
    return {
      id,
      customerId: `metrics-customer-${String((index % 4) + 1).padStart(2, '0')}`,
      customerName: `Cliente Métrica ${String((index % 4) + 1).padStart(2, '0')}`,
      phone: `+55 11 90000-${String(1000 + index).slice(-4)}`,
      status: 'DELIVERED',
      deliveryType,
      total,
      createdAt: `${year}-${month}-${day}T${hour}:00:00-03:00`,
      paidAt: `${year}-${month}-${day}T${hour}:05:00-03:00`,
      updatedAt: `${year}-${month}-${day}T${hour}:40:00-03:00`,
      receivingAccountId: 'pix-local',
      paymentProvider: 'pix-local',
      paymentStatus: 'CONFIRMED_LOCAL',
      items: [{
        productId: `metrics-demo-product-${(index % 3) + 1}`,
        name: `Produto demonstrativo ${String.fromCharCode(65 + (index % 3))}`,
        quantity: 1 + (index % 2),
        unitPrice: total - (deliveryType === 'shipping' ? 24 : 18),
      }],
      address: {
        street: 'Rua de Demonstração',
        number: String(100 + index),
        complement: '',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zip: '01000-000',
      },
      newAddress: false,
      deliveryFee: deliveryType === 'shipping' ? 24 : 18,
      metricsSeed: true,
      statusHistory: [
        { status: 'PAID', at: `${year}-${month}-${day}T${hour}:05:00-03:00` },
        { status: 'PACKING', at: `${year}-${month}-${day}T${hour}:15:00-03:00` },
        { status: deliveryType === 'shipping' ? 'SHIPPED' : 'OUT_FOR_DELIVERY', at: `${year}-${month}-${day}T${hour}:25:00-03:00` },
        { status: 'DELIVERED', at: `${year}-${month}-${day}T${hour}:40:00-03:00` },
      ],
    };
  });
}

export function seedMetricOrders({ dbPath = resolve('data/prismastore.db'), now = new Date(), count = TOTAL_DEMO_ORDERS } = {}) {
  const stateStore = createStateStore({
    dbPath,
    seedState: { products: [], customers: [], orders: [] },
  });
  try {
    const candidates = buildMetricOrders({ now, count });
    let inserted = 0;
    const state = stateStore.updateState((current) => {
      const existingIds = new Set((current.orders ?? []).map((order) => String(order.id)));
      const additions = candidates.filter((order) => !existingIds.has(order.id));
      inserted = additions.length;
      return { ...current, orders: [...(current.orders ?? []), ...additions] };
    });
    return {
      inserted,
      requested: candidates.length,
      totalOrders: state.orders.length,
      metricOrders: state.orders.filter((order) => order.metricsSeed === true).length,
    };
  } finally {
    stateStore.close();
  }
}

const executedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (executedDirectly) {
  const result = seedMetricOrders();
  console.log(`Pedidos de métrica inseridos: ${result.inserted}`);
  console.log(`Pedidos de métrica no banco: ${result.metricOrders}`);
  console.log(`Total de pedidos no banco: ${result.totalOrders}`);
}
