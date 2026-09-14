import { classifyInboundJid, normalizeOutboundJid, phoneFromJid } from './whatsapp-jid.js';

function accountFromSocket(socket) {
  if (!socket?.user) return null;
  return {
    name: socket.user.name || socket.user.notify || null,
    number: phoneFromJid(socket.user.id || '') || null,
  };
}

function disconnectStatusCode(lastDisconnect) {
  return lastDisconnect?.error?.output?.statusCode ?? lastDisconnect?.error?.statusCode ?? null;
}

export function createWhatsAppManager({
  socketFactory,
  authStateLoader,
  qrEncoder,
  messageHandler = null,
  disconnectReasonLoggedOut,
  reconnectDelayMs = 3000,
  schedule = setTimeout,
  clearSchedule = clearTimeout,
  maxSeenMessageIds = 1000,
}) {
  let socket = null;
  let reconnectTimer = null;
  let manualDisconnect = false;
  let status = { status: 'disconnected', qrDataUrl: null, account: null, error: null };
  const seenIds = new Set();
  const seenQueue = [];

  function setStatus(patch) {
    status = { ...status, ...patch };
  }

  function getStatus() {
    return structuredClone(status);
  }

  function markSeen(id) {
    if (!id) return true;
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    seenQueue.push(id);
    while (seenQueue.length > maxSeenMessageIds) {
      const oldest = seenQueue.shift();
      if (oldest) seenIds.delete(oldest);
    }
    return true;
  }

  function clearReconnect() {
    if (!reconnectTimer) return;
    clearSchedule(reconnectTimer);
    reconnectTimer = null;
  }

  function scheduleReconnectOnce() {
    if (manualDisconnect || reconnectTimer) return;
    reconnectTimer = schedule(() => {
      reconnectTimer = null;
      connect().catch((error) => {
        setStatus({ status: 'error', error: error instanceof Error ? error.message : 'Falha ao reconectar WhatsApp' });
      });
    }, reconnectDelayMs);
  }

  async function connect() {
    if (socket && ['connecting', 'qr', 'authenticated', 'connected'].includes(status.status)) {
      return getStatus();
    }

    manualDisconnect = false;
    clearReconnect();
    setStatus({ status: 'connecting', qrDataUrl: null, account: null, error: null });

    const { state, saveCreds } = await authStateLoader();
    const activeSocket = await socketFactory({ auth: state });
    socket = activeSocket;

    activeSocket.ev.on('creds.update', saveCreds);

    activeSocket.ev.on('connection.update', async (update = {}) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await qrEncoder(qr);
          setStatus({ status: 'qr', qrDataUrl, account: null, error: null });
        } catch (error) {
          setStatus({ status: 'error', qrDataUrl: null, account: null, error: error instanceof Error ? error.message : 'Falha ao gerar QR Code' });
        }
      }

      if (connection === 'open') {
        clearReconnect();
        setStatus({ status: 'connected', qrDataUrl: null, account: accountFromSocket(activeSocket), error: null });
      }

      if (connection === 'close') {
        if (socket === activeSocket) socket = null;
        const loggedOut = disconnectStatusCode(lastDisconnect) === disconnectReasonLoggedOut;
        setStatus({
          status: 'disconnected',
          qrDataUrl: null,
          account: null,
          error: loggedOut ? 'Sessão do WhatsApp encerrada.' : null,
        });
        if (!loggedOut) scheduleReconnectOnce();
      }
    });

    activeSocket.ev.on('messages.upsert', async ({ messages, type } = {}) => {
      if (type !== 'notify') return;
      for (const message of messages ?? []) {
        if (message?.key?.fromMe) continue;
        if (!message?.message) continue;
        const jid = message?.key?.remoteJid ?? '';
        if (!classifyInboundJid(jid).supported) continue;
        if (!markSeen(message?.key?.id)) continue;
        if (messageHandler) await messageHandler({ message, socket: activeSocket });
      }
    });

    return getStatus();
  }

  async function disconnect() {
    manualDisconnect = true;
    clearReconnect();
    const activeSocket = socket;
    socket = null;
    if (activeSocket?.end) {
      await Promise.resolve(activeSocket.end(new Error('PrismaStore desconectado')));
    }
    setStatus({ status: 'disconnected', qrDataUrl: null, account: null, error: null });
    return getStatus();
  }

  async function sendText(phoneOrJid, text) {
    if (!socket || status.status !== 'connected') throw new Error('WhatsApp não conectado.');
    return socket.sendMessage(normalizeOutboundJid(phoneOrJid), { text: String(text) });
  }

  async function sendMedia(phoneOrJid, source) {
    if (!socket || status.status !== 'connected') throw new Error('WhatsApp não conectado.');
    const jid = normalizeOutboundJid(phoneOrJid);
    if (typeof source === 'string') return socket.sendMessage(jid, { image: { url: source } });
    if (source?.base64) {
      return socket.sendMessage(jid, {
        image: Buffer.from(source.base64, 'base64'),
        mimetype: source.mimeType || 'image/png',
        fileName: source.filename || 'imagem.png',
      });
    }
    throw new Error('Mídia do WhatsApp inválida.');
  }

  return { connect, disconnect, getStatus, sendText, sendMedia };
}
