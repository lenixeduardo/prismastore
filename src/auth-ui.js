import { friendlyErrorMessage } from './error-messages.js';

let authState = { loaded: false, configured: false, authenticated: false, username: null };
let loginPromise = null;
let loginResolve = null;

function ensureOverlay() {
  let overlay = document.querySelector('[data-auth-overlay]');
  if (overlay) return overlay;
  overlay = document.createElement('section');
  overlay.className = 'auth-overlay';
  overlay.dataset.authOverlay = 'true';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="auth-shell">
      <div class="auth-toolbar">
        <button class="theme-switch" type="button" role="switch" aria-checked="false" data-theme-toggle aria-label="Alternar tema claro e escuro">
          <span class="theme-switch-label" data-theme-label>Tema escuro</span>
          <span class="theme-switch-icon" aria-hidden="true">☀</span>
          <span class="theme-switch-track" aria-hidden="true"><span class="theme-switch-thumb"></span></span>
          <span class="theme-switch-icon" aria-hidden="true">☾</span>
        </button>
      </div>
      <div class="auth-brand">
        <div class="auth-brand-copy">
          <strong>PrismaStore</strong>
          <span>Operations</span>
        </div>
      </div>


      <div class="auth-heading">
        <h1 id="auth-title">Entrar</h1>
        <p>Acesse o painel de controle da sua operação.</p>
      </div>

      <div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <form class="auth-form" data-auth-form>
          <label class="auth-field">
            <span>Usuário</span>
            <div class="auth-input-wrap">
              <input name="username" autocomplete="username" value="admin" readonly aria-readonly="true" required />
            </div>
          </label>

          <label class="auth-field">
            <span>Senha</span>
            <div class="auth-input-wrap">
              <input name="password" type="password" autocomplete="current-password" required />
            </div>
          </label>

          <div class="auth-error" data-auth-error aria-live="polite"></div>

          <button class="auth-submit auth-glass-button" type="submit">
            <span>Entrar no painel</span>
            <span aria-hidden="true">→</span>
          </button>
        </form>

      </div>
    </div>`;
  document.body.appendChild(overlay);
  window.PrismastoreTheme?.sync(overlay);
  return overlay;
}

function showOverlay() {
  const overlay = ensureOverlay();
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.querySelector('input[name="password"]')?.focus());
}

function hideOverlay() {
  const overlay = ensureOverlay();
  overlay.hidden = true;
  const error = overlay.querySelector('[data-auth-error]');
  if (error) error.textContent = '';
}

function revealDashboard() {
  const app = document.querySelector('#app');
  if (!app) return;
  app.hidden = false;
  document.body.classList.add('dashboard-active');
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  window.dispatchEvent(new CustomEvent('prismastore:dashboard-opened'));
}

async function startAdminAccess() {
  const allowed = await ensureAuthenticated();
  if (!allowed) return false;
  revealDashboard();
  return true;
}

async function refreshStatus() {
  const response = await fetch('/api/auth/status', { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Não foi possível verificar o acesso administrativo.');
  authState = {
    loaded: true,
    configured: Boolean(payload.configured),
    authenticated: Boolean(payload.authenticated),
    username: payload.username || null,
  };
  return authState;
}

async function ensureAuthenticated() {
  try {
    if (!authState.loaded || !authState.authenticated) await refreshStatus();
  } catch (error) {
    authState = { ...authState, loaded: true, configured: true, authenticated: false };
    showOverlay();
    const target = document.querySelector('[data-auth-error]');
    if (target) target.textContent = 'Servidor local indisponível. Inicie o PrismaStore e tente novamente.';
    return false;
  }

  if (!authState.configured || authState.authenticated) return true;
  showOverlay();
  if (!loginPromise) {
    loginPromise = new Promise((resolve) => { loginResolve = resolve; });
  }
  return loginPromise;
}

function settleLogin(value) {
  loginResolve?.(value);
  loginResolve = null;
  loginPromise = null;
}

async function login(form) {
  const submit = form.querySelector('button[type="submit"]');
  const errorTarget = form.querySelector('[data-auth-error]');
  const data = new FormData(form);
  submit.disabled = true;
  if (errorTarget) errorTarget.textContent = '';
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: String(data.get('password') || ''),
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Não foi possível entrar.');
    authState = { loaded: true, configured: payload.configured !== false, authenticated: true, username: payload.username || null };
    sessionStorage.setItem('prismastore:resume-panel', 'auth-login');
    hideOverlay();
    window.dispatchEvent(new CustomEvent('prismastore:auth-restored'));
    settleLogin(true);
  } catch (error) {
    if (errorTarget) errorTarget.textContent = friendlyErrorMessage(error, 'Não foi possível entrar. Confira os dados e tente novamente.');
  } finally {
    submit.disabled = false;
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } finally {
    authState = { loaded: true, configured: true, authenticated: false, username: null };
    sessionStorage.removeItem('prismastore:resume-panel');
    window.location.reload();
  }
}

function injectLogoutButton() {
  if (!authState.configured || !authState.authenticated) return;
  if (document.querySelector('[data-admin-logout]')) return;
  const topActions = document.querySelector('#app .top-actions, #app .topbar-actions, #app .topbar');
  if (!topActions) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn sm admin-logout-button';
  button.dataset.adminLogout = 'true';
  button.textContent = 'Sair';
  topActions.appendChild(button);
}

document.addEventListener('submit', (event) => {
  const form = event.target.closest?.('[data-auth-form]');
  if (!form) return;
  event.preventDefault();
  login(form);
});

document.addEventListener('click', (event) => {
  if (event.target.closest?.('[data-admin-logout]')) logout();
});

window.addEventListener('prismastore:dashboard-opened', injectLogoutButton);

window.addEventListener('prismastore:auth-required', () => {
  authState = { ...authState, loaded: true, authenticated: false };
  showOverlay();
});

window.PrismastoreAuth = {
  ensureAuthenticated,
  refreshStatus,
  logout,
  getState: () => ({ ...authState }),
};

startAdminAccess();

