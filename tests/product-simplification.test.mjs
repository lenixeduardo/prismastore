import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seedProducts, catalogProducts } from '../src/data.js';
import { availableStock, consumeOrderStock } from '../src/domain.js';
import { normalizeProductInput } from '../src/product-editor.js';

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const adminSource = readFileSync(new URL('../src/admin-extensions.js', import.meta.url), 'utf8');

test('product definitions no longer contain category or reserved fields', () => {
  for (const product of [...seedProducts, ...catalogProducts]) {
    assert.equal('category' in product, false);
    assert.equal('reserved' in product, false);
  }
});

test('product editor creates and edits products without category or reserved fields', () => {
  const product = normalizeProductInput(
    { name: ' Produto ', category: 'Legado', price: '25,50', stock: '8', reserved: 7, active: true },
    { id: 'p-1', category: 'Antiga', reserved: 3, createdAt: '2026-09-01T00:00:00.000Z' },
    () => new Date('2026-09-21T12:00:00.000Z'),
  );

  assert.equal(product.id, 'p-1');
  assert.equal(product.name, 'Produto');
  assert.equal(product.price, 25.5);
  assert.equal(product.stock, 8);
  assert.equal('category' in product, false);
  assert.equal('reserved' in product, false);
});

test('available stock is the physical stock and ignores legacy reserved values', () => {
  assert.equal(availableStock({ stock: 5, reserved: 4 }), 5);
  assert.equal(availableStock({ stock: 0, reserved: 99 }), 0);
});

test('payment stock consumption decrements physical stock without reserved fields', () => {
  const result = consumeOrderStock(
    [{ id: 'p1', name: 'Produto', stock: 5, reserved: 4 }],
    [{ productId: 'p1', quantity: 2 }],
  );

  assert.equal(result[0].stock, 3);
  assert.equal('reserved' in result[0], false);
});

test('product UI has no category or reserved product controls or columns', () => {
  assert.doesNotMatch(adminSource, /name="category"/);
  assert.doesNotMatch(adminSource, /data\.get\('category'\)/);
  assert.doesNotMatch(appSource, /<th>Categoria<\/th>/);
  assert.doesNotMatch(appSource, /<th>Reservado<\/th>/);
  assert.doesNotMatch(appSource, /p\.reserved/);
});
