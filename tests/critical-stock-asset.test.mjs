import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('dashboard uses a vector critical-stock asset and server declares WebP MIME', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../server/app-server.js', import.meta.url), 'utf8');
  const svg = readFileSync(new URL('../assets/kpi-critical-stock.svg', import.meta.url), 'utf8');

  assert.match(app, /alert:\s*['"]\/assets\/kpi-critical-stock\.svg['"]/);
  assert.match(server, /['"]\.webp['"]:\s*['"]image\/webp['"]/);
  assert.match(svg, /<svg\b/);
  assert.match(svg, /viewBox=['"]0 0 512 512['"]/);
});
