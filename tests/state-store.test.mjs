import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { DEFAULT_CHATBOT_MESSAGES } from '../server/chatbot-messages.js';

function fixture() {
  return {
    products: [{ id: 'p1', name: 'Produto', stock: 4, reserved: 0 }],
    customers: [{ id: 'c1', name: 'Cliente', addresses: [] }],
    orders: [{ id: 'o1', status: 'PAID', total: 10 }],
    settings: { chatbotMessages: { ...DEFAULT_CHATBOT_MESSAGES } },
  };
}

test('initializes a new sqlite database with the provided seed state and default settings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-state-'));
  try {
    const seedState = { products: fixture().products, customers: fixture().customers, orders: fixture().orders };
    const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState });
    assert.deepEqual(store.load(), fixture());
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('merges custom chatbot messages over safe defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-settings-'));
  try {
    const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: { products: [], customers: [], orders: [] } });
    store.save({ products: [], customers: [], orders: [], settings: { chatbotMessages: { welcome: 'Oi {cliente}' } } });
    const loaded = store.load();
    assert.equal(loaded.settings.chatbotMessages.welcome, 'Oi {cliente}');
    assert.equal(loaded.settings.chatbotMessages.catalogInstruction, DEFAULT_CHATBOT_MESSAGES.catalogInstruction);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('older writes that omit settings preserve existing message configuration', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-settings-preserve-'));
  try {
    const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: { products: [], customers: [], orders: [] } });
    store.save({ products: [], customers: [], orders: [], settings: { chatbotMessages: { welcome: 'Olá customizado' } } });
    store.save({ products: [{ id: 'p1' }], customers: [], orders: [] });
    assert.equal(store.load().settings.chatbotMessages.welcome, 'Olá customizado');
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('persists state across store instances', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-state-'));
  const dbPath = join(dir, 'prismastore.db');
  try {
    const first = createStateStore({ dbPath, seedState: fixture() });
    const changed = fixture();
    changed.products[0].stock = 17;
    changed.orders.unshift({ id: 'o2', status: 'PACKING', total: 25 });
    changed.settings.chatbotMessages.welcome = 'Oi novamente';
    first.save(changed);
    first.close();
    const second = createStateStore({ dbPath, seedState: fixture() });
    assert.deepEqual(second.load(), changed);
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('persists chatbot sessions independently from operational state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-chat-session-'));
  const dbPath = join(dir, 'prismastore.db');
  try {
    const first = createStateStore({ dbPath, seedState: fixture() });
    first.saveChatSession('5511999999999', { step: 'quantity', cart: { p1: 1 } });
    first.close();
    const second = createStateStore({ dbPath, seedState: fixture() });
    assert.deepEqual(second.getChatSession('5511999999999'), { step: 'quantity', cart: { p1: 1 } });
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('updates operational state atomically through a mutator', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-state-update-'));
  try {
    const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: fixture() });
    store.updateState((state) => {
      state.customers.push({ id: 'c2', name: 'Novo cliente', addresses: [] });
      return state;
    });
    assert.equal(store.load().customers.length, 2);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('creates a consistent sqlite snapshot and can restore it into the live store', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-state-backup-'));
  const dbPath = join(dir, 'prismastore.db');
  const backupPath = join(dir, 'snapshot.db');
  try {
    const store = createStateStore({ dbPath, seedState: fixture() });
    store.saveChatSession('5511999999999', { step: 'awaiting_payment', orderId: 'o1' });
    await store.backupTo(backupPath);
    const changed = fixture();
    changed.products[0].stock = 1;
    changed.orders[0].status = 'DELIVERED';
    changed.settings.chatbotMessages.welcome = 'Mudou';
    store.save(changed);
    store.saveChatSession('5511999999999', { step: 'catalog' });
    store.restoreFrom(backupPath);
    assert.deepEqual(store.load(), fixture());
    assert.deepEqual(store.getChatSession('5511999999999'), { step: 'awaiting_payment', orderId: 'o1' });
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
