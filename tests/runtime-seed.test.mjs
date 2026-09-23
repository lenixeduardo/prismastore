import test from 'node:test';
import assert from 'node:assert/strict';
import { createStartupState, ensureCatalogProducts, ensureBootstrapOrders } from '../server/startup-config.js';
import { catalogProducts, bootstrapOrders } from '../src/data.js';

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
      { name: 'Eduardo teste', price: 0.01, stock: 3 },
      { name: 'Dry 5g', price: 175, stock: 10 },
      { name: 'Gisele', price: 70, stock: 20 },
      { name: '@ 4un (abacaxi)', price: 130, stock: 10 },
      { name: 'Item A', price: 150, stock: 10 },
      { name: 'Item B', price: 175, stock: 10 },
      { name: 'Item C', price: 125, stock: 10 },
      { name: 'Item D', price: 60, stock: 10 },
      { name: 'Item E', price: 130, stock: 10 },
      { name: 'Item F', price: 150, stock: 10 },
      { name: 'Item G', price: 100, stock: 10 },
    ],
  );
});


test('persists two completed Eduardo teste orders once and consumes their stock', () => {
  let state = {
    products: [{ id: 'catalog-eduardo-teste', name: 'Eduardo teste', price: 0.01, stock: 3, active: true }],
    customers: [],
    orders: [],
  };
  const stateStore = {
    updateState(mutator) {
      state = mutator(structuredClone(state));
      return state;
    },
  };

  assert.equal(ensureBootstrapOrders({ stateStore, orders: bootstrapOrders }), true);
  assert.equal(state.orders.length, 2);
  assert.deepEqual(state.orders.map((order) => order.status), ['DELIVERED', 'DELIVERED']);
  assert.ok(state.orders.every((order) => order.items.length === 1 && order.items[0].name === 'Eduardo teste'));
  assert.equal(state.products[0].stock, 1);

  assert.equal(ensureBootstrapOrders({ stateStore, orders: bootstrapOrders }), false);
  assert.equal(state.orders.length, 2);
  assert.equal(state.products[0].stock, 1);
});
