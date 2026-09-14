import test from 'node:test';
import assert from 'node:assert/strict';
import { createStartupState } from '../server/startup-config.js';

test('runtime database starts empty unless demo mode is explicitly enabled', () => {
  const seedState = {
    products: [{ id: 'demo' }],
    customers: [{ id: 'demo-customer' }],
    orders: [{ id: 'demo-order' }],
  };
  assert.deepEqual(createStartupState({ useDemoData: false, seedState }), {
    products: [], customers: [], orders: [],
  });
  assert.deepEqual(createStartupState({ useDemoData: true, seedState }), seedState);
});
