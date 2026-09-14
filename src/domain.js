export function availableStock(product) {
  return Math.max(0, Number(product.stock ?? 0) - Number(product.reserved ?? 0));
}

export function isLowStock(product) {
  return availableStock(product) < 3;
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

export function calculateCart(products, cart) {
  const byId = Object.fromEntries(products.map((product) => [product.id, product]));
  return Object.entries(cart).reduce(
    (result, [productId, quantity]) => {
      const product = byId[productId];
      const qty = Number(quantity ?? 0);
      if (!product || qty <= 0) return result;
      result.quantity += qty;
      result.subtotal += Number(product.price) * qty;
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
  const paid = orders.filter((order) => order.status === 'PAID' && String(order.paidAt ?? '').startsWith(monthKey));
  const revenue = paid.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const byAccount = paid.reduce((acc, order) => {
    const key = order.receivingAccountId || 'sem-conta';
    acc[key] = (acc[key] ?? 0) + Number(order.total ?? 0);
    return acc;
  }, {});
  return {
    revenue,
    orderCount: paid.length,
    averageTicket: paid.length ? revenue / paid.length : 0,
    byAccount,
  };
}

export function reserveCartStock(products, cart) {
  return products.map((product) => {
    const quantity = Number(cart?.[product.id] ?? 0);
    if (quantity <= 0) return { ...product };
    if (availableStock(product) < quantity) {
      throw new Error(`Estoque insuficiente para ${product.id}`);
    }
    return { ...product, reserved: Number(product.reserved ?? 0) + quantity };
  });
}

export function consumeReservedOrderStock(products, items = []) {
  const quantities = new Map(items.map((item) => [item.productId, Number(item.quantity ?? 0)]));
  return products.map((product) => {
    const quantity = quantities.get(product.id) ?? 0;
    if (quantity <= 0) return { ...product };
    const reserved = Number(product.reserved ?? 0);
    const stock = Number(product.stock ?? 0);
    if (reserved < quantity || stock < quantity) {
      throw new Error(`Reserva inconsistente para ${product.id}`);
    }
    return { ...product, stock: stock - quantity, reserved: reserved - quantity };
  });
}

export function releaseCartStock(products, cart) {
  return products.map((product) => {
    const quantity = Number(cart?.[product.id] ?? 0);
    if (quantity <= 0) return { ...product };
    return { ...product, reserved: Math.max(0, Number(product.reserved ?? 0) - quantity) };
  });
}

export function nextOrderStatus(order) {
  if (order.status === 'PAID') return 'PACKING';
  if (order.status === 'PACKING') {
    return order.deliveryType === 'local_delivery' ? 'OUT_FOR_DELIVERY' : 'SHIPPED';
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
  if (available < 3) return 'LOW_STOCK';
  return 'ACTIVE';
}
