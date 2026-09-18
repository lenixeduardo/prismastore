let lastStatus = null;

function paymentRow() {
  return [...document.querySelectorAll('.setting-row')]
    .find((row) => row.querySelector('.product-name')?.textContent?.trim()?.startsWith('Pix'));
}

function renderPaymentStatus(status) {
  const row = paymentRow();
  if (!row) return;
  const category = row.querySelector('.category');
  const badge = row.querySelector('.badge');
  if (category) category.textContent = status.provider === 'pix-local' ? 'Pix local · Comprovante' : 'Pix';
  if (!badge) return;

  badge.className = 'badge';
  if (!status.configured) {
    badge.classList.add('orange');
    badge.textContent = 'CONFIGURAR PIX';
  } else {
    badge.classList.add('green');
    badge.textContent = 'CONFIGURADO';
  }
}

async function refreshPaymentStatus() {
  try {
    const response = await fetch('/api/payments/status', { cache: 'no-store' });
    if (!response.ok) return;
    lastStatus = await response.json();
    renderPaymentStatus(lastStatus);
  } catch {
    // O painel continua funcional mesmo sem a configuração do Pix.
  }
}

const observer = new MutationObserver(() => {
  if (lastStatus) renderPaymentStatus(lastStatus);
});
observer.observe(document.documentElement, { childList: true, subtree: true });

function refreshPaymentStatusWhenVisible() {
  const app = document.querySelector('#app');
  if (!app || app.hidden || !paymentRow()) return;
  refreshPaymentStatus();
}

window.addEventListener('prismastore:runtime-ready', refreshPaymentStatusWhenVisible);
window.addEventListener('prismastore:view-changed', (event) => {
  if (event.detail?.view === 'settings') refreshPaymentStatusWhenVisible();
});
