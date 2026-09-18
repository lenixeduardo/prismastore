import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const reporter = readFileSync(new URL('../src/bug-report.js', import.meta.url), 'utf8');
const errors = readFileSync(new URL('../src/error-messages.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('sidebar exposes Reportar bug in the lower footer area', () => {
  assert.match(app, /sidebar-footer[\s\S]*data-report-bug[\s\S]*Reportar bug/);
});

test('bug report includes terminal logs and can be copied for support', () => {
  assert.match(reporter, /\/api\/debug-report/);
  assert.match(reporter, /LOG DE ERRO DO TERMINAL/);
  assert.match(reporter, /navigator\.clipboard/);
  assert.match(reporter, /data-bug-report-copy/);
  assert.match(html, /src\/bug-report\.js/);
});

test('technical network errors are translated to intuitive Portuguese messages', () => {
  assert.match(errors, /failed to fetch/i);
  assert.match(errors, /Não foi possível conectar ao PrismaStore/);
  assert.match(errors, /Sua sessão expirou/);
});
