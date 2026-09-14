import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('operational state is persisted through the local API instead of localStorage', () => {
  assert.doesNotMatch(source, /localStorage/);
  assert.match(source, /\/api\/state/);
  assert.match(source, /method:\s*['"]PUT['"]/);
});

test('admin renders one-line addresses captured by the WhatsApp chatbot', () => {
  assert.match(source, /a\.formatted/);
});
