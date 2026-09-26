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


test('dashboard keeps the four KPI assets without the holographic prism artwork', () => {
  assert.doesNotMatch(app, /\/assets\/dashboard-prism-holographic\.webp/);
  assert.match(app, /\/assets\/kpi-revenue\.webp/);
  assert.match(app, /\/assets\/kpi-paid-orders\.webp/);
  assert.match(app, /\/assets\/kpi-packing\.webp/);
  assert.match(app, /\/assets\/kpi-critical-stock\.svg/);
  assert.match(styles, /\.dashboard-kpi-art/);
  assert.doesNotMatch(sw, /\/assets\/dashboard-prism-holographic\.webp/);
});


test('dashboard KPI art stays secondary to text on desktop and mobile', () => {
  assert.match(styles, /\.dashboard-hero\s*\{[\s\S]*?min-height:\s*220px/);
  assert.doesNotMatch(styles, /\.dashboard-prism\s*\{/);
  assert.match(styles, /\.card\.padded\.dashboard-kpi\s*\{[\s\S]*?padding:\s*22px 36% 22px 20px/);
  assert.match(styles, /\.dashboard-kpi-art\s*\{[\s\S]*?width:\s*35%[\s\S]*?max-width:\s*142px[\s\S]*?opacity:\s*\.48/);
  assert.doesNotMatch(styles, /\.dashboard-kpi-art\s*\{[\s\S]*?transform:\s*scale\(1\.18\)/);
  assert.match(styles, /@media \(max-width:\s*820px\)[\s\S]*?\.dashboard-kpi-art\s*\{[\s\S]*?width:\s*33%[\s\S]*?max-width:\s*90px[\s\S]*?opacity:\s*\.40/);
  assert.doesNotMatch(styles, /@media \(max-width:\s*820px\)[\s\S]*?\.dashboard-kpi-art\s*\{[\s\S]*?transform:\s*scale\(1\.42\)/);
});


test('mobile order cards keep the content column wide enough for customer and item text', () => {
  assert.match(styles, /@media \(max-width:\s*820px\)[\s\S]*?\.dashboard-order-row\s*\{\s*grid-template-columns:\s*minmax\(0,1fr\) auto;[\s\S]*?\.recent-orders-card \.dashboard-order-row\s*\{\s*grid-template-columns:\s*minmax\(0,1fr\) auto;/);
  assert.match(styles, /@media \(max-width:\s*390px\)[\s\S]*?\.dashboard-order-row\s*\{\s*grid-template-columns:\s*minmax\(0,1fr\) auto;/);
  assert.doesNotMatch(styles, /\.dashboard-order-row\s*\{\s*grid-template-columns:\s*(?:38px|34px)\s+minmax\(0,1fr\)/);
  assert.doesNotMatch(styles, /\.recent-orders-card \.dashboard-order-row\s*\{\s*grid-template-columns:\s*32px\s+minmax\(0,1fr\)/);
  assert.match(styles, /@media \(max-width:\s*820px\)[\s\S]*?\.order-main \.customer-name\s*\{[\s\S]*?white-space:\s*nowrap[\s\S]*?text-overflow:\s*ellipsis/);
  assert.match(styles, /@media \(max-width:\s*820px\)[\s\S]*?\.order-main \.category\s*\{[\s\S]*?white-space:\s*nowrap[\s\S]*?text-overflow:\s*ellipsis/);
});
