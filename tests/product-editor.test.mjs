import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProductInput } from '../src/product-editor.js';

test('normalizes a new real product with audit fields', () => {
  const product = normalizeProductInput(
    { name: ' Seda King ', price: '7,50', stock: '12', active: true },
    null,
    () => new Date('2026-09-14T20:00:00.000Z'),
    () => 'uuid-1',
  );
  assert.deepEqual(product, {
    id: 'p-uuid-1', name: 'Seda King', price: 7.5, stock: 12,
    active: true, createdAt: '2026-09-14T20:00:00.000Z', updatedAt: '2026-09-14T20:00:00.000Z',
  });
});

test('editing preserves id and creation timestamp while dropping legacy fields', () => {
  const existing = { id: 'p-1', name: 'Antigo', category: 'A', price: 4, stock: 5, reserved: 2, active: true, createdAt: '2026-09-01T00:00:00.000Z' };
  const product = normalizeProductInput({ name: 'Novo', price: '8.9', stock: '9', active: false }, existing, () => new Date('2026-09-14T20:00:00.000Z'));
  assert.equal(product.id, 'p-1');
  assert.equal('category' in product, false);
  assert.equal('reserved' in product, false);
  assert.equal(product.createdAt, '2026-09-01T00:00:00.000Z');
  assert.equal(product.updatedAt, '2026-09-14T20:00:00.000Z');
  assert.equal(product.active, false);
});

test('rejects invalid real product input', () => {
  assert.throws(() => normalizeProductInput({ name: '', price: '-1', stock: '-2' }), /Nome do produto/);
  assert.throws(() => normalizeProductInput({ name: 'Produto', price: '-1', stock: '2' }), /Preço/);
  assert.throws(() => normalizeProductInput({ name: 'Produto', price: '1', stock: '2.5' }), /Estoque/);
});


test('defaults unspecified stock to ten units', () => {
  const product = normalizeProductInput(
    { name: 'Produto padrão', price: '25', stock: '' },
    null,
    () => new Date('2026-09-18T22:00:00.000Z'),
    () => 'uuid-default-stock',
  );
  assert.equal(product.stock, 10);
});
