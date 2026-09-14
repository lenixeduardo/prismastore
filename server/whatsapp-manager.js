function accountFromInfo(info) {
  if (!info) return null;
  return {
    name: info.pushname || null,
    number: info.wid?.user || null,
  };
}

export function createWhatsAppManager({ clientFactory, qrEncoder, messageHandler = null }) {
  let client = null;
  let status = {
    status: 'disconnected',
    qrDataUrl: null,
    account: null,
    error: null,
  };

  function setStatus(patch) {
    status = { ...status, ...patch };
  }

  function getStatus() {
    return structuredClone(status);
  }

  async function connect() {
    if (client && ['connecting', 'qr', 'authenticated', 'connected'].includes(status.status)) {
      return getStatus();
    }

    client = clientFactory();
    setStatus({ status: 'connecting', qrDataUrl: null, account: null, error: null });

    client.on('qr', async (qr) => {
      try {
        const qrDataUrl = await qrEncoder(qr);
        setStatus({ status: 'qr', qrDataUrl, account: null, error: null });
      } catch (error) {
        setStatus({ status: 'error', qrDataUrl: null, error: error instanceof Error ? error.message : 'Falha ao gerar QR Code' });
      }
    });

    client.on('authenticated', () => {
      setStatus({ status: 'authenticated', qrDataUrl: null, error: null });
    });

    client.on('ready', () => {
      setStatus({ status: 'connected', qrDataUrl: null, account: accountFromInfo(client?.info), error: null });
    });

    client.on('auth_failure', (message) => {
      setStatus({ status: 'error', qrDataUrl: null, account: null, error: String(message || 'Falha de autenticação') });
    });

    client.on('disconnected', (reason) => {
      client = null;
      setStatus({ status: 'disconnected', qrDataUrl: null, account: null, error: reason ? String(reason) : null });
    });

    if (messageHandler) {
      client.on('message', (message) => {
        Promise.resolve(messageHandler({ message, activeClient: client })).catch((error) => {
          console.error('Falha ao processar mensagem do WhatsApp:', error);
        });
      });
    }

    try {
      const initialization = client.initialize();
      Promise.resolve(initialization).catch((error) => {
        client = null;
        setStatus({ status: 'error', qrDataUrl: null, account: null, error: error instanceof Error ? error.message : 'Falha ao iniciar WhatsApp' });
      });
    } catch (error) {
      client = null;
      setStatus({ status: 'error', qrDataUrl: null, account: null, error: error instanceof Error ? error.message : 'Falha ao iniciar WhatsApp' });
    }

    return getStatus();
  }

  async function disconnect() {
    const activeClient = client;
    client = null;
    if (activeClient) {
      await activeClient.destroy();
    }
    setStatus({ status: 'disconnected', qrDataUrl: null, account: null, error: null });
    return getStatus();
  }

  async function sendText(phone, text) {
    if (!client || status.status !== 'connected') throw new Error('WhatsApp não conectado.');
    const raw = String(phone ?? '');
    const to = raw.includes('@') ? raw : `${raw.replace(/\D/g, '')}@c.us`;
    return client.sendMessage(to, text);
  }

  return { connect, disconnect, getStatus, sendText };
}
