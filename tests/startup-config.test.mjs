import test from 'node:test';
import assert from 'node:assert/strict';
import { createStartupState, createTerminalQrEncoder, clearLegacyDemoState } from '../server/startup-config.js';

test('starts with empty operational data unless demo mode is explicitly enabled', () => {
  const seedState = { products: [{ id: 'p1' }], customers: [{ id: 'c1' }], orders: [{ id: 'o1' }] };
  assert.deepEqual(createStartupState({ useDemoData: false, seedState }), { products: [], customers: [], orders: [] });
});

test('keeps demo data available only when demo mode is explicitly enabled', () => {
  const seedState = { products: [{ id: 'p1' }], customers: [{ id: 'c1' }], orders: [{ id: 'o1' }] };
  const result = createStartupState({ useDemoData: true, seedState });
  assert.deepEqual(result, seedState);
  assert.notEqual(result, seedState);
});

test('clears persisted legacy demo data only when it still exactly matches the old seed', () => {
  const seedState = { products: [{ id: 'p1' }], customers: [{ id: 'c1' }], orders: [{ id: 'o1' }] };
  let saved = null;
  const stateStore = { load: () => structuredClone(seedState), save: (value) => { saved = structuredClone(value); return value; } };
  const result = clearLegacyDemoState({ stateStore, seedState, useDemoData: false });
  assert.equal(result, true);
  assert.deepEqual(saved, { products: [], customers: [], orders: [] });
});

test('never clears changed or real persisted data', () => {
  const seedState = { products: [{ id: 'p1' }], customers: [{ id: 'c1' }], orders: [{ id: 'o1' }] };
  const current = { ...structuredClone(seedState), products: [{ id: 'real-product' }] };
  let saves = 0;
  const stateStore = { load: () => current, save: () => { saves += 1; } };
  assert.equal(clearLegacyDemoState({ stateStore, seedState, useDemoData: false }), false);
  assert.equal(saves, 0);
});

test('prints a compact terminal QR and still returns a browser data URL', async () => {
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
    ['toString', 'QR_PAYLOAD', { type: 'terminal', small: true }],
    ['toDataURL', 'QR_PAYLOAD', { width: 320, margin: 1 }],
  ]);
});
