const ICONS = {
  'layout-dashboard': '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  'shopping-bag': '<path d="M6 8h12l1 13H5L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  'shopping-cart': '<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 8H7"/>',
  'dollar-sign': '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/>',
  'alert-triangle': '<path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  package: '<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v9"/><path d="m21 8v9l-9 5-9-5V8"/>',
  'bar-chart-3': '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  'message-circle': '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.2 9.2 0 0 1-4-.9L3 21l1.7-4.5A8.6 8.6 0 1 1 21 11.5Z"/>',
  settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.13.37.34.7.6 1 .3.27.68.4 1.1.4h.1v4h-.1c-.42 0-.8.13-1.1.4-.26.3-.47.63-.6 1Z"/>',
};

const VIEW_ICONS = {
  dashboard: 'layout-dashboard',
  orders: 'shopping-bag',
  customers: 'users',
  products: 'package',
  reports: 'bar-chart-3',
  chatbot: 'message-circle',
  settings: 'settings',
};

function icon(name) {
  const body = ICONS[name] || ICONS['layout-dashboard'];
  return `<svg class="admin-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function applyAdminIcons(root = document) {
  for (const [view, name] of Object.entries(VIEW_ICONS)) {
    root.querySelectorAll(`[data-view="${view}"] .nav-icon, [data-view="${view}"] .mob-icon`).forEach((node) => {
      if (node.dataset.adminIcon === name) return;
      node.innerHTML = icon(name);
      node.dataset.adminIcon = name;
    });
  }

  const kpiIcons = {
    money: 'dollar-sign',
    cart: 'shopping-cart',
    box: 'package',
    alert: 'alert-triangle',
  };
  root.querySelectorAll('[data-kpi-icon]').forEach((node) => {
    const name = kpiIcons[node.dataset.kpiIcon] || 'package';
    if (node.dataset.adminIcon === name) return;
    node.innerHTML = icon(name);
    node.dataset.adminIcon = name;
  });
  root.querySelectorAll('[data-kpi-signal]').forEach((node) => {
    if (node.dataset.adminIcon === 'bar-chart-3') return;
    node.innerHTML = icon('bar-chart-3');
    node.dataset.adminIcon = 'bar-chart-3';
  });
}

const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(() => applyAdminIcons(app));
  observer.observe(app, { childList: true });
  applyAdminIcons(app);
}

export { icon, applyAdminIcons };
