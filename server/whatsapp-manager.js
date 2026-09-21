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

function errorStatusCode(error) {
  return error?.output?.statusCode ?? error?.statusCode ?? null;
}

function pairingErrorMessage(error) {
  const code = errorStatusCode(error);
  if (code === 400) return 'WhatsApp recusou a solicitação de vínculo (400). Aguarde alguns minutos e tente novamente ou use QR Code.';
  if (code === 408) return 'A sessão do WhatsApp expirou antes do vínculo (408). Reinicie a conexão e tente novamente.';
  if (code === 428) return 'A conexão com o WhatsApp ainda não estava pronta para gerar o código (428). Reinicie a conexão e tente novamente.';
  if (code === 429) return 'O WhatsApp limitou novas tentativas de vínculo (429). Aguarde antes de tentar novamente para evitar novo bloqueio temporário.';
  if (code === 515) return 'O WhatsApp solicitou reinício da sessão durante o vínculo (515). Reinicie a conexão e tente novamente.';
  return error instanceof Error && error.message
    ? error.message
    : 'Não foi possível gerar o código de pareamento do WhatsApp.';
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

function maskedPhone(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 6) return '[oculto]';
  return `${digits.slice(0, 4)}******${digits.slice(-4)}`;
}

function logWhatsApp(event, details = '') {
  const suffix = details ? ` · ${details}` : '';
  console.log(`[WhatsApp] ${event}${suffix}`);
}

