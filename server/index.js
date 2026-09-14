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
import { createAsaasClient } from './asaas-client.js';
import { createPaymentService } from './payment-service.js';
import { createPaymentChatbot } from './payment-chatbot.js';
import { createOrderLifecycleService } from './order-lifecycle-service.js';
import { ensureBase64Asset } from './asset-loader.js';

const { Client, LocalAuth, MessageMedia } = whatsappWeb;
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
try { process.loadEnvFile(join(root, '.env')); } catch {}
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


const asaasClient = createAsaasClient({
  apiKey: process.env.ASAAS_API_KEY || '',
  baseUrl: process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3',
});
const paymentService = createPaymentService({ stateStore, asaasClient });

const baseChatbot = createChatbotEngine({
  stateStore,
  welcomeMediaPath: join(assetsDir, 'prismastore-welcome.png'),
  catalogMediaPath: join(assetsDir, 'prismastore-catalog.png'),
});
const chatbot = createPaymentChatbot({ baseChatbot, stateStore, paymentService });

const messageHandler = createWhatsAppChatAdapter({
  chatbot,
  mediaFactory: {
    fromFilePath: (path) => MessageMedia.fromFilePath(path),
    fromBase64: ({ mimeType, base64, filename }) => new MessageMedia(mimeType, base64, filename),
  },
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
  mediaFactory: { fromFilePath: (path) => MessageMedia.fromFilePath(path) },
});


const finalArtworkPath = ensureBase64Asset({
  base64Path: join(assetsDir, 'prismastore-order-finished.b64'),
  outputPath: join(dataDir, 'prismastore-order-finished.png'),
});

const orderLifecycleService = createOrderLifecycleService({
  stateStore,
  messenger: whatsappManager,
  finalArtworkPath,
});

const server = createAppServer({
  stateStore,
  staticDir: root,
  whatsappManager,
  paymentService,
  orderLifecycleService,
  asaasWebhookToken: process.env.ASAAS_WEBHOOK_TOKEN || '',
});

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
