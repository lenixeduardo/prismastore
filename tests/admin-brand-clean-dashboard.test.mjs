import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const pwa = readFileSync(new URL('../src/pwa.js', import.meta.url), 'utf8');

test('admin shell uses the PrismaStore logo asset in the sidebar brand', () => {
  assert.match(app, /\/icons\/prismastore-logo\.png/);
  assert.match(styles, /\.brand-mark img/);
  assert.doesNotMatch(styles, /\.brand-mark::after/);
  assert.match(sw, /\/icons\/prismastore-logo\.png/);
});

test('dashboard initial screen has no MVP label or quick action buttons', () => {
  assert.doesNotMatch(app, /PRISMASTORE\s*·\s*MVP/i);
  assert.doesNotMatch(app, />Testar fluxo</);
  assert.doesNotMatch(app, />Ver pedidos</);
});

test('initial sidebar footer does not expose persistent-session implementation copy', () => {
  assert.doesNotMatch(app, /SQLite local · sessão persistente/);
});


test('dashboard removes static revenue comparison copy and products expose stock controls', () => {
  assert.doesNotMatch(app, /↑ 12,8% vs\. mês anterior/);
  assert.doesNotMatch(app, /No MVP de validação não há imagens de produtos/);
  assert.match(app, /data-stock-dec=/);
  assert.match(app, /data-stock-input=/);
  assert.match(app, /data-stock-inc=/);
});

test('PWA does not render the server online status badge', () => {
  assert.doesNotMatch(pwa, /Servidor online/);
  assert.doesNotMatch(pwa, /pwa-status/);
});


test('dashboard uses the generated holographic prism and four KPI assets', () => {
  assert.match(app, /\/assets\/dashboard-prism-holographic\.webp/);
  assert.match(app, /\/assets\/kpi-revenue\.webp/);
  assert.match(app, /\/assets\/kpi-paid-orders\.webp/);
  assert.match(app, /\/assets\/kpi-packing\.webp/);
  assert.match(app, /\/assets\/kpi-critical-stock\.svg/);
  assert.match(styles, /\.dashboard-kpi-art/);
  assert.match(sw, /\/assets\/dashboard-prism-holographic\.webp/);
  assert.match(sw, /\/assets\/kpi-revenue\.webp/);
  assert.match(sw, /\/assets\/kpi-paid-orders\.webp/);
  assert.match(sw, /\/assets\/kpi-packing\.webp/);
  assert.match(sw, /\/assets\/kpi-critical-stock\.svg/);
});


test('dashboard KPI art stays secondary to text on desktop and mobile', () => {
  assert.match(styles, /\.dashboard-hero\s*\{[\s\S]*?min-height:\s*220px/);
  assert.match(styles, /\.dashboard-prism\s*\{[\s\S]*?width:\s*340px[\s\S]*?opacity:\s*\.96/);
  assert.match(styles, /\.card\.padded\.dashboard-kpi\s*\{[\s\S]*?padding:\s*22px 36% 22px 20px/);
  assert.match(styles, /\.dashboard-kpi-art\s*\{[\s\S]*?width:\s*35%[\s\S]*?max-width:\s*142px[\s\S]*?opacity:\s*\.48/);
  assert.doesNotMatch(styles, /\.dashboard-kpi-art\s*\{[\s\S]*?transform:\s*scale\(1\.18\)/);
  assert.match(styles, /@media \(max-width:\s*820px\)[\s\S]*?\.dashboard-kpi-art\s*\{[\s\S]*?width:\s*33%[\s\S]*?max-width:\s*90px[\s\S]*?opacity:\s*\.40/);
  assert.doesNotMatch(styles, /@media \(max-width:\s*820px\)[\s\S]*?\.dashboard-kpi-art\s*\{[\s\S]*?transform:\s*scale\(1\.42\)/);
});
