let deferredInstallPrompt = null;
let installCard = null;

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
}

function closeInstallCard() {
  installCard?.remove();
  installCard = null;
}

function showInstallCard({ ios = false, update = false, insecure = false, unavailable = false } = {}) {
  if (isStandalone()) return;
  closeInstallCard();
  installCard = document.createElement('div');
  installCard.className = 'pwa-install-card';

  let title = 'PrismaStore no celular';
  let message = 'Instale o PrismaStore para abrir em tela cheia como um aplicativo.';
  let primaryAction = '<button class="btn primary" data-pwa-install>Instalar</button>';

  if (update) {
    title = 'Atualização disponível';
    message = 'Há uma nova versão do PrismaStore pronta para carregar.';
    primaryAction = '<button class="btn primary" data-pwa-update>Atualizar</button>';
  } else if (insecure) {
    title = 'HTTPS necessário para instalar';
    message = 'Esta produção está aberta por HTTP. O navegador bloqueia a instalação real do PrismaStore e o service worker fora de HTTPS. Abra o painel por um endereço HTTPS e tente novamente.';
    primaryAction = '';
  } else if (ios) {
    title = 'Adicionar PrismaStore à Tela de Início';
    message = 'No iPhone, o site não pode criar o ícone automaticamente. Abra no Safari, toque em Compartilhar, escolha “Adicionar à Tela de Início” e depois toque em “Adicionar”.';
    primaryAction = '';
  } else if (unavailable) {
    title = 'Instalação ainda não liberada';
    message = 'O navegador ainda não disponibilizou o prompt de instalação. Recarregue a página e verifique se o PrismaStore está aberto por HTTPS.';
    primaryAction = '';
  }

  installCard.innerHTML = `<strong>${title}</strong><p>${message}</p><div class="pwa-install-actions"><button class="btn ghost" data-pwa-dismiss>Fechar</button>${primaryAction}</div>`;
  document.body.appendChild(installCard);
}

async function installPWA() {
  if (!window.isSecureContext) {
    showInstallCard({ insecure: true });
    return;
  }
  if (!deferredInstallPrompt) {
    showInstallCard({ unavailable: true });
    return;
  }
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

function openMoreSheet() {
  closeMoreSheet();
  const backdrop = document.createElement('div');
  backdrop.className = 'pwa-more-backdrop';
  backdrop.innerHTML = '<div class="pwa-more-sheet"><div class="pwa-more-handle"></div><div class="pwa-more-grid"><button data-pwa-install-entry>＋ Instalar PrismaStore</button></div></div>';
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
  const registration = await navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' });
  await registration.update().catch(() => {});
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

document.addEventListener('click', async (event) => {
  if (event.target.closest('[data-pwa-more]')) return openMoreSheet();
  if (event.target === document.querySelector('.pwa-more-backdrop')) return closeMoreSheet();
  if (event.target.closest('[data-pwa-install-entry]')) {
    closeMoreSheet();
    if (isStandalone()) return;
    if (!window.isSecureContext) return showInstallCard({ insecure: true });
    if (deferredInstallPrompt) return installPWA();
    if (isIOS()) return showInstallCard({ ios: true });
    return showInstallCard({ unavailable: true });
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
  if (window.isSecureContext && isIOS() && !isStandalone()) setTimeout(() => showInstallCard({ ios: true }), 1200);
  registerServiceWorker().catch((error) => console.warn('PWA indisponível:', error));
});
