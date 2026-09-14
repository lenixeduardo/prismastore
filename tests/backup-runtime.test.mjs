import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('local server wires backup and restore service with project data and WhatsApp auth paths', () => {
  const source = readFileSync(new URL('../server/app-server.js', import.meta.url), 'utf8');
  assert.match(source, /createBackupService/);
  assert.match(source, /\.wwebjs_auth/);
  assert.match(source, /backups/);
  assert.match(source, /resolvedBackupService/);
});
