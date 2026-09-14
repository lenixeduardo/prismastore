let lastStatus = null;

function paymentRow() {
  return [...document.querySelectorAll('.setting-row')]
    .find((row) => row.querySelector('.product-name')?.textContent?.trim() === 'Pix');
}

function renderPaymentStatus(status) {
  const row = paymentRow();
  if (!row) return;
  const category = row.querySelector('.category');
  const badge = row.querySelector('.badge');
  if (category) category.textContent = `Asaas · ${status.environment === 'production' ? 'Produção' : 'Sandbox'}`;
  if (!badge) return;

  badge.className = 'badge';
  if (!status.configured) {
    badge.classList.add('orange');
    badge.textContent = 'FALTA API KEY';
  } else if (!status.webhookConfigured) {
    badge.classList.add('orange');
    badge.textContent = 'FALTA WEBHOOK TOKEN';
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
    // O painel continua funcional mesmo sem o provedor de pagamento.
  }
}

const observer = new MutationObserver(() => {
  if (lastStatus) renderPaymentStatus(lastStatus);
});
observer.observe(document.documentElement, { childList: true, subtree: true });

refreshPaymentStatus();
setInterval(refreshPaymentStatus, 2000);
