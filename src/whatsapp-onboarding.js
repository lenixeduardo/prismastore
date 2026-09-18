// WhatsApp onboarding intentionally does not render on the dashboard.
// Pairing remains available only from Configurações, handled by app.js.

function ensureWhatsAppConnection() {
  return Promise.resolve(null);
}

function requestWhatsAppPairing() {
  return Promise.reject(new Error('O pareamento do WhatsApp está disponível em Configurações.'));
}

function whatsappDashboardCard() {
  return '';
}

function renderWhatsAppDashboardCard() {
  document.getElementById('whatsapp-dashboard-onboarding')?.remove();
}

window.addEventListener('prismastore:dashboard-opened', renderWhatsAppDashboardCard);

export {
  ensureWhatsAppConnection,
  requestWhatsAppPairing,
  whatsappDashboardCard,
  renderWhatsAppDashboardCard,
};
