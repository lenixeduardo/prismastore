import test from 'node:test';
import assert from 'node:assert/strict';
import { createStartupState, createTerminalQrEncoder } from '../server/startup-config.js';

test('starts with empty operational data unless demo mode is explicitly enabled', () => {
  const seedState = { products: [{ id: 'p1' }], customers: [{ id: 'c1' }], orders: [{ id: 'o1' }] };
  assert.deepEqual(createStartupState({ useDemoData: false, seedState }), {
    products: [], customers: [], orders: [],
  });
});

test('keeps demo data available only when demo mode is explicitly enabled', () => {
  const seedState = { products: [{ id: 'p1' }], customers: [{ id: 'c1' }], orders: [{ id: 'o1' }] };
  const result = createStartupState({ useDemoData: true, seedState });
  assert.deepEqual(result, seedState);
  assert.notEqual(result, seedState);
});

test('prints a terminal QR and still returns a browser data URL', async () => {
  const calls = [];
  const QRCode = {
    toString: async (qr, options) => { calls.push(['toString', qr, options]); return 'TERMINAL_QR'; },
    toDataURL: async (qr, options) => { calls.push(['toDataURL', qr, options]); return 'data:image/png;base64,QR'; },
  };
  const logs = [];
  const encode = createTerminalQrEncoder({ QRCode, log: (value) => logs.push(value) });
  const result = await encode('QR_PAYLOAD');

  assert.equal(result, 'data:image/png;base64,QR');
  assert.ok(logs.some((line) => String(line).includes('TERMINAL_QR')));
  assert.ok(logs.some((line) => String(line).includes('Aparelhos conectados')));
  assert.deepEqual(calls, [
    ['toString', 'QR_PAYLOAD', { type: 'terminal' }],
    ['toDataURL', 'QR_PAYLOAD', { width: 320, margin: 1 }],
  ]);
});
