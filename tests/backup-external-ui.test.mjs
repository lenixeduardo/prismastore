import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/backup-ui.js', import.meta.url), 'utf8');

test('backup settings surface Google Drive external sync state', () => {
  assert.match(source, /Google Drive/);
  assert.match(source, /external\.status/);
  assert.match(source, /syncedAt/);
  assert.match(source, /external\.error/);
  assert.match(source, /Sincronizado|Sincronizado no Drive/);
});

test('backup UI preserves local backup and restore controls', () => {
  assert.match(source, /Criar backup agora/);
  assert.match(source, /data-restore-backup/);
  assert.match(source, /\/api\/backups/);
});
