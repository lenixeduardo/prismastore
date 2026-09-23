export function createStartupState({ useDemoData = false, seedState = {} } = {}) {
  if (!useDemoData) {
    return { products: [], customers: [], orders: [] };
  }
  return structuredClone({
    products: Array.isArray(seedState.products) ? seedState.products : [],
    customers: Array.isArray(seedState.customers) ? seedState.customers : [],
    orders: Array.isArray(seedState.orders) ? seedState.orders : [],
  });
}


export function ensureCatalogProducts({ stateStore, products = [] } = {}) {
  if (!stateStore?.updateState || !Array.isArray(products) || products.length === 0) return false;
  let changed = false;
  stateStore.updateState((state) => {
    const current = Array.isArray(state.products) ? state.products : [];
    const next = current.map((product) => structuredClone(product));
    const byId = new Map(next.map((product) => [String(product.id ?? ''), product]));
    const byName = new Map(next.map((product) => [String(product.name ?? '').trim().toLowerCase(), product]));

    for (const catalogProduct of products) {
      const id = String(catalogProduct.id ?? '');
      const name = String(catalogProduct.name ?? '').trim().toLowerCase();
      const existing = byId.get(id) || byName.get(name);

      if (!existing) {
        const addition = structuredClone(catalogProduct);
        next.push(addition);
        byId.set(id, addition);
        byName.set(name, addition);
        changed = true;
        continue;
      }

      if (catalogProduct.quantityPricing) {
        const currentPricing = JSON.stringify(existing.quantityPricing ?? null);
        const desiredPricing = JSON.stringify(catalogProduct.quantityPricing);
        if (currentPricing !== desiredPricing) {
          existing.quantityPricing = structuredClone(catalogProduct.quantityPricing);
          changed = true;
        }
      }
    }

    return changed ? { ...state, products: next } : state;
  });
  return changed;
}


export function ensureBootstrapOrders({ stateStore, orders = [] } = {}) {
  if (!stateStore?.updateState || !Array.isArray(orders) || orders.length === 0) return false;
  let changed = false;

  stateStore.updateState((state) => {
    const nextOrders = Array.isArray(state.orders) ? state.orders.map((order) => structuredClone(order)) : [];
    const nextProducts = Array.isArray(state.products) ? state.products.map((product) => structuredClone(product)) : [];
    const existingOrderIds = new Set(nextOrders.map((order) => String(order.id ?? '')));
    const soldByProduct = new Map();

    for (const order of orders) {
      const orderId = String(order?.id ?? '');
      if (!orderId || existingOrderIds.has(orderId)) continue;

      const addition = structuredClone(order);
      nextOrders.push(addition);
      existingOrderIds.add(orderId);
      changed = true;

      for (const item of Array.isArray(addition.items) ? addition.items : []) {
        const productId = String(item?.productId ?? '');
        const quantity = Math.max(0, Number(item?.quantity ?? 0));
        if (!productId || !quantity) continue;
        soldByProduct.set(productId, (soldByProduct.get(productId) ?? 0) + quantity);
      }
    }

    if (!changed) return state;

    for (const product of nextProducts) {
      const sold = soldByProduct.get(String(product.id ?? '')) ?? 0;
      if (!sold) continue;
      product.stock = Math.max(0, Number(product.stock ?? 0) - sold);
    }

    return { ...state, products: nextProducts, orders: nextOrders };
  });

  return changed;
}

function comparableState(state = {}) {
  return JSON.stringify({
    products: Array.isArray(state.products) ? state.products : [],
    customers: Array.isArray(state.customers) ? state.customers : [],
    orders: Array.isArray(state.orders) ? state.orders : [],
  });
}

export function clearLegacyDemoState({ stateStore, seedState = {}, useDemoData = false } = {}) {
  if (useDemoData || !stateStore?.load || !stateStore?.save) return false;
  const current = stateStore.load();
  if (comparableState(current) !== comparableState(seedState)) return false;
  stateStore.save({ products: [], customers: [], orders: [] });
  return true;
}

export function createTerminalQrEncoder({ QRCode, log = console.log } = {}) {
  if (!QRCode?.toString || !QRCode?.toDataURL) {
    throw new Error('QRCode inválido para inicialização do WhatsApp.');
  }

  return async (qr) => {
    const terminalQr = await QRCode.toString(qr, { type: 'terminal', small: true });
    const qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 1 });

    log('\n==========================================');
    log(' PrismaStore — vincular WhatsApp');
    log('==========================================');
    log(terminalQr);
    log('No celular: WhatsApp > Aparelhos conectados > Conectar aparelho.');
    log('O mesmo QR também fica disponível na tela inicial do PrismaStore.\n');

    return qrDataUrl;
  };
}
