import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/backup-ui.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('backup settings module lists and creates real local backups', () => {
  assert.match(source, /fetch\('\/api\/backups'/);
  assert.match(source, /method:\s*'POST'/);
  assert.match(source, /Criar backup agora/);
  assert.match(source, /WhatsApp incluído/);
});

test('backup settings module requires confirmation before restore and reloads after success', () => {
  assert.match(source, /confirm\(/);
  assert.match(source, /\/restore`/);
  assert.match(source, /window\.location\.reload/);
});

test('admin index loads backup UI and styles', () => {
  assert.match(html, /src\/backup\.css/);
  assert.match(html, /src\/backup-ui\.js/);
});
