import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { calculateCart } from '../src/domain.js';
import { catalogProducts } from '../src/data.js';
import { ensureCatalogProducts } from '../server/startup-config.js';
import { createStateStore } from '../server/state-store.js';
import { createChatbotEngine } from '../server/chatbot.js';

test('item 4 applies the requested quantity totals', () => {
  const item4 = catalogProducts[3];
  assert.equal(item4.price, 150);
  assert.equal(calculateCart([item4], { [item4.id]: 1 }).subtotal, 150);
  assert.equal(calculateCart([item4], { [item4.id]: 2 }).subtotal, 280);
  assert.equal(calculateCart([item4], { [item4.id]: 3 }).subtotal, 405);
  assert.equal(calculateCart([item4], { [item4.id]: 4 }).subtotal, 600);
  assert.equal(calculateCart([item4], { [item4.id]: 5 }).subtotal, 625);
  assert.equal(calculateCart([item4], { [item4.id]: 6 }).subtotal, 750);
});

test('catalog migration adds pricing rule to existing item 4 without changing stock', () => {
  let state = {
    products: [{ id: catalogProducts[3].id, name: catalogProducts[3].name, price: 150, stock: 7, active: true }],
    customers: [],
    orders: [],
  };
  const stateStore = {
    updateState(mutator) {
      state = mutator(structuredClone(state));
      return state;
    },
  };

  const changed = ensureCatalogProducts({ stateStore, products: catalogProducts });

  assert.equal(changed, true);
  const migrated = state.products.find((product) => product.id === catalogProducts[3].id);
  assert.equal(migrated.stock, 7);
  assert.deepEqual(migrated.quantityPricing, catalogProducts[3].quantityPricing);
});

test('chatbot persists the discounted unit price and total for 5 units of item 4', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-item4-discount-'));
  const item4 = structuredClone(catalogProducts[3]);
  const store = createStateStore({
    dbPath: join(dir, 'prismastore.db'),
    seedState: {
      products: [item4],
      customers: [{
        id: 'c-item4',
        name: 'Cliente Item 4',
        phone: '+55 11 99999-9999',
        totalSpent: 0,
        orderCount: 0,
        addresses: [],
        lastOrderAt: null,
        addressChanged: false,
      }],
      orders: [],
    },
  });
  const bot = createChatbotEngine({ stateStore: store, now: () => new Date('2026-09-21T22:57:00-03:00') });
  const sent = [];
  const incoming = (text) => bot.handleIncoming({
    chatId: '5511999999999@c.us',
    text,
    contactName: 'Cliente Item 4',
    sendText: async (value) => sent.push(value),
    sendMedia: async () => {},
  });

  try {
    await incoming('oi');
    assert.match(sent.at(-1), /2 por R\$\s*280,00/);
    assert.match(sent.at(-1), /3 por R\$\s*405,00/);
    assert.match(sent.at(-1), /5\+ por R\$\s*125,00\/un/);
    await incoming('1');
    await incoming('5');
    assert.match(sent.at(-1), /R\$\s*625,00/);

    await incoming('2');
    await incoming('2');
    await incoming('Rua Teste, 123 - São Paulo/SP - 01000-000');
    await incoming('1');

    const order = store.load().orders[0];
    assert.equal(order.total, 625);
    assert.equal(order.items[0].quantity, 5);
    assert.equal(order.items[0].unitPrice, 125);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
