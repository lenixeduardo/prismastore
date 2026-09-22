import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/reports-ui.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('reports module loads real monthly data and exposes month selector', () => {
  assert.match(source, /\/api\/reports\/monthly\?month=/);
  assert.match(source, /type="month"/);
  assert.match(source, /Faturamento por dia/);
  assert.match(source, /Recebimento por conta/);
  assert.match(source, /America\/Sao_Paulo/);
  assert.doesNotMatch(source, /Demonstração visual/);
});

test('reports module refreshes when the reports view or order state changes', () => {
  assert.match(source, /prismastore:view-changed/);
  assert.match(source, /prismastore:state-updated/);
  assert.match(source, /prismastore:orders-updated/);
  assert.match(source, /data-report-retry/);
});

test('reports module exports the selected month through the real CSV endpoint', () => {
  assert.match(source, /\/api\/reports\/monthly\.csv\?month=/);
  assert.match(source, /data-export-report/);
  assert.match(source, /URL\.createObjectURL/);
});

test('legacy reports view no longer contains fixed september or simulated chart data', () => {
  const start = appSource.indexOf('function reportsView()');
  const end = appSource.indexOf('function chatbotView()', start);
  const block = appSource.slice(start, end);
  assert.doesNotMatch(block, /2026-09/);
  assert.doesNotMatch(block, /Demonstração visual/);
  assert.doesNotMatch(block, /const daily=/);
  assert.match(block, /Carregando relatório/);
});

test('admin index loads the real reports adapter', () => {
  assert.match(html, /src\/reports-ui\.js/);
});
