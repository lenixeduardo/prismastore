import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { seedProducts, seedCustomers, seedOrders, catalogProducts, receivingAccounts } from '../src/data.js';
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
import { createBackupService } from './backup-service.js';
import { createBackupScheduler } from './backup-scheduler.js';
import { createAuthService } from './auth-service.js';
import { createGoogleDriveAccessTokenProvider, createGoogleDriveBackupStore } from './google-drive-backup.js';
import { createStartupState, createTerminalQrEncoder, clearLegacyDemoState, ensureCatalogProducts } from './startup-config.js';
import { createRuntimeLogBuffer } from './runtime-log.js';

const runtimeLog = createRuntimeLogBuffer();
runtimeLog.installConsoleCapture();

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
try { process.loadEnvFile(join(root, '.env')); } catch {}
const dataDir = join(root, 'data');
const authPath = join(dataDir, 'whatsapp-auth');
const assetsDir = join(root, 'assets');
const port = Number(process.env.PORT || 4173);
const adminUser = 'admin';
const adminPassword = String(process.env.PRISMASTORE_ADMIN_PASSWORD || '');
const requestedHost = process.env.HOST || '127.0.0.1';
const host = adminPassword ? requestedHost : '127.0.0.1';
const useDemoData = process.env.PRISMASTORE_DEMO_DATA === 'true';
const devWhatsappOnly = process.env.PRISMASTORE_DEV_WHATSAPP_ONLY === 'true';
const devWhatsappPhone = String(process.env.PRISMASTORE_DEV_WHATSAPP_PHONE || '').trim();
const DEFAULT_PIX_KEY = '2d03d745-5b05-4829-833d-60e4a210a664';
const DEFAULT_PIX_RECIPIENT_NAME = 'OSCAR FILIPE SILVA DOS SANTOS';
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
ensureCatalogProducts({ stateStore, products: catalogProducts });

const paymentService = createPaymentService({
  stateStore,
  pixConfig: {
    key: process.env.PIX_KEY || DEFAULT_PIX_KEY,
    recipientName: process.env.PIX_RECIPIENT_NAME || DEFAULT_PIX_RECIPIENT_NAME,
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
    browser: Browsers.macOS('Desktop'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
};

const whatsappManager = createWhatsAppManager({
  socketFactory,
  authStateLoader,
  qrEncoder: createTerminalQrEncoder({ QRCode }),
  messageHandler: messageHandler.handleMessage,
  disconnectReasonLoggedOut: DisconnectReason.loggedOut,
  disconnectReasonRestartRequired: DisconnectReason.restartRequired,
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

const authService = adminPassword
  ? createAuthService({ username: adminUser, password: adminPassword })
  : null;

const driveClientId = String(process.env.GOOGLE_DRIVE_CLIENT_ID || '');
const driveClientSecret = String(process.env.GOOGLE_DRIVE_CLIENT_SECRET || '');
const driveRefreshToken = String(process.env.GOOGLE_DRIVE_REFRESH_TOKEN || '');
const driveConfigured = Boolean(driveClientId && driveClientSecret && driveRefreshToken);
const driveRetentionCount = Math.max(1, Number(process.env.GOOGLE_DRIVE_BACKUP_RETENTION || 30));
const driveAccessTokenProvider = driveConfigured
  ? createGoogleDriveAccessTokenProvider({
      clientId: driveClientId,
      clientSecret: driveClientSecret,
      refreshToken: driveRefreshToken,
    })
  : null;
const externalBackupStore = createGoogleDriveBackupStore({
  enabled: driveConfigured,
  accessTokenProvider: driveAccessTokenProvider,
  folderName: process.env.GOOGLE_DRIVE_BACKUP_FOLDER || 'PrismaStore Backups',
  retentionCount: driveRetentionCount,
});

let backupScheduler = null;
const backupService = createBackupService({
  stateStore,
  whatsappManager,
  authPath,
  whatsappAuthProvider: 'baileys',
  backupsDir: join(root, 'backups'),
  appVersion: '0.9.2',
  externalBackupStore,
  scheduleStatusProvider: () => backupScheduler?.getStatus() ?? {
    enabled: driveConfigured,
    running: false,
    intervalHours: Number(process.env.PRISMASTORE_BACKUP_INTERVAL_HOURS || 24),
    lastSuccessAt: null,
    lastError: null,
  },
});

if (driveConfigured) {
  const intervalHours = Math.max(1, Number(process.env.PRISMASTORE_BACKUP_INTERVAL_HOURS || 24));
  backupScheduler = createBackupScheduler({
    backupService,
    intervalMs: intervalHours * 60 * 60 * 1000,
  });
  backupScheduler.start();
}

const server = createAppServer({
  stateStore,
  staticDir: root,
  whatsappManager,
  paymentService,
  orderLifecycleService,
  reportService,
  backupService,
  whatsappAuthPath: authPath,
  whatsappAuthProvider: 'baileys',
  authService,
  runtimeLogProvider: runtimeLog,
  appVersion: '0.9.2',
});

server.listen(port, host, () => {
  console.log(`PrismaStore disponível em http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  console.log(paymentService.getStatus().configured ? 'Pix Oscar: CONFIGURADO' : 'Pix Oscar: PENDENTE DE CONFIGURAÇÃO');
  console.log(authService ? `Admin protegido: ${adminUser}` : 'Admin: sem senha; acesso restrito ao próprio dispositivo (127.0.0.1)');
  console.log(driveConfigured ? `Backup Google Drive: AUTOMÁTICO · retenção ${driveRetentionCount}` : 'Backup Google Drive: PENDENTE DE CONFIGURAÇÃO');
  if (devWhatsappOnly) console.log('WhatsApp DEV: allowlist exclusiva ATIVA');
});

if (process.env.WHATSAPP_AUTO_CONNECT === 'true') {
  whatsappManager.connect().catch((error) => console.error('Falha ao iniciar WhatsApp:', error));
}

async function shutdown() {
  backupScheduler?.stop();
  try { await whatsappManager.disconnect(); } catch {}
  stateStore.close();
  server.close(() => process.exit(0));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
