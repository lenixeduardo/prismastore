const CARD_ID = 'whatsapp-dashboard-onboarding';
const ACTIVE_STATUSES = new Set(['connecting', 'qr', 'authenticated', 'connected']);
let latestStatus = { status: 'disconnected', qrDataUrl: null, account: null, error: null };
let dashboardOpened = false;
let pollTimer = null;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function isDashboardVisible() {
  const app = document.querySelector('#app');
  if (!app || app.hidden) return false;
  return Boolean(app.querySelector('.nav-btn.active[data-view="dashboard"], .mobile-bottom .active[data-view="dashboard"]'));
}

function whatsappDashboardCard(status = latestStatus) {
  if (status.status === 'connected') return '';

  if (status.status === 'qr' && status.qrDataUrl) {
    return `<section id="${CARD_ID}" class="wa-dashboard-card card" aria-live="polite">
      <div class="wa-dashboard-copy">
        <div class="wa-dashboard-kicker">Vincular WhatsApp</div>
        <h2>Escaneie para ativar o atendimento</h2>
        <p>Abra o WhatsApp no celular e acesse <strong>Aparelhos conectados</strong> → <strong>Conectar aparelho</strong>. O mesmo QR Code também é exibido no terminal.</p>
        <div class="wa-dashboard-status"><span class="status-dot offline"></span>Aguardando leitura do QR Code</div>
      </div>
      <div class="wa-dashboard-qr"><img class="wa-qr" src="${escapeHtml(status.qrDataUrl)}" alt="QR Code para vincular o WhatsApp ao PrismaStore" /></div>
    </section>`;
  }

  if (['connecting', 'authenticated'].includes(status.status)) {
    return `<section id="${CARD_ID}" class="wa-dashboard-card card" aria-live="polite">
      <div class="wa-dashboard-copy">
        <div class="wa-dashboard-kicker">Vincular WhatsApp</div>
        <h2>Preparando conexão</h2>
        <p>Estamos gerando o QR Code. Ele aparecerá aqui e no terminal assim que o WhatsApp disponibilizar a leitura.</p>
        <div class="wa-dashboard-status"><span class="wa-spinner" aria-hidden="true"></span>Conectando…</div>
      </div>
    </section>`;
  }

  const message = status.status === 'error'
    ? escapeHtml(status.error || 'Não foi possível iniciar a conexão com o WhatsApp.')
    : 'O WhatsApp ainda não está vinculado a este painel.';

  return `<section id="${CARD_ID}" class="wa-dashboard-card card" aria-live="polite">
    <div class="wa-dashboard-copy">
      <div class="wa-dashboard-kicker">Vincular WhatsApp</div>
      <h2>Conecte o WhatsApp ao PrismaStore</h2>
      <p>${message}</p>
      <button class="btn primary" type="button" data-dashboard-whatsapp-connect>Conectar WhatsApp</button>
    </div>
  </section>`;
}

function renderWhatsAppDashboardCard(status = latestStatus) {
  document.getElementById(CARD_ID)?.remove();
  if (!dashboardOpened || !isDashboardVisible() || status.status === 'connected') return;

  const main = document.querySelector('#app .main');
  const topbar = main?.querySelector('.topbar');
  if (!main || !topbar) return;
  topbar.insertAdjacentHTML('afterend', whatsappDashboardCard(status));
}

async function fetchWhatsAppStatus() {
  const response = await fetch('/api/whatsapp/status', { cache: 'no-store' });
  const status = await response.json();
  if (!response.ok) throw new Error(status.error || 'Falha ao consultar o WhatsApp.');
  latestStatus = status;
  renderWhatsAppDashboardCard(status);
  return status;
}

async function requestWhatsAppConnection() {
  latestStatus = { ...latestStatus, status: 'connecting', error: null };
  renderWhatsAppDashboardCard(latestStatus);
  const response = await fetch('/api/whatsapp/connect', { method: 'POST' });
  const status = await response.json();
  if (!response.ok) throw new Error(status.error || 'Falha ao conectar o WhatsApp.');
  latestStatus = status;
  renderWhatsAppDashboardCard(status);
  return status;
}

async function ensureWhatsAppConnection() {
  try {
    const status = await fetchWhatsAppStatus();
    if (!ACTIVE_STATUSES.has(status.status)) {
      await requestWhatsAppConnection();
    }
  } catch (error) {
    latestStatus = {
      status: 'error',
      qrDataUrl: null,
      account: null,
      error: error instanceof Error ? error.message : 'Falha ao conectar o WhatsApp.',
    };
    renderWhatsAppDashboardCard(latestStatus);
  }
}

function startStatusPolling() {
  if (pollTimer) return;
  pollTimer = window.setInterval(async () => {
    if (!dashboardOpened) return;
    try {
      await fetchWhatsAppStatus();
    } catch (error) {
      latestStatus = {
        status: 'error',
        qrDataUrl: null,
        account: null,
        error: error instanceof Error ? error.message : 'Falha ao consultar o WhatsApp.',
      };
      renderWhatsAppDashboardCard(latestStatus);
    }
  }, 1500);
}

window.addEventListener('prismastore:dashboard-opened', () => {
  dashboardOpened = true;
  startStatusPolling();
  ensureWhatsAppConnection();
});

document.addEventListener('click', (event) => {
  const connectButton = event.target.closest('[data-dashboard-whatsapp-connect]');
  if (!connectButton) return;
  requestWhatsAppConnection().catch((error) => {
    latestStatus = {
      status: 'error',
      qrDataUrl: null,
      account: null,
      error: error instanceof Error ? error.message : 'Falha ao conectar o WhatsApp.',
    };
    renderWhatsAppDashboardCard(latestStatus);
  });
});

const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(() => renderWhatsAppDashboardCard(latestStatus));
  observer.observe(app, { childList: true });
}

export { ensureWhatsAppConnection, whatsappDashboardCard, renderWhatsAppDashboardCard };
