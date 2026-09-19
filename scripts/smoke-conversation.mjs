import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStateStore } from '../server/state-store.js';
import { createChatbotEngine } from '../server/chatbot.js';

const dir = mkdtempSync(join(tmpdir(), 'prismastore-smoke-conversation-'));
const stateStore = createStateStore({
  dbPath: join(dir, 'prismastore.db'),
  seedState: {
    products: [
      { id: 'safe-demo-a', name: 'Produto Teste A', category: 'Teste', price: 25, stock: 10, reserved: 0, active: true },
      { id: 'safe-demo-b', name: 'Produto Teste B', category: 'Teste', price: 40, stock: 10, reserved: 0, active: true },
    ],
    customers: [],
    orders: [],
  },
});

const chatbot = createChatbotEngine({
  stateStore,
  now: () => new Date('2026-09-18T22:45:00.000Z'),
});

const transcript = [];
const phone = '5511999999999@s.whatsapp.net';

async function incoming(text) {
  transcript.push({ side: 'cliente', text });
  return chatbot.handleIncoming({
    chatId: phone,
    text,
    contactName: 'Cliente Teste',
    sendText: async (value) => transcript.push({ side: 'prismastore', text: String(value) }),
    sendMedia: async () => {},
  });
}

try {
  await incoming('Oi');
  await incoming('1');
  await incoming('2');
  await incoming('2');
  await incoming('2');
  await incoming('Rua Teste, 123 - Centro - São Paulo/SP - 01000-000');
  const result = await incoming('1');

  const state = stateStore.load();
  const order = state.orders.find((candidate) => candidate.id === result.orderId);

  console.log('\n=== PrismaStore · Smoke conversation ===\n');
  for (const item of transcript) {
    const label = item.side === 'cliente' ? 'CLIENTE' : 'PRISMASTORE';
    console.log(`[${label}] ${item.text}\n`);
  }

  if (!order) throw new Error('A conversa terminou sem criar o pedido de teste.');
  if (order.status !== 'PAYMENT_PENDING') throw new Error(`Status inesperado: ${order.status}`);

  console.log('=== Resultado ===');
  console.log(`Pedido: ${order.id}`);
  console.log(`Status: ${order.status}`);
  console.log(`Itens: ${order.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')}`);
  console.log('Smoke test concluído com sucesso.');
} finally {
  stateStore.close();
  rmSync(dir, { recursive: true, force: true });
}
