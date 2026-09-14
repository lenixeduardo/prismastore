import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStateStore } from '../server/state-store.js';
import { createChatbotEngine } from '../server/chatbot.js';

function makeHarness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prismastore-step4-'));
  const store = createStateStore({
    dbPath: path.join(dir, 'db.sqlite'),
    seedState: {
      products: [{ id: 'p1', name: 'Produto A', category: 'Teste', price: 10, stock: 3, reserved: 0, active: true }],
      customers: [],
      orders: [],
    },
  });
  const bot = createChatbotEngine({ stateStore: store, now: () => new Date('2026-09-14T12:00:00Z') });
  const sent = [];
  const incoming = (text) => bot.handleIncoming({
    chatId: '5511999999999@c.us', text, contactName: 'Cliente Teste',
    sendText: async (message) => sent.push(message), sendMedia: async () => {},
  });
  return { store, incoming, sent, close: () => store.close() };
}

async function reachConfirmation(h) {
  await h.incoming('oi');
  await h.incoming('1');
  await h.incoming('2');
  await h.incoming('2');
  await h.incoming('2');
  await h.incoming('Rua Teste, 123 - São Paulo/SP - 01000-000');
}

test('Passo 4 cria pedido PAYMENT_PENDING e reserva o estoque ao confirmar', async () => {
  const h = makeHarness();
  try {
    await reachConfirmation(h);
    await h.incoming('1');
    const state = h.store.load();
    assert.equal(state.orders.length, 1);
    assert.equal(state.orders[0].status, 'PAYMENT_PENDING');
    assert.equal(state.products[0].reserved, 2);
    assert.equal(state.orders[0].source, 'whatsapp');
  } finally { h.close(); }
});

test('Passo 4 não duplica pedido nem reserva para o mesmo checkout', async () => {
  const h = makeHarness();
  try {
    await reachConfirmation(h);
    await h.incoming('1');
    const session = h.store.getChatSession('5511999999999');
    session.step = 'confirm';
    h.store.saveChatSession('5511999999999', session);
    await h.incoming('1');
    const state = h.store.load();
    assert.equal(state.orders.length, 1);
    assert.equal(state.products[0].reserved, 2);
  } finally { h.close(); }
});

test('módulo live-sync consulta o estado local e atualiza automaticamente quando ele muda', () => {
  const source = fs.readFileSync(new URL('../src/live-sync.js', import.meta.url), 'utf8');
  assert.match(source, /fetch\('\/api\/state'/);
  assert.match(source, /setInterval\(checkForServerChanges, 2000\)/);
  assert.match(source, /window\.location\.reload\(\)/);
});
