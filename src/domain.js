export function availableStock(product) {
  return Math.max(0, Number(product.stock ?? 0));
}

export function isLowStock(product) {
  return availableStock(product) < 5;
}

function normalizeCustomerName(value = '') {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function isMetricCustomer(value) {
  const name = typeof value === 'object' && value
    ? (value.customerName ?? value.name ?? '')
    : value;
  const normalized = normalizeCustomerName(name);
  return normalized === 'cliente metrica' || normalized.startsWith('cliente metrica ');
}

function normalizeAddress(address = {}) {
  return [address.street, address.number, address.zip, address.city]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .join('|');
}

export function isNewAddress(customer, address) {
  const current = normalizeAddress(address);
  return !(customer?.addresses ?? []).some((saved) => normalizeAddress(saved) === current);
}

export function lineTotalForQuantity(product, quantity) {
  const qty = Number(quantity ?? 0);
  if (!product || qty <= 0) return 0;

  const pricing = product.quantityPricing && typeof product.quantityPricing === 'object'
    ? product.quantityPricing
    : null;
  const exactTotal = pricing?.exactTotals?.[String(qty)] ?? pricing?.exactTotals?.[qty];
  if (exactTotal != null && Number.isFinite(Number(exactTotal))) return Number(exactTotal);

  const minQuantity = Number(pricing?.minQuantity ?? 0);
  const discountedUnitPrice = Number(pricing?.unitPrice);
  if (minQuantity > 0 && qty >= minQuantity && Number.isFinite(discountedUnitPrice)) {
    return discountedUnitPrice * qty;
  }

  return Number(product.price) * qty;
}

export function unitPriceForQuantity(product, quantity) {
  const qty = Number(quantity ?? 0);
  if (!product || qty <= 0) return Number(product?.price ?? 0);
  return lineTotalForQuantity(product, qty) / qty;
}

export function calculateCart(products, cart) {
  const byId = Object.fromEntries(products.map((product) => [product.id, product]));
  return Object.entries(cart).reduce(
    (result, [productId, quantity]) => {
      const product = byId[productId];
      const qty = Number(quantity ?? 0);
      if (!product || qty <= 0) return result;
      result.quantity += qty;
      result.subtotal += lineTotalForQuantity(product, qty);
      return result;
    },
    { quantity: 0, subtotal: 0 },
  );
}

export function confirmPayment(order, accountId, paidAt = new Date().toISOString()) {
  if (order.status !== 'PAYMENT_PENDING') return { ...order };
  return {
    ...order,
    status: 'PAID',
    receivingAccountId: accountId,
    paidAt,
  };
}

export function buildMonthlyReport(orders, monthKey) {
  const paid = orders.filter((order) => !isMetricCustomer(order) && String(order.paidAt ?? '').startsWith(monthKey));
  const revenue = paid.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const byAccount = paid.reduce((acc, order) => {
    const key = order.receivingAccountId || 'sem-conta';
    acc[key] = (acc[key] ?? 0) + Number(order.total ?? 0);
    return acc;
  }, {});
  const byDay = paid.reduce((acc, order) => {
    const day = String(order.paidAt).slice(0, 10);
    acc[day] = (acc[day] ?? 0) + Number(order.total ?? 0);
    return acc;
  }, {});
  return {
    revenue,
    orderCount: paid.length,
    averageTicket: paid.length ? revenue / paid.length : 0,
    byAccount,
    byDay,
  };
}

export function consumeCartStock(products, cart) {
  return products.map((product) => {
    const quantity = Number(cart?.[product.id] ?? 0);
    if (quantity <= 0) return { ...product };
    const stock = availableStock(product);
    if (stock < quantity) throw new Error(`Estoque insuficiente para ${product.id}`);
    const { reserved: _legacyReserved, category: _legacyCategory, ...cleanProduct } = product;
    return { ...cleanProduct, stock: stock - quantity };
  });
}

export function nextOrderStatus(order) {
  if (order.status === 'PAID') return 'PACKING';
  if (order.status === 'PACKING') {
    return order.deliveryType === 'local_delivery' ? 'DELIVERED' : 'SHIPPED';
  }
  if (order.status === 'SHIPPED' || order.status === 'OUT_FOR_DELIVERY') return 'DELIVERED';
  return order.status;
}

export function formatCurrencyBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0));
}

export function computeProductStatus(product) {
  const available = availableStock(product);
  if (available <= 0) return 'OUT_OF_STOCK';
  if (available < 5) return 'LOW_STOCK';
  return 'ACTIVE';
}
