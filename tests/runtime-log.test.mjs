import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeLogBuffer } from '../server/runtime-log.js';

test('runtime log keeps recent terminal errors and redacts likely secrets', () => {
  const log = createRuntimeLogBuffer({ limit: 3 });
  log.record('erro', 'Falhou', 'token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123456789');
  log.record('aviso', 'Segundo');
  log.record('erro', new Error('Terceiro'));
  log.record('erro', 'Quarto');

  const entries = log.getRecent(10);
  assert.equal(entries.length, 3);
  assert.equal(entries.at(-1).message, 'Quarto');
  assert.match(entries[1].message, /Terceiro/);
});

test('runtime log redacts token values before exposing diagnostics', () => {
  const log = createRuntimeLogBuffer();
  log.record('erro', 'token=segredo-super-longo-123');
  assert.doesNotMatch(log.getRecent()[0].message, /segredo-super-longo-123/);
  assert.match(log.getRecent()[0].message, /REMOVIDO/);
});
