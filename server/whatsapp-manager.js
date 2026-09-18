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

function canonicalDevPhone(value = '') {
  const phone = phoneFromJid(String(value));
  if (!phone) return '';
  if (phone.length === 10 || phone.length === 11) return `55${phone}`;
  return phone;
}

function normalizePairingPhone(value = '') {
  let phone = String(value).replace(/\D/g, '');
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
  if (phone.length < 12 || phone.length > 15) throw new Error('Informe um telefone válido com DDD para vincular o WhatsApp.');
  return phone;
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
  devAllowedPhone = '',
}) {
  let socket = null;
  let connectPromise = null;
  let reconnectTimer = null;
  let manualDisconnect = false;
  let status = { status: 'disconnected', qrDataUrl: null, pairingCode: null, account: null, error: null };
  const seenIds = new Set();
  const seenQueue = [];
  const allowedPhone = canonicalDevPhone(devAllowedPhone);
  const allowedJids = new Set();

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

  function isAllowedDevMessage(message) {
    if (!allowedPhone) return true;
    const primaryJid = message?.key?.remoteJid ?? '';
    const alternateJid = message?.key?.remoteJidAlt ?? '';
    const matches = [primaryJid, alternateJid]
      .filter(Boolean)
      .some((jid) => canonicalDevPhone(jid) === allowedPhone);
    if (matches && primaryJid) allowedJids.add(primaryJid);
    return matches;
  }

  function normalizeDevOutboundRecipient(phoneOrJid) {
    const jid = normalizeOutboundJid(phoneOrJid);
    if (!allowedPhone) return jid;
    if (allowedJids.has(jid)) return jid;
    if (canonicalDevPhone(jid) !== allowedPhone) {
      throw new Error('Modo DEV: destinatário fora da allowlist do WhatsApp.');
    }
    return `${allowedPhone}@s.whatsapp.net`;
  }

  async function performConnect() {
    manualDisconnect = false;
    clearReconnect();
    const pendingPairingCode = status.pairingCode || null;
    setStatus({
      status: pendingPairingCode ? 'pairing' : 'connecting',
      qrDataUrl: null,
      pairingCode: pendingPairingCode,
      account: null,
      error: null,
    });

    try {
      const { state, saveCreds } = await authStateLoader();
      const activeSocket = await socketFactory({ auth: state });
      socket = activeSocket;

      activeSocket.ev.on('creds.update', saveCreds);

      activeSocket.ev.on('connection.update', async (update = {}) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const qrDataUrl = await qrEncoder(qr);
            setStatus({ status: status.pairingCode ? 'pairing' : 'qr', qrDataUrl, account: null, error: null });
          } catch (error) {
            setStatus({ status: 'error', qrDataUrl: null, pairingCode: null, account: null, error: error instanceof Error ? error.message : 'Falha ao gerar QR Code' });
          }
        }

        if (connection === 'open') {
          clearReconnect();
          setStatus({ status: 'connected', qrDataUrl: null, pairingCode: null, account: accountFromSocket(activeSocket), error: null });
        }

        if (connection === 'close') {
          if (socket !== activeSocket) return;
          socket = null;
          const loggedOut = disconnectStatusCode(lastDisconnect) === disconnectReasonLoggedOut;
          const pendingPairingCode = loggedOut ? null : status.pairingCode;
          setStatus({
            status: pendingPairingCode ? 'pairing' : 'disconnected',
            qrDataUrl: null,
            pairingCode: pendingPairingCode,
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
          if (!isAllowedDevMessage(message)) continue;
          if (!markSeen(message?.key?.id)) continue;
          if (messageHandler) await messageHandler({ message, socket: activeSocket });
        }
      });

      return getStatus();
    } catch (error) {
      socket = null;
      setStatus({
        status: 'error',
        qrDataUrl: null,
        pairingCode: null,
        account: null,
        error: error instanceof Error ? error.message : 'Falha ao conectar WhatsApp',
      });
      throw error;
    }
  }

  function connect() {
    if (socket && ['connecting', 'qr', 'pairing', 'authenticated', 'connected'].includes(status.status)) {
      return Promise.resolve(getStatus());
    }
    if (connectPromise) return connectPromise;
    connectPromise = performConnect().finally(() => {
      connectPromise = null;
    });
    return connectPromise;
  }

  async function requestPairingCode(phoneNumber) {
    const phone = normalizePairingPhone(phoneNumber);
    if (!socket) await connect();
    if (status.status === 'connected') throw new Error('WhatsApp já está conectado.');
    if (!socket?.requestPairingCode) throw new Error('Pareamento por telefone não está disponível nesta sessão do WhatsApp.');
    const pairingCode = await socket.requestPairingCode(phone);
    if (!pairingCode) throw new Error('WhatsApp não retornou um código de pareamento.');
    setStatus({ status: 'pairing', pairingCode: String(pairingCode), qrDataUrl: null, account: null, error: null });
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
    setStatus({ status: 'disconnected', qrDataUrl: null, pairingCode: null, account: null, error: null });
    return getStatus();
  }

  async function restartConnection() {
    manualDisconnect = true;
    clearReconnect();
    const activeSocket = socket;
    socket = null;
    if (activeSocket?.end) {
      await Promise.resolve(activeSocket.end(new Error('PrismaStore reiniciando conexão')));
    }
    setStatus({ status: 'disconnected', qrDataUrl: null, pairingCode: null, account: null, error: null });
    manualDisconnect = false;
    connectPromise = null;
    return connect();
  }

  async function sendText(phoneOrJid, text) {
    if (!socket || status.status !== 'connected') throw new Error('WhatsApp não conectado.');
    return socket.sendMessage(normalizeDevOutboundRecipient(phoneOrJid), { text: String(text) });
  }

  async function sendMedia(phoneOrJid, source) {
    if (!socket || status.status !== 'connected') throw new Error('WhatsApp não conectado.');
    const jid = normalizeDevOutboundRecipient(phoneOrJid);
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

  return { connect, restartConnection, requestPairingCode, disconnect, getStatus, sendText, sendMedia };
}
