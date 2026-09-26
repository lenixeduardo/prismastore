let lastSignature = null;
let checking = false;
let syncTimer = null;
let syncActive = false;

async function currentSignature() {
  const response = await fetch('/api/state', { cache: 'no-store' });
  if (!response.ok) throw new Error('Falha ao sincronizar estado do PrismaStore.');
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
  if (checking || document.hidden) return true;
  checking = true;
  try {
    const signature = await currentSignature();
    if (lastSignature == null) {
      lastSignature = signature;
      return true;
    }
    if (signature !== lastSignature) {
      const previousSignature = lastSignature;
      lastSignature = signature;
      window.dispatchEvent(new CustomEvent('prismastore:external-state-changed', {
        detail: { source: 'live-sync', previousSignature, signature },
      }));
    }
    return true;
  } catch {
    return false;
  } finally {
    checking = false;
  }
}

function stopLiveSync() {
  syncActive = false;
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = null;
}

async function runLiveSync() {
  if (!syncActive) return;
  const healthy = await checkForServerChanges();
  if (!healthy) {
    stopLiveSync();
    return;
  }
  syncTimer = window.setTimeout(runLiveSync, 3000);
}

function startLiveSync() {
  if (syncActive) return;
  syncActive = true;
  runLiveSync();
}

window.addEventListener('prismastore:runtime-ready', startLiveSync);
window.addEventListener('focus', () => {
  const app = document.querySelector('#app');
  if (app && !app.hidden && !syncActive) startLiveSync();
});