export function createWhatsAppManager({
  socketFactory,
  authStateLoader,
  qrEncoder,
  messageHandler = null,
  disconnectReasonLoggedOut,
  disconnectReasonRestartRequired = 515,
  reconnectDelayMs = 3000,
  maxReconnectAttempts = 3,
  pairingReadyTimeoutMs = 15000,
  resetAuthState = null,
  schedule = setTimeout,
  clearSchedule = clearTimeout,
  maxSeenMessageIds = 1000,
  devAllowedPhone = '',
}) {
  let socket = null;
  let connectPromise = null;
  let pairingPromise = null;
  let authResetPromise = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let manualDisconnect = false;
  let sessionRegistered = false;
  let pairingReady = false;
  const pairingReadyWaiters = new Set();
  let status = { status: 'disconnected', qrDataUrl: null, pairingCode: null, account: null, error: null, errorCode: null };
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

  async function clearInvalidAuthState(reason = 'unknown') {
    if (!resetAuthState) return;
    if (authResetPromise) return authResetPromise;
    authResetPromise = Promise.resolve()
      .then(() => resetAuthState())
      .then(() => {
        logWhatsApp('auth:cleared', `reason=${reason}`);
      })
      .catch((error) => {
        console.error('[WhatsApp] auth:clear-error', error);
        throw error;
      })
      .finally(() => {
        authResetPromise = null;
      });
    return authResetPromise;
  }

  function resolvePairingReady() {
    pairingReady = true;
    for (const waiter of pairingReadyWaiters) waiter.resolve();
    pairingReadyWaiters.clear();
  }

  function rejectPairingReady(error) {
    pairingReady = false;
    for (const waiter of pairingReadyWaiters) waiter.reject(error);
    pairingReadyWaiters.clear();
  }

  function waitForPairingReady() {
    if (pairingReady) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve: () => {
          clearTimeout(waiter.timer);
          resolve();
        },
        reject: (error) => {
          clearTimeout(waiter.timer);
          reject(error);
        },
        timer: null,
      };
      waiter.timer = setTimeout(() => {
        pairingReadyWaiters.delete(waiter);
        reject(new Error('Tempo esgotado aguardando o WhatsApp ficar pronto para gerar o código.'));
      }, pairingReadyTimeoutMs);
      pairingReadyWaiters.add(waiter);
    });
  }

  function scheduleReconnectOnce(reasonCode = null) {
    if (manualDisconnect || reconnectTimer) return;
    if (reasonCode === 429) {
      setStatus({ status: 'error', error: pairingErrorMessage({ statusCode: 429 }), errorCode: 429 });
      return;
    }
    if (reconnectAttempts >= maxReconnectAttempts) {
      setStatus({
        status: 'error',
        error: 'A conexão do WhatsApp falhou repetidamente. Reconexão automática interrompida para evitar bloqueio temporário.',
        errorCode: reasonCode,
      });
      return;
    }
    const delay = reconnectDelayMs * (2 ** reconnectAttempts);
    reconnectAttempts += 1;
    reconnectTimer = schedule(() => {
      reconnectTimer = null;
      connect().catch((error) => {
        setStatus({ status: 'error', error: error instanceof Error ? error.message : 'Falha ao reconectar WhatsApp', errorCode: errorStatusCode(error) });
      });
    }, delay);
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
    pairingReady = false;
    const pendingPairingCode = status.pairingCode || null;
    setStatus({
      status: pendingPairingCode ? 'pairing' : 'connecting',
      qrDataUrl: null,
      pairingCode: pendingPairingCode,
      account: null,
      error: null,
      errorCode: null,
    });

    try {
      const { state, saveCreds } = await authStateLoader();
      sessionRegistered = state?.creds?.registered !== false;
      logWhatsApp('connect:start', `registered=${sessionRegistered}`);
      const activeSocket = await socketFactory({ auth: state });
      socket = activeSocket;

      activeSocket.ev.on('creds.update', async (update = {}) => {
        if (Object.prototype.hasOwnProperty.call(update, 'registered')) {
          sessionRegistered = Boolean(update.registered);
        }
        await saveCreds();
      });

      activeSocket.ev.on('connection.update', async (update = {}) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          logWhatsApp('socket:qr-ready');
          resolvePairingReady();
          try {
            const qrDataUrl = await qrEncoder(qr);
            setStatus({ status: status.pairingCode ? 'pairing' : 'qr', qrDataUrl, account: null, error: null, errorCode: null });
          } catch (error) {
            setStatus({ status: 'error', qrDataUrl: null, pairingCode: null, account: null, error: error instanceof Error ? error.message : 'Falha ao gerar QR Code' });
          }
        }

        if (connection === 'open') {
          logWhatsApp('socket:open');
          clearReconnect();
          reconnectAttempts = 0;
          sessionRegistered = true;
          resolvePairingReady();
          setStatus({ status: 'connected', qrDataUrl: null, pairingCode: null, account: accountFromSocket(activeSocket), error: null, errorCode: null });
        }

        if (connection === 'close') {
          if (socket !== activeSocket) return;
          const code = disconnectStatusCode(lastDisconnect);
          const closeError = lastDisconnect?.error instanceof Error
            ? lastDisconnect.error
            : new Error(code ? `WhatsApp desconectado (${code}).` : 'WhatsApp desconectado.');
          if (code && errorStatusCode(closeError) == null) closeError.statusCode = code;
          rejectPairingReady(closeError);
          socket = null;
          const loggedOut = code === disconnectReasonLoggedOut;
          const restartRequired = code === disconnectReasonRestartRequired;
          const pendingPairingCode = loggedOut ? null : status.pairingCode;
          logWhatsApp('socket:close', `code=${code ?? 'unknown'} registered=${sessionRegistered} pairing=${Boolean(pendingPairingCode)}`);

          if (restartRequired) {
            // Baileys/WhatsApp uses 515 as a normal post-link handshake:
            // after a QR scan or pairing-code confirmation the socket must be
            // recreated with the credentials that were just persisted.
            setStatus({ status: 'connecting', qrDataUrl: null, pairingCode: null, account: null, error: null, errorCode: code });
            scheduleReconnectOnce(code);
            return;
          }

          if (loggedOut) {
            sessionRegistered = false;
            clearReconnect();
            try {
              await clearInvalidAuthState('logged-out-401');
              setStatus({
                status: 'disconnected',
                qrDataUrl: null,
                pairingCode: null,
                account: null,
                error: null,
                errorCode: null,
              });
            } catch {
              setStatus({
                status: 'error',
                qrDataUrl: null,
                pairingCode: null,
                account: null,
                error: 'A sessão antiga do WhatsApp foi encerrada, mas não foi possível limpar as credenciais locais.',
                errorCode: code,
              });
            }
            return;
          }

          if (pendingPairingCode || !sessionRegistered) {
            setStatus({ status: 'error', qrDataUrl: null, pairingCode: null, account: null, error: pairingErrorMessage(closeError), errorCode: code });
            return;
          }

          setStatus({ status: 'disconnected', qrDataUrl: null, pairingCode: null, account: null, error: null, errorCode: code });
          scheduleReconnectOnce(code);
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
      logWhatsApp('connect:error', `code=${errorStatusCode(error) ?? 'unknown'} message=${error instanceof Error ? error.message : 'erro desconhecido'}`);
      socket = null;
      setStatus({
        status: 'error',
        qrDataUrl: null,
        pairingCode: null,
        account: null,
        error: error instanceof Error ? error.message : 'Falha ao conectar WhatsApp',
        errorCode: errorStatusCode(error),
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
    if (pairingPromise) return pairingPromise;

    async function attemptPairing({ recoverLoggedOut = true } = {}) {
      try {
        logWhatsApp('pairing:start', `phone=${maskedPhone(phone)} recover401=${recoverLoggedOut}`);
        if (!socket) await connect();
        if (status.status === 'connected') throw new Error('WhatsApp já está conectado.');
        if (!socket?.requestPairingCode) throw new Error('Pareamento por telefone não está disponível nesta sessão do WhatsApp.');

        await waitForPairingReady();
        if (status.status === 'connected') throw new Error('WhatsApp já está conectado.');

        const pairingCode = await socket.requestPairingCode(phone);
        if (!pairingCode) throw new Error('WhatsApp não retornou um código de pareamento.');
        logWhatsApp('pairing:code-generated');
        setStatus({ status: 'pairing', pairingCode: String(pairingCode), qrDataUrl: null, account: null, error: null, errorCode: null });
        return getStatus();
      } catch (error) {
        const code = errorStatusCode(error);
        if (code === disconnectReasonLoggedOut && recoverLoggedOut) {
          logWhatsApp('pairing:recover-401');
          clearReconnect();
          socket = null;
          pairingReady = false;
          sessionRegistered = false;
          await clearInvalidAuthState('pairing-401');
          setStatus({ status: 'disconnected', qrDataUrl: null, pairingCode: null, account: null, error: null, errorCode: null });
          return attemptPairing({ recoverLoggedOut: false });
        }

        const message = pairingErrorMessage(error);
        logWhatsApp('pairing:error', `code=${code ?? 'unknown'} message=${message}`);
        setStatus({
          status: 'error',
          pairingCode: null,
          account: null,
          error: message,
          errorCode: code,
        });
        throw new Error(message);
      }
    }

    pairingPromise = attemptPairing().finally(() => {
      pairingPromise = null;
    });

    return pairingPromise;
  }

  async function disconnect() {
    manualDisconnect = true;
    clearReconnect();
    const activeSocket = socket;
    socket = null;
    if (activeSocket?.end) {
      await Promise.resolve(activeSocket.end(new Error('PrismaStore desconectado')));
    }
    reconnectAttempts = 0;
    pairingReady = false;
    rejectPairingReady(new Error('Conexão do WhatsApp encerrada.'));
    setStatus({ status: 'disconnected', qrDataUrl: null, pairingCode: null, account: null, error: null, errorCode: null });
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
    reconnectAttempts = 0;
    pairingReady = false;
    rejectPairingReady(new Error('Conexão do WhatsApp reiniciada.'));
    setStatus({ status: 'disconnected', qrDataUrl: null, pairingCode: null, account: null, error: null, errorCode: null });
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
