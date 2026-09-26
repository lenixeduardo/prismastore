(() => {
  const STORAGE_KEY = 'prismastore:theme';
  const validThemes = new Set(['dark', 'light']);

  function readStoredTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return validThemes.has(saved) ? saved : null;
    } catch {
      return null;
    }
  }

  function currentTheme() {
    const value = document.documentElement.dataset.theme;
    return validThemes.has(value) ? value : 'dark';
  }

  function sync(root = document) {
    const theme = currentTheme();
    const isLight = theme === 'light';
    root.querySelectorAll?.('[data-theme-toggle]').forEach((button) => {
      button.setAttribute('aria-checked', String(isLight));
      button.dataset.themeValue = theme;
      button.title = isLight ? 'Usar tema escuro' : 'Usar tema claro';
      const label = button.querySelector('[data-theme-label]');
      if (label) label.textContent = isLight ? 'Tema claro' : 'Tema escuro';
    });
  }

  function applyTheme(theme, { persist = true } = {}) {
    const next = validThemes.has(theme) ? theme : 'dark';
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'light' ? '#f4f8f5' : '#080c0c');

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Browsers with restricted storage still keep the theme for this page.
      }
    }

    sync();
    window.dispatchEvent(new CustomEvent('prismastore:theme-changed', { detail: { theme: next } }));
    return next;
  }

  function toggleTheme() {
    return applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
  }

  applyTheme(readStoredTheme() || 'dark', { persist: false });

  document.addEventListener('click', (event) => {
    const toggle = event.target.closest?.('[data-theme-toggle]');
    if (!toggle) return;
    toggleTheme();
  });

  document.addEventListener('DOMContentLoaded', () => sync());

  window.PrismastoreTheme = {
    apply: applyTheme,
    toggle: toggleTheme,
    get: currentTheme,
    sync,
  };
})();
