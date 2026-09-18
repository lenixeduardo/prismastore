import test from 'node:test';
import assert from 'node:assert/strict';
import { createStartupState, ensureCatalogProducts } from '../server/startup-config.js';
import { catalogProducts } from '../src/data.js';

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


test('merges required catalog products without duplicating existing products', () => {
  let state = { products: [{ id: 'existing', name: 'Existing', stock: 4 }], customers: [], orders: [] };
  const stateStore = {
    updateState(mutator) {
      state = mutator(structuredClone(state));
      return state;
    },
  };
  const changed = ensureCatalogProducts({
    stateStore,
    products: [
      { id: 'catalog-a', name: 'Catalog A', price: 10, stock: 10, reserved: 0, active: true },
      { id: 'catalog-existing-name', name: 'Existing', price: 99, stock: 10, reserved: 0, active: true },
    ],
  });
  assert.equal(changed, true);
  assert.equal(state.products.length, 2);
  assert.equal(state.products.find((product) => product.id === 'existing').stock, 4);
  assert.equal(state.products.find((product) => product.id === 'catalog-a').stock, 10);
});


test('catalog defaults keep the requested prices and stock', () => {
  assert.deepEqual(
    catalogProducts.map(({ name, price, stock }) => ({ name, price, stock })),
    [
      { name: 'Dry 5g', price: 175, stock: 10 },
      { name: 'Gisele', price: 70, stock: 20 },
      { name: '@ 4un (abacaxi)', price: 130, stock: 10 },
    ],
  );
});
