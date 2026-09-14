let lastSignature = null;
let checking = false;

async function currentSignature() {
  const response = await fetch('/api/state', { cache: 'no-store' });
  if (!response.ok) return null;
  const state = await response.json();
  return JSON.stringify({
    orders: state.orders ?? [],
    products: state.products ?? [],
    customers: state.customers ?? [],
  });
}

function ensurePendingPaymentFilter() {
  const tabs = document.querySelector('.tabs');
  if (!tabs || tabs.querySelector('[data-live-pending]')) return;
  const button = document.createElement('button');
  button.className = 'tab';
  button.dataset.livePending = 'true';
  button.textContent = 'Aguardando Pix';
  button.addEventListener('click', () => {
    document.querySelectorAll('.tabs .tab').forEach((tab) => tab.classList.remove('active'));
    button.classList.add('active');
    document.querySelectorAll('tbody tr').forEach((row) => {
      row.style.display = row.textContent.includes('Aguardando Pix') ? '' : 'none';
    });
  });
  tabs.insertBefore(button, tabs.children[1] ?? null);
}

async function checkForServerChanges() {
  ensurePendingPaymentFilter();
  if (checking || document.hidden) return;
  checking = true;
  try {
    const signature = await currentSignature();
    if (signature == null) return;
    if (lastSignature == null) {
      lastSignature = signature;
      return;
    }
    if (signature !== lastSignature) window.location.reload();
  } catch {
    // O painel principal já exibe o estado da conexão local.
  } finally {
    checking = false;
  }
}

checkForServerChanges();
setInterval(checkForServerChanges, 2000);
