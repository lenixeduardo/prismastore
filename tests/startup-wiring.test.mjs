import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');

test('server wires clean startup state with demo mode opt-in', () => {
  assert.match(source, /createStartupState/);
  assert.match(source, /PRISMASTORE_DEMO_DATA/);
  assert.match(source, /process\.env\.PRISMASTORE_DEMO_DATA\s*===\s*'true'/);
});

test('server wires QR encoder that serves browser and terminal', () => {
  assert.match(source, /createTerminalQrEncoder/);
  assert.match(source, /qrEncoder:\s*createTerminalQrEncoder\(\{\s*QRCode\s*\}\)/);
});
