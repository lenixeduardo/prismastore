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
    const ids = new Set(current.map((product) => String(product.id ?? '')));
    const names = new Set(current.map((product) => String(product.name ?? '').trim().toLowerCase()));
    const additions = products
      .filter((product) => !ids.has(String(product.id ?? '')) && !names.has(String(product.name ?? '').trim().toLowerCase()))
      .map((product) => structuredClone(product));
    if (additions.length === 0) return state;
    changed = true;
    return { ...state, products: [...current, ...additions] };
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
