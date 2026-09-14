import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('local server wires backup and restore service with Baileys auth path and provider', () => {
  const source = readFileSync(new URL('../server/app-server.js', import.meta.url), 'utf8');
  assert.match(source, /createBackupService/);
  assert.match(source, /whatsappAuthPath/);
  assert.match(source, /join\(staticDir, 'data', 'whatsapp-auth'\)/);
  assert.match(source, /whatsappAuthProvider = 'baileys'/);
  assert.match(source, /backups/);
  assert.match(source, /resolvedBackupService/);
});
