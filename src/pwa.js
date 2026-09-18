let deferredInstallPrompt = null;
let installCard = null;

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
}

function ensureStatusPill() {
  let pill = document.querySelector('.pwa-status');
  if (!pill) {
    pill = document.createElement('div');
    pill.className = 'pwa-status';
    pill.innerHTML = '<i></i><span>Verificando servidor…</span>';
    document.body.appendChild(pill);
  }
  return pill;
}

async function refreshServerStatus() {
  const pill = ensureStatusPill();
  if (!navigator.onLine) {
    pill.classList.add('offline');
    pill.querySelector('span').textContent = 'Sem conexão';
    return;
  }
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (!response.ok) throw new Error('Servidor indisponível');
    pill.classList.remove('offline');
    pill.querySelector('span').textContent = 'Servidor online';
  } catch {
    pill.classList.add('offline');
    pill.querySelector('span').textContent = 'Servidor indisponível';
  }
}

function closeInstallCard() {
  installCard?.remove();
  installCard = null;
}

function showInstallCard({ ios = false, update = false } = {}) {
  if (isStandalone()) return;
  closeInstallCard();
  installCard = document.createElement('div');
  installCard.className = 'pwa-install-card';
  const message = update
    ? 'Há uma nova versão do PrismaStore pronta para carregar.'
    : ios
      ? 'No iPhone, toque em Compartilhar e depois em “Adicionar à Tela de Início”.'
      : 'Instale o PrismaStore para abrir em tela cheia como um aplicativo.';
  installCard.innerHTML = `<strong>${update ? 'Atualização disponível' : 'PrismaStore no celular'}</strong><p>${message}</p><div class="pwa-install-actions"><button class="btn ghost" data-pwa-dismiss>Agora não</button>${ios ? '' : `<button class="btn primary" ${update ? 'data-pwa-update' : 'data-pwa-install'}>${update ? 'Atualizar' : 'Instalar'}</button>`}</div>`;
  document.body.appendChild(installCard);
}

async function installPWA() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  closeInstallCard();
}

function labelTables(root = document) {
  root.querySelectorAll('table').forEach((table) => {
    const labels = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    table.querySelectorAll('tbody tr').forEach((row) => {
      [...row.children].forEach((cell, index) => cell.setAttribute('data-label', labels[index] || ''));
    });
  });
}

function closeMoreSheet() {
  document.querySelector('.pwa-more-backdrop')?.remove();
}

function navigateTo(view) {
  const target = document.querySelector(`.sidebar [data-view="${view}"]`) || document.querySelector(`[data-view="${view}"]`);
  target?.click();
  closeMoreSheet();
}

function openMoreSheet() {
  closeMoreSheet();
  const backdrop = document.createElement('div');
  backdrop.className = 'pwa-more-backdrop';
  backdrop.innerHTML = `<div class="pwa-more-sheet"><div class="pwa-more-handle"></div><div class="pwa-more-grid"><button data-pwa-view="customers">◎ Clientes</button><button data-pwa-view="reports">⌁ Relatórios</button><button data-pwa-view="chatbot">◌ Simular chatbot</button>${!isStandalone() && (deferredInstallPrompt || isIOS()) ? '<button data-pwa-install-entry>＋ Instalar PrismaStore</button>' : ''}</div></div>`;
  document.body.appendChild(backdrop);
}

function patchMobileNav(root = document) {
  const nav = root.querySelector('.mobile-bottom');
  if (!nav || nav.querySelector('[data-pwa-more]')) return;
  const buttons = [...nav.querySelectorAll('button')];
  if (buttons.length < 5) return;
  const last = buttons[buttons.length - 1];
  const more = document.createElement('button');
  more.type = 'button';
  more.setAttribute('data-pwa-more', '');
  more.innerHTML = '<span class="mob-icon">•••</span>Mais';
  last.replaceWith(more);
}

function enhanceRenderedUI() {
  patchMobileNav();
  labelTables();
}

async function registerServiceWorker() {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.register('/service-worker.js');
  if (registration.waiting) showInstallCard({ update: true });
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) showInstallCard({ update: true });
    });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
  return registration;
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  showInstallCard();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  closeInstallCard();
});

window.addEventListener('online', refreshServerStatus);
window.addEventListener('offline', refreshServerStatus);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshServerStatus(); });

document.addEventListener('click', async (event) => {
  if (event.target.closest('[data-pwa-more]')) return openMoreSheet();
  if (event.target === document.querySelector('.pwa-more-backdrop')) return closeMoreSheet();
  const view = event.target.closest('[data-pwa-view]')?.getAttribute('data-pwa-view');
  if (view) return navigateTo(view);
  if (event.target.closest('[data-pwa-install-entry]')) {
    closeMoreSheet();
    if (deferredInstallPrompt) return installPWA();
    if (isIOS()) return showInstallCard({ ios: true });
  }
  if (event.target.closest('[data-pwa-install]')) return installPWA();
  if (event.target.closest('[data-pwa-dismiss]')) return closeInstallCard();
  if (event.target.closest('[data-pwa-update]')) {
    const registration = await navigator.serviceWorker?.getRegistration();
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  }
});

const observer = new MutationObserver(() => enhanceRenderedUI());
observer.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener('DOMContentLoaded', () => {
  enhanceRenderedUI();
  refreshServerStatus();
  if (window.isSecureContext && isIOS() && !isStandalone()) setTimeout(() => showInstallCard({ ios: true }), 1200);
  registerServiceWorker().catch((error) => console.warn('PWA indisponível:', error));
});
