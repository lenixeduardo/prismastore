import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { createChatbotEngine } from '../server/chatbot.js';

test('chatbot uses persisted custom welcome catalog and quantity messages', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-custom-chat-'));
  const store = createStateStore({
    dbPath: join(dir, 'prismastore.db'),
    seedState: {
      products: [{ id: 'p1', name: 'Seda Real', category: 'Sedas', price: 8, stock: 4, reserved: 0, active: true }],
      customers: [], orders: [],
      settings: { chatbotMessages: {
        welcome: 'Olá {cliente}, atendimento Prisma.',
        catalogHeader: '*PRODUTOS REAIS*',
        catalogInstruction: 'Digite o número.',
        quantityPrompt: '{produto}: escolha a quantidade. Estoque {estoque}.',
      } },
    },
  });
  const sent = [];
  const bot = createChatbotEngine({ stateStore: store, now: () => new Date('2026-09-14T20:00:00Z') });
  const args = (text) => ({ chatId: '5511999999999@c.us', text, contactName: 'Eduardo', sendText: async (value) => sent.push(value), sendMedia: async () => {} });
  try {
    await bot.handleIncoming(args('Oi'));
    assert.equal(sent[0], 'Olá Eduardo, atendimento Prisma.');
    assert.match(sent[1], /PRODUTOS REAIS/);
    assert.match(sent[1], /1\. Seda Real/);
    sent.length = 0;
    await bot.handleIncoming(args('1'));
    assert.equal(sent.at(-1), 'Seda Real: escolha a quantidade. Estoque 4.');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('inactive and out-of-stock products do not appear in the WhatsApp catalog', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prismastore-real-catalog-'));
  const store = createStateStore({
    dbPath: join(dir, 'prismastore.db'),
    seedState: {
      products: [
        { id: 'p1', name: 'Ativo', price: 10, stock: 2, reserved: 0, active: true },
        { id: 'p2', name: 'Desativado', price: 10, stock: 10, reserved: 0, active: false },
        { id: 'p3', name: 'Sem estoque', price: 10, stock: 1, reserved: 1, active: true },
      ], customers: [], orders: [],
    },
  });
  const sent = [];
  const bot = createChatbotEngine({ stateStore: store });
  try {
    await bot.handleIncoming({ chatId: '5511888888888@c.us', text: 'Oi', contactName: 'Cliente', sendText: async (value) => sent.push(value), sendMedia: async () => {} });
    const catalog = sent.at(-1);
    assert.match(catalog, /Ativo/);
    assert.doesNotMatch(catalog, /Desativado/);
    assert.doesNotMatch(catalog, /Sem estoque/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
