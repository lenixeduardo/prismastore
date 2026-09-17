const nativeFetch = window.fetch.bind(window);
let session = { authenticated: false, authEnabled: true, user: null };
let sessionChecked = false;
let loginPromise = null;
let resolveProtectedAccess = null;
let protectedAccess = new Promise((resolve) => { resolveProtectedAccess = resolve; });

function isAuthEndpoint(input) {
  const raw = typeof input === 'string' ? input : input?.url || '';
  const url = new URL(raw, window.location.origin);
  return url.pathname.startsWith('/api/auth/');
}

function isProtectedApi(input) {
  const raw = typeof input === 'string' ? input : input?.url || '';
  const url = new URL(raw, window.location.origin);
  return url.origin === window.location.origin && url.pathname.startsWith('/api/') && !isAuthEndpoint(input);
}

window.fetch = async function prismastoreAuthenticatedFetch(input, init = {}) {
  if (!isProtectedApi(input)) return nativeFetch(input, init);
  await initialSession;
  if (!session.authenticated) await protectedAccess;
  return nativeFetch(input, { ...init, credentials: init.credentials || 'same-origin' });
};

async function getSession() {
  try {
    const response = await nativeFetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' });
    session = response.ok ? await response.json() : { authenticated: false, authEnabled: true, user: null };
  } catch {
    session = { authenticated: false, authEnabled: true, user: null };
  }
  sessionChecked = true;
  if (session.authenticated) resolveProtectedAccess?.(true);
  return session;
}

const initialSession = getSession();

function ensureDialog() {
  let overlay = document.querySelector('[data-auth-overlay]');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'auth-overlay';
  overlay.dataset.authOverlay = '';
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div class="auth-brand"><img src="/icons/apple-touch-icon.png" alt="" /><span>PrismaStore</span></div>
      <h2 id="auth-title">Acessar painel</h2>
      <p>Entre com as credenciais administrativas da loja.</p>
      <form data-auth-form>
        <label>Usuário<input name="username" autocomplete="username" value="admin" required /></label>
        <label>Senha<input name="password" type="password" autocomplete="current-password" required /></label>
        <div class="auth-error" data-auth-error aria-live="polite"></div>
        <button class="auth-submit" type="submit">Entrar</button>
      </form>
    </section>`;
  document.body.append(overlay);
  return overlay;
}

async function showLogin() {
  if (loginPromise) return loginPromise;
  const overlay = ensureDialog();
  overlay.hidden = false;
  loginPromise = new Promise((resolve) => {
    const form = overlay.querySelector('[data-auth-form]');
    const errorBox = overlay.querySelector('[data-auth-error]');
    const submit = overlay.querySelector('.auth-submit');
    const onSubmit = async (event) => {
      event.preventDefault();
      errorBox.textContent = '';
      submit.disabled = true;
      try {
        const fields = new FormData(form);
        const response = await nativeFetch('/api/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: fields.get('username'), password: fields.get('password') }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Não foi possível entrar no painel.');
        session = { ...payload, authenticated: true };
        resolveProtectedAccess?.(true);
        overlay.hidden = true;
        form.removeEventListener('submit', onSubmit);
        loginPromise = null;
        window.dispatchEvent(new CustomEvent('prismastore:authenticated', { detail: session }));
        resolve(true);
      } catch (error) {
        errorBox.textContent = error instanceof Error ? error.message : 'Não foi possível entrar no painel.';
      } finally {
        submit.disabled = false;
      }
    };
    form.addEventListener('submit', onSubmit);
    queueMicrotask(() => form.querySelector('input[name="username"]')?.focus());
  });
  return loginPromise;
}

async function ensureAdminSession() {
  if (!sessionChecked) await initialSession;
  if (session.authenticated || session.authEnabled === false) return true;
  return showLogin();
}

async function logoutAdmin() {
  try {
    await nativeFetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    session = { authenticated: false, authEnabled: true, user: null };
    protectedAccess = new Promise((resolve) => { resolveProtectedAccess = resolve; });
    sessionStorage.removeItem('prismastore:resume-panel');
    window.dispatchEvent(new CustomEvent('prismastore:logged-out'));
    window.location.reload();
  }
}

function mountLogoutButton() {
  if (!session.authenticated || document.querySelector('[data-auth-logout]')) return;
  const title = [...document.querySelectorAll('h1')].find((node) => node.textContent?.trim() === 'Configurações');
  const actions = title?.closest('.topbar')?.querySelector('.top-actions');
  if (!actions) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn';
  button.dataset.authLogout = '';
  button.textContent = 'Sair do painel';
  button.addEventListener('click', logoutAdmin);
  actions.append(button);
}

new MutationObserver(mountLogoutButton).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('prismastore:authenticated', mountLogoutButton);
initialSession.then(mountLogoutButton);

window.PrismastoreAuth = {
  getSession: () => initialSession,
  ensureAdminSession,
  showLogin,
  logoutAdmin,
  isAuthenticated: () => Boolean(session.authenticated || session.authEnabled === false),
};
