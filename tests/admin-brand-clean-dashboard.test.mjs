import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const pwa = readFileSync(new URL('../src/pwa.js', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../src/auth-ui.js', import.meta.url), 'utf8');
const deliveryConfirmation = readFileSync(new URL('../delivery-confirmation.html', import.meta.url), 'utf8');

test('visible PrismaStore surfaces do not render the triangular prism icon', () => {
  assert.doesNotMatch(app, /prismastore-prism-logo|dashboard-prism-holographic|class="dashboard-prism"|class="brand-mark"/);
  assert.doesNotMatch(auth, /prismastore-prism-logo|icon-512\.svg|<img[^>]+auth-brand/);
  assert.doesNotMatch(deliveryConfirmation, /prismastore-prism-logo|<img[^>]+delivery-brand/);
  assert.doesNotMatch(styles, /\.dashboard-prism\s*\{|\.brand-mark img/);
});

test('dashboard initial screen has no MVP label or quick action buttons', () => {
  assert.doesNotMatch(app, /PRISMASTORE\s*·\s*MVP/i);
  assert.doesNotMatch(app, />Testar fluxo</);
  assert.doesNotMatch(app, />Ver pedidos</);
});

test('initial sidebar footer does not expose persistent-session implementation copy', () => {
  assert.doesNotMatch(app, /SQLite local · sessão persistente/);
});


test('dashboard removes static revenue comparison copy and products use grouped stock controls in the summary list', () => {
  assert.doesNotMatch(app, /↑ 12,8% vs\. mês anterior/);
  assert.doesNotMatch(app, /No MVP de validação não há imagens de produtos/);
  assert.match(app, /class="product-stock-stepper"/);
  assert.match(app, /data-stock-dec=/);
  assert.match(app, /data-stock-input=/);
  assert.match(app, /data-stock-inc=/);
  assert.match(app, /data-real-product-details=/);
});

test('PWA does not render the server online status badge', () => {
  assert.doesNotMatch(pwa, /Servidor online/);
  assert.doesNotMatch(pwa, /pwa-status/);
});


test('dashboard no longer uses decorative KPI artwork or holographic prism imagery', () => {
  assert.doesNotMatch(app, /\/assets\/dashboard-prism-holographic\.webp/);
  assert.doesNotMatch(app, /DASHBOARD_KPI_ASSETS|dashboard-kpi-art/);
  assert.doesNotMatch(sw, /\/assets\/dashboard-prism-holographic\.webp/);
  assert.match(app, /dashboard-kpi-icon/);
  assert.match(app, /dashboard-kpi-signal/);
});


test('dashboard metrics use compact neutral cards on desktop and a two-column mobile grid', () => {
  assert.doesNotMatch(styles, /\.dashboard-prism\s*\{/);
  assert.match(styles, /\.card\.padded\.dashboard-kpi\s*\{[\s\S]*?background:\s*#121616/);
  assert.match(styles, /@media \(max-width:\s*820px\)[\s\S]*?\.dashboard-kpis\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/);
});


test('mobile order cards keep the content column wide enough for customer and item text', () => {
  assert.match(styles, /@media \(max-width:\s*820px\)[\s\S]*?\.dashboard-order-row\s*\{\s*grid-template-columns:\s*minmax\(0,1fr\) auto;[\s\S]*?\.recent-orders-card \.dashboard-order-row\s*\{\s*grid-template-columns:\s*minmax\(0,1fr\) auto;/);
  assert.match(styles, /@media \(max-width:\s*390px\)[\s\S]*?\.dashboard-order-row\s*\{\s*grid-template-columns:\s*minmax\(0,1fr\) auto;/);
  assert.doesNotMatch(styles, /\.dashboard-order-row\s*\{\s*grid-template-columns:\s*(?:38px|34px)\s+minmax\(0,1fr\)/);
  assert.doesNotMatch(styles, /\.recent-orders-card \.dashboard-order-row\s*\{\s*grid-template-columns:\s*32px\s+minmax\(0,1fr\)/);
  assert.match(styles, /@media \(max-width:\s*820px\)[\s\S]*?\.order-main \.customer-name\s*\{[\s\S]*?white-space:\s*nowrap[\s\S]*?text-overflow:\s*ellipsis/);
  assert.match(styles, /@media \(max-width:\s*820px\)[\s\S]*?\.order-main \.category\s*\{[\s\S]*?white-space:\s*nowrap[\s\S]*?text-overflow:\s*ellipsis/);
});
