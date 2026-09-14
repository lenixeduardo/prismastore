import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/reports-ui.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('reports module loads real monthly data and exposes month selector', () => {
  assert.match(source, /\/api\/reports\/monthly\?month=/);
  assert.match(source, /type="month"/);
  assert.match(source, /Faturamento por dia/);
  assert.match(source, /Recebimento por conta/);
  assert.doesNotMatch(source, /Demonstração visual/);
});

test('reports module exports the selected month through the real CSV endpoint', () => {
  assert.match(source, /\/api\/reports\/monthly\.csv\?month=/);
  assert.match(source, /data-export-report/);
});

test('admin index loads the real reports adapter', () => {
  assert.match(html, /src\/reports-ui\.js/);
});
