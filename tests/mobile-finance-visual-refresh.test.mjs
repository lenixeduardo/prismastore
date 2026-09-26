import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const orders = readFileSync(new URL('../src/orders-board.css', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

test('dashboard uses the approved black finance visual language', () => {
  assert.match(styles, /--bg:\s*#080c0c/i);
  assert.match(styles, /--panel:\s*#121616/i);
  assert.match(styles, /--emerald:\s*#19b86c/i);
  assert.match(app, /Bem-vindo, <span[^>]*>Eduardo<\/span>/);
  assert.doesNotMatch(app, /Central de Operações/);
});

test('dashboard KPI values stay dynamic while artwork is reduced to static icon and signal assets', () => {
  assert.doesNotMatch(app, /DASHBOARD_KPI_ASSETS/);
  assert.doesNotMatch(app, /dashboard-kpi-art/);
  assert.match(app, /dashboard-kpi-icon/);
  assert.match(app, /dashboard-kpi-signal/);
  assert.match(app, /\/assets\/metric-orders-cart\.svg/);
  assert.match(app, /\/assets\/metric-signal\.svg/);
  assert.match(app, /dashboardKpi\('cart'/);
  assert.match(app, /String\(paidMonth\.length\)/);
});

test('mobile home keeps two metric columns and restrained emerald emphasis', () => {
  assert.match(styles, /@media \(max-width:\s*820px\)[\s\S]*?\.dashboard-kpis\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.mobile-bottom button\.active\s*\{[\s\S]*?background:\s*rgba\(25,184,108,\.08\)/);
});

test('orders board uses neutral surfaces instead of green-tinted lanes', () => {
  assert.match(orders, /\.orders-board-lane\s*\{[\s\S]*?background:\s*#121616/);
  assert.match(orders, /\.order-board-card\s*\{[\s\S]*?background:\s*#0d1111/);
});

test('service worker precaches only the new lightweight KPI assets', () => {
  assert.match(sw, /\/assets\/metric-orders-cart\.svg/);
  assert.match(sw, /\/assets\/metric-signal\.svg/);
  assert.doesNotMatch(sw, /\/assets\/kpi-revenue\.webp|\/assets\/kpi-paid-orders\.webp|\/assets\/kpi-packing\.webp/);
});
