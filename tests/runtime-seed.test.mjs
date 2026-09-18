import test from 'node:test';
import assert from 'node:assert/strict';
import { createStartupState, ensureCatalogProducts } from '../server/startup-config.js';

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
