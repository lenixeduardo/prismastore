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

function pairingForm() {
  return `<div class="wa-pairing-form">
    <label class="wa-pairing-label">Vincular usando este celular
      <input type="tel" inputmode="tel" autocomplete="tel" placeholder="(11) 99999-9999" data-whatsapp-pair-phone />
    </label>
    <button class="btn" type="button" data-dashboard-whatsapp-pair>Gerar código</button>
  </div>`;
}

function isDashboardVisible() {
  const app = document.querySelector('#app');
  if (!app || app.hidden) return false;
  return Boolean(app.querySelector('.nav-btn.active[data-view="dashboard"], .mobile-bottom .active[data-view="dashboard"]'));
}

function whatsappDashboardCard(status = latestStatus) {
  if (status.status === 'connected') return '';

  if (status.status === 'pairing' && status.pairingCode) {
    return `<section id="${CARD_ID}" class="wa-dashboard-card card" aria-live="polite">
      <div class="wa-dashboard-copy">
        <div class="wa-dashboard-kicker">Vincular WhatsApp</div>
        <h2>Digite este código no WhatsApp</h2>
        <p>No próprio celular, abra <strong>WhatsApp → Aparelhos conectados → Conectar aparelho → Conectar com número de telefone</strong>.</p>
        <div class="wa-pairing-code-row">
          <code class="wa-pairing-code" data-whatsapp-pairing-code>${escapeHtml(status.pairingCode)}</code>
          <button class="btn sm" type="button" data-copy-whatsapp-pairing-code>Copiar código</button>
        </div>
        <div class="wa-dashboard-status"><span class="status-dot offline"></span>Aguardando confirmação no WhatsApp</div>
        <button class="btn" type="button" data-dashboard-whatsapp-connect>Preferir QR Code</button>
      </div>
    </section>`;
  }

  if (status.status === 'qr' && status.qrDataUrl) {
    return `<section id="${CARD_ID}" class="wa-dashboard-card card" aria-live="polite">
      <div class="wa-dashboard-copy">
        <div class="wa-dashboard-kicker">Vincular WhatsApp</div>
        <h2>Escaneie ou vincule pelo próprio celular</h2>
        <p>Para QR Code: abra <strong>Aparelhos conectados → Conectar aparelho</strong>. O mesmo QR Code também é exibido no terminal.</p>
        ${pairingForm()}
        <div class="wa-dashboard-status"><span class="status-dot offline"></span>Aguardando vínculo do WhatsApp</div>
      </div>
      <div class="wa-dashboard-qr"><img class="wa-qr" src="${escapeHtml(status.qrDataUrl)}" alt="QR Code para vincular o WhatsApp ao PrismaStore" /></div>
    </section>`;
  }

  if (['connecting', 'authenticated'].includes(status.status)) {
    return `<section id="${CARD_ID}" class="wa-dashboard-card card" aria-live="polite">
      <div class="wa-dashboard-copy">
        <div class="wa-dashboard-kicker">Vincular WhatsApp</div>
        <h2>Preparando conexão</h2>
        <p>Estamos preparando as opções de vínculo. Você poderá usar QR Code ou um código no próprio celular.</p>
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
      ${pairingForm()}
      <button class="btn primary" type="button" data-dashboard-whatsapp-connect>Usar QR Code</button>
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
  if (response.status === 401) window.dispatchEvent(new CustomEvent('prismastore:auth-required'));
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
  if (response.status === 401) window.dispatchEvent(new CustomEvent('prismastore:auth-required'));
  if (!response.ok) throw new Error(status.error || 'Falha ao conectar o WhatsApp.');
  latestStatus = status;
  renderWhatsAppDashboardCard(status);
  return status;
}

async function requestWhatsAppPairing(phone) {
  const response = await fetch('/api/whatsapp/pair', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const status = await response.json();
  if (response.status === 401) window.dispatchEvent(new CustomEvent('prismastore:auth-required'));
  if (!response.ok) throw new Error(status.error || 'Falha ao gerar o código de pareamento.');
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
      pairingCode: null,
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
        pairingCode: null,
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
  const pairButton = event.target.closest?.('[data-dashboard-whatsapp-pair]');
  if (pairButton) {
    const card = pairButton.closest(`#${CARD_ID}`);
    const phone = card?.querySelector('[data-whatsapp-pair-phone]')?.value?.trim() || '';
    pairButton.disabled = true;
    requestWhatsAppPairing(phone).catch((error) => {
      latestStatus = {
        ...latestStatus,
        status: 'error',
        pairingCode: null,
        error: error instanceof Error ? error.message : 'Falha ao gerar código.',
      };
      renderWhatsAppDashboardCard(latestStatus);
    }).finally(() => { pairButton.disabled = false; });
    return;
  }

  const copyButton = event.target.closest?.('[data-copy-whatsapp-pairing-code]');
  if (copyButton) {
    const code = document.querySelector('[data-whatsapp-pairing-code]')?.textContent?.trim();
    if (code) navigator.clipboard?.writeText(code).catch(() => {});
    return;
  }

  const connectButton = event.target.closest?.('[data-dashboard-whatsapp-connect]');
  if (!connectButton) return;
  requestWhatsAppConnection().catch((error) => {
    latestStatus = {
      status: 'error',
      qrDataUrl: null,
      pairingCode: null,
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

export { ensureWhatsAppConnection, requestWhatsAppPairing, whatsappDashboardCard, renderWhatsAppDashboardCard };
