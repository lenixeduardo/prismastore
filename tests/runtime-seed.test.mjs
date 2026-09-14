import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');

test('runtime database starts without demo products customers or orders', () => {
  assert.doesNotMatch(source, /seedProducts/);
  assert.doesNotMatch(source, /seedCustomers/);
  assert.doesNotMatch(source, /seedOrders/);
  assert.match(source, /products:\s*\[\]/);
  assert.match(source, /customers:\s*\[\]/);
  assert.match(source, /orders:\s*\[\]/);
});
