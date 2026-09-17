const CARD_ID = 'whatsapp-dashboard-onboarding';
const ACTIVE_STATUSES = new Set(['connecting', 'qr', 'pairing', 'authenticated', 'connected']);
let latestStatus = { status: 'disconnected', qrDataUrl: null, pairingCode: null, account: null, error: null };
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

function pairingControls(status) {
  const code = status.pairingCode ? escapeHtml(status.pairingCode) : '';
  return `<div class="wa-pairing-block">
    <label class="wa-pairing-label">Número do WhatsApp
      <input class="wa-pairing-input" data-wa-phone type="tel" inputmode="tel" autocomplete="tel" placeholder="Ex.: 11 99999-0000" />
    </label>
    <button class="btn primary" type="button" data-wa-pair>Gerar código</button>
    ${code ? `<div class="wa-pairing-code-wrap">
      <div class="wa-pairing-code" data-wa-pairing-code>${code}</div>
      <button class="btn" type="button" data-wa-copy-code>Copiar código</button>
      <p class="wa-pairing-help">No mesmo celular, abra o WhatsApp → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong> → <strong>Conectar com número de telefone</strong> e informe o código acima.</p>
    </div>` : ''}
  </div>`;
}

function qrFallback(status) {
  if (!status.qrDataUrl) return '';
  return `<div class="wa-qr-fallback">
    <div class="wa-dashboard-kicker">Ou use o QR Code</div>
    <img class="wa-qr" src="${escapeHtml(status.qrDataUrl)}" alt="QR Code para vincular o WhatsApp ao PrismaStore" />
  </div>`;
}

function whatsappDashboardCard(status = latestStatus) {
  if (status.status === 'connected') return '';

  if (status.status === 'pairing' || status.status === 'qr') {
    return `<section id="${CARD_ID}" class="wa-dashboard-card card" aria-live="polite">
      <div class="wa-dashboard-copy">
        <div class="wa-dashboard-kicker">Vincular WhatsApp</div>
        <h2>Conecte pelo próprio celular</h2>
        <p>Use o número do WhatsApp para gerar um código de pareamento. O QR Code continua disponível como alternativa.</p>
        ${pairingControls(status)}
        <div class="wa-dashboard-status"><span class="status-dot offline"></span>${status.pairingCode ? 'Aguardando confirmação do código' : 'Aguardando vínculo do WhatsApp'}</div>
      </div>
      ${qrFallback(status)}
    </section>`;
  }

  if (['connecting', 'authenticated'].includes(status.status)) {
    return `<section id="${CARD_ID}" class="wa-dashboard-card card" aria-live="polite">
      <div class="wa-dashboard-copy">
        <div class="wa-dashboard-kicker">Vincular WhatsApp</div>
        <h2>Preparando conexão</h2>
        <p>Estamos iniciando uma sessão segura do WhatsApp. Assim que estiver pronta, você poderá gerar o código ou usar o QR Code.</p>
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
  const currentPhone = document.querySelector('[data-wa-phone]')?.value || '';
  document.getElementById(CARD_ID)?.remove();
  if (!dashboardOpened || !isDashboardVisible() || status.status === 'connected') return;
  const main = document.querySelector('#app .main');
  const topbar = main?.querySelector('.topbar');
  if (!main || !topbar) return;
  topbar.insertAdjacentHTML('afterend', whatsappDashboardCard(status));
  const input = document.querySelector('[data-wa-phone]');
  if (input && currentPhone) input.value = currentPhone;
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
  latestStatus = { ...latestStatus, status: 'connecting', pairingCode: null, error: null };
  renderWhatsAppDashboardCard(latestStatus);
  const response = await fetch('/api/whatsapp/connect', { method: 'POST' });
  const status = await response.json();
  if (!response.ok) throw new Error(status.error || 'Falha ao conectar o WhatsApp.');
  latestStatus = status;
  renderWhatsAppDashboardCard(status);
  return status;
}

async function requestPairingCode(phone) {
  const response = await fetch('/api/whatsapp/pairing-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const status = await response.json();
  if (!response.ok) throw new Error(status.error || 'Falha ao gerar código de pareamento.');
  latestStatus = status;
  renderWhatsAppDashboardCard(status);
  return status;
}

async function ensureWhatsAppConnection() {
  try {
    const status = await fetchWhatsAppStatus();
    if (!ACTIVE_STATUSES.has(status.status)) await requestWhatsAppConnection();
  } catch (error) {
    latestStatus = { status: 'error', qrDataUrl: null, pairingCode: null, account: null, error: error instanceof Error ? error.message : 'Falha ao conectar o WhatsApp.' };
    renderWhatsAppDashboardCard(latestStatus);
  }
}

function startStatusPolling() {
  if (pollTimer) return;
  pollTimer = window.setInterval(async () => {
    if (!dashboardOpened) return;
    try { await fetchWhatsAppStatus(); }
    catch (error) {
      latestStatus = { status: 'error', qrDataUrl: null, pairingCode: null, account: null, error: error instanceof Error ? error.message : 'Falha ao consultar o WhatsApp.' };
      renderWhatsAppDashboardCard(latestStatus);
    }
  }, 1500);
}

window.addEventListener('prismastore:dashboard-opened', () => {
  dashboardOpened = true;
  startStatusPolling();
  ensureWhatsAppConnection();
});

document.addEventListener('click', async (event) => {
  const connectButton = event.target.closest('[data-dashboard-whatsapp-connect]');
  if (connectButton) {
    requestWhatsAppConnection().catch((error) => {
      latestStatus = { status: 'error', qrDataUrl: null, pairingCode: null, account: null, error: error instanceof Error ? error.message : 'Falha ao conectar o WhatsApp.' };
      renderWhatsAppDashboardCard(latestStatus);
    });
    return;
  }

  const pairButton = event.target.closest('[data-wa-pair]');
  if (pairButton) {
    const phone = document.querySelector('[data-wa-phone]')?.value || '';
    pairButton.disabled = true;
    try { await requestPairingCode(phone); }
    catch (error) {
      latestStatus = { ...latestStatus, status: 'error', error: error instanceof Error ? error.message : 'Falha ao gerar código de pareamento.' };
      renderWhatsAppDashboardCard(latestStatus);
    } finally { pairButton.disabled = false; }
    return;
  }

  const copyButton = event.target.closest('[data-wa-copy-code]');
  if (copyButton && latestStatus.pairingCode) {
    await navigator.clipboard?.writeText(String(latestStatus.pairingCode));
    copyButton.textContent = 'Código copiado';
  }
});

const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(() => renderWhatsAppDashboardCard(latestStatus));
  observer.observe(app, { childList: true });
}

export { ensureWhatsAppConnection, whatsappDashboardCard, renderWhatsAppDashboardCard, requestPairingCode };
