import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import whatsappWeb from 'whatsapp-web.js';
import QRCode from 'qrcode';
import { seedProducts, seedCustomers, seedOrders } from '../src/data.js';
import { createStateStore } from './state-store.js';
import { createChatbotEngine } from './chatbot.js';
import { createWhatsAppChatAdapter } from './whatsapp-chat-adapter.js';
import { createWhatsAppManager } from './whatsapp-manager.js';
import { createAppServer } from './app-server.js';

const { Client, LocalAuth, MessageMedia } = whatsappWeb;
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dataDir = join(root, 'data');
const authPath = join(root, '.wwebjs_auth');
const assetsDir = join(root, 'assets');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';

const stateStore = createStateStore({
  dbPath: join(dataDir, 'prismastore.db'),
  seedState: {
    products: structuredClone(seedProducts),
    customers: structuredClone(seedCustomers),
    orders: structuredClone(seedOrders),
  },
});

const chatbot = createChatbotEngine({
  stateStore,
  welcomeMediaPath: join(assetsDir, 'prismastore-welcome.png'),
  catalogMediaPath: join(assetsDir, 'prismastore-catalog.png'),
});

const messageHandler = createWhatsAppChatAdapter({
  chatbot,
  mediaFactory: MessageMedia,
});

const whatsappManager = createWhatsAppManager({
  clientFactory: () => new Client({
    authStrategy: new LocalAuth({
      clientId: 'prismastore-main',
      dataPath: authPath,
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  }),
  qrEncoder: (qr) => QRCode.toDataURL(qr, { width: 320, margin: 1 }),
  messageHandler,
});

const server = createAppServer({ stateStore, staticDir: root, whatsappManager });

server.listen(port, host, () => {
  console.log(`PrismaStore disponível em http://localhost:${port}`);
});

if (process.env.WHATSAPP_AUTO_CONNECT !== 'false') {
  whatsappManager.connect().catch((error) => console.error('Falha ao iniciar WhatsApp:', error));
}

async function shutdown() {
  try { await whatsappManager.disconnect(); } catch {}
  stateStore.close();
  server.close(() => process.exit(0));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
