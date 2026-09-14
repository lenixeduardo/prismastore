import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';

function fixture() {
  return {
    products: [{ id: 'p1', name: 'Produto', stock: 4, reserved: 0 }],
    customers: [{ id: 'c1', name: 'Cliente', addresses: [] }],
    orders: [{ id: 'o1', status: 'PAID', total: 10 }],
  };
}

test('initializes a new sqlite database with the provided seed state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-state-'));
  try {
    const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: fixture() });
    assert.deepEqual(store.load(), fixture());
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
