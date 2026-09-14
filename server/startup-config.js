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
    const terminalQr = await QRCode.toString(qr, { type: 'terminal' });
    const qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 1 });

    log('\n==========================================');
    log(' PrismaStore — vincular WhatsApp');
    log('==========================================');
    log(terminalQr);
    log('No celular: WhatsApp > Aparelhos conectados > Conectar aparelho.');
    log('O mesmo QR também fica disponível em Configurações > WhatsApp Web.\n');

    return qrDataUrl;
  };
}
