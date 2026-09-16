import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { seedProducts, seedCustomers, seedOrders, receivingAccounts } from '../src/data.js';
import { createStateStore } from './state-store.js';
import { createChatbotEngine } from './chatbot.js';
import { createWhatsAppChatAdapter } from './whatsapp-chat-adapter.js';
import { createWhatsAppManager } from './whatsapp-manager.js';
import { createAppServer } from './app-server.js';
import { createPaymentService } from './payment-service.js';
import { createPaymentChatbot } from './payment-chatbot.js';
import { createReceiptOcr } from './receipt-ocr.js';
import { createOrderLifecycleService } from './order-lifecycle-service.js';
import { ensureBase64Asset } from './asset-loader.js';
import { createReportService } from './report-service.js';
import { createStartupState, createTerminalQrEncoder, clearLegacyDemoState } from './startup-config.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
try { process.loadEnvFile(join(root, '.env')); } catch {}
const dataDir = join(root, 'data');
const authPath = join(dataDir, 'whatsapp-auth');
const assetsDir = join(root, 'assets');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';
const useDemoData = process.env.PRISMASTORE_DEMO_DATA === 'true';
const devWhatsappOnly = process.env.PRISMASTORE_DEV_WHATSAPP_ONLY === 'true';
const devWhatsappPhone = String(process.env.PRISMASTORE_DEV_WHATSAPP_PHONE || '').trim();
const DEFAULT_PIX_KEY = '2d03d745-5b05-4829-833d-60e4a210a664';
if (devWhatsappOnly && !devWhatsappPhone) {
  throw new Error('PRISMASTORE_DEV_WHATSAPP_PHONE é obrigatório quando PRISMASTORE_DEV_WHATSAPP_ONLY=true.');
}
const logger = pino({ level: 'silent' });
const legacySeedState = {
  products: seedProducts,
  customers: seedCustomers,
  orders: seedOrders,
};

const startupState = createStartupState({
  useDemoData,
  seedState: legacySeedState,
});

const stateStore = createStateStore({
  dbPath: join(dataDir, 'prismastore.db'),
  seedState: startupState,
});
clearLegacyDemoState({ stateStore, seedState: legacySeedState, useDemoData });

const paymentService = createPaymentService({
  stateStore,
  pixConfig: {
    key: process.env.PIX_KEY || DEFAULT_PIX_KEY,
    recipientName: process.env.PIX_RECIPIENT_NAME || '',
    recipientCity: process.env.PIX_RECIPIENT_CITY || 'SAO PAULO',
    accountId: process.env.PIX_ACCOUNT_ID || 'pix-local',
  },
  qrEncoder: async (payload) => {
    const dataUrl = await QRCode.toDataURL(payload, { width: 512, margin: 2 });
    return dataUrl.split(',')[1] || null;
  },
});
const receiptOcr = createReceiptOcr();
const reportService = createReportService({ stateStore, receivingAccounts });

const baseChatbot = createChatbotEngine({
  stateStore,
  welcomeMediaPath: join(assetsDir, 'prismastore-welcome.png'),
  catalogMediaPath: join(assetsDir, 'prismastore-catalog.png'),
});
const chatbot = createPaymentChatbot({ baseChatbot, stateStore, paymentService });
const messageHandler = createWhatsAppChatAdapter({
  chatbot,
  receiptOcr,
  downloadMedia: ({ message, socket }) => downloadMediaMessage(
    message,
    'buffer',
    {},
    {
      logger,
      reuploadRequest: socket?.updateMediaMessage?.bind(socket),
    },
  ),
});

const authStateLoader = () => useMultiFileAuthState(authPath);
const socketFactory = async ({ auth }) => {
  const { version } = await fetchLatestBaileysVersion();
  return makeWASocket({
    version,
    auth,
    logger,
    printQRInTerminal: false,
    browser: ['PrismaStore', 'Chrome', '1.0.0'],
  });
};

const whatsappManager = createWhatsAppManager({
  socketFactory,
  authStateLoader,
  qrEncoder: createTerminalQrEncoder({ QRCode }),
  messageHandler: messageHandler.handleMessage,
  disconnectReasonLoggedOut: DisconnectReason.loggedOut,
  devAllowedPhone: devWhatsappOnly ? devWhatsappPhone : '',
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
  reportService,
  whatsappAuthPath: authPath,
  whatsappAuthProvider: 'baileys',
});

server.listen(port, host, () => {
  console.log(`PrismaStore disponível em http://localhost:${port}`);
  console.log(useDemoData ? 'Dados demo: ATIVOS' : 'Dados demo: DESATIVADOS');
  console.log(paymentService.getStatus().configured ? 'Pix local: CONFIGURADO' : 'Pix local: PENDENTE DE CONFIGURAÇÃO');
  if (devWhatsappOnly) console.log('WhatsApp DEV: allowlist exclusiva ATIVA');
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
