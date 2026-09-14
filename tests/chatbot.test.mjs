import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { createChatbotEngine } from '../server/chatbot.js';

function seed() {
  return {
    products: [
      { id: 'p1', name: 'Produto A', category: 'Categoria', price: 10, stock: 5, reserved: 0, active: true },
      { id: 'p2', name: 'Produto B', category: 'Categoria', price: 20, stock: 2, reserved: 0, active: true },
    ],
    customers: [],
    orders: [],
  };
}

function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-chatbot-'));
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: seed() });
  const sent = [];
  const bot = createChatbotEngine({
    stateStore: store,
    welcomeMediaPath: '/assets/welcome.png',
    catalogMediaPath: '/assets/catalog.png',
    now: () => new Date('2026-09-14T12:00:00.000Z'),
  });
  const sendText = async (text) => sent.push({ type: 'text', text });
  const sendMedia = async (path) => sent.push({ type: 'media', path });
  const incoming = (text, overrides = {}) => bot.handleIncoming({
    chatId: '5511999999999@c.us',
    text,
    contactName: 'Eduardo',
    sendText,
    sendMedia,
    ...overrides,
  });
  return { dir, store, bot, sent, incoming, cleanup: () => { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test('first private message registers the customer and sends welcome plus catalog', async () => {
  const h = harness();
  try {
    await h.incoming('Oi');
    assert.deepEqual(h.sent.slice(0, 4).map((item) => item.type), ['media', 'text', 'media', 'text']);
    assert.equal(h.sent[0].path, '/assets/welcome.png');
    assert.equal(h.sent[2].path, '/assets/catalog.png');
    assert.match(h.sent[1].text, /Eduardo/);
    assert.match(h.sent[3].text, /1\. Produto A/);
    assert.match(h.sent[3].text, /2\. Produto B/);

    const state = h.store.load();
    assert.equal(state.customers.length, 1);
    assert.equal(state.customers[0].phone, '+5511999999999');
    assert.equal(state.customers[0].name, 'Eduardo');
    assert.equal(h.store.getChatSession('5511999999999').step, 'catalog');
  } finally { h.cleanup(); }
});

test('chatbot guides item, quantity, delivery, address and confirmation without commands', async () => {
  const h = harness();
  try {
    await h.incoming('Oi');
    h.sent.length = 0;

    await h.incoming('1');
    assert.equal(h.store.getChatSession('5511999999999').step, 'quantity');
    assert.match(h.sent.at(-1).text, /quantas unidades/i);

    await h.incoming('2');
    assert.equal(h.store.getChatSession('5511999999999').step, 'cart_action');
    assert.match(h.sent.at(-1).text, /Adicionar outro item/i);

    await h.incoming('2');
    assert.equal(h.store.getChatSession('5511999999999').step, 'delivery');
    assert.match(h.sent.at(-1).text, /1.*Envio/s);

    await h.incoming('2');
    assert.equal(h.store.getChatSession('5511999999999').step, 'address_input');
    assert.match(h.sent.at(-1).text, /endereço completo/i);

    await h.incoming('Rua Exemplo, 123 - Centro - São Paulo/SP - 01000-000');
    assert.equal(h.store.getChatSession('5511999999999').step, 'confirm');
    assert.match(h.sent.at(-1).text, /CONFIRME SEU PEDIDO/i);
    assert.match(h.sent.at(-1).text, /R\$\s*20,00/);

    await h.incoming('1');
    const session = h.store.getChatSession('5511999999999');
    assert.equal(session.step, 'confirmed');
    assert.ok(session.confirmedAt);
    assert.match(h.sent.at(-1).text, /pedido confirmado/i);

    const customer = h.store.load().customers[0];
    assert.equal(customer.addresses.length, 1);
    assert.equal(customer.addresses[0].formatted, 'Rua Exemplo, 123 - Centro - São Paulo/SP - 01000-000');
  } finally { h.cleanup(); }
});

test('existing customer can reuse the most recent address', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-chatbot-address-'));
  const initial = seed();
  initial.customers.push({
    id: 'c1', name: 'Eduardo', phone: '+55 11 99999-9999', totalSpent: 0, orderCount: 0,
    addresses: [{ formatted: 'Rua Salva, 10 - São Paulo/SP', usedAt: '2026-09-01' }],
    lastOrderAt: null, addressChanged: false,
  });
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: initial });
  const sent = [];
  const bot = createChatbotEngine({ stateStore: store, now: () => new Date('2026-09-14T12:00:00.000Z') });
  const sendText = async (text) => sent.push(text);
  try {
    for (const text of ['Oi', '1', '1', '2', '1']) {
      await bot.handleIncoming({ chatId: '5511999999999@c.us', text, contactName: 'Eduardo', sendText, sendMedia: async () => {} });
    }
    assert.equal(store.getChatSession('5511999999999').step, 'address_choice');
    assert.match(sent.at(-1), /Rua Salva, 10/);
    await bot.handleIncoming({ chatId: '5511999999999@c.us', text: '1', contactName: 'Eduardo', sendText, sendMedia: async () => {} });
    assert.equal(store.getChatSession('5511999999999').step, 'confirm');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('invalid quantity does not advance and explains available stock', async () => {
  const h = harness();
  try {
    await h.incoming('Oi');
    await h.incoming('2');
    h.sent.length = 0;
    await h.incoming('3');
    assert.equal(h.store.getChatSession('5511999999999').step, 'quantity');
    assert.match(h.sent.at(-1).text, /até 2 unidade/i);
  } finally { h.cleanup(); }
});

test('group messages are ignored', async () => {
  const h = harness();
  try {
    const result = await h.incoming('Oi', { chatId: '120363000000@g.us' });
    assert.equal(result.handled, false);
    assert.equal(h.sent.length, 0);
    assert.equal(h.store.load().customers.length, 0);
  } finally { h.cleanup(); }
});

test('does not let repeated cart additions exceed current available stock', async () => {
  const h = harness();
  try {
    await h.incoming('Oi');
    await h.incoming('1');
    await h.incoming('4');
    await h.incoming('1');
    await h.incoming('1');
    h.sent.length = 0;
    await h.incoming('2');
    const session = h.store.getChatSession('5511999999999');
    assert.equal(session.step, 'quantity');
    assert.equal(session.cart.p1, 4);
    assert.match(h.sent.at(-1).text, /1 unidade.*restante/i);
  } finally { h.cleanup(); }
});

test('continues by text when a visual asset cannot be sent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-chatbot-media-fallback-'));
  const store = createStateStore({ dbPath: join(dir, 'prismastore.db'), seedState: seed() });
  const sent = [];
  const bot = createChatbotEngine({
    stateStore: store,
    welcomeMediaPath: '/missing/welcome.png',
    catalogMediaPath: '/missing/catalog.png',
    now: () => new Date('2026-09-14T12:00:00.000Z'),
  });
  try {
    await bot.handleIncoming({
      chatId: '5511999999999@c.us',
      text: 'Oi',
      contactName: 'Eduardo',
      sendText: async (text) => sent.push(text),
      sendMedia: async () => { throw new Error('arquivo ausente'); },
    });
    assert.equal(store.getChatSession('5511999999999').step, 'catalog');
    assert.equal(sent.length, 2);
    assert.match(sent[0], /Bem-vindo/);
    assert.match(sent[1], /CARDÁPIO PRISMA STORE/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
